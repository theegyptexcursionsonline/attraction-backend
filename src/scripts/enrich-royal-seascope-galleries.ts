/**
 * Enrich Royal SeaScope tour galleries.
 *
 * SeaScope tours were seeded with a single cover image each, while the other
 * fleet boats (Pirates, Nefertari, Elite VIP, Classic) carry 3–4 gallery
 * photos per tour. Fouad asked for the boats' shared photo galleries to be
 * used on the boat sites. The royal-seascope tenant already holds 5 real
 * shared SeaScope photos in `heroImages` (aerial subs, family-at-window coral,
 * interior cabin, kids at the window). This builds each tour's gallery from
 * the tour's own cover + those shared photos (rotated per tour for variety),
 * targeting 4 images each.
 *
 * Idempotent — re-running leaves already-enriched tours unchanged.
 * Touches ONLY royal-seascope tours. Run via:
 *   npx ts-node src/scripts/enrich-royal-seascope-galleries.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';

const TENANT_SLUG = 'royal-seascope';
const TARGET_COUNT = 4;

async function main(): Promise<void> {
  await connectDatabase();

  try {
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG });
    if (!tenant) {
      console.error(`Tenant '${TENANT_SLUG}' not found.`);
      return;
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const pool: string[] = ((tenant as any).heroImages || []).filter(Boolean);
    if (pool.length === 0) {
      console.error('No heroImages on the tenant to build galleries from — aborting.');
      return;
    }

    const tours = await Attraction.find({ tenantIds: tenant._id });
    console.log(`\n— Royal SeaScope gallery enrichment —`);
    console.log(`Tours: ${tours.length} · shared photo pool: ${pool.length}\n`);

    let updated = 0;
    let unchanged = 0;

    for (let i = 0; i < tours.length; i++) {
      const tour: any = tours[i];
      const existing: string[] = (tour.images || []).filter(Boolean);
      const cover = existing[0];

      // Rotate the shared-photo pool by tour index so galleries differ per tour.
      const rotated = pool.map((_, j) => pool[(i + j) % pool.length]);

      const gallery: string[] = [];
      for (const url of [cover, ...rotated]) {
        if (url && !gallery.includes(url)) gallery.push(url);
        if (gallery.length >= TARGET_COUNT) break;
      }

      if (gallery.length > existing.length) {
        tour.images = gallery;
        await tour.save();
        updated += 1;
        console.log(`  ✓ ${String(tour.slug).padEnd(42)} ${existing.length} → ${gallery.length} images`);
      } else {
        unchanged += 1;
        console.log(`  • ${String(tour.slug).padEnd(42)} ${existing.length} images (no change)`);
      }
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    console.log(`\n✅ Done — ${updated} enriched, ${unchanged} unchanged (of ${tours.length}).\n`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
