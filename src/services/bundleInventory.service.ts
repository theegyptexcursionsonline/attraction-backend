import mongoose, { ClientSession, Types } from 'mongoose';
import { Availability, IAvailability } from '../models/Availability';
import { BundleOfferInventory } from '../models/BundleOfferInventory';

export interface BundleInventorySelection {
  attractionId: Types.ObjectId | string;
  supplyOfferId: Types.ObjectId | string;
  date: string;
  time?: string;
  guests: number;
  offerCapacity: number;
}

export class BundleInventoryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const inventoryDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const timeKey = (time?: string): string => time || 'all-day';

const assertGuests = (guests: number): void => {
  if (!Number.isSafeInteger(guests) || guests < 1) {
    throw new BundleInventoryError('INVALID_GUEST_COUNT', 'A positive guest count is required');
  }
};

const assertActualCapacity = (
  availability: IAvailability | null,
  selection: BundleInventorySelection
): void => {
  if (!availability || availability.isBlocked) {
    throw new BundleInventoryError('AVAILABILITY_NOT_CONFIGURED', 'This departure is not available');
  }
  if (selection.time) {
    const slot = availability.timeSlots.find((candidate) => candidate.time === selection.time);
    if (!slot || slot.booked + selection.guests > slot.capacity) {
      throw new BundleInventoryError('ATTRACTION_CAPACITY_EXCEEDED', 'This time no longer has enough capacity');
    }
    return;
  }
  if (
    availability.allDayCapacity === undefined ||
    (availability.allDayBooked || 0) + selection.guests > availability.allDayCapacity
  ) {
    throw new BundleInventoryError('ATTRACTION_CAPACITY_EXCEEDED', 'This date no longer has enough capacity');
  }
};

export const assertBundleInventoryAvailable = async (
  selection: BundleInventorySelection
): Promise<void> => {
  assertGuests(selection.guests);
  const date = inventoryDate(selection.date);
  const [availability, offerInventory] = await Promise.all([
    Availability.findOne({ attractionId: selection.attractionId, date }),
    BundleOfferInventory.findOne({
      supplyOfferId: selection.supplyOfferId,
      date,
      timeKey: timeKey(selection.time),
    }),
  ]);
  assertActualCapacity(availability, selection);
  if (offerInventory && offerInventory.reserved + selection.guests > offerInventory.capacity) {
    throw new BundleInventoryError('OFFER_CAPACITY_EXCEEDED', 'The supplier allocation is sold out');
  }
};

export const reserveBundleInventory = async (
  selection: BundleInventorySelection,
  session: ClientSession
): Promise<void> => {
  assertGuests(selection.guests);
  const date = inventoryDate(selection.date);
  const availability = await Availability.findOne({
    attractionId: selection.attractionId,
    date,
  }).session(session);
  assertActualCapacity(availability, selection);

  if (selection.time) {
    const slot = availability!.timeSlots.find((candidate) => candidate.time === selection.time)!;
    slot.booked += selection.guests;
  } else {
    availability!.allDayBooked = (availability!.allDayBooked || 0) + selection.guests;
  }
  await availability!.save({ session });

  let offerInventory = await BundleOfferInventory.findOne({
    supplyOfferId: selection.supplyOfferId,
    date,
    timeKey: timeKey(selection.time),
  }).session(session);
  if (!offerInventory) {
    [offerInventory] = await BundleOfferInventory.create(
      [{
        supplyOfferId: selection.supplyOfferId,
        date,
        timeKey: timeKey(selection.time),
        capacity: selection.offerCapacity,
        reserved: 0,
      }],
      { session }
    );
  }
  if (
    offerInventory.capacity !== selection.offerCapacity ||
    offerInventory.reserved + selection.guests > offerInventory.capacity
  ) {
    throw new BundleInventoryError('OFFER_CAPACITY_EXCEEDED', 'The supplier allocation is sold out');
  }
  offerInventory.reserved += selection.guests;
  await offerInventory.save({ session });
};

export const releaseBundleInventory = async (
  selection: BundleInventorySelection,
  session: ClientSession
): Promise<void> => {
  assertGuests(selection.guests);
  const date = inventoryDate(selection.date);
  const availability = await Availability.findOne({
    attractionId: selection.attractionId,
    date,
  }).session(session);
  if (!availability) {
    throw new BundleInventoryError('AVAILABILITY_MISSING_DURING_RELEASE', 'Reserved availability is missing');
  }
  if (selection.time) {
    const slot = availability.timeSlots.find((candidate) => candidate.time === selection.time);
    if (!slot || slot.booked < selection.guests) {
      throw new BundleInventoryError('INVENTORY_RELEASE_UNDERFLOW', 'Cannot safely release this time slot');
    }
    slot.booked -= selection.guests;
  } else {
    if ((availability.allDayBooked || 0) < selection.guests) {
      throw new BundleInventoryError('INVENTORY_RELEASE_UNDERFLOW', 'Cannot safely release this date');
    }
    availability.allDayBooked = (availability.allDayBooked || 0) - selection.guests;
  }
  await availability.save({ session });

  const offerInventory = await BundleOfferInventory.findOne({
    supplyOfferId: selection.supplyOfferId,
    date,
    timeKey: timeKey(selection.time),
  }).session(session);
  if (!offerInventory || offerInventory.reserved < selection.guests) {
    throw new BundleInventoryError('OFFER_RELEASE_UNDERFLOW', 'Cannot safely release supplier capacity');
  }
  offerInventory.reserved -= selection.guests;
  await offerInventory.save({ session });
};

export const runBundleTransaction = async <T>(
  work: (session: ClientSession) => Promise<T>
): Promise<T> => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const session = await mongoose.startSession();
    let result: T | undefined;
    try {
      await session.withTransaction(async () => {
        result = await work(session);
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      });
      if (result === undefined) throw new Error('BUNDLE_TRANSACTION_RETURNED_NO_RESULT');
      return result;
    } catch (error) {
      const duplicate = error as {
        code?: number;
        keyPattern?: Record<string, unknown>;
        message?: string;
      };
      const offerInventoryBootstrapRace =
        duplicate.code === 11000 &&
        (Boolean(duplicate.keyPattern?.supplyOfferId) ||
          /bundleofferinventor/i.test(duplicate.message || ''));
      const bundleEventSequenceRace =
        duplicate.code === 11000 &&
        ((Boolean(duplicate.keyPattern?.aggregateId) && Boolean(duplicate.keyPattern?.sequence)) ||
          /bundleevents/i.test(duplicate.message || ''));
      if ((!offerInventoryBootstrapRace && !bundleEventSequenceRace) || attempt === 3) throw error;
    } finally {
      await session.endSession();
    }
  }
  throw new Error('BUNDLE_TRANSACTION_RETRY_EXHAUSTED');
};
