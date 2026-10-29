/**
 * Remove the ratings no approved review backs from the two built sites the network queue moves onto brands of their
 * own (docs/NETWORK_BUILD_QUEUE.md, sites 5 and 10, read 28 October 2026): the "Safari Red Sea" record of
 * safari-red-sea carries 4.8 from 98, and two records of pyramids-excursions carry 4.8 from 456, with no approved
 * review behind any of them. A storefront shows stars whenever a record has a rating and a review count, so the
 * figures must go from the records themselves.
 *
 * A rating is cleared only where the reviews collection holds no approved review for that trip, and only while the
 * record still carries the exact figures that were read: a trip with approved reviews, or one edited since, is left
 * untouched and reported. A journal keeps every previous value so the change can be undone exactly.
 *
 * The same run lists the trips each site sells twice under one name (four on pyramids-excursions), for the client to
 * say which to keep, and proposes, for every trip that sells children as a separate "Child" option, the child price
 * the adult option would carry instead (checklist C3). It deletes nothing, and it writes neither proposal: both wait
 * for the client.
 *
 * Dry run (read-only, the default; needs the database connection):
 *   npm run fix:network-unbacked-ratings
 * Apply:
 *   npm run fix:network-unbacked-ratings -- --apply --confirm-sites=safari-red-sea,pyramids-excursions \
 *     --journal=<file outside the repository>
 * Undo:
 *   npm run fix:network-unbacked-ratings -- --revert --journal=<the same file>
 */

import fs from 'fs';
import path from 'path';

/** The sites this script reads, in order; the apply fence names them exactly. */
export const RATING_SITES = ['safari-red-sea', 'pyramids-excursions'] as const;

export interface RatingChange {
  site: string;
  trip: string;
  title: string;
  before: { rating: number; reviewCount: number };
}

export interface RatingRecord {
  slug: string;
  title?: string;
  rating?: number;
  reviewCount?: number;
  pricingOptions?: Array<{ id?: string; name?: string; price?: number; childPrice?: number; pricingModel?: string }>;
}

export interface ChildPriceProposal {
  site: string;
  trip: string;
  adultOption: string;
  childOption: string;
  adultPrice: number;
  childPrice: number;
}

/**
 * One trip's change, or none: a record with no rating and no count needs none, and a record that approved reviews
 * back keeps its figures (they are then the platform's own, recalculated from those reviews).
 */
export function planRating(site: string, record: RatingRecord, approvedReviews: number): RatingChange | null {
  const rating = Number(record.rating || 0);
  const reviewCount = Number(record.reviewCount || 0);
  if (rating <= 0 && reviewCount <= 0) return null;
  if (approvedReviews > 0) return null;
  return { site, trip: record.slug, title: String(record.title || ''), before: { rating, reviewCount } };
}

/**
 * The child price a trip's adult option would carry in place of its separate "Child" option (checklist C3), or none:
 * only a trip with exactly one per-person adult option, no child price on it yet, and one per-person child option
 * priced below it. The figures are the record's own; nothing is typed.
 */
export function planChildPrice(site: string, record: RatingRecord): ChildPriceProposal | null {
  const perPerson = (record.pricingOptions || []).filter((option) => (option.pricingModel ?? 'per-person') === 'per-person');
  const children = perPerson.filter((option) => /\bchild(?:ren)?\b/i.test(String(option.name || '')));
  const adults = perPerson.filter((option) => /\badults?\b/i.test(String(option.name || '')));
  if (children.length !== 1 || adults.length !== 1) return null;
  const [adult] = adults;
  const [child] = children;
  const adultPrice = Number(adult.price);
  const childPrice = Number(child.price);
  if (adult.childPrice !== undefined && adult.childPrice !== null) return null;
  if (!(childPrice > 0) || !(childPrice < adultPrice)) return null;
  return { site, trip: record.slug, adultOption: String(adult.id), childOption: String(child.id), adultPrice, childPrice };
}

/**
 * A trip's name as a guest reads it: case, punctuation, a bracketed length and the small words between the places
 * ("Tour", "and", "&") do not make two trips different.
 */
const FILLER = new Set(['and', 'the', 'tour', 'of', 'with', 'to']);
export const sameName = (title: string): string => title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .split(' ')
  .filter((word) => word && !FILLER.has(word))
  .join(' ');

/** The trips a site sells more than once under one name, each group in the order the site sorts them. */
export function duplicateNames(records: RatingRecord[]): Array<{ name: string; trips: string[] }> {
  const groups = new Map<string, string[]>();
  for (const record of records) {
    const key = sameName(String(record.title || ''));
    groups.set(key, [...(groups.get(key) || []), record.slug]);
  }
  return [...groups.entries()].filter(([, trips]) => trips.length > 1).map(([name, trips]) => ({ name, trips }));
}

async function readSites() {
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const { Review } = await import('../models/Review');
  const planned: RatingChange[] = [];
  const kept: Array<{ site: string; trip: string; approvedReviews: number }> = [];
  const duplicates: Array<{ site: string; name: string; trips: string[] }> = [];
  const childPrices: ChildPriceProposal[] = [];
  for (const slug of RATING_SITES) {
    const tenant = await Tenant.findOne({ slug }).select('_id slug').lean();
    if (!tenant) throw new Error(`${slug}: no such site.`);
    const records = await Attraction.find({ status: 'active', $or: [{ ownerTenantId: tenant._id }, { tenantIds: tenant._id }] })
      .select('_id slug title rating reviewCount sortOrder pricingOptions').sort({ sortOrder: 1, _id: 1 }).lean();
    for (const record of records) {
      const approved = await Review.countDocuments({ attractionId: record._id, status: 'approved' });
      const change = planRating(slug, record as RatingRecord, approved);
      if (change) planned.push(change);
      else if (approved > 0 && (Number(record.rating) > 0 || Number(record.reviewCount) > 0)) kept.push({ site: slug, trip: String(record.slug), approvedReviews: approved });
    }
    duplicates.push(...duplicateNames(records as RatingRecord[]).map((group) => ({ site: slug, ...group })));
    for (const record of records) {
      const proposal = planChildPrice(slug, record as RatingRecord);
      if (proposal) childPrices.push(proposal);
    }
  }
  return { planned, kept, duplicates, childPrices };
}

async function write(change: RatingChange, from: RatingChange['before'], to: RatingChange['before']): Promise<void> {
  const { Attraction } = await import('../models/Attraction');
  const result = await Attraction.updateOne({ slug: change.trip, rating: from.rating, reviewCount: from.reviewCount }, { $set: to });
  if (result.modifiedCount !== 1) throw new Error(`${change.trip}: the figures changed since they were read; the record was not modified.`);
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function journalPath(): string {
  const file = argValue('journal');
  if (!file) throw new Error('Pass --journal=<file outside the repository>.');
  const resolved = path.resolve(file);
  if (resolved.startsWith(path.resolve(__dirname, '..', '..'))) throw new Error('Keep the journal out of the repository.');
  return resolved;
}

export async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  await connectDatabase();
  try {
    if (args.has('--revert')) {
      const journal = JSON.parse(fs.readFileSync(journalPath(), 'utf8')) as { applied: RatingChange[] };
      for (const change of journal.applied) await write(change, { rating: 0, reviewCount: 0 }, change.before);
      console.log(JSON.stringify({ mode: 'reverted', reverted: journal.applied.length }, null, 2));
      return;
    }
    const { planned, kept, duplicates, childPrices } = await readSites();
    if (!args.has('--apply')) {
      console.log(JSON.stringify({ mode: 'dry-run', writes: 'none', planned, kept, duplicatesForTheClient: duplicates, childPricesForTheClient: childPrices }, null, 2));
      return;
    }
    if (argValue('confirm-sites') !== RATING_SITES.join(',')) throw new Error(`Apply fence missing. Pass --confirm-sites=${RATING_SITES.join(',')}.`);
    const file = journalPath();
    const applied: RatingChange[] = [];
    // The journal always names exactly what has been written, so an interrupted run reverts cleanly.
    const record = () => fs.writeFileSync(file, JSON.stringify({ planned, applied }, null, 2), { mode: 0o600 });
    record();
    for (const change of planned) {
      await write(change, change.before, { rating: 0, reviewCount: 0 });
      applied.push(change);
      record();
    }
    const after = await readSites();
    if (after.planned.length) throw new Error(`Post-apply check failed: ${after.planned.map((change) => change.trip).join(', ')}`);
    console.log(JSON.stringify({ mode: 'applied', applied: applied.length, duplicatesForTheClient: duplicates, childPricesForTheClient: childPrices, deleted: 'none', childPricesWritten: 'none' }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[network-unbacked-ratings] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
