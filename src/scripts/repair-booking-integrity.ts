import mongoose from 'mongoose';
import { env } from '../config/env';
import { Attraction } from '../models/Attraction';
import { Booking } from '../models/Booking';
import {
  inventoryEntriesForItems,
  releaseBookingInventory,
  reserveInventory,
  runBookingTransaction,
  sessionOption,
} from '../services/bookingInventory.service';

const APPLY_FLAG = '--apply';
const LEGACY_IMPORT_NOTE = 'Imported before Stripe PaymentIntent tracking was enforced.';

const legacyCardPaymentQuery = {
  paymentMethod: 'card',
  paymentStatus: 'succeeded',
  $or: [{ stripePaymentIntentId: { $exists: false } }, { stripePaymentIntentId: '' }],
  'paymentReconciliation.source': { $ne: 'legacy-import' },
};

const ineligibleSettlementQuery = {
  isResale: true,
  settlementStatus: 'settled',
  $or: [
    { status: { $in: ['pending', 'cancelled', 'refunded'] } },
    { paymentMethod: 'card', paymentStatus: { $ne: 'succeeded' } },
  ],
};

const legacyInventoryQuery = (today: string) => ({
  status: { $in: ['pending', 'confirmed'] },
  paymentStatus: { $nin: ['failed', 'refunded'] },
  'items.date': { $gte: today },
  $or: [
    { inventoryReservedAt: { $exists: false } },
    { inventoryReleasedAt: { $exists: true } },
    { inventoryReservations: { $size: 0 } },
  ],
});

const activeInventoryQuery = (today: string) => ({
  status: { $in: ['pending', 'confirmed'] },
  paymentStatus: { $nin: ['failed', 'refunded'] },
  'items.date': { $gte: today },
  inventoryReservedAt: { $exists: true },
  inventoryReleasedAt: { $exists: false },
  'inventoryReservations.0': { $exists: true },
});

const normalizedInventoryEntries = (
  entries: Array<{ date: Date; time?: string; guests: number }>
): string[] => entries
  .map((entry) => `${entry.date.toISOString().slice(0, 10)}:${entry.time || 'all-day'}:${entry.guests}`)
  .sort();

async function repairInventory(bookingId: mongoose.Types.ObjectId): Promise<boolean> {
  return runBookingTransaction(async (session) => {
    const booking = await Booking.findOne(
      { _id: bookingId, ...legacyInventoryQuery(new Date().toISOString().slice(0, 10)) },
      null,
      sessionOption(session)
    );
    if (!booking) return false;

    const attraction = await Attraction.findById(booking.attractionId)
      .select('availability.type')
      .session(session || null);
    if (!attraction) throw new Error(`ATTRACTION_NOT_FOUND:${booking.reference}`);

    const entries = inventoryEntriesForItems(
      booking.attractionId,
      booking.items,
      attraction.availability?.type === 'time-slots'
    );
    await reserveInventory(entries, session);

    booking.inventoryReservedAt = new Date();
    booking.inventoryReleasedAt = undefined;
    booking.inventoryReservations = entries.map((entry) => ({
      date: entry.date,
      time: entry.time,
      guests: entry.guests,
    }));
    await booking.save(sessionOption(session));
    return true;
  });
}

async function realignInventory(bookingId: mongoose.Types.ObjectId): Promise<boolean> {
  return runBookingTransaction(async (session) => {
    const booking = await Booking.findOne(
      { _id: bookingId, ...activeInventoryQuery(new Date().toISOString().slice(0, 10)) },
      null,
      sessionOption(session)
    );
    if (!booking) return false;

    const attraction = await Attraction.findById(booking.attractionId)
      .select('availability.type')
      .session(session || null);
    if (!attraction) throw new Error(`ATTRACTION_NOT_FOUND:${booking.reference}`);

    const expectedEntries = inventoryEntriesForItems(
      booking.attractionId,
      booking.items,
      attraction.availability?.type === 'time-slots'
    );
    const actualEntries = (booking.inventoryReservations || []).map((reservation) => ({
      date: new Date(reservation.date),
      time: reservation.time,
      guests: reservation.guests,
    }));
    if (
      JSON.stringify(normalizedInventoryEntries(expectedEntries)) ===
      JSON.stringify(normalizedInventoryEntries(actualEntries))
    ) {
      return false;
    }

    await reserveInventory(expectedEntries, session);
    await releaseBookingInventory(booking, session);
    booking.inventoryReservedAt = new Date();
    booking.inventoryReleasedAt = undefined;
    booking.inventoryReservations = expectedEntries.map((entry) => ({
      date: entry.date,
      time: entry.time,
      guests: entry.guests,
    }));
    await booking.save(sessionOption(session));
    return true;
  });
}

async function run(): Promise<void> {
  const apply = process.argv.includes(APPLY_FLAG);
  const today = new Date().toISOString().slice(0, 10);
  await mongoose.connect(env.mongodbUri);

  const [legacyCardPayments, ineligibleSettlements, legacyInventory] = await Promise.all([
    Booking.find(legacyCardPaymentQuery).select('_id reference').lean(),
    Booking.find(ineligibleSettlementQuery).select('_id reference').lean(),
    Booking.find(legacyInventoryQuery(today)).select('_id reference').lean(),
  ]);
  const activeInventory = await Booking.find(activeInventoryQuery(today)).select('_id reference').lean();

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    legacyCardPaymentsToClassify: legacyCardPayments.length,
    ineligibleSettlementsToReset: ineligibleSettlements.length,
    legacyInventoryReservationsToBackfill: legacyInventory.length,
    inventoryReservationsToCheckForRealignment: activeInventory.length,
  };

  if (!apply) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  const [cardResult, settlementResult] = await Promise.all([
    Booking.updateMany(
      legacyCardPaymentQuery,
      {
        $set: {
          paymentReconciliation: {
            source: 'legacy-import',
            reconciledAt: new Date(),
            note: LEGACY_IMPORT_NOTE,
          },
        },
      }
    ),
    Booking.updateMany(
      ineligibleSettlementQuery,
      { $set: { settlementStatus: 'pending' }, $unset: { settledAt: '' } }
    ),
  ]);

  let inventoryBackfilled = 0;
  for (const booking of legacyInventory) {
    if (await repairInventory(booking._id)) inventoryBackfilled += 1;
  }
  const refreshedInventory = await Booking.find(activeInventoryQuery(today)).select('_id').lean();
  let inventoryRealigned = 0;
  for (const booking of refreshedInventory) {
    if (await realignInventory(booking._id)) inventoryRealigned += 1;
  }

  process.stdout.write(`${JSON.stringify({
    ...summary,
    legacyCardPaymentsClassified: cardResult.modifiedCount,
    ineligibleSettlementsReset: settlementResult.modifiedCount,
    inventoryReservationsBackfilled: inventoryBackfilled,
    inventoryReservationsRealigned: inventoryRealigned,
  }, null, 2)}\n`);
}

run()
  .catch((error) => {
    console.error('Booking integrity repair failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
