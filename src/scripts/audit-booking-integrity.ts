import mongoose from 'mongoose';
import { env } from '../config/env';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';

type SlotTotals = Map<string, number>;

const dayKey = (value: Date | string): string => new Date(value).toISOString().slice(0, 10);
const slotKey = (attractionId: unknown, date: Date | string, time?: string): string =>
  `${String(attractionId)}:${dayKey(date)}:${time || 'all-day'}`;

const addSlotGuests = (totals: SlotTotals, key: string, guests: number): void => {
  totals.set(key, (totals.get(key) || 0) + guests);
};

async function run(): Promise<void> {
  await mongoose.connect(env.mongodbUri);

  const staleBefore = new Date(Date.now() - 30 * 60 * 1000);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayString = today.toISOString().slice(0, 10);

  const [
    totalBookings,
    staleProcessing,
    cardSucceededWithoutIntent,
    impossibleTotals,
    ineligibleSettlements,
    futureBookings,
    futureAvailability,
  ] = await Promise.all([
    Booking.countDocuments(),
    Booking.countDocuments({ paymentStatus: 'processing', updatedAt: { $lt: staleBefore } }),
    Booking.countDocuments({
      paymentMethod: 'card',
      paymentStatus: 'succeeded',
      $or: [{ stripePaymentIntentId: { $exists: false } }, { stripePaymentIntentId: '' }],
    }),
    Booking.countDocuments({ total: { $lte: 0 } }),
    Booking.countDocuments({
      isResale: true,
      settlementStatus: 'settled',
      $or: [
        { status: { $in: ['pending', 'cancelled', 'refunded'] } },
        { paymentMethod: 'card', paymentStatus: { $ne: 'succeeded' } },
      ],
    }),
    Booking.find({
      status: { $in: ['pending', 'confirmed'] },
      paymentStatus: { $nin: ['failed', 'refunded'] },
      'items.date': { $gte: todayString },
    }).select('attractionId items inventoryReservedAt inventoryReleasedAt inventoryReservations').lean(),
    Availability.find({ date: { $gte: today } })
      .select('attractionId date timeSlots allDayCapacity allDayBooked isBlocked')
      .lean(),
  ]);

  const expectedSlots: SlotTotals = new Map();
  let legacyBookingsWithoutInventoryLedger = 0;
  for (const booking of futureBookings) {
    const reservations = booking.inventoryReservations || [];
    if (!booking.inventoryReservedAt || booking.inventoryReleasedAt || reservations.length === 0) {
      legacyBookingsWithoutInventoryLedger += 1;
      continue;
    }

    for (const reservation of reservations) {
      if (!reservation.date || dayKey(reservation.date) < todayString) continue;
      addSlotGuests(
        expectedSlots,
        slotKey(booking.attractionId, reservation.date, reservation.time),
        reservation.guests || 0
      );
    }
  }

  let availabilityMismatches = 0;
  let overCapacitySlots = 0;
  let blockedSlotsWithBookings = 0;
  const observedKeys = new Set<string>();

  for (const availability of futureAvailability) {
    if (availability.timeSlots?.length) {
      for (const slot of availability.timeSlots) {
        const key = slotKey(availability.attractionId, availability.date, slot.time);
        observedKeys.add(key);
        const expected = expectedSlots.get(key) || 0;
        if (slot.booked !== expected) availabilityMismatches += 1;
        if (slot.booked > slot.capacity || expected > slot.capacity) overCapacitySlots += 1;
        if (availability.isBlocked && expected > 0) blockedSlotsWithBookings += 1;
      }
    } else {
      const key = slotKey(availability.attractionId, availability.date);
      observedKeys.add(key);
      const expected = expectedSlots.get(key) || 0;
      if ((availability.allDayBooked || 0) !== expected) availabilityMismatches += 1;
      if (
        typeof availability.allDayCapacity === 'number' &&
        ((availability.allDayBooked || 0) > availability.allDayCapacity || expected > availability.allDayCapacity)
      ) {
        overCapacitySlots += 1;
      }
      if (availability.isBlocked && expected > 0) blockedSlotsWithBookings += 1;
    }
  }

  const bookingsWithoutAvailability = Array.from(expectedSlots.keys()).filter(
    (key) => !observedKeys.has(key)
  ).length;

  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    totals: {
      bookings: totalBookings,
      staleProcessing,
      cardSucceededWithoutIntent,
      impossibleTotals,
      ineligibleSettlements,
      availabilityMismatches,
      overCapacitySlots,
      blockedSlotsWithBookings,
      bookingsWithoutAvailability,
      legacyBookingsWithoutInventoryLedger,
    },
  }, null, 2)}\n`);
}

run()
  .catch((error) => {
    console.error('Booking integrity audit failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
