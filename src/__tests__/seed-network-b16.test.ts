import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import {
  copiedFactProblems, eeoSourceProgramme, logoProblems, statedTripCounts, tenantRecord, tripDocument,
  validateBatch, type NetworkSite, type NetworkTrip, type TripSiteFacts,
} from '../scripts/seed-network-sites';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';
import { B02, PROGRAMMES as B02P } from '../scripts/network-sites/b02';
import { B03A } from '../scripts/network-sites/b03';
import { B03B, B03C, B03D, PROGRAMMES as B03RP } from '../scripts/network-sites/b03-rest';
import { B08A, B08B, B08C, B08D } from '../scripts/network-sites/b08';
import { B09A, B09B, B09C, PROGRAMMES_A as B09AP, PROGRAMMES_B as B09BP } from '../scripts/network-sites/b09';
import { B10A, B10B, B10C, B10D, NEW_PROGRAMMES as B10P } from '../scripts/network-sites/b10';
import { B11A, B11B } from '../scripts/network-sites/b11';
import { B12A, B12B } from '../scripts/network-sites/b12';
import { B13A, B13B } from '../scripts/network-sites/b13';
import { B14A, B14B } from '../scripts/network-sites/b14';
import { B15A, B15B } from '../scripts/network-sites/b15';
import { B15C } from '../scripts/network-sites/b15c';
import { B16 } from '../scripts/network-sites/b16';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';
import { isTenantBookingCreationClosed } from '../services/tenantBookingPolicy.service';

const EARLIER = [B01_SAFARI, B02, B03A, B03B, B03C, B03D, B08A, B08B, B08C, B08D, B09A, B09B, B09C,
  B10A, B10B, B10C, B10D, B11A, B11B, B12A, B12B, B13A, B13B, B14A, B14B, B15A, B15B, B15C]
  .flatMap((batch) => batch.sites);
const SITES = B16.sites;
const siteOf = (slug: string) => SITES.find((site) => site.slug === slug)!;

/**
 * Batch B16 is the last of Fouad's domain list: the six places batch B15 held back in its group C, and two
 * businesses from the client's own list. The selection named ten; the coordinator dropped two of them on
 * 3 November because their domains are already held, `hurghadaspeedboat.com` by batch B11's live
 * `hurghada-speedboat` and `makadibaysafari.com` by the inactive `makadi-bay-safari`, and neither of those
 * tenants is touched. Three of the six places have no published position at all, and the tests below hold
 * every one of the eight to saying what its day actually names, to saying how far its place is or that the
 * distance cannot be given, and — for the two businesses — to claiming nothing about the business that the
 * business does not publish itself.
 */
const B16_SITES = 8;
/** The two the selection named and the coordinator dropped, with the site that already holds each domain. */
const DROPPED: Record<string, string> = {
  'hurghadaspeedboat.com': 'hurghada-speedboat',
  'makadibaysafari.com': 'makadi-bay-safari',
};

/** Each new site's storefront design, from the group concepts; the storefront picks it by slug. */
const DESIGNS: Record<string, string> = {
  'blue-lagoon-dahab': 'bluelagoon',
  'ein-kid': 'einkid',
  'seven-pools': 'sevenpools',
  'wadi-zaghara': 'zaghara',
  'gebel-el-rosas-bay': 'rosasbay',
  'marsa-abu-galawa': 'galawa',
  'skar-transport-cairo': 'skarcairo',
  'future-travel-egypt': 'futuretravel',
};

/** Every new site's domain, as Fouad's list gives it. */
const DOMAINS: Record<string, string> = {
  'blue-lagoon-dahab': 'dahabbluelagoon.com',
  'ein-kid': 'einkiddahab.com',
  'seven-pools': 'sevenpoolscoralreef.com',
  'wadi-zaghara': 'wadizagharadahab.com',
  'gebel-el-rosas-bay': 'gebelelrosasbay.com',
  'marsa-abu-galawa': 'marsaabugalawahurghada.com',
  'skar-transport-cairo': 'skartransportcairo.com',
  'future-travel-egypt': 'futuretravelegypt.com',
};

/** The admin palette each site is created with, from the group concepts (primary / secondary / accent). */
const THEMES: Record<string, [string, string, string]> = {
  'blue-lagoon-dahab': ['#15282B', '#F1F4F3', '#0E5A63'],
  'ein-kid': ['#241F18', '#F6F3EC', '#6B4A14'],
  'seven-pools': ['#17262B', '#EFF5F6', '#15565C'],
  'wadi-zaghara': ['#2A2017', '#F7F2EC', '#7A3A1C'],
  'gebel-el-rosas-bay': ['#1E2328', '#F2F3F4', '#3B4A77'],
  'marsa-abu-galawa': ['#17251C', '#F0F4F1', '#17584A'],
  'skar-transport-cairo': ['#23211C', '#F4F3F0', '#8A2F4C'],
  'future-travel-egypt': ['#1F1E2A', '#F3F2F6', '#3C3A8A'],
};

/**
 * What each site shows, held here as literals so the batch is checked against the addresses the network
 * already publishes rather than against itself. No picture was made for this batch: every one of these is a
 * photograph the client already publishes, chosen in the selection, and not one of them is a photograph of the
 * place or the business its site is named for.
 */
const SITE_PICTURES: Record<string, string[]> = {
  'blue-lagoon-dahab': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1787782233/tours/wirlheh3pj6ibboavetn.jpg',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1788796522/tours/jxzuelgfb5r9vdl36xoa.jpg',
  ],
  'ein-kid': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936173/attractions-network/network-b03/sharm-tour-guide/xvskdnp6simwnlxvry6x.jpg',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936195/attractions-network/network-b03/safari-sharm-el-sheikh/qqo25k0p0m1qtvfzz3hd.jpg',
  ],
  'seven-pools': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936158/attractions-network/network-b03/sharm-tour-guide/mn1pbadyiqwld8zrsne6.jpg',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936160/attractions-network/network-b03/sharm-tour-guide/jarhqtfzkmkjlqh8mdiz.jpg',
  ],
  'wadi-zaghara': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793085619/attractions-network/network-b08/coral-reefs-dahab/lfsrxdbnyahmgcgfn9zl.jpg',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936174/attractions-network/network-b03/sharm-tour-guide/wpygg5o9iwxlr8lxp9q4.jpg',
  ],
  'gebel-el-rosas-bay': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1788794476/tours/smf4lqwlugbxjepjbagn.jpg',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1788528182/tours/xpacckqybvfyq4vbnas1.jpg',
  ],
  'marsa-abu-galawa': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1788212485/tours/c3syeyx758xwhljxpfqk.jpg',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1788292140/tours/od1x6rhlyxx6fz6atv12.jpg',
  ],
  'skar-transport-cairo': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1787780674/tours/cyqhwwakyack600gfghk.jpg',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1788795937/tours/wmork7lo2zbrpokbb4sn.jpg',
  ],
  'future-travel-egypt': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1788796912/tours/mhbnyzl0vhwyxopd4hzk.jpg',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1787781847/tours/ira2tyqp7tp0acwe6ztd.jpg',
  ],
};

/** The day the selection gives each site. */
const DAYS: Record<string, string[]> = {
  'blue-lagoon-dahab': ['sharm-el-sheikh-colored-canyon-blue-hole-dahab-jeep-adventure'],
  'ein-kid': ['sharm-el-sheikh-quad-bike-camel-ride-bedouin-dinner-stargazing'],
  'seven-pools': ['sharm-el-sheikh-white-island-ras-mohammed-small-group-cruise'],
  'wadi-zaghara': ['from-sharm-el-sheikh-dahab-canyon-snorkeling-camel-jeep-safari'],
  'gebel-el-rosas-bay': ['shaab-samadai-dolphin-sanctuary-snorkel-cruise-from-marsa-alam'],
  'marsa-abu-galawa': ['el-gouna-2-tank-guided-boat-dives-for-certified-divers'],
  'skar-transport-cairo': ['secrets-of-cairo-2-day-private-sightseeing-tour'],
  'future-travel-egypt': ['giza-pyramids-sphinx-custom-cairo-sightseeing-tour'],
};

/**
 * How far each site's own place is from the point its day's programme names, as the selection measures it. A
 * null is a place with no published position, for which no distance from anywhere exists; the four business
 * sites sell a day in their own town or bay and carry no distance block at all.
 */
const DISTANCE_KM: Record<string, number | null> = {
  'blue-lagoon-dahab': 8.43,
  'ein-kid': null,
  'seven-pools': null,
  'wadi-zaghara': 12.38,
  'gebel-el-rosas-bay': 30.63,
  'marsa-abu-galawa': null,
  'skar-transport-cairo': null,
  'future-travel-egypt': null,
};

/** The six places, and what each is called, so no page can be read as selling a stop there. */
const PLACE: Record<string, RegExp> = {
  'blue-lagoon-dahab': /Blue Lagoon|Al Qurdud|El Gardud/i,
  'ein-kid': /Ein Kid|Ein Kidd/i,
  'seven-pools': /Seven Pools/i,
  'wadi-zaghara': /Wadi Zagh/i,
  'gebel-el-rosas-bay': /Gebel El Rosas|Gabal Elrosas|Jabal ar Rasas/i,
  'marsa-abu-galawa': /Marsa Abu Galawa/i,
};

/** The one clause in which a site's trip copy may name its own place: to say it is not a stop. */
const NOT_A_STOP: Record<string, string> = {
  'blue-lagoon-dahab': ', not the Blue Lagoon, the shallow lagoon about eight kilometres further north up the coast beyond Ras Abu Galum; nothing on this day goes past the Blue Hole.',
  'ein-kid': ', not Ein Kid, the inland oasis where the two halves of the Sinai Trail meet; and because no position for that oasis is published, how far this camp lies from it cannot be said.',
  'seven-pools': ', not Seven Pools, the shallow coral stop the snorkelling trade names inside the same park; no position for that stop is published, so how far the boat passes from it cannot be said.',
  'wadi-zaghara': ', not Wadi Zaghara, the sand valley inland of the coast road whose mouth lies about ten kilometres from that town; no part of this day turns inland to it.',
  'gebel-el-rosas-bay': ', not Gebel El Rosas, the bay lying about thirty kilometres north-west of it on the coast above the town; the boat spends the day at the reef and nowhere else.',
  'marsa-abu-galawa': ' it does not name Marsa Abu Galawa, the sheltered inlet in the Abu Galawa reefs; only one map record publishes a position for that reef, so how far the boat passes from it cannot be said, and no page here promises a dive at any named site.',
};

/**
 * The "nearest days" sentence every site's description carries, word for word from the facts file's own
 * `nearest` field.
 */
const NEAREST: Record<string, string> = {
  'blue-lagoon-dahab': 'This jeep day stops at the Colored Canyon, in Dahab and at the Blue Hole; its programme does not name the Blue Lagoon, the shallow lagoon about eight kilometres further north up the coast, beyond Ras Abu Galum.',
  'ein-kid': 'This day goes inland into the Sinai desert behind Sharm El Sheikh for a quad ride, a camel ride and a Bedouin dinner; its programme does not name Ein Kid, and because no position for the oasis has ever been published, how far that desert camp lies from it cannot be said.',
  'seven-pools': 'This small-group cruise snorkels inside Ras Mohammed National Park and calls at White Island; its programme does not name Seven Pools, and because no position for that stop is published, how far the boat passes from it cannot be said.',
  'wadi-zaghara': 'This day drives up to Dahab for a camel ride and snorkelling and takes a jeep out to the Colored Canyon; its programme does not name Wadi Zaghara, the sand-floored valley inland of the coast road whose mouth lies about ten kilometres from the town.',
  'gebel-el-rosas-bay': 'This cruise snorkels at Shaab Samadai, the dolphin reef off Marsa Alam; its programme does not name Gebel El Rosas, the bay about thirty kilometres north-west of that reef on the coast above the town.',
  'marsa-abu-galawa': 'This is a two-dive boat day out of El Gouna; its programme names neither of the sites it dives and does not name Marsa Abu Galawa, and because only one map record publishes a position for that reef, how far the boat passes from it cannot be said.',
  'skar-transport-cairo': 'The day sold here is a two-day private sightseeing tour of Cairo and Giza by car, which can be collected from and returned to Cairo International Airport; it is not an airport transfer, and no page on this site sells one.',
  'future-travel-egypt': 'The day sold here is a Cairo sightseeing day built to order around the Giza pyramids and the Sphinx; the multi-day packages the business advertises elsewhere are not sold on this site.',
};

/** The two sites that stand for a business the client's list carries, rather than for a place. */
const BUSINESS_SITES = ['skar-transport-cairo', 'future-travel-egypt'];
/** The three places with no published position: no coordinate, no map, no pin, no bearing and no distance. */
const NO_POSITION = ['ein-kid', 'seven-pools', 'marsa-abu-galawa'];

/** Verbs that would turn a mention of the site's own place into a stop the record does not publish. */
const VISIT = 'visits?|visiting|visited|enter(?:s|ing|ed)?|inside|into|explore[sd]?|exploring|tour of|'
  + 'see(?:s|ing)?|walk(?:s|ing)? (?:through|into|round|around|down)|step(?:s|ping)? (?:into|inside)|'
  + 'stop(?:s|ping)? (?:at|in)|descend(?:s|ing)? (?:into|to)|down into|take[sn]? you (?:to|into|inside)|'
  + 'anchors? (?:at|off)|moors? (?:at|off)|snorkell?(?:s|ing)? (?:at|on)|dives? (?:at|on)|passe?s';

/** A line that holds only for an option the trip does not sell, or for an extra it cannot offer. */
const CONDITIONAL = /\(if |if selected|if add-on|if (?:the )?option|add on selection|5h Tour:|8h Tour:|depending on the option/i;

/** A published coordinate, a bearing or a map: nothing any of the three unpositioned sites may show. */
const A_POSITION = /\d{1,3}\.\d+\s*[NSEW]\b|\d{1,3}\s*°|coordinates of|its latitude|its longitude/i;
/** A telephone number in any of the shapes the four live business sites publish one in. */
const A_PHONE = /(?:\+|00)\d[\d\s()-]{7,}|\b\d{3,4}[\s-]\d{3,4}[\s-]\d{3,4}\b/;
/** What a business site may never say about the business: how well it is thought of, or how long it has traded. */
const A_STANDING = /\b\d(?:\.\d)?\s*(?:stars?|out of (?:five|ten))|\brated\b|\b\d+(?:,\d{3})*\+?\s+(?:guests|customers|travellers|bookings)\b|licen[cs]e (?:number|no\.?)\s*[:#]?\s*\w|registration number[:#]|\b\d+\s+years\b|established in \d{4}|\bfleet of \d+/i;

/**
 * No two sites may read alike. Every words field of a B16 trip — title, short, description, each highlight and
 * its SEO pair — shares no run of eight words with any OTHER site's copy of the SAME record, and no field
 * equals another site's field outright; a B16 site's own tagline, description and SEO share no such run with
 * any other site's tenant copy either. The closing line every network site ends on is stripped before
 * comparing.
 *
 * The corpus is every earlier batch file — B15 and B15C among them, so their sites are compared from their own
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
/**
 * A site's tenant description, with the two runs every network site is required to carry taken out before any
 * comparison: the closing line batches B11 onward all end on, and the site's own "nearest days" sentence, which
 * the facts file fixes word for word and which three of these sites therefore share runs of with each other and
 * with batch B15C. What is left is the site's own writing, and none of that may repeat another site's. The
 * remaining segments are compared separately, so no run is formed across a seam where a sentence was removed.
 */
const ownDescriptionOf = (site: NetworkSite): string[] => site.description
  .split(CLOSING_LINE).join('\n')
  .split(NEAREST[site.slug] ?? CLOSING_LINE).join('\n')
  .split('\n')
  .map((part) => part.trim())
  .filter(Boolean);
const copyOfSite = (site: NetworkSite): Copy[] => [
  { site: site.slug, record: null, where: 'tagline', text: site.tagline },
  ...(NEAREST[site.slug]
    ? ownDescriptionOf(site).map((text, index) => ({ site: site.slug, record: null, where: `description ${index + 1}`, text }))
    : [{ site: site.slug, record: null, where: 'description', text: site.description.split(CLOSING_LINE).join(' ') }]),
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

const RECORDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'network-b16-record-names.json'), 'utf8')) as Record<string, Record<string, unknown>>;

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

/** Every word a site publishes of its own: the tenant copy and its trips' own words. */
const wordsOf = (slug: string): string => {
  const site = siteOf(slug);
  return [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription, ...site.seo.keywords,
    site.photoShortfall || '', ...site.trips.map(ownCopyOf), ...site.trips.flatMap((trip) => trip.imageAlts)].join('\n');
};

/** Every rule a B16 trip keeps. */
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

describe('batch B16: the last ten sites, six places and four of the client’s businesses', () => {
  it('is one group of ten sites, none of them built before', () => {
    expect(B16.id).toBe('b16');
    expect(SITES.map((site) => site.slug)).toEqual(Object.keys(DESIGNS));
    expect(SITES.map((site) => site.name)).toEqual(['Blue Lagoon Dahab', 'Ein Kid', 'Seven Pools', 'Wadi Zaghara',
      'Gebel El Rosas Bay', 'Marsa Abu Galawa', 'SKAR Transport Cairo', 'Future Travel Egypt']);
    expect(SITES).toHaveLength(B16_SITES);
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
    // No slug and no trip-slug prefix is one an earlier batch already holds.
    const slugsBefore = new Set(EARLIER.map((site) => site.slug));
    const prefixesBefore = new Set(EARLIER.map((site) => site.slugPrefix));
    for (const site of SITES) {
      expect(slugsBefore.has(site.slug) || prefixesBefore.has(site.slugPrefix)).toBe(false);
    }
    // No domain of the batch is one an earlier batch already papered. The two the selection named that are
    // already held were dropped on 3 November, and one of their holders is a site of batch B11, so this also
    // proves that neither is back in the batch by another name.
    const domainsBefore = new Map(EARLIER.map((site) => [site.domain, site.slug]));
    expect(SITES.filter((site) => domainsBefore.has(site.domain))).toEqual([]);
    for (const [domain, holder] of Object.entries(DROPPED)) {
      expect(SITES.map((site) => site.domain)).not.toContain(domain);
      expect(isTenantBookingCreationClosed({ slug: holder })).toBe(true);
    }
    expect(domainsBefore.get('hurghadaspeedboat.com')).toBe('hurghada-speedboat');
    expect(SITES.map((site) => site.slugPrefix)).toEqual(['bld-', 'ekd-', 'svp-', 'wzg-', 'grb-', 'mag-', 'skr-', 'fte-']);
    // No site across every batch shares a title or a trip slug.
    const every = [...EARLIER, ...SITES];
    const titles = every.map((site) => site.seo.metaTitle.trim().toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    const slugs = every.flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('shows only photographs the network already publishes, and says it has none of its own subject', () => {
    const earlier = new Set(EARLIER.flatMap((other) => [...other.heroImages, ...other.trips.flatMap((trip) => trip.images)]));
    for (const site of SITES) {
      expect(site.heroImages).toEqual(SITE_PICTURES[site.slug]);
      expect(site.heroImages).toHaveLength(2);
      expect(new Set(site.heroImages).size).toBe(site.heroImages.length);
      // Every address, on the home page and on the trip page alike, is one an earlier batch already publishes:
      // nothing in this batch is a new upload.
      for (const url of [...site.heroImages, ...site.trips.flatMap((trip) => trip.images)]) {
        expect(earlier.has(url)).toBe(true);
      }
      // Fewer than three, so each site carries its note, and the note never calls a photograph its subject.
      expect(site.heroImages.length).toBeLessThan(3);
      expect(site.photoShortfall).toMatch(/^No photograph of th/);
      expect(site.photoShortfall).toMatch(/could be made/);
      expect(site.photoShortfall).toMatch(/neither (?:of them )?is a photograph of|[Nn]either is a photograph of|none of its own is reused/);
    }
    // The two desert-vehicle photographs the selection chose belonged to the site that was dropped, so neither
    // appears anywhere in the batch.
    for (const url of [
      'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936182/attractions-network/network-b03/quad-safari-hurghada/p3ozvi49kz39eaxrkudb.jpg',
      'https://res.cloudinary.com/dm3sxllch/image/upload/v1792936184/attractions-network/network-b03/quad-safari-hurghada/unpa2hggou46q91yae5q.jpg',
    ]) {
      expect(SITES.flatMap((site) => [...site.heroImages, ...site.trips.flatMap((trip) => trip.images)])).not.toContain(url);
    }
    // Nothing is waiting to be filled in: the group is valid as it stands.
    expect(validateBatch(B16)).toEqual([]);
  });

  it('describes every photograph in the words the network already carries for it', () => {
    // Each picture this batch reuses is described exactly as the batch that first published it describes it, so
    // the network never describes one photograph two ways.
    const earlierAlts = new Map<string, string>();
    for (const site of EARLIER) for (const trip of site.trips) {
      trip.images.forEach((url, index) => earlierAlts.set(url, trip.imageAlts[index]));
    }
    for (const site of SITES) for (const trip of site.trips) {
      expect(trip.images).toHaveLength(1);
      expect(trip.imageAlts).toHaveLength(1);
      expect(earlierAlts.get(trip.images[0])).toBe(trip.imageAlts[0]);
    }
    // Every trip carries the photograph the client publishes on the record it sells, as the batch that first
    // sold that record carries it.
    const ownRecordPhoto = SITES.filter((site) => {
      const sellers = EARLIER.filter((other) => other.trips.some((trip) => trip.price.source === site.trips[0].price.source));
      return sellers.some((other) => other.trips.some((trip) => trip.images.includes(site.trips[0].images[0])));
    });
    expect(ownRecordPhoto.map((site) => site.slug)).toEqual(SITES.map((site) => site.slug));
  });

  it('sells each site exactly the day the selection gives it', () => {
    expect(Object.fromEntries(SITES.map((site) => [site.slug, site.trips.map((trip) => trip.price.source)]))).toEqual(DAYS);
    expect(SITES.reduce((total, site) => total + site.trips.length, 0)).toBe(B16_SITES);
    // Each of the ten sells a different day: inside this batch no record is shared.
    const days = SITES.flatMap((site) => site.trips.map((trip) => trip.price.source));
    expect(new Set(days).size).toBe(B16_SITES);
    // What each record the batch sells says about itself, kept beside this test: its published title, its
    // booking options and its schedule, from the dated snapshot.
    for (const [slug, record] of Object.entries(RECORDS)) {
      const found = tour(slug)!;
      expect(found.detail.title).toBe(record.title);
      expect((found.options as Array<{ title: string }>).map((option) => option.title)).toEqual(record.options);
      expect((found.options as Array<{ pricingKey: string }>).map((option) => option.pricingKey)).toEqual(record.optionKeys);
      expect((found.detail.itinerary as Array<{ title: string }> | null || []).map((step) => step.title)).toEqual(record.itinerary);
    }
    // Every record the batch sells is published per guest, which is what the source reader will sell: the one
    // record of the selection's that is not, the Makadi Bay sunrise buggy day, left the batch with its site.
    for (const slug of Object.keys(RECORDS)) {
      expect(RECORDS[slug].optionTypes).toEqual(['Per Person']);
    }
    // Gebel El Rosas shares the Shaab Samadai record with three sites built before it, which is allowed across
    // batches, and this site is much the nearer of the sellers that have a place of their own to disclaim.
    const alsoSellSamadai = EARLIER.filter((site) => site.trips.some((trip) => trip.price.source === DAYS['gebel-el-rosas-bay'][0]));
    expect(alsoSellSamadai.map((site) => site.slug)).toEqual(['marsa-alam-red-sea-egypt', 'shaab-samadai', 'samadai-beach', 'daedalus-reef']);
    expect(DISTANCE_KM['gebel-el-rosas-bay']!).toBeLessThan(88.95);
  });

  it('says on every page what its day names, and never that its own place is a stop', () => {
    for (const slug of Object.keys(PLACE)) {
      const site = siteOf(slug);
      const place = PLACE[slug];
      const clause = NOT_A_STOP[slug];
      for (const trip of site.trips) {
        // Each trip says once, plainly, what its programme names and that the site's place is not among it.
        expect(trip.description).toMatch(/programme/);
        expect(trip.description.split(clause)).toHaveLength(2);
        // Outside that one clause, the trip's own words never mention the place at all.
        expect(ownCopyOf(trip).split(clause).join(' ')).not.toMatch(place);
      }
      // And nowhere on the site does a visiting word stand in front of the place's name: not a stop, not a
      // mooring, not a dive, and not a boat passing it either.
      expect(wordsOf(slug)).not.toMatch(new RegExp(`(?:${VISIT})\\s+(?:the\\s+)?(?:${place.source})`, 'i'));
    }
    for (const site of SITES) {
      // Every site's description carries its own "nearest days" sentence, word for word.
      expect(site.description.split(NEAREST[site.slug])).toHaveLength(2);
      // Two paragraphs, and the closing line batches B11 to B15C end on.
      expect(site.description.split('\n\n')).toHaveLength(2);
      expect(site.description).toContain('Every trip collects you from your hotel and brings you back');
      expect(site.description).toContain('Hold a place online and pay later');
      // Not one of the ten sentences is a run another site already publishes about the same day.
      expect(EARLIER.filter((other) => other.description.includes(NEAREST[site.slug]))).toEqual([]);
    }
    // The three distances the batch can give are said in words, each on its own site.
    expect(siteOf('blue-lagoon-dahab').description).toContain('about eight kilometres further north up the coast');
    expect(siteOf('wadi-zaghara').description).toContain('about ten kilometres from the town');
    expect(siteOf('gebel-el-rosas-bay').description).toContain('about thirty kilometres north-west of that reef');
    expect([DISTANCE_KM['blue-lagoon-dahab'], DISTANCE_KM['wadi-zaghara'], DISTANCE_KM['gebel-el-rosas-bay']])
      .toEqual([8.43, 12.38, 30.63]);
  });

  it('shows no position at all for the three places that have none published', () => {
    for (const slug of NO_POSITION) {
      expect(DISTANCE_KM[slug]).toBeNull();
      const words = wordsOf(slug);
      // No coordinate, no degrees, no bearing anywhere on the site.
      expect(words).not.toMatch(A_POSITION);
      // And each says in plain words that the position is not published, rather than leaving the reader to guess.
      expect(words).toMatch(/no position|publishes a position for it|position for that (?:stop|reef)/i);
      expect(words).toMatch(/cannot be said|no distance from anywhere/i);
    }
    // Ein Kid and Seven Pools give no distance from anywhere at all.
    for (const slug of ['ein-kid', 'seven-pools']) {
      expect(wordsOf(slug)).not.toMatch(/kilometres?\s+(?:from|off|north|south|east|west)/i);
    }
    // Marsa Abu Galawa gives exactly two distances, and both are what two independent sources agree on: the
    // separation from Careless Reef, and how far the unrelated southern group of the same name lies.
    const galawa = wordsOf('marsa-abu-galawa');
    expect(galawa).toContain('roughly fourteen kilometres apart');
    expect(galawa).toContain('about three hundred and eighty kilometres from Hurghada');
    expect([...galawa.matchAll(/kilometres/gi)]).toHaveLength(2);
    // It corrects the claim its domain arrived with rather than repeating it, and names the southern group once
    // only to set it aside.
    expect(galawa).toMatch(/It is not Careless Reef/);
    expect(galawa).toMatch(/no source treats the two names as one place/);
    expect(galawa).toMatch(/nothing of it is described/);
    // Seven Pools never carries the name of the pools the client sells in another Sinai town, in any case or
    // spelling: the one place the two are told apart carries no name at all.
    const sevenPools = siteOf('seven-pools');
    expect(wordsOf('seven-pools')).not.toMatch(/three pools|3 pools/i);
    expect(sevenPools.foreignPlaces.test('Three Pools')).toBe(true);
    expect(sevenPools.foreignPlaces.test('Dahab')).toBe(true);
  });

  it('claims nothing about the four businesses that the business does not publish itself', () => {
    for (const slug of BUSINESS_SITES) {
      const words = wordsOf(slug);
      // No price, no telephone number, no standing and no licence or address of the business.
      expect(words).not.toMatch(/[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/);
      expect(words).not.toMatch(A_PHONE);
      expect(words).not.toMatch(A_STANDING);
      // Each says in one plain sentence what it does sell and what it does not, and labels its facts as the
      // business's own statements rather than as corroborated ones.
      expect(words).toContain(NEAREST[slug]);
      expect(words).toMatch(/its own site/i);
      expect(siteOf(slug).description).toMatch(/no independent listing|separate listing|uncorroborated/i);
      // Nothing in the site's own words is a process note about how it was built.
      expect(words).not.toMatch(/\bpreview\b|\bplaceholder\b|\bstaging\b/i);
    }
    // The agency's other trading name and its own prices are nowhere on its site.
    const future = wordsOf('future-travel-egypt');
    expect(future).toMatch(/trades under a different name from this domain/);
    expect(future).toMatch(/one identical price on four different packages/);
    // And the transport site claims none of the things its own site does not publish.
    expect(siteOf('skar-transport-cairo').description).toMatch(/are claimed nowhere on these pages/);
  });

  it('writes none of the facts the sources contradict each other on', () => {
    // Blue Lagoon: three incompatible distances from the town are published, so none is given; no fee, no
    // depth, no species, no dive framing, and no size for the protected area.
    const lagoon = wordsOf('blue-lagoon-dahab');
    expect(lagoon).toContain('a hundred and seventeen metres apart');
    expect(lagoon).not.toMatch(/square kilometres|\b(?:400|500)\b|entrance fee|\bmetres deep\b|dive site in|dugong/i);
    expect(lagoon).toContain('no dive register for the town lists it');
    // Ein Kid: no route length, no total for the trail, nothing about whose land it is, no spring, and the one
    // source's own error placing Ras Shetan on the Gulf of Suez is not reproduced.
    const einKid = wordsOf('ein-kid');
    expect(einKid).toContain('Gulf of Aqaba');
    expect(einKid).not.toMatch(/Gulf of Suez|Kid.s Oasis|\bspring\b|tribe|\bBedouin land\b|\d+\s*km\b/i);
    // Seven Pools: no depth, no species, no park fee, no count behind the name, and no Arabic name coined.
    const sevenPools = wordsOf('seven-pools');
    expect(sevenPools).toContain('Four statements about it are carried by two independent sources');
    expect(sevenPools).not.toMatch(/seven pools of|\bseven basins\b|metres deep|entrance fee of|beginner-friendly|\bcurrents\b/i);
    // Wadi Zaghara: one corridor with four names and never two different wadis; no single elevation figure, no
    // trail distance, difficulty or duration, and no claim about pools or camping.
    const zaghara = wordsOf('wadi-zaghara');
    expect(zaghara).toContain('all four belong to one corridor');
    expect(zaghara).not.toMatch(/two (?:different )?wadis|\b\d+\s*(?:m|metres) above|natural pools|popular camping|moderate difficulty|Ain Khudra/i);
    // Gebel El Rosas: the distance from the town as the published range, never one exact figure; no distance at
    // all to the inland mine, and no reading of the name as roses or pink.
    const rosas = wordsOf('gebel-el-rosas-bay');
    expect(rosas).toContain('roughly fifteen to seventeen kilometres north of the town');
    expect(rosas).toContain('no distance to it is given anywhere on this site');
    expect(rosas).not.toMatch(/Mountain of Roses|Pink Mountain|drive time|lifeguard|\bparking\b|metres deep/i);
    // Marsa Abu Galawa: nothing of the southern wreck, no "Saghir", and no depth, current or boat time.
    expect(wordsOf('marsa-abu-galawa')).not.toMatch(/Saghir|\bwreck\b|metres deep|\bcurrent\b|minutes by boat/i);
    // And no site of the ten names a fee, an opening time or a superlative beyond its facts.
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
    const whole = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'network-sites', 'b16.ts'), 'utf8');
    const source = whole.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/\bprice:\s*[\d.]/);
    expect(source).not.toMatch(/\bchildPrice\b|\bpriceFrom\b|\bcurrency:\s*'(?!USD\b)/);
    expect(source).not.toMatch(/[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/);
    // This batch sets no length of its own at all: each is the record's own.
    expect(SITES.flatMap((site) => site.trips).filter((trip) => trip.price.duration !== undefined)).toEqual([]);
    // No sentence this batch writes names a sum of money; a guest reads the structured price.
    const ownCopy = SITES.flatMap((site) => [site.tagline, site.description, ...site.trips.map(ownCopyOf)]);
    expect(ownCopy.filter((line) => /[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line))).toEqual([]);
    // The copied lines that do name a sum are the fees a guest pays on the day and should read before booking.
    // They are left exactly as the records write them, and named here so a changed record cannot add another.
    const copiedMoney = SITES.flatMap((site) => built(site, site.trips))
      .flatMap((document) => [...document.inclusions, ...document.exclusions, ...document.needToKnow, ...document.whatToBring] as string[])
      .filter((line) => /[$€£]\s?\d|\d+\s?[$€£]|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line));
    expect([...new Set(copiedMoney)].sort()).toEqual([
      'National Park / Desert Conservation Fee: US$1 per person, payable in cash on the spot in US dollars, euros, British pounds, or Egyptian pounds at the equivalent exchange rate',
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
    expect(count).toBe(B16_SITES);
  });

  it('imports every programme from the batch that first sold its record, and writes none', () => {
    const imported: Array<[string, unknown]> = [
      ['ten-hours-to-the-coloured-canyon-and-the-dahab-shore', B03RP.SSS_COLOURED_CANYON],
      ['an-evening-on-a-quad-in-the-sinai-desert', B03RP.SSS_FIVE_IN_ONE],
      ['eight-hours-inside-ras-mohammed-and-white-island', B02P.EEO_WHITE_SMALL],
      ['the-salama-canyon-and-a-day-on-the-dahab-coast', B03RP.STG_SALAMA_CANYON],
      ['seven-hours-at-the-dolphin-reef-off-the-town', B09BP.SHAAB_SAMADAI],
      ['two-guided-boat-dives-out-of-el-gouna', B09AP.D2E_GOUNA_TWO_TANK],
      ['two-private-days-in-cairo-and-giza-by-car', B10P.TWO_DAY_PRIVATE],
      ['a-cairo-day-around-the-pyramids-and-the-sphinx', B10P.CUSTOM_DAY],
    ];
    for (const [tripPath, programme] of imported) {
      const trips = SITES.flatMap((site) => site.trips).filter((trip) => trip.path === tripPath);
      expect(trips).toHaveLength(1);
      // The same object, so the network says the same thing about the same trip wherever it is sold.
      for (const item of trips) expect(item.price).toBe(programme);
    }
    expect(imported).toHaveLength(B16_SITES);
    // Every record this batch sells is one an earlier batch already sells, so the batch writes no programme of
    // its own at all. Every earlier batch is searched, so a programme written here would fail this.
    const earlier = new Set(EARLIER.flatMap((site) => site.trips.map((trip) => trip.price.source)));
    expect(SITES.flatMap((site) => site.trips).filter((trip) => !earlier.has(trip.price.source))).toEqual([]);
    expect(new Set(SITES.flatMap((site) => site.trips).map((trip) => trip.price)).size).toBe(B16_SITES);
  });

  it('starts each site where its own day starts', () => {
    const where: Record<string, [string, string, string]> = {
      'blue-lagoon-dahab': ['Sharm El Sheikh', 'sharm-el-sheikh', 'Sharm El Sheikh'],
      'ein-kid': ['Sharm El Sheikh', 'sharm-el-sheikh', 'Sharm El Sheikh'],
      'seven-pools': ['Sharm El Sheikh', 'sharm-el-sheikh', 'Sharm El Sheikh'],
      'wadi-zaghara': ['Sharm El Sheikh', 'sharm-el-sheikh', 'Sharm El Sheikh'],
      'gebel-el-rosas-bay': ['Marsa Alam', 'marsa-alam', 'Marsa Alam'],
      'marsa-abu-galawa': ['El Gouna', 'el-gouna', 'El Gouna'],
      'skar-transport-cairo': ['Cairo', 'cairo', 'Cairo or Giza'],
      'future-travel-egypt': ['Cairo', 'cairo', 'Cairo or Giza'],
    };
    for (const site of SITES) {
      expect([site.city, site.pickupDestination, site.area]).toEqual(where[site.slug]);
      for (const document of built(site, site.trips)) expect(document.meetingPoint.address).toBe(`Your hotel in ${site.area}`);
      // No trip in the batch starts anywhere but where its site does.
      for (const trip of site.trips) expect(trip.where).toBeUndefined();
    }
    // The four Sinai places take the coordinates and the pickup town every Sharm El Sheikh site on the network
    // uses, because the day each of them sells leaves from there.
    const sharm = B12B.sites.find((item) => item.slug === 'mangrove-forest-egypt')!;
    for (const slug of ['blue-lagoon-dahab', 'ein-kid', 'seven-pools', 'wadi-zaghara']) {
      expect(siteOf(slug).coordinates).toEqual(sharm.coordinates);
    }
    // Gebel El Rosas takes the Marsa Alam coast coordinates of batches B14 and B15C.
    expect(siteOf('gebel-el-rosas-bay').coordinates).toEqual(B14B.sites.find((item) => item.slug === 'abu-dabbab-beach')!.coordinates);
    // Marsa Abu Galawa collects in El Gouna, which is where its two-tank day collects, and may name the two
    // towns its own facts name and nothing else.
    const galawa = siteOf('marsa-abu-galawa');
    expect([galawa.foreignPlaces.test('El Gouna'), galawa.foreignPlaces.test('Hurghada'), galawa.foreignPlaces.test('Hamata')]).toEqual([false, false, false]);
    expect([galawa.foreignPlaces.test('Marsa Alam'), galawa.foreignPlaces.test('Sharm El Sheikh')]).toEqual([true, true]);
    // The two Cairo sites keep the fence batch B10 gave its own Giza and Cairo sites, which lets the plateau,
    // Sakkara and Memphis through; the agency's own fence lets its ten published destinations through as well.
    for (const place of ['Giza', 'Saqqara', 'Memphis']) {
      expect(siteOf('skar-transport-cairo').foreignPlaces.test(place)).toBe(false);
    }
    for (const place of ['Luxor', 'Aswan', 'Alexandria', 'Hurghada', 'Bahariya']) {
      expect(siteOf('skar-transport-cairo').foreignPlaces.test(place)).toBe(true);
      expect(siteOf('future-travel-egypt').foreignPlaces.test(place)).toBe(false);
    }
  });

  it('takes no booking on a new site until its domain is connected and the owner opens it', () => {
    for (const site of SITES) expect(isTenantBookingCreationClosed({ slug: site.slug })).toBe(true);
    // The slugs the two dropped sites would have carried are closed to nothing, because no such site exists.
    for (const slug of ['makadi-bay-safari-day', 'hurghada-speedboat-day']) {
      expect(isTenantBookingCreationClosed({ slug })).toBe(false);
      expect(SITES.map((site) => site.slug)).not.toContain(slug);
    }
    for (const site of SITES) {
      const record = tenantRecord(site);
      expect(record.customDomain).toBeUndefined();
      expect(record.domainMigrated).toBe(false);
      expect(record.domain).toBe(`${site.slug}.foxesnetwork.com`);
      expect((record.paymentSettings as { enabledGateways: string[] }).enabledGateways).toEqual(['pay-later']);
    }
  });

  it('refuses to apply a new site until it has its approved logo, dark logo and favicon', () => {
    expect(logoProblems(B16, null)).toEqual(['No --logos=<path> given.']);
    const good = (slug: string) => ({
      logo: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/logo.png`,
      logoDark: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/logo-dark.png`,
      favicon: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/favicon.png`,
    });
    const complete = Object.fromEntries(SITES.map((site) => [site.slug, good(site.slug)]));
    expect(logoProblems(B16, complete)).toEqual([]);
    expect(Object.keys(complete)).toHaveLength(B16_SITES);
    for (const site of SITES) {
      const { [site.slug]: _dropped, ...withoutOne } = complete;
      expect(logoProblems(B16, withoutOne)).toEqual([`${site.slug}: no logo entry.`]);
    }
    expect(logoProblems(B16, { ...complete, 'seven-pools': { ...good('seven-pools'), favicon: '' } }))
      .toEqual(['seven-pools: favicon is missing.']);
    expect(logoProblems(B16, { ...complete, 'ein-kid': { ...good('ein-kid'), logoDark: 'https://example.com/logo.png' } }))
      .toEqual(["ein-kid: logoDark must already be on the network's Cloudinary: https://example.com/logo.png"]);
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
    expect(titles).toHaveLength(B16_SITES);
    expect(new Set(titles).size).toBe(titles.length);
    const taken = new Set([...LIVE.titles, ...EARLIER.flatMap((site) => site.trips.map((trip) => trip.title))]
      .map((title) => title.trim().toLowerCase()));
    expect(titles.filter((title) => taken.has(title.trim().toLowerCase()))).toEqual([]);
    // The dated scan is the live network, so this cannot pass by comparing against nothing.
    expect(LIVE.readAt).toBe('2026-10-31T06:56:04Z');
    expect(LIVE.titles.length).toBeGreaterThan(600);
    expect(LIVE.tenants).toHaveLength(121);
    expect(CORPUS.length).toBeGreaterThan(3000);
    expect(mine.length).toBeGreaterThan(70);
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
