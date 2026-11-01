import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import {
  copiedFactProblems, eeoSourceProgramme, logoProblems, statedTripCounts, tenantRecord, tripDocument,
  validateBatch, type NetworkBatch, type NetworkSite, type NetworkTrip, type PriceSpec, type TripSiteFacts,
} from '../scripts/seed-network-sites';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';
import { B02 } from '../scripts/network-sites/b02';
import { B03A } from '../scripts/network-sites/b03';
import { B03B, B03C, B03D } from '../scripts/network-sites/b03-rest';
import { B08A, B08B, B08C, B08D, PROGRAMMES_C as B08CP } from '../scripts/network-sites/b08';
import { B09A, B09B, B09C, PROGRAMMES_A as B09AP, PROGRAMMES_B as B09BP } from '../scripts/network-sites/b09';
import { B10A, B10B, B10C, B10D } from '../scripts/network-sites/b10';
import { B11A, B11B } from '../scripts/network-sites/b11';
import { B12A, B12B } from '../scripts/network-sites/b12';
import { B13A, B13B } from '../scripts/network-sites/b13';
import { B14A, B14B } from '../scripts/network-sites/b14';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';
import { isTenantBookingCreationClosed } from '../services/tenantBookingPolicy.service';

const EARLIER = [B01_SAFARI, B02, B03A, B03B, B03C, B03D, B08A, B08B, B08C, B08D, B09A, B09B, B09C,
  B10A, B10B, B10C, B10D, B11A, B11B, B12A, B12B, B13A, B13B].flatMap((batch) => batch.sites);
const GROUPS: NetworkBatch[] = [B14A, B14B];
const B14 = GROUPS.flatMap((batch) => batch.sites);
const siteOf = (slug: string) => B14.find((site) => site.slug === slug)!;

/**
 * Batch B14 is the ten reefs, bays and shores that take the network past a hundred. Two of them sell days
 * another site already sells, because the day their own water is nearest to cannot be built from its
 * record; both faults are proved below. `--logos` must refuse each group until every site it holds has its
 * three marks.
 */
const B14A_SITES = 5;
const B14B_SITES = 5;
const B14_SITES = B14A_SITES + B14B_SITES;

/** Each new site's storefront design, from the batch concepts; the storefront picks it by slug. */
const DESIGNS: Record<string, string> = {
  'shaab-abu-nugar': 'abunugar',
  'fanous-east': 'fanous',
  'north-abu-ramada': 'aburamada',
  'careless-reef': 'careless',
  'fanadir-north': 'fanadirnorth',
  'erg-sabina': 'ergsabina',
  'fanous-west': 'fanouswest',
  'abu-dabbab-beach': 'abudabbab',
  'elphinstone-reef': 'elphinstone',
  'sharm-el-luli': 'luli',
};

/** Every new site's domain, as Fouad's list gives it. */
const DOMAINS: Record<string, string> = {
  'shaab-abu-nugar': 'shaababunugar.com',
  'fanous-east': 'fanouseasthurghada.com',
  'north-abu-ramada': 'northaburamadahurghada.com',
  'careless-reef': 'carlessreefhurghada.com',
  'fanadir-north': 'fanadirnorthhurghada.com',
  'erg-sabina': 'ergsabina.com',
  'fanous-west': 'fanouswesthurghada.com',
  'abu-dabbab-beach': 'abudabbabbeach.com',
  'elphinstone-reef': 'elphinstonereef.com',
  'sharm-el-luli': 'sharm-elluli.com',
};

/** The admin palette each site is created with, from the batch concepts (primary / secondary / accent). */
const THEMES: Record<string, [string, string, string]> = {
  'shaab-abu-nugar': ['#15324A', '#F2EEE3', '#C8432E'],
  'fanous-east': ['#0E3C45', '#FBF1DC', '#E8A33D'],
  'north-abu-ramada': ['#0A2747', '#F1E8D4', '#2E9B7D'],
  'careless-reef': ['#10141F', '#E7D9B8', '#E06A4E'],
  'fanadir-north': ['#2F2A2E', '#F3EBDC', '#C77B30'],
  'erg-sabina': ['#7A2E3B', '#EEF1F0', '#1F9AA8'],
  'fanous-west': ['#1C4E7A', '#FBFAF6', '#38B6B0'],
  'abu-dabbab-beach': ['#2E6B4E', '#F2E7D2', '#E6763D'],
  'elphinstone-reef': ['#0F4C81', '#EEF4F8', '#E2557F'],
  'sharm-el-luli': ['#2F7D4F', '#FFFDF7', '#2BB3C0'],
};

/**
 * The two pictures uploaded for each site on 1 November 2026, in the order the creation run writes them:
 * the home page's opening picture, then the inner pages' one. Held here as literals so the batch is checked
 * against the upload result rather than against itself.
 */
const SITE_PICTURES: Record<string, [string, string]> = {
  'shaab-abu-nugar': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521124/attractions-network/tenant-heroes/shaab-abu-nugar/site-20261101-hero-119b31aa7dbf.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521125/attractions-network/tenant-heroes/shaab-abu-nugar/site-20261101-second-d3a3cdaaf4b0.png',
  ],
  'fanous-east': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521127/attractions-network/tenant-heroes/fanous-east/site-20261101-hero-c1da53c2c44f.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521128/attractions-network/tenant-heroes/fanous-east/site-20261101-second-cf907dec68d7.png',
  ],
  'north-abu-ramada': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521130/attractions-network/tenant-heroes/north-abu-ramada/site-20261101-hero-6537d844b649.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521131/attractions-network/tenant-heroes/north-abu-ramada/site-20261101-second-12ef40a282f7.png',
  ],
  'careless-reef': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521133/attractions-network/tenant-heroes/careless-reef/site-20261101-hero-f861866e0c6e.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521134/attractions-network/tenant-heroes/careless-reef/site-20261101-second-d08550839e55.png',
  ],
  'fanadir-north': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521135/attractions-network/tenant-heroes/fanadir-north/site-20261101-hero-816a81eaab6b.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521136/attractions-network/tenant-heroes/fanadir-north/site-20261101-second-976f4f60438e.png',
  ],
  'erg-sabina': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521138/attractions-network/tenant-heroes/erg-sabina/site-20261101-hero-7feb5853b1ea.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521139/attractions-network/tenant-heroes/erg-sabina/site-20261101-second-bc8977075b35.png',
  ],
  'fanous-west': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521140/attractions-network/tenant-heroes/fanous-west/site-20261101-hero-07fcc0b52403.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521141/attractions-network/tenant-heroes/fanous-west/site-20261101-second-95b6b8b7e34f.png',
  ],
  'abu-dabbab-beach': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521142/attractions-network/tenant-heroes/abu-dabbab-beach/site-20261101-hero-3aeb8d107671.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521144/attractions-network/tenant-heroes/abu-dabbab-beach/site-20261101-second-c8dfb18bafbd.png',
  ],
  'elphinstone-reef': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521145/attractions-network/tenant-heroes/elphinstone-reef/site-20261101-hero-ac79ffbded45.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521146/attractions-network/tenant-heroes/elphinstone-reef/site-20261101-second-1581933892df.png',
  ],
  'sharm-el-luli': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521148/attractions-network/tenant-heroes/sharm-el-luli/site-20261101-hero-95c7332f2214.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793521149/attractions-network/tenant-heroes/sharm-el-luli/site-20261101-second-b2c0373f7bd4.png',
  ],
};

/** The days the coordinator's assignment (research/days.json) gives each site, in the order they are sold. */
const DAYS: Record<string, string[]> = {
  'shaab-abu-nugar': [
    'hurghada-dolphin-house-morning-cruise-dolphin-swim',
    'hurghada-dolphin-house-speedboat-trip-dolphin-swim',
    'hurghada-dolphin-house-yacht-trip-with-snorkeling-lunch',
  ],
  'fanous-east': ['orange-island-premium-cruise-from-hurghada-with-lunch-transfer'],
  'north-abu-ramada': [
    'makadi-bay-snorkeling-and-diving-at-orange-bay',
    'hurghada-orange-bay-yacht-cruise-with-snorkeling-breakfast-lunch-drinks',
  ],
  'careless-reef': ['hurghada-orange-bay-parasailing-snorkeling-lunch-adventure'],
  'fanadir-north': ['hurghada-dolphin-house-yacht-cruise-with-dolphin-swim-lunch'],
  'erg-sabina': ['hurghada-yacht-cruise-to-orange-bay-giftun-magawish-with-dolphins'],
  'fanous-west': ['hurghada-speedboat-trip-to-6-islands-with-dolphin-watching-snorkeling'],
  'abu-dabbab-beach': [
    'marsa-alam-marsa-mubarak-turtle-snorkelling-boat-trip',
    'marsa-mubarak-boat-trip-snorkel-with-dugongs-giant-turtles',
  ],
  'elphinstone-reef': ['marsa-alam-luxury-pirates-boat-snorkeling-cruise-with-lunch'],
  'sharm-el-luli': ['marsa-alam-wadi-el-gemal-jeep-safari-bedouin-dinner'],
};

/** What each site's own place is called, so no page can be read as selling a stop there. */
const PLACE: Record<string, RegExp> = {
  'shaab-abu-nugar': /Shaab Abu Nugar|Abu Nugar/i,
  'fanous-east': /Fanous East|El Fanous/i,
  'careless-reef': /Careless Reef|Carless/i,
  'fanadir-north': /Fanadir North|El.?Fanadir/i,
  'north-abu-ramada': /North Abu Ramada|Abu Rimathi/i,
  'erg-sabina': /Erg Sabina/i,
  'fanous-west': /Fanous West|El Fanous/i,
  'abu-dabbab-beach': /Abu Dabbab/i,
  'elphinstone-reef': /Elphinstone|Abu Hamra/i,
  'sharm-el-luli': /Sharm El Luli|Hankorab/i,
};

/** The one clause in which a site's trip copy may name its own place: to say it is not a stop. */
const NOT_A_STOP: Record<string, string> = {
  'shaab-abu-nugar': ', not Shaab Abu Nugar, the reef about eight kilometres south of it; no boat calls there.',
  'fanous-east': ', not Fanous East, the reef about six kilometres north-west of the island\u2019s far end; nothing calls there.',
  'careless-reef': ', not Careless Reef, which stands out in the open water north of the island; no boat goes there.',
  'fanadir-north': ', not Fanadir North, which lies about thirteen kilometres short of that reef; nothing stops there.',
  'north-abu-ramada': ', not North Abu Ramada, the plateau three kilometres south-east of the larger island\u2019s southern end; no boat stops there.',
  'erg-sabina': ', not Erg Sabina, the coral tower out in the strait between them; nothing stops at the tower.',
  'fanous-west': ', not Fanous West, the sheltered half of the beacon reef six kilometres north of the sandbank; nothing calls there.',
  'abu-dabbab-beach': ', not Abu Dabbab Beach, the seagrass bay twenty-one kilometres down the same coast; no boat goes there.',
  'elphinstone-reef': ', not Elphinstone Reef, which stands alone twenty-five kilometres south of the second bay; nothing sails there.',
  'sharm-el-luli': ', not Sharm El Luli, the bay on the coast thirty-two kilometres east of them; the jeep never reaches it.',
};

/**
 * The "nearest days" sentence every site's description carries, word for word. Three are the coordinator's
 * own, from `research/days.json`. Fanadir North's is rewritten: the assignment says "the long fringing reef
 * the boat passes on the way", and no programme says the boat passes the reef, so the sentence states where
 * the reef lies instead of what the boat does.
 */
const NEAREST: Record<string, string> = {
  'shaab-abu-nugar': 'These days cruise north from Hurghada to the Dolphin House reef; their programmes do not name Shaab Abu Nugar, the northernmost of the Hurghada reefs, which lies about eight kilometres south of it.',
  'fanous-east': 'This day cruises out to Orange Island on the larger Giftun; its programme does not name Fanous East, the beacon reef that lies about six kilometres north-west of the island\'s far end.',
  'careless-reef': 'This day is spent at Orange Bay on Big Giftun; its programme does not name Careless Reef, which stands in open water about ten kilometres north of the island.',
  'fanadir-north': 'This day runs up the coast from Hurghada to the Dolphin House reef; its programme does not name Fanadir North, the top of the long fringing reef that lies about thirteen kilometres short of it.',
  'north-abu-ramada': 'These days sail to Orange Bay on the larger Giftun; their programmes do not name North Abu Ramada, the plateau off the north tip of Abu Ramada island, about three kilometres south-east of that island\u2019s southern end.',
  'erg-sabina': 'This day sails to Orange Bay, the Giftun islands and Magawish; its programme does not name Erg Sabina, the coral tower in the strait between the two Giftun islands, under three kilometres from Small Giftun.',
  'fanous-west': 'This day runs six islands by speedboat and walks the Abu Minqar sandbank; its programme does not name Fanous West, the sheltered western half of the beacon reef about six kilometres north of that sandbank.',
  'abu-dabbab-beach': 'These days snorkel the bay at Marsa Mubarak for dugongs and green turtles; their programmes do not name Marsa Abu Dabbab, the seagrass bay about twenty-one kilometres down the same coast where most of the Red Sea\'s dugongs are seen.',
  'elphinstone-reef': 'This day sails from Port Ghalib to the bays of Marsa Mubarak and Marsa Shona; its programme does not name Elphinstone Reef, which stands alone in open water about twenty-five kilometres south of Marsa Shona and nine kilometres off the coast.',
  'sharm-el-luli': 'This day drives inland into Wadi El Gemal to Cleopatra\u2019s Temple and a desert spring; its programme does not name Sharm El Luli, the bay in the same park about thirty-two kilometres east of that temple, on the coast.',
};

/** Verbs that would turn a mention of the site's own place into a stop the record does not publish. */
const VISIT = 'visits?|visiting|visited|enter(?:s|ing|ed)?|inside|into|explore[sd]?|exploring|tour of|'
  + 'see(?:s|ing)?|walk(?:s|ing)? (?:through|into|round|around|down)|step(?:s|ping)? (?:into|inside)|'
  + 'stop(?:s|ping)? (?:at|in)|descend(?:s|ing)? (?:into|to)|down into|take[sn]? you (?:to|into|inside)|'
  + 'anchors? (?:at|off)|moors? (?:at|off)|snorkell?(?:s|ing)? (?:at|on)|dives? (?:at|on)|passe?s';

/** A line that holds only for an option the trip does not sell, or for an extra it cannot offer. */
const CONDITIONAL = /\(if |if selected|if add-on|if (?:the )?option|add on selection|5h Tour:|8h Tour:|depending on the option/i;

/**
 * No two sites may read alike (owner, 31 October: "make sure you are not duplicating"). Every words field of
 * a B14 trip — title, short, description, each highlight and its SEO pair — shares no run of eight words with
 * any OTHER site's copy of the SAME record, and no field equals another site's field outright; a B14 site's
 * own tagline, description and SEO share no such run with any other site's tenant copy either. The one
 * exception is the closing line every network site ends on, which the batch brief requires: it is stripped
 * before comparing. The corpus is every earlier batch file and the dated scan of the live network.
 */
const SHINGLE = 8;
const CLOSING_LINE = 'Every trip collects you from your hotel and brings you back, and each page says what its own price covers. Hold a place online and pay later, or ask the team first about the pickup time.';
const normalise = (text: string) => text.toLowerCase().replace(/[\u2019']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
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

const RECORDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'network-b14-record-names.json'), 'utf8')) as Record<string, Record<string, unknown>>;

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

/** The schedule a trip publishes: its own where it writes one, else the record's. */
const scheduleOf = (trip: NetworkTrip): string => (trip.price.itinerary || [])
  .flatMap((step) => [step.title, step.description]).join(' | ');

/** Every rule a B14 trip keeps. */
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
  // Nor of a reef far to the south that one record's own schedule names in place of the day's own stop.
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

describe('batch B14: the reefs, bays and shores that take the network past a hundred', () => {
  it('is two valid groups of sites, none of them built before', () => {
    expect(GROUPS.map((batch) => batch.id)).toEqual(['b14a', 'b14b']);
    for (const batch of GROUPS) expect(validateBatch(batch)).toEqual([]);
    expect(B14.map((site) => site.slug)).toEqual(Object.keys(DESIGNS));
    expect(B14.map((site) => site.name)).toEqual(['Shaab Abu Nugar', 'Fanous East', 'North Abu Ramada',
      'Careless Reef', 'Fanadir North',
      'Erg Sabina', 'Fanous West', 'Abu Dabbab Beach', 'Elphinstone Reef', 'Sharm El Luli']);
    expect(B14).toHaveLength(B14_SITES);
    expect([B14A.sites.length, B14B.sites.length]).toEqual([B14A_SITES, B14B_SITES]);
    for (const site of B14) {
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
    for (const site of B14) {
      expect(before.has(site.slug) || before.has(site.domain) || before.has(site.slugPrefix)).toBe(false);
    }
    expect(B14.map((site) => site.slugPrefix)).toEqual(['abn-', 'fne-', 'nar-', 'crf-', 'fdn-', 'egs-', 'fnw-', 'adb-', 'elr-', 'sll-']);
    const prefixes = B14.map((site) => site.slugPrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    // No site across every batch shares a title or a trip slug.
    const every = [...EARLIER, ...B14];
    const titles = every.map((site) => site.seo.metaTitle.trim().toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    const slugs = every.flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every site its own words for a record the network already sells', () => {
    // Twelve of the batch's fourteen days are already sold somewhere on the network, so the one thing that
    // must not be shared is the words. No two sites anywhere on the network carry the same trip title.
    const mine = B14.flatMap((site) => site.trips.map((trip) => trip.title));
    expect(mine).toHaveLength(14);
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
    const shorts = B14.flatMap((site) => site.trips.map((trip) => trip.short));
    expect(new Set(shorts).size).toBe(shorts.length);
    const metaTitles = B14.flatMap((site) => site.trips.map((trip) => trip.seo.metaTitle));
    expect(new Set(metaTitles).size).toBe(metaTitles.length);
  });

  it('opens every site on its own two pictures, then on its records\u2019 photographs', () => {
    // The creation run writes each site's own pair first, so no later picture write is needed and no site
    // opens on a photograph another site already opens on.
    const PICTURE = /^https:\/\/res\.cloudinary\.com\/dm3sxllch\/image\/upload\/v\d+\/attractions-network\/tenant-heroes\/([a-z0-9-]+)\/site-20261101-(hero|second)-[0-9a-f]{12}\.png$/;
    for (const site of B14) {
      const pair = site.heroImages.slice(0, 2);
      expect(pair).toEqual(SITE_PICTURES[site.slug]);
      pair.forEach((url, index) => {
        const parts = PICTURE.exec(url);
        expect(parts).not.toBeNull();
        // Each picture sits in its own site's folder, so no site can be opened on another's.
        expect(parts![1]).toBe(site.slug);
        expect(parts![2]).toBe(index === 0 ? 'hero' : 'second');
      });
    }
    // No picture is shared between two sites, and none is one an earlier batch already uses.
    const pictures = B14.flatMap((site) => site.heroImages.slice(0, 2));
    expect(pictures).toHaveLength(2 * B14_SITES);
    expect(new Set(pictures).size).toBe(pictures.length);
    const earlierImages = new Set(EARLIER.flatMap((site) => site.heroImages));
    expect(pictures.filter((url) => earlierImages.has(url))).toEqual([]);
    // Nothing opens on a photograph another site opens on.
    const taken = new Map<string, string>();
    for (const site of EARLIER) if (!taken.has(site.heroImages[0])) taken.set(site.heroImages[0], site.slug);
    expect(B14.filter((site) => taken.has(site.heroImages[0])).map((site) => site.slug)).toEqual([]);
    // Each site shows at least three distinct pictures now, so none needs the shortfall note; the record
    // photographs follow the site's own pair, and every one of them is a record's own.
    const recordPhotos = new Set(B14.flatMap((site) => site.trips.flatMap((trip) => trip.images)));
    for (const site of B14) {
      expect(site.photoShortfall).toBeUndefined();
      expect(site.heroImages.length).toBeGreaterThanOrEqual(3);
      expect(new Set(site.heroImages).size).toBe(site.heroImages.length);
      for (const url of site.heroImages.slice(2)) expect(recordPhotos.has(url)).toBe(true);
    }
    // Each photo is described once across the batch, so none is described two ways.
    const described = new Map<string, Set<string>>();
    for (const site of B14) for (const trip of site.trips) {
      trip.images.forEach((url, index) => {
        if (!described.has(url)) described.set(url, new Set());
        described.get(url)!.add(trip.imageAlts[index]);
      });
    }
    for (const [, alts] of described) expect(alts.size).toBe(1);
    // And the four photographs an earlier batch already describes keep that batch's words.
    const earlierAlts = new Map<string, string>();
    for (const site of EARLIER) for (const trip of site.trips) {
      trip.images.forEach((url, index) => earlierAlts.set(url, trip.imageAlts[index]));
    }
    const shared = [...described.keys()].filter((url) => earlierAlts.has(url));
    expect(shared).toHaveLength(12);
    for (const url of shared) expect([...described.get(url)!][0]).toBe(earlierAlts.get(url));
  });

  it('sells each site exactly the days the assignment gives it', () => {
    expect(Object.fromEntries(B14.map((site) => [site.slug, site.trips.map((trip) => trip.price.source)]))).toEqual(DAYS);
    expect(B14.reduce((total, site) => total + site.trips.length, 0)).toBe(14);
    // No two sites in the batch sell the same day.
    const sold = B14.flatMap((site) => site.trips.map((trip) => trip.price.source));
    expect(new Set(sold).size).toBe(sold.length);
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
    expect([...new Set(sold)].sort()).toEqual(Object.keys(RECORDS).sort());
    // The Dolphin House sites are judged on each record's own published words: both reach that reef, and
    // the two yacht days are different records, one to each site.
    for (const slug of ['shaab-abu-nugar', 'fanadir-north']) {
      for (const trip of siteOf(slug).trips) expect(JSON.stringify(RECORDS[trip.price.source])).toMatch(/dolphin house/i);
    }
    // The two island sites sell the days their own records spend at the larger Giftun.
    for (const slug of ['fanous-east', 'careless-reef']) {
      for (const trip of siteOf(slug).trips) expect(JSON.stringify(RECORDS[trip.price.source])).toMatch(/orange (?:bay|island)/i);
    }
    // North Abu Ramada's two days are the Orange Bay days batch B13's Shaab Sabina sells, on the same
    // larger Giftun its own plateau lies south-east of, and Erg Sabina's is the three-island yacht day
    // batch B13's Erg Somaya sells, which works the islands its own strait lies between.
    const sabina = B13B.sites.find((item) => item.slug === 'shaab-sabina')!;
    const somaya = B13B.sites.find((item) => item.slug === 'erg-somaya')!;
    const sources = (site: NetworkSite) => new Set(site.trips.map((trip) => trip.price.source));
    for (const trip of siteOf('north-abu-ramada').trips) expect(sources(sabina).has(trip.price.source)).toBe(true);
    for (const trip of siteOf('erg-sabina').trips) expect(sources(somaya).has(trip.price.source)).toBe(true);
    // Each record names the water the site sits in, so neither page is sold on a day from elsewhere.
    for (const trip of siteOf('north-abu-ramada').trips) {
      expect(JSON.stringify(RECORDS[trip.price.source])).toMatch(/orange bay/i);
    }
    // Erg Sabina's record names the Giftun islands by name, which is what its page says its day sails to.
    const giftun = RECORDS['hurghada-yacht-cruise-to-orange-bay-giftun-magawish-with-dolphins'];
    expect(JSON.stringify(giftun)).toMatch(/giftun/i);
    expect(String(giftun.title)).toMatch(/Giftun/);
    expect((giftun.included as string[]).filter((line) => /giftun/i.test(line)))
      .toEqual(['Giftun Island Nature Reserve fees included (40min)']);
    // It never names Small Giftun, so the page measures from that island rather than quoting a programme.
    expect(JSON.stringify(giftun)).not.toMatch(/small giftun/i);
    expect(NEAREST['erg-sabina']).toContain('under three kilometres from Small Giftun');
    // Fanous West keeps the day that walks the sandbank it is nearest to.
    expect(JSON.stringify(RECORDS[siteOf('fanous-west').trips[0].price.source])).toMatch(/minq/i);
    // The two Marsa Alam boat sites split the bays on subject: the seagrass bay takes the dugong and turtle
    // days at Marsa Mubarak, and the offshore reef takes the sailing day out of Port Ghalib.
    for (const trip of siteOf('abu-dabbab-beach').trips) {
      expect(JSON.stringify(RECORDS[trip.price.source])).toMatch(/dugong|turtle/i);
    }
    expect(JSON.stringify(RECORDS[siteOf('elphinstone-reef').trips[0].price.source])).toMatch(/port ghalib|pirates/i);
    // The bay inside the park sells the one day that enters that park, and it is a desert day inland.
    expect(JSON.stringify(RECORDS[siteOf('sharm-el-luli').trips[0].price.source])).toMatch(/wadi el gemal/i);
    expect(siteOf('sharm-el-luli').trips[0].description).toMatch(/a day inland in the desert, not a day at the bay/);
    // It names no park ticket, because its record prices none.
    const park = tour('marsa-alam-wadi-el-gemal-jeep-safari-bedouin-dinner')!;
    expect(park.addons).toEqual([]);
    expect(JSON.stringify(RECORDS[park.slug])).not.toMatch(/park (?:fee|ticket)/i);
    expect(ownCopyOf(siteOf('sharm-el-luli').trips[0]) + siteOf('sharm-el-luli').description).not.toMatch(/park (?:fee|ticket)|entry fee/i);
  });

  it('holds back every day the seed or the record refuses, and says so', () => {
    const sold = new Set(B14.flatMap((site) => site.trips).map((trip) => trip.price.source));
    const spec = (source: string, options: string[]): PriceSpec => ({
      provider: 'eeo', tenant: 'egypt-excursions-online', source, category: 'water-activities',
      options, addons: [], departures: [],
    });
    const trip = (price: PriceSpec): NetworkTrip => ({
      ...siteOf('careless-reef').trips[0], path: 'held-back', price,
    });
    const site = { ...siteOf('careless-reef'), slugPrefix: 'tmp-' } as NetworkSite;
    // North Abu Ramada's own nearest days price a departure apart from the booking option, so the seed
    // refuses every per-person option of both records and the site sells two Orange Bay days instead.
    // Named here so the fault cannot be forgotten or quietly worked around.
    const paradise: Array<[string, string]> = [
      ['from-hurghada-paradise-island-yacht-speedboat-cruise-with-snorkeling-lunch', '7-hour-yacht-tour-from-hurghada-hotels-990333086c06'],
      ['makadi-bay-paradise-island-day-trip-with-snorkeling-lunch', '7-hour-yacht-tour-from-hurghada-hotels-27a0011cafe3'],
    ];
    for (const [source, option] of paradise) {
      expect(tour(source)).toBeDefined();
      expect(sold.has(source)).toBe(false);
      expect(() => eeoSourceProgramme(spec(source, [option]))).toThrow(/prices its \d\d:\d\d departure apart from the option/);
      // Every per-person option of each record carries the same fault, so none of them can be sold.
      const perPerson = (tour(source)!.options as Array<Record<string, any>>).filter((item) => item.type === 'Per Person');
      expect(perPerson.length).toBeGreaterThan(0);
      for (const item of perPerson) {
        expect(() => eeoSourceProgramme(spec(source, [item.pricingKey]))).toThrow(/departure apart from the option/);
      }
    }
    // The one option of the second record that prices its departures consistently is sold per group, which
    // the seed refuses too, so reading the record into the snapshot did not unblock the site.
    expect(() => eeoSourceProgramme(spec('makadi-bay-paradise-island-day-trip-with-snorkeling-lunch', ['4-hour-private-speedboat-tour-36cb7565237a'])))
      .toThrow(/is priced "Per Group", not per person/);
    // Erg Sabina's own nearest day publishes a price where the day's length should be, on the record and
    // on the option alike, so the length a guest would read is a sum of money. Nothing here invents one,
    // and the attraction schema requires a length on any trip that can be booked, so the record stays held
    // back exactly as batch B13 held it and the site sells the three-island yacht day instead.
    const noLength = tour('hurghada-orange-bay-snorkeling-diving-cruise-with-massage')!;
    expect(noLength.detail.duration).toBe('$$69');
    expect((noLength.options as Array<Record<string, any>>).map((option) => option.duration)).toEqual(['$69', '$69']);
    expect(sold.has(noLength.slug)).toBe(false);
    const massage = spec(noLength.slug, ['hurghada-snorkelling-trip-by-speedboat-with-h-b4312e73540a']);
    const document = tripDocument(site, trip({ ...massage, departures: ['07:30'], add: { inclusions: ['Pickup and drop-off at your hotel in Hurghada'] } }), eeoSourceProgramme(massage), 0, new Types.ObjectId());
    expect(document.duration).toBe('$69');
    expect(String(document.duration)).not.toMatch(/^\d+(\.\d+)?(( ?- ?| to )\d+(\.\d+)?)? (hours?|days?)$/);
    // A bookable trip with no length at all is refused by the schema, so "no length" is not a way out.
    const { duration: _dropped, ...withoutLength } = document;
    expect(Object.keys(new Attraction(withoutLength).validateSync()?.errors ?? {})).toEqual(['duration']);
  });

  it('says on every page what the programme names, and never that the place is a stop', () => {
    for (const site of B14) {
      const place = PLACE[site.slug];
      const clause = NOT_A_STOP[site.slug];
      for (const trip of site.trips) {
        // Each trip says once, plainly, what its programme names and that the site's place is not among it.
        expect(trip.description).toContain('The programme names ');
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
      // Two short paragraphs, and the closing line batches B11 to B13 end on.
      expect(site.description.split('\n\n')).toHaveLength(2);
      expect(site.description).toContain('Every trip collects you from your hotel and brings you back');
      expect(site.description).toContain('Hold a place online and pay later');
    }
    // The assignment's own sentence for Fanadir North says the boat passes the reef; no programme does, so
    // the sentence written here says where the reef lies instead.
    expect(NEAREST['fanadir-north']).not.toMatch(/passes/);
    expect(siteOf('fanadir-north').description).not.toMatch(/passe?s/i);
  });

  it('builds every trip from the dated snapshot, never from a price typed here', () => {
    for (const site of B14) for (const trip of site.trips) {
      expect(trip.price.provider).toBe('eeo');
      expect(trip.price.tenant).toBe('egypt-excursions-online');
      expect((SNAPSHOT.tours as Array<{ slug: string }>).map((item) => item.slug)).toContain(trip.price.source);
    }
    // Nothing in the batch data is a price, a child rate, a currency or a length of its own: every one of
    // them is read from the record at build time. The header's notes describe the client's published
    // records, so the rule is about the data below them.
    const whole = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'network-sites', 'b14.ts'), 'utf8');
    const source = whole.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/\bprice:\s*[\d.]/);
    expect(source).not.toMatch(/\bchildPrice\b|\bpriceFrom\b|\bcurrency:\s*'(?!USD\b)/);
    // No programme written here gives a trip a length of its own: each is the record's. The lengths inside
    // a written schedule are the step durations that record's own schedule publishes, not the day's total.
    const earlierRecords = new Set(EARLIER.flatMap((item) => item.trips.map((trip) => trip.price.source)));
    for (const site of B14) for (const trip of site.trips) {
      if (!earlierRecords.has(trip.price.source)) expect(trip.price.duration).toBeUndefined();
    }
    // One imported programme does set a length, and batch B08 says why: its record types the option's own
    // length as "8. hours", which is not a length a page can show.
    expect(B08CP.MM_TURTLE.duration).toBe('8 hours');
    expect((tour('marsa-alam-marsa-mubarak-turtle-snorkelling-boat-trip')!.options as Array<Record<string, any>>)[0].duration)
      .toBe('8. hours');
    expect(source).not.toMatch(/[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/);
    // No sentence this batch writes names a sum of money either; a guest reads the structured price.
    const ownCopy = B14.flatMap((site) => [site.tagline, site.description, ...site.trips.map(ownCopyOf)]);
    expect(ownCopy.filter((line) => /[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line))).toEqual([]);
    // One copied line names a sum: the nature reserve fee the second Dolphin House yacht's own record lists
    // as not included, which a guest pays on the day and should read before booking. It is left exactly as
    // the record writes it rather than reworded, and named here so a changed record cannot introduce
    // another unnoticed.
    const copiedMoney = B14.flatMap((site) => built(site, site.trips))
      .flatMap((document) => [...document.inclusions, ...document.exclusions, ...document.needToKnow, ...document.whatToBring] as string[])
      .filter((line) => /[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line));
    expect([...new Set(copiedMoney)]).toEqual([
      'Nature Reserve Fee: €5 per person (adult/child), not included. Pay by cash, Visa, or payment link',
    ]);
    // Every price a guest sees is the published one, copied at build time.
    for (const site of B14) for (const document of built(site, site.trips)) {
      const found = tour((site.trips.find((trip) => `${site.slugPrefix}${trip.path}` === document.slug)!).price.source)!;
      for (const option of document.pricingOptions as Array<Record<string, any>>) {
        const published = (found.options as Array<Record<string, any>>).find((item) => item.pricingKey === option.id)!;
        expect(option.price).toBe(published.guestPrices.adult);
      }
    }
  });

  it('writes every page to the same shape: two paragraphs, four highlights, a photo described', () => {
    for (const site of B14) {
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
    for (const site of B14) for (const document of built(site, site.trips)) { expectCompleteTrip(site, document); count += 1; }
    expect(count).toBe(14);
  });

  it('imports every programme an earlier batch wrote, and writes only the three it must', () => {
    const imported: Array<[string, unknown]> = [
      ['morning-cruise-to-dolphin-house', B09AP.HBT_DOLPHIN_MORNING],
      ['speedboat-run-to-dolphin-house', B09AP.HBT_DOLPHIN_SPEEDBOAT],
      ['orange-island-premium-cruise', B09AP.HBT_ORANGE_LUNCH],
      ['dolphin-house-yacht-cruise', B09AP.HBT_DOLPHIN_YACHT],
      ['six-islands-and-the-sandbank', B09AP.HBT_SIX_ISLANDS],
      ['a-full-day-at-marsa-mubarak', B08CP.MM_TURTLE],
      ['two-bays-and-the-marina', B08CP.MM_DUGONG],
      ['sailing-boat-out-of-port-ghalib', B08CP.MM_SAILING],
      ['jeep-safari-with-a-bedouin-dinner', B09BP.WADI_EL_GEMAL],
      ['orange-bay-snorkel-and-dive', B09AP.HBT_ORANGE_DIVE],
      ['orange-bay-yacht-five-or-eight-hours', B09AP.HBT_ORANGE_YACHT],
      ['three-islands-and-two-stops-in-the-water', B09AP.HBT_THREE_ISLANDS],
    ];
    for (const [tripPath, programme] of imported) {
      const trips = B14.flatMap((site) => site.trips).filter((trip) => trip.path === tripPath);
      expect(trips).toHaveLength(1);
      // The same object, so the network says the same thing about the same trip wherever it is sold.
      for (const item of trips) expect(item.price).toBe(programme);
    }
    // The two programmes this group writes are exactly the records no earlier batch sells. Every earlier
    // batch is searched, so a programme written here that already existed somewhere would fail this.
    const earlier = new Set(EARLIER.flatMap((site) => site.trips.map((trip) => trip.price.source)));
    const own = B14.flatMap((site) => site.trips).filter((trip) => !earlier.has(trip.price.source));
    expect(own.map((trip) => trip.price.source).sort()).toEqual([
      'hurghada-dolphin-house-yacht-trip-with-snorkeling-lunch',
      'hurghada-orange-bay-parasailing-snorkeling-lunch-adventure',
    ]);
    // Neither of the two writes a schedule the record could have given: each record's own names a place it
    // does not visit, or a list of pickup areas, so the day is written from the stops the record names.
    for (const item of own) {
      expect(item.price.itinerary?.length).toBeGreaterThan(2);
      expect(scheduleOf(item)).not.toMatch(/Sataya|Limousine|Ferry|pickup location|Arrive back at/i);
    }
    // Fourteen trips on fourteen programmes: no site in the batch sells a day another site in it sells.
    expect(new Set(B14.flatMap((site) => site.trips).map((trip) => trip.price)).size).toBe(14);
  });

  it('starts each site where its own trips start', () => {
    // The five reefs follow the Hurghada boat site of batch B09: the same town, pickup area, coordinates
    // and fence.
    const boats = B09A.sites.find((item) => item.slug === 'hurghada-boat-tour')!;
    for (const slug of ['shaab-abu-nugar', 'fanous-east', 'north-abu-ramada', 'careless-reef', 'fanadir-north',
      'erg-sabina', 'fanous-west']) {
      const site = siteOf(slug);
      expect([site.city, site.pickupDestination, site.area]).toEqual(['Hurghada', 'hurghada', 'Hurghada']);
      expect(site.coordinates).toEqual(boats.coordinates);
      expect(site.foreignPlaces.source).toEqual(boats.foreignPlaces.source);
      for (const document of built(site, site.trips)) expect(document.meetingPoint.address).toBe('Your hotel in Hurghada');
    }
    // The three Marsa Alam sites follow the Marsa Mubarak site of batch B08, whose records collect in the
    // town, the Port Ghalib day included: its bus runs to the marina from the hotel it collects at.
    const mubarak = B08C.sites.find((item) => item.slug === 'marsa-mubarak')!;
    for (const slug of ['abu-dabbab-beach', 'elphinstone-reef', 'sharm-el-luli']) {
      const site = siteOf(slug);
      expect([site.city, site.pickupDestination, site.area]).toEqual(['Marsa Alam', 'marsa-alam', 'Marsa Alam']);
      expect(site.coordinates).toEqual(mubarak.coordinates);
      for (const document of built(site, site.trips)) expect(document.meetingPoint.address).toBe('Your hotel in Marsa Alam');
    }
    expect(siteOf('abu-dabbab-beach').foreignPlaces.source).toEqual(mubarak.foreignPlaces.source);
    // The bay inside the park keeps that same fence with one change: it bars the town of Sharm El Sheikh by
    // name rather than the bare word, which is the first word of this site's own place.
    expect(siteOf('sharm-el-luli').foreignPlaces.test('Sharm El Luli')).toBe(false);
    expect(siteOf('sharm-el-luli').foreignPlaces.test('Sharm El Sheikh')).toBe(true);
    expect(siteOf('elphinstone-reef').foreignPlaces.test('Sharm El Sheikh')).toBe(true);
    // No trip in the batch starts anywhere but where its site does. One record is filed by the client under
    // Makadi Bay and titled for it, but the booking option sold is its "Tour from Hurghada", so the trip
    // collects in Hurghada like every other trip on its site and names no second starting town.
    for (const site of B14) for (const trip of site.trips) expect(trip.where).toBeUndefined();
    const makadiTitled = tour('makadi-bay-snorkeling-and-diving-at-orange-bay')!;
    expect(makadiTitled.detail.title).toMatch(/^Makadi Bay:/);
    expect(B09AP.HBT_ORANGE_DIVE.options).toEqual(['tour-from-hurghada-5a8a06dd2db1']);
    expect((makadiTitled.options as Array<Record<string, any>>)
      .find((option) => option.pricingKey === 'tour-from-hurghada-5a8a06dd2db1')!.description)
      .toBe('This option includes pickup and drop-off in Hurghada.');
    for (const document of built(siteOf('north-abu-ramada'), siteOf('north-abu-ramada').trips)) {
      expect(document.meetingPoint.address).toBe('Your hotel in Hurghada');
      expect(document.destination.city).toBe('Hurghada');
    }
  });

  it('takes no booking on a new site until its domain is connected and the owner opens it', () => {
    for (const site of B14) expect(isTenantBookingCreationClosed({ slug: site.slug })).toBe(true);
    for (const site of B14) {
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
    const complete = Object.fromEntries(B14.map((site) => [site.slug, good(site.slug)]));
    for (const batch of GROUPS) expect(logoProblems(batch, complete)).toEqual([]);
    // Every site of a group is required: a file missing any single one refuses the group that holds it.
    expect(Object.keys(complete)).toHaveLength(B14_SITES);
    for (const site of B14) {
      const { [site.slug]: _dropped, ...withoutOne } = complete;
      const batch = B14A.sites.includes(site) ? B14A : B14B;
      expect(logoProblems(batch, withoutOne)).toEqual([`${site.slug}: no logo entry.`]);
    }
    expect(logoProblems(B14A, { ...complete, 'careless-reef': { ...good('careless-reef'), favicon: '' } }))
      .toEqual(['careless-reef: favicon is missing.']);
    expect(logoProblems(B14B, { ...complete, 'sharm-el-luli': { ...good('sharm-el-luli'), logoDark: 'https://example.com/logo.png' } }))
      .toEqual(["sharm-el-luli: logoDark must already be on the network's Cloudinary: https://example.com/logo.png"]);
  });

  it('repeats no sentence another site on the network already publishes', () => {
    const mine = B14.flatMap(copyOfSite);
    // Every B14 field is written for its own site: a trip field against the same record elsewhere, a tenant
    // field against every other site's tenant copy.
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
    // Every record this batch sells that the network already sells has its live copy in the corpus.
    const covered = new Set(LIVE.trips.map((trip) => trip.record));
    const earlier = new Set(EARLIER.flatMap((site) => site.trips.map((trip) => trip.price.source)));
    const sold = [...new Set(B14.flatMap((site) => site.trips).map((trip) => trip.price.source))];
    expect(sold.filter((record) => earlier.has(record) && !covered.has(record))).toEqual([]);
    expect(CORPUS.length).toBeGreaterThan(3000);
    expect(mine.length).toBeGreaterThan(60);
  });

  it('counts the trips its copy names', () => {
    for (const site of B14) {
      const copy = [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription, ...site.seo.keywords].join('\n');
      for (const count of statedTripCounts(copy)) expect(count).toBe(site.trips.length);
    }
    // Every site counts its days out loud, so each count is held to that site's own catalogue.
    expect(statedTripCounts(siteOf('shaab-abu-nugar').description)).toEqual([3]);
    expect(statedTripCounts(siteOf('abu-dabbab-beach').description)).toEqual([2]);
    expect(statedTripCounts(siteOf('north-abu-ramada').description)).toEqual([2]);
    for (const slug of ['fanous-east', 'careless-reef', 'fanadir-north', 'erg-sabina', 'fanous-west', 'elphinstone-reef', 'sharm-el-luli']) {
      expect(statedTripCounts(siteOf(slug).description)).toEqual([1]);
    }
  });
});
