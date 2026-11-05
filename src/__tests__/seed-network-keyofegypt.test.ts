import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import {
  copiedFactProblems, eeoSourceProgramme, logoProblems, statedTripCounts, tenantRecord, tripDocument,
  validateBatch, type NetworkSite, type NetworkTrip, type TripSiteFacts,
} from '../scripts/seed-network-sites';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';
import { B02 } from '../scripts/network-sites/b02';
import { B03A, PROGRAMMES as B03P } from '../scripts/network-sites/b03';
import { B03B, B03C, B03D, PROGRAMMES as B03RP } from '../scripts/network-sites/b03-rest';
import { B08A, B08B, B08C, B08D, PROGRAMMES_D as B08DP } from '../scripts/network-sites/b08';
import { B09A, B09B, B09C, PROGRAMMES_B as B09BP } from '../scripts/network-sites/b09';
import { B10A, B10B, B10C, B10D } from '../scripts/network-sites/b10';
import { B11A, B11B } from '../scripts/network-sites/b11';
import { B12A, B12B } from '../scripts/network-sites/b12';
import { B13A, B13B } from '../scripts/network-sites/b13';
import { B14A, B14B } from '../scripts/network-sites/b14';
import { B15A, B15B } from '../scripts/network-sites/b15';
import { B15C } from '../scripts/network-sites/b15c';
import { B16 } from '../scripts/network-sites/b16';
import { KEYOFEGYPT } from '../scripts/network-sites/keyofegypt';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';
import { isTenantBookingCreationClosed } from '../services/tenantBookingPolicy.service';

const EARLIER = [B01_SAFARI, B02, B03A, B03B, B03C, B03D, B08A, B08B, B08C, B08D, B09A, B09B, B09C,
  B10A, B10B, B10C, B10D, B11A, B11B, B12A, B12B, B13A, B13B, B14A, B14B, B15A, B15B, B15C, B16]
  .flatMap((batch) => batch.sites);
const SITES = KEYOFEGYPT.sites;
const SITE = SITES[0];

/**
 * Key of Egypt Tours is site 129 and the first of the network that stands for a tour company of the Nile valley
 * rather than for a place or for a business on Fouad's domain list. Its domain, `keyofegypt.travel`, is the
 * one the owner named. The tests below hold the site to claiming nothing
 * about the company beyond its name and its badge, to selling exactly the eight days the selection gives it, and
 * to taking no booking until the owner opens it.
 */
const KOE_TRIPS = 8;
/** The client's domain, named by the owner on 5 Nov. */
const DOMAIN = 'keyofegypt.travel';
/** The storefront design, which the storefront picks by slug. */
const DESIGN = 'keyofegypt';
/** The admin palette the site is created with (primary / secondary / accent). */
const THEME: [string, string, string] = ['#0B3A4E', '#F7F2E7', '#B8862B'];
/** The client's own badge, uploaded 5 November. One round mark, so no separate dark version exists. */
const BADGE = 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793880149/attractions-network/tenant-logos/key-of-egypt-tours/client-0d02a3b1fadd.png';

/**
 * What the site shows, held here as literals so the data is checked against the addresses the network already
 * publishes rather than against itself. No picture was made for this site: both are photographs the client
 * publishes on days the site sells, and neither is a photograph of the company.
 */
const SITE_PICTURES = [
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1792927962/attractions-network/network-b03/memphis-and-sakkara/i7hlesmpg9oel1enka8o.jpg',
  'https://res.cloudinary.com/dm3sxllch/image/upload/v1787780674/tours/cyqhwwakyack600gfghk.jpg',
];

/** Each trip's day, as the selection gives it: the public path of the trip against the record it sells. */
const DAYS: Record<string, string> = {
  'five-hours-an-hour-in-the-saddle-two-among-the-pyramids': 'giza-pyramids-sunrise-morning-guided-tour-with-camel-ride-breakfast',
  'a-private-day-between-the-plateau-and-the-new-museum': 'giza-pyramids-sphinx-grand-egyptian-museum-private',
  'shared-or-private-giza-sakkara-and-the-ruins-of-memphis': 'giza-pyramids-sakkara-memphis-day-tour-with-nile-sail',
  'twelve-hours-tahrir-square-the-citadel-four-churches-and-the-river': 'cairo-egyptian-museum-citadel-coptic-cairo-nile-dinner-cruise',
  'an-eleven-oclock-start-the-museum-the-old-quarter-and-the-bazaar': 'cairo-private-heritage-tour-museum-citadel-old-cairo',
  'west-bank-in-the-morning-a-sail-and-two-temples-after': 'luxor-east-west-bank-private-tour-with-traditional-felucca-nile-cruise',
  'an-hour-under-sail-then-the-lit-temple-at-karnak': 'luxor-sunset-felucca-ride-karnak-sound-and-light-show',
  'a-three-oclock-start-for-the-valley-of-the-kings': 'marsa-alam-to-luxor-valley-of-the-kings-ancient-temples-tour',
};

/** Where each day starts: a trip that names no town of its own starts where the site does, in Cairo. */
const STARTS: Record<string, [string, string]> = {
  'five-hours-an-hour-in-the-saddle-two-among-the-pyramids': ['Cairo', 'Cairo or Giza'],
  'a-private-day-between-the-plateau-and-the-new-museum': ['Cairo', 'Cairo or Giza'],
  'shared-or-private-giza-sakkara-and-the-ruins-of-memphis': ['Cairo', 'Cairo or Giza'],
  'twelve-hours-tahrir-square-the-citadel-four-churches-and-the-river': ['Cairo', 'Cairo or Giza'],
  'an-eleven-oclock-start-the-museum-the-old-quarter-and-the-bazaar': ['Cairo', 'Cairo or Giza'],
  'west-bank-in-the-morning-a-sail-and-two-temples-after': ['Luxor', 'Luxor'],
  'an-hour-under-sail-then-the-lit-temple-at-karnak': ['Luxor', 'Luxor'],
  'a-three-oclock-start-for-the-valley-of-the-kings': ['Marsa Alam', 'Marsa Alam'],
};

/**
 * The one copied line in the whole catalogue that holds only on request. It is published on every option of the
 * Giza, Sakkara and Memphis record, three live network sites already carry it word for word, and rewriting it
 * would change those three sites. It is named here so a changed record cannot add a second one unnoticed.
 */
const ON_REQUEST_LINE = 'Visits: Papyrus Gallery, Oils Factory, Bazaar, Cotton Store, Carpet School (upon request)';
/** A line that holds only for an option the trip does not sell, or for an extra it cannot offer. */
const CONDITIONAL = /\(if |if selected|if add-on|if (?:the )?option|add on selection|5h Tour:|8h Tour:|depending on the option|upon request/i;

/** What the site may never claim about the company: how it is thought of, how long it has traded, where it is. */
const A_PHONE = /(?:\+|00)\d[\d\s()-]{7,}|\b\d{3,4}[\s-]\d{3,4}[\s-]\d{3,4}\b/;
const A_STANDING = /\b\d(?:\.\d)?\s*(?:stars?|out of (?:five|ten))|\brated\b|\b\d+(?:,\d{3})*\+?\s+(?:guests|customers|travellers|bookings)\b|licen[cs]e (?:number|no\.?)\s*[:#]?\s*\w|registration number[:#]|\b\d+\s+years\b|established in \d{4}|\bfleet of \d+/i;
const AN_ADDRESS = /\b\d+\s+(?:street|st\.?|road|rd\.?|avenue|ave\.?)\b|\bP\.?O\.? Box\b|\bsuite \d+/i;

/** The towns and monuments the site's days do not reach, Aswan and Abu Simbel among them. */
const BARRED = ['Hurghada', 'Sharm El Sheikh', 'Dahab', 'Nuweiba', 'Taba', 'Nabq', 'Tiran', 'Ras Mohamed',
  'St Catherine', 'El Quseir', 'Quseer', 'Port Ghalib', 'Safaga', 'Soma Bay', 'Makadi Bay', 'El Gouna',
  'Sahl Hasheesh', 'Hamata', 'Alexandria', 'Aswan', 'Abu Simbel', 'Siwa', 'Bahariya', 'Fayoum', 'Dendera',
  'Edfu', 'Kom Ombo', 'Abydos', 'White Desert'];
/** The places its days do reach, which the fence must let through. */
const ALLOWED = ['Cairo', 'Giza', 'Sakkara', 'Saqqara', 'Memphis', 'Dahshur', 'Luxor', 'Karnak', 'Marsa Alam',
  'the Nile', 'Tahrir Square', 'Khan el-Khalili', 'the Valley of the Kings'];

/** No two sites on the network may read alike: the shingle rule batches B14 to B16 run on. */
const SHINGLE = 8;
const CLOSING_LINE = 'Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.';
const normalise = (text: string) => text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const runsOf = (text: string): string[] => {
  const words = normalise(text).split(' ').filter(Boolean);
  const out: string[] = [];
  for (let index = 0; index + SHINGLE <= words.length; index += 1) out.push(words.slice(index, index + SHINGLE).join(' '));
  return out;
};

type Copy = { site: string; record: string | null; where: string; text: string };
const copyOfSite = (site: NetworkSite): Copy[] => [
  { site: site.slug, record: null, where: 'tagline', text: site.tagline },
  { site: site.slug, record: null, where: 'description', text: site.description.split(CLOSING_LINE).join(' ') },
  { site: site.slug, record: null, where: 'seo.metaTitle', text: site.seo.metaTitle },
  { site: site.slug, record: null, where: 'seo.metaDescription', text: site.seo.metaDescription },
  ...site.seo.keywords.map((word) => ({ site: site.slug, record: null, where: 'seo.keywords', text: word })),
  ...site.trips.flatMap((trip) => {
    const at = (where: string, text: string) => ({ site: site.slug, record: trip.price.source, where: `${trip.path} ${where}`, text });
    return [
      at('title', trip.title), at('short', trip.short), at('description', trip.description),
      ...trip.highlights.map((line) => at('highlights', line)),
      at('seo.metaTitle', trip.seo.metaTitle), at('seo.metaDescription', trip.seo.metaDescription),
    ];
  }),
];

const LIVE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'network-b14-existing-copy.json'), 'utf8')) as {
  readAt: string;
  trips: Array<{ site: string; pathSlug: string; record: string; fields: string[] }>;
  titles: string[];
  tenants: Array<{ slug: string; fields: string[] }>;
};

const CORPUS: Copy[] = [
  ...EARLIER.flatMap(copyOfSite),
  ...LIVE.trips.flatMap((trip) => trip.fields.map((text) => ({ site: trip.site, record: trip.record, where: `live ${trip.pathSlug}`, text }))),
  ...LIVE.tenants.flatMap((tenant) => tenant.fields.map((text) => ({ site: tenant.slug, record: null, where: 'live tenant', text: text.split(CLOSING_LINE).join(' ') }))),
];

const RECORDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'network-keyofegypt-record-names.json'), 'utf8')) as Record<string, Record<string, unknown>>;

const tour = (slug: string) => (SNAPSHOT.tours as Array<Record<string, any>>).find((item) => item.slug === slug);

const built = (site: TripSiteFacts, trips: NetworkTrip[]) => trips
  .map((trip, index) => tripDocument(site, trip, eeoSourceProgramme(trip.price), index, new Types.ObjectId()) as Record<string, any>);

const guestCopy = (document: Record<string, any>): string => [
  document.title,
  document.shortDescription,
  document.description,
  String(document.duration || ''),
  ...(document.highlights as string[]),
  ...(document.pricingOptions as Array<{ name: string; description: string }>).flatMap((option) => [option.name, option.description]),
  ...(document.addons as Array<{ name: string; description: string }>).flatMap((addon) => [addon.name, addon.description]),
  ...(document.entryWindows as Array<{ label: string }>).map((window) => window.label),
  ...(document.itinerary as Array<{ title: string; description: string }>).flatMap((step) => [step.title, step.description]),
  ...(document.inclusions as string[]),
  ...(document.exclusions as string[]),
  ...(document.needToKnow as string[]),
  ...(document.whatToBring as string[]),
  ...(document.imageAltTexts as Array<{ alt: string }>).map((image) => image.alt),
  document.seo.metaTitle,
  document.seo.metaDescription,
].join('\n');

/** What this site itself writes for a trip: its own words, not the record's. */
const ownCopyOf = (trip: NetworkTrip): string => [
  trip.title, trip.short, trip.description, ...trip.highlights, trip.seo.metaTitle, trip.seo.metaDescription,
].join('\n');

/** Every word the site publishes of its own: the tenant copy and its trips' own words. */
const WORDS = [SITE.tagline, SITE.description, SITE.seo.metaTitle, SITE.seo.metaDescription, ...SITE.seo.keywords,
  SITE.photoShortfall || '', ...SITE.trips.map(ownCopyOf), ...SITE.trips.flatMap((trip) => trip.imageAlts)].join('\n');

/** Every rule a Key of Egypt Tours trip keeps. */
function expectCompleteTrip(site: Pick<NetworkSite, 'foreignPlaces'>, document: Record<string, any>): void {
  expect(copiedFactProblems(site, document)).toEqual([]);
  expect(new Attraction(document).validateSync()?.errors ?? {}).toEqual({});
  expect([document.currency, document.rating, document.reviewCount, document.instantConfirmation, document.hasHotelPickup])
    .toEqual(['USD', 0, 0, false, true]);
  // The one on-request line the network already publishes for one of these records is allowed through; nothing else is.
  expect([...document.inclusions, ...document.exclusions].filter((line: string) => CONDITIONAL.test(line) && line !== ON_REQUEST_LINE)).toEqual([]);
  expect((document.needToKnow as string[]).filter((line: string) => CONDITIONAL.test(line))).toEqual([]);
  expect(guestCopy(document)).not.toMatch(/authentic|\bexpert\b|breathtaking|spectacular|\bbest\b|unforgettable|world.s largest|\bfamous\b|Pickup location|drop-off locations|magical|luxury VIP/i);
  // A guest reads the trip, not our notes on it: no line speaks of the record it was written from.
  expect(guestCopy(document)).not.toMatch(/\bsnapshot\b|\bbatch\b|\bprogramme record\b/i);
  for (const field of ['inclusions', 'exclusions', 'needToKnow', 'whatToBring'] as const) {
    const lines = document[field] as string[];
    expect(new Set(lines).size).toBe(lines.length);
  }
  expect(document.itinerary.length).toBeGreaterThan(2);
  expect(String(document.duration)).toMatch(/^\d+(\.\d+)?(( ?- ?| to )\d+(\.\d+)?)? (hours?|days?)$/);
  for (const option of document.pricingOptions as Array<Record<string, unknown>>) {
    expect(Number(option.price)).toBeGreaterThan(0);
    if (option.childPrice !== undefined) expect(Number(option.childPrice)).toBeLessThan(Number(option.price));
  }
  expect(document.availability.type).toBe(document.entryWindows.length ? 'time-slots' : 'date-only');
  const childPriced = (document.pricingOptions as Array<Record<string, unknown>>).some((option) => option.childPrice !== undefined);
  expect((document.needToKnow as string[]).join('\n')).toMatch(childPriced ? /have their own price|pay the child price/ : /pay the same price as adults/);
}

describe('Key of Egypt Tours: one site for a Nile valley tour company, on its own domain', () => {
  it('is one site, built before nowhere, and is not the King of Egypt Tours preview', () => {
    expect(KEYOFEGYPT.id).toBe('keyofegypt');
    expect(SITES).toHaveLength(1);
    expect(SITE.slug).toBe('key-of-egypt-tours');
    expect(SITE.name).toBe('Key of Egypt Tours');
    expect(DESIGN).toMatch(/^[a-z]+$/);
    expect([SITE.currency, SITE.listingPath]).toEqual(['USD', '/trips']);
    expect([SITE.theme.primaryColor, SITE.theme.secondaryColor, SITE.theme.accentColor]).toEqual(THEME);
    // The tenant record keeps every network site on the shared design; the storefront picks the brand by slug.
    expect(tenantRecord(SITE).designMode).toBe('desertfox');
    expect(SITE.seo.metaTitle.length).toBeLessThanOrEqual(60);
    expect(SITE.seo.metaDescription.length).toBeLessThanOrEqual(160);
    expect(SITE.seo.keywords).toHaveLength(5);
    expect(SITE.tagline.length).toBeLessThanOrEqual(60);
    // English only at launch: Arabic is a separate step the owner is holding.
    expect(tenantRecord(SITE).supportedLanguages).toEqual(['en']);
    expect(tenantRecord(SITE).defaultLanguage).toBe('en');
    // A site already live carries a name one letter away from this one, and neither touches the other.
    const liveSlugs = new Set(LIVE.tenants.map((tenant) => tenant.slug));
    expect(liveSlugs.has('king-of-egypt-tours')).toBe(true);
    expect(liveSlugs.has(SITE.slug)).toBe(false);
    // No slug, prefix, domain or site title an earlier batch already holds.
    expect(EARLIER.map((site) => site.slug)).not.toContain(SITE.slug);
    expect(EARLIER.map((site) => site.slugPrefix)).not.toContain(SITE.slugPrefix);
    expect(EARLIER.map((site) => site.domain)).not.toContain(SITE.domain);
    expect(SITE.slugPrefix).toBe('koe-');
    const titles = [...EARLIER, ...SITES].map((site) => site.seo.metaTitle.trim().toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    const slugs = [...EARLIER, ...SITES].flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(validateBatch(KEYOFEGYPT)).toEqual([]);
  });

  it('carries the domain the owner named, attached in its own step like every network site', () => {
    expect(SITE.domain).toBe(DOMAIN);
    const record = tenantRecord(SITE);
    // The seed publishes the network address and leaves the custom domain to the bind after DNS.
    expect(record.domain).toBe(`${SITE.slug}.foxesnetwork.com`);
    expect(record.customDomain).toBeUndefined();
    expect(record.domainMigrated).toBe(false);
    expect(record.customDomainStatus).toBe('unconfigured');
    expect(EARLIER.filter((site) => /foxesnetwork\.com$/.test(site.domain))).toEqual([]);
  });

  it('shows only photographs the network already publishes, and says it has none of the company', () => {
    const earlierImages = new Set(EARLIER.flatMap((site) => [...site.heroImages, ...site.trips.flatMap((trip) => trip.images)]));
    expect(SITE.heroImages).toEqual(SITE_PICTURES);
    expect(SITE.heroImages).toHaveLength(2);
    expect(new Set(SITE.heroImages).size).toBe(SITE.heroImages.length);
    for (const url of [...SITE.heroImages, ...SITE.trips.flatMap((trip) => trip.images)]) {
      expect(earlierImages.has(url)).toBe(true);
    }
    // Fewer than three of its own, so the site carries its note, and the note never calls a photograph the company.
    expect(SITE.heroImages.length).toBeLessThan(3);
    expect(SITE.photoShortfall).toMatch(/^No photograph of this company could be made/);
    expect(SITE.photoShortfall).toMatch(/none of its own is reused/);
    expect(SITE.photoShortfall).toMatch(/Neither is a photograph of the company/);
    // Each hero is a photograph the client publishes on a record this site sells.
    const myRecords = new Set(SITE.trips.map((trip) => trip.price.source));
    for (const url of SITE.heroImages) {
      const sellers = EARLIER.filter((site) => site.trips.some((trip) => myRecords.has(trip.price.source) && trip.images.includes(url)));
      expect(sellers.length).toBeGreaterThan(0);
    }
  });

  it('describes every photograph in the words the network already carries for it', () => {
    const earlierAlts = new Map<string, Set<string>>();
    for (const site of EARLIER) for (const trip of site.trips) {
      trip.images.forEach((url, index) => {
        if (!earlierAlts.has(url)) earlierAlts.set(url, new Set());
        earlierAlts.get(url)!.add(trip.imageAlts[index]);
      });
    }
    for (const trip of SITE.trips) {
      expect(trip.images).toHaveLength(1);
      expect(trip.imageAlts).toHaveLength(1);
      // The network describes each of these photographs exactly one way, and this is that way.
      expect([...(earlierAlts.get(trip.images[0]) || [])]).toEqual([trip.imageAlts[0]]);
      // And the photograph is one the client publishes on the record this trip sells.
      const sellers = EARLIER.filter((site) => site.trips.some((other) => other.price.source === trip.price.source && other.images.includes(trip.images[0])));
      expect(sellers.length).toBeGreaterThan(0);
    }
  });

  it('sells exactly the eight days the selection gives it, each from the dated snapshot', () => {
    expect(Object.fromEntries(SITE.trips.map((trip) => [trip.path, trip.price.source]))).toEqual(DAYS);
    expect(SITE.trips).toHaveLength(KOE_TRIPS);
    // No record is sold twice inside the site.
    expect(new Set(SITE.trips.map((trip) => trip.price.source)).size).toBe(KOE_TRIPS);
    for (const trip of SITE.trips) {
      expect(trip.price.provider).toBe('eeo');
      expect(trip.price.tenant).toBe('egypt-excursions-online');
      expect((SNAPSHOT.tours as Array<{ slug: string }>).map((item) => item.slug)).toContain(trip.price.source);
    }
    // What each record says about itself, kept beside this test: its published title, its booking options and
    // its schedule, from the dated snapshot.
    expect(Object.keys(RECORDS).sort()).toEqual(Object.values(DAYS).sort());
    for (const [slug, record] of Object.entries(RECORDS)) {
      const found = tour(slug)!;
      expect(found.detail.title).toBe(record.title);
      expect((found.options as Array<{ title: string }>).map((option) => option.title)).toEqual(record.options);
      expect((found.options as Array<{ pricingKey: string }>).map((option) => option.pricingKey)).toEqual(record.optionKeys);
      expect((found.detail.itinerary as Array<{ title: string }> | null || []).map((step) => step.title)).toEqual(record.itinerary);
      // Every record sold is published per guest, which is what the source reader will sell.
      expect(record.optionTypes).toEqual(['Per Person']);
    }
    // The spread the brief asks for: Cairo or Giza, Luxor, and one day up from the Red Sea coast.
    const towns = SITE.trips.map((trip) => (trip.where ? trip.where.city : SITE.city));
    expect(towns.filter((town) => town === 'Cairo')).toHaveLength(5);
    expect(towns.filter((town) => town === 'Luxor')).toHaveLength(2);
    expect(towns.filter((town) => town === 'Marsa Alam')).toHaveLength(1);
    // And both ways of taking a day, where one record publishes both: the shared option and two private ones.
    const sharedAndPrivate = SITE.trips.find((trip) => trip.path === 'shared-or-private-giza-sakkara-and-the-ruins-of-memphis')!;
    expect(sharedAndPrivate.price.options).toHaveLength(3);
    expect(Object.values(sharedAndPrivate.price.rename || {}).map((words) => words.name))
      .toEqual(['Shared tour in English', 'Private tour in English', 'Private tour in Italian or Spanish']);
  });

  it('reaches no Aswan and no Abu Simbel day, because the client publishes none', () => {
    // The only records that stand before those monuments are the multi-day packages with hotels, flights and a
    // cruise, which no batch on the network sells. Nothing here claims one, and the fence bars both names.
    const dayRecords = (SNAPSHOT.tours as Array<Record<string, any>>)
      .filter((item) => /aswan|abu-simbel/i.test(item.slug));
    expect(dayRecords).toEqual([]);
    expect(WORDS).not.toMatch(/Aswan|Abu Simbel/i);
    expect(SITE.foreignPlaces.test('Aswan')).toBe(true);
    expect(SITE.foreignPlaces.test('Abu Simbel')).toBe(true);
  });

  it('names only the places its own days reach, and bars every other town the client sells', () => {
    for (const place of BARRED) expect([place, SITE.foreignPlaces.test(place)]).toEqual([place, true]);
    for (const place of ALLOWED) expect([place, SITE.foreignPlaces.test(place)]).toEqual([place, false]);
    // El Quseir is barred in both spellings the records use, so the one record whose own schedule names the town
    // can never reach a page: the day is sold as the Marsa Alam day its inclusions and exclusions describe.
    expect(tour(DAYS['a-three-oclock-start-for-the-valley-of-the-kings'])!.detail.itinerary
      .some((step: { title?: string }) => /Quse/i.test(String(step.title || '')))).toBe(true);
    for (const document of built(SITE, SITE.trips)) {
      expect((document.itinerary as Array<{ title: string }>).filter((step) => /Quse/i.test(step.title))).toEqual([]);
    }
  });

  it('claims nothing about the company that the company does not publish itself', () => {
    // Only a name and a badge are known, so the site carries no price of its own, no telephone number, no
    // standing, no licence, no address and no count of anything.
    expect(WORDS).not.toMatch(/[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/);
    expect(WORDS).not.toMatch(A_PHONE);
    expect(WORDS).not.toMatch(A_STANDING);
    expect(WORDS).not.toMatch(AN_ADDRESS);
    expect(WORDS).not.toMatch(/\bofficial\b|\blicensed (?:operator|agency|company)\b|\bour fleet\b|\bour team of\b/i);
    expect(WORDS).not.toMatch(/\bpreview\b|\bplaceholder\b|\bstaging\b/i);
    // And it says plainly what it is, and that nothing more about the company is claimed.
    expect(SITE.description).toMatch(/an independent seller of day trips another company publishes and runs/);
    expect(SITE.description).toMatch(/this site claims nothing else about the company behind them/);
    expect(SITE.description).toMatch(/because nothing published anywhere says any of it/);
    // No phone or email is published until the site's operator confirms its own.
    const contact = tenantRecord(SITE).contactInfo as Record<string, unknown>;
    expect(Object.keys(contact)).toEqual(['address']);
    expect(contact.address).toBe('Cairo, Egypt');
  });

  it('writes the page to the shape every network site keeps', () => {
    expect(SITE.description.split('\n\n')).toHaveLength(2);
    expect(SITE.description).toContain('Every trip collects you from your hotel and brings you back');
    expect(SITE.description).toContain('Hold a place online and pay later');
    for (const trip of SITE.trips) {
      expect(trip.description.split('\n\n')).toHaveLength(2);
      expect(trip.highlights).toHaveLength(4);
      expect(new Set(trip.highlights).size).toBe(4);
      expect(trip.short.length).toBeLessThanOrEqual(160);
      expect(trip.seo.metaTitle.length).toBeLessThanOrEqual(70);
      expect(trip.seo.metaDescription.length).toBeLessThanOrEqual(165);
    }
    // The site counts the trips it sells, and the count is held to the catalogue.
    const copy = [SITE.tagline, SITE.description, SITE.seo.metaTitle, SITE.seo.metaDescription, ...SITE.seo.keywords].join('\n');
    for (const count of statedTripCounts(copy)) expect(count).toBe(KOE_TRIPS);
    expect(statedTripCounts(SITE.description)).toEqual([KOE_TRIPS]);
  });

  it('builds every trip into a complete trip', () => {
    let count = 0;
    for (const document of built(SITE, SITE.trips)) { expectCompleteTrip(SITE, document); count += 1; }
    expect(count).toBe(KOE_TRIPS);
  });

  it('starts each day where the record collects, and says so on the page', () => {
    for (const trip of SITE.trips) {
      const [city, area] = STARTS[trip.path];
      expect([trip.where?.city ?? SITE.city, trip.where?.area ?? SITE.area]).toEqual([city, area]);
    }
    for (const document of built(SITE, SITE.trips)) {
      const trip = SITE.trips.find((item) => `${SITE.slugPrefix}${item.path}` === document.slug)!;
      const [, area] = STARTS[trip.path];
      expect(document.meetingPoint.address).toBe(`Your hotel in ${area}`);
      expect(document.destination.city).toBe(STARTS[trip.path][0]);
    }
    // The two Luxor days take the coordinates and the pickup town the network's own Luxor sites use.
    const karnak = B03B.sites.find((site) => site.slug === 'temple-of-karnak')!;
    for (const path of ['west-bank-in-the-morning-a-sail-and-two-temples-after', 'an-hour-under-sail-then-the-lit-temple-at-karnak']) {
      expect(SITE.trips.find((trip) => trip.path === path)!.where!.coordinates).toEqual(karnak.coordinates);
    }
    // The coast day takes the Marsa Alam coordinates of batches B14 and B16.
    expect(SITE.trips.find((trip) => trip.path === 'a-three-oclock-start-for-the-valley-of-the-kings')!.where!.coordinates)
      .toEqual(B14B.sites.find((site) => site.slug === 'abu-dabbab-beach')!.coordinates);
    // Two of the eight collect from a narrower area than the rest, and each says where on its own page.
    const narrower = SITE.trips.filter((trip) => /from East Bank hotels|hotels on the coast at Marsa Alam/.test(trip.description));
    expect(narrower.map((trip) => trip.path)).toEqual([
      'west-bank-in-the-morning-a-sail-and-two-temples-after',
      'a-three-oclock-start-for-the-valley-of-the-kings',
    ]);
    expect(SITE.description).toMatch(/Two of the eight collect from a narrower area than the rest/);
  });

  it('imports every programme from the batch that first sold its record, and writes none', () => {
    const imported: Array<[string, unknown]> = [
      ['five-hours-an-hour-in-the-saddle-two-among-the-pyramids', B03P.GPP_SUNRISE],
      ['a-private-day-between-the-plateau-and-the-new-museum', B03P.PGE_GEM],
      ['shared-or-private-giza-sakkara-and-the-ruins-of-memphis', B03P.MAS_WITH_GIZA],
      ['twelve-hours-tahrir-square-the-citadel-four-churches-and-the-river', B08DP.EGM_DINNER_CRUISE],
      ['an-eleven-oclock-start-the-museum-the-old-quarter-and-the-bazaar', B08DP.EGM_OLD_CAIRO_SHARED],
      ['west-bank-in-the-morning-a-sail-and-two-temples-after', B03RP.TOK_BOTH_BANKS],
      ['an-hour-under-sail-then-the-lit-temple-at-karnak', B03RP.TOK_SOUND_AND_LIGHT],
      ['a-three-oclock-start-for-the-valley-of-the-kings', B09BP.MA_LUXOR],
    ];
    expect(imported).toHaveLength(KOE_TRIPS);
    for (const [tripPath, programme] of imported) {
      const trip = SITE.trips.find((item) => item.path === tripPath)!;
      // The same object, so the network says the same thing about the same day wherever it is sold.
      expect(trip.price).toBe(programme);
    }
    // Every record sold is one an earlier batch already sells, so this site writes no programme of its own.
    const earlier = new Set(EARLIER.flatMap((site) => site.trips.map((trip) => trip.price.source)));
    expect(SITE.trips.filter((trip) => !earlier.has(trip.price.source))).toEqual([]);
    // Nothing in the data is a price, a child rate, a currency or a length of its own.
    const whole = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'network-sites', 'keyofegypt.ts'), 'utf8');
    const source = whole.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/\bprice:\s*[\d.]/);
    expect(source).not.toMatch(/\bchildPrice\b|\bpriceFrom\b|\bcurrency:\s*'(?!USD\b)/);
    expect(source).not.toMatch(/[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/);
    // One imported programme sets a length of its own, because the record types its option's length as "3-5
    // hours" and the batch that first sold it rewrote that; the value is that batch's, not typed here.
    expect(SITE.trips.filter((trip) => trip.price.duration !== undefined).map((trip) => [trip.path, trip.price.duration]))
      .toEqual([['an-eleven-oclock-start-the-museum-the-old-quarter-and-the-bazaar', '3 to 5 hours']]);
    expect(source).not.toMatch(/\bduration:/);
    // Every price a guest sees is the published one, copied at build time.
    for (const document of built(SITE, SITE.trips)) {
      const trip = SITE.trips.find((item) => `${SITE.slugPrefix}${item.path}` === document.slug)!;
      const found = tour(trip.price.source)!;
      for (const option of document.pricingOptions as Array<Record<string, any>>) {
        const published = (found.options as Array<Record<string, any>>).find((item) => item.pricingKey === option.id)!;
        expect(option.price).toBe(published.guestPrices.adult);
      }
    }
  });

  it('carries exactly one copied line that holds only on request, and names it', () => {
    const copied = built(SITE, SITE.trips)
      .flatMap((document) => [...document.inclusions, ...document.exclusions, ...document.needToKnow, ...document.whatToBring] as string[])
      .filter((line) => CONDITIONAL.test(line));
    expect([...new Set(copied)]).toEqual([ON_REQUEST_LINE]);
    // It belongs to the one record of the eight that publishes it, and only that trip carries it.
    const carriers = built(SITE, SITE.trips).filter((document) => (document.inclusions as string[]).includes(ON_REQUEST_LINE));
    expect(carriers.map((document) => document.slug)).toEqual(['koe-shared-or-private-giza-sakkara-and-the-ruins-of-memphis']);
    // No copied line names a sum of money, so a guest reads the structured price and the fees nowhere else.
    const money = built(SITE, SITE.trips)
      .flatMap((document) => [...document.inclusions, ...document.exclusions, ...document.needToKnow, ...document.whatToBring] as string[])
      .filter((line) => /[$€£]\s?\d|\d+\s?[$€£]|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line));
    expect([...new Set(money)]).toEqual([]);
  });

  it('takes no booking until its domain is connected and the owner opens it', () => {
    expect(isTenantBookingCreationClosed({ slug: SITE.slug })).toBe(true);
    // The site one letter away is closed by its own entry, and a look-alike of this one is not closed at all.
    expect(isTenantBookingCreationClosed({ slug: 'king-of-egypt-tours' })).toBe(true);
    expect(isTenantBookingCreationClosed({ slug: 'key-of-egypt-tours-2' })).toBe(false);
    expect(isTenantBookingCreationClosed({ slug: 'KEY-OF-EGYPT-TOURS' })).toBe(false);
    const record = tenantRecord(SITE);
    expect((record.paymentSettings as { enabledGateways: string[] }).enabledGateways).toEqual(['pay-later']);
    expect((record.paymentSettings as { ownPaymentGateway: boolean }).ownPaymentGateway).toBe(false);
    expect(record.status).toBe('active');
  });

  it('refuses to apply until the badge is named as logo, dark logo and favicon', () => {
    expect(logoProblems(KEYOFEGYPT, null)).toEqual(['No --logos=<path> given.']);
    // The client's badge is one round mark that reads on a light and on a dark surface, so with no --logos file
    // the tenant record carries it for all three. `--apply` still refuses until the file names all three.
    expect(SITE.logo).toBe(BADGE);
    const record = tenantRecord(SITE);
    expect([record.logo, record.logoDark, record.favicon]).toEqual([BADGE, BADGE, BADGE]);
    const book = { 'key-of-egypt-tours': { logo: BADGE, logoDark: BADGE, favicon: BADGE } };
    expect(logoProblems(KEYOFEGYPT, book)).toEqual([]);
    expect(logoProblems(KEYOFEGYPT, {})).toEqual(['key-of-egypt-tours: no logo entry.']);
    expect(logoProblems(KEYOFEGYPT, { 'key-of-egypt-tours': { ...book['key-of-egypt-tours'], favicon: '' } }))
      .toEqual(['key-of-egypt-tours: favicon is missing.']);
    expect(logoProblems(KEYOFEGYPT, { 'key-of-egypt-tours': { ...book['key-of-egypt-tours'], logoDark: 'https://example.com/logo.png' } }))
      .toEqual(["key-of-egypt-tours: logoDark must already be on the network's Cloudinary: https://example.com/logo.png"]);
    // The supplied badge is already on the network's Cloudinary, under this site's own folder.
    expect(BADGE).toMatch(/^https:\/\/res\.cloudinary\.com\/dm3sxllch\/image\/upload\/.*\/attractions-network\/tenant-logos\/key-of-egypt-tours\//);
  });

  it('repeats no sentence another site on the network already publishes', () => {
    const mine = SITES.flatMap(copyOfSite);
    const held = new Map<string, Copy[]>();
    for (const entry of [...CORPUS, ...mine]) {
      for (const run of new Set(runsOf(entry.text))) {
        if (!held.has(run)) held.set(run, []);
        held.get(run)!.push(entry);
      }
    }
    const repeats: string[] = [];
    for (const entry of mine) {
      for (const run of new Set(runsOf(entry.text))) {
        for (const other of held.get(run) || []) {
          if (other.site === entry.site) continue;
          const bothTrips = entry.record !== null && other.record !== null;
          const comparable = entry.record === null ? other.record === null : bothTrips && other.record === entry.record;
          if (comparable) repeats.push(`${entry.where} repeats ${other.site} ${other.where}: "${run}"`);
        }
      }
    }
    expect([...new Set(repeats)]).toEqual([]);
    // And no field is word-for-word another site's, whatever the record.
    const sameWords = new Map<string, Copy[]>();
    for (const entry of CORPUS) {
      const key = normalise(entry.text);
      if (!sameWords.has(key)) sameWords.set(key, []);
      sameWords.get(key)!.push(entry);
    }
    const twins: string[] = [];
    for (const entry of mine) {
      for (const other of sameWords.get(normalise(entry.text)) || []) {
        if (other.site !== entry.site) twins.push(`${entry.where} == ${other.site} ${other.where}`);
      }
    }
    expect([...new Set(twins)]).toEqual([]);
    // No two sites anywhere on the network carry the same trip title.
    const titles = SITE.trips.map((trip) => trip.title);
    expect(titles).toHaveLength(KOE_TRIPS);
    expect(new Set(titles).size).toBe(titles.length);
    const taken = new Set([...LIVE.titles, ...EARLIER.flatMap((site) => site.trips.map((trip) => trip.title))]
      .map((title) => title.trim().toLowerCase()));
    expect(titles.filter((title) => taken.has(title.trim().toLowerCase()))).toEqual([]);
    // The dated scan is the live network, so this cannot pass by comparing against nothing.
    expect(LIVE.readAt).toBe('2026-10-31T06:56:04Z');
    expect(LIVE.titles.length).toBeGreaterThan(600);
    expect(LIVE.tenants).toHaveLength(121);
    expect(CORPUS.length).toBeGreaterThan(3000);
    expect(mine.length).toBeGreaterThan(50);
  });
});
