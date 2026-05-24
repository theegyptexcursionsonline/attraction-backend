/**
 * Apply the real shared boat photos to the fleet tenants.
 *
 * Fouad shared the boats' real photo library (~/Documents/sunmarine folder).
 * The strongest landscape shots per boat were curated + optimised into
 * /tmp/sunmarine-stage/<key>-upload (HEIC converted to JPEG, resized to 1600px).
 * This uploads them to Cloudinary and repoints each boat tenant's heroImages
 * and every boat tour's images array to the real photos (replacing the earlier
 * AI-generated / cropped placeholders). Boat tours are shared with the Egypt
 * Sunmarine portfolio, so the mother site's galleries pick these up too.
 *
 * Touches only the 5 boat tenants + their tours. Run via:
 *   npx ts-node src/scripts/apply-real-boat-photos.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { env } from '../config/env';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
});

const STAGE = '/tmp/sunmarine-stage';
const TOUR_GALLERY_SIZE = 4;

const BOATS: Array<{ key: string; slug: string }> = [
  { key: 'seascope', slug: 'royal-seascope' },
  { key: 'pirates', slug: 'pirates-premier-sailing' },
  { key: 'nefertari', slug: 'nefertari-cruise' },
  { key: 'elitevip', slug: 'elite-vip-cruise' },
  { key: 'classic', slug: 'rosetta-classic-boat' },
];

async function uploadBoat(slug: string, dir: string): Promise<string[]> {
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.jpg')).sort();
  const urls: string[] = [];
  for (const f of files) {
    const publicId = `${slug}-real-${path.basename(f, '.jpg')}`;
    const res = await cloudinary.uploader.upload(path.join(dir, f), {
      folder: `attractions-network/tenant-heroes/${slug}/real`,
      public_id: publicId,
      overwrite: true,
      resource_type: 'image',
    });
    urls.push(res.secure_url);
    console.log(`    ↑ ${f}`);
  }
  return urls;
}

async function main(): Promise<void> {
  await connectDatabase();
  try {
    for (const boat of BOATS) {
      const dir = `${STAGE}/${boat.key}-upload`;
      console.log(`\n${boat.slug}:`);
      if (!fs.existsSync(dir)) {
        console.log('  ✗ no staged dir — skipped');
        continue;
      }

      const urls = await uploadBoat(boat.slug, dir);
      if (urls.length === 0) {
        console.log('  ✗ nothing uploaded');
        continue;
      }

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const tenant = await Tenant.findOne({ slug: boat.slug });
      if (!tenant) {
        console.log('  ✗ tenant not found');
        continue;
      }
      (tenant as any).heroImages = urls;
      await tenant.save();
      console.log(`  ✓ heroImages set (${urls.length} real photos)`);

      const tours = await Attraction.find({ tenantIds: tenant._id });
      for (let i = 0; i < tours.length; i++) {
        const tour: any = tours[i];
        // Rotate the photo set per tour for gallery variety.
        const rotated = urls.map((_, j) => urls[(i + j) % urls.length]);
        tour.images = rotated.slice(0, Math.min(TOUR_GALLERY_SIZE, urls.length));
        await tour.save();
      }
      console.log(`  ✓ ${tours.length} tours repointed to real photos`);
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }
    console.log('\n✅ Real boat photos applied across the fleet.\n');
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
