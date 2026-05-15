/**
 * Generate 3 hero images for the Royal SeaScope tenant homepage.
 * Persists URLs to tenant.heroImages.
 *
 * Usage:
 *   npx ts-node src/scripts/generate-royal-seascope-hero-images.ts
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { generateImageFromPrompt } from '../services/image-generation.service';
import { uploadBase64Image } from '../services/upload.service';

const TENANT_SLUG = 'royal-seascope';

const HERO_PROMPTS = [
  {
    name: 'hero-1-yellow-submarine-cinematic',
    prompt:
      "Cinematic wide cross-section photograph of a yellow semi-submarine on the turquoise Red Sea in Hurghada Egypt, half above water and half below, sixteen panoramic underwater windows visible below the waterline showing the coral reef and tropical fish, families inside looking through the glass, bright sunshine on the upper deck, photorealistic professional travel photography, vivid colour grading, 16:9.",
  },
  {
    name: 'hero-2-underwater-window-family',
    prompt:
      "Intimate cinematic photograph from inside a semi-submarine cabin, a family with two children pressing their faces against a panoramic underwater window watching a sea turtle drift past, coral garden visible beyond the glass, blue ambient cabin lighting, photorealistic professional travel photography, warm family emotion, 16:9.",
  },
  {
    name: 'hero-3-fleet-aerial-cities',
    prompt:
      "Aerial drone photograph of three yellow Royal SeaScope semi-submarines sailing in formation across the turquoise Red Sea in Egypt, coral reef patterns visible just below the surface, sandy desert coastline on the right, photorealistic professional aerial travel photography, vivid colour, 16:9.",
  },
];

async function generateAndUpload(prompt: string, folder: string, filename: string): Promise<string | null> {
  try {
    console.log(`  Generating ${filename}...`);
    const { base64, mimeType } = await generateImageFromPrompt({
      prompt,
      size: '1536x1024',
      quality: 'high',
      outputFormat: 'jpeg',
    });
    const dataUri = `data:${mimeType};base64,${base64}`;
    const uploaded = await uploadBase64Image(dataUri, folder);
    console.log(`  ✅ ${uploaded.url}`);
    return uploaded.url;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : err && typeof err === 'object' ? JSON.stringify(err) : String(err);
    console.error(`  ❌ ${filename} failed: ${msg}`);
    return null;
  }
}

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG });
    if (!tenant) {
      console.error(`Tenant '${TENANT_SLUG}' not found. Run seed-royal-seascope-tenant.ts first.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Tenant: ${tenant.name} (_id=${tenant._id})\n`);

    console.log('=== Generating 3 hero images (high quality) ===');
    const heroUrls: string[] = [];
    for (const hero of HERO_PROMPTS) {
      const url = await generateAndUpload(hero.prompt, `tenant-heroes/${TENANT_SLUG}`, hero.name);
      if (url) heroUrls.push(url);
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (heroUrls.length === 0) {
      console.error('\n❌ No hero images generated — leaving tenant.heroImages unchanged.');
      process.exitCode = 1;
      return;
    }

    await Tenant.updateOne({ _id: tenant._id }, { $set: { heroImages: heroUrls } });
    console.log(`\n✅ Tenant updated. heroImages count: ${heroUrls.length}`);
    heroUrls.forEach((u, i) => console.log(`   [${i + 1}] ${u}`));
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
