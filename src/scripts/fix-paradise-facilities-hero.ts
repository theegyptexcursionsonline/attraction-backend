/**
 * Replace the stock photograph on Paradise Island's facilities page.
 *
 * The seed mirrored the archived "Plan-of-Paradise-Island-Hurghada.jpg" as the facilities page
 * hero, described as a plan of the island. The file is a stock photograph of wooden blocks
 * reading "GOAL PLAN ACTION", so both the picture and its description were wrong. The page now
 * uses the site's own beach photograph (site header 3, the painted surfboards, umbrellas and
 * swing), which is already uploaded, with a description of what it shows.
 *
 * Only the facilities page hero and its description change, and only while the page still holds
 * the stock image. A journal records the previous values so the change can be undone exactly.
 *
 * Dry run (read-only, the default):
 *   npx ts-node src/scripts/fix-paradise-facilities-hero.ts
 * Apply:
 *   npx ts-node src/scripts/fix-paradise-facilities-hero.ts --apply --confirm-tenant=paradise-island-hurghada --journal=<file outside the repository>
 * Undo:
 *   npx ts-node src/scripts/fix-paradise-facilities-hero.ts --revert --journal=<the same file>
 */

import fs from 'fs';
import path from 'path';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';

export const PARADISE_SLUG = 'paradise-island-hurghada';
export const FACILITIES_PAGE = 'facilities';
/** Recognised by path, not full URL: the version segment differs per upload. */
export const STOCK_IMAGE_PATH = '/attractions-network/pages/paradise-island-hurghada/facilities/';
export const REPLACEMENT_HEADER_PATH = '/attractions-network/tenant-heroes/paradise-island-hurghada/3/';
export const REPLACEMENT_ALT = 'Painted surfboards, straw umbrellas and a swing along the beach on Paradise Island';

export interface HeroSwap {
  from: { heroImage: string; heroImageAlt: string | null };
  to: { heroImage: string; heroImageAlt: string };
}

/** Read-only: the swap to make, or null when the page no longer holds the stock image. */
export async function planHeroSwap(): Promise<HeroSwap | null> {
  const tenant = await Tenant.findOne({ slug: PARADISE_SLUG }).select('slug designMode heroImages customPages').lean();
  if (!tenant || tenant.designMode !== 'paradise') throw new Error('The Paradise Island site was not found in its own design.');
  const page = (tenant.customPages || []).find((candidate) => candidate.slug === FACILITIES_PAGE);
  if (!page) throw new Error('The facilities page was not found.');
  const replacement = (tenant.heroImages || []).find((url: string) => url.includes(REPLACEMENT_HEADER_PATH));
  if (!replacement) throw new Error('Site header 3, the replacement photograph, was not found.');
  if (!page.heroImage || !page.heroImage.includes(STOCK_IMAGE_PATH)) return null;
  return {
    from: { heroImage: page.heroImage, heroImageAlt: page.heroImageAlt ?? null },
    to: { heroImage: replacement, heroImageAlt: REPLACEMENT_ALT },
  };
}

async function setHero(expected: string, next: { heroImage: string; heroImageAlt: string | null }): Promise<void> {
  const result = await Tenant.updateOne(
    { slug: PARADISE_SLUG, customPages: { $elemMatch: { slug: FACILITIES_PAGE, heroImage: expected } } },
    { $set: { 'customPages.$.heroImage': next.heroImage, 'customPages.$.heroImageAlt': next.heroImageAlt } },
  );
  if (result.modifiedCount !== 1) throw new Error('The facilities page changed since it was read; nothing was written.');
}

export async function applyHeroSwap(swap: HeroSwap): Promise<void> {
  await setHero(swap.from.heroImage, swap.to);
}

export async function revertHeroSwap(swap: HeroSwap): Promise<void> {
  await setHero(swap.to.heroImage, swap.from);
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
      const swap = JSON.parse(fs.readFileSync(journalPath(), 'utf8')) as HeroSwap;
      await revertHeroSwap(swap);
      console.log(JSON.stringify({ mode: 'reverted', restored: swap.from }, null, 2));
      return;
    }
    const swap = await planHeroSwap();
    if (!args.has('--apply')) {
      console.log(JSON.stringify({ mode: 'dry-run', writes: 'none', swap }, null, 2));
      return;
    }
    if (argValue('confirm-tenant') !== PARADISE_SLUG) throw new Error(`Apply fence missing. Pass --confirm-tenant=${PARADISE_SLUG}.`);
    if (!swap) {
      console.log(JSON.stringify({ mode: 'applied', changed: false, reason: 'the page no longer holds the stock image' }, null, 2));
      return;
    }
    const file = journalPath();
    fs.writeFileSync(file, JSON.stringify(swap, null, 2), { mode: 0o600 });
    await applyHeroSwap(swap);
    if (await planHeroSwap()) throw new Error('Post-apply check failed: the stock image is still on the page.');
    console.log(JSON.stringify({ mode: 'applied', changed: true, swap }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[paradise-facilities-hero] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
