/**
 * Fox Marsa Alam tenant and catalogue package.
 *
 * Fox Marsa Alam runs desert trips from Marsa Alam and El Quseir and belongs to the
 * Desert Fox Safari family. Its site moves from a stand-alone build at foxmarsaalam.com
 * onto the network, to be served at foxsafarimarsaalam.com, on the same desertfox design
 * as its sister brand. The brand keeps the name on its own logo.
 *
 * Every fact comes from the operator's own published site (trip descriptions,
 * itineraries, inclusions, notes, contact points, service area). The operator
 * publishes no prices: today every trip is booked as a request with no payment
 * taken. The catalogue therefore launches enquiry-only — each trip shows its full
 * detail and a designed enquiry route, never an invented price — and becomes
 * bookable when the operator confirms a price list. Every unconfirmed point is
 * recorded in `openDecisions` (internal only).
 *
 * Trip slugs carry the `fox-marsa-alam-` prefix so they can never collide on the
 * global slug index; each trip's public address is its short `pathSlug`.
 *
 * The site previews on the shared demo origin behind its access code. The custom
 * domain is attached in a separate step once its DNS points at the network.
 *
 * Dry run (no database or upload):
 *   npm run seed:fox-safari-marsa-alam
 * Read-only collision check against the target database:
 *   npm run seed:fox-safari-marsa-alam -- --check
 * Apply:
 *   npm run seed:fox-safari-marsa-alam -- --apply --confirm-tenant=fox-safari-marsa-alam --preview-code-out=<file outside git>
 */

import fs from 'fs';
import { departureAvailabilityType } from '../utils/departureAvailability';
import { FOX_MARSA_ALAM_TOURS, FOX_MARSA_ALAM_IMG } from './seed-fox-safari-marsa-alam.catalogue';
import type { FoxTour } from './seed-fox-safari-marsa-alam.catalogue';

export type { FoxTour } from './seed-fox-safari-marsa-alam.catalogue';
export { FOX_MARSA_ALAM_TOURS } from './seed-fox-safari-marsa-alam.catalogue';

const TENANT_SLUG = 'fox-safari-marsa-alam';
export const FOX_SLUG_PREFIX = 'fox-marsa-alam-';
const LISTING_PATH = '/safaris';

/** The operator's current site; the only source of facts and imagery for this package. */
export const SOURCE_SITE = 'https://foxmarsaalam.com';

/** Booking alerts stay with the platform inbox until the operator confirms its reservations address. */
const LAUNCH_BOOKING_INBOX = 'theegyptexcursionsonline@gmail.com';

/** The operator's own logo, as published on its current site. */
export const FOX_SOURCE_LOGO = FOX_MARSA_ALAM_IMG.logo;

export const FOX_HERO_SOURCES: string[] = [FOX_MARSA_ALAM_IMG.heroA, FOX_MARSA_ALAM_IMG.heroB, FOX_MARSA_ALAM_IMG.heroC];

/**
 * Network destinations the operator collects from. Only Marsa Alam exists on the
 * network today; El Quseir, Port Ghalib and the other published pickup areas are
 * named in each trip's pickup notes instead of being invented as destinations.
 */
export const FOX_PICKUP_DESTINATION_SLUGS = ['marsa-alam'];

export const FOX_TENANT = {
  slug: TENANT_SLUG,
  name: 'Fox Marsa Alam',
  domain: 'fox-safari-marsa-alam.foxesnetwork.com',
  domainMigrated: false,
  customDomainStatus: 'unconfigured',
  tagline: 'Desert trips from Marsa Alam and El Quseir',
  description: [
    'Fox Marsa Alam is a desert tour operator on the Red Sea coast, part of the Desert Fox Safari family. From the dunes behind Marsa Alam to the heritage tracks of El Quseir, we run half-day and full-day trips that balance adrenaline and culture.',
    'Quad and buggy rides, 4x4 jeep safaris, camel and horse rides and a full Super Safari with a Bedouin dinner. Every desert trip starts with a safety briefing and protective gear, hotel pickup is part of every trip, and our guides speak English, German, Russian, Italian, Czech and Polish.',
  ].join('\n\n'),
  // The Desert Fox family palette: the sister sites read as one company.
  theme: { primaryColor: '#D9612A', secondaryColor: '#2D1810', accentColor: '#F1E5C9' },
  fonts: { heading: 'Cinzel', body: 'Inter' },
  designMode: 'desertfox',
  defaultCurrency: 'EUR',
  defaultLanguage: 'en',
  supportedLanguages: ['en'],
  timezone: 'Africa/Cairo',
  contactInfo: {
    // Published by the operator on foxmarsaalam.com/contact-us.
    email: 'info@foxmarsaalam.com',
    phone: '+20 103 968 8089',
    whatsapp: '+201039688089',
    address: 'Marsa Alam & El Quseir, Red Sea, Egypt',
    supportHours: 'Daily 08:00–21:00',
  },
  socialLinks: {},
  notificationSettings: { bookingEmail: LAUNCH_BOOKING_INBOX },
  pickupDestinationSlugs: FOX_PICKUP_DESTINATION_SLUGS,
  flatUrls: true,
  status: 'active',
  navigation: [
    { label: 'Home', href: '/' },
    { label: 'Trips', href: LISTING_PATH },
    { label: 'About', href: '/about' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Contact', href: '/contact' },
  ],
  seoSettings: {
    metaTitle: 'Fox Marsa Alam | Desert Safaris in Marsa Alam & El Quseir',
    metaDescription:
      'Quad, buggy and 4x4 jeep safaris, camel and horse rides and a Super Safari with Bedouin dinner, with hotel pickup in Marsa Alam and El Quseir.',
    keywords: ['Marsa Alam safari', 'Marsa Alam quad', 'El Quseir desert trip', 'Marsa Alam super safari', 'Marsa Alam buggy'],
  },
  paymentSettings: { enabledGateways: ['pay-later'], ownPaymentGateway: false, stripe: { enabled: false } },
  bundleSettings: { mode: 'off', reason: 'The launch package sells single trips only.' },
  // The AI widgets are being trialled on two sites first; this site switches them on after that sign-off.
  aiSettings: {
    bookingWidget: { enabled: false, position: 'bottom-right', languages: ['en'], autoOpen: false },
    voiceAgent: { enabled: false, languages: ['en'], buttonPosition: 'bottom-right' },
    searchWidget: { enabled: false, placeholder: 'Search quad, buggy, jeep and camel trips', showPopularSearches: true, maxSuggestions: 6 },
  },
} as const;

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{2714}\u{2728}]/u;
const FOREIGN_BRANDS = /GetYourGuide|TripAdvisor|Viator|Booking\.com|Shinetheme/i;
const PROCESS_MARKERS = /\b(seed|preview|placeholder|TODO|lorem|QA|staging|internal|wordpress)\b/i;
/** Claims the operator has not published with evidence behind them. */
const UNBACKED_CLAIMS = /free cancellation|refund within|\bbest\b|premier|award|guaranteed|years of experience|since \d{4}|\d+\s*(?:reviews|travellers)/i;

function customerCopy(tour: FoxTour): string {
  return JSON.stringify([
    tour.title, tour.shortDescription, tour.description, tour.highlights, tour.itinerary,
    tour.inclusions, tour.exclusions, tour.whatToBring, tour.needToKnow, tour.accessibility,
    tour.participantRequirements, tour.seo, tour.pickupNote,
  ]);
}

/**
 * The operator's logo lives in its own media library; every trip photo is embedded on its
 * trip pages from its image host. Each URL in the catalogue was taken from those pages
 * (see `sourceUrls`); this guard only admits the two exact URL shapes.
 */
export function isApprovedSourceAsset(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.search || parsed.hash || parsed.username || parsed.port) return false;
    if (parsed.hostname === 'foxmarsaalam.com') {
      return /^\/wp-content\/uploads\/\d{4}\/\d{2}\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(parsed.pathname);
    }
    if (parsed.hostname === 'i.ibb.co') {
      return /^\/[A-Za-z0-9]{6,10}\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(parsed.pathname);
    }
    return false;
  } catch {
    return false;
  }
}

export function validateFoxMarsaAlamPlan(): string[] {
  const errors: string[] = [];

  if (FOX_TENANT.designMode !== 'desertfox') errors.push('The tenant must use the desertfox family design.');
  if (Object.prototype.hasOwnProperty.call(FOX_TENANT, 'customDomain')) {
    errors.push('The custom domain is attached in its own step, after DNS; it must not be claimed here.');
  }
  if (FOX_TENANT.domainMigrated !== false) errors.push('The tenant must not be marked as serving its own domain.');
  if (FOX_TENANT.paymentSettings.enabledGateways.join() !== 'pay-later') errors.push('Only pay-later is enabled at launch.');
  if (FOX_TENANT.paymentSettings.stripe.enabled) errors.push('No card gateway is configured at launch.');
  if (FOX_TENANT.bundleSettings.mode !== 'off') errors.push('Bundles must stay off.');
  if (FOX_TENANT.notificationSettings.bookingEmail !== LAUNCH_BOOKING_INBOX) errors.push('Booking alerts must stay with the platform inbox.');
  if (Object.values(FOX_TENANT.aiSettings).some((setting) => setting.enabled)) errors.push('AI widgets stay off until the trial sign-off.');
  for (const href of [LISTING_PATH, '/about', '/faq', '/contact']) {
    if (!FOX_TENANT.navigation.some((item) => item.href === href)) errors.push(`Navigation is missing ${href}.`);
  }
  if (!isApprovedSourceAsset(FOX_SOURCE_LOGO)) errors.push('The logo must come from the operator site.');
  if (FOX_HERO_SOURCES.length < 3) errors.push('At least three hero images are required.');
  for (const url of FOX_HERO_SOURCES) if (!isApprovedSourceAsset(url)) errors.push(`Unapproved hero image: ${url}`);
  if (new Set(FOX_HERO_SOURCES).size !== FOX_HERO_SOURCES.length) errors.push('Hero images must be distinct.');

  const slugs = new Set<string>();
  const paths = new Set<string>();
  for (const tour of FOX_MARSA_ALAM_TOURS) {
    const id = tour.slug;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tour.slug)) errors.push(`Invalid slug: ${id}`);
    if (!tour.slug.startsWith(FOX_SLUG_PREFIX)) errors.push(`Slug must carry the brand prefix: ${id}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tour.pathSlug) || tour.pathSlug.startsWith(FOX_SLUG_PREFIX)) errors.push(`Invalid public path: ${id}`);
    if (slugs.has(tour.slug)) errors.push(`Duplicate slug: ${id}`);
    if (paths.has(tour.pathSlug)) errors.push(`Duplicate public path: ${id}`);
    slugs.add(tour.slug);
    paths.add(tour.pathSlug);
    if (!tour.sourceUrls.length || !tour.sourceUrls.every((url) => url.startsWith(SOURCE_SITE))) errors.push(`Every fact must come from the operator site: ${id}`);
    if (tour.sourceImages.length < 2) errors.push(`At least two operator photos are required: ${id}`);
    for (const url of tour.sourceImages) if (!isApprovedSourceAsset(url)) errors.push(`Unapproved image on ${id}: ${url}`);
    if (!tour.openDecisions.some((item) => /price/i.test(item))) errors.push(`The missing price must be recorded as an open decision: ${id}`);
    for (const window of tour.entryWindows) {
      if (!/^\d{2}:\d{2}$/.test(window.startTime)) errors.push(`Invalid departure time on ${id}: ${window.startTime}`);
    }
    const copy = customerCopy(tour);
    if (EMOJI.test(copy)) errors.push(`Emoji in customer copy: ${id}`);
    if (FOREIGN_BRANDS.test(copy)) errors.push(`Foreign brand in customer copy: ${id}`);
    if (PROCESS_MARKERS.test(copy)) errors.push(`Process marker in customer copy: ${id}`);
    if (UNBACKED_CLAIMS.test(copy)) errors.push(`Unbacked claim in customer copy: ${id}`);
    if (!tour.seo.metaTitle || tour.seo.metaTitle.length > 70) errors.push(`SEO title missing or too long: ${id}`);
    if (!tour.seo.metaDescription || tour.seo.metaDescription.length > 165) errors.push(`SEO description missing or too long: ${id}`);
  }
  const tenantCopy = JSON.stringify([FOX_TENANT.tagline, FOX_TENANT.description, FOX_TENANT.seoSettings]);
  if (UNBACKED_CLAIMS.test(tenantCopy) || EMOJI.test(tenantCopy)) errors.push('The tenant copy carries an unbacked claim or an emoji.');
  return errors;
}

const CITY_COORDINATES: Record<FoxTour['city'], { lat: number; lng: number }> = {
  'Marsa Alam': { lat: 25.0676, lng: 34.879 },
  'El Quseir': { lat: 26.1043, lng: 34.2779 },
  Luxor: { lat: 25.6872, lng: 32.6396 },
};

export function buildTourDocument(
  tour: FoxTour,
  index: number,
  images: string[],
  tenantId: unknown,
): Record<string, unknown> {
  return {
    slug: tour.slug,
    pathSlug: tour.pathSlug,
    parentPage: { label: 'Trips', path: LISTING_PATH },
    title: tour.title,
    shortDescription: tour.shortDescription,
    description: tour.description,
    images,
    imageAltTexts: images.map((url, imageIndex) => ({ url, alt: tour.imageAlts[imageIndex] || tour.title })),
    category: tour.category,
    destination: { city: tour.city, country: 'Egypt', coordinates: CITY_COORDINATES[tour.city] },
    ...(tour.duration ? { duration: tour.duration } : {}),
    languages: tour.languages,
    rating: 0,
    reviewCount: 0,
    currency: FOX_TENANT.defaultCurrency,
    // No published price: the trip is visible and enquirable, never sold at an invented price.
    enquiryOnly: true,
    pricingOptions: [],
    addons: [],
    entryWindows: tour.entryWindows,
    itinerary: tour.itinerary,
    participantRequirements: tour.participantRequirements,
    highlights: tour.highlights,
    inclusions: tour.inclusions,
    exclusions: tour.exclusions,
    whatToBring: tour.whatToBring,
    needToKnow: tour.needToKnow,
    accessibility: tour.accessibility,
    gettingThere: [{ mode: tour.hasHotelPickup ? 'Hotel pickup' : 'How you join', description: tour.pickupNote }],
    meetingPoint: {
      address: tour.hasHotelPickup ? 'Your hotel in Marsa Alam, El Quseir or Port Ghalib' : `${tour.city}, Red Sea, Egypt`,
      instructions: tour.pickupNote,
      mapUrl: '',
    },
    instantConfirmation: false,
    mobileTicket: true,
    hasHotelPickup: tour.hasHotelPickup,
    availability: { type: departureAvailabilityType(tour.entryWindows), advanceBooking: 365 },
    seo: tour.seo,
    tenantIds: [tenantId],
    ownerTenantId: tenantId,
    reseller: { enabled: false, value: 0, allowedTenants: [] },
    status: 'active',
    featured: index < 6,
    sortOrder: index + 1,
  };
}

export interface ExistingTourRecord {
  slug: string;
  ownedByFox: boolean;
  hasOwner: boolean;
  listedByOtherTenant: boolean;
}

/**
 * Returns why this run must not write, or null. A slug already used by any other
 * tenant is refused: on a first run there is no tenant yet, so every existing
 * owner is foreign.
 */
export function catalogueCollision(records: ExistingTourRecord[]): string | null {
  for (const record of records) {
    if ((record.hasOwner && !record.ownedByFox) || record.listedByOtherTenant) {
      return `Refusing cross-tenant catalogue overwrite: ${record.slug}.`;
    }
    if (!record.hasOwner) return `Refusing to adopt an unowned catalogue record: ${record.slug}.`;
  }
  return null;
}

async function mirrorSourceImage(url: string, folder: string): Promise<string> {
  if (!isApprovedSourceAsset(url)) throw new Error(`Refusing non-allowlisted asset: ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error(`Source image returned ${response.status}: ${url}`);
    const mimeType = response.headers.get('content-type')?.split(';')[0] || '';
    if (!mimeType.startsWith('image/')) throw new Error(`Source asset is not an image: ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error(`Source image size is invalid: ${url}`);
    const { uploadBase64Image } = await import('../services/upload.service');
    const upload = await uploadBase64Image(`data:${mimeType};base64,${bytes.toString('base64')}`, folder);
    return upload.url;
  } finally {
    clearTimeout(timeout);
  }
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function loadExisting() {
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const existingTenant = await Tenant.findOne({ slug: TENANT_SLUG }).select('+previewAccessCode +previewAccessCodeUpdatedAt');
  const namespaceConflict = await Tenant.findOne({
    _id: { $ne: existingTenant?._id },
    $or: [{ domain: FOX_TENANT.domain }, { slug: TENANT_SLUG }],
  }).select('_id slug');
  const existingTours = await Attraction.find({ slug: { $in: FOX_MARSA_ALAM_TOURS.map((tour) => tour.slug) } })
    .select('_id slug ownerTenantId tenantIds images status')
    .lean();
  const collision = catalogueCollision(existingTours.map((record) => ({
    slug: record.slug,
    ownedByFox: Boolean(existingTenant && record.ownerTenantId && String(record.ownerTenantId) === String(existingTenant._id)),
    hasOwner: Boolean(record.ownerTenantId),
    listedByOtherTenant: (record.tenantIds || []).some((id: unknown) => !existingTenant || String(id) !== String(existingTenant._id)),
  })));
  return { existingTenant, namespaceConflict, existingTours, collision };
}

async function checkPlan(): Promise<void> {
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  await connectDatabase();
  try {
    const { existingTenant, namespaceConflict, existingTours, collision } = await loadExisting();
    console.log(JSON.stringify({
      mode: 'check',
      tenant: existingTenant
        ? { action: 'update', status: existingTenant.status, designMode: existingTenant.designMode }
        : { action: 'create', slug: TENANT_SLUG },
      namespaceConflict: namespaceConflict ? namespaceConflict.slug : null,
      existingTourSlugs: existingTours.map((record) => record.slug),
      collision,
      writes: 'none',
    }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

async function applyPlan(): Promise<void> {
  if (!process.argv.includes(`--confirm-tenant=${TENANT_SLUG}`)) {
    throw new Error(`Apply fence missing. Pass --confirm-tenant=${TENANT_SLUG}.`);
  }
  const codeOut = argValue('preview-code-out');
  if (!codeOut) throw new Error('Pass --preview-code-out=<file outside the repository> to receive the access code.');

  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const { generatePreviewAccessCode } = await import('../utils/hash');
  const { urlNamespaceReadiness } = await import('../plugins/urlNamespace');

  // The trips claim public addresses, which the namespace guard refuses while
  // writes are paused. Fail before the first write so the run does all or nothing.
  if (!urlNamespaceReadiness().writesReady) {
    throw new Error('URL namespace writes are paused in this environment. Nothing was written.');
  }

  await connectDatabase();
  try {
    const { existingTenant, namespaceConflict, existingTours, collision } = await loadExisting();
    if (existingTenant && !['active', 'coming_soon', 'pending'].includes(existingTenant.status)) {
      throw new Error(`Refusing to change a tenant in protected status: ${existingTenant.status}.`);
    }
    if (existingTenant?.domainMigrated) throw new Error('Tenant already serves its own domain. Refusing a launch-package rewrite.');
    if (namespaceConflict) throw new Error(`The namespace is already owned by another tenant: ${namespaceConflict.slug}.`);
    if (collision) throw new Error(collision);

    console.log(JSON.stringify({
      mode: 'pre-apply-report',
      tenant: existingTenant ? { action: 'update', status: existingTenant.status } : { action: 'create', slug: TENANT_SLUG },
      customDomain: { value: null, reason: 'attached after DNS, in its own step' },
      catalogue: FOX_MARSA_ALAM_TOURS.map((tour) => ({
        slug: tour.slug,
        path: `/${tour.pathSlug}`,
        action: existingTours.some((record) => record.slug === tour.slug) ? 'update' : 'create',
        enquiryOnly: true,
        images: tour.sourceImages.length,
      })),
    }, null, 2));

    // Images first: a failed upload leaves the database untouched.
    const mirrored = new Map<string, string>();
    const mirror = async (url: string, folder: string): Promise<string> => {
      const hit = mirrored.get(url);
      if (hit) return hit;
      const uploaded = await mirrorSourceImage(url, folder);
      mirrored.set(url, uploaded);
      return uploaded;
    };

    const logo = existingTenant?.logo?.includes('res.cloudinary.com')
      ? existingTenant.logo
      : await mirrorSourceImage(FOX_SOURCE_LOGO, `tenant-logos/${TENANT_SLUG}`);
    const heroImages = existingTenant?.heroImages?.length === FOX_HERO_SOURCES.length
      && existingTenant.heroImages.every((url: string) => url.includes('res.cloudinary.com'))
      ? existingTenant.heroImages
      : await Promise.all(FOX_HERO_SOURCES.map((url, index) => mirror(url, `tenant-heroes/${TENANT_SLUG}/${index + 1}`)));

    const tourImages = new Map<string, string[]>();
    for (const tour of FOX_MARSA_ALAM_TOURS) {
      const existing = existingTours.find((record) => record.slug === tour.slug)?.images as string[] | undefined;
      tourImages.set(tour.slug, existing?.length === tour.sourceImages.length && existing.every((url) => url.includes('res.cloudinary.com'))
        ? existing
        : await Promise.all(tour.sourceImages.map((url) => mirror(url, `tours/${TENANT_SLUG}/${tour.pathSlug}`))));
    }

    const previewAccessCode = existingTenant?.previewAccessCode || generatePreviewAccessCode();
    const previewAccessCodeUpdatedAt = existingTenant?.previewAccessCodeUpdatedAt || new Date();
    const tenant = await Tenant.findOneAndUpdate(
      { slug: TENANT_SLUG },
      {
        $set: {
          ...FOX_TENANT,
          logo,
          logoDark: logo,
          favicon: logo,
          heroImages,
          previewAccessCode,
          previewAccessCodeUpdatedAt,
        },
        // The domain is attached in its own step once DNS is ready; never carry one over.
        $unset: { customDomain: 1 },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    fs.writeFileSync(codeOut, `${previewAccessCode}\n`, { mode: 0o600 });

    for (const [index, tour] of FOX_MARSA_ALAM_TOURS.entries()) {
      await Attraction.findOneAndUpdate(
        { slug: tour.slug },
        {
          $set: buildTourDocument(tour, index, tourImages.get(tour.slug) || [], tenant._id),
          // The operator publishes no cancellation policy and no rating; none is carried.
          $unset: { cancellationPolicy: 1, badges: 1, priceFrom: 1 },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
    }

    const owned = await Attraction.countDocuments({
      ownerTenantId: tenant._id,
      status: 'active',
      slug: { $in: FOX_MARSA_ALAM_TOURS.map((tour) => tour.slug) },
    });
    const foreignListed = await Attraction.countDocuments({ tenantIds: tenant._id, ownerTenantId: { $ne: tenant._id } });
    if (owned !== FOX_MARSA_ALAM_TOURS.length || foreignListed !== 0) {
      throw new Error(`Post-apply check failed (owned=${owned}, foreignListed=${foreignListed}).`);
    }

    console.log(JSON.stringify({
      mode: 'applied',
      tenant: {
        slug: tenant.slug,
        status: tenant.status,
        designMode: tenant.designMode,
        domainMigrated: tenant.domainMigrated,
        customDomain: tenant.customDomain ?? null,
      },
      catalogue: { active: owned, foreignListed, enquiryOnly: FOX_MARSA_ALAM_TOURS.length },
      safeguards: [
        'access code written to the requested file only, never printed',
        'booking alerts routed to the platform inbox',
        'no DNS, domain alias, admin account, notification or deployment change',
      ],
    }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

export async function main(): Promise<void> {
  const errors = validateFoxMarsaAlamPlan();
  if (errors.length) throw new Error(`Seed plan is invalid:\n- ${errors.join('\n- ')}`);

  if (process.argv.includes('--check')) return checkPlan();
  if (process.argv.includes('--apply')) return applyPlan();

  console.log(JSON.stringify({
    mode: 'dry-run',
    tenant: {
      slug: TENANT_SLUG,
      name: FOX_TENANT.name,
      designMode: FOX_TENANT.designMode,
      status: FOX_TENANT.status,
      customDomain: null,
      domainMigrated: false,
      pickupAreas: FOX_TENANT.pickupDestinationSlugs,
      heroImages: FOX_HERO_SOURCES.length,
    },
    catalogue: FOX_MARSA_ALAM_TOURS.map((tour) => ({
      path: `/${tour.pathSlug}`,
      title: tour.title,
      booking: 'enquiry only (no published price)',
      departures: tour.entryWindows.map((window) => window.startTime),
      hotelPickup: tour.hasHotelPickup,
      images: tour.sourceImages.length,
      openDecisions: tour.openDecisions.length,
    })),
    safeguards: ['no database connection', 'no asset upload', 'no DNS or deployment', 'no notification'],
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[fox-safari-marsa-alam] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
