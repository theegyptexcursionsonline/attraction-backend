import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { DEFAULT_BOOKING_TIME_ZONE } from '../utils/bookingCutoff';
import { PACKAGE_LIMITS, readPackageDetails } from '../utils/packageDetails';
import { addMonths, packageFromPrice, todayInZone } from './packagePricing.service';

const utcDay = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

/**
 * Whether packages may go live. Off until the storefront can show and sell a package, so no
 * published package can reach a site that would render it as a broken tour; afterwards it stays
 * the switch that stops new packages going live. Read on every call so it can be changed with a
 * restart-free environment update in tests and a redeploy in production.
 */
export const packagePublishingEnabled = (): boolean =>
  (process.env.PACKAGES_PUBLISHING_ENABLED ?? '').trim().toLowerCase() === 'true';

/** Optimistic-lock filter for the package editor's revision (absent on records never saved). */
export const packageRevisionFilter = (expectedRevision: number): Record<string, unknown> => (expectedRevision === 0
  ? { $or: [{ packageRevision: 0 }, { packageRevision: { $exists: false } }] }
  : { packageRevision: expectedRevision });

/** Dated departures that still have a seat, from today to the end of the booking horizon. */
export async function openDepartureDates(attractionId: Types.ObjectId, today: string): Promise<string[]> {
  const rows = await Availability.find({
    attractionId,
    date: { $gte: utcDay(today), $lte: utcDay(addMonths(today, PACKAGE_LIMITS.horizonMonths)) },
    isBlocked: { $ne: true },
    allDayCapacity: { $type: 'number' },
    $expr: { $lt: [{ $ifNull: ['$allDayBooked', 0] }, '$allDayCapacity'] },
  }).select('date').sort({ date: 1 }).limit(800).lean();
  return rows.map((row) => row.date.toISOString().slice(0, 10));
}

/**
 * Keeps every live package's catalogue price true as days pass. The listing card shows
 * `priceFrom`; when a season ends or the cheapest departure fills, the cheapest price a customer
 * can still book changes although nobody edited the package. Runs in-process (see app.ts), never
 * touches a package an editor saved in the meantime, and reports live packages that can no longer
 * be booked at all so they are seen rather than silently advertised.
 */
export async function refreshPackagePrices(now: Date = new Date()): Promise<{ checked: number; updated: number; unbookable: number }> {
  const today = todayInZone(DEFAULT_BOOKING_TIME_ZONE, now);
  const result = { checked: 0, updated: 0, unbookable: 0 };
  const cursor = Attraction.find({ listingType: 'package', status: 'active', trashedAt: { $exists: false } })
    .select('_id priceFrom packageDetails packageRevision')
    .lean<Array<{ _id: Types.ObjectId; priceFrom?: number; packageDetails?: unknown; packageRevision?: number }>>()
    .cursor({ batchSize: 100 });
  for await (const record of cursor) {
    result.checked += 1;
    const details = readPackageDetails(record.packageDetails);
    if (!details) continue;
    const departures = details.departureMode === 'fixed' ? await openDepartureDates(record._id, today) : [];
    const fromPrice = packageFromPrice(details, today, departures);
    if (!fromPrice) {
      result.unbookable += 1;
      console.warn('[packages] live package has no bookable date', { attractionId: String(record._id) });
      continue;
    }
    if (fromPrice.perPerson === record.priceFrom) continue;
    const written = await Attraction.updateOne(
      { _id: record._id, listingType: 'package', status: 'active', ...packageRevisionFilter(record.packageRevision ?? 0) },
      { $set: { priceFrom: fromPrice.perPerson } },
    );
    if (written.modifiedCount > 0) result.updated += 1;
  }
  return result;
}
