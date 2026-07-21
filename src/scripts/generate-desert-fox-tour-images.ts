/**
 * Generate real images for the 8 legacy Desert Fox Safari tours whose seeded
 * Cloudinary URLs (attractions-network/tours/desert-fox-safari/*.jpg) were
 * never uploaded — every one 404s, so their cards render blank anywhere they
 * appear (2026-07-21 sweep finding).
 *
 * gpt-image-1.5 → Cloudinary upload → replaces the dead images on the record.
 * Idempotent + verify-first: only touches the exact slugs below, and only
 * when the current first image still points at the dead path.
 *
 * Usage: railway run -- npx ts-node src/scripts/generate-desert-fox-tour-images.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Attraction } from '../models/Attraction';
import { generateImageFromPrompt } from '../services/image-generation.service';
import { uploadBase64Image } from '../services/upload.service';

const DEAD_IMAGE_MARKER = '/tours/desert-fox-safari/';
const FOLDER = 'attractions-network/tours/desert-fox-safari';
const STYLE =
  'photorealistic, professional tourism photography, warm golden light, Hurghada Eastern Desert, Egypt, no text or watermarks';

const TOURS: Record<string, string> = {
  'desert-fox-full-day-sahara-expedition': `Full-day desert safari expedition convoy of 4x4 jeeps and quad bikes crossing dramatic golden sand dunes, Bedouin camp with tents in the distance, ${STYLE}`,
  'desert-fox-sandboarding-adventure': `Sandboarder carving down a tall golden dune with a spray of sand, boards and excited group waiting at the crest, ${STYLE}`,
  'desert-fox-private-jeep-safari': `Private open-top 4x4 jeep driving through rugged desert mountains at golden hour, dust trail behind, driver and couple enjoying the ride, ${STYLE}`,
  'desert-fox-stargazing-safari': `Bedouin desert camp at night under a brilliant Milky Way sky, telescope and low cushioned seating around a soft campfire glow, silhouetted dunes, ${STYLE}`,
  'desert-fox-camel-trek-sunset': `Camel caravan with riders trekking along a dune ridge at sunset, long shadows on rippled sand, glowing orange sky, ${STYLE}`,
  'desert-fox-morning-buggy-adventure': `Dune buggy racing over golden morning dunes with sand spraying from the wheels, helmeted driver, clear blue sky, ${STYLE}`,
  'desert-fox-super-safari-combo': `Desert super-safari combo scene: quad bikes, a dune buggy and camels gathered at a Bedouin camp with performers and dinner tables at dusk, ${STYLE}`,
  'desert-fox-sunset-quad-safari': `Quad bikes riding in formation toward a huge setting sun over desert dunes, warm amber light, dust glowing in the backlight, ${STYLE}`,
};

async function main(): Promise<void> {
  await connectDatabase();
  try {
    console.log('\n— Generating images for legacy Desert Fox tours —\n');
    let ok = 0;
    let skipped = 0;
    let failed = 0;
    for (const [slug, prompt] of Object.entries(TOURS)) {
      const tour = await Attraction.findOne({ slug });
      if (!tour) {
        console.log(`  ✗ ${slug} NOT FOUND`);
        continue;
      }
      const img = (tour.images || [])[0] || '';
      console.log(`  ${slug} | status=${tour.status} | img=…${img.slice(-50)}`);
      if (!img.includes(DEAD_IMAGE_MARKER)) {
        console.log('    • SKIPPED — image already replaced');
        skipped += 1;
        continue;
      }
      try {
        const { base64, mimeType } = await generateImageFromPrompt({
          prompt,
          size: '1536x1024',
          quality: 'medium',
          outputFormat: 'jpeg',
        });
        const uploaded = await uploadBase64Image(`data:${mimeType};base64,${base64}`, FOLDER);
        // The whole seeded array points at the same dead path — replace it.
        tour.images = [uploaded.url];
        await tour.save();
        console.log(`    ✓ ${uploaded.url}`);
        ok += 1;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`    ❌ failed: ${msg}`);
        failed += 1;
      }
    }
    console.log(`\nDone: ${ok} generated, ${skipped} skipped, ${failed} failed.\n`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
