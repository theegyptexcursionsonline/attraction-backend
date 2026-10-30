/**
 * Batch B11, second step (30 October 2026): take the old catalogue off the four sites that already existed, now
 * that each of them sells the client's own trips.
 *
 * The first step (`seed-network-b11-existing.ts`) created fifteen trips built from the client's published records
 * and deliberately took nothing off, because every listing already on those sites is owned by one of them and one
 * carries a booking. This step is that second, separate decision (coordinator, 30 October): these four sites move
 * onto brands of their own and must sell **only the client's real trips**. The records they list today are not the
 * client's programmes (the 28 October queue note: "they need the client's own programmes first"), several are off
 * the site's subject altogether — snorkelling, camel and parasailing days listed on the Luxor and the Cairo sites
 * — and ninety-six of the ninety-nine carry a rating with no approved review behind it.
 *
 * What it does, and the only thing it does: **pull this site's id out of a record's `tenantIds`**. Nothing else
 * changes. The record keeps its owner, its words, its photos, its rating, its status and its bookings; every other
 * site that lists it goes on listing it; the site that owns it goes on listing it. Nothing is archived, nothing is
 * deleted, and no tenant document is written in any mode. `cairo-night-cruise` owns twelve records that siblings
 * list and `cairo-tour-from-hurghada` owns twenty-four, so unlisting a sibling's copy leaves the owner's own
 * listing exactly as it is.
 *
 * Three rules keep a record listed, and they are checked again immediately before each write:
 *   1. It is one of the client's trips this site sells (batch B11's own slugs). Never touched.
 *   2. It carries a **booking of any status**. Kept and reported, so nothing a guest bought leaves a site.
 *   3. After the unlist it would be listed **nowhere at all**. Kept and reported rather than archived, so no
 *      record falls off the network as a side effect of tidying a site.
 *
 * Read on 30 October, after the first step applied: the four sites list 114 records between them — the 15 the
 * client's step created and the 99 that were already there. Of those 99, 68 are unlisted here, 2 are kept for a
 * booking (the same record, `horse-riding-hurghada`, listed on both Hurghada sites) and 29 would be listed nowhere
 * else, so they stay.
 *
 * Read-only check (the default; connects to the database, writes nothing):
 *   DOTENV_CONFIG_PATH=<path to .env> npx ts-node -r dotenv/config src/scripts/unlist-b11-old-catalogue.ts
 * Apply:
 *   DOTENV_CONFIG_PATH=<path to .env> URL_NAMESPACE_WRITES_READY=true npx ts-node -r dotenv/config \
 *     src/scripts/unlist-b11-old-catalogue.ts --apply --confirm-sites=<slugs> --journal-dir=<directory outside git>
 * Put those sites back exactly as they were:
 *   DOTENV_CONFIG_PATH=<path to .env> npx ts-node -r dotenv/config \
 *     src/scripts/unlist-b11-old-catalogue.ts --restore --confirm-sites=<slugs> --journal-dir=<the same directory>
 *
 * `env.ts` calls `dotenv.config()` with no path, so it reads `.env` from the working directory and ignores
 * `DOTENV_CONFIG_PATH` on its own; the `-r dotenv/config` preload above is what makes that variable count, and
 * without either the connection falls back to a local database. Every mode prints the host and database first.
 */
import fs from 'fs';
import path from 'path';
import { B11_EXISTING } from './seed-network-b11-existing';

/** The four sites this step may touch, and the trips each of them sells, taken from batch B11 itself. */
export const SITES = B11_EXISTING.sites.map((site) => ({
  slug: site.slug,
  clientTrips: site.trips.map((trip) => `${site.slugPrefix}${trip.path}`),
}));

/** One record as it stands on one site, as far as deciding its fate needs to know. */
export interface Listing {
  slug: string;
  title: string;
  ownerSlug: string | null;
  /** Every tenant that lists it, this site included. */
  listedOn: string[];
  bookings: number;
  bookingStatuses: string[];
  rating: number;
  reviewCount: number;
}

export type Verdict =
  | { slug: string; action: 'unlist'; stillListedOn: string[] }
  | { slug: string; action: 'keep'; reason: string };

/**
 * What becomes of one record on one site. The client's own trips are not candidates at all; of the rest, a record
 * with a booking of any status and a record that would be left listed nowhere are kept, and everything else is
 * unlisted. Pure, so the rules are the same in the check, at the write and in the test.
 */
export function decide(site: { slug: string; clientTrips: string[] }, listing: Listing): Verdict | null {
  if (site.clientTrips.includes(listing.slug)) return null;
  if (listing.bookings > 0) {
    return { slug: listing.slug, action: 'keep', reason: `${listing.bookings} booking(s) (${listing.bookingStatuses.join(', ')}); nothing a guest booked leaves a site` };
  }
  const others = listing.listedOn.filter((slug) => slug !== site.slug);
  if (!others.length) {
    return { slug: listing.slug, action: 'keep', reason: 'this is the only site that lists it, and nothing here is archived' };
  }
  return { slug: listing.slug, action: 'unlist', stillListedOn: others };
}

/** Everything one site's plan needs, and the problems that stop it. */
export interface SitePlan {
  slug: string;
  tenantId: unknown;
  clientTripsListed: Array<{ slug: string; title: string }>;
  unlist: Array<{ slug: string; title: string; ownerSlug: string | null; stillListedOn: string[] }>;
  keptBecauseBooking: Array<{ slug: string; title: string; reason: string }>;
  keptBecauseWouldBeUnlistedEverywhere: Array<{ slug: string; title: string; reason: string }>;
  listsAfterwards: Array<{ slug: string; title: string; why: string }>;
  problems: string[];
}

async function readListings(tenantId: unknown): Promise<Listing[]> {
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const { Booking } = await import('../models/Booking');
  const records = await Attraction.find({ tenantIds: tenantId })
    .select('_id slug title ownerTenantId tenantIds rating reviewCount').sort({ slug: 1 }).lean();
  const ids = [...new Set(records.flatMap((record) => [record.ownerTenantId, ...(record.tenantIds || [])]).filter(Boolean).map(String))];
  const tenants = await Tenant.find({ _id: { $in: ids } }).select('_id slug').lean();
  const slugOf = new Map(tenants.map((tenant) => [String(tenant._id), tenant.slug as string]));
  const listings: Listing[] = [];
  for (const record of records) {
    const bookings = await Booking.find({ attractionId: record._id }).select('status').lean();
    listings.push({
      slug: String(record.slug),
      title: String(record.title || ''),
      ownerSlug: record.ownerTenantId ? (slugOf.get(String(record.ownerTenantId)) ?? String(record.ownerTenantId)) : null,
      listedOn: (record.tenantIds || []).map((id: unknown) => slugOf.get(String(id)) ?? String(id)),
      bookings: bookings.length,
      bookingStatuses: [...new Set(bookings.map((booking) => String(booking.status)))],
      rating: Number(record.rating || 0),
      reviewCount: Number(record.reviewCount || 0),
    });
  }
  return listings;
}

export async function planSite(site: typeof SITES[number]): Promise<SitePlan> {
  const { Tenant } = await import('../models/Tenant');
  const problems: string[] = [];
  const tenant = await Tenant.findOne({ slug: site.slug }).select('_id slug status').lean();
  if (!tenant) return { slug: site.slug, tenantId: null, clientTripsListed: [], unlist: [], keptBecauseBooking: [], keptBecauseWouldBeUnlistedEverywhere: [], listsAfterwards: [], problems: [`${site.slug}: no such site on the network.`] };
  if (!['active', 'coming_soon', 'pending'].includes(String(tenant.status))) problems.push(`${site.slug}: protected status ${tenant.status}.`);

  const listings = await readListings(tenant._id);
  const byId = new Map(listings.map((listing) => [listing.slug, listing]));
  // The client's trips must already be on the site: this step runs after the one that creates them.
  for (const slug of site.clientTrips) {
    if (!byId.has(slug)) problems.push(`${site.slug}: ${slug} is not on the site yet; run the trips step first.`);
  }

  const unlist: SitePlan['unlist'] = [];
  const keptBecauseBooking: SitePlan['keptBecauseBooking'] = [];
  const keptBecauseWouldBeUnlistedEverywhere: SitePlan['keptBecauseWouldBeUnlistedEverywhere'] = [];
  for (const listing of listings) {
    const verdict = decide(site, listing);
    if (!verdict) continue;
    if (verdict.action === 'unlist') { unlist.push({ slug: listing.slug, title: listing.title, ownerSlug: listing.ownerSlug, stillListedOn: verdict.stillListedOn }); continue; }
    const kept = { slug: listing.slug, title: listing.title, reason: verdict.reason };
    if (listing.bookings > 0) keptBecauseBooking.push(kept);
    else keptBecauseWouldBeUnlistedEverywhere.push(kept);
  }

  const taken = new Set(unlist.map((entry) => entry.slug));
  const listsAfterwards = listings.filter((listing) => !taken.has(listing.slug)).map((listing) => ({
    slug: listing.slug,
    title: listing.title,
    why: site.clientTrips.includes(listing.slug) ? "the client's trip this site sells"
      : listing.bookings > 0 ? 'kept: it carries a booking'
        : 'kept: no other site lists it',
  }));

  return {
    slug: site.slug,
    tenantId: tenant._id,
    clientTripsListed: listings.filter((listing) => site.clientTrips.includes(listing.slug)).map((listing) => ({ slug: listing.slug, title: listing.title })),
    unlist,
    keptBecauseBooking,
    keptBecauseWouldBeUnlistedEverywhere,
    listsAfterwards,
    problems,
  };
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

/** The sites this run may touch: named in full, in the batch's order, and nothing else. */
function confirmedSites(): typeof SITES {
  const named = (argValue('confirm-sites') || '').split(',').map((slug) => slug.trim()).filter(Boolean);
  if (!named.length) throw new Error(`Pass --confirm-sites=<slugs>, in this order: ${SITES.map((site) => site.slug).join(',')}`);
  const unknown = named.filter((slug) => !SITES.some((site) => site.slug === slug));
  if (unknown.length) throw new Error(`Not in this batch: ${unknown.join(', ')}.`);
  if (new Set(named).size !== named.length) throw new Error('A site is named twice.');
  const chosen = SITES.filter((site) => named.includes(site.slug));
  if (chosen.map((site) => site.slug).join(',') !== named.join(',')) {
    throw new Error(`Name the sites in the batch's own order: ${chosen.map((site) => site.slug).join(',')}`);
  }
  return chosen;
}

function journalFile(slug: string): string {
  const dir = argValue('journal-dir');
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('Pass --journal-dir=<existing directory outside git>.');
  return path.join(dir, `unlist-${slug}.json`);
}

interface Journal { site: string; appliedAt: string; tenantId: string; unlisted: Array<{ slug: string; stillListedOn: string[] }> }

async function announce(): Promise<void> {
  const { env } = await import('../config/env');
  const url = new URL(env.mongodbUri);
  console.error(`database: host=${url.host} db=${url.pathname.replace(/^\//, '')}`);
}

async function check(): Promise<void> {
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  await connectDatabase();
  try {
    const plans = [];
    for (const site of SITES) plans.push(await planSite(site));
    console.log(JSON.stringify({
      mode: 'check',
      checkedAt: new Date().toISOString(),
      sites: plans.map((plan) => ({
        slug: plan.slug,
        toUnlist: plan.unlist,
        keptBecauseBooking: plan.keptBecauseBooking,
        keptBecauseWouldBeUnlistedEverywhere: plan.keptBecauseWouldBeUnlistedEverywhere,
        listsAfterwards: plan.listsAfterwards,
        problems: plan.problems,
      })),
      totals: {
        sites: plans.length,
        toUnlist: plans.reduce((total, plan) => total + plan.unlist.length, 0),
        keptBecauseBooking: plans.reduce((total, plan) => total + plan.keptBecauseBooking.length, 0),
        keptBecauseWouldBeUnlistedEverywhere: plans.reduce((total, plan) => total + plan.keptBecauseWouldBeUnlistedEverywhere.length, 0),
        listsAfterwards: plans.reduce((total, plan) => total + plan.listsAfterwards.length, 0),
        problems: plans.reduce((total, plan) => total + plan.problems.length, 0),
      },
      writes: 'none',
      safeguards: [
        "the client's own trips are never candidates",
        'a record with a booking of any status is kept and reported',
        'a record that would be listed nowhere is kept and reported, never archived',
        'the only write is $pull of this site id from tenantIds; nothing is archived or deleted',
        'no tenant document is written in any mode',
      ],
    }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

async function apply(): Promise<void> {
  const sites = confirmedSites();
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { Attraction } = await import('../models/Attraction');
  const { Booking } = await import('../models/Booking');
  const { urlNamespaceReadiness } = await import('../plugins/urlNamespace');
  if (!urlNamespaceReadiness().writesReady) throw new Error('URL namespace writes are paused in this environment. Nothing was written.');
  await connectDatabase();
  try {
    // The whole run is planned and checked before the first write, so a guard failure writes nothing at all.
    const plans = [];
    for (const site of sites) plans.push(await planSite(site));
    for (const plan of plans) if (plan.problems.length) throw new Error(`${plan.slug}: nothing was written.\n- ${plan.problems.join('\n- ')}`);

    const done = [];
    for (const plan of plans) {
      const file = journalFile(plan.slug);
      const journal: Journal = { site: plan.slug, appliedAt: new Date().toISOString(), tenantId: String(plan.tenantId), unlisted: [] };
      const record = () => fs.writeFileSync(file, JSON.stringify(journal, null, 2), { mode: 0o600 });
      record();
      for (const entry of plan.unlist) {
        // Both refusals are checked again here, against the record as it is at this instant: a booking taken since
        // the plan was made, or a listing lost elsewhere, stops this record being unlisted.
        const live = await Attraction.findOne({ slug: entry.slug }).select('_id tenantIds').lean();
        if (!live) throw new Error(`${entry.slug}: the record vanished mid-run; nothing further was written.`);
        if (await Booking.countDocuments({ attractionId: live._id })) throw new Error(`${entry.slug}: it has a booking now; nothing further was written.`);
        const others = (live.tenantIds || []).filter((id: unknown) => String(id) !== String(plan.tenantId));
        if (!others.length) throw new Error(`${entry.slug}: it is now listed only here; nothing further was written.`);
        journal.unlisted.push({ slug: entry.slug, stillListedOn: entry.stillListedOn });
        record();
        const result = await Attraction.updateOne({ slug: entry.slug, tenantIds: plan.tenantId }, { $pull: { tenantIds: plan.tenantId } });
        if (result.modifiedCount !== 1) throw new Error(`${entry.slug}: it was not listed here any more; nothing further was written.`);
      }
      const after = await planSite(SITES.find((site) => site.slug === plan.slug)!);
      if (after.unlist.length) throw new Error(`${plan.slug}: post-apply check failed, ${after.unlist.length} still to unlist. The journal reverses what was written.`);
      done.push({ slug: plan.slug, unlisted: journal.unlisted.length, nowLists: after.listsAfterwards.length });
    }
    console.log(JSON.stringify({ mode: 'applied', sites: done, archived: 'none', deleted: 'none' }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

async function restore(): Promise<void> {
  const sites = confirmedSites();
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { Attraction } = await import('../models/Attraction');
  await connectDatabase();
  try {
    const done = [];
    for (const site of sites) {
      const journal = JSON.parse(fs.readFileSync(journalFile(site.slug), 'utf8')) as Journal;
      if (journal.site !== site.slug) throw new Error(`${site.slug}: the journal names ${journal.site}.`);
      for (const entry of journal.unlisted) {
        await Attraction.updateOne({ slug: entry.slug }, { $addToSet: { tenantIds: journal.tenantId } });
      }
      done.push({ slug: site.slug, relisted: journal.unlisted.length });
    }
    console.log(JSON.stringify({ mode: 'restored', sites: done }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

export async function main(): Promise<void> {
  await announce();
  if (process.argv.includes('--restore')) return restore();
  if (process.argv.includes('--apply')) return apply();
  return check();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[unlist-b11-old-catalogue] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
