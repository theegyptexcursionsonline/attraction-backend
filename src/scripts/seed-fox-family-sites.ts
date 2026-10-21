/**
 * Three priority sites from Fouad's list of 21 October 2026, each on its own storefront design:
 *
 * - Fox Safari Hurghada and Fox Safari Makadi Bay: city sites of Desert Fox Safari, "the main
 *   company". They sell Desert Fox's own programmes at Desert Fox's published prices (USD), pay
 *   later, with the main company's phone and email until each city sends its own.
 * - Power Safari Marsa Alam: "another client but still operate the same tours as Desert Fox
 *   Safari". Same programmes, enquiry-only until Power Safari confirms its own prices, with no guide
 *   languages, departure times or extras claimed on its behalf.
 *
 * Every trip copies the structured facts of a named Desert Fox programme at apply time (options,
 * prices, departures, extras, inclusions, schedule) and carries words written per site. Nothing
 * copies Desert Fox's ratings (seeded at random: `seed-desert-fox-wild-tours.ts`), review counts,
 * rankings, cancellation promise or instant confirmation.
 *
 * The backend's designMode list cannot take new names until its next release, so the tenants keep
 * `desertfox` and the storefront picks each site's own design by slug.
 *
 * Dry run (no database):        npm run seed:fox-family-sites
 * Read-only check:              npm run seed:fox-family-sites -- --check
 * Apply (all three, together):  npm run seed:fox-family-sites -- --apply \
 *   --confirm-sites=fox-safari-hurghada,fox-safari-makadi-bay,power-safari-marsa-alam \
 *   --preview-code-dir=<directory outside git>
 */

import fs from 'fs';
import path from 'path';
import { departureAvailabilityType } from '../utils/departureAvailability';
import { FAMILY_SITE_HEROES, FAMILY_SITE_LOGOS, FAMILY_SITE_TRIPS, type FamilySiteSlug, type FamilySiteTrip } from './seed-fox-family-sites.catalogue';

const LISTING_PATH = '/safaris';
const LAUNCH_BOOKING_INBOX = 'theegyptexcursionsonline@gmail.com';
const DESERT_FOX_SLUG = 'desert-fox-safari';
const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\/dm3sxllch\/image\/upload\//;

interface SiteSpec {
  slug: FamilySiteSlug;
  name: string;
  slugPrefix: string;
  city: 'Hurghada' | 'Makadi Bay' | 'Marsa Alam';
  coordinates: { lat: number; lng: number };
  /** Sells at Desert Fox's published prices; otherwise every trip is an enquiry. */
  priced: boolean;
  /** Words that must never appear in this site's customer copy. */
  foreignPlaces: RegExp;
  tagline: string;
  description: string;
  contactInfo: Record<string, string>;
  seo: { metaTitle: string; metaDescription: string; keywords: string[] };
}

// The main company's published contact points (its own tenant record), used by its city sites.
const DESERT_FOX_CONTACT = { email: 'info@desertfoxsafarihurghada.com', phone: '+20 11 50787794' };

export const FAMILY_SITES: SiteSpec[] = [
  {
    slug: 'fox-safari-hurghada',
    name: 'Fox Safari Hurghada',
    slugPrefix: 'fox-hurghada-',
    city: 'Hurghada',
    coordinates: { lat: 27.2579, lng: 33.8116 },
    priced: true,
    foreignPlaces: /Marsa Alam|Makadi|Quseir|Sharm|Giza|pyramid/i,
    tagline: 'Desert trips from Hurghada',
    description: [
      'Fox Safari Hurghada runs desert trips from Hurghada as part of the Desert Fox Safari family: quad and buggy rides, 4x4 jeep safaris, camel rides, a Super Safari with a Bedouin BBQ dinner and a full day in the desert.',
      'Every trip includes pickup and drop-off at your hotel in Hurghada. Reserve online and pay later, or call the team first.',
    ].join('\n\n'),
    contactInfo: { ...DESERT_FOX_CONTACT, address: 'Hurghada, Red Sea, Egypt' },
    seo: {
      metaTitle: 'Fox Safari Hurghada | Desert Safaris from Hurghada',
      metaDescription: 'Quad, buggy and 4x4 jeep safaris, camel rides and a Super Safari with Bedouin BBQ dinner, with hotel pickup in Hurghada.',
      keywords: ['Hurghada safari', 'Hurghada quad bike', 'Hurghada jeep safari', 'Hurghada super safari', 'Hurghada buggy'],
    },
  },
  {
    slug: 'fox-safari-makadi-bay',
    name: 'Fox Safari Makadi Bay',
    slugPrefix: 'fox-makadi-',
    city: 'Makadi Bay',
    coordinates: { lat: 26.9889, lng: 33.8934 },
    priced: true,
    foreignPlaces: /Marsa Alam|Quseir|Sharm|Giza|pyramid/i,
    tagline: 'Desert trips with pickup from your Makadi Bay hotel',
    description: [
      'Fox Safari Makadi Bay runs desert trips for guests staying in Makadi Bay, as part of the Desert Fox Safari family: quad and buggy rides, jeep safaris, camel rides at sunset and a Super Safari with a Bedouin BBQ dinner.',
      'We collect you from your hotel in Makadi Bay and bring you back after the trip. Reserve online and pay later, or call us first.',
    ].join('\n\n'),
    contactInfo: { ...DESERT_FOX_CONTACT, address: 'Makadi Bay, Red Sea, Egypt' },
    seo: {
      metaTitle: 'Fox Safari Makadi Bay | Desert Trips from Makadi Bay',
      metaDescription: 'Quad and buggy rides, jeep safaris, sunset camel rides and a Super Safari with BBQ dinner, with pickup from your Makadi Bay hotel.',
      keywords: ['Makadi Bay safari', 'Makadi Bay quad', 'Makadi Bay excursions', 'Makadi Bay camel ride', 'Makadi Bay buggy'],
    },
  },
  {
    slug: 'power-safari-marsa-alam',
    name: 'Power Safari Marsa Alam',
    slugPrefix: 'power-safari-',
    city: 'Marsa Alam',
    coordinates: { lat: 25.0676, lng: 34.879 },
    priced: false,
    foreignPlaces: /Hurghada|Makadi|Sharm|Giza|pyramid|Desert Fox/i,
    tagline: 'Quad, buggy and jeep rides from Marsa Alam',
    description: [
      'Power Safari Marsa Alam runs desert trips from Marsa Alam: quad and buggy rides, 4x4 jeep safaris, camel rides and a Super Safari with a Bedouin BBQ dinner.',
      'Every trip includes pickup from your hotel in Marsa Alam. Send us your dates and the trip you want, and the team replies with prices and times; nothing is paid online.',
    ].join('\n\n'),
    contactInfo: { address: 'Marsa Alam, Red Sea, Egypt' },
    seo: {
      metaTitle: 'Power Safari Marsa Alam | Quad, Buggy & Jeep Safaris',
      metaDescription: 'Quad and buggy rides, 4x4 jeep safaris, camel rides and a Super Safari with Bedouin BBQ, with pickup from your Marsa Alam hotel.',
      keywords: ['Marsa Alam safari', 'Marsa Alam quad', 'Marsa Alam buggy', 'Marsa Alam jeep safari', 'Power Safari'],
    },
  },
];

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{2714}\u{2728}]/u;
const FOREIGN_BRANDS = /GetYourGuide|TripAdvisor|Viator|Booking\.com|Wild Desert/i;
const PROCESS_MARKERS = /\b(seed|preview|placeholder|TODO|lorem|QA|staging|internal)\b/i;
/** Claims the network cannot back: rankings, ratings, counts, guarantees, group limits, superlatives. */
export const UNBACKED_CLAIMS = /#1|bestseller|★|\brated\b|\breviews?\b|\bmax\b|skip-the-line|100%|\bexpert\b|zero-light|\bultimate\b|\bepic\b|unforgettable|stunning|breathtaking|spectacular|\bauthentic\b|\bbest\b|budget-friendly|perfect for|polaris|free cancellation|guaranteed|award|since \d{4}|years of experience/i;

const copyOf = (trip: FamilySiteTrip) => [trip.title, trip.short, trip.description, ...trip.highlights, trip.seo.metaTitle, trip.seo.metaDescription, ...trip.imageAlts].join('\n');

export function validateFamilySitesPlan(): string[] {
  const errors: string[] = [];
  const allSlugs = new Set<string>();
  for (const site of FAMILY_SITES) {
    const trips = FAMILY_SITE_TRIPS[site.slug];
    const heroes = FAMILY_SITE_HEROES[site.slug];
    if (!trips?.length) errors.push(`${site.slug}: no trips.`);
    if (!heroes || heroes.length < 3 || new Set(heroes).size !== heroes.length) errors.push(`${site.slug}: three distinct hero images are required.`);
    for (const url of heroes || []) if (!CLOUDINARY.test(url)) errors.push(`${site.slug}: hero image must already be on the network's Cloudinary: ${url}`);
    if (!CLOUDINARY.test(FAMILY_SITE_LOGOS[site.slug] || '')) errors.push(`${site.slug}: logo must already be on the network's Cloudinary.`);
    const tenantCopy = [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription].join('\n');
    if (UNBACKED_CLAIMS.test(tenantCopy) || EMOJI.test(tenantCopy) || site.foreignPlaces.test(tenantCopy.replace(/Desert Fox Safari family/g, ''))) {
      errors.push(`${site.slug}: tenant copy carries a claim, an emoji or another place.`);
    }
    const paths = new Set<string>();
    for (const trip of trips || []) {
      const slug = `${site.slugPrefix}${trip.path}`;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trip.path)) errors.push(`${slug}: invalid public path.`);
      if (paths.has(trip.path)) errors.push(`${slug}: duplicate public path.`);
      if (allSlugs.has(slug)) errors.push(`${slug}: duplicate slug.`);
      paths.add(trip.path);
      allSlugs.add(slug);
      if (!trip.images.length || trip.images.length !== trip.imageAlts.length) errors.push(`${slug}: every photo needs its own description.`);
      for (const url of trip.images) if (!CLOUDINARY.test(url)) errors.push(`${slug}: image must already be on the network's Cloudinary: ${url}`);
      const copy = copyOf(trip);
      if (EMOJI.test(copy)) errors.push(`${slug}: emoji in customer copy.`);
      if (FOREIGN_BRANDS.test(copy)) errors.push(`${slug}: another brand in customer copy.`);
      if (PROCESS_MARKERS.test(copy)) errors.push(`${slug}: process marker in customer copy.`);
      if (UNBACKED_CLAIMS.test(copy)) errors.push(`${slug}: unbacked claim in customer copy.`);
      if (site.foreignPlaces.test(copy)) errors.push(`${slug}: copy names a place this site does not serve.`);
      if (!trip.seo.metaTitle || trip.seo.metaTitle.length > 70) errors.push(`${slug}: SEO title missing or too long.`);
      if (!trip.seo.metaDescription || trip.seo.metaDescription.length > 165) errors.push(`${slug}: SEO description missing or too long.`);
    }
  }
  const pricedSources = new Set(FAMILY_SITES.filter((site) => site.priced).flatMap((site) => FAMILY_SITE_TRIPS[site.slug].map((trip) => trip.source)));
  const pricingCopy = [
    ...Object.entries(FAMILY_CHILD_TERMS).map(([source, terms]) => [source, [terms.option, terms.description, terms.note].join('\n')] as const),
    ...Object.entries(FAMILY_PER_VEHICLE).flatMap(([source, vehicles]) => Object.values(vehicles).map((vehicle) => [source, vehicle.note] as const)),
  ];
  for (const [source, copy] of pricingCopy) {
    if (!pricedSources.has(source)) errors.push(`${source}: pricing terms for a programme no priced site sells.`);
    if (UNBACKED_CLAIMS.test(copy) || EMOJI.test(copy) || PROCESS_MARKERS.test(copy)) errors.push(`${source}: pricing terms carry a claim, an emoji or a process marker.`);
  }
  return errors;
}

/**
 * Desert Fox sells some programmes with the adult and the child rate as two separate options, so a
 * family that chose "Adult" paid the adult rate for its children and "Child" sold adults the child
 * rate. Here the pair becomes one option with a child price, which is how the booking API prices a
 * mixed group (adults x price + children x childPrice); the age band moves to "Need to know".
 */
export const FAMILY_CHILD_TERMS: Record<string, { option: string; description: string; note: string }> = {
  'desert-fox-super-safari-combo': {
    option: 'Full combo',
    description: 'Quad biking, camel ride and BBQ dinner',
    note: 'Children aged 6 to 12 pay the child price. They share a quad and ride their own camel.',
  },
  'desert-fox-camel-trek-sunset': {
    option: 'Camel trek',
    description: 'Adults ride their own camel',
    note: 'Children aged 4 to 11 pay the child price and share a camel with an adult.',
  },
  'desert-fox-full-day-sahara-expedition': {
    option: 'Full day',
    description: 'All activities included',
    note: 'Children aged 6 to 12 pay the child price and take part in adapted activities.',
  },
};

/** Options priced for the whole vehicle, not per rider ("Entire vehicle for your group", "Two riders per quad bike"). */
export const FAMILY_PER_VEHICLE: Record<string, Record<string, { riders: number; note: string }>> = {
  'desert-fox-private-jeep-safari': { vehicle: { riders: 4, note: 'The price is for the whole jeep, for up to 4 people.' } },
  'desert-fox-sunset-quad-safari': { double: { riders: 2, note: 'A double quad is one price for the quad, with up to 2 riders.' } },
};

type SourceDoc = Record<string, any>;
const withoutIds = <T extends Record<string, unknown>>(items: T[] | undefined): Omit<T, '_id'>[] =>
  (items || []).map(({ _id, ...rest }) => { void _id; return rest; });
const perPerson = (option: Record<string, unknown>) => (option.pricingModel ?? 'per-person') === 'per-person';

/**
 * A priced site's options and the "Need to know" lines they add. Fails closed: a separate child
 * rate without written terms, or a configured vehicle option the programme no longer has, stops
 * the run instead of selling a family the wrong price.
 */
export function familyPricing(sourceSlug: string, options: SourceDoc[] | undefined): { options: Record<string, unknown>[]; notes: string[] } {
  let list: Record<string, unknown>[] = withoutIds(options);
  const notes: string[] = [];
  const children = list.filter((option) => perPerson(option) && /\b(?:child|children|kids?)\b/i.test(String(option.name || '')));
  if (children.length) {
    const adult = list.find((option) => perPerson(option) && /^adult$/i.test(String(option.name || '').trim()));
    const terms = FAMILY_CHILD_TERMS[sourceSlug];
    if (children.length !== 1 || !adult || !terms) throw new Error(`${sourceSlug}: a separate child rate needs one adult option and FAMILY_CHILD_TERMS.`);
    list = list
      .filter((option) => option !== children[0])
      .map((option) => (option === adult ? { ...option, name: terms.option, description: terms.description, childPrice: Number(children[0].price) } : option));
    notes.push(terms.note);
  }
  for (const [id, vehicle] of Object.entries(FAMILY_PER_VEHICLE[sourceSlug] || {})) {
    if (!list.some((option) => option.id === id)) throw new Error(`${sourceSlug}: vehicle option ${id} is missing.`);
    list = list.map((option) => (option.id === id ? { ...option, pricingModel: 'per-booking', minParticipants: 1, maxParticipants: vehicle.riders } : option));
    notes.push(vehicle.note);
  }
  return { options: list, notes };
}
const cleanList = (items: unknown, extra?: (item: string) => string | null): string[] =>
  (Array.isArray(items) ? items : [])
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .map((item) => (/^hotel transfers?$/i.test(item) ? 'Hotel pickup and drop-off' : item))
    .map((item) => (extra ? extra(item) : item))
    .filter((item): item is string => Boolean(item) && !UNBACKED_CLAIMS.test(item as string));

/** The trip document for one site, from its written copy and the named Desert Fox programme. */
export function familyTripDocument(site: SiteSpec, trip: FamilySiteTrip, source: SourceDoc, index: number, tenantId: unknown): Record<string, unknown> {
  const priced = site.priced;
  // A separate company's guides, times and extras are unknown: say nothing about them.
  const neutral = (item: string) => (priced ? item : item.replace(/^English(?:-speaking)? guide$/i, 'Guide'));
  const pricing = priced ? familyPricing(String(source.slug), source.pricingOptions) : { options: [], notes: [] };
  const pricingOptions = pricing.options;
  // The stored "from" price is what an adult pays; child and infant rates never lead.
  const priceOf = (option: Record<string, unknown>) => Number(option.price);
  const valid = pricingOptions.filter((option) => Number.isFinite(priceOf(option)) && priceOf(option) > 0);
  const adult = valid.filter((option) => !/\b(?:child|children|kids?|infants?|baby|babies|toddlers?)\b/i.test(String(option.name || '')));
  const prices = (adult.length ? adult : valid).map(priceOf);
  const entryWindows = priced ? withoutIds(source.entryWindows) : [];
  const inclusions = cleanList(source.inclusions, neutral);
  const pickup = source.hasHotelPickup === true || inclusions.some((item) => /hotel pickup/i.test(item));
  return {
    slug: `${site.slugPrefix}${trip.path}`,
    pathSlug: trip.path,
    parentPage: { label: 'Trips', path: LISTING_PATH },
    title: trip.title,
    shortDescription: trip.short,
    description: trip.description,
    images: trip.images,
    imageAltTexts: trip.images.map((url, imageIndex) => ({ url, alt: trip.imageAlts[imageIndex] || trip.title })),
    category: source.category || 'adventure',
    ...(source.subcategory ? { subcategory: source.subcategory } : {}),
    destination: { city: site.city, country: 'Egypt', coordinates: site.coordinates },
    ...(trip.duration || source.duration ? { duration: trip.duration || source.duration } : {}),
    languages: priced ? cleanList(source.languages) : [],
    rating: 0,
    reviewCount: 0,
    currency: 'USD',
    enquiryOnly: !priced,
    pricingOptions,
    ...(priced && prices.length ? { priceFrom: Math.min(...prices) } : {}),
    addons: priced ? withoutIds(source.addons) : [],
    entryWindows,
    itinerary: withoutIds(source.itinerary)
      .map((step) => (priced ? step : { ...step, time: '' }))
      .filter((step) => !UNBACKED_CLAIMS.test(`${(step as { title?: string }).title} ${(step as { description?: string }).description}`)),
    highlights: trip.highlights,
    inclusions,
    exclusions: cleanList(source.exclusions),
    whatToBring: cleanList(source.whatToBring),
    needToKnow: [...cleanList(source.needToKnow), ...pricing.notes],
    participantRequirements: cleanList(source.participantRequirements),
    accessibility: cleanList(source.accessibility),
    gettingThere: pickup ? [{ mode: 'Hotel pickup', description: `Pickup and drop-off at your hotel in ${site.city}.` }] : [],
    meetingPoint: {
      address: pickup ? `Your hotel in ${site.city}` : `${site.city}, Red Sea, Egypt`,
      instructions: 'The team confirms your pickup time when it confirms your booking.',
      mapUrl: '',
    },
    instantConfirmation: false,
    mobileTicket: true,
    hasHotelPickup: pickup,
    availability: {
      type: priced ? (source.availability?.type || departureAvailabilityType(entryWindows)) : departureAvailabilityType([]),
      advanceBooking: Number(source.availability?.advanceBooking) > 0 ? Number(source.availability.advanceBooking) : 30,
    },
    seo: { metaTitle: trip.seo.metaTitle, metaDescription: trip.seo.metaDescription },
    tenantIds: [tenantId],
    ownerTenantId: tenantId,
    reseller: { enabled: false, value: 0, allowedTenants: [] },
    status: 'active',
    featured: index < 6,
    sortOrder: index + 1,
  };
}

export function familyTenantRecord(site: SiteSpec): Record<string, unknown> {
  return {
    slug: site.slug,
    name: site.name,
    domain: `${site.slug}.foxesnetwork.com`,
    domainMigrated: false,
    customDomainStatus: 'unconfigured',
    tagline: site.tagline,
    description: site.description,
    // Each site's look comes from its storefront design (chosen by slug); this is the admin palette.
    theme: { primaryColor: '#D9612A', secondaryColor: '#2D1810', accentColor: '#F1E5C9' },
    fonts: { heading: 'Inter', body: 'Inter' },
    designMode: 'desertfox',
    defaultCurrency: 'USD',
    defaultLanguage: 'en',
    supportedLanguages: ['en'],
    timezone: 'Africa/Cairo',
    contactInfo: site.contactInfo,
    socialLinks: {},
    notificationSettings: { bookingEmail: LAUNCH_BOOKING_INBOX },
    flatUrls: true,
    status: 'active',
    navigation: [
      { label: 'Home', href: '/' },
      { label: 'Trips', href: LISTING_PATH },
      { label: 'About', href: '/about' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Contact', href: '/contact' },
    ],
    seoSettings: site.seo,
    heroImages: FAMILY_SITE_HEROES[site.slug],
    // An initials monogram until the site sends its logo (recorded as an open question).
    logo: FAMILY_SITE_LOGOS[site.slug],
    logoDark: FAMILY_SITE_LOGOS[site.slug],
    favicon: FAMILY_SITE_LOGOS[site.slug],
    paymentSettings: { enabledGateways: ['pay-later'], ownPaymentGateway: false, stripe: { enabled: false } },
    bundleSettings: { mode: 'off', reason: 'The launch package sells single trips only.' },
    // The AI widgets are being trialled on two other sites first; these switch on after that sign-off.
    aiSettings: {
      bookingWidget: { enabled: false, position: 'bottom-right', languages: ['en'], autoOpen: false },
      voiceAgent: { enabled: false, languages: ['en'], buttonPosition: 'bottom-right' },
      searchWidget: { enabled: false, placeholder: 'Search quad, buggy, jeep and camel trips', showPopularSearches: true, maxSuggestions: 6 },
    },
  };
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function loadState() {
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const desertFox = await Tenant.findOne({ slug: DESERT_FOX_SLUG }).select('_id status');
  if (!desertFox) throw new Error('Desert Fox Safari, the source of the programmes, was not found.');
  const sourceSlugs = [...new Set(FAMILY_SITES.flatMap((site) => FAMILY_SITE_TRIPS[site.slug].map((trip) => trip.source)))];
  const sources = await Attraction.find({ slug: { $in: sourceSlugs }, ownerTenantId: desertFox._id, status: 'active' }).lean();
  const missing = sourceSlugs.filter((slug) => !sources.some((source) => source.slug === slug));
  const sites = [];
  for (const site of FAMILY_SITES) {
    const existing = await Tenant.findOne({ slug: site.slug }).select('+previewAccessCode +previewAccessCodeUpdatedAt');
    const namespaceConflict = await Tenant.findOne({ _id: { $ne: existing?._id }, $or: [{ slug: site.slug }, { domain: `${site.slug}.foxesnetwork.com` }] }).select('slug');
    const slugs = FAMILY_SITE_TRIPS[site.slug].map((trip) => `${site.slugPrefix}${trip.path}`);
    const records = await Attraction.find({ slug: { $in: slugs } }).select('slug ownerTenantId tenantIds').lean();
    // A slug held by any other tenant is refused; on a first run there is no tenant, so any holder is foreign.
    const collision = records.find((record) => !existing || String(record.ownerTenantId) !== String(existing._id)
      || (record.tenantIds || []).some((id: unknown) => String(id) !== String(existing._id)));
    sites.push({ site, existing, namespaceConflict, existingSlugs: records.map((record) => record.slug), collision: collision ? `Refusing cross-tenant catalogue overwrite: ${collision.slug}.` : null });
  }
  return { sources: new Map(sources.map((source) => [source.slug as string, source as SourceDoc])), missing, sites };
}

async function checkPlan(): Promise<void> {
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  await connectDatabase();
  try {
    const { missing, sites } = await loadState();
    console.log(JSON.stringify({
      mode: 'check',
      missingSourceProgrammes: missing,
      sites: sites.map(({ site, existing, namespaceConflict, existingSlugs, collision }) => ({
        slug: site.slug,
        tenant: existing ? { action: 'update', status: existing.status } : { action: 'create' },
        namespaceConflict: namespaceConflict?.slug ?? null,
        existingTripSlugs: existingSlugs,
        collision,
      })),
      writes: 'none',
    }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

async function applyPlan(): Promise<void> {
  const expected = FAMILY_SITES.map((site) => site.slug).join(',');
  if (argValue('confirm-sites') !== expected) throw new Error(`Apply fence missing. Pass --confirm-sites=${expected}.`);
  const codeDir = argValue('preview-code-dir');
  if (!codeDir || !fs.existsSync(codeDir) || !fs.statSync(codeDir).isDirectory()) throw new Error('Pass --preview-code-dir=<existing directory outside git>.');

  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const { generatePreviewAccessCode } = await import('../utils/hash');
  const { urlNamespaceReadiness } = await import('../plugins/urlNamespace');
  if (!urlNamespaceReadiness().writesReady) throw new Error('URL namespace writes are paused in this environment. Nothing was written.');

  await connectDatabase();
  try {
    const { sources, missing, sites } = await loadState();
    // All three sites are checked before the first write, so the run is all or nothing per guard.
    if (missing.length) throw new Error(`Source programmes missing or inactive: ${missing.join(', ')}.`);
    for (const { site, existing, namespaceConflict, collision } of sites) {
      if (existing && !['active', 'coming_soon', 'pending'].includes(existing.status)) throw new Error(`${site.slug}: protected status ${existing.status}.`);
      if (existing?.domainMigrated) throw new Error(`${site.slug}: already serves its own domain.`);
      if (namespaceConflict) throw new Error(`${site.slug}: namespace owned by ${namespaceConflict.slug}.`);
      if (collision) throw new Error(`${site.slug}: ${collision}`);
    }

    const report = [];
    for (const { site, existing } of sites) {
      const previewAccessCode = existing?.previewAccessCode || generatePreviewAccessCode();
      const tenant = await Tenant.findOneAndUpdate(
        { slug: site.slug },
        {
          $set: { ...familyTenantRecord(site), previewAccessCode, previewAccessCodeUpdatedAt: existing?.previewAccessCodeUpdatedAt || new Date() },
          // The domain is attached in its own step, after DNS.
          $unset: { customDomain: 1, pickupDestinationSlugs: 1 },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
      fs.writeFileSync(path.join(codeDir, `${site.slug}.txt`), `${previewAccessCode}\n`, { mode: 0o600 });
      const trips = FAMILY_SITE_TRIPS[site.slug];
      for (const [index, trip] of trips.entries()) {
        const source = sources.get(trip.source);
        if (!source) throw new Error(`${site.slug}: source ${trip.source} vanished mid-run.`);
        const document = familyTripDocument(site, trip, source, index, tenant._id);
        await Attraction.findOneAndUpdate(
          { slug: document.slug },
          {
            $set: document,
            // Never carried: the source's cancellation promise, badges, and (for enquiries) a price.
            $unset: { cancellationPolicy: 1, badges: 1, ...(site.priced ? {} : { priceFrom: 1 }) },
          },
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
        );
      }
      const owned = await Attraction.countDocuments({ ownerTenantId: tenant._id, status: 'active', slug: { $in: trips.map((trip) => `${site.slugPrefix}${trip.path}`) } });
      const foreignListed = await Attraction.countDocuments({ tenantIds: tenant._id, ownerTenantId: { $ne: tenant._id } });
      const rated = await Attraction.countDocuments({ ownerTenantId: tenant._id, $or: [{ rating: { $gt: 0 } }, { reviewCount: { $gt: 0 } }] });
      if (owned !== trips.length || foreignListed !== 0 || rated !== 0) {
        throw new Error(`${site.slug}: post-apply check failed (owned=${owned}, foreignListed=${foreignListed}, rated=${rated}).`);
      }
      report.push({ slug: tenant.slug, status: tenant.status, designMode: tenant.designMode, trips: owned, priced: site.priced, previewCode: `${site.slug}.txt` });
    }
    console.log(JSON.stringify({
      mode: 'applied',
      sites: report,
      safeguards: [
        'access codes written to the requested directory only, never printed',
        'booking alerts routed to the platform inbox',
        'no ratings, review counts, cancellation promise or instant confirmation copied',
        'no DNS, domain, admin account, notification or deployment change',
      ],
    }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

export async function main(): Promise<void> {
  const errors = validateFamilySitesPlan();
  if (errors.length) throw new Error(`Seed plan is invalid:\n- ${errors.join('\n- ')}`);
  if (process.argv.includes('--check')) return checkPlan();
  if (process.argv.includes('--apply')) return applyPlan();
  console.log(JSON.stringify({
    mode: 'dry-run',
    sites: FAMILY_SITES.map((site) => ({
      slug: site.slug,
      name: site.name,
      booking: site.priced ? 'Desert Fox published prices, pay later' : 'enquiry only',
      trips: FAMILY_SITE_TRIPS[site.slug].map((trip) => ({ path: `/${trip.path}`, title: trip.title, from: trip.source, photos: trip.images.length })),
    })),
    safeguards: ['no database connection', 'no upload', 'no DNS or deployment', 'no notification'],
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[fox-family-sites] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
