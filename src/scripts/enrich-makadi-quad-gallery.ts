/**
 * Add the source-backed Marsa Alam Quad Tour gallery without touching any
 * other tenant or tour field.
 *
 * Dry run (no database or upload):
 *   npm run enrich:makadi-quad-gallery
 * Apply to the exact tenant and tour:
 *   npm run enrich:makadi-quad-gallery -- --apply --confirm-tenant=makadi-excursions
 */

const SOURCE_HOST = 'www.makadi-excursions.com';
const SOURCE_PREFIX = '/wp-content/uploads/';
const TENANT_SLUG = 'makadi-excursions';
const TOUR_SLUG = 'makadi-excursions-marsa-alam-quad-tour';
const TOUR_PATH_SLUG = 'marsa-alam-quad-tour';

export const MAKADI_QUAD_GALLERY_SOURCES = [
  'https://www.makadi-excursions.com/wp-content/uploads/2026/02/3.jpg',
  'https://www.makadi-excursions.com/wp-content/uploads/2026/02/33.jpg',
  'https://www.makadi-excursions.com/wp-content/uploads/2026/02/17.jpg',
  'https://www.makadi-excursions.com/wp-content/uploads/2026/02/6-scaled.jpg',
  'https://www.makadi-excursions.com/wp-content/uploads/2026/02/76-scaled.jpg',
  'https://www.makadi-excursions.com/wp-content/uploads/2026/02/31.jpg',
] as const;

export function validateMakadiQuadGallerySources(sources: readonly string[] = MAKADI_QUAD_GALLERY_SOURCES): string[] {
  const errors: string[] = [];
  if (sources.length !== 6) errors.push('The source gallery must contain exactly six additional images.');
  if (new Set(sources).size !== sources.length) errors.push('The source gallery contains duplicate images.');
  for (const source of sources) {
    try {
      const parsed = new URL(source);
      if (parsed.protocol !== 'https:' || parsed.hostname !== SOURCE_HOST || !parsed.pathname.startsWith(SOURCE_PREFIX)) {
        errors.push(`Source is outside the allowlist: ${source}`);
      }
    } catch {
      errors.push(`Source is not a valid URL: ${source}`);
    }
  }
  return errors;
}

async function mirrorSourceImage(source: string, index: number): Promise<string> {
  const validationErrors = validateMakadiQuadGallerySources([
    ...MAKADI_QUAD_GALLERY_SOURCES.slice(0, index),
    source,
    ...MAKADI_QUAD_GALLERY_SOURCES.slice(index + 1),
  ]);
  if (validationErrors.length) throw new Error(validationErrors.join(' '));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(source, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error(`Source image returned ${response.status}: ${source}`);
    const mimeType = response.headers.get('content-type')?.split(';')[0] || '';
    if (!mimeType.startsWith('image/')) throw new Error(`Source asset is not an image: ${source}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error(`Source image size is invalid: ${source}`);

    const { uploadBase64Image } = await import('../services/upload.service');
    const upload = await uploadBase64Image(
      `data:${mimeType};base64,${bytes.toString('base64')}`,
      `tours/${TENANT_SLUG}/${TOUR_PATH_SLUG}`,
      { publicId: `gallery-${String(index + 2).padStart(2, '0')}`, overwrite: true },
    );
    return upload.url;
  } finally {
    clearTimeout(timeout);
  }
}

async function applyGallery(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (!args.has(`--confirm-tenant=${TENANT_SLUG}`)) {
    throw new Error(`Apply fence missing. Pass --confirm-tenant=${TENANT_SLUG}.`);
  }

  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  await connectDatabase();

  try {
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG }).select('_id slug status').lean();
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_SLUG}`);

    const tour = await Attraction.findOne({ slug: TOUR_SLUG, ownerTenantId: tenant._id })
      .select('_id slug images ownerTenantId')
      .lean();
    if (!tour) throw new Error(`Owned tour not found: ${TOUR_SLUG}`);

    const currentImages = Array.isArray(tour.images) ? tour.images.filter((image): image is string => typeof image === 'string' && Boolean(image)) : [];
    if (!currentImages.length || !currentImages[0].includes('res.cloudinary.com')) {
      throw new Error('Tour primary image is missing or is not a mirrored Cloudinary asset.');
    }
    if (currentImages.length === MAKADI_QUAD_GALLERY_SOURCES.length + 1 && currentImages.every((image) => image.includes('res.cloudinary.com'))) {
      console.log(`[makadi-quad-gallery] No change required. ${currentImages.length} mirrored images are already attached.`);
      return;
    }
    if (currentImages.length !== 1) {
      throw new Error(`Refusing to replace an unexpected partial or curated gallery of ${currentImages.length} images.`);
    }

    const mirroredGallery: string[] = [];
    for (const [index, source] of MAKADI_QUAD_GALLERY_SOURCES.entries()) {
      mirroredGallery.push(await mirrorSourceImage(source, index));
    }
    const nextImages = [currentImages[0], ...mirroredGallery];

    const update = await Attraction.updateOne(
      { _id: tour._id, ownerTenantId: tenant._id, images: currentImages },
      { $set: { images: nextImages } },
      { runValidators: true },
    );
    if (update.modifiedCount !== 1) {
      throw new Error('Tour changed during the gallery update; no database write was applied.');
    }

    const verified = await Attraction.findOne({ _id: tour._id, ownerTenantId: tenant._id }).select('images').lean();
    if (!verified || verified.images?.length !== nextImages.length) {
      throw new Error('Gallery verification failed after the database update.');
    }
    console.log(`[makadi-quad-gallery] Applied and verified ${nextImages.length} images on ${TOUR_SLUG}. Previous gallery size: ${currentImages.length}.`);
  } finally {
    await disconnectDatabase();
  }
}

export async function main(): Promise<void> {
  const errors = validateMakadiQuadGallerySources();
  if (errors.length) throw new Error(`Gallery plan is invalid:\n- ${errors.join('\n- ')}`);

  const args = new Set(process.argv.slice(2));
  if (!args.has('--apply')) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      tenant: TENANT_SLUG,
      tour: TOUR_SLUG,
      existingPrimaryImage: 'preserved',
      additionalSourceImages: MAKADI_QUAD_GALLERY_SOURCES.length,
      mutationScope: ['one owned tour', 'images field only'],
      safeguards: ['no database connection', 'no upload', 'tenant fence required', 'optimistic concurrency check', 'retry-stable asset ids'],
    }, null, 2));
    return;
  }

  await applyGallery();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[makadi-quad-gallery] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
