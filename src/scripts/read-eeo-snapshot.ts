/**
 * Adds trips the client publishes on egypt-excursionsonline.com to the dated snapshot the network seed copies from
 * (`network-sites/eeo-snapshot.json`), read through `network-sites/eeo-reader.ts`. GET requests only, one trip at a
 * time, two seconds apart. A trip already in the snapshot is left exactly as it is: re-reading one is a separate,
 * reviewed change, because the seed refuses a trip whose live options drifted from what was reviewed.
 *
 *   npm run read:eeo-snapshot -- --add=<slug>,<slug>          print what would be added
 *   npm run read:eeo-snapshot -- --add=<slug>,<slug> --write  add them to the snapshot
 */

import fs from 'fs';
import path from 'path';
import { readEeoTour } from './network-sites/eeo-reader';
import type { EeoSnapshot, EeoTour } from './network-sites/eeo-source';

const SNAPSHOT = path.join(__dirname, 'network-sites', 'eeo-snapshot.json');
const PAUSE_MS = 2000;

const pause = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** One trip, read again after a pause when the connection drops (the client's site cuts long sessions). */
async function readWithRetries(slug: string, readAt: string, attempts = 3): Promise<EeoTour> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await readEeoTour(slug, readAt);
    } catch (error) {
      if (attempt >= attempts) throw error;
      console.log(`retry  ${slug} (${error instanceof Error ? error.message : String(error)})`);
      await pause(PAUSE_MS * 3 * attempt);
    }
  }
}

/** The snapshot with the new trips appended in the order given, every existing entry untouched. */
export function withTrips(snapshot: EeoSnapshot, added: EeoTour[]): EeoSnapshot {
  const known = new Set(snapshot.tours.map((tour) => tour.slug));
  return { ...snapshot, tours: [...snapshot.tours, ...added.filter((tour) => !known.has(tour.slug))] };
}

async function main(): Promise<void> {
  const arg = process.argv.slice(2).find((item) => item.startsWith('--add='));
  const slugs = (arg ? arg.slice('--add='.length) : '').split(',').map((slug) => slug.trim()).filter(Boolean);
  if (!slugs.length) throw new Error('Pass --add=<slug>,<slug>.');
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) as EeoSnapshot;
  const known = new Set(snapshot.tours.map((tour) => tour.slug));
  const readAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const added: EeoTour[] = [];
  for (const slug of slugs) {
    if (known.has(slug)) { console.log(`kept   ${slug} (already in the snapshot)`); continue; }
    if (added.length) await pause(PAUSE_MS);
    const tour = await readWithRetries(slug, readAt);
    added.push(tour);
    console.log(`read   ${slug}: ${tour.options.length} option(s), ${tour.addons.length} extra(s), ${tour.detail.pricingSummary?.currency || 'no currency'}`);
  }
  if (!process.argv.includes('--write')) { console.log(`dry run: ${added.length} trip(s) would be added. Pass --write to save.`); return; }
  // The snapshot is kept one space to a level with no closing newline, as it was first written.
  fs.writeFileSync(SNAPSHOT, JSON.stringify(withTrips(snapshot, added), null, 1));
  console.log(`wrote ${added.length} trip(s) to ${path.relative(process.cwd(), SNAPSHOT)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[eeo-snapshot] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
