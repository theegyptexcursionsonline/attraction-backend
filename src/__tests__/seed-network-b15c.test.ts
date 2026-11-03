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
import { B08A, B08B, B08C, B08D, PROGRAMMES_C as B08CP } from '../scripts/network-sites/b08';
import { B09A, B09B, B09C, PROGRAMMES_A as B09AP, PROGRAMMES_B as B09BP } from '../scripts/network-sites/b09';
import { B10A, B10B, B10C, B10D } from '../scripts/network-sites/b10';
import { B11A, B11B } from '../scripts/network-sites/b11';
import { B12A, B12B } from '../scripts/network-sites/b12';
import { B13A, B13B } from '../scripts/network-sites/b13';
import { B14A, B14B } from '../scripts/network-sites/b14';
import { B15A, B15B } from '../scripts/network-sites/b15';
import { B15C } from '../scripts/network-sites/b15c';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';
import { isTenantBookingCreationClosed } from '../services/tenantBookingPolicy.service';

const EARLIER = [B01_SAFARI, B02, B03A, B03B, B03C, B03D, B08A, B08B, B08C, B08D, B09A, B09B, B09C,
  B10A, B10B, B10C, B10D, B11A, B11B, B12A, B12B, B13A, B13B, B14A, B14B, B15A, B15B].flatMap((batch) => batch.sites);
const SITES = B15C.sites;
const siteOf = (slug: string) => SITES.find((site) => site.slug === slug)!;

/**
 * Batch B15C is the four offshore places the owner added to batch B15 on 2 November: three in open sea and one
 * wreck whose position has never been published. Every one of them is far from the nearest day the client
 * publishes, and the tests below hold each site to saying so and to saying that the day does not reach it.
 */
const B15C_SITES = 4;

/** Each new site's storefront design, from the group concepts; the storefront picks it by slug. */
const DESIGNS: Record<string, string> = {
  'daedalus-reef': 'daedalus',
  'el-ikhwa-islands': 'ikhwa',
  'zabargad-island': 'zabargad',
  'hebat-allah-wreck': 'hebatallah',
};

/** Every new site's domain, as Fouad's list gives it. */
const DOMAINS: Record<string, string> = {
  'daedalus-reef': 'daedalusreefredsea.com',
  'el-ikhwa-islands': 'elikhwaislands.com',
  'zabargad-island': 'zabargadisland.com',
  'hebat-allah-wreck': 'hebatallahwreck.com',
};

/** The admin palette each site is created with, from the group concepts (primary / secondary / accent). */
const THEMES: Record<string, [string, string, string]> = {
  'daedalus-reef': ['#10212B', '#F2F5F7', '#8A2B1F'],
  'el-ikhwa-islands': ['#1F2A33', '#F6F1E8', '#7A3E12'],
  'zabargad-island': ['#22281F', '#F4F2EA', '#1F4F2E'],
  'hebat-allah-wreck': ['#1B2126', '#EEF0F1', '#6B2D5C'],
};

/**
 * What each site shows, held here as literals so the batch is checked against the addresses the client already
 * publishes rather than against itself. No new picture was made for this group (the coordinator's decision of
 * 3 November), so every one of these is a photograph the client publishes on the record of the day the site
 * sells, or on another record of the same water. Daedalus Reef has one, because the Shaab Samadai day publishes
 * one photograph and no second photograph of that day exists on the network or on the client's page.
 */
const SITE_PICTURES: Record<string, string[]> = {
  'daedalus-reef': ['https://res.cloudinary.com/dm3sxllch/image/upload/v1788795260/tours/fs65spccs0uncfww6z9k.jpg'],
  'el-ikhwa-islands': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085626/attractions-network/network-b08/marsa-mubarak/xaeglheldpkpkqkrjtg7.jpg',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085624/attractions-network/network-b08/marsa-mubarak/hua97b4rgydbu8xtuked.jpg',
  ],
  'zabargad-island': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085622/attractions-network/network-b08/marsa-mubarak/vqybfirbk4vtbiqdtv70.jpg',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085624/attractions-network/network-b08/marsa-mubarak/hua97b4rgydbu8xtuked.jpg',
  ],
  'hebat-allah-wreck': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1788289814/tours/mqucr1dumbvdnyqejzc6.jpg',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1787782233/tours/wirlheh3pj6ibboavetn.jpg',
  ],
};

/** The logos the owner's uploads give this group, as `--apply` is given them. */
const LOGO_BOOK = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'network-b15c-logos.json'), 'utf8')) as Record<string, { logo: string; logoDark: string; favicon: string }>;

/** The day the coordinator's assignment (b15c/days.json) gives each site. */
const DAYS: Record<string, string[]> = {
  'daedalus-reef': ['shaab-samadai-dolphin-sanctuary-snorkel-cruise-from-marsa-alam'],
  'el-ikhwa-islands': ['marsa-alam-marsa-mubarak-turtle-snorkelling-boat-trip'],
  'zabargad-island': ['marsa-alam-luxury-pirates-boat-snorkeling-cruise-with-lunch'],
  'hebat-allah-wreck': ['hurghada-orange-bay-yacht-cruise-with-snorkeling-breakfast-lunch-drinks'],
};

/** How far each site's own place is from the point its day's programme names, as the assignment measures it. */
const DISTANCE_KM: Record<string, number | null> = {
  'daedalus-reef': 88.95,
  'el-ikhwa-islands': 90.96,
  'zabargad-island': 257.18,
  'hebat-allah-wreck': null,
};

/** What each site's own place is called, so no page can be read as selling a stop there. */
const PLACE: Record<string, RegExp> = {
  'daedalus-reef': /Daedalus|Abu el-Kizan|Abu Kizan/i,
  'el-ikhwa-islands': /El Ikhwa|Al Ikhw|Akhaween|The Brothers|Big Brother|Little Brother/i,
  'zabargad-island': /Zabargad|Topazos|St John/i,
  'hebat-allah-wreck': /Hebat Allah/i,
};

/** The one clause in which a site's trip copy may name its own place: to say it is not a stop. */
const NOT_A_STOP: Record<string, string> = {
  'daedalus-reef': ', not Daedalus Reef, the lighthouse reef lying about ninety kilometres further out to the south-east; nothing on this day sails anywhere near it.',
  'el-ikhwa-islands': ', not El Ikhwa, the two islands in open sea roughly ninety kilometres out from it; no boat on this day leaves the coast.',
  'zabargad-island': ', not Zabargad, the island of the green stone lying about two hundred and sixty kilometres south-east of the further one; nothing of this day goes out to it.',
  'hebat-allah-wreck': ', not the Hebat Allah, the freighter put on the sea floor off Hurghada in 2004, whose position has never been published; no day sold here dives it, and nothing on this one goes under the surface at all.',
};

/**
 * The "nearest days" sentence every site's description carries, word for word. All four are the coordinator's
 * own, from `b15c/days.json`, and nothing in them is moved: none is a run another site on the network already
 * publishes about the same day, because the sites that already sell these four records have no place of their
 * own to disclaim.
 */
const NEAREST: Record<string, string> = {
  'daedalus-reef': 'The reef this boat day snorkels is Shaab Samadai, off Marsa Alam; its programme does not name Daedalus Reef, the lighthouse reef that stands alone in open sea some ninety kilometres further out to the south-east.',
  'el-ikhwa-islands': 'This boat day stays in the coastal bay of Marsa Mubarak. The Brothers are not in its programme: the two islands lie roughly ninety kilometres out from that bay, in open sea off El Quseir.',
  'zabargad-island': 'This day sails out of Port Ghalib to snorkel the inshore bays of Marsa Mubarak and Marsa Shona. Zabargad is not among its stops, and could not be: the island lies about two hundred and sixty kilometres south-east of Marsa Shona, far beyond a day boat’s reach.',
  'hebat-allah-wreck': 'This yacht day is spent snorkelling at Orange Bay, off Hurghada. The Hebat Allah is not in its programme, and no day sold here dives the wreck: it lies deeper than recreational diving allows, and because its position has never been published, how far the boat passes from it cannot be said.',
};

/** Verbs that would turn a mention of the site's own place into a stop the record does not publish. */
const VISIT = 'visits?|visiting|visited|enter(?:s|ing|ed)?|inside|into|explore[sd]?|exploring|tour of|'
  + 'see(?:s|ing)?|walk(?:s|ing)? (?:through|into|round|around|down)|step(?:s|ping)? (?:into|inside)|'
  + 'stop(?:s|ping)? (?:at|in)|descend(?:s|ing)? (?:into|to)|down into|take[sn]? you (?:to|into|inside)|'
  + 'anchors? (?:at|off)|moors? (?:at|off)|snorkell?(?:s|ing)? (?:at|on)|dives? (?:at|on)|passe?s';

/** A line that holds only for an option the trip does not sell, or for an extra it cannot offer. */
const CONDITIONAL = /\(if |if selected|if add-on|if (?:the )?option|add on selection|5h Tour:|8h Tour:|depending on the option/i;

/**
 * No two sites may read alike. Every words field of a B15C trip — title, short, description, each highlight and
 * its SEO pair — shares no run of eight words with any OTHER site's copy of the SAME record, and no field
 * equals another site's field outright; a B15C site's own tagline, description and SEO share no such run with
 * any other site's tenant copy either. The closing line every network site ends on is stripped before comparing.
 *
 * The corpus is every earlier batch file — batches B14 and B15 among them, so their sites are compared from
 * their own source — plus the dated scan of the live network kept for batch B14 (31 October 2026, the 121
 * tenants live before B14 was applied). Between them the two cover every site on the network.
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

const RECORDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'network-b15c-record-names.json'), 'utf8')) as Record<string, Record<string, unknown>>;

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

/** Every rule a B15C trip keeps. */
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
  // Nor of the reef far to the south that one Hurghada record's own schedule names in place of its own stop.
  expect(guestCopy(document)).not.toMatch(/Sataya/i);
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

describe('batch B15C: three places in open sea and a wreck whose place is not published', () => {
  it('is one group of four sites, none of them built before', () => {
    expect(B15C.id).toBe('b15c');
    expect(SITES.map((site) => site.slug)).toEqual(Object.keys(DESIGNS));
    expect(SITES.map((site) => site.name)).toEqual(['Daedalus Reef', 'El Ikhwa Islands', 'Zabargad Island', 'M/V Hebat Allah']);
    expect(SITES).toHaveLength(B15C_SITES);
    for (const site of SITES) {
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
    for (const site of SITES) {
      expect(before.has(site.slug) || before.has(site.domain) || before.has(site.slugPrefix)).toBe(false);
    }
    expect(SITES.map((site) => site.slugPrefix)).toEqual(['drf-', 'eik-', 'zbg-', 'hba-']);
    // No site across every batch shares a title or a trip slug.
    const every = [...EARLIER, ...SITES];
    const titles = every.map((site) => site.seo.metaTitle.trim().toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    const slugs = every.flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('shows only photographs the client already publishes, and says it has none of the place', () => {
    // No picture of any of these four places was made, so no site opens on one: each shows the photographs its
    // own day publishes, or another record of the same water, and each says so in its own note.
    for (const site of SITES) {
      expect(site.heroImages).toEqual(SITE_PICTURES[site.slug]);
      expect(new Set(site.heroImages).size).toBe(site.heroImages.length);
      // Every address is one an earlier batch already publishes: nothing here is a new upload.
      const earlier = new Set(EARLIER.flatMap((other) => [...other.heroImages, ...other.trips.flatMap((trip) => trip.images)]));
      for (const url of site.heroImages) expect(earlier.has(url)).toBe(true);
      // The photograph of the site's own day is among them, and it is the one its trip page carries.
      expect(site.heroImages).toContain(site.trips[0].images[0]);
      // Fewer than three, so each site carries its note, and the note never calls a photograph the place.
      expect(site.heroImages.length).toBeLessThan(3);
      expect(site.photoShortfall).toMatch(/^No photograph of th/);
      expect(site.photoShortfall).toMatch(/could be made|exists to show/);
      expect(site.photoShortfall).toMatch(/not (?:a photograph )?of the|neither (?:of them )?is a photograph of/);
    }
    // Daedalus Reef is the one site with a single photograph: its day publishes one, and the two sites that
    // already sell that day carry that same one photograph and nothing else.
    expect(siteOf('daedalus-reef').heroImages).toHaveLength(1);
    const alsoSellSamadai = EARLIER.filter((site) => site.trips.some((trip) => trip.price.source === DAYS['daedalus-reef'][0]));
    expect(alsoSellSamadai.map((site) => site.slug)).toEqual(['marsa-alam-red-sea-egypt', 'shaab-samadai', 'samadai-beach']);
    for (const site of alsoSellSamadai.filter((item) => item.trips.length === 1)) {
      expect(site.heroImages).toEqual(siteOf('daedalus-reef').heroImages);
    }
    // One photograph is shared between two sites of the group, and no more: the turtle over the shallow reef,
    // taken at Marsa Mubarak, which is a stop on both of those days.
    const shared = SITES.flatMap((site) => site.heroImages).filter((url, index, all) => all.indexOf(url) !== index);
    expect(shared).toEqual(['https://res.cloudinary.com/dm3sxllch/image/upload/v1793085624/attractions-network/network-b08/marsa-mubarak/hua97b4rgydbu8xtuked.jpg']);
    // Nothing is waiting to be filled in: the group is valid as it stands.
    expect(validateBatch(B15C)).toEqual([]);
  });

  it('shows each site its record’s own photograph, in the words that record already carries', () => {
    // Each of the four records publishes one photograph. Each is described here exactly as the batch that first
    // sold that record describes it, so the network never describes one photograph two ways.
    const earlierAlts = new Map<string, string>();
    for (const site of EARLIER) for (const trip of site.trips) {
      trip.images.forEach((url, index) => earlierAlts.set(url, trip.imageAlts[index]));
    }
    for (const site of SITES) for (const trip of site.trips) {
      expect(trip.images).toHaveLength(1);
      expect(trip.imageAlts).toHaveLength(1);
      expect(earlierAlts.get(trip.images[0])).toBe(trip.imageAlts[0]);
    }
    // No two sites of the group show the same record photograph.
    const photos = SITES.flatMap((site) => site.trips.flatMap((trip) => trip.images));
    expect(new Set(photos).size).toBe(photos.length);
  });

  it('sells each site exactly the day the assignment gives it', () => {
    expect(Object.fromEntries(SITES.map((site) => [site.slug, site.trips.map((trip) => trip.price.source)]))).toEqual(DAYS);
    expect(SITES.reduce((total, site) => total + site.trips.length, 0)).toBe(B15C_SITES);
    // Each of the four sites sells a different day, and none of them is one of batch B15's four.
    const days = SITES.flatMap((site) => site.trips.map((trip) => trip.price.source));
    expect(new Set(days).size).toBe(B15C_SITES);
    const b15Days = new Set([...B15A.sites, ...B15B.sites].flatMap((site) => site.trips.map((trip) => trip.price.source)));
    expect(days.filter((record) => b15Days.has(record))).toEqual([]);
    // What each record the group sells says about itself, kept beside this test: its published title, its
    // booking options and its schedule, from the dated snapshot.
    for (const [slug, record] of Object.entries(RECORDS)) {
      const found = tour(slug)!;
      expect(found.detail.title).toBe(record.title);
      expect((found.options as Array<{ title: string }>).map((option) => option.title)).toEqual(record.options);
      expect((found.options as Array<{ pricingKey: string }>).map((option) => option.pricingKey)).toEqual(record.optionKeys);
      expect((found.detail.itinerary as Array<{ title: string }> | null || []).map((step) => step.title)).toEqual(record.itinerary);
    }
    expect([...new Set(days)].sort()).toEqual(Object.keys(RECORDS).sort());
    // The Shaab Samadai record is in the snapshot, which is the one question the assignment left to this step,
    // and its own page is titled for a Dolphin House, a reef off Hurghada that is not this day's stop: the
    // site's fence bars that name, so it cannot reach a page here.
    const samadai = RECORDS['shaab-samadai-dolphin-sanctuary-snorkel-cruise-from-marsa-alam'];
    expect(String(samadai.title)).toMatch(/Shaab Samadai/);
    expect(siteOf('daedalus-reef').foreignPlaces.test('Dolphin House')).toBe(true);
    // El Ikhwa takes the Marsa Mubarak day that names that bay alone; the client's second Mubarak day, which
    // measures the same distance, is left alone so each site of the group sells a different one.
    expect(DAYS['el-ikhwa-islands']).toEqual(['marsa-alam-marsa-mubarak-turtle-snorkelling-boat-trip']);
    expect(days).not.toContain('marsa-mubarak-boat-trip-snorkel-with-dugongs-giant-turtles');
    // Zabargad takes the Port Ghalib sailing day, not the inland jeep day five network sites already sell.
    expect(days).not.toContain('marsa-alam-wadi-el-gemal-jeep-safari-bedouin-dinner');
    // The Hebat Allah's day is a snorkelling day: nothing in its programme is a dive, which is why the two
    // Hurghada intro-dive days and the speedboat with an unnamed wreck stop were all left alone.
    const orange = RECORDS['hurghada-orange-bay-yacht-cruise-with-snorkeling-breakfast-lunch-drinks'];
    expect(JSON.stringify(orange)).not.toMatch(/\bdive\b|\bdiving\b|\bwreck\b/i);
    expect(days).not.toContain('hurghada-speedboat-trip-to-6-islands-with-dolphin-watching-snorkeling');
    expect(days).not.toContain('hurghada-luxury-red-sea-diving-snorkeling-island-lunch');
  });

  it('says on every page how far the day is, and never that the place is a stop', () => {
    for (const site of SITES) {
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
      // Two paragraphs, and the closing line batches B11 to B15 end on.
      expect(site.description.split('\n\n')).toHaveLength(2);
      expect(site.description).toContain('Every trip collects you from your hotel and brings you back');
      expect(site.description).toContain('Hold a place online and pay later');
    }
    // Three of the four say how far the day's own point is, in words. The fourth cannot and says so instead.
    expect(siteOf('daedalus-reef').description).toContain('some ninety kilometres further out to the south-east');
    expect(siteOf('el-ikhwa-islands').description).toContain('roughly ninety kilometres out from that bay');
    expect(siteOf('zabargad-island').description).toContain('about two hundred and sixty kilometres south-east of Marsa Shona');
    expect(DISTANCE_KM['hebat-allah-wreck']).toBeNull();
    expect(siteOf('hebat-allah-wreck').description).toContain('how far the boat passes from it cannot be said');
    // Not one of the four sentences is a run another site already publishes about the same day.
    for (const [slug, sentence] of Object.entries(NEAREST)) {
      expect(siteOf(slug).description).toContain(sentence);
      expect(EARLIER.filter((site) => site.description.includes(sentence))).toEqual([]);
    }
  });

  it('keeps the wreck’s silence absolute: no position, no distance, no museum beside it', () => {
    // The wreck's position has never been published, so no page of that site shows a coordinate, a bearing or a
    // distance, and no page suggests any day reaches it.
    const site = siteOf('hebat-allah-wreck');
    const everyWord = [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription,
      ...site.seo.keywords, ...site.trips.map(ownCopyOf), ...site.trips.flatMap((trip) => trip.imageAlts)].join('\n');
    expect(everyWord).not.toMatch(/\d+\.\d+\s*[NSEW]|\bN,\s*\d|coordinates of|latitude|longitude|\bmap\b|\bpin\b|bearing/i);
    expect(everyWord).not.toMatch(/\bkilometres? (?:from|off|south|north|east|west)/i);
    // It is never set beside the underwater military museum, which is a different thing the client sells apart.
    expect(everyWord).not.toMatch(/museum|military/i);
    // The depth is never given as exact, and no length is given at all.
    expect(site.description).toContain('about forty-six metres');
    expect(site.description).not.toMatch(/\b(?:51|44|44\.5|60)\s*m\b|metres long/i);
    // And the page says what is sourced: every dive on it is a decompression dive, and no day sold here dives it.
    expect(site.description).toContain('every dive on it is a decompression dive');
    expect(site.description).toContain('no day sold here dives the wreck');
    expect(site.trips[0].description).toContain('no day sold here dives it');
  });

  it('writes none of the facts the sources contradict each other on', () => {
    const wordsOf = (slug: string) => {
      const site = siteOf(slug);
      return [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription,
        ...site.seo.keywords, ...site.trips.map(ownCopyOf)].join('\n');
    };
    // Daedalus: the Lighthouse Directory and English Wikipedia disagree over who established the 1863 station,
    // so no nationality is written, and no distance offshore but the one two sources agree on.
    const daedalus = wordsOf('daedalus-reef');
    expect(daedalus).toContain('about ninety kilometres east of Marsa Alam');
    expect(daedalus).not.toMatch(/French|France|British initiative|erected under/i);
    expect(daedalus).not.toMatch(/\b(?:80|100)\s*km\b|eighty kilometres|a hundred kilometres|jetty|cast-iron/i);
    // El Ikhwa: three reputable years are published for the Aida, so the wreck carries no year; nothing says the
    // islands are volcanic; no area is given, and the lighthouse's own coordinate is published too widely apart.
    const ikhwa = wordsOf('el-ikhwa-islands');
    expect(ikhwa).not.toMatch(/Aida|volcan|sea mount|pinnacle island|0\.78|0\.26|km²/i);
    expect(ikhwa).toContain('the published figures for that tower differ by two hundred and forty-eight metres');
    expect(ikhwa).not.toMatch(/no-anchoring|night diving|surface marker|Egyptian Navy/i);
    // Zabargad: no height, no area, no date for the start of the mining, and nothing at all about access today.
    const zabargad = wordsOf('zabargad-island');
    expect(zabargad).toContain('classical antiquity');
    expect(zabargad).not.toMatch(/235|250 m|4\.5|4\.66|450 ha|300 BC|BCE|nickel|open to visitors (?:now|today)|currently/i);
    expect(zabargad).toContain('closed to visitors for about a year at a time');
    // And the group never names a species, a fee, a rule, an opening time or a facility beyond its facts.
    for (const slug of Object.keys(DESIGNS)) {
      expect(wordsOf(slug)).not.toMatch(/opening hours|entrance fee|untouched|unspoil|\bofficial\b/i);
    }
  });

  it('builds every trip from the dated snapshot, never from a price typed here', () => {
    for (const site of SITES) for (const trip of site.trips) {
      expect(trip.price.provider).toBe('eeo');
      expect(trip.price.tenant).toBe('egypt-excursions-online');
      expect((SNAPSHOT.tours as Array<{ slug: string }>).map((item) => item.slug)).toContain(trip.price.source);
    }
    // Nothing in the batch data is a price, a child rate, a currency or a length of its own: every one of them
    // is read from the record at build time.
    const whole = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'network-sites', 'b15c.ts'), 'utf8');
    const source = whole.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/\bprice:\s*[\d.]/);
    expect(source).not.toMatch(/\bchildPrice\b|\bpriceFrom\b|\bcurrency:\s*'(?!USD\b)/);
    expect(source).not.toMatch(/[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/);
    // This group writes no programme at all, so it sets no length of its own: each is the record's own, or the
    // length the batch that first sold the record had to write for it.
    const withLength = SITES.flatMap((site) => site.trips).filter((trip) => trip.price.duration !== undefined);
    expect(withLength.map((trip) => trip.price.source)).toEqual([
      'marsa-alam-marsa-mubarak-turtle-snorkelling-boat-trip',
      'hurghada-orange-bay-yacht-cruise-with-snorkeling-breakfast-lunch-drinks',
    ]);
    expect(B08CP.MM_TURTLE.duration).toBe('8 hours');
    expect(B09AP.HBT_ORANGE_YACHT.duration).toBe('5 to 8 hours');
    // No sentence this group writes names a sum of money; a guest reads the structured price.
    const ownCopy = SITES.flatMap((site) => [site.tagline, site.description, ...site.trips.map(ownCopyOf)]);
    expect(ownCopy.filter((line) => /[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line))).toEqual([]);
    // The copied lines that do name a sum are the fees a guest pays on the day and should read before booking.
    // They are left exactly as the records write them, and named here so a changed record cannot add another.
    const copiedMoney = SITES.flatMap((site) => built(site, site.trips))
      .flatMap((document) => [...document.inclusions, ...document.exclusions, ...document.needToKnow, ...document.whatToBring] as string[])
      .filter((line) => /[$€£]\s?\d|\d+\s?[$€£]|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line));
    expect([...new Set(copiedMoney)]).toEqual([
      'National park/environmental entrance fee (10€/Person)',
    ]);
    // Every price a guest sees is the published one, copied at build time.
    for (const site of SITES) for (const document of built(site, site.trips)) {
      const found = tour((site.trips.find((trip) => `${site.slugPrefix}${trip.path}` === document.slug)!).price.source)!;
      for (const option of document.pricingOptions as Array<Record<string, any>>) {
        const published = (found.options as Array<Record<string, any>>).find((item) => item.pricingKey === option.id)!;
        expect(option.price).toBe(published.guestPrices.adult);
      }
    }
  });

  it('writes every page to the same shape: two paragraphs, four highlights, a photo described', () => {
    for (const site of SITES) {
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
    for (const site of SITES) for (const document of built(site, site.trips)) { expectCompleteTrip(site, document); count += 1; }
    expect(count).toBe(B15C_SITES);
  });

  it('imports every programme from the batch that first sold its record, and writes none', () => {
    const imported: Array<[string, unknown]> = [
      ['seven-hours-at-the-horseshoe-reef', B09BP.SHAAB_SAMADAI],
      ['a-day-in-the-bay-either-side-of-the-meal', B08CP.MM_TURTLE],
      ['four-and-a-half-hours-under-sail', B08CP.MM_SAILING],
      ['a-short-day-ashore-or-a-long-one', B09AP.HBT_ORANGE_YACHT],
    ];
    for (const [tripPath, programme] of imported) {
      const trips = SITES.flatMap((site) => site.trips).filter((trip) => trip.path === tripPath);
      expect(trips).toHaveLength(1);
      // The same object, so the network says the same thing about the same trip wherever it is sold.
      for (const item of trips) expect(item.price).toBe(programme);
    }
    // Every record this group sells is one an earlier batch already sells, so the group writes no programme of
    // its own. Every earlier batch is searched, so a programme written here would fail this.
    const earlier = new Set(EARLIER.flatMap((site) => site.trips.map((trip) => trip.price.source)));
    expect(SITES.flatMap((site) => site.trips).filter((trip) => !earlier.has(trip.price.source))).toEqual([]);
    expect(new Set(SITES.flatMap((site) => site.trips).map((trip) => trip.price)).size).toBe(B15C_SITES);
  });

  it('starts each site where its own trips start', () => {
    // The three offshore sites collect in Marsa Alam, as batch B14's own Marsa Alam coast sites do, and keep
    // that fence; El Ikhwa alone lets El Quseir through, because the islands lie off that town and the facts
    // give no other way to say where they are.
    const abuDabbab = B14B.sites.find((item) => item.slug === 'abu-dabbab-beach')!;
    for (const slug of ['daedalus-reef', 'el-ikhwa-islands', 'zabargad-island']) {
      const site = siteOf(slug);
      expect([site.city, site.pickupDestination, site.area]).toEqual(['Marsa Alam', 'marsa-alam', 'Marsa Alam']);
      expect(site.coordinates).toEqual(abuDabbab.coordinates);
      for (const document of built(site, site.trips)) expect(document.meetingPoint.address).toBe('Your hotel in Marsa Alam');
    }
    expect(siteOf('zabargad-island').foreignPlaces.source).toBe(abuDabbab.foreignPlaces.source);
    expect(siteOf('el-ikhwa-islands').foreignPlaces.test('El Quseir')).toBe(false);
    expect(siteOf('el-ikhwa-islands').foreignPlaces.test('Hurghada')).toBe(true);
    expect(siteOf('zabargad-island').foreignPlaces.test('El Quseir')).toBe(true);
    // The wreck's site follows the Hurghada boat site of batch B09: the same town, pickup area, coordinates and
    // fence, which is the fence batches B13 to B15 gave their reefs too.
    const boats = B09A.sites.find((item) => item.slug === 'hurghada-boat-tour')!;
    const hebat = siteOf('hebat-allah-wreck');
    expect([hebat.city, hebat.pickupDestination, hebat.area]).toEqual(['Hurghada', 'hurghada', 'Hurghada']);
    expect(hebat.coordinates).toEqual(boats.coordinates);
    for (const document of built(hebat, hebat.trips)) expect(document.meetingPoint.address).toBe('Your hotel in Hurghada');
    // No trip in the group starts anywhere but where its site does.
    for (const site of SITES) for (const trip of site.trips) expect(trip.where).toBeUndefined();
  });

  it('takes no booking on a new site until its domain is connected and the owner opens it', () => {
    for (const site of SITES) expect(isTenantBookingCreationClosed({ slug: site.slug })).toBe(true);
    for (const site of SITES) {
      const record = tenantRecord(site);
      expect(record.customDomain).toBeUndefined();
      expect(record.domainMigrated).toBe(false);
      expect(record.domain).toBe(`${site.slug}.foxesnetwork.com`);
      expect((record.paymentSettings as { enabledGateways: string[] }).enabledGateways).toEqual(['pay-later']);
    }
  });

  it('refuses to apply a new site until it has its approved logo, dark logo and favicon', () => {
    expect(logoProblems(B15C, null)).toEqual(['No --logos=<path> given.']);
    const good = (slug: string) => ({
      logo: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/logo.png`,
      logoDark: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/logo-dark.png`,
      favicon: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/favicon.png`,
    });
    const complete = Object.fromEntries(SITES.map((site) => [site.slug, good(site.slug)]));
    expect(logoProblems(B15C, complete)).toEqual([]);
    // The owner's own uploads for this group, which `--apply` is given: every site has all three.
    expect(Object.keys(LOGO_BOOK).sort()).toEqual(SITES.map((site) => site.slug).sort());
    expect(logoProblems(B15C, LOGO_BOOK)).toEqual([]);
    expect(Object.keys(complete)).toHaveLength(B15C_SITES);
    for (const site of SITES) {
      const { [site.slug]: _dropped, ...withoutOne } = complete;
      expect(logoProblems(B15C, withoutOne)).toEqual([`${site.slug}: no logo entry.`]);
    }
    expect(logoProblems(B15C, { ...complete, 'zabargad-island': { ...good('zabargad-island'), favicon: '' } }))
      .toEqual(['zabargad-island: favicon is missing.']);
    expect(logoProblems(B15C, { ...complete, 'daedalus-reef': { ...good('daedalus-reef'), logoDark: 'https://example.com/logo.png' } }))
      .toEqual(["daedalus-reef: logoDark must already be on the network's Cloudinary: https://example.com/logo.png"]);
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
    // No two sites anywhere on the network carry the same trip title.
    const titles = SITES.flatMap((site) => site.trips.map((trip) => trip.title));
    expect(titles).toHaveLength(B15C_SITES);
    expect(new Set(titles).size).toBe(titles.length);
    const taken = new Set([...LIVE.titles, ...EARLIER.flatMap((site) => site.trips.map((trip) => trip.title))]
      .map((title) => title.trim().toLowerCase()));
    expect(titles.filter((title) => taken.has(title.trim().toLowerCase()))).toEqual([]);
    // The dated scan is the live network, so this cannot pass by comparing against nothing.
    expect(LIVE.readAt).toBe('2026-10-31T06:56:04Z');
    expect(LIVE.titles.length).toBeGreaterThan(600);
    expect(LIVE.tenants).toHaveLength(121);
    expect(CORPUS.length).toBeGreaterThan(3000);
    expect(mine.length).toBeGreaterThan(35);
  });

  it('counts the trips its copy names', () => {
    for (const site of SITES) {
      const copy = [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription, ...site.seo.keywords].join('\n');
      for (const count of statedTripCounts(copy)) expect(count).toBe(site.trips.length);
      // Every site sells one day and says so out loud, so the count is held to that site's own catalogue.
      expect(statedTripCounts(site.description)).toEqual([1]);
    }
  });
});
