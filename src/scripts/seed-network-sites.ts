/**
 * Network sites from Fouad's 140-domain list, built in daily batches (owner, 23 October 2026: "build in
 * batches 10 daily", Fouad's HIGH priority first). One run creates or updates one batch of sites on their
 * own storefront designs, each with its own catalogue.
 *
 * A network site is not an operator: it sells trips that operators on the network publish. Every trip names
 * the published programme it is built on and exactly which of its options, extras and departures it sells
 * (`PriceSpec`); the seed copies those structured facts at apply time (options, prices, child rates,
 * departures, extras, inclusions, schedule) and carries words written for the site. Nothing copies a
 * programme's ratings, review counts, badges, cancellation promise or instant confirmation. Prices are the
 * programme's own, in its own currency, which must be the site's currency: a price is never converted. The
 * run stops before its first write if a named option, extra or departure is missing, a child rate has no
 * written terms, or any copied text names a place or brand the site does not carry, or makes a claim.
 *
 * Bookings are pay later and their alerts go to the platform inbox until each site has its own contact.
 * The backend's designMode list cannot take new names until its next release, so the tenants keep
 * `desertfox` and the storefront picks each site's design by slug.
 *
 * Dry run (no database):   npm run seed:network-sites -- --batch=b01
 * Read-only check:         npm run seed:network-sites -- --batch=b01 --check
 * Apply (the whole batch): npm run seed:network-sites -- --batch=b01 --apply \
 *   --confirm-sites=<every slug of the batch, comma-separated, in order> --preview-code-dir=<directory outside git>
 */

import fs from 'fs';
import { gatewaySafeSeedFilter } from '../services/gatewayDomainScope';
import path from 'path';
import { departureAvailabilityType } from '../utils/departureAvailability';
import { EEO_SOURCE, eeoAddonBasisProblems, eeoLiveDrift, eeoProgramme, type EeoSnapshot } from './network-sites/eeo-source';
import EEO_SNAPSHOT from './network-sites/eeo-snapshot.json';

export const LISTING_PATH = '/safaris';
export const LAUNCH_BOOKING_INBOX = 'theegyptexcursionsonline@gmail.com';
const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\/dm3sxllch\/image\/upload\//;

/** Which published programme a trip is built on, and exactly what of it the trip sells. */
export interface PriceSpec {
  /**
   * Where the programme is published: a site on the network (the default), or the client's own main site for a
   * place the network has no programme for (`network-sites/eeo-source.ts`; `tenant` is then EEO_SOURCE and
   * `source` the trip's address there, and `options` name its booking options by their pricing keys).
   */
  provider?: 'network' | 'eeo';
  /** The site that publishes the programme. */
  tenant: string;
  source: string;
  /** The trip category for a programme read from the client's main site, which files trips by its own menu. */
  category?: string;
  /** Option ids to sell. */
  options: string[];
  /** The programme sells children as a separate option: one option with a child price, and the age band. */
  child?: { adult: string; child: string; name: string; description: string; note: string };
  /** A "Need to know" line for options that already carry a child price. */
  childNote?: string;
  /** The site's own name for an option whose programme name describes another trip or reads badly. */
  rename?: Record<string, { name: string; description: string }>;
  /** Options priced for a whole vehicle or a pair, not per guest. */
  vehicle?: Record<string, { riders: number; note: string }>;
  /** Extra ids to sell; `perPerson` ones are charged per guest who takes them, each guest choosing at booking. */
  addons: string[];
  perPerson?: string[];
  /** The site's own words for an extra whose programme name reads badly ("OTHERS: Wetsuit for Snorkeling"). */
  extras?: Record<string, { name: string; description: string }>;
  /** Departures by label; none means the trip is sold by the day and the team confirms the time. */
  departures: string[];
  /** A clearer label for a departure whose programme label is a bare clock time. */
  departureLabels?: Record<string, string>;
  /** The trip's length where the programme's own contradicts the options sold. */
  duration?: string;
  /**
   * The site's own schedule, for a programme whose schedule names its operator or describes an option
   * the trip does not sell (a dinner on a trip sold without one).
   */
  itinerary?: Array<{ time?: string; duration?: string; title: string; description: string }>;
  /** The programme's clock times contradict the departures sold, so its schedule is shown without them. */
  untimedItinerary?: boolean;
  /**
   * Exact programme lines to leave out because they describe an option the trip does not sell. A line the
   * programme no longer has stops the run, so a changed programme is read again before it is sold.
   */
  omit?: { inclusions?: string[]; exclusions?: string[]; needToKnow?: string[] };
  /**
   * Lines the options sold make true (the dinner a dinner option includes), and what they leave out where the
   * programme only says it conditionally ("Snorkeling gear (if selected from add-ons)").
   */
  add?: { inclusions?: string[]; exclusions?: string[]; needToKnow?: string[] };
}

export interface NetworkTrip {
  /** Public address on the site (flat URL). */
  path: string;
  price: PriceSpec;
  title: string;
  short: string;
  description: string;
  highlights: string[];
  seo: { metaTitle: string; metaDescription: string };
  images: string[];
  imageAlts: string[];
  /** The programme itself includes pickup from this site's area, so the site's pickup note does not apply. */
  pickupIncluded?: boolean;
}

export interface NetworkSite {
  slug: string;
  name: string;
  /** The site's trip list (its "Trips" menu item and every trip's parent page); safari sites use /safaris. */
  listingPath?: string;
  /** The domain from Fouad's list; attached only after its DNS points at the network. */
  domain: string;
  /** The network destination its trips are filed under. */
  city: string;
  /** Where the trips collect guests, as a guest would say it ("Marsa Alam, Port Ghalib and El Quseir"). */
  area: string;
  /** The network destination the site collects from (its slug), shown as the site's pickup area. */
  pickupDestination: string;
  coordinates: { lat: number; lng: number };
  currency: 'USD' | 'EUR';
  slugPrefix: string;
  /** Places and brands that must never appear in this site's copy or in anything it copies. */
  foreignPlaces: RegExp;
  /** A "Need to know" line added to every trip that does not include pickup from this area itself (an area some operators charge extra for). */
  pickupNote?: string;
  tagline: string;
  description: string;
  seo: { metaTitle: string; metaDescription: string; keywords: string[] };
  /** The admin palette; the storefront design carries the site's real colours. */
  theme: { primaryColor: string; secondaryColor: string; accentColor: string };
  heroImages: string[];
  /**
   * Why the site has fewer than three photos of its own for the home page: the trips it sells publish fewer.
   * One distinct photo is then enough, and the photos are an open question for the client.
   */
  photoShortfall?: string;
  logo: string;
  trips: NetworkTrip[];
}

export interface NetworkBatch {
  id: string;
  sites: NetworkSite[];
}

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{2714}\u{2728}]/u;
/** Operators and marketplaces whose names a network site never shows. */
export const FOREIGN_BRANDS = /GetYourGuide|TripAdvisor|Viator|Booking\.com|Wild Desert|Desert Fox|Gamila|Safari Sahara|Fox Marsa|Power Safari|Sea Horse|Fox Safari|Makadi Horse Club|Polaris|RZR/i;
const PROCESS_MARKERS = /\b(seed|preview|placeholder|TODO|lorem|QA|staging|internal)\b/i;
/** Claims the network cannot back: rankings, ratings, counts, guarantees, group limits, superlatives. */
export const UNBACKED_CLAIMS = /#1|bestseller|★|\brated\b|\breviews?\b|\bmax\b|skip-the-line|skip the queue|100%|\bexpert\b|zero-light|\bultimate\b|\bepic\b|unforgettable|stunning|breathtaking|spectacular|\bauthentic\b|\bbest\b|budget-friendly|perfect for|polaris|free cancellation|full refund|guaranteed|award|since \d{4}|years of experience|instant confirmation/i;
const CHILD_RATE = /\b(?:child|children|kids?)\b/i;

const COUNT_WORDS: Readonly<Record<string, number>> = { one: 1, two: 2, both: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const STATED_TRIP_COUNT = /\b(one|two|three|four|five|six|seven|eight|nine|ten) (?:trips?|options?)\b|\b(one|two|three|four|five|six|seven|eight|nine|ten) (?:are|is) on (?:offer|sale)\b|(?:^|[.:!?]\s+)(?:All (two|three|four|five|six|seven|eight|nine|ten)|(Both))\b/gim;

/**
 * Every place a site's own copy counts the trips it sells: "sells one trip", "Six trips:", "Three are on
 * offer", "Two options are on sale", a sentence opening "Both …" or "All four …". Holding a trip back
 * leaves such a sentence wrong (White Island said four for the three it sells, 24 Oct), so the batch
 * check holds each count to the trips the site actually sells.
 */
export function statedTripCounts(copy: string): number[] {
  return [...copy.matchAll(STATED_TRIP_COUNT)].map((match) => COUNT_WORDS[(match[1] || match[2] || match[3] || match[4]).toLowerCase()]);
}

const copyOf = (trip: NetworkTrip) => [trip.title, trip.short, trip.description, ...trip.highlights, trip.seo.metaTitle, trip.seo.metaDescription, ...trip.imageAlts].join('\n');

/** Every rule that can be checked without the database. An empty list is a valid batch. */
export function validateBatch(batch: NetworkBatch): string[] {
  const errors: string[] = [];
  const slugs = new Set<string>();
  const tripSlugs = new Set<string>();
  // Each site is its own brand in search results too: two sites under one title split the same searches
  // (Shark Reef carried Ras Mohamed's word for word, 24 Oct).
  const titles = new Map<string, string>();
  for (const site of batch.sites) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(site.slug)) errors.push(`${site.slug}: invalid site slug.`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(site.pickupDestination || '')) errors.push(`${site.slug}: invalid pickup destination.`);
    if (slugs.has(site.slug)) errors.push(`${site.slug}: duplicate site.`);
    slugs.add(site.slug);
    const title = site.seo.metaTitle.trim().toLowerCase();
    const sharedWith = titles.get(title);
    if (sharedWith) errors.push(`${site.slug}: site title repeats ${sharedWith}'s; every site needs its own.`);
    else titles.set(title, site.slug);
    if (!['USD', 'EUR'].includes(site.currency)) errors.push(`${site.slug}: unsupported currency ${site.currency}.`);
    if (!Object.prototype.hasOwnProperty.call(TOWN_REGIONS, site.city)) errors.push(`${site.slug}: no region on record for ${site.city}; add the town to TOWN_REGIONS.`);
    if (new Set(site.heroImages).size !== site.heroImages.length) errors.push(`${site.slug}: hero images must be distinct.`);
    if (site.photoShortfall?.trim() ? site.heroImages.length < 1 : site.heroImages.length < 3) {
      errors.push(`${site.slug}: ${site.photoShortfall?.trim() ? 'one hero image is required' : 'three distinct hero images are required'}.`);
    }
    for (const url of [...site.heroImages, site.logo]) if (!CLOUDINARY.test(url || '')) errors.push(`${site.slug}: image must already be on the network's Cloudinary: ${url}`);
    const siteCopy = [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription, ...site.seo.keywords, site.pickupNote || ''].join('\n');
    if (UNBACKED_CLAIMS.test(siteCopy) || EMOJI.test(siteCopy) || FOREIGN_BRANDS.test(siteCopy) || PROCESS_MARKERS.test(siteCopy) || site.foreignPlaces.test(siteCopy)) {
      errors.push(`${site.slug}: site copy carries a claim, an emoji, a brand, a process word or another place.`);
    }
    if (!site.trips.length) errors.push(`${site.slug}: no trips.`);
    for (const count of new Set(statedTripCounts(siteCopy))) {
      if (count !== site.trips.length) errors.push(`${site.slug}: site copy counts ${count} trip${count === 1 ? '' : 's'}, but the site sells ${site.trips.length}.`);
    }
    const paths = new Set<string>();
    for (const trip of site.trips) {
      const slug = `${site.slugPrefix}${trip.path}`;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trip.path)) errors.push(`${slug}: invalid public path.`);
      if (paths.has(trip.path)) errors.push(`${slug}: duplicate public path.`);
      if (tripSlugs.has(slug)) errors.push(`${slug}: duplicate trip slug.`);
      paths.add(trip.path);
      tripSlugs.add(slug);
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
      const spec = trip.price;
      if (!spec.options.length) errors.push(`${slug}: sells no option.`);
      if (spec.provider === 'eeo' && spec.tenant !== EEO_SOURCE) errors.push(`${slug}: a programme from the client's main site must name ${EEO_SOURCE}.`);
      if (new Set(spec.departures).size !== spec.departures.length || spec.departures.some((label) => !label.trim())) errors.push(`${slug}: departures must name distinct programme departures.`);
      for (const id of spec.perPerson || []) if (!spec.addons.includes(id)) errors.push(`${slug}: extra "${id}" to charge per guest is not sold.`);
      for (const id of Object.keys(spec.vehicle || {})) if (!spec.options.includes(id)) errors.push(`${slug}: vehicle option "${id}" is not sold.`);
      for (const id of Object.keys(spec.rename || {})) if (!spec.options.includes(id)) errors.push(`${slug}: option "${id}" to rename is not sold.`);
      for (const id of Object.keys(spec.extras || {})) if (!spec.addons.includes(id)) errors.push(`${slug}: extra "${id}" to rename is not sold.`);
      if (spec.child && !spec.options.includes(spec.child.adult)) errors.push(`${slug}: the child price needs the adult option "${spec.child.adult}".`);
      const specCopy = [
        ...Object.values(spec.rename || {}).flatMap((words) => [words.name, words.description]),
        ...Object.values(spec.extras || {}).flatMap((words) => [words.name, words.description]),
        ...Object.values(spec.vehicle || {}).map((vehicle) => vehicle.note),
        ...(spec.child ? [spec.child.name, spec.child.description, spec.child.note] : []),
        spec.childNote || '',
        ...Object.values(spec.departureLabels || {}),
        spec.duration || '',
        ...(spec.itinerary || []).flatMap((step) => [step.title, step.description]),
        ...(spec.add?.inclusions || []),
        ...(spec.add?.exclusions || []),
        ...(spec.add?.needToKnow || []),
      ].join('\n');
      if (UNBACKED_CLAIMS.test(specCopy) || EMOJI.test(specCopy) || FOREIGN_BRANDS.test(specCopy) || PROCESS_MARKERS.test(specCopy) || site.foreignPlaces.test(specCopy)) {
        errors.push(`${slug}: option, extra or schedule words carry a claim, a brand, a process word or another place.`);
      }
    }
  }
  return errors;
}

type SourceDoc = Record<string, any>;

/**
 * The programme a trip is built on. Two trips may sell different booking options of one trip on the client's
 * main site, so that programme is told apart by the options it sells.
 */
export const sourceKey = (spec: PriceSpec): string => (spec.provider === 'eeo'
  ? `${spec.tenant}/${spec.source}#${spec.options.join('+')}`
  : `${spec.tenant}/${spec.source}`);

/**
 * A programme from the client's main site, read from the dated snapshot (`network-sites/eeo-snapshot.json`).
 * The extras' charging basis must match the trip's, and the copied extras carry no snapshot-only field.
 */
export function eeoSourceProgramme(spec: PriceSpec, snapshot: EeoSnapshot = EEO_SNAPSHOT as EeoSnapshot): SourceDoc {
  if (spec.tenant !== EEO_SOURCE) throw new Error(`${spec.source}: a programme from the client's main site names ${EEO_SOURCE} as its publisher.`);
  const tour = snapshot.tours.find((item) => item.slug === spec.source);
  if (!tour) throw new Error(`${EEO_SOURCE}/${spec.source}: not in the snapshot read ${snapshot.readAt}.`);
  const programme = eeoProgramme(tour, spec.options, spec.category || 'water');
  const basis = eeoAddonBasisProblems(programme, spec.addons, spec.perPerson);
  if (basis.length) throw new Error(basis.join('\n'));
  return { ...programme, addons: (programme.addons as Array<Record<string, unknown>>).map(({ perGuest, ...addon }) => { void perGuest; return addon; }) };
}

const withoutIds = <T extends Record<string, unknown>>(items: T[] | undefined): Omit<T, '_id'>[] =>
  (items || []).map(({ _id, ...rest }) => { void _id; return rest; });

/**
 * A trip's options, extras and departures from its programme. Fails closed: a programme in another currency,
 * a named option, extra or departure it no longer has, a missing price, or a child rate with no written terms
 * stops the run before any write.
 */
/**
 * The facts about a site that building one trip needs. `NetworkSite` carries them, and so does a site that
 * already exists and is only having its catalogue replaced (`seed-network-high-ten`), which has no tenant
 * record to write.
 */
export type TripSiteFacts = Pick<NetworkSite,
  'slugPrefix' | 'listingPath' | 'city' | 'area' | 'coordinates' | 'currency' | 'pickupNote' | 'foreignPlaces'>;

export function programmeFacts(site: TripSiteFacts, trip: NetworkTrip, programme: SourceDoc) {
  const spec = trip.price;
  const where = `${site.slugPrefix}${trip.path} (${spec.tenant}/${spec.source})`;
  const currency = String(programme.currency || '').trim().toUpperCase();
  if (currency !== site.currency) {
    throw new Error(`${where}: the programme is priced in ${currency || 'no currency'} and the site sells in ${site.currency}. Prices are never converted.`);
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

  // A separate child rate the trip does not price is refused, so a family is never sold the adult rate for its children.
  const childRates = (Array.isArray(programme.pricingOptions) ? programme.pricingOptions : [])
    .filter((option: Record<string, unknown>) => (option?.pricingModel ?? 'per-person') === 'per-person' && CHILD_RATE.test(String(option?.name || '')));
  if (childRates.length && (!spec.child || childRates.length !== 1 || childRates[0].id !== spec.child.child)) {
    throw new Error(`${where}: the programme sells a separate child rate, which needs its terms here.`);
  }
  let pricingOptions = pick(programme.pricingOptions, spec.options, 'id', 'option').map(priced('option'));
  const notes: string[] = [];
  if (spec.child) {
    const terms = spec.child;
    const [child] = pick(programme.pricingOptions, [terms.child], 'id', 'option').map(priced('option'));
    pricingOptions = pricingOptions.map((option) => (option.id === terms.adult
      ? { ...option, name: terms.name, description: terms.description, childPrice: Number(child.price) }
      : option));
    notes.push(terms.note);
  }
  if (spec.childNote) {
    if (!pricingOptions.some((option) => Number.isFinite(Number(option.childPrice)))) throw new Error(`${where}: a child note on options without a child price.`);
    notes.push(spec.childNote);
  }
  for (const [id, words] of Object.entries(spec.rename || {})) {
    pricingOptions = pricingOptions.map((option) => (option.id === id ? { ...option, ...words } : option));
  }
  for (const [id, vehicle] of Object.entries(spec.vehicle || {})) {
    pricingOptions = pricingOptions.map((option) => (option.id === id ? { ...option, pricingModel: 'per-booking', minParticipants: 1, maxParticipants: vehicle.riders } : option));
    notes.push(vehicle.note);
  }
  const addons: Record<string, unknown>[] = pick(programme.addons, spec.addons, 'id', 'extra').map(priced('extra'))
    .map((addon) => (spec.perPerson?.includes(String(addon.id))
      ? { ...addon, pricingModel: 'per-person', pricingType: 'per_person' }
      : { ...addon, pricingModel: 'per-booking', pricingType: 'per_unit' }))
    .map((addon: Record<string, unknown>) => {
      const words = spec.extras?.[String(addon.id)];
      return words ? { ...addon, name: words.name, description: words.description } : addon;
    });
  const entryWindows: Record<string, unknown>[] = pick(programme.entryWindows, spec.departures, 'label', 'departure')
    .map((window) => ({ ...window, label: spec.departureLabels?.[String(window.label)] ?? window.label }));
  // The "from" price is what an adult pays alone: a child rate, a pair or a vehicle never leads.
  const lead = pricingOptions.filter((option) => (option.pricingModel ?? 'per-person') === 'per-person' && !CHILD_RATE.test(String(option.name || '')));
  const priceFrom = Math.min(...(lead.length ? lead : pricingOptions).map((option) => Number(option.price)));
  return { pricingOptions, addons, entryWindows, notes, priceFrom };
}

/** Text a trip copies from its programme: another company's live record, checked before the first write. */
export function copiedFactProblems(site: Pick<NetworkSite, 'foreignPlaces'>, document: Record<string, unknown>): string[] {
  const texts = (items: unknown, ...keys: string[]): string[] => (Array.isArray(items) ? items : [])
    .flatMap((item) => (typeof item === 'string' ? [item] : keys.map((key) => (item as Record<string, unknown> | null)?.[key])))
    .filter((text): text is string => typeof text === 'string');
  return [
    ...texts(document.pricingOptions, 'name', 'description'),
    ...texts(document.addons, 'name', 'description'),
    ...texts(document.entryWindows, 'label'),
    ...texts(document.itinerary, 'title', 'description'),
    ...['inclusions', 'exclusions', 'whatToBring', 'needToKnow', 'participantRequirements', 'accessibility', 'languages'].flatMap((field) => texts(document[field])),
    String(document.duration || ''),
  ]
    .filter((text) => site.foreignPlaces.test(text) || FOREIGN_BRANDS.test(text) || UNBACKED_CLAIMS.test(text) || EMOJI.test(text) || PROCESS_MARKERS.test(text))
    .map((text) => `${String(document.slug)}: copied text names another place or brand, or makes a claim: "${text}"`);
}

/** A copied list, trimmed, with pickup lines in the site's words and claims dropped. */
const cleanList = (items: unknown): string[] =>
  (Array.isArray(items) ? items : [])
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .map((item) => (/^hotel (?:transfers?|pickup\s*(?:\/|&|and)\s*drop-?off)(?: from .*)?$/i.test(item) ? 'Hotel pickup and drop-off' : item))
    .filter((item) => !UNBACKED_CLAIMS.test(item));

/**
 * Each line once: a line the trip adds that the programme already carries (B01's Marsa Alam jeep trip listed its
 * child-price line twice, 24 October) is written a single time.
 */
const once = (items: string[]): string[] => [...new Set(items)];

/** A programme list without the exact lines the trip leaves out; a line that is not there stops the run. */
function withoutLines(site: Pick<NetworkSite, 'slugPrefix'>, trip: NetworkTrip, field: 'inclusions' | 'exclusions' | 'needToKnow', items: unknown): unknown[] {
  const list = Array.isArray(items) ? items : [];
  const drop = trip.price.omit?.[field] || [];
  for (const line of drop) {
    if (!list.includes(line)) throw new Error(`${site.slugPrefix}${trip.path}: "${line}" is not in the programme's ${field}; read the programme again.`);
  }
  return list.filter((item) => !drop.includes(item));
}

/**
 * A network trip's hotel-pickup departures stop selling two hours before they leave (owner decision 27 Oct 2026,
 * PLATFORM #1713; the same rule was applied to the trips already live). A cut-off the programme sets itself, such as
 * a private yacht's 48 hours, is kept; a 0 copied from the programme was never chosen for this site and is replaced.
 * A trip sold by the day has no departure to count back from and gets none.
 */
export const NETWORK_PICKUP_CUTOFF_MINUTES = 120;

export function withPickupCutoff(options: Record<string, unknown>[], availabilityType: unknown): Record<string, unknown>[] {
  if (availabilityType !== 'time-slots') return options;
  return options.map((option) => (Number(option.bookingCutoffMinutes) > 0 ? option : { ...option, bookingCutoffMinutes: NETWORK_PICKUP_CUTOFF_MINUTES }));
}

/** The trip document for one site, from its written copy and the named programme. */
export function tripDocument(site: TripSiteFacts, trip: NetworkTrip, programme: SourceDoc, index: number, tenantId: unknown): Record<string, unknown> {
  const facts = programmeFacts(site, trip, programme);
  const inclusions = once([...cleanList(withoutLines(site, trip, 'inclusions', programme.inclusions)), ...cleanList(trip.price.add?.inclusions)]);
  const pickup = programme.hasHotelPickup === true || inclusions.some((item) => /hotel pickup|pickup and drop-off at your hotel/i.test(item));
  if (!pickup) throw new Error(`${site.slugPrefix}${trip.path}: the programme does not include hotel pickup, which every network trip promises.`);
  const itinerary = (trip.price.itinerary
    ? trip.price.itinerary.map((step) => ({ time: step.time || '', duration: step.duration || '', title: step.title, description: step.description }))
    : withoutIds(programme.itinerary).filter((step) => !UNBACKED_CLAIMS.test(`${(step as { title?: string }).title} ${(step as { description?: string }).description}`)))
    .map((step) => (trip.price.untimedItinerary ? { ...step, time: '' } : step));
  // The departures the trip sells decide how it is sold. A trip that names none is sold by the day,
  // whatever its programme says: the Marsa Mubarak dugong trip publishes one 21:00 slot, which does
  // not fit a snorkelling day, and a 'time-slots' trip with no departure could not be booked at all.
  const availabilityType = facts.entryWindows.length ? programme.availability?.type || departureAvailabilityType(facts.entryWindows) : 'date-only';
  return {
    slug: `${site.slugPrefix}${trip.path}`,
    pathSlug: trip.path,
    parentPage: { label: 'Trips', path: site.listingPath || LISTING_PATH },
    title: trip.title,
    shortDescription: trip.short,
    description: trip.description,
    images: trip.images,
    imageAltTexts: trip.images.map((url, imageIndex) => ({ url, alt: trip.imageAlts[imageIndex] || trip.title })),
    category: programme.category || 'adventure',
    ...(programme.subcategory ? { subcategory: programme.subcategory } : {}),
    destination: { city: site.city, country: 'Egypt', coordinates: site.coordinates },
    ...(trip.price.duration || programme.duration ? { duration: trip.price.duration || programme.duration } : {}),
    languages: cleanList(programme.languages),
    rating: 0,
    reviewCount: 0,
    currency: site.currency,
    enquiryOnly: false,
    pricingOptions: withPickupCutoff(facts.pricingOptions, availabilityType),
    priceFrom: facts.priceFrom,
    addons: facts.addons,
    entryWindows: facts.entryWindows,
    itinerary,
    highlights: trip.highlights,
    inclusions,
    exclusions: once([...cleanList(withoutLines(site, trip, 'exclusions', programme.exclusions)), ...cleanList(trip.price.add?.exclusions)]),
    whatToBring: once(cleanList(programme.whatToBring)),
    needToKnow: once([
      ...cleanList(withoutLines(site, trip, 'needToKnow', programme.needToKnow)),
      ...cleanList(trip.price.add?.needToKnow),
      ...facts.notes,
      ...(site.pickupNote && !trip.pickupIncluded ? [site.pickupNote] : []),
    ]),
    participantRequirements: once(cleanList(programme.participantRequirements)),
    accessibility: once(cleanList(programme.accessibility)),
    gettingThere: [{ mode: 'Hotel pickup', description: `Pickup and drop-off at your hotel in ${site.area}.` }],
    meetingPoint: {
      address: `Your hotel in ${site.area}`,
      instructions: 'The team confirms your pickup time when it confirms your booking.',
      mapUrl: '',
    },
    instantConfirmation: false,
    mobileTicket: true,
    hasHotelPickup: true,
    availability: {
      type: availabilityType,
      advanceBooking: Number(programme.availability?.advanceBooking) > 0 ? Number(programme.availability.advanceBooking) : 30,
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

/**
 * The region each town's sites name in their public address. The Red Sea towns sit in the Red Sea governorate, Sharm
 * El Sheikh in South Sinai; Cairo, Luxor and Fayoum are named alone. A town missing here stops the batch check, so a
 * site is never published under another region's name (the B02 Sharm and Fayoum sites and the B03 Giza sites read
 * "Red Sea" until 25 Oct).
 */
const TOWN_REGIONS: Readonly<Record<string, string | null>> = {
  'El Gouna': 'Red Sea',
  Hurghada: 'Red Sea',
  'Sahl Hasheesh': 'Red Sea',
  'Makadi Bay': 'Red Sea',
  'Marsa Alam': 'Red Sea',
  'Sharm El Sheikh': 'South Sinai',
  Cairo: null,
  Luxor: null,
  Fayoum: null,
};

/** A site's public address: its town, the town's region where it has one, and Egypt. */
export function siteAddress(city: string): string {
  if (!Object.prototype.hasOwnProperty.call(TOWN_REGIONS, city)) throw new Error(`${city}: no region on record for this town.`);
  const region = TOWN_REGIONS[city];
  return region ? `${city}, ${region}, Egypt` : `${city}, Egypt`;
}

export function tenantRecord(site: NetworkSite): Record<string, unknown> {
  return {
    slug: site.slug,
    name: site.name,
    domain: `${site.slug}.foxesnetwork.com`,
    domainMigrated: false,
    customDomainStatus: 'unconfigured',
    tagline: site.tagline,
    description: site.description,
    theme: site.theme,
    fonts: { heading: 'Inter', body: 'Inter' },
    designMode: 'desertfox',
    defaultCurrency: site.currency,
    defaultLanguage: 'en',
    supportedLanguages: ['en'],
    timezone: 'Africa/Cairo',
    // No phone or email is published until the site's operator confirms its own (recorded as an open question).
    contactInfo: { address: siteAddress(site.city) },
    pickupDestinationSlugs: [site.pickupDestination],
    socialLinks: {},
    notificationSettings: { bookingEmail: LAUNCH_BOOKING_INBOX },
    flatUrls: true,
    status: 'active',
    navigation: [
      { label: 'Home', href: '/' },
      { label: 'Trips', href: site.listingPath || LISTING_PATH },
      { label: 'About', href: '/about' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Contact', href: '/contact' },
    ],
    seoSettings: site.seo,
    heroImages: site.heroImages,
    // An initials monogram until the site sends its logo (recorded as an open question).
    logo: site.logo,
    logoDark: site.logo,
    favicon: site.logo,
    paymentSettings: { enabledGateways: ['pay-later'], ownPaymentGateway: false, stripe: { enabled: false } },
    bundleSettings: { mode: 'off', reason: 'The site sells single trips only.' },
    aiSettings: {
      bookingWidget: { enabled: false, position: 'bottom-right', languages: ['en'], autoOpen: false },
      voiceAgent: { enabled: false, languages: ['en'], buttonPosition: 'bottom-right' },
      searchWidget: { enabled: false, placeholder: 'Search trips', showPopularSearches: true, maxSuggestions: 6 },
    },
  };
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function loadBatch(id: string | null): Promise<NetworkBatch> {
  const batches: Record<string, () => Promise<NetworkBatch>> = {
    b01: async () => (await import('./network-sites/b01-safari')).B01_SAFARI,
    b02: async () => (await import('./network-sites/b02')).B02,
    b03a: async () => (await import('./network-sites/b03')).B03A,
    b03b: async () => (await import('./network-sites/b03-rest')).B03B,
    b03c: async () => (await import('./network-sites/b03-rest')).B03C,
    b03d: async () => (await import('./network-sites/b03-rest')).B03D,
    b08a: async () => (await import('./network-sites/b08')).B08A,
    b08b: async () => (await import('./network-sites/b08')).B08B,
    b08c: async () => (await import('./network-sites/b08')).B08C,
    b08d: async () => (await import('./network-sites/b08')).B08D,
  };
  if (!id || !batches[id]) throw new Error(`Pass --batch=<${Object.keys(batches).join('|')}>.`);
  return batches[id]();
}

async function loadState(batch: NetworkBatch) {
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const { Types } = await import('mongoose');
  // Validated with a stand-in id where the tenant does not exist yet, exactly as the write will validate it.
  const schemaCheck: SchemaCheck = (document) => {
    const candidate = { ...document, ownerTenantId: document.ownerTenantId ?? new Types.ObjectId(), tenantIds: (document.tenantIds as unknown[]).map((id) => id ?? new Types.ObjectId()) };
    const error = new Attraction(candidate).validateSync();
    return error ? Object.values(error.errors).map((item) => item.message) : [];
  };
  const specs = batch.sites.flatMap((site) => site.trips.map((trip) => trip.price));
  const networkSpecs = specs.filter((spec) => spec.provider !== 'eeo');
  const owners = [...new Set(networkSpecs.map((spec) => spec.tenant))];
  const ownerDocs = await Tenant.find({ slug: { $in: owners } }).select('_id slug status').lean();
  const ownerIds = new Map(ownerDocs.map((owner) => [owner.slug as string, owner._id]));
  const sources = new Map<string, SourceDoc>();
  const missing: string[] = [];
  for (const key of [...new Set(networkSpecs.map(sourceKey))]) {
    const [tenant, source] = key.split('/');
    const ownerId = ownerIds.get(tenant);
    const programme = ownerId ? await Attraction.findOne({ slug: source, ownerTenantId: ownerId, status: 'active' }).lean() : null;
    if (programme) sources.set(key, programme as SourceDoc);
    else missing.push(key);
  }
  // The client's main site: the snapshot, and only while its live booking options still match it.
  const snapshot = EEO_SNAPSHOT as EeoSnapshot;
  for (const spec of specs.filter((item) => item.provider === 'eeo')) {
    const key = sourceKey(spec);
    if (sources.has(key)) continue;
    const tour = snapshot.tours.find((item) => item.slug === spec.source);
    const drift = tour ? await eeoLiveDrift(tour, spec.options, spec.addons).catch((error: unknown) => [`${key}: live check failed: ${error instanceof Error ? error.message : String(error)}`]) : [`${key}: not in the snapshot.`];
    if (drift.length) { missing.push(`${key} (${drift.join('; ')})`); continue; }
    try { sources.set(key, eeoSourceProgramme(spec, snapshot)); } catch (error) { missing.push(`${key} (${error instanceof Error ? error.message : String(error)})`); }
  }
  const sites = [];
  for (const site of batch.sites) {
    const existing = await Tenant.findOne({ slug: site.slug }).select('+previewAccessCode +previewAccessCodeUpdatedAt');
    const namespaceConflict = await Tenant.findOne({ _id: { $ne: existing?._id }, $or: [{ slug: site.slug }, { domain: `${site.slug}.foxesnetwork.com` }, { customDomain: site.domain }] }).select('slug');
    const slugs = site.trips.map((trip) => `${site.slugPrefix}${trip.path}`);
    const records = await Attraction.find({ slug: { $in: slugs } }).select('slug ownerTenantId tenantIds').lean();
    // A trip slug held by any other tenant is refused; on a first run there is no tenant, so any holder is foreign.
    const collision = records.find((record) => !existing || String(record.ownerTenantId) !== String(existing._id)
      || (record.tenantIds || []).some((id: unknown) => String(id) !== String(existing._id)));
    sites.push({ site, existing, namespaceConflict, existingSlugs: records.map((record) => record.slug), collision: collision ? `Refusing cross-tenant catalogue overwrite: ${collision.slug}.` : null });
  }
  return { sources, missing, sites, schemaCheck };
}

/** A document the attraction schema refuses, in the schema's own words. */
type SchemaCheck = (document: Record<string, unknown>) => string[];

/**
 * Every trip document of one site, built before anything is written, with the copied-text problems and
 * anything the attraction schema would refuse (an enum value, a missing field), so a batch never stops
 * halfway through its writes.
 */
function planSiteTrips(site: NetworkSite, sources: Map<string, SourceDoc>, tenantId: unknown, schemaCheck: SchemaCheck) {
  const problems: string[] = [];
  const documents = site.trips.flatMap((trip, index) => {
    const source = sources.get(sourceKey(trip.price));
    if (!source) return [];
    try {
      const document = tripDocument(site, trip, source, index, tenantId);
      problems.push(...copiedFactProblems(site, document), ...schemaCheck(document).map((problem) => `${String(document.slug)}: ${problem}`));
      return [document];
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  return { documents, problems };
}

const tripSummary = (document: Record<string, unknown>) => ({
  slug: document.slug,
  from: `${String(document.priceFrom)} ${String(document.currency)}`,
  options: (document.pricingOptions as Array<{ name: string; price: number; childPrice?: number; pricingModel?: string; maxParticipants?: number }>)
    .map((option) => `${option.name}: ${option.price}${option.childPrice !== undefined ? ` (child ${option.childPrice})` : ''}${option.pricingModel === 'per-booking' ? ` per booking, up to ${option.maxParticipants}` : ''}`),
  departures: (document.entryWindows as Array<{ label: string; startTime: string }>).map((window) => `${window.label} ${window.startTime}`),
  extras: (document.addons as Array<{ name: string; price: number; pricingModel: string }>).map((addon) => `${addon.name}: ${addon.price} ${addon.pricingModel}`),
});

async function checkPlan(batch: NetworkBatch): Promise<void> {
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  await connectDatabase();
  try {
    const { sources, missing, sites, schemaCheck } = await loadState(batch);
    console.log(JSON.stringify({
      mode: 'check',
      batch: batch.id,
      missingSourceProgrammes: missing,
      sites: sites.map(({ site, existing, namespaceConflict, existingSlugs, collision }) => {
        const plan = planSiteTrips(site, sources, existing?._id ?? null, schemaCheck);
        return {
          slug: site.slug,
          tenant: existing ? { action: 'update', status: existing.status } : { action: 'create' },
          namespaceConflict: namespaceConflict?.slug ?? null,
          existingTripSlugs: existingSlugs,
          collision,
          copyProblems: plan.problems,
          trips: plan.documents.map(tripSummary),
        };
      }),
      writes: 'none',
    }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

async function applyPlan(batch: NetworkBatch): Promise<void> {
  const expected = batch.sites.map((site) => site.slug).join(',');
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
    const { sources, missing, sites, schemaCheck } = await loadState(batch);
    // The whole batch is checked before the first write, so a guard failure writes nothing at all.
    if (missing.length) throw new Error(`Source programmes missing or inactive: ${missing.join(', ')}.`);
    for (const { site, existing, namespaceConflict, collision } of sites) {
      if (existing && !['active', 'coming_soon', 'pending'].includes(existing.status)) throw new Error(`${site.slug}: protected status ${existing.status}.`);
      if (existing?.domainMigrated) throw new Error(`${site.slug}: already serves its own domain.`);
      if (existing?.gatewayDomainRevision !== undefined) throw new Error(`${site.slug}: gateway domain ownership is protected.`);
      if (namespaceConflict) throw new Error(`${site.slug}: namespace owned by ${namespaceConflict.slug}.`);
      if (collision) throw new Error(`${site.slug}: ${collision}`);
      const { problems } = planSiteTrips(site, sources, existing?._id ?? null, schemaCheck);
      if (problems.length) throw new Error(`${site.slug}: nothing was written.\n- ${problems.join('\n- ')}`);
    }

    const report = [];
    for (const { site, existing } of sites) {
      const previewAccessCode = existing?.previewAccessCode || generatePreviewAccessCode();
      const { supportedLanguages, ...record } = tenantRecord(site);
      const tenant = await Tenant.findOneAndUpdate(
        gatewaySafeSeedFilter(site.slug),
        {
          $set: { ...record, previewAccessCode, previewAccessCodeUpdatedAt: existing?.previewAccessCodeUpdatedAt || new Date() },
          // Languages are set only on a first run: Arabic is switched on separately once its pages and
          // catalogue are live, and a rerun must never switch it back off.
          $setOnInsert: { supportedLanguages },
          // The domain is attached in its own step, after DNS.
          $unset: { customDomain: 1 },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
      fs.writeFileSync(path.join(codeDir, `${site.slug}.txt`), `${previewAccessCode}\n`, { mode: 0o600 });
      for (const [index, trip] of site.trips.entries()) {
        const source = sources.get(sourceKey(trip.price));
        if (!source) throw new Error(`${site.slug}: source ${trip.price.source} vanished mid-run.`);
        const document = tripDocument(site, trip, source, index, tenant._id);
        await Attraction.findOneAndUpdate(
          { slug: document.slug },
          // Never carried: the source's cancellation promise and badges.
          { $set: document, $unset: { cancellationPolicy: 1, badges: 1 } },
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
        );
      }
      const owned = await Attraction.countDocuments({ ownerTenantId: tenant._id, status: 'active', slug: { $in: site.trips.map((trip) => `${site.slugPrefix}${trip.path}`) } });
      const foreignListed = await Attraction.countDocuments({ tenantIds: tenant._id, ownerTenantId: { $ne: tenant._id } });
      const rated = await Attraction.countDocuments({ ownerTenantId: tenant._id, $or: [{ rating: { $gt: 0 } }, { reviewCount: { $gt: 0 } }] });
      const otherCurrency = await Attraction.countDocuments({ ownerTenantId: tenant._id, currency: { $ne: site.currency } });
      if (owned !== site.trips.length || foreignListed !== 0 || rated !== 0 || otherCurrency !== 0) {
        throw new Error(`${site.slug}: post-apply check failed (owned=${owned}, foreignListed=${foreignListed}, rated=${rated}, otherCurrency=${otherCurrency}).`);
      }
      report.push({ slug: tenant.slug, status: tenant.status, designMode: tenant.designMode, currency: tenant.defaultCurrency, trips: owned, previewCode: `${site.slug}.txt` });
    }
    console.log(JSON.stringify({
      mode: 'applied',
      batch: batch.id,
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
  const batch = await loadBatch(argValue('batch'));
  const errors = validateBatch(batch);
  if (errors.length) throw new Error(`Batch ${batch.id} is invalid:\n- ${errors.join('\n- ')}`);
  if (process.argv.includes('--check')) return checkPlan(batch);
  if (process.argv.includes('--apply')) return applyPlan(batch);
  console.log(JSON.stringify({
    mode: 'dry-run',
    batch: batch.id,
    sites: batch.sites.map((site) => ({
      slug: site.slug,
      name: site.name,
      currency: site.currency,
      trips: site.trips.map((trip) => ({ path: `/${trip.path}`, title: trip.title, from: sourceKey(trip.price), photos: trip.images.length })),
    })),
    safeguards: ['no database connection', 'no upload', 'no DNS or deployment', 'no notification'],
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[network-sites] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
