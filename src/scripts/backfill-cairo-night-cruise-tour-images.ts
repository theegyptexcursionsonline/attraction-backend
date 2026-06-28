/**
 * Backfill cover images on the 8 Cairo Night Cruise dinner cruises whose
 * `images` arrays are empty. Re-runs generateImageFromPrompt + uploadBase64Image
 * for each, updates the Attraction document in place.
 *
 * Use this after the initial seed-cairo-night-cruise-tours.ts run failed to
 * upload covers (Cloudinary disabled, transient network issue, etc.).
 *
 * Idempotent: skips any cruise that already has at least one image. Safe to
 * re-run after Cloudinary is restored.
 *
 * Usage:
 *   npx ts-node src/scripts/backfill-cairo-night-cruise-tour-images.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Attraction } from '../models/Attraction';
import { generateImageFromPrompt } from '../services/image-generation.service';
import { uploadBase64Image } from '../services/upload.service';

const SLUGS_WITH_PROMPTS: Array<{ slug: string; prompt: string }> = [
  {
    slug: 'sunset-felucca-dinner',
    prompt: 'Cinematic golden-hour photograph of a traditional Egyptian felucca sailboat on the Nile in Cairo at sunset, low warm orange light, the Cairo Tower visible on the horizon, guests dining at small tables on the foredeck under a string of warm bistro lights, photorealistic professional travel photography, sky transitioning from peach to deep blue, 16:9.',
  },
  {
    slug: 'classic-5-course-nile-dinner',
    prompt: 'Elegant cinematic photograph of a candlelit dinner table on a traditional Egyptian felucca at night on the Nile, Cairo skyline lit up in the background with the Cairo Tower glowing gold, five-course Egyptian-Mediterranean dishes plated artfully, warm bistro lights strung along the boats rigging above, photorealistic professional travel photography, rich warm color palette, 16:9.',
  },
  {
    slug: 'couples-anniversary-cruise',
    prompt: 'Intimate romantic photograph of a candlelit private dinner for two on the bow of a traditional Egyptian felucca at night on the Nile, couple silhouetted against Cairo city lights glowing gold across the river, rose petals scattered on white linen tablecloth, two flutes of champagne, photorealistic professional travel photography, deep warm cinematic color palette, 16:9.',
  },
  {
    slug: 'tanoura-folkloric-dinner',
    prompt: 'Cinematic photograph of a traditional Egyptian tanoura whirling dervish dancer performing on the foredeck of a felucca at night on the Nile, full colourful skirts spinning in motion blur, warm bistro lights strung above, guests watching from candlelit dinner tables in the background, Cairo lights across the river, photorealistic professional cultural photography, vibrant warm color palette, 16:9.',
  },
  {
    slug: 'private-yacht-charter',
    prompt: 'Cinematic photograph of a private party of friends gathered on a traditional Egyptian felucca at night on the Nile, candlelit dinner table with multiple guests laughing, warm bistro lights overhead, Cairo skyline lit up gold across the water, photorealistic professional event photography, warm cinematic color palette, 16:9.',
  },
  {
    slug: 'family-cruise-kids-menu',
    prompt: 'Cinematic photograph of an Egyptian family with two children dining on a traditional felucca on the Nile at night, kids drawing at a small low table on the deck, parents at the main table behind, warm bistro lights overhead, Cairo skyline reflected on the water, photorealistic warm family travel photography, 16:9.',
  },
  {
    slug: 'ramadan-iftar-cruise',
    prompt: 'Cinematic photograph of a traditional Ramadan iftar dinner on a felucca on the Nile at sunset, table set with dates, lentil soup, and Egyptian dishes, fanous lanterns strung throughout the boat in golds and reds and greens, soft warm sunset light, photorealistic professional cultural photography, rich warm color palette, 16:9.',
  },
  {
    slug: 'late-night-jazz-felucca',
    prompt: 'Moody cinematic photograph of a small jazz quartet performing on the foredeck of a felucca at night, piano keyboard and stand-up bass visible, warm spotlight on the musicians, the Cairo Tower lit gold in the distance, intimate adult guests with cocktails, photorealistic professional jazz-club photography, deep moody color palette, 16:9.',
  },
];

async function main(): Promise<void> {
  await connectDatabase();
  try {
    let filled = 0;
    let skipped = 0;
    let failed = 0;
    let i = 0;

    for (const { slug, prompt } of SLUGS_WITH_PROMPTS) {
      i++;
      const a = await Attraction.findOne({ slug });
      if (!a) {
        console.log(`[${i}/${SLUGS_WITH_PROMPTS.length}] MISS  ${slug} (not in DB)`);
        skipped++;
        continue;
      }
      if (Array.isArray(a.images) && a.images.length > 0 && a.images[0]) {
        console.log(`[${i}/${SLUGS_WITH_PROMPTS.length}] SKIP  ${slug} (already has image)`);
        skipped++;
        continue;
      }

      console.log(`[${i}/${SLUGS_WITH_PROMPTS.length}] ${slug}`);
      try {
        console.log(`  Generating image…`);
        const { base64, mimeType } = await generateImageFromPrompt({
          prompt,
          size: '1536x1024',
          quality: 'medium',
          outputFormat: 'jpeg',
        });
        const dataUri = `data:${mimeType};base64,${base64}`;
        const uploaded = await uploadBase64Image(dataUri, `tours/${slug}`);
        a.images = [uploaded.url];
        await a.save();
        console.log(`  ✅ ${uploaded.url}`);
        filled++;
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : err && typeof err === 'object'
              ? JSON.stringify(err)
              : String(err);
        console.error(`  ❌ failed: ${msg}`);
        failed++;
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(`\nDone. Filled: ${filled}, Skipped: ${skipped}, Failed: ${failed}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
