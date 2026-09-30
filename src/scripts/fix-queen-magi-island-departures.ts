/**
 * Make the Queen Magi island tours with a fixed departure bookable.
 *
 * The island seeds sold every tour by the day ('date-only') while giving six of them a published
 * departure window. The storefront booking engine asks for a departure whenever a tour has a
 * window, but the public availability API only returns departures for 'time-slots' tours, so the
 * guest met "No departures are scheduled for this date" on every date and could not book.
 *
 * This script moves exactly those tours (on the two island sites only) to 'time-slots', which is
 * what the availability API needs to offer the published departure. Nothing else on the record
 * changes. Each write is guarded on the value read, and a journal records every change so it can
 * be undone exactly.
 *
 * Dry run (read-only, the default):
 *   npx ts-node src/scripts/fix-queen-magi-island-departures.ts
 * Apply:
 *   npx ts-node src/scripts/fix-queen-magi-island-departures.ts --apply \
 *     --confirm-tenants=paradise-island-hurghada,hula-hula-island --journal=<file outside the repository>
 * Undo exactly what an apply changed:
 *   npx ts-node src/scripts/fix-queen-magi-island-departures.ts --revert --journal=<the same file>
 */

import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { departureAvailabilityType } from '../utils/departureAvailability';

export const ISLAND_SITES = ['paradise-island-hurghada', 'hula-hula-island'] as const;
const ISLAND_DESIGNS: Record<string, string> = { 'paradise-island-hurghada': 'paradise', 'hula-hula-island': 'hulahula' };

export interface DepartureFix {
  id: string;
  slug: string;
  site: string;
  departures: string[];
  from: 'date-only';
  to: 'time-slots';
}

/** Read-only: the island tours that publish a departure but are still sold by the day. */
export async function planDepartureFixes(): Promise<DepartureFix[]> {
  const sites = await Tenant.find({ slug: { $in: [...ISLAND_SITES] } }).select('_id slug designMode status').lean();
  if (sites.length !== ISLAND_SITES.length) {
    throw new Error(`Expected both island sites, found: ${sites.map((site) => site.slug).join(', ') || 'none'}.`);
  }
  for (const site of sites) {
    if (site.designMode !== ISLAND_DESIGNS[site.slug]) {
      throw new Error(`Refusing a site in an unexpected design: ${site.slug} (${site.designMode}).`);
    }
  }

  const fixes: DepartureFix[] = [];
  for (const site of sites) {
    const tours = await Attraction.find({ ownerTenantId: site._id })
      .select('_id slug availability entryWindows')
      .sort({ slug: 1 })
      .lean();
    for (const tour of tours) {
      const current = tour.availability?.type;
      const target = departureAvailabilityType(tour.entryWindows);
      if (current === 'date-only' && target === 'time-slots') {
        fixes.push({
          id: String(tour._id),
          slug: tour.slug,
          site: site.slug,
          departures: (tour.entryWindows || []).map((window) => window.startTime).filter(Boolean) as string[],
          from: 'date-only',
          to: 'time-slots',
        });
      }
    }
  }
  return fixes;
}

/** Move each planned tour to 'time-slots'; refuse any record that changed since it was read. */
export async function applyDepartureFixes(fixes: DepartureFix[]): Promise<DepartureFix[]> {
  const applied: DepartureFix[] = [];
  for (const fix of fixes) {
    const result = await Attraction.updateOne(
      { _id: new Types.ObjectId(fix.id), slug: fix.slug, 'availability.type': 'date-only', 'entryWindows.0': { $exists: true } },
      { $set: { 'availability.type': 'time-slots' } },
    );
    if (result.modifiedCount !== 1) {
      throw new Error(`${fix.slug} changed since it was read; it was not modified. Applied so far: ${applied.length}.`);
    }
    applied.push(fix);
  }
  return applied;
}

/** Put back exactly the tours a journal records, only where they are still as this script left them. */
export async function revertDepartureFixes(journal: DepartureFix[]): Promise<number> {
  let reverted = 0;
  for (const fix of journal) {
    const result = await Attraction.updateOne(
      { _id: new Types.ObjectId(fix.id), slug: fix.slug, 'availability.type': 'time-slots' },
      { $set: { 'availability.type': 'date-only' } },
    );
    if (result.modifiedCount !== 1) {
      throw new Error(`${fix.slug} is no longer as this script left it; it was not reverted. Reverted so far: ${reverted}.`);
    }
    reverted += 1;
  }
  return reverted;
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
  if (resolved.startsWith(path.resolve(__dirname, '..', '..', 'src'))) throw new Error('Keep the journal out of the source tree.');
  return resolved;
}

export async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  await connectDatabase();
  try {
    if (args.has('--revert')) {
      const file = journalPath();
      const journal = JSON.parse(fs.readFileSync(file, 'utf8')) as { applied: DepartureFix[] };
      const reverted = await revertDepartureFixes(journal.applied);
      console.log(JSON.stringify({ mode: 'reverted', reverted }, null, 2));
      return;
    }

    const planned = await planDepartureFixes();
    if (!args.has('--apply')) {
      console.log(JSON.stringify({ mode: 'dry-run', writes: 'none', planned }, null, 2));
      return;
    }

    if (argValue('confirm-tenants') !== ISLAND_SITES.join(',')) {
      throw new Error(`Apply fence missing. Pass --confirm-tenants=${ISLAND_SITES.join(',')}.`);
    }
    const file = journalPath();
    // The journal is written before any change and completed after, so an interruption still
    // leaves a record of what may have been touched.
    fs.writeFileSync(file, JSON.stringify({ planned, applied: [] }, null, 2), { mode: 0o600 });
    const applied = await applyDepartureFixes(planned);
    fs.writeFileSync(file, JSON.stringify({ planned, applied }, null, 2), { mode: 0o600 });

    const remaining = await planDepartureFixes();
    if (remaining.length !== 0) throw new Error(`Post-apply check failed: ${remaining.map((fix) => fix.slug).join(', ')}`);
    console.log(JSON.stringify({ mode: 'applied', applied: applied.map((fix) => `${fix.site}/${fix.slug} ${fix.departures.join(' ')}`) }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[queen-magi-island-departures] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
