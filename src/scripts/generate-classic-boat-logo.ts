/**
 * Generate a clean Rosetta II / Classic Boat wordmark logo (the deck has
 * no separate logo card for Classic) and persist the Cloudinary URL onto
 * tenant.logo. Calls OpenAI gpt-image-1.5 directly (the shared image
 * service strips text from prompts).
 *
 * Usage:
 *   npx ts-node src/scripts/generate-classic-boat-logo.ts
 */

import { v2 as cloudinary } from 'cloudinary';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Tenant } from '../models/Tenant';
import { env } from '../config/env';

const TENANT_SLUG = 'rosetta-classic-boat';

const LOGO_PROMPT = `Premium minimalist brand logo for "ROSETTA II" — a classic Red Sea snorkeling-boat fleet.
A simple clean horizontal lockup: the words "ROSETTA II" set in an elegant maritime serif, uppercase, deep navy (#1B3F73), perfectly kerned.
Directly below in a smaller refined sans-serif: the words "CLASSIC BOAT · RED SEA" in sky blue (#6BAED6), letter-spaced.
To the left of the wordmark, a small simple line-art emblem of a classic motor yacht silhouette in the same navy, single weight, no detail clutter.
Background: pure flat white, no scene, no gradient, no shadow.
High-resolution vector aesthetic, crisp clean edges, no photographic texture, no watermark, perfectly readable text, professional maritime travel-brand identity, centered, generous whitespace.`;

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
});

async function generateLogoBase64(): Promise<string> {
  if (!env.openaiApiKey) throw new Error('OPENAI_API_KEY is not configured');
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.openaiApiKey}` },
    body: JSON.stringify({
      model: 'gpt-image-1.5',
      prompt: LOGO_PROMPT,
      size: '1024x1024',
      quality: 'high',
      output_format: 'png',
    }),
  });
  const payload = (await response.json()) as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || 'OpenAI image generation failed');
  const base64 = payload.data?.[0]?.b64_json;
  if (!base64) throw new Error('OpenAI did not return image data');
  return base64;
}

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG });
    if (!tenant) {
      console.error(`Tenant '${TENANT_SLUG}' not found. Run seed-classic-boat-tenant.ts first.`);
      process.exitCode = 1;
      return;
    }
    console.log('=== Generating Rosetta II / Classic Boat logo ===');
    const base64 = await generateLogoBase64();
    const uploaded = await cloudinary.uploader.upload(`data:image/png;base64,${base64}`, {
      folder: `attractions-network/tenant-logos/${TENANT_SLUG}`,
      resource_type: 'image',
      transformation: [{ quality: 'auto:best' }, { fetch_format: 'auto' }],
    });
    console.log(`✅ Uploaded: ${uploaded.secure_url}`);
    await Tenant.updateOne({ _id: tenant._id }, { $set: { logo: uploaded.secure_url } });
    console.log(`✅ tenant.logo updated → ${uploaded.secure_url}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabase();
  process.exit(1);
});
