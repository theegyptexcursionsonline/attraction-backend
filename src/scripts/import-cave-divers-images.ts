/**
 * Attach Cave Divers' OWN photographs to the Cave Divers catalogue.
 *
 * Every image is fetched from the operator's own website, uploaded through the
 * platform upload service, and persisted only as the URL that upload returns
 * (rule B6 — never a hand-written asset path). Nothing is taken from the four
 * comparison suppliers named at intake, or from any other third party.
 *
 * Deliberately excluded from the manifest below:
 *   - photographs of children and other identifiable minors
 *   - third-party marks (PADI course badges, the TripAdvisor badge, old logos)
 *   - a staff photograph carrying another company's brand on the clothing
 *
 * Rights note: these are the operator's own published photographs. Confirm with
 * the client that they hold the rights before the site is made public; the
 * storefront is code-gated until then.
 *
 * Dry run (no network, database or upload):
 *   npm run images:cave-divers:import
 * Apply:
 *   npm run images:cave-divers:import -- --apply --confirm-tenant=cave-divers --confirm-source=cave-divers.com
 */

import { connectDatabase, disconnectDatabase } from '../config/database';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { uploadBase64Image } from '../services/upload.service';

const TENANT_SLUG = 'cave-divers';
const SOURCE_ORIGIN = 'https://www.cave-divers.com';
const SOURCE_HOST = 'cave-divers.com';
const IMAGE_FOLDER = `tours/${TENANT_SLUG}`;
const MAX_BYTES = 12 * 1024 * 1024;

export interface CaveImageAssignment {
  slug: string;
  /** Paths under /images on the operator's own site. */
  sources: string[];
}

/** Chosen by inspecting every photograph on the operator's site. */
export const CAVE_DIVERS_IMAGE_IMPORT: CaveImageAssignment[] = [
  {
    slug: 'cave-divers-red-sea-daily-diving',
    sources: ['trips-intro.jpg', 'gallery-media/gal08.jpg', 'gallery-media/gal12.jpg', 'gallery-media/gal04.jpg'],
  },
  {
    slug: 'cave-divers-multi-day-daily-diving',
    sources: ['gallery-media/gal16.jpg', 'gallery-media/gal21.jpg', 'gallery-media/gal17.jpg', 'diver+.jpg'],
  },
  {
    slug: 'cave-divers-discover-scuba-diving',
    sources: ['diving.jpeg', 'gallery-media/gal06.png', 'gallery-media/gal04.png', 'gallery-media/gal07.jpg'],
  },
  {
    slug: 'cave-divers-open-water-diver-course',
    sources: ['instructor04.png', 'instructor06.png', 'instructor05.jpg', 'instructor03.png'],
  },
  {
    slug: 'cave-divers-dolphin-house-sea-trip',
    sources: ['gallery-media/gal30.jpg', 'gallery-media/gal22.jpg', 'gallery-media/gal14.jpg', 'gallery-media/gal13.jpg'],
  },
  {
    slug: 'cave-divers-orange-bay-giftun-island',
    sources: ['paraadise.jpg', 'gallery-media/gal35.jpg', 'gallery-media/gal26.jpg', 'gallery-media/gal28.jpg'],
  },
  {
    slug: 'cave-divers-glass-boat-half-day',
    sources: ['snorkeling.jpeg', 'gallery-media/gal19.jpg', 'gallery-media/gal18.jpg', 'gallery-media/gal23.jpg'],
  },
];

/** Wide, scenic frames for the storefront hero rotation. */
export const CAVE_DIVERS_HERO_SOURCES = [
  'trips-intro.jpg',
  'gallery-media/gal35.jpg',
  'gallery-media/gal10.jpg',
  'gallery-media/gal30.jpg',
  'about-media/cave-divers-center01.png',
];

/** Never import these, whatever else changes on the source site. */
const EXCLUDED_PATTERNS = [/client0\d/i, /padi-course/i, /trip-advisor/i, /old-logo/i, /courses-title/i,
  /gal05\./i, /gal37\./i, /instructor01\./i];

export function validateImageImportPlan(): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const all = [...CAVE_DIVERS_IMAGE_IMPORT.flatMap((item) => item.sources), ...CAVE_DIVERS_HERO_SOURCES];

  if (CAVE_DIVERS_IMAGE_IMPORT.length !== 7) errors.push('Every catalogue record needs an image assignment.');
  for (const item of CAVE_DIVERS_IMAGE_IMPORT) {
    if (item.sources.length !== 4) errors.push(`Expected four photographs for ${item.slug}.`);
    for (const source of item.sources) {
      const key = `${item.slug}:${source}`;
      if (seen.has(key)) errors.push(`Duplicate photograph on ${item.slug}: ${source}`);
      seen.add(key);
    }
  }
  for (const source of all) {
    if (source.startsWith('/') || source.includes('..')) errors.push(`Unsafe source path: ${source}`);
    for (const pattern of EXCLUDED_PATTERNS) {
      if (pattern.test(source)) errors.push(`Excluded photograph must not be imported: ${source}`);
    }
  }
  return errors;
}

/** Deterministic id so a re-run replaces the same asset instead of duplicating. */
export function assetPublicId(slug: string, index: number): string {
  return `${slug}-${String(index + 1).padStart(2, '0')}`;
}

async function fetchSourceImage(source: string): Promise<string> {
  const url = `${SOURCE_ORIGIN}/images/${source}`;
  if (new URL(url).hostname !== `www.${SOURCE_HOST}`) throw new Error(`Refusing a non-first-party source: ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error(`${url} is not an image (${type})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error(`${url} returned an empty body`);
  if (buffer.length > MAX_BYTES) throw new Error(`${url} is larger than the ${MAX_BYTES} byte ceiling`);
  return `data:${type};base64,${buffer.toString('base64')}`;
}

async function applyPlan(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (!args.has(`--confirm-tenant=${TENANT_SLUG}`) || !args.has(`--confirm-source=${SOURCE_HOST}`)) {
    throw new Error(`Apply fence missing. Pass --confirm-tenant=${TENANT_SLUG} and --confirm-source=${SOURCE_HOST}.`);
  }

  await connectDatabase();
  try {
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG }).select('_id slug heroImages');
    if (!tenant) throw new Error('Cave Divers tenant not found.');

    const uploaded = new Map<string, string>();
    const upload = async (source: string, publicId: string): Promise<string> => {
      const cached = uploaded.get(publicId);
      if (cached) return cached;
      const dataUri = await fetchSourceImage(source);
      const result = await uploadBase64Image(dataUri, IMAGE_FOLDER, { publicId, overwrite: true });
      if (!result?.url) throw new Error(`Upload returned no URL for ${source}`);
      uploaded.set(publicId, result.url);
      return result.url;
    };

    let touched = 0;
    for (const item of CAVE_DIVERS_IMAGE_IMPORT) {
      const record = await Attraction.findOne({ slug: item.slug, ownerTenantId: tenant._id }).select('_id slug images');
      if (!record) {
        console.log(`  ✗ ${item.slug} not found for this tenant — skipped`);
        continue;
      }
      const urls: string[] = [];
      for (const [index, source] of item.sources.entries()) {
        urls.push(await upload(source, assetPublicId(item.slug, index)));
      }
      const result = await Attraction.updateOne(
        { _id: record._id, ownerTenantId: tenant._id },
        { $set: { images: urls } },
      );
      touched += result.modifiedCount;
      console.log(`  ✓ ${item.slug} — ${urls.length} photographs`);
    }

    const heroImages: string[] = [];
    for (const [index, source] of CAVE_DIVERS_HERO_SOURCES.entries()) {
      heroImages.push(await upload(source, `${TENANT_SLUG}-hero-${String(index + 1).padStart(2, '0')}`));
    }
    await Tenant.updateOne({ _id: tenant._id, slug: TENANT_SLUG }, { $set: { heroImages } });

    const withImages = await Attraction.countDocuments({
      ownerTenantId: tenant._id,
      images: { $exists: true, $not: { $size: 0 } },
    });
    console.log(JSON.stringify({
      mode: 'applied',
      records: { updated: touched, carryingImages: withImages, expected: CAVE_DIVERS_IMAGE_IMPORT.length },
      heroImages: heroImages.length,
      safeguards: [
        'every photograph came from the operator\'s own website',
        'URLs persisted only as returned by the platform upload service',
        'no comparison-supplier, stock or third-party imagery',
        'no photographs of minors, and no third-party brand marks',
      ],
    }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

export async function main(): Promise<void> {
  const errors = validateImageImportPlan();
  if (errors.length) throw new Error(`Image import plan is invalid:\n- ${errors.join('\n- ')}`);

  if (!new Set(process.argv.slice(2)).has('--apply')) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      source: SOURCE_ORIGIN,
      records: CAVE_DIVERS_IMAGE_IMPORT.map((item) => ({ slug: item.slug, photographs: item.sources.length })),
      heroImages: CAVE_DIVERS_HERO_SOURCES.length,
      totalUploads: CAVE_DIVERS_IMAGE_IMPORT.length * 4 + CAVE_DIVERS_HERO_SOURCES.length,
      safeguards: ['no network fetch', 'no database connection', 'no upload'],
    }, null, 2));
    return;
  }
  await applyPlan();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[cave-divers-images] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
