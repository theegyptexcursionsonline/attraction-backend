import mongoose from 'mongoose';
import { env } from '../config/env';
import { Attraction } from '../models/Attraction';
import { Booking } from '../models/Booking';
import {
  inventoryEntriesForItems,
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

async function run(): Promise<void> {
  const apply = process.argv.includes(APPLY_FLAG);
  const today = new Date().toISOString().slice(0, 10);
  await mongoose.connect(env.mongodbUri);

  const [legacyCardPayments, ineligibleSettlements, legacyInventory] = await Promise.all([
    Booking.find(legacyCardPaymentQuery).select('_id reference').lean(),
    Booking.find(ineligibleSettlementQuery).select('_id reference').lean(),
    Booking.find(legacyInventoryQuery(today)).select('_id reference').lean(),
  ]);

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    legacyCardPaymentsToClassify: legacyCardPayments.length,
    ineligibleSettlementsToReset: ineligibleSettlements.length,
    legacyInventoryReservationsToBackfill: legacyInventory.length,
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

  process.stdout.write(`${JSON.stringify({
    ...summary,
    legacyCardPaymentsClassified: cardResult.modifiedCount,
    ineligibleSettlementsReset: settlementResult.modifiedCount,
    inventoryReservationsBackfilled: inventoryBackfilled,
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
