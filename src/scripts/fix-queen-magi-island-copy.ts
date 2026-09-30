/**
 * Speak as the venue on the Queen Magi island sites.
 *
 * The island seeds described the business in the third person ("the operator's other beach
 * venue", "What the operator confirms is on the island") on pages that otherwise speak as the
 * venue ("our own beach"). This script rewrites exactly those sentences on the two island
 * sites, and nothing else: a sentence is replaced only where the field still holds the text that
 * was read, and a journal keeps every previous value so the change can be undone exactly.
 *
 * Dry run (read-only, the default):
 *   npx ts-node src/scripts/fix-queen-magi-island-copy.ts
 * Apply:
 *   npx ts-node src/scripts/fix-queen-magi-island-copy.ts --apply \
 *     --confirm-tenants=paradise-island-hurghada,hula-hula-island --journal=<file outside the repository>
 * Undo:
 *   npx ts-node src/scripts/fix-queen-magi-island-copy.ts --revert --journal=<the same file>
 */

import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';

/** The two island sites. Each site's copy speaks as the venue and never names the other one. */
export const ISLAND_SITES = ['paradise-island-hurghada', 'hula-hula-island'] as const;

/** Exact sentence rewrites. Each left-hand side is a whole sentence the seed wrote. */
export function copyFixes(): Array<[string, string]> {
  return [
    ['It does not admit to the operator’s other beach venue.', 'It does not admit to our other beach venue on the island.'],
    [
      'The operator runs a second beach venue on the same island with its own ticket, and the two are not interchangeable.',
      'We also run a second beach venue on the same island, with its own ticket, and the two tickets are not interchangeable.',
    ],
    [
      'That is a genuine difference from the operator’s other venue, where the speedboat trips do not carry them.',
      'That is a genuine difference from our other venue on the island, where the speedboat trips do not include them.',
    ],
    ['What the operator confirms about Hula Hula Island:', 'What is on Hula Hula Island:'],
    ['What the operator confirms is on the island:', 'What is on the island:'],
  ];
}

const TOUR_FIELDS = ['description', 'shortDescription', 'needToKnow', 'highlights'] as const;
const PAGE_FIELDS = ['heroDescription', 'metaDescription', 'body'] as const;

type Value = string | string[];

export interface CopyChange {
  site: string;
  kind: 'tour' | 'page';
  /** Tour id, or the page slug on the site. */
  target: string;
  label: string;
  field: string;
  before: Value;
  after: Value;
}

const rewrite = (value: string, fixes: Array<[string, string]>): string =>
  fixes.reduce((text, [from, to]) => text.split(from).join(to), value);

function rewriteValue(value: unknown, fixes: Array<[string, string]>): Value | null {
  if (typeof value === 'string') {
    const next = rewrite(value, fixes);
    return next === value ? null : next;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    const next = (value as string[]).map((item) => rewrite(item, fixes));
    return next.some((item, index) => item !== value[index]) ? next : null;
  }
  return null;
}

/** Read-only: every served field on the two island sites that still carries a sentence to rewrite. */
export async function planCopyChanges(): Promise<CopyChange[]> {
  const changes: CopyChange[] = [];
  const fixes = copyFixes();
  for (const site of ISLAND_SITES) {
    const tenant = await Tenant.findOne({ slug: site }).select('_id slug customPages').lean();
    if (!tenant) throw new Error(`Island site not found: ${site}`);
    for (const page of tenant.customPages || []) {
      for (const field of PAGE_FIELDS) {
        const before = (page as Record<string, unknown>)[field];
        const after = rewriteValue(before, fixes);
        if (after !== null) changes.push({ site, kind: 'page', target: page.slug, label: page.slug, field, before: before as Value, after });
      }
    }
    const tours = await Attraction.find({ ownerTenantId: tenant._id }).select(['_id', 'slug', ...TOUR_FIELDS].join(' ')).lean();
    for (const tour of tours) {
      for (const field of TOUR_FIELDS) {
        const before = (tour as Record<string, unknown>)[field];
        const after = rewriteValue(before, fixes);
        if (after !== null) changes.push({ site, kind: 'tour', target: String(tour._id), label: tour.slug, field, before: before as Value, after });
      }
    }
  }
  return changes;
}

async function write(change: CopyChange, from: Value, to: Value): Promise<void> {
  const result = change.kind === 'tour'
    ? await Attraction.updateOne({ _id: new Types.ObjectId(change.target), [change.field]: from }, { $set: { [change.field]: to } })
    : await Tenant.updateOne(
        { slug: change.site, customPages: { $elemMatch: { slug: change.target, [change.field]: from } } },
        { $set: { [`customPages.$.${change.field}`]: to } },
      );
  if (result.modifiedCount !== 1) {
    throw new Error(`${change.site}/${change.label}.${change.field} changed since it was read; it was not modified.`);
  }
}

/** Apply in order; `onApplied` hears about each change the moment it is written. */
export async function applyCopyChanges(changes: CopyChange[], onApplied: (done: CopyChange[]) => void = () => {}): Promise<number> {
  const done: CopyChange[] = [];
  for (const change of changes) {
    await write(change, change.before, change.after);
    done.push(change);
    onApplied(done);
  }
  return done.length;
}

export async function revertCopyChanges(changes: CopyChange[]): Promise<number> {
  let reverted = 0;
  for (const change of changes) {
    await write(change, change.after, change.before);
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
      const journal = JSON.parse(fs.readFileSync(journalPath(), 'utf8')) as { applied: CopyChange[] };
      console.log(JSON.stringify({ mode: 'reverted', reverted: await revertCopyChanges(journal.applied) }, null, 2));
      return;
    }
    const planned = await planCopyChanges();
    if (!args.has('--apply')) {
      console.log(JSON.stringify({ mode: 'dry-run', writes: 'none', planned: planned.map(({ site, label, field }) => `${site}/${label}.${field}`) }, null, 2));
      return;
    }
    if (argValue('confirm-tenants') !== ISLAND_SITES.join(',')) {
      throw new Error(`Apply fence missing. Pass --confirm-tenants=${ISLAND_SITES.join(',')}.`);
    }
    const file = journalPath();
    // The journal always names exactly what has been written, so an interrupted run reverts cleanly.
    const record = (done: CopyChange[]) => fs.writeFileSync(file, JSON.stringify({ planned, applied: done }, null, 2), { mode: 0o600 });
    record([]);
    const applied = await applyCopyChanges(planned, record);
    const remaining = await planCopyChanges();
    if (remaining.length) throw new Error(`Post-apply check failed: ${remaining.map((change) => change.label).join(', ')}`);
    console.log(JSON.stringify({ mode: 'applied', applied }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[queen-magi-island-copy] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
