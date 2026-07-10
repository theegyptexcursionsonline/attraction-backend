import mongoose, { ClientSession } from 'mongoose';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { IBooking } from '../types';
import { getTenantStripeConfig } from './tenantPayment.service';
import { retrievePaymentIntent } from './stripe.service';

const DEFAULT_CAPACITY = 25;
const DEFAULT_TIME_SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

export type InventoryEntry = {
  attractionId: unknown;
  date: Date;
  time?: string;
  guests: number;
};

export type BookingWithInventoryMarker = IBooking & {
  inventoryReservedAt?: Date;
  inventoryReleasedAt?: Date;
  inventoryReservations?: Array<{
    date: Date;
    time?: string;
    guests: number;
  }>;
};

export const sessionOption = (session?: ClientSession): { session?: ClientSession } =>
  session ? { session } : {};

export const runBookingTransaction = async <T>(
  work: (session?: ClientSession) => Promise<T>
): Promise<T> => {
  if (mongoose.connection.readyState !== 1) return work(undefined);

  const session = await mongoose.startSession();
  let result: T | undefined;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
  } finally {
    await session.endSession();
  }
  if (result === undefined) throw new Error('BOOKING_TRANSACTION_ABORTED');
  return result;
};

export const bookingDate = (value: string): Date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_DATE');
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error('INVALID_DATE');
  return date;
};

export const inventoryEntriesForItems = (
  attractionId: unknown,
  items: Array<{
    date: string;
    time?: string;
    quantities: { adults: number; children: number; infants: number };
  }>,
  useTimeSlots = true
): InventoryEntry[] => {
  const grouped = new Map<string, InventoryEntry>();
  for (const item of items) {
    const guests = item.quantities.adults + item.quantities.children + item.quantities.infants;
    const date = bookingDate(item.date);
    const time = useTimeSlots ? item.time : undefined;
    if (useTimeSlots && !time) throw new Error('SLOT_UNAVAILABLE');
    const key = `${date.toISOString()}|${time || 'all-day'}`;
    const existing = grouped.get(key);
    if (existing) existing.guests += guests;
    else grouped.set(key, { attractionId, date, time, guests });
  }
  return Array.from(grouped.values());
};

export const reserveInventory = async (
  entries: InventoryEntry[],
  session?: ClientSession
): Promise<void> => {
  for (const entry of entries) {
    // The public availability endpoint advertises a default capacity when a
    // date has not been materialized yet. Create that same row before the
    // conditional increment so the read and booking contracts cannot diverge.
    await Availability.updateOne(
      { attractionId: entry.attractionId, date: entry.date },
      {
        $setOnInsert: entry.time
          ? {
              timeSlots: DEFAULT_TIME_SLOTS.map((time) => ({
                time,
                capacity: DEFAULT_CAPACITY,
                booked: 0,
              })),
              isBlocked: false,
            }
          : {
              timeSlots: [],
              allDayCapacity: DEFAULT_CAPACITY,
              allDayBooked: 0,
              isBlocked: false,
            },
      },
      { ...sessionOption(session), upsert: true }
    );

    // Older all-day rows may rely on the public endpoint's default without a
    // stored capacity. Normalize them without touching blocked or slotted rows.
    if (!entry.time) {
      await Availability.updateOne(
        {
          attractionId: entry.attractionId,
          date: entry.date,
          isBlocked: { $ne: true },
          allDayCapacity: { $exists: false },
          timeSlots: { $size: 0 },
        },
        { $set: { allDayCapacity: DEFAULT_CAPACITY } },
        sessionOption(session)
      );
    }

    const baseQuery: Record<string, unknown> = {
      attractionId: entry.attractionId,
      date: entry.date,
      isBlocked: { $ne: true },
    };
    const query = entry.time
      ? {
          ...baseQuery,
          $expr: {
            $anyElementTrue: {
              $map: {
                input: '$timeSlots',
                as: 'slot',
                in: {
                  $and: [
                    { $eq: ['$$slot.time', entry.time] },
                    {
                      $lte: [
                        { $add: [{ $ifNull: ['$$slot.booked', 0] }, entry.guests] },
                        '$$slot.capacity',
                      ],
                    },
                  ],
                },
              },
            },
          },
        }
      : {
          ...baseQuery,
          allDayCapacity: { $type: 'number' },
          $expr: {
            $lte: [
              { $add: [{ $ifNull: ['$allDayBooked', 0] }, entry.guests] },
              '$allDayCapacity',
            ],
          },
        };

    const reserved = await Availability.findOneAndUpdate(
      query,
      entry.time
        ? { $inc: { 'timeSlots.$[slot].booked': entry.guests } }
        : { $inc: { allDayBooked: entry.guests } },
      entry.time
        ? {
            ...sessionOption(session),
            new: true,
            arrayFilters: [{ 'slot.time': entry.time }],
          }
        : { ...sessionOption(session), new: true }
    );
    if (!reserved) throw new Error('SLOT_UNAVAILABLE');
  }
};

export const releaseBookingInventory = async (
  booking: BookingWithInventoryMarker,
  session?: ClientSession
): Promise<void> => {
  if (booking.inventoryReleasedAt) return;

  // Bookings created before transactional inventory did not reserve capacity.
  // Mark them released without decrementing a counter they never incremented.
  if (!booking.inventoryReservedAt) {
    booking.inventoryReleasedAt = new Date();
    return;
  }

  const entries = booking.inventoryReservations?.length
    ? booking.inventoryReservations.map((reservation) => ({
        attractionId: booking.attractionId,
        date: new Date(reservation.date),
        time: reservation.time,
        guests: reservation.guests,
      }))
    : inventoryEntriesForItems(booking.attractionId, booking.items);
  for (const entry of entries) {
    const query: Record<string, unknown> = { attractionId: entry.attractionId, date: entry.date };
    if (entry.time) {
      query.timeSlots = { $elemMatch: { time: entry.time, booked: { $gte: entry.guests } } };
    } else {
      query.allDayBooked = { $gte: entry.guests };
    }

    const released = await Availability.findOneAndUpdate(
      query,
      entry.time
        ? { $inc: { 'timeSlots.$[slot].booked': -entry.guests } }
        : { $inc: { allDayBooked: -entry.guests } },
      entry.time
        ? {
            ...sessionOption(session),
            new: true,
            arrayFilters: [{ 'slot.time': entry.time }],
          }
        : { ...sessionOption(session), new: true }
    );
    if (!released) throw new Error('INVENTORY_RELEASE_FAILED');
  }

  booking.inventoryReleasedAt = new Date();
};

export const failCardBookingAndReleaseInventory = async (
  bookingId: unknown,
  tenantId: unknown,
  paymentIntentId?: string
): Promise<BookingWithInventoryMarker | null> =>
  runBookingTransaction(async (session) => {
    const query: Record<string, unknown> = {
      _id: bookingId,
      tenantId,
      paymentStatus: { $in: ['pending', 'processing', 'failed'] },
      status: 'pending',
      inventoryReleasedAt: { $exists: false },
    };
    if (paymentIntentId) query.stripePaymentIntentId = paymentIntentId;
    const booking = await Booking.findOne(
      query,
      null,
      sessionOption(session)
    ) as BookingWithInventoryMarker | null;
    if (!booking) return null;

    await releaseBookingInventory(booking, session);
    booking.paymentStatus = 'failed';
    booking.status = 'cancelled';
    await booking.save(sessionOption(session));
    return booking;
  });

export const expireStaleCardHolds = async (olderThanMinutes = 30): Promise<number> => {
  const staleBefore = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const candidates = await Booking.find({
    paymentMethod: 'card',
    paymentStatus: { $in: ['pending', 'processing', 'failed'] },
    status: 'pending',
    inventoryReleasedAt: { $exists: false },
    createdAt: { $lt: staleBefore },
  }).select('_id tenantId stripePaymentIntentId');

  let released = 0;
  for (const candidate of candidates) {
    if (candidate.stripePaymentIntentId) {
      const stripeConfig = await getTenantStripeConfig(candidate.tenantId);
      if (!stripeConfig?.enabled || !stripeConfig.secretKey) continue;

      const intent = await retrievePaymentIntent(
        stripeConfig.secretKey,
        candidate.stripePaymentIntentId
      );
      // Never release a hold when provider state is unknown, processing, or
      // already paid. The integrity audit will surface paid-but-unfinalized rows.
      if (!intent || ['succeeded', 'processing', 'requires_capture'].includes(intent.status)) {
        continue;
      }
    }

    const result = await failCardBookingAndReleaseInventory(
      candidate._id,
      candidate.tenantId,
      candidate.stripePaymentIntentId
    );
    if (result) released += 1;
  }
  return released;
};
