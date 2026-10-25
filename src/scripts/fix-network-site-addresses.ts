/**
 * Name each network site's region correctly in its public address.
 *
 * The network-site seed wrote "<town>, Red Sea, Egypt" for every site, which is right for the Red Sea towns of batch
 * B01 but not for the B02 sites in Sharm El Sheikh (South Sinai) or the sites whose trips start in Cairo (B02's Tunis
 * Village and B03's three Giza sites). The seed now takes the region from `siteAddress`; this script corrects the eight
 * records it already wrote, and nothing else: an address is replaced only where it still holds the exact old value,
 * and a journal keeps every previous value so the change can be undone exactly.
 *
 * Dry run (read-only, the default):
 *   npx ts-node src/scripts/fix-network-site-addresses.ts
 * Apply:
 *   npx ts-node src/scripts/fix-network-site-addresses.ts --apply \
 *     --confirm-sites=<every slug below, comma-separated, in order> --journal=<file outside the repository>
 * Undo:
 *   npx ts-node src/scripts/fix-network-site-addresses.ts --revert --journal=<the same file>
 */

import fs from 'fs';
import path from 'path';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { siteAddress } from './seed-network-sites';

/** The sites the seed published under the wrong region, with the town each was seeded under. */
export const ADDRESS_SITES: ReadonlyArray<{ slug: string; city: string }> = [
  { slug: 'tunis-village-fayoum', city: 'Cairo' },
  { slug: 'ras-mohamed-nature-reserve', city: 'Sharm El Sheikh' },
  { slug: 'white-island-sharm', city: 'Sharm El Sheikh' },
  { slug: 'tiran-island-sharm', city: 'Sharm El Sheikh' },
  { slug: 'shark-reef-sharm', city: 'Sharm El Sheikh' },
  { slug: 'giza-plateau-pyramids', city: 'Cairo' },
  { slug: 'pyramids-of-giza-egypt', city: 'Cairo' },
  { slug: 'memphis-and-sakkara', city: 'Cairo' },
];

export interface AddressChange {
  site: string;
  before: string;
  after: string;
}

/** The value the old seed wrote for a town: the only value this script will replace. */
export const seededAddress = (city: string): string => `${city}, Red Sea, Egypt`;

/**
 * One site's change, or none when the address is already right. Anything other than the old seeded value or the
 * corrected one was edited by someone since, so the run stops rather than overwrite it.
 */
export function planAddress(site: { slug: string; city: string }, current: unknown): AddressChange | null {
  const after = siteAddress(site.city);
  if (current === after) return null;
  if (current !== seededAddress(site.city)) {
    throw new Error(`${site.slug}: the address reads ${JSON.stringify(current)}, not the seeded ${JSON.stringify(seededAddress(site.city))}; left untouched.`);
  }
  return { site: site.slug, before: current, after };
}

export async function planAddressChanges(): Promise<AddressChange[]> {
  const records = await Tenant.find({ slug: { $in: ADDRESS_SITES.map((site) => site.slug) } }).select('slug contactInfo').lean();
  const bySlug = new Map(records.map((record) => [record.slug, record]));
  const changes: AddressChange[] = [];
  for (const site of ADDRESS_SITES) {
    const record = bySlug.get(site.slug);
    if (!record) throw new Error(`${site.slug}: no such site.`);
    const change = planAddress(site, (record.contactInfo as { address?: unknown } | undefined)?.address);
    if (change) changes.push(change);
  }
  return changes;
}

async function write(change: AddressChange, from: string, to: string): Promise<void> {
  const result = await Tenant.updateOne({ slug: change.site, 'contactInfo.address': from }, { $set: { 'contactInfo.address': to } });
  if (result.modifiedCount !== 1) throw new Error(`${change.site}: the address changed since it was read; it was not modified.`);
}

/** Apply in order; `onApplied` hears about each change the moment it is written. */
export async function applyAddressChanges(changes: AddressChange[], onApplied: (done: AddressChange[]) => void = () => {}): Promise<number> {
  const done: AddressChange[] = [];
  for (const change of changes) {
    await write(change, change.before, change.after);
    done.push(change);
    onApplied(done);
  }
  return done.length;
}

export async function revertAddressChanges(changes: AddressChange[]): Promise<number> {
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
      const journal = JSON.parse(fs.readFileSync(journalPath(), 'utf8')) as { applied: AddressChange[] };
      console.log(JSON.stringify({ mode: 'reverted', reverted: await revertAddressChanges(journal.applied) }, null, 2));
      return;
    }
    const planned = await planAddressChanges();
    if (!args.has('--apply')) {
      console.log(JSON.stringify({ mode: 'dry-run', writes: 'none', planned }, null, 2));
      return;
    }
    const expected = ADDRESS_SITES.map((site) => site.slug).join(',');
    if (argValue('confirm-sites') !== expected) throw new Error(`Apply fence missing. Pass --confirm-sites=${expected}.`);
    const file = journalPath();
    // The journal always names exactly what has been written, so an interrupted run reverts cleanly.
    const record = (done: AddressChange[]) => fs.writeFileSync(file, JSON.stringify({ planned, applied: done }, null, 2), { mode: 0o600 });
    record([]);
    const applied = await applyAddressChanges(planned, record);
    const remaining = await planAddressChanges();
    if (remaining.length) throw new Error(`Post-apply check failed: ${remaining.map((change) => change.site).join(', ')}`);
    console.log(JSON.stringify({ mode: 'applied', applied, changes: planned }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[network-site-addresses] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
