import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import {
  copiedFactProblems, eeoSourceProgramme, logoProblems, statedTripCounts, tenantRecord, tripDocument,
  validateBatch, type NetworkBatch, type NetworkSite, type NetworkTrip, type TripSiteFacts,
} from '../scripts/seed-network-sites';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';
import { B02 } from '../scripts/network-sites/b02';
import { B03A } from '../scripts/network-sites/b03';
import { B03B, B03C, B03D } from '../scripts/network-sites/b03-rest';
import { B08A, B08B, B08C, B08D } from '../scripts/network-sites/b08';
import { B09A, B09B, B09C, PROGRAMMES_A as B09AP } from '../scripts/network-sites/b09';
import { B10A, B10B, B10C, B10D } from '../scripts/network-sites/b10';
import { B11A, B11B } from '../scripts/network-sites/b11';
import { B12A, B12B } from '../scripts/network-sites/b12';
import { B13A, B13B } from '../scripts/network-sites/b13';
import { B14A, B14B, PROGRAMMES_B14 } from '../scripts/network-sites/b14';
import { B15A } from '../scripts/network-sites/b15';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';
import { isTenantBookingCreationClosed } from '../services/tenantBookingPolicy.service';

const EARLIER = [B01_SAFARI, B02, B03A, B03B, B03C, B03D, B08A, B08B, B08C, B08D, B09A, B09B, B09C,
  B10A, B10B, B10C, B10D, B11A, B11B, B12A, B12B, B13A, B13B, B14A, B14B].flatMap((batch) => batch.sites);
const GROUPS: NetworkBatch[] = [B15A];
const B15 = GROUPS.flatMap((batch) => batch.sites);
const siteOf = (slug: string) => B15.find((site) => site.slug === slug)!;

/**
 * Batch B15 is six sites: three reefs off Hurghada, each on its own day, and three places on the coast south of
 * Marsa Alam, all three on the one day the client publishes that enters their national park. Only the three
 * reefs are built here; the other three follow in their own group, because the single day they sell publishes
 * only the one photograph they must not show, so they cannot be created until their own pictures exist.
 */
const B15A_SITES = 3;
const B15_SITES = B15A_SITES;

/** Each new site's storefront design, from the batch concepts; the storefront picks it by slug. */
const DESIGNS: Record<string, string> = {
  'erg-abu-ramada': 'ergaburamada',
  'shabruhr-umm-gamar': 'shabruhr',
  hamda: 'hamda',
};

/** Every new site's domain, as Fouad's list gives it. */
const DOMAINS: Record<string, string> = {
  'erg-abu-ramada': 'ergaburamadahurghada.com',
  'shabruhr-umm-gamar': 'shabruhrummgamar.com',
  hamda: 'hamdahurghada.com',
};

/** The admin palette each site is created with, from the batch concepts (primary / secondary / accent). */
const THEMES: Record<string, [string, string, string]> = {
  'erg-abu-ramada': ['#1E1846', '#FBF1EC', '#A63E0E'],
  'shabruhr-umm-gamar': ['#2F3532', '#F3F3EE', '#5A3DB5'],
  hamda: ['#2E3A3F', '#F4F1EA', '#0B2D48'],
};

/** The day the coordinator's assignment (research/days.json) gives each site. */
const DAYS: Record<string, string[]> = {
  'erg-abu-ramada': ['hurghada-yacht-cruise-to-orange-bay-giftun-magawish-with-dolphins'],
  'shabruhr-umm-gamar': ['hurghada-dolphin-house-yacht-trip-with-snorkeling-lunch'],
  hamda: ['sunset-yacht-and-snorkeling-cruise-in-hurghada-5-hour-excursion'],
};

/** What each site's own place is called, so no page can be read as selling a stop there. */
const PLACE: Record<string, RegExp> = {
  'erg-abu-ramada': /Erg Abu Ramada|Camel Reef/i,
  'shabruhr-umm-gamar': /Shabruhr|Shabrur|Shaab Rur|Sha.ab Ruhr/i,
  hamda: /Hamda|Stone Beach|Umm Dum|Lion.s Head/i,
};

/** The one clause in which a site's trip copy may name its own place: to say it is not a stop. */
const NOT_A_STOP: Record<string, string> = {
  'erg-abu-ramada': ', not Erg Abu Ramada, the erg off the south-east side of Abu Ramada island about four kilometres south of Small Giftun; no boat stops at the erg.',
  'shabruhr-umm-gamar': ', not Shabruhr Umm Gamar, the reef about ten kilometres south-east of the Dolphin House; the yacht turns for home well north of it.',
  hamda: ', not Hamda, the plateau off the north-east shore of the larger Giftun island; it does not say where at Giftun the boat stops, and nothing calls at the plateau.',
};

/**
 * The "nearest days" sentence every site's description carries, word for word. Three are the coordinator's own,
 * from `research/days.json`; three carry one changed clause, and nothing else in the assignment moved. Each
 * change is there because the assignment's own words are a run that a batch B13 or B14 site already publishes
 * about the same day, and no two sites on the network may carry the same clause:
 * - Shabruhr Umm Gamar's "sails north from Hurghada to the Dolphin House reef; its programme does not name" is
 *   word for word what batch B14's Shaab Abu Nugar and Fanadir North publish about that reef.
 * - Erg Abu Ramada's "and Magawish; its programme does not name Erg" is batch B14's Erg Sabina's, on the same
 *   three-island day, so this one joins the two clauses with "and" instead.
 * - Wadi Lahmy's "inland into Wadi El Gemal to Cleopatra's Temple and a desert spring; its programme does not
 *   name" is batch B14's Sharm El Luli's, on the same jeep day, so this one names the spring before the temple.
 */
const NEAREST: Record<string, string> = {
  'erg-abu-ramada': 'This yacht day calls at Orange Bay, Giftun and Magawish, and its programme does not name Erg Abu Ramada, the three-peaked coral erg off the south-east side of Abu Ramada island, about four kilometres south of Small Giftun.',
  'shabruhr-umm-gamar': 'This yacht day runs north out of Hurghada to the Dolphin House reef, and its programme does not name Shabruhr Umm Gamar, the small reef south of Umm Gamar island, about ten kilometres south-east of the Dolphin House.',
  hamda: 'This afternoon yacht stops to snorkel at Giftun; its programme does not say where at Giftun, and it does not name Hamda, the plateau off the north-east shore of the larger Giftun island.',
};

/**
 * The clause each changed sentence replaces: the assignment's own words, which a batch B14 site already
 * publishes about the same day. Named here so that a later edit cannot quietly put a duplicate back.
 */
const ASSIGNMENT_CLAUSE: Record<string, string> = {
  'shabruhr-umm-gamar': 'from Hurghada to the Dolphin House reef; its programme does not name',
  'erg-abu-ramada': 'and Magawish; its programme does not name Erg',
};

/** Verbs that would turn a mention of the site's own place into a stop the record does not publish. */
const VISIT = 'visits?|visiting|visited|enter(?:s|ing|ed)?|inside|into|explore[sd]?|exploring|tour of|'
  + 'see(?:s|ing)?|walk(?:s|ing)? (?:through|into|round|around|down)|step(?:s|ping)? (?:into|inside)|'
  + 'stop(?:s|ping)? (?:at|in)|descend(?:s|ing)? (?:into|to)|down into|take[sn]? you (?:to|into|inside)|'
  + 'anchors? (?:at|off)|moors? (?:at|off)|snorkell?(?:s|ing)? (?:at|on)|dives? (?:at|on)|passe?s';

/** A line that holds only for an option the trip does not sell, or for an extra it cannot offer. */
const CONDITIONAL = /\(if |if selected|if add-on|if (?:the )?option|add on selection|5h Tour:|8h Tour:|depending on the option/i;

/**
 * No two sites may read alike. Every words field of a B15 trip — title, short, description, each highlight and
 * its SEO pair — shares no run of eight words with any OTHER site's copy of the SAME record, and no field
 * equals another site's field outright; a B15 site's own tagline, description and SEO share no such run with
 * any other site's tenant copy either. The one exception is the closing line every network site ends on, which
 * the batch brief requires: it is stripped before comparing.
 *
 * The corpus is every earlier batch file — batch B14 among them, so its ten sites are compared from their own
 * source — plus the dated scan of the live network kept for batch B14 (31 October 2026, the 121 tenants live
 * before B14 was applied). Between them the two cover every site on the network.
 */
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

const RECORDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'network-b15-record-names.json'), 'utf8')) as Record<string, Record<string, unknown>>;

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

/** What this batch itself writes for a trip: its own words, not the record's. */
const ownCopyOf = (trip: NetworkTrip): string => [
  trip.title, trip.short, trip.description, ...trip.highlights, trip.seo.metaTitle, trip.seo.metaDescription,
].join('\n');

/** Every rule a B15 trip keeps. */
function expectCompleteTrip(site: Pick<NetworkSite, 'foreignPlaces'>, document: Record<string, any>): void {
  expect(copiedFactProblems(site, document)).toEqual([]);
  expect(new Attraction(document).validateSync()?.errors ?? {}).toEqual({});
  expect([document.currency, document.rating, document.reviewCount, document.instantConfirmation, document.hasHotelPickup])
    .toEqual(['USD', 0, 0, false, true]);
  expect([...document.inclusions, ...document.exclusions].filter((line: string) => CONDITIONAL.test(line))).toEqual([]);
  expect([...document.inclusions, ...document.exclusions, ...document.needToKnow].filter((line: string) => /upon request/i.test(line))).toEqual([]);
  expect(guestCopy(document)).not.toMatch(/authentic|\bexpert\b|breathtaking|spectacular|\bbest\b|unforgettable|world.s largest|\bfamous\b|Pickup location|drop-off locations|magical|luxury VIP/i);
  // A guest reads the trip, not our notes on it: no line speaks of the record it was written from.
  expect(guestCopy(document)).not.toMatch(/\bsnapshot\b|\bbatch\b|\bprogramme record\b/i);
  // Nor of the two reefs far to the south that one record's own schedule names in place of the day's own stop.
  expect(guestCopy(document)).not.toMatch(/Sataya|Samadai/i);
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
  expect((document.needToKnow as string[]).join('\n')).toMatch(childPriced ? /have their own price/ : /pay the same price as adults/);
}

describe('batch B15: three reefs off Hurghada and three places on the southern coast', () => {
  it('is two valid groups of sites, none of them built before', () => {
    expect(GROUPS.map((batch) => batch.id)).toEqual(['b15a']);
    for (const batch of GROUPS) expect(validateBatch(batch)).toEqual([]);
    expect(B15.map((site) => site.slug)).toEqual(Object.keys(DESIGNS));
    expect(B15.map((site) => site.name)).toEqual(['Erg Abu Ramada', 'Shabruhr Umm Gamar', 'Hamda']);
    expect(B15).toHaveLength(B15_SITES);
    expect(B15A.sites).toHaveLength(B15A_SITES);
    for (const site of B15) {
      expect(site.domain).toBe(DOMAINS[site.slug]);
      expect(DESIGNS[site.slug]).toMatch(/^[a-z]+$/);
      expect([site.currency, site.listingPath]).toEqual(['USD', '/trips']);
      expect([site.theme.primaryColor, site.theme.secondaryColor, site.theme.accentColor]).toEqual(THEMES[site.slug]);
      // The tenant record keeps every network site on the shared design; the storefront picks the brand by slug.
      expect(tenantRecord(site).designMode).toBe('desertfox');
      // The site's own search entry, held to the lengths the batch brief sets.
      expect(site.seo.metaTitle.length).toBeLessThanOrEqual(60);
      expect(site.seo.metaDescription.length).toBeLessThanOrEqual(160);
      expect(site.seo.keywords).toHaveLength(5);
      expect(site.logo).toBe(`https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${site.slug}/monogram.png`);
    }
    // No slug, domain or trip-slug prefix is one an earlier batch already holds.
    const before = new Set(EARLIER.flatMap((site) => [site.slug, site.domain, site.slugPrefix]));
    for (const site of B15) {
      expect(before.has(site.slug) || before.has(site.domain) || before.has(site.slugPrefix)).toBe(false);
    }
    expect(B15.map((site) => site.slugPrefix)).toEqual(['ear-', 'shu-', 'hmd-']);
    const prefixes = B15.map((site) => site.slugPrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    // No site across every batch shares a title or a trip slug.
    const every = [...EARLIER, ...B15];
    const titles = every.map((site) => site.seo.metaTitle.trim().toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    const slugs = every.flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every site its own words for a record the network already sells', () => {
    // Every one of the batch's four days is already sold somewhere on the network, so the one thing that must
    // not be shared is the words. No two sites anywhere on the network carry the same trip title.
    const mine = B15.flatMap((site) => site.trips.map((trip) => trip.title));
    expect(mine).toHaveLength(B15_SITES);
    expect(new Set(mine).size).toBe(mine.length);
    const taken = new Set([
      ...LIVE.titles,
      ...EARLIER.flatMap((site) => site.trips.map((trip) => trip.title)),
    ].map((title) => title.trim().toLowerCase()));
    expect(mine.filter((title) => taken.has(title.trim().toLowerCase()))).toEqual([]);
    // The dated scan is the live network, so this cannot pass by comparing against nothing.
    expect(LIVE.readAt).toBe('2026-10-31T06:56:04Z');
    expect(LIVE.titles.length).toBeGreaterThan(600);
    expect(LIVE.tenants).toHaveLength(121);
    // The short line and the search entry are each the site's own too.
    const shorts = B15.flatMap((site) => site.trips.map((trip) => trip.short));
    expect(new Set(shorts).size).toBe(shorts.length);
    const metaTitles = B15.flatMap((site) => site.trips.map((trip) => trip.seo.metaTitle));
    expect(new Set(metaTitles).size).toBe(metaTitles.length);
  });


  it('sells each site exactly the day the assignment gives it', () => {
    expect(Object.fromEntries(B15.map((site) => [site.slug, site.trips.map((trip) => trip.price.source)]))).toEqual(DAYS);
    expect(B15.reduce((total, site) => total + site.trips.length, 0)).toBe(B15_SITES);
    // The three reefs off Hurghada sell three different days; the three sites on the southern coast sell one
    // day between them, which is the owner's decision of 2 November and the only such sharing in the batch.
    const hurghadaDays = B15A.sites.flatMap((site) => site.trips.map((trip) => trip.price.source));
    expect(new Set(hurghadaDays).size).toBe(hurghadaDays.length);
    // What each record the batch sells says about itself, kept beside this test: its published title, its
    // booking options and its schedule, from the dated snapshot.
    for (const [slug, record] of Object.entries(RECORDS)) {
      const found = tour(slug)!;
      expect(found.detail.title).toBe(record.title);
      expect((found.options as Array<{ title: string }>).map((option) => option.title)).toEqual(record.options);
      expect((found.options as Array<{ pricingKey: string }>).map((option) => option.pricingKey)).toEqual(record.optionKeys);
      expect((found.detail.itinerary as Array<{ title: string }> | null || []).map((step) => step.title)).toEqual(record.itinerary);
    }
    // Every record the batch sells is one the fixture records, and every one of those is sold.
    // The fixture also records the southern group's day, which the other group sells.
    expect(Object.keys(RECORDS)).toHaveLength(4);
    expect(hurghadaDays.every((record) => Object.keys(RECORDS).includes(record))).toBe(true);
    // Erg Abu Ramada's record names the three islands its page says the day calls at, Small Giftun among
    // them nowhere: the page measures from that island rather than quoting a programme.
    const threeIslands = RECORDS['hurghada-yacht-cruise-to-orange-bay-giftun-magawish-with-dolphins'];
    expect(String(threeIslands.title)).toMatch(/Orange Bay, Giftun & Magawish/);
    expect(JSON.stringify(threeIslands)).not.toMatch(/small giftun/i);
    expect(NEAREST['erg-abu-ramada']).toContain('about four kilometres south of Small Giftun');
    // Shabruhr Umm Gamar takes the Dolphin House day fewest network sites sell, and it reaches that reef.
    const dolphin = RECORDS['hurghada-dolphin-house-yacht-trip-with-snorkeling-lunch'];
    expect(JSON.stringify(dolphin)).toMatch(/dolphin house/i);
    const alsoSells = EARLIER.filter((site) => site.trips.some((trip) => trip.price.source === 'hurghada-dolphin-house-yacht-trip-with-snorkeling-lunch'));
    expect(alsoSells.map((site) => site.slug)).toEqual(['shaab-abu-nugar']);
    // Hamda's record stops to snorkel at Giftun without saying where, which is what its line says, and its
    // line carries no kilometre figure, because its named point is the island it lies 52 m off.
    const sunset = RECORDS['sunset-yacht-and-snorkeling-cruise-in-hurghada-5-hour-excursion'];
    expect((sunset.itinerary as string[]).filter((step) => /giftun/i.test(step))).toEqual(['Giftun Island']);
    expect(NEAREST.hamda).toContain('does not say where at Giftun');
    expect(NEAREST.hamda).not.toMatch(/kilometre/);

  });


  it('says on every page what the programme names, and never that the place is a stop', () => {
    for (const site of B15) {
      const place = PLACE[site.slug];
      const clause = NOT_A_STOP[site.slug];
      for (const trip of site.trips) {
        // Each trip says once, plainly, what its programme names and that the site's place is not among it.
        expect(trip.description).toMatch(/programme/);
        expect(trip.description.split(clause)).toHaveLength(2);
        // Outside that one clause, the trip's own words never mention the place at all.
        expect(ownCopyOf(trip).split(clause).join(' ')).not.toMatch(place);
      }
      // And nowhere on the site does a visiting word stand in front of the place's name: not a stop, not a
      // mooring, not a dive, and not a boat passing it either.
      const everyWord = [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription,
        ...site.seo.keywords, ...site.trips.map(ownCopyOf), ...site.trips.flatMap((trip) => trip.imageAlts)].join('\n');
      expect(everyWord).not.toMatch(new RegExp(`(?:${VISIT})\\s+(?:the\\s+)?(?:${place.source})`, 'i'));
      // Every site's description carries its own "nearest days" sentence, word for word.
      expect(site.description.split(NEAREST[site.slug])).toHaveLength(2);
      // Two short paragraphs, and the closing line batches B11 to B14 end on.
      expect(site.description.split('\n\n')).toHaveLength(2);
      expect(site.description).toContain('Every trip collects you from your hotel and brings you back');
      expect(site.description).toContain('Hold a place online and pay later');
    }
    // Three of the assignment's own sentences carry a clause a batch B14 site already publishes about the same
    // day, so those three say the same thing in their own words and nothing else in the assignment moved.
    expect(Object.keys(ASSIGNMENT_CLAUSE).sort()).toEqual(['erg-abu-ramada', 'shabruhr-umm-gamar']);
    for (const [slug, clause] of Object.entries(ASSIGNMENT_CLAUSE)) {
      // The assignment's clause is one a B14 site publishes, and no B15 site carries it.
      expect(EARLIER.filter((site) => site.description.includes(clause)).length).toBeGreaterThan(0);
      expect(NEAREST[slug]).not.toContain(clause);
      expect(siteOf(slug).description).not.toContain(clause);
    }
    // What each changed sentence still says is the assignment's own fact, word for word.
    expect(NEAREST['shabruhr-umm-gamar']).toContain('the small reef south of Umm Gamar island, about ten kilometres south-east of the Dolphin House');
    expect(NEAREST['erg-abu-ramada']).toContain('the three-peaked coral erg off the south-east side of Abu Ramada island, about four kilometres south of Small Giftun');
  });

  it('builds every trip from the dated snapshot, never from a price typed here', () => {
    for (const site of B15) for (const trip of site.trips) {
      expect(trip.price.provider).toBe('eeo');
      expect(trip.price.tenant).toBe('egypt-excursions-online');
      expect((SNAPSHOT.tours as Array<{ slug: string }>).map((item) => item.slug)).toContain(trip.price.source);
    }
    // Nothing in the batch data is a price, a child rate, a currency or a length of its own: every one of them
    // is read from the record at build time. The header's notes describe the client's published records, so the
    // rule is about the data below them.
    const whole = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'network-sites', 'b15.ts'), 'utf8');
    const source = whole.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/\bprice:\s*[\d.]/);
    expect(source).not.toMatch(/\bchildPrice\b|\bpriceFrom\b|\bcurrency:\s*'(?!USD\b)/);
    expect(source).not.toMatch(/[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/);
    // This batch writes no programme at all, so it sets no length of its own: each is the record's own, or the
    // length the batch that first sold the record had to write for it. One imported programme sets one, and
    // batch B09 says why: that record types its own length as "Duration 8 hours", which is not a length a page
    // can show, so B09 wrote the figure out of it.
    const withLength = B15.flatMap((site) => site.trips).filter((trip) => trip.price.duration !== undefined);
    expect(withLength.map((trip) => trip.price.source)).toEqual(['hurghada-yacht-cruise-to-orange-bay-giftun-magawish-with-dolphins']);
    expect(B09AP.HBT_THREE_ISLANDS.duration).toBe('8 hours');
    expect(String(RECORDS['hurghada-yacht-cruise-to-orange-bay-giftun-magawish-with-dolphins'].duration)).toBe('Duration 8 hours');
    // No sentence this batch writes names a sum of money; a guest reads the structured price.
    const ownCopy = B15.flatMap((site) => [site.tagline, site.description, ...site.trips.map(ownCopyOf)]);
    expect(ownCopy.filter((line) => /[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line))).toEqual([]);
    // Two copied lines name a sum: the nature reserve fee the two five-hour yachts list as not included, which
    // a guest pays on the day and should read before booking. It is left exactly as the record writes it
    // rather than reworded, and named here so a changed record cannot introduce another unnoticed.
    const copiedMoney = B15.flatMap((site) => built(site, site.trips))
      .flatMap((document) => [...document.inclusions, ...document.exclusions, ...document.needToKnow, ...document.whatToBring] as string[])
      .filter((line) => /[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line));
    expect([...new Set(copiedMoney)]).toEqual([
      'Nature Reserve Fee: €5 per person (adult/child), not included. Pay by cash, Visa, or payment link',
    ]);
    // Every price a guest sees is the published one, copied at build time.
    for (const site of B15) for (const document of built(site, site.trips)) {
      const found = tour((site.trips.find((trip) => `${site.slugPrefix}${trip.path}` === document.slug)!).price.source)!;
      for (const option of document.pricingOptions as Array<Record<string, any>>) {
        const published = (found.options as Array<Record<string, any>>).find((item) => item.pricingKey === option.id)!;
        expect(option.price).toBe(published.guestPrices.adult);
      }
    }
  });

  it('writes every page to the same shape: two paragraphs, four highlights, a photo described', () => {
    for (const site of B15) {
      expect(site.description.split('\n\n')).toHaveLength(2);
      expect(site.tagline.length).toBeLessThanOrEqual(60);
      for (const trip of site.trips) {
        expect(trip.description.split('\n\n')).toHaveLength(2);
        expect(trip.highlights).toHaveLength(4);
        expect(new Set(trip.highlights).size).toBe(4);
        expect(trip.images).toHaveLength(1);
        expect(trip.imageAlts).toHaveLength(trip.images.length);
        expect(trip.short.length).toBeLessThanOrEqual(160);
        expect(trip.seo.metaTitle.length).toBeLessThanOrEqual(70);
        expect(trip.seo.metaDescription.length).toBeLessThanOrEqual(165);
      }
    }
  });

  it('builds every trip into a complete trip', () => {
    let count = 0;
    for (const site of B15) for (const document of built(site, site.trips)) { expectCompleteTrip(site, document); count += 1; }
    expect(count).toBe(B15_SITES);
  });

  it('imports every programme from the batch that first sold its record, and writes none', () => {
    const imported: Array<[string, unknown]> = [
      ['three-islands-in-one-sailing', B09AP.HBT_THREE_ISLANDS],
      ['afternoon-yacht-and-a-stop-at-giftun', B09AP.HBT_SUNSET],
      ['five-hours-north-with-lunch-aboard', PROGRAMMES_B14.DOLPHIN_YACHT_LUNCH],
    ];
    for (const [tripPath, programme] of imported) {
      const trips = B15.flatMap((site) => site.trips).filter((trip) => trip.path === tripPath);
      expect(trips).toHaveLength(1);
      // The same object, so the network says the same thing about the same trip wherever it is sold.
      for (const item of trips) expect(item.price).toBe(programme);
    }
    // Every record this batch sells is one an earlier batch already sells, so the batch writes no programme of
    // its own. Every earlier batch is searched, so a programme written here would fail this.
    const earlier = new Set(EARLIER.flatMap((site) => site.trips.map((trip) => trip.price.source)));
    expect(B15.flatMap((site) => site.trips).filter((trip) => !earlier.has(trip.price.source))).toEqual([]);
    // Three programmes behind three trips: no site in this group sells a day another site in it sells.
    expect(new Set(B15.flatMap((site) => site.trips).map((trip) => trip.price)).size).toBe(B15_SITES);
    // The second Dolphin House yacht's programme is batch B14's own, and it carries the schedule B14 wrote
    // rather than the record's, whose schedule names a reef far to the south.
    expect(PROGRAMMES_B14.DOLPHIN_YACHT_LUNCH.itinerary.length).toBeGreaterThan(2);
    expect(JSON.stringify(PROGRAMMES_B14.DOLPHIN_YACHT_LUNCH.itinerary)).not.toMatch(/Sataya/i);
    expect((RECORDS['hurghada-dolphin-house-yacht-trip-with-snorkeling-lunch'].itinerary as string[]).join(' ')).toMatch(/Sataya/i);
  });

  it('starts each site where its own trips start', () => {
    // The three reefs follow the Hurghada boat site of batch B09: the same town, pickup area, coordinates and
    // fence, which is the fence batches B13 and B14 gave their reefs too.
    const boats = B09A.sites.find((item) => item.slug === 'hurghada-boat-tour')!;
    for (const site of B15A.sites) {
      expect([site.city, site.pickupDestination, site.area]).toEqual(['Hurghada', 'hurghada', 'Hurghada']);
      expect(site.coordinates).toEqual(boats.coordinates);
      expect(site.foreignPlaces.source).toEqual(boats.foreignPlaces.source);
      for (const document of built(site, site.trips)) expect(document.meetingPoint.address).toBe('Your hotel in Hurghada');
    }
    // No trip in the batch starts anywhere but where its site does.
    for (const site of B15) for (const trip of site.trips) expect(trip.where).toBeUndefined();
  });

  it('takes no booking on a new site until its domain is connected and the owner opens it', () => {
    for (const site of B15) expect(isTenantBookingCreationClosed({ slug: site.slug })).toBe(true);
    for (const site of B15) {
      const record = tenantRecord(site);
      expect(record.customDomain).toBeUndefined();
      expect(record.domainMigrated).toBe(false);
      expect(record.domain).toBe(`${site.slug}.foxesnetwork.com`);
      expect((record.paymentSettings as { enabledGateways: string[] }).enabledGateways).toEqual(['pay-later']);
    }
  });

  it('refuses to apply a new site until it has its approved logo, dark logo and favicon', () => {
    for (const batch of GROUPS) expect(logoProblems(batch, null)).toEqual(['No --logos=<path> given.']);
    const good = (slug: string) => ({
      logo: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/logo.png`,
      logoDark: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/logo-dark.png`,
      favicon: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/favicon.png`,
    });
    const complete = Object.fromEntries(B15.map((site) => [site.slug, good(site.slug)]));
    for (const batch of GROUPS) expect(logoProblems(batch, complete)).toEqual([]);
    // Every site of a group is required: a file missing any single one refuses the group that holds it.
    expect(Object.keys(complete)).toHaveLength(B15_SITES);
    for (const site of B15) {
      const { [site.slug]: _dropped, ...withoutOne } = complete;
      const batch = B15A;
      expect(logoProblems(batch, withoutOne)).toEqual([`${site.slug}: no logo entry.`]);
    }
    expect(logoProblems(B15A, { ...complete, hamda: { ...good('hamda'), favicon: '' } }))
      .toEqual(['hamda: favicon is missing.']);
    expect(logoProblems(B15A, { ...complete, 'erg-abu-ramada': { ...good('erg-abu-ramada'), logoDark: 'https://example.com/logo.png' } }))
      .toEqual(["erg-abu-ramada: logoDark must already be on the network's Cloudinary: https://example.com/logo.png"]);
  });

  it('repeats no sentence another site on the network already publishes', () => {
    const mine = B15.flatMap(copyOfSite);
    // Every B15 field is written for its own site: a trip field against the same record elsewhere, a tenant
    // field against every other site's tenant copy. The three sites that share one day are compared with each
    // other here too, because each is a different site.
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
          if (comparable) repeats.push(`${entry.site} ${entry.where} repeats ${other.site} ${other.where}: "${run}"`);
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
        if (other.site !== entry.site) twins.push(`${entry.site} ${entry.where} == ${other.site} ${other.where}`);
      }
      for (const other of mine) {
        if (other !== entry && other.site !== entry.site && normalise(other.text) === normalise(entry.text)) {
          twins.push(`${entry.site} ${entry.where} == ${other.site} ${other.where}`);
        }
      }
    }
    expect([...new Set(twins)]).toEqual([]);
    // Every record this batch sells has its live copy in the corpus, or its seller's own batch file.
    const covered = new Set([...LIVE.trips.map((trip) => trip.record),
      ...EARLIER.flatMap((site) => site.trips.map((trip) => trip.price.source))]);
    const sold = [...new Set(B15.flatMap((site) => site.trips).map((trip) => trip.price.source))];
    expect(sold.filter((record) => !covered.has(record))).toEqual([]);
    expect(CORPUS.length).toBeGreaterThan(3000);
    expect(mine.length).toBeGreaterThan(50);
  });

  it('counts the trips its copy names', () => {
    for (const site of B15) {
      const copy = [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription, ...site.seo.keywords].join('\n');
      for (const count of statedTripCounts(copy)) expect(count).toBe(site.trips.length);
      // Every site sells one day and says so out loud, so the count is held to that site's own catalogue.
      expect(statedTripCounts(site.description)).toEqual([1]);
    }
  });
});
