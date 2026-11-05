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
import { B03A, PROGRAMMES as B03 } from '../scripts/network-sites/b03';
import { B03B, B03C, B03D, PROGRAMMES as B03R } from '../scripts/network-sites/b03-rest';
import { B08A, B08B, B08C, B08D } from '../scripts/network-sites/b08';
import { B09A, B09B, B09C, PROGRAMMES_A as B09AP } from '../scripts/network-sites/b09';
import { B10A, B10B, B10C, B10D, NEW_PROGRAMMES as B10N } from '../scripts/network-sites/b10';
import { B11A, B11B } from '../scripts/network-sites/b11';
import { B12A, B12B } from '../scripts/network-sites/b12';
import { B13A, B13B } from '../scripts/network-sites/b13';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';
import { isTenantBookingCreationClosed } from '../services/tenantBookingPolicy.service';

const PACKAGE_SOURCES = new Set([
  'cairo-nile-cruise-6-day-egypt-highlights-abu-simbel-hot-air-balloon',
  'egypt-in-9-days-cairo-alexandria-nile-cruise-luxor-abu-simbel',
]);

const EARLIER = [B01_SAFARI, B02, B03A, B03B, B03C, B03D, B08A, B08B, B08C, B08D, B09A, B09B, B09C,
  B10A, B10B, B10C, B10D, B11A, B11B, B12A, B12B].flatMap((batch) => batch.sites);
const GROUPS: NetworkBatch[] = [B13A, B13B];
const B13 = GROUPS.flatMap((batch) => batch.sites);
const siteOf = (slug: string) => B13.find((site) => site.slug === slug)!;

/** Batch B13 is seven sites: four pyramids inland, three reefs on the Red Sea. `--logos` needs every one. */
const B13_SITES = 7;

/** Each new site's storefront design, from the network build queue; the storefront picks it by slug. */
const DESIGNS: Record<string, string> = {
  'pyramid-of-neferirkare': 'neferirkare',
  'pyramid-of-neferefre': 'neferefre',
  'pyramid-of-djedefre': 'djedefre',
  'meidum-pyramid': 'meidum',
  'shaab-sabina': 'shaabsabina',
  'ras-disha': 'rasdisha',
  'erg-somaya': 'ergsomaya',
};

/** Every new site's domain, as Fouad's list gives it. */
const DOMAINS: Record<string, string> = {
  'pyramid-of-neferirkare': 'pyramidofneferirkare.com',
  'pyramid-of-neferefre': 'pyramidofneferefre.com',
  'pyramid-of-djedefre': 'pyramidofdjedefre.com',
  'meidum-pyramid': 'meidumpyramid.com',
  'shaab-sabina': 'shaabsabinahurghada.com',
  'ras-disha': 'rasdishahurghada.com',
  'erg-somaya': 'ergsomayahurghada.com',
};

/** The admin palette each site is created with, from the batch concepts (primary / secondary / accent). */
const THEMES: Record<string, [string, string, string]> = {
  'pyramid-of-neferirkare': ['#3A2618', '#EADFCB', '#B4552D'],
  'pyramid-of-neferefre': ['#2A2826', '#F1EEE6', '#4A5A8C'],
  'pyramid-of-djedefre': ['#22303A', '#EEF2F4', '#D9773A'],
  'meidum-pyramid': ['#4B3F5C', '#F0E8D8', '#C9A227'],
  'shaab-sabina': ['#0E5A63', '#EEF6F4', '#D9654B'],
  'ras-disha': ['#1B3A6B', '#F2EBDD', '#E2582B'],
  'erg-somaya': ['#12343B', '#F3F1EC', '#6B3FA0'],
};

/**
 * The two pictures uploaded for each site on 31 October 2026, in the order the creation run writes them: the
 * home page's opening picture, then the inner pages' one. Held here as literals so the batch is checked against
 * the upload result rather than against itself.
 */
const SITE_PICTURES: Record<string, [string, string]> = {
  'pyramid-of-neferirkare': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793467676/attractions-network/tenant-heroes/pyramid-of-neferirkare/site-20261031-hero-223e286edbc2.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793467679/attractions-network/tenant-heroes/pyramid-of-neferirkare/site-20261031-second-2ce98452aee1.png',
  ],
  'pyramid-of-neferefre': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793467680/attractions-network/tenant-heroes/pyramid-of-neferefre/site-20261031-hero-29d33c8a0969.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793467682/attractions-network/tenant-heroes/pyramid-of-neferefre/site-20261031-second-ffb9f7e3d7ee.png',
  ],
  'pyramid-of-djedefre': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793467683/attractions-network/tenant-heroes/pyramid-of-djedefre/site-20261031-hero-9dc4cbf6cb95.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793467685/attractions-network/tenant-heroes/pyramid-of-djedefre/site-20261031-second-7daa6460cec6.png',
  ],
  'meidum-pyramid': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793467689/attractions-network/tenant-heroes/meidum-pyramid/site-20261031-hero-82eff93476a8.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793467691/attractions-network/tenant-heroes/meidum-pyramid/site-20261031-second-1bf052bd4cb4.png',
  ],
  'shaab-sabina': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793467692/attractions-network/tenant-heroes/shaab-sabina/site-20261031-hero-5aecd578356c.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793467694/attractions-network/tenant-heroes/shaab-sabina/site-20261031-second-32200c09038e.png',
  ],
  'ras-disha': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793467699/attractions-network/tenant-heroes/ras-disha/site-20261031-hero-7535f7ca2c58.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793467701/attractions-network/tenant-heroes/ras-disha/site-20261031-second-324afbe96813.png',
  ],
  'erg-somaya': [
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793467702/attractions-network/tenant-heroes/erg-somaya/site-20261031-hero-94c7d6c335db.png',
    'https://res.cloudinary.com/dm3sxllch/image/upload/v1793467704/attractions-network/tenant-heroes/erg-somaya/site-20261031-second-652d31e19274.png',
  ],
};

/** The three days that drive from the Giza plateau down to Saqqara, between which Abusir lies. */
const GIZA_ROAD = [
  'giza-pyramids-sakkara-and-memphis',
  'private-day-with-lunch-and-a-nile-sail',
  'two-private-days-in-cairo',
];
/** The five plateau days the Djedefre site sells, cheapest and most distinct first. */
const PLATEAU = [
  'pyramids-and-an-hour-on-the-nile',
  'sunrise-camel-ride-and-breakfast',
  'private-half-day-pyramids-and-sphinx',
  'pyramids-egyptian-museum-and-khan-el-khalili',
  'private-day-with-a-camel-ride-and-lunch',
];
/** The three days whose own programmes stop at Dahshur, where Sneferu built his other two great pyramids. */
const DAHSHUR = [
  'sakkara-memphis-and-dahshur-shared',
  'private-sakkara-memphis-and-dahshur',
  'private-day-with-lunch-and-a-nile-sail',
];
const ABUSIR = ['pyramid-of-neferirkare', 'pyramid-of-neferefre'];
const PYRAMID_SITES = ['pyramid-of-neferirkare', 'pyramid-of-neferefre', 'pyramid-of-djedefre', 'meidum-pyramid'];
const REEF_SITES = ['shaab-sabina', 'ras-disha', 'erg-somaya'];
/** The three days whose own records sail to Orange Bay on Big Giftun. */
const ORANGE_BAY = [
  'orange-bay-cruise-with-massage',
  'orange-bay-snorkelling-and-diving-day',
  'orange-bay-yacht-with-breakfast',
];
/** The three days whose own records name the Giftun islands. */
const GIFTUN = [
  'three-islands-by-yacht',
  'six-islands-by-speedboat',
  'yacht-day-with-an-introductory-dive',
];

/** What each site's own place is called, so no page can be read as selling a stop there. */
const PLACE: Record<string, RegExp> = {
  'pyramid-of-neferirkare': /Pyramid of Neferirkare|Abusir/i,
  'pyramid-of-neferefre': /Pyramid of Neferefre|Abusir/i,
  'pyramid-of-djedefre': /Pyramid of Djedefre|Abu Rawash/i,
  'meidum-pyramid': /Meidum/i,
  'shaab-sabina': /Shaab Sabina/i,
  'ras-disha': /Ras Disha/i,
  'erg-somaya': /Erg Somaya/i,
};

/** The one clause in which a site's trip copy may name its own place: to say it is not a stop. */
const NOT_A_STOP: Record<string, string> = {
  'pyramid-of-neferirkare': ', not Abusir or the Pyramid of Neferirkare; neither is a stop on this day.',
  'pyramid-of-neferefre': ', not Abusir or the Pyramid of Neferefre; neither is on the day it sells.',
  'pyramid-of-djedefre': ', not Abu Rawash; the pyramid on the hill is no stop on it.',
  'meidum-pyramid': ', not Meidum, and no stop on the day is made there.',
  'shaab-sabina': ', not Shaab Sabina out in the strait; no boat stops there.',
  'ras-disha': ', not Ras Disha at the bay\u2019s northern end; the boat makes no stop there.',
  'erg-somaya': ', not Erg Somaya off Small Giftun; nothing stops at the tower.',
};

/** The "nearest days" sentences every site's description carries, word for word. */
const NEAREST: Record<string, string> = {
  'pyramid-of-neferirkare': 'Each day on sale here leaves the Giza plateau and runs down to the necropolis at Saqqara. Abusir sits roughly three kilometres to the north of that necropolis, and no published programme among them names either Abusir or the Pyramid of Neferirkare: neither is entered on any of their lists of stops.',
  'pyramid-of-neferefre': 'All three days on sale here take the desert road from Giza down to the necropolis at Sakkara. Abusir stands a short way north of it, and neither Abusir nor the Pyramid of Neferefre is named by any of their published programmes, or visited by any of them.',
  'pyramid-of-djedefre': 'Every day on sale here halts on the Giza plateau, where Khufu\u2019s Great Pyramid stands. Abu Rawash is named in none of their published programmes, nor is the pyramid on its hill, and no day turns north towards it.',
  'meidum-pyramid': 'Each day on sale here halts at Dahshur, where two of the three great pyramids credited to Sneferu stand: the Bent Pyramid and the Red Pyramid. Meidum lies about forty-five kilometres further south, is named by none of their published programmes, and is reached by none of them.',
  'shaab-sabina': 'All three days sold here sail to Orange Bay on Big Giftun. None of their programmes names Shaab Sabina, the reef in the strait between the two islands and under three kilometres from the bay, and none stops there.',
  'ras-disha': 'The day sold here dives and cruises in Makadi Bay. Its programme does not name Ras Disha, the fringing reef at the bay\u2019s northern end below Sahl Hasheesh, and it makes no stop there.',
  'erg-somaya': 'All three days sold here sail to the Giftun islands. None of their programmes names Erg Somaya, the coral tower about a kilometre off the east side of Small Giftun, and none stops there.',
};

/** Verbs that would turn a mention of the site's own place into a stop the record does not publish. */
const VISIT = 'visits?|visiting|visited|enter(?:s|ing|ed)?|inside|into|explore[sd]?|exploring|tour of|'
  + 'see(?:s|ing)?|walk(?:s|ing)? (?:through|into|round|around|down)|step(?:s|ping)? (?:into|inside)|'
  + 'stop(?:s|ping)? (?:at|in)|descend(?:s|ing)? (?:into|to)|down into|take[sn]? you (?:to|into|inside)';

/**
 * Every trip title the network already publishes for the eight records this batch sells, read from the dated
 * network scan of 31 October 2026 (121 public sites, 928 trips). No B13 title may repeat one: each site needs
 * its own words for the same record, or the two split the same searches.
 */
const EXISTING_TITLES = [
  'Dahshur, Sakkara and Memphis in One Shared Day',
  'Giza Pyramids and an Hour Under Sail on the Nile',
  'Memphis, Sakkara and Dahshur in One Day',
  'Private Day at Dahshur, Sakkara and Memphis',
  'Private Day at Memphis and Saqqara with Lunch and a Nile Sail',
  'Private Day at Memphis, Saqqara and Dahshur',
  'Private Day at Sakkara, Memphis and Dahshur',
  'Private Day at Saqqara and Memphis with Lunch and a Nile Sail',
  'Private Day at Saqqara, Memphis and Dahshur',
  'Private Day at the Red Pyramid, Saqqara and Memphis',
  'Private Day at the Step Pyramid, Memphis and Dahshur',
  'Private Day: the Pyramids, Memphis, Sakkara and Dahshur with a Nile Sail',
  'Private Half Day at the Pyramids and the Great Sphinx',
  'Private Pyramids Day with a Camel Ride Around the Plateau and Lunch',
  'Private Pyramids Day with a Camel Ride and Lunch',
  'Sakkara, Memphis and Dahshur in a Shared Group',
  'Shared Camel Ride at the Pyramids with Breakfast',
  'Shared Day at Memphis, Saqqara and Dahshur',
  'Shared Day at the Red Pyramid, Saqqara and Memphis',
  'Shared Day at the Step Pyramid, Memphis and Dahshur',
  'Sunrise or Morning at the Pyramids with a Camel Ride and Breakfast',
  'The Giza Pyramids, Sakkara and Memphis in One Day',
  'The Giza Pyramids, Saqqara and Memphis in One Day',
  'The Pyramids, the Egyptian Museum and Khan el-Khalili',
  'Two Private Days: the Alabaster Sphinx, Memphis and the Museums',
  'Two Private Days: the Necropolis, Memphis and the Museums',
  'Two Private Days: the Plateau, Sakkara, Memphis and the Museums',
  'Two Private Days: the Step Pyramid, Memphis and the Museums',
];

/** A line that holds only for an option the trip does not sell, or for an extra it cannot offer. */
const CONDITIONAL = /\(if |if selected|if add-on|if (?:the )?option|add on selection|5h Tour:|8h Tour:|depending on the option/i;
/** The one line on the network that reads as a condition and is kept (batch B03's shopping stops). */
const SHOPPING_STOPS = 'Visits: Papyrus Gallery, Oils Factory, Bazaar, Cotton Store, Carpet School (upon request)';

/**
 * No two sites may read alike (owner, 31 October: "make sure you are not duplicating"; the same day's SEO
 * audit found five B12 sites publishing one meta description). The rule this holds: every words field of a
 * B13 trip — title, short, description, each highlight and its SEO pair — shares no run of eight words with
 * any OTHER site's copy of the SAME record, and no field equals another site's field outright; a B13 site's
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

const LIVE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'network-b13-existing-copy.json'), 'utf8')) as {
  readAt: string;
  trips: Array<{ site: string; pathSlug: string; record: string; fields: string[] }>;
  tenants: Array<{ slug: string; fields: string[] }>;
};

const CORPUS: Copy[] = [
  ...EARLIER.flatMap(copyOfSite),
  ...LIVE.trips.flatMap((trip) => trip.fields.map((text) => ({ site: trip.site, record: trip.record, where: `live ${trip.pathSlug}`, text }))),
  ...LIVE.tenants.flatMap((tenant) => tenant.fields.map((text) => ({ site: tenant.slug, record: null, where: 'live tenant', text: text.split(CLOSING_LINE).join(' ') }))),
];

const RECORDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'network-b13-record-names.json'), 'utf8')) as Record<string, Record<string, unknown>>;

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

/** The programme's own schedule, as the batch that first sold the record wrote it. */
const scheduleOf = (trip: NetworkTrip): string => (trip.price.itinerary || [])
  .flatMap((step) => [step.title, step.description]).join(' | ');

/** Every rule a B13 trip keeps. */
function expectCompleteTrip(site: Pick<NetworkSite, 'foreignPlaces'>, document: Record<string, any>): void {
  expect(copiedFactProblems(site, document)).toEqual([]);
  expect(new Attraction(document).validateSync()?.errors ?? {}).toEqual({});
  expect([document.currency, document.rating, document.reviewCount, document.instantConfirmation, document.hasHotelPickup])
    .toEqual(['USD', 0, 0, false, true]);
  expect([...document.inclusions, ...document.exclusions].filter((line: string) => CONDITIONAL.test(line))).toEqual([]);
  const optional = [...document.inclusions, ...document.exclusions, ...document.needToKnow].filter((line: string) => /upon request/i.test(line));
  expect(optional.filter((line: string) => line !== SHOPPING_STOPS)).toEqual([]);
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
  expect((document.needToKnow as string[]).join('\n')).toMatch(childPriced ? /have their own price/ : /pay the same price as adults/);
}

describe('batch B13: the seven sites that take the network to 100', () => {
  it('is two valid groups of the seven sites, none of them built before', () => {
    expect(GROUPS.map((batch) => batch.id)).toEqual(['b13a', 'b13b']);
    for (const batch of GROUPS) expect(validateBatch(batch)).toEqual([]);
    expect(B13.map((site) => site.slug)).toEqual(Object.keys(DESIGNS));
    expect(B13.map((site) => site.name)).toEqual([
      'Pyramid of Neferirkare', 'Pyramid of Neferefre', 'Pyramid of Djedefre', 'Meidum Pyramid',
      'Shaab Sabina', 'Ras Disha', 'Erg Somaya',
    ]);
    expect(B13).toHaveLength(B13_SITES);
    for (const site of B13) {
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
    for (const site of B13) {
      expect(before.has(site.slug) || before.has(site.domain) || before.has(site.slugPrefix)).toBe(false);
    }
    expect(B13.map((site) => site.slugPrefix)).toEqual(['pnk-', 'pnf-', 'djf-', 'mdp-', 'ssb-', 'rdh-', 'esy-']);
    const prefixes = B13.map((site) => site.slugPrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    // No site across every batch shares a title or a trip slug.
    const every = [...EARLIER, ...B13];
    const titles = every.map((site) => site.seo.metaTitle.trim().toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    const slugs = every.flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every site its own words for a record the network already sells', () => {
    // All four sites sell records batches B03, B10, B11 and B12 already sell, so the one thing that must not
    // be shared is the words. No two sites anywhere on the network carry the same trip title.
    const mine = B13.flatMap((site) => site.trips.map((trip) => trip.title));
    expect(mine).toHaveLength(21);
    expect(new Set(mine).size).toBe(mine.length);
    const taken = new Set([
      ...EXISTING_TITLES,
      ...EARLIER.flatMap((site) => site.trips.map((trip) => trip.title)),
    ].map((title) => title.trim().toLowerCase()));
    expect(mine.filter((title) => taken.has(title.trim().toLowerCase()))).toEqual([]);
    // The short line and the search entry are each the site's own too.
    const shorts = B13.flatMap((site) => site.trips.map((trip) => trip.short));
    expect(new Set(shorts).size).toBe(shorts.length);
    const metaTitles = B13.flatMap((site) => site.trips.map((trip) => trip.seo.metaTitle));
    expect(new Set(metaTitles).size).toBe(metaTitles.length);
  });

  it('opens every site on its own two pictures, then on its records’ photos', () => {
    // The creation run writes each site's own pair first, so no later picture write is needed and no site
    // opens on a photograph another site already opens on.
    const PICTURE = /^https:\/\/res\.cloudinary\.com\/dm3sxllch\/image\/upload\/v\d+\/attractions-network\/tenant-heroes\/([a-z0-9-]+)\/site-20261031-(hero|second)-[0-9a-f]{12}\.png$/;
    for (const site of B13) {
      const pair = site.heroImages.slice(0, 2);
      expect(pair).toEqual(SITE_PICTURES[site.slug]);
      pair.forEach((url, index) => {
        const parts = PICTURE.exec(url);
        expect(parts).not.toBeNull();
        expect(parts![1]).toBe(site.slug);
        expect(parts![2]).toBe(index === 0 ? 'hero' : 'second');
      });
    }
    // No picture is shared between two sites, and none is one an earlier batch already uses.
    const pictures = B13.flatMap((site) => site.heroImages.slice(0, 2));
    expect(pictures).toHaveLength(2 * B13_SITES);
    expect(new Set(pictures).size).toBe(pictures.length);
    const earlierImages = new Set(EARLIER.flatMap((site) => site.heroImages));
    expect(pictures.filter((url) => earlierImages.has(url))).toEqual([]);
    // Nothing opens on a photograph another site opens on any more.
    const taken = new Map<string, string>();
    for (const site of EARLIER) if (!taken.has(site.heroImages[0])) taken.set(site.heroImages[0], site.slug);
    expect(B13.filter((site) => taken.has(site.heroImages[0])).map((site) => site.slug)).toEqual([]);
    // Each site shows at least three distinct pictures now, so none needs the shortfall note; the record
    // photographs follow the site's own pair, and every one of them is a record's own.
    for (const site of B13) expect(site.photoShortfall).toBeUndefined();
    const recordPhotos = new Set(B13.flatMap((site) => site.trips.flatMap((trip) => trip.images)));
    for (const site of B13) {
      expect(site.heroImages.length).toBeGreaterThanOrEqual(3);
      expect(new Set(site.heroImages).size).toBe(site.heroImages.length);
      for (const url of site.heroImages.slice(2)) expect(recordPhotos.has(url)).toBe(true);
    }
    // Each photo is described once across the batch, so none is described two ways.
    const described = new Map<string, Set<string>>();
    for (const site of B13) for (const trip of site.trips) {
      trip.images.forEach((url, index) => {
        if (!described.has(url)) described.set(url, new Set());
        described.get(url)!.add(trip.imageAlts[index]);
      });
    }
    for (const [, alts] of described) expect(alts.size).toBe(1);
  });

  it('sells only the days the "nearest days" rule supports', () => {
    expect(B13.map((site) => [site.slug, site.trips.map((trip) => trip.path)])).toEqual([
      ['pyramid-of-neferirkare', GIZA_ROAD],
      ['pyramid-of-neferefre', GIZA_ROAD],
      ['pyramid-of-djedefre', PLATEAU],
      ['meidum-pyramid', DAHSHUR],
      ['shaab-sabina', ORANGE_BAY],
      ['ras-disha', ['makadi-bay-two-guided-dives']],
      ['erg-somaya', GIFTUN],
    ]);
    expect(B13.reduce((total, site) => total + site.trips.length, 0)).toBe(21);
    // The two Abusir pyramids stand in one place, so they sell exactly the same three days.
    expect(siteOf('pyramid-of-neferefre').trips.map((trip) => trip.price))
      .toEqual(siteOf('pyramid-of-neferirkare').trips.map((trip) => trip.price));
    // What each record the batch sells says about itself, kept beside this test: its published title, its
    // booking options, its schedule and what it includes, from the dated snapshot.
    for (const [slug, record] of Object.entries(RECORDS)) {
      const found = tour(slug)!;
      expect(found.detail.title).toBe(record.title);
      expect((found.options as Array<{ title: string }>).map((option) => option.title)).toEqual(record.options);
      expect((found.options as Array<{ pricingKey: string }>).map((option) => option.pricingKey)).toEqual(record.optionKeys);
      expect((found.detail.itinerary as Array<{ title: string }> | null || []).map((step) => step.title)).toEqual(record.itinerary);
    }
    // Every record the batch sells is one the fixture records, and every one of those is sold.
    expect([...new Set(B13.flatMap((site) => site.trips).map((trip) => trip.price.source))].sort())
      .toEqual(Object.keys(RECORDS).sort());
    // Abusir sits on the road from the Giza plateau to Saqqara, so its two sites sell only the days that
    // drive it: each schedule names the plateau and the necropolis, and the Dahshur-first days are held back.
    for (const slug of ABUSIR) {
      for (const trip of siteOf(slug).trips) {
        expect(scheduleOf(trip)).toMatch(/Giza plateau|Pyramids of Giza/);
        expect(scheduleOf(trip)).toMatch(/Sakkara|Saqqara/);
      }
    }
    const abusirPrices = new Set(siteOf('pyramid-of-neferirkare').trips.map((trip) => trip.price));
    expect(abusirPrices.has(B03.MAS_SHARED as unknown as never)).toBe(false);
    expect(abusirPrices.has(B03.MAS_PRIVATE as unknown as never)).toBe(false);
    // Abu Rawash is north-west of the plateau, so Djedefre sells only days that stop at the plateau, and not
    // one of them leaves it for the necropolis south of Giza.
    for (const trip of siteOf('pyramid-of-djedefre').trips) {
      expect(scheduleOf(trip)).toMatch(/Pyramids of Giza|Giza plateau/);
      expect(scheduleOf(trip)).not.toMatch(/Sakkara|Saqqara|Memphis|Dahshur/);
    }
    // Meidum lies south of Dahshur, so it sells only the days whose own schedule stops at Dahshur.
    for (const trip of siteOf('meidum-pyramid').trips) expect(scheduleOf(trip)).toMatch(/Dahshur/);
    // And the day that reaches Saqqara and Memphis without Dahshur is held back from it.
    const noDahshur = siteOf('pyramid-of-neferirkare').trips
      .find((trip) => trip.path === 'giza-pyramids-sakkara-and-memphis')!;
    expect(scheduleOf(noDahshur)).not.toMatch(/Dahshur/);
    expect(siteOf('meidum-pyramid').trips.map((trip) => trip.price)).not.toContain(noDahshur.price);
    // The reefs are judged on each record's own published words, kept beside this test: Shaab Sabina's days
    // name Orange Bay, Erg Somaya's name the Giftun islands, and the Makadi Bay reef's day names its bay.
    for (const trip of siteOf('shaab-sabina').trips) {
      expect(JSON.stringify(RECORDS[trip.price.source])).toMatch(/orange bay|orange island/i);
    }
    for (const trip of siteOf('erg-somaya').trips) {
      expect(JSON.stringify(RECORDS[trip.price.source])).toMatch(/giftun/i);
    }
    for (const trip of siteOf('ras-disha').trips) {
      expect(JSON.stringify(RECORDS[trip.price.source])).toMatch(/makadi bay/i);
    }
    // The two Giftun reefs share not one day: a reef sells the days its own strait or island is nearest to.
    const sabina = new Set(siteOf('shaab-sabina').trips.map((trip) => trip.price));
    expect(siteOf('erg-somaya').trips.filter((trip) => sabina.has(trip.price))).toEqual([]);
    const sabinaRecords = new Set(siteOf('shaab-sabina').trips.map((trip) => trip.price.source));
    expect(siteOf('erg-somaya').trips.filter((trip) => sabinaRecords.has(trip.price.source))).toEqual([]);
  });

  it('says on every page what the programme names, and never that the place is a stop', () => {
    for (const site of B13) {
      const place = PLACE[site.slug];
      const clause = NOT_A_STOP[site.slug];
      for (const trip of site.trips) {
        // Each trip says once, plainly, what its programme names and that the site's place is not among it.
        expect(trip.description).toContain('The programme names ');
        expect(trip.description.split(clause)).toHaveLength(2);
        // Outside that one clause, the trip's own words never mention the place at all.
        expect(ownCopyOf(trip).split(clause).join(' ')).not.toMatch(place);
      }
      // And nowhere on the site does a visiting word stand in front of the place's name.
      const everyWord = [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription,
        ...site.seo.keywords, ...site.trips.map(ownCopyOf), ...site.trips.flatMap((trip) => trip.imageAlts)].join('\n');
      expect(everyWord).not.toMatch(new RegExp(`(?:${VISIT})\\s+(?:the\\s+)?(?:${place.source})`, 'i'));
      // Every site's description carries its own "nearest days" sentences, word for word.
      expect(site.description.split(NEAREST[site.slug])).toHaveLength(2);
      // Two short paragraphs, and the closing line batches B11 and B12 end on.
      expect(site.description.split('\n\n')).toHaveLength(2);
      expect(site.description).toContain('Every trip collects you from your hotel and brings you back');
      expect(site.description).toContain('Hold a place online and pay later');
    }
  });

  it('builds every trip from the dated snapshot, never from a price typed here', () => {
    for (const site of B13) for (const trip of site.trips) {
      expect(trip.price.provider).toBe('eeo');
      expect(trip.price.tenant).toBe('egypt-excursions-online');
      expect((SNAPSHOT.tours as Array<{ slug: string }>).map((item) => item.slug)).toContain(trip.price.source);
    }
    // Nothing in the batch data is a price, a child rate, a currency, an option or a departure of its own:
    // every one of them is read from the record at build time. The header's notes describe the client's
    // published records, so the rule is about the data below them.
    const whole = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'network-sites', 'b13.ts'), 'utf8');
    const source = whole.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/\bprice:\s*[\d.]/);
    expect(source).not.toMatch(/\bchildPrice\b|\bchildNote\b|\bpriceFrom\b|\bcurrency:\s*'(?!USD\b)/);
    expect(source).not.toMatch(/\bdepartures:|\bdepartureLabels:|\boptions:|\baddons:|\bomit:|\badd:|\brename:/);
    expect(source).not.toMatch(/[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/);
    // No sentence this batch writes names a sum of money either; a guest reads the structured price.
    const ownCopy = B13.flatMap((site) => [site.tagline, site.description, ...site.trips.map(ownCopyOf)]);
    expect(ownCopy.filter((line) => /[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line))).toEqual([]);
    // Not one line any B13 trip copies from a record names a sum of money, so no page shows a figure beside
    // the structured price. Named here so a changed record cannot introduce one unnoticed.
    const copiedMoney = B13.flatMap((site) => built(site, site.trips))
      .flatMap((document) => [...document.inclusions, ...document.exclusions, ...document.needToKnow, ...document.whatToBring] as string[])
      .filter((line) => /[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line));
    // One copied line names a sum: the nature reserve fee the yacht day's own record lists as included, which
    // batch B09's Hurghada boat site already publishes word for word. Named here so a changed record cannot
    // introduce another unnoticed, and left as the record writes it rather than reworded.
    expect([...new Set(copiedMoney)].sort()).toEqual(['Nature reserve fee: $5']);
    // Every price a guest sees is the published one, copied at build time.
    for (const site of B13) for (const document of built(site, site.trips)) {
      const found = tour((site.trips.find((trip) => `${site.slugPrefix}${trip.path}` === document.slug)!).price.source)!;
      for (const option of document.pricingOptions as Array<Record<string, any>>) {
        const published = (found.options as Array<Record<string, any>>).find((item) => item.pricingKey === option.id)!;
        expect(option.price).toBe(published.guestPrices.adult);
      }
    }
  });

  it('writes every page to the same shape: two paragraphs, four highlights, a photo described', () => {
    for (const site of B13) {
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
    for (const site of B13) for (const document of built(site, site.trips)) { expectCompleteTrip(site, document); count += 1; }
    expect(count).toBe(21);
  });

  it('writes no programme of its own: every one is the batch that first sold the record', () => {
    const reused: Array<[string, unknown]> = [
      ['sakkara-memphis-and-dahshur-shared', B03.MAS_SHARED],
      ['private-sakkara-memphis-and-dahshur', B03.MAS_PRIVATE],
      ['giza-pyramids-sakkara-and-memphis', B03.MAS_WITH_GIZA],
      ['private-day-with-lunch-and-a-nile-sail', B03.MAS_NILE_SAIL],
      ['two-private-days-in-cairo', B10N.TWO_DAY_PRIVATE],
      ['pyramids-and-an-hour-on-the-nile', B03.GPP_FELUCCA],
      ['sunrise-camel-ride-and-breakfast', B03R.PCT_SHARED_SUNRISE],
      ['private-half-day-pyramids-and-sphinx', B03.GPP_HALF_DAY],
      ['pyramids-egyptian-museum-and-khan-el-khalili', B03.PGE_BAZAAR],
      ['private-day-with-a-camel-ride-and-lunch', B03R.PCT_CAMEL_LUNCH],
      ['orange-bay-cruise-with-massage', B09AP.HBT_ORANGE_MASSAGE],
      ['orange-bay-snorkelling-and-diving-day', B09AP.HBT_ORANGE_DIVE],
      ['orange-bay-yacht-with-breakfast', B09AP.HBT_ORANGE_YACHT],
      ['makadi-bay-two-guided-dives', B09AP.D2E_MAKADI_DIVES],
      ['three-islands-by-yacht', B09AP.HBT_THREE_ISLANDS],
      ['six-islands-by-speedboat', B09AP.HBT_SIX_ISLANDS],
      ['yacht-day-with-an-introductory-dive', B09AP.HBT_INTRO_DIVE_YACHT],
    ];
    for (const [tripPath, programme] of reused) {
      const trips = B13.flatMap((site) => site.trips).filter((trip) => trip.path === tripPath);
      expect(trips.length).toBeGreaterThan(0);
      // The same object, so the network says the same thing about the same trip wherever it is sold.
      for (const trip of trips) expect(trip.price).toBe(programme);
    }
    const earlier = new Set<unknown>([...Object.values(B03), ...Object.values(B03R), ...Object.values(B09AP), ...Object.values(B10N)]);
    expect(B13.flatMap((site) => site.trips).filter((trip) => !earlier.has(trip.price))).toEqual([]);
    // Seventeen programmes, and the batch adds none: the file exports its two groups and nothing else.
    expect(new Set(B13.flatMap((site) => site.trips).map((trip) => trip.price)).size).toBe(17);
  });

  it('holds each held-back record to the reason the batch gives', () => {
    const sold = new Set(B13.flatMap((site) => site.trips).map((trip) => trip.price.source));
    // The long packages are not in the snapshot at all, so none of them can be sold.
    for (const slug of [
      'cairo-3-day-tour-pyramids-museums-islamic-cairo-nile-cruise',
      'cairo-4-day-highlights-pyramids-ancient-sites-old-cairo',
      'cairo-nile-cruise-6-day-egypt-highlights-abu-simbel-hot-air-balloon',
      'egypt-in-9-days-cairo-alexandria-nile-cruise-luxor-abu-simbel',
    ]) {
      // The two hotel-inclusive packages entered the snapshot on 5 Nov as the source of Key of Egypt's package
      // listings (seed-keyofegypt-packages.ts); they are still never sold as a day by this batch.
      if (!PACKAGE_SOURCES.has(slug)) expect(tour(slug)).toBeUndefined();
      expect(sold.has(slug)).toBe(false);
    }
    // The two choose-your-own records sell their hotel transfer as an add-on, so neither includes the pickup
    // every network trip promises; the seed refuses them, exactly as it did for batches B10 to B12.
    const choice = tour('cairo-private-guided-tour-to-your-choice-of-top-attractions')!;
    expect(sold.has(choice.slug)).toBe(false);
    expect((choice.detail.whatsNotIncluded || []).join('\n')).toMatch(/hotel (?:transfers|pick-up)/i);
    expect(sold.has('cairo-museum-tour-choose-your-museum-explore-egypt-s-history')).toBe(false);
    const site = { ...siteOf('pyramid-of-neferirkare'), slugPrefix: 'tmp-' } as NetworkSite;
    const spec = { provider: 'eeo' as const, tenant: 'egypt-excursions-online', source: choice.slug, category: 'day-trips', options: ['saqqara-half-day-guided-tour-of-the-ancient-m-2544df7da254'], addons: [], departures: ['09:00'] };
    expect(() => tripDocument(site, { ...site.trips[0], path: 'held-back', price: spec }, eeoSourceProgramme(spec), 0, new Types.ObjectId()))
      .toThrow(/does not include hotel pickup/);
    // The two-day record from Sharm names Memphis and Saqqara in an option title its own description
    // contradicts, so no site here sells it.
    expect(sold.has('sharm-el-sheikh-2-day-cairo-pyramids-gem-luxury-stay')).toBe(false);
    // The Djedefre site sells the shared morning ride, not the private one: the record publishes both, they
    // leave at different times, and the private ride is the same day at more than twice the adult price.
    const ride = tour('giza-pyramids-sunrise-morning-guided-tour-with-camel-ride-breakfast')!;
    const options = ride.options as Array<Record<string, any>>;
    expect(options.map((option) => option.pricingKey)).toEqual([
      'shared-tour-with-giza-pyramids-entry-ticket-4fb577804443',
      'private-tour-with-giza-pyramids-entry-ticket-be38defacb48',
    ]);
    const [shared, priv] = options;
    expect(priv.guestPrices.adult).toBeGreaterThan(shared.guestPrices.adult * 2);
    expect(B03R.PCT_SHARED_SUNRISE.options).toEqual([shared.pricingKey]);
    // And the dearer of the two plateau-museum-bazaar days is left out rather than the same day sold twice.
    const dearer = tour('giza-pyramids-sphinx-egyptian-museum-khan-el-khalili-bazaar-tour')!;
    expect(sold.has(dearer.slug)).toBe(false);
    const cheaper = tour('private-pyramids-egyptian-museum-khan-el-khalili-tour')!;
    expect(sold.has(cheaper.slug)).toBe(true);
    expect((dearer.options as Array<Record<string, any>>)[0].guestPrices.adult)
      .toBeGreaterThan((cheaper.options as Array<Record<string, any>>)[0].guestPrices.adult);
    // The two submarine cruises the Makadi Bay reef was given are published by the client but are not in the
    // dated snapshot this batch builds from, so neither can be sold without reading the record in first.
    for (const slug of [
      'safaga-makadi-bay-semi-submarine-snorkeling-adventure',
      'safaga-makadi-bay-royal-seascope-submarine-cruise-with-hotel-pickup',
    ]) {
      expect(tour(slug)).toBeUndefined();
      expect(sold.has(slug)).toBe(false);
    }
    // The Orange Bay cruise with a massage publishes a price where its length should be ("$$69"), so the day
    // has no published duration to copy and nothing here types one.
    const noDuration = tour('hurghada-orange-bay-snorkeling-diving-cruise-with-massage')!;
    expect(noDuration.detail.duration).toBe('$$69');
    expect(sold.has(noDuration.slug)).toBe(false);
    // The Orange Island premium cruise names Orange Bay and no Giftun island, so it cannot carry the Giftun
    // reef's page, and the two Giftun reefs may not share a day, so it is sold on neither.
    const orangeOnly = tour('orange-island-premium-cruise-from-hurghada-with-lunch-transfer')!;
    expect(JSON.stringify(orangeOnly)).not.toMatch(/giftun/i);
    expect(sold.has(orangeOnly.slug)).toBe(false);
  });

  it('starts each site where its own trips start', () => {
    for (const slug of PYRAMID_SITES) {
      const site = siteOf(slug);
      expect([site.city, site.pickupDestination, site.area]).toEqual(['Cairo', 'cairo', 'Cairo or Giza']);
      expect(site.coordinates).toEqual({ lat: 30.0444, lng: 31.2357 });
      for (const trip of site.trips) expect(trip.where).toBeUndefined();
      for (const document of built(site, site.trips)) expect(document.meetingPoint.address).toBe('Your hotel in Cairo or Giza');
    }
    // The three reefs follow the Hurghada boat site of batch B09: the same town, pickup area and coordinates.
    const boats = B09A.sites.find((item) => item.slug === 'hurghada-boat-tour')!;
    for (const slug of REEF_SITES) {
      const site = siteOf(slug);
      expect([site.city, site.pickupDestination, site.area]).toEqual(['Hurghada', 'hurghada', 'Hurghada']);
      expect(site.coordinates).toEqual(boats.coordinates);
    }
    // Its one day collects in Makadi Bay, where the record collects, so that trip says where it starts.
    const dives = siteOf('ras-disha').trips[0];
    expect(dives.where).toEqual({ city: 'Makadi Bay', area: 'Makadi Bay', coordinates: { lat: 26.9806, lng: 33.9056 } });
    for (const document of built(siteOf('ras-disha'), [dives])) {
      expect(document.meetingPoint.address).toBe('Your hotel in Makadi Bay');
      expect(document.destination.city).toBe('Makadi Bay');
    }
    for (const slug of ['shaab-sabina', 'erg-somaya']) {
      for (const trip of siteOf(slug).trips) expect(trip.where).toBeUndefined();
      for (const document of built(siteOf(slug), siteOf(slug).trips)) expect(document.meetingPoint.address).toBe('Your hotel in Hurghada');
    }
  });

  it('takes no booking on a new site until its domain is connected and the owner opens it', () => {
    for (const site of B13) expect(isTenantBookingCreationClosed({ slug: site.slug })).toBe(true);
    for (const site of B13) {
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
    const complete = Object.fromEntries(B13.map((site) => [site.slug, good(site.slug)]));
    for (const batch of GROUPS) expect(logoProblems(batch, complete)).toEqual([]);
    // Every one of the seven is required: a file missing any single site refuses the group it belongs to.
    expect(Object.keys(complete)).toHaveLength(B13_SITES);
    for (const site of B13) {
      const { [site.slug]: _dropped, ...withoutOne } = complete;
      const batch = B13A.sites.includes(site) ? B13A : B13B;
      expect(logoProblems(batch, withoutOne)).toEqual([`${site.slug}: no logo entry.`]);
    }
    expect(logoProblems(B13A, { ...complete, 'meidum-pyramid': { ...good('meidum-pyramid'), favicon: '' } }))
      .toEqual(['meidum-pyramid: favicon is missing.']);
    expect(logoProblems(B13B, { ...complete, 'erg-somaya': { ...good('erg-somaya'), logoDark: 'https://example.com/logo.png' } }))
      .toEqual(["erg-somaya: logoDark must already be on the network's Cloudinary: https://example.com/logo.png"]);
  });

  it('repeats no sentence another site on the network already publishes', () => {
    const mine = B13.flatMap(copyOfSite);
    // Every B13 field is written for its own site: a trip field against the same record elsewhere, a tenant
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
    // The corpus is the dated scan plus every earlier batch, so this cannot pass by comparing against nothing.
    expect(LIVE.readAt).toBe('2026-10-31T06:56:04Z');
    expect(LIVE.tenants).toHaveLength(121);
    // Every record this batch sells has its live copy in the corpus, so nothing is compared against nothing.
    const covered = new Set(LIVE.trips.map((trip) => trip.record));
    const sold = [...new Set(B13.flatMap((site) => site.trips).map((trip) => trip.price.source))];
    expect(sold.filter((record) => !covered.has(record))).toEqual([]);
    expect(CORPUS.length).toBeGreaterThan(4000);
    expect(mine.length).toBeGreaterThan(200);
  });

  it('counts the trips its copy names', () => {
    for (const site of B13) {
      const copy = [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription, ...site.seo.keywords].join('\n');
      for (const count of statedTripCounts(copy)) expect(count).toBe(site.trips.length);
    }
    // Three sites count their days out loud, so each count is held to that site's own catalogue.
    expect(statedTripCounts(siteOf('pyramid-of-djedefre').description)).toEqual([5]);
    expect(statedTripCounts(siteOf('shaab-sabina').description)).toEqual([3]);
    expect(statedTripCounts(siteOf('erg-somaya').description)).toEqual([3]);
  });
});
