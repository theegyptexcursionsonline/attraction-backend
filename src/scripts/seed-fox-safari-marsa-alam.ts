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
 * publishes no prices. Until it sends its price list (owner decision, 22 October
 * 2026), each desert trip with a Desert Fox Safari programme of the same activities
 * sells at that programme's published prices, departures and extras, in US dollars
 * as the programme publishes them (`FOX_PROGRAMME_PRICES`); a price is never
 * invented or converted. The other trips stay enquiries with a designed enquiry
 * route. Every unconfirmed point is recorded in `openDecisions` (internal only).
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
import { gatewaySafeSeedFilter } from '../services/gatewayDomainScope';
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
  // A site sells in one currency: the Desert Fox programme prices its trips carry are in US dollars.
  defaultCurrency: 'USD',
  defaultLanguage: 'en',
  supportedLanguages: ['en'],
  timezone: 'Africa/Cairo',
  contactInfo: {
    // Published by the operator on foxmarsaalam.com/contact-us.
    email: 'info@foxmarsaalam.com',
    phone: '+20 103 968 8089',
    whatsapp: '+201039688089',
    address: 'Marsa Alam & El Quseir, Red Sea, Egypt',
    // The operator's site states two different sets of opening hours; none is shown until it confirms one.
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

const DESERT_FOX_SLUG = 'desert-fox-safari';
/** Places and brands a copied programme option, extra or departure must never name on this site. */
const COPIED_FOREIGN = /Hurghada|Makadi|Sharm|Giza|pyramid|El Gouna|Safaga|Desert Fox|Wild Desert/i;

/**
 * Which published trip each Fox Marsa Alam trip borrows its prices from, and which of its options,
 * extras and departures. The desert trips use Desert Fox Safari's own programmes; the jeep safari,
 * horse ride, Luxor day and El Quseir tour use the trip on the network with the same content and
 * inclusions, the lowest-priced where several match (owner, 22 October 2026: "Use best price &
 * choose"). Only the named parts are copied, so nothing the trip already includes is sold again (a
 * camel ride, a dinner) and no departure contradicts the trip (a sunset trip has no morning start);
 * a trip with no fitting departure is sold by the day and the team confirms the pickup time. The
 * airport transfers stay enquiries: no fare for Marsa Alam, Port Ghalib or El Quseir exists on the
 * network or in the airport-transfer product, and a fare depends on the airport and the group.
 */
export interface FoxProgrammePrice {
  /** The site that publishes the trip; Desert Fox Safari when not named. */
  tenant?: string;
  source: string;
  options: string[];
  /** The programme sells children as a separate option: one option with a child price, and the age band. */
  child?: { adult: string; child: string; name: string; description: string; note: string };
  /** The site's own name for an option whose source name describes another trip. */
  rename?: Record<string, { name: string; description: string }>;
  addons: string[];
  /**
   * Extras charged per guest, each guest choosing at booking. An entrance ticket is bought per person,
   * so it is sold that way here even where the source leaves it at the platform's once-per-booking default.
   */
  perPerson?: string[];
  /** Departures by label; none means the trip is sold by the day. */
  departures: string[];
  /** A "Need to know" line the copied options make necessary. */
  note?: string;
}

export const FOX_PROGRAMME_PRICES: Partial<Record<string, FoxProgrammePrice>> = {
  'super-safari': {
    source: 'wild-desert-jeep-quad-buggy-camel-dinner-show',
    options: ['standard', 'extended'],
    addons: ['private', 'sandboard'],
    departures: ['Afternoon'],
  },
  'buggy-spider': {
    source: 'wild-desert-dune-buggy-optional-bbq',
    options: ['short', 'bbq'],
    addons: ['gopro'],
    departures: ['Morning', 'Afternoon'],
  },
  'quad-sunset-bbq': {
    source: 'wild-desert-quad-atv-camel-bbq',
    options: ['bbq'],
    addons: ['buggy-upgrade', 'photos', 'shisha'],
    departures: ['Afternoon'],
  },
  'desert-atv-adventure': {
    source: 'wild-desert-quad-atv-camel-bbq',
    options: ['standard'],
    addons: ['buggy-upgrade', 'photos', 'shisha'],
    departures: ['Morning', 'Afternoon'],
  },
  'camel-ride': {
    source: 'desert-fox-camel-trek-sunset',
    options: ['adult'],
    child: {
      adult: 'adult',
      child: 'child',
      name: 'Camel ride',
      description: 'Adults ride their own camel',
      note: 'Children aged 4 to 11 pay the child price and share a camel with an adult.',
    },
    addons: [],
    departures: ['Afternoon'],
  },
  // Desert Fox's jeep safari: drive, Bedouin village, sunset and BBQ dinner; its dinner and camel
  // extras are left out because this trip includes both.
  'jeep-safari': {
    source: 'hurghada-jeep-safari-redsea',
    options: ['adult'],
    child: {
      adult: 'adult',
      child: 'child',
      name: 'Jeep safari',
      description: 'Jeep, Bedouin village, camel ride, sunset and BBQ dinner with a show',
      note: 'Children pay the child price. The team confirms which ages count as children when it confirms your booking.',
    },
    addons: ['addon-photo', 'addon-drinks'],
    departures: ['Late Afternoon Session'],
  },
  // A two-hour desert and sea ride with hotel pickup, the lowest-priced ride that includes the pickup.
  'horse-ride': {
    tenant: 'sea-horse-sahl-hashesh',
    source: 'desert-sea-horse-ride-optional-swimming',
    options: ['0d1d0b54'],
    rename: { '0d1d0b54': { name: 'Horse ride (2 hours)', description: 'Beach and desert ride with a guide' } },
    addons: ['26bca453'],
    departures: ['Morning', 'Afternoon', 'Sunset'],
    note: 'The two-hour ride books online. For a one-hour ride, say so when you book and the team arranges it.',
  },
  // Private transport, an Egyptologist, the entrances and lunch, with the Tutankhamun tomb as the
  // extra it is here too, charged per guest who enters. Its 07:00 and 13:00 departures cannot fit a
  // 16-hour day from Marsa Alam.
  'luxor-day-trip': {
    tenant: 'luxor-tour-from-hurghada',
    source: 'luxor-day-trip-valley-kings',
    options: ['adult'],
    child: {
      adult: 'adult',
      child: 'child',
      name: 'Luxor day trip',
      description: 'Karnak, the Valley of the Kings and the Temple of Hatshepsut, with lunch',
      note: 'Children aged 6 to 12 pay the child price.',
    },
    addons: ['tut-tomb'],
    perPerson: ['tut-tomb'],
    departures: [],
  },
  // A guided four-hour town tour with an entrance and hotel pickup; its aquarium extra is another town's.
  'el-quseir-city-tour': {
    tenant: 'future-travel-service',
    source: 'fts-hurghada-city-tour-bazaar-sand-museum',
    options: ['adult'],
    child: {
      adult: 'adult',
      child: 'child',
      name: 'City tour',
      description: 'Guided tour with the entrance to the Ottoman fort',
      note: 'Children aged 6 to 12 pay the child price.',
    },
    addons: [],
    departures: ['Standard Departure'],
  },
};

type ProgrammeDoc = Record<string, any>;
const CHILD_RATE = /\b(?:child|children|kids?)\b/i;

/**
 * A trip's options, extras and departures from its programme. Fails closed: a programme in another
 * currency, a named option, extra or departure it no longer has, a missing price, a child rate with
 * no terms, or copied text naming another place, brand or claim stops the run before any write.
 */
export function foxProgrammeFacts(tour: FoxTour, spec: FoxProgrammePrice, programme: ProgrammeDoc) {
  const where = `${tour.slug} (${spec.source})`;
  const currency = String(programme.currency || '').trim().toUpperCase();
  if (currency !== FOX_TENANT.defaultCurrency) {
    throw new Error(`${where}: the programme is priced in ${currency || 'no currency'} and the site sells in ${FOX_TENANT.defaultCurrency}. Prices are never converted.`);
  }
  const pick = (list: unknown, keys: string[], field: 'id' | 'label', kind: string): Record<string, unknown>[] => keys.map((key) => {
    const hit = (Array.isArray(list) ? list : []).find((item) => item?.[field] === key);
    if (!hit) throw new Error(`${where}: ${kind} "${key}" is missing from the programme.`);
    const { _id, ...rest } = hit as Record<string, unknown>;
    void _id;
    return rest;
  });
  const priced = (kind: string) => (item: Record<string, unknown>) => {
    if (!Number.isFinite(Number(item.price)) || Number(item.price) <= 0) throw new Error(`${where}: ${kind} "${String(item.id)}" has no valid price.`);
    return item;
  };

  const childRates = (Array.isArray(programme.pricingOptions) ? programme.pricingOptions : [])
    .filter((option: Record<string, unknown>) => CHILD_RATE.test(String(option?.name || '')));
  if (childRates.length && (!spec.child || childRates.length !== 1 || childRates[0].id !== spec.child.child)) {
    throw new Error(`${where}: the programme sells a separate child rate, which needs its terms here.`);
  }
  let pricingOptions = pick(programme.pricingOptions, spec.options, 'id', 'option').map(priced('option'));
  const notes: string[] = [];
  if (spec.child) {
    const terms = spec.child;
    const [child] = pick(programme.pricingOptions, [terms.child], 'id', 'option').map(priced('option'));
    if (!pricingOptions.some((option) => option.id === terms.adult)) throw new Error(`${where}: the child price needs the adult option "${terms.adult}".`);
    pricingOptions = pricingOptions.map((option) => (option.id === terms.adult
      ? { ...option, name: terms.name, description: terms.description, childPrice: Number(child.price) }
      : option));
    notes.push(terms.note);
  }
  for (const [id, words] of Object.entries(spec.rename || {})) {
    if (!pricingOptions.some((option) => option.id === id)) throw new Error(`${where}: option "${id}" to rename is not sold.`);
    pricingOptions = pricingOptions.map((option) => (option.id === id ? { ...option, ...words } : option));
  }
  if (spec.note) notes.push(spec.note);
  for (const id of spec.perPerson || []) {
    if (!spec.addons.includes(id)) throw new Error(`${where}: extra "${id}" to charge per guest is not sold.`);
  }
  const addons = pick(programme.addons, spec.addons, 'id', 'extra').map(priced('extra'))
    .map((addon) => (spec.perPerson?.includes(String(addon.id)) ? { ...addon, pricingModel: 'per-person', pricingType: 'per_person' } : addon));
  const entryWindows = pick(programme.entryWindows, spec.departures, 'label', 'departure');

  const copied = [
    ...pricingOptions.flatMap((option) => [option.name, option.description]),
    ...addons.flatMap((addon) => [addon.name, addon.description]),
    ...entryWindows.map((window) => window.label),
  ].filter((text): text is string => typeof text === 'string');
  const refused = copied.filter((text) => COPIED_FOREIGN.test(text) || FOREIGN_BRANDS.test(text) || UNBACKED_CLAIMS.test(text) || EMOJI.test(text));
  if (refused.length) throw new Error(`${where}: copied text names another place or brand, or makes a claim: "${refused.join('", "')}"`);

  return { pricingOptions, addons, entryWindows, notes, priceFrom: Math.min(...pricingOptions.map((option) => Number(option.price))) };
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
  for (const [pathSlug, spec] of Object.entries(FOX_PROGRAMME_PRICES)) {
    if (!spec) continue;
    if (!paths.has(pathSlug)) errors.push(`Programme prices for a trip the catalogue does not carry: ${pathSlug}`);
    if (!spec.options.length || new Set(spec.options).size !== spec.options.length) errors.push(`${pathSlug}: options must name distinct programme options.`);
    if (new Set(spec.departures).size !== spec.departures.length || spec.departures.some((label) => !label.trim())) errors.push(`${pathSlug}: departures must name distinct programme departures.`);
    if (new Set(spec.addons).size !== spec.addons.length) errors.push(`${pathSlug}: extras must be distinct.`);
    if ((spec.perPerson || []).some((id) => !spec.addons.includes(id))) errors.push(`${pathSlug}: charges per guest an extra it does not sell.`);
    if (spec.tenant !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(spec.tenant)) errors.push(`${pathSlug}: invalid source site.`);
    if (spec.child) {
      if (!spec.options.includes(spec.child.adult) || spec.options.includes(spec.child.child)) errors.push(`${pathSlug}: the child price rides on the adult option.`);
    }
    for (const id of Object.keys(spec.rename || {})) {
      if (!spec.options.includes(id)) errors.push(`${pathSlug}: renames an option it does not sell: ${id}`);
    }
    // Words this site writes over the source's: the same rules as the trip's own copy.
    const words = [spec.child?.name, spec.child?.description, spec.child?.note, spec.note, ...Object.values(spec.rename || {}).flatMap((entry) => [entry.name, entry.description])]
      .filter((text): text is string => typeof text === 'string').join('\n');
    if (UNBACKED_CLAIMS.test(words) || EMOJI.test(words) || PROCESS_MARKERS.test(words) || COPIED_FOREIGN.test(words)) {
      errors.push(`${pathSlug}: option words carry a claim, an emoji, a process marker or another place.`);
    }
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
  programme?: ProgrammeDoc,
): Record<string, unknown> {
  const spec = FOX_PROGRAMME_PRICES[tour.pathSlug];
  if (spec && !programme) throw new Error(`${tour.slug}: sells at the prices of ${spec.source}, which was not loaded.`);
  const facts = spec && programme ? foxProgrammeFacts(tour, spec, programme) : null;
  const entryWindows = facts ? facts.entryWindows : tour.entryWindows;
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
    // Without a programme of the same activities the trip is visible and enquirable, never sold at an invented price.
    enquiryOnly: !facts,
    pricingOptions: facts?.pricingOptions ?? [],
    ...(facts ? { priceFrom: facts.priceFrom } : {}),
    addons: facts?.addons ?? [],
    entryWindows,
    itinerary: tour.itinerary,
    participantRequirements: tour.participantRequirements,
    highlights: tour.highlights,
    inclusions: tour.inclusions,
    exclusions: tour.exclusions,
    whatToBring: tour.whatToBring,
    needToKnow: [...tour.needToKnow, ...(facts?.notes ?? [])],
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
    availability: { type: departureAvailabilityType(entryWindows), advanceBooking: 365 },
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

  // The trips prices are borrowed from: each one active and owned by the active site named for it.
  const specs = Object.values(FOX_PROGRAMME_PRICES).filter((spec): spec is FoxProgrammePrice => Boolean(spec));
  const owners = await Tenant.find({ slug: { $in: [...new Set(specs.map((spec) => spec.tenant ?? DESERT_FOX_SLUG))] }, status: 'active' }).select('_id slug').lean();
  const ownerIds = new Map(owners.map((owner) => [owner.slug as string, owner._id]));
  const programmes = new Map<string, ProgrammeDoc>();
  const missingProgrammes: string[] = [];
  for (const spec of specs) {
    const site = spec.tenant ?? DESERT_FOX_SLUG;
    if (programmes.has(spec.source)) continue;
    const ownerId = ownerIds.get(site);
    const programme = ownerId ? await Attraction.findOne({ slug: spec.source, ownerTenantId: ownerId, status: 'active' }).lean() : null;
    if (programme) programmes.set(spec.source, programme as ProgrammeDoc);
    else missingProgrammes.push(`${site}/${spec.source}`);
  }

  // A site sells in one currency, so every other tour on it (any status) must already be in the new one.
  const otherTours = existingTenant
    ? (await Attraction.find({ tenantIds: existingTenant._id, slug: { $nin: FOX_MARSA_ALAM_TOURS.map((tour) => tour.slug) } })
      .select('slug currency status').lean())
      .filter((record) => String(record.currency || '').trim().toUpperCase() !== FOX_TENANT.defaultCurrency)
      .map((record) => `${record.slug} (${record.currency}, ${record.status})`)
    : [];
  return { existingTenant, namespaceConflict, existingTours, collision, programmes, missingProgrammes, otherTours };
}

/** Every trip document built before anything is uploaded or written, with what would stop the run. */
function planTours(programmes: Map<string, ProgrammeDoc>, tenantId: unknown) {
  const problems: string[] = [];
  const documents = FOX_MARSA_ALAM_TOURS.flatMap((tour, index) => {
    const spec = FOX_PROGRAMME_PRICES[tour.pathSlug];
    try {
      return [buildTourDocument(tour, index, [], tenantId, spec ? programmes.get(spec.source) : undefined)];
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  return { documents, problems };
}

const tourSummary = (document: Record<string, unknown>) => ({
  path: `/${String(document.pathSlug)}`,
  enquiryOnly: document.enquiryOnly,
  from: document.priceFrom ?? null,
  options: (document.pricingOptions as Array<{ name: string; price: number; childPrice?: number }>).map((option) => `${option.name}: ${option.price}${option.childPrice !== undefined ? ` (child ${option.childPrice})` : ''}`),
  departures: (document.entryWindows as Array<{ label: string; startTime: string }>).map((window) => `${window.label} ${window.startTime}`),
  extras: (document.addons as Array<{ name: string; price: number }>).map((addon) => `${addon.name}: ${addon.price}`),
});

async function checkPlan(): Promise<void> {
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  await connectDatabase();
  try {
    const { existingTenant, namespaceConflict, existingTours, collision, programmes, missingProgrammes, otherTours } = await loadExisting();
    const plan = planTours(programmes, existingTenant?._id ?? null);
    console.log(JSON.stringify({
      mode: 'check',
      tenant: existingTenant
        ? { action: 'update', status: existingTenant.status, designMode: existingTenant.designMode, currency: `${existingTenant.defaultCurrency} -> ${FOX_TENANT.defaultCurrency}` }
        : { action: 'create', slug: TENANT_SLUG },
      namespaceConflict: namespaceConflict ? namespaceConflict.slug : null,
      existingTourSlugs: existingTours.map((record) => record.slug),
      collision,
      missingProgrammes,
      otherToursInAnotherCurrency: otherTours,
      problems: plan.problems,
      catalogue: plan.documents.map(tourSummary),
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
    const { existingTenant, namespaceConflict, existingTours, collision, programmes, missingProgrammes, otherTours } = await loadExisting();
    if (existingTenant && !['active', 'coming_soon', 'pending'].includes(existingTenant.status)) {
      throw new Error(`Refusing to change a tenant in protected status: ${existingTenant.status}.`);
    }
    if (existingTenant?.domainMigrated) throw new Error('Tenant already serves its own domain. Refusing a launch-package rewrite.');
    if (namespaceConflict) throw new Error(`The namespace is already owned by another tenant: ${namespaceConflict.slug}.`);
    if (collision) throw new Error(collision);
    if (missingProgrammes.length) throw new Error(`Desert Fox programmes missing or inactive: ${missingProgrammes.join(', ')}. Nothing was written.`);
    if (otherTours.length) {
      throw new Error(`The site sells in ${FOX_TENANT.defaultCurrency}, but other tours on it are priced in another currency: ${otherTours.join(', ')}. Nothing was written.`);
    }
    const plan = planTours(programmes, existingTenant?._id ?? null);
    if (plan.problems.length) throw new Error(`Nothing was written.\n- ${plan.problems.join('\n- ')}`);

    console.log(JSON.stringify({
      mode: 'pre-apply-report',
      tenant: existingTenant
        ? { action: 'update', status: existingTenant.status, currency: `${existingTenant.defaultCurrency} -> ${FOX_TENANT.defaultCurrency}` }
        : { action: 'create', slug: TENANT_SLUG },
      customDomain: { value: null, reason: 'attached after DNS, in its own step' },
      catalogue: plan.documents.map((document) => ({
        ...tourSummary(document),
        action: existingTours.some((record) => record.slug === document.slug) ? 'update' : 'create',
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
      gatewaySafeSeedFilter(TENANT_SLUG),
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
      const spec = FOX_PROGRAMME_PRICES[tour.pathSlug];
      const document = buildTourDocument(tour, index, tourImages.get(tour.slug) || [], tenant._id, spec ? programmes.get(spec.source) : undefined);
      await Attraction.findOneAndUpdate(
        { slug: tour.slug },
        {
          $set: document,
          // The operator publishes no cancellation policy and no rating; none is carried, and an enquiry has no price.
          $unset: { cancellationPolicy: 1, badges: 1, ...(document.enquiryOnly ? { priceFrom: 1 } : {}) },
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
    const otherCurrency = await Attraction.countDocuments({ tenantIds: tenant._id, currency: { $ne: FOX_TENANT.defaultCurrency } });
    const sold = await Attraction.countDocuments({ ownerTenantId: tenant._id, status: 'active', enquiryOnly: false, priceFrom: { $gt: 0 } });
    const expectedSold = FOX_MARSA_ALAM_TOURS.filter((tour) => FOX_PROGRAMME_PRICES[tour.pathSlug]).length;
    if (owned !== FOX_MARSA_ALAM_TOURS.length || foreignListed !== 0 || otherCurrency !== 0 || sold !== expectedSold) {
      throw new Error(`Post-apply check failed (owned=${owned}, foreignListed=${foreignListed}, otherCurrency=${otherCurrency}, sold=${sold}/${expectedSold}).`);
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
      catalogue: { active: owned, foreignListed, sold, enquiryOnly: owned - sold, currency: FOX_TENANT.defaultCurrency },
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
      booking: FOX_PROGRAMME_PRICES[tour.pathSlug]
        ? `prices, departures and extras of ${FOX_PROGRAMME_PRICES[tour.pathSlug]!.source}, read at apply`
        : 'enquiry only (no published price)',
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
