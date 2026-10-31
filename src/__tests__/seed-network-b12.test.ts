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
import { B09A, B09B, B09C } from '../scripts/network-sites/b09';
import { B10A, B10B, B10C, B10D, NEW_PROGRAMMES as B10N } from '../scripts/network-sites/b10';
import { B11A, B11B } from '../scripts/network-sites/b11';
import { B12A, B12B } from '../scripts/network-sites/b12';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';
import { isTenantBookingCreationClosed } from '../services/tenantBookingPolicy.service';

const EARLIER = [B01_SAFARI, B02, B03A, B03B, B03C, B03D, B08A, B08B, B08C, B08D, B09A, B09B, B09C,
  B10A, B10B, B10C, B10D, B11A, B11B].flatMap((batch) => batch.sites);
const GROUPS: NetworkBatch[] = [B12A, B12B];
const B12 = GROUPS.flatMap((batch) => batch.sites);
const siteOf = (slug: string) => B12.find((site) => site.slug === slug)!;

/** Each new site's storefront design, from the network build queue; the storefront picks it by slug. */
const DESIGNS: Record<string, string> = {
  'imhotep-museum': 'imhotep',
  'serapeum-of-saqqara': 'serapeum',
  'pyramid-of-teti': 'teti',
  'pyramid-of-unas': 'unas',
  'pyramid-of-userkaf': 'userkaf',
  'tomb-of-nefer': 'nefer',
  'buried-pyramid': 'buriedpyramid',
  'pyramid-of-pepi-ii': 'pepi',
  'pyramid-of-sahure': 'sahure',
  'mangrove-forest-egypt': 'mangrove',
};

/** Every new site's domain, as Fouad's list gives it. */
const DOMAINS: Record<string, string> = {
  'imhotep-museum': 'imhotepmuseum.com',
  'serapeum-of-saqqara': 'serapeumofsaqqara.com',
  'pyramid-of-teti': 'pyramidofteti.com',
  'pyramid-of-unas': 'pyramidofunas.com',
  'pyramid-of-userkaf': 'pyramidofuserkaf.com',
  'tomb-of-nefer': 'tombofnefer.com',
  'buried-pyramid': 'buriedpyramid.com',
  'pyramid-of-pepi-ii': 'pyramidofpepii.com',
  'pyramid-of-sahure': 'pyramidofsahure.com',
  'mangrove-forest-egypt': 'mangroveforestegypt.com',
};

/** The admin palette each site is created with, from the batch concepts (primary / secondary / accent). */
const THEMES: Record<string, [string, string, string]> = {
  'imhotep-museum': ['#1E1B18', '#F2E8D2', '#B23A2A'],
  'serapeum-of-saqqara': ['#1A1714', '#E8E0D0', '#D4A24C'],
  'pyramid-of-teti': ['#14203F', '#F2EDE1', '#E2B84B'],
  'pyramid-of-unas': ['#1C1C1A', '#F1ECE0', '#2F7F7A'],
  'pyramid-of-userkaf': ['#232323', '#F4ECDB', '#C88A3A'],
  'tomb-of-nefer': ['#A8452E', '#F7F2E8', '#3C8D5A'],
  'buried-pyramid': ['#3A2E22', '#FBF7EE', '#C2412D'],
  'pyramid-of-pepi-ii': ['#23201C', '#F3EAD3', '#2B5F7C'],
  'pyramid-of-sahure': ['#1F2226', '#EEE7DA', '#9C4532'],
  'mangrove-forest-egypt': ['#2F5E3A', '#F5F3EC', '#2C9C9A'],
};

/** The five days whose record stops at Saqqara; the seven necropolis monuments each sell all five. */
const FIVE = [
  'sakkara-memphis-and-dahshur-shared',
  'private-sakkara-memphis-and-dahshur',
  'giza-pyramids-sakkara-and-memphis',
  'private-day-with-lunch-and-a-nile-sail',
  'two-private-days-in-cairo',
];
/** The three that stop at both Saqqara and Dahshur, between which South Saqqara lies. */
const BOTH_ENDS = [
  'sakkara-memphis-and-dahshur-shared',
  'private-sakkara-memphis-and-dahshur',
  'private-day-with-lunch-and-a-nile-sail',
];
/** The three that drive from the Giza plateau down to Saqqara, past Abusir. */
const GIZA_ROAD = [
  'giza-pyramids-sakkara-and-memphis',
  'private-day-with-lunch-and-a-nile-sail',
  'two-private-days-in-cairo',
];
const NECROPOLIS = ['imhotep-museum', 'serapeum-of-saqqara', 'pyramid-of-teti', 'pyramid-of-unas',
  'pyramid-of-userkaf', 'tomb-of-nefer', 'buried-pyramid'];
const MONUMENT_SITES = [...NECROPOLIS, 'pyramid-of-pepi-ii', 'pyramid-of-sahure'];

/** What each site's own monument is called, so no page can be read as selling a stop there. */
const MONUMENT: Record<string, RegExp> = {
  'imhotep-museum': /Imhotep Museum/i,
  'serapeum-of-saqqara': /Serapeum/i,
  'pyramid-of-teti': /Pyramid of Teti/i,
  'pyramid-of-unas': /Pyramid of Unas/i,
  'pyramid-of-userkaf': /Pyramid of Userkaf/i,
  'tomb-of-nefer': /Tomb of Nefer/i,
  'buried-pyramid': /Buried Pyramid/i,
  'pyramid-of-pepi-ii': /Pyramid of Pepi II|South Saqqara/i,
  'pyramid-of-sahure': /Pyramid of Sahure|Abusir/i,
};

/** The one clause in which a monument site's trip copy may name its own monument: to say it is not a stop. */
const NOT_A_STOP: Record<string, string> = {
  'imhotep-museum': ', not the Imhotep Museum; this day makes no stop there.',
  'serapeum-of-saqqara': ', not the Serapeum; this day makes no stop there.',
  'pyramid-of-teti': ', not the Pyramid of Teti; this day makes no stop there.',
  'pyramid-of-unas': ', not the Pyramid of Unas; this day makes no stop there.',
  'pyramid-of-userkaf': ', not the Pyramid of Userkaf; this day makes no stop there.',
  'tomb-of-nefer': ', not the Tomb of Nefer; this day makes no stop there.',
  'buried-pyramid': ', not the Buried Pyramid; this day makes no stop there.',
  'pyramid-of-pepi-ii': ', not South Saqqara; this day makes no stop there.',
  'pyramid-of-sahure': ', not Abusir; this day makes no stop there.',
};

/** The "nearest days" sentence every site's description carries, word for word. */
const NEAREST: Record<string, string> = {
  'imhotep-museum': 'Every day sold here stops at Saqqara, and their published programmes name the Step Pyramid and the necropolis rather than the museum, which is not a stop on any of them.',
  'serapeum-of-saqqara': 'Every day sold here stops at Saqqara, and their published programmes name the Step Pyramid and the necropolis rather than the Serapeum, which is not a stop on any of them.',
  'pyramid-of-teti': 'Every day sold here stops at Saqqara, and their published programmes name the Step Pyramid and the necropolis rather than the Pyramid of Teti, which is not a stop on any of them.',
  'pyramid-of-unas': 'Every day sold here stops at Saqqara, and their published programmes name the Step Pyramid and the necropolis rather than the Pyramid of Unas, which is not a stop on any of them.',
  'pyramid-of-userkaf': 'Every day sold here stops at Saqqara, and their published programmes name the Step Pyramid and the necropolis rather than the Pyramid of Userkaf, which is not a stop on any of them.',
  'tomb-of-nefer': 'Every day sold here stops at Saqqara, and their published programmes name the Step Pyramid and the necropolis rather than the Tomb of Nefer, which is not a stop on any of them.',
  'buried-pyramid': 'Every day sold here stops at Saqqara, and their published programmes name the Step Pyramid and the necropolis rather than the Buried Pyramid, which is not a stop on any of them.',
  'pyramid-of-pepi-ii': 'Every day sold here stops at both Saqqara and Dahshur, and the road between them passes South Saqqara. None of their published programmes names South Saqqara or this pyramid, which is not a stop on any of them.',
  'pyramid-of-sahure': 'Every day sold here drives from the Giza plateau down to Saqqara, and the road between them passes Abusir. None of their published programmes names Abusir or this pyramid, which is not a stop on any of them.',
  'mangrove-forest-egypt': 'Both days sold here stop at that shore: their own published schedules name the mangroves, along with the Earthquake Crack, the Magic Lake and Allah’s Gate.',
};

/** Verbs that would turn a mention of the site's own monument into a stop the record does not publish. */
const VISIT = 'visits?|visiting|visited|enter(?:s|ing|ed)?|inside|into|explore[sd]?|exploring|tour of|'
  + 'see(?:s|ing)?|walk(?:s|ing)? (?:through|into|round|around|down)|step(?:s|ping)? (?:into|inside)|'
  + 'stop(?:s|ping)? (?:at|in)|descend(?:s|ing)? (?:into|to)|down into|take[sn]? you (?:to|into|inside)';

/**
 * Every trip title the network already publishes for the seven programmes this batch sells, read from the
 * dated network scan of 31 October 2026 (121 public sites, 928 trips). No B12 title may repeat one: each
 * site needs its own words for the same record, or the two split the same searches.
 */
const EXISTING_TITLES = [
  'Two Private Days: the Plateau, Sakkara, Memphis and the Museums',
  'The Giza Pyramids, Sakkara and Memphis in One Day',
  'Private Day: the Pyramids, Memphis, Sakkara and Dahshur with a Nile Sail',
  'Private Day at Sakkara, Memphis and Dahshur',
  'Private Day at Dahshur, Sakkara and Memphis',
  'Dahshur, Sakkara and Memphis in One Shared Day',
  'Private Day at the Step Pyramid, Memphis and Dahshur',
  'Shared Day at the Step Pyramid, Memphis and Dahshur',
  'Two Private Days: the Step Pyramid, Memphis and the Museums',
  'Private Day at the Red Pyramid, Saqqara and Memphis',
  'Shared Day at the Red Pyramid, Saqqara and Memphis',
  'Private Day at Memphis and Saqqara with Lunch and a Nile Sail',
  'Private Day at Memphis, Saqqara and Dahshur',
  'Shared Day at Memphis, Saqqara and Dahshur',
  'Two Private Days: the Alabaster Sphinx, Memphis and the Museums',
  'The Giza Pyramids, Saqqara and Memphis in One Day',
  'Private Day at Saqqara and Memphis with Lunch and a Nile Sail',
  'Private Day at Saqqara, Memphis and Dahshur',
  'Sakkara, Memphis and Dahshur in a Shared Group',
  'Two Private Days: the Necropolis, Memphis and the Museums',
  'Dawn Quad Ride and a Day in Ras Mohamed National Park',
  'Ras Mohamed and Allah’s Gate, Half a Day by Bus',
];

/** A line that holds only for an option the trip does not sell, or for an extra it cannot offer. */
const CONDITIONAL = /\(if |if selected|if add-on|if (?:the )?option|add on selection|5h Tour:|8h Tour:|depending on the option/i;
/** The one line on the network that reads as a condition and is kept (batch B03's shopping stops). */
const SHOPPING_STOPS = 'Visits: Papyrus Gallery, Oils Factory, Bazaar, Cotton Store, Carpet School (upon request)';

const RECORDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'network-b12-record-names.json'), 'utf8')) as Record<string, Record<string, unknown>>;

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

/** Every rule a B12 trip keeps. */
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

describe('batch B12: the ten new sites', () => {
  it('is two valid groups of the ten sites, none of them built before', () => {
    expect(GROUPS.map((batch) => batch.id)).toEqual(['b12a', 'b12b']);
    for (const batch of GROUPS) expect(validateBatch(batch)).toEqual([]);
    expect(B12.map((site) => site.slug)).toEqual(Object.keys(DESIGNS));
    expect(B12.map((site) => site.name)).toEqual([
      'Imhotep Museum', 'Serapeum of Saqqara', 'Pyramid of Teti', 'Pyramid of Unas', 'Pyramid of Userkaf',
      'Tomb of Nefer', 'Buried Pyramid', 'Pyramid of Pepi II', 'Pyramid of Sahure', 'Mangrove Forest Egypt',
    ]);
    for (const site of B12) {
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
    for (const site of B12) {
      expect(before.has(site.slug) || before.has(site.domain) || before.has(site.slugPrefix)).toBe(false);
    }
    expect(B12.map((site) => site.slugPrefix)).toEqual(['imm-', 'sos-', 'pte-', 'pun-', 'puk-', 'ton-', 'bpy-', 'pp2-', 'psa-', 'mfe-']);
    const prefixes = B12.map((site) => site.slugPrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    // No site across every batch shares a title or a trip slug.
    const every = [...EARLIER, ...B12];
    const titles = every.map((site) => site.seo.metaTitle.trim().toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    const slugs = every.flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every site its own words for a record the network already sells', () => {
    // The nine monument sites sell records batches B03, B10 and B11 already sell, so the one thing that must
    // not be shared is the words. No two sites anywhere on the network carry the same trip title.
    const mine = B12.flatMap((site) => site.trips.map((trip) => trip.title));
    expect(mine).toHaveLength(43);
    expect(new Set(mine).size).toBe(mine.length);
    const taken = new Set([
      ...EXISTING_TITLES,
      ...EARLIER.flatMap((site) => site.trips.map((trip) => trip.title)),
    ].map((title) => title.trim().toLowerCase()));
    expect(mine.filter((title) => taken.has(title.trim().toLowerCase()))).toEqual([]);
    // The short line and the search entry are each the site's own too.
    for (const field of ['short', 'seo.metaTitle'] as const) {
      const lines = B12.flatMap((site) => site.trips.map((trip) => (field === 'short' ? trip.short : trip.seo.metaTitle)));
      expect(new Set(lines).size).toBe(lines.length);
    }
  });

  it('names every site that opens on a photo another site already opens on', () => {
    // The client publishes three distinct photos across every record the nine monument sites sell, and each
    // already opens a site that is live. Nothing is invented and nothing is mislabelled, so the overlap is
    // named here rather than hidden, and it goes once the client supplies each site's own photography.
    const taken = new Map<string, string>();
    for (const site of EARLIER) if (!taken.has(site.heroImages[0])) taken.set(site.heroImages[0], site.slug);
    const sharing = B12
      .filter((site) => taken.has(site.heroImages[0]))
      .map((site) => [site.slug, taken.get(site.heroImages[0])]);
    expect(sharing).toEqual([
      ['imhotep-museum', 'mit-rahina-museum'],
      ['serapeum-of-saqqara', 'sakkara-pyramids'],
      ['pyramid-of-teti', 'pyramids-of-dahshur'],
      ['pyramid-of-unas', 'mit-rahina-museum'],
      ['pyramid-of-userkaf', 'sakkara-pyramids'],
      ['tomb-of-nefer', 'pyramids-of-dahshur'],
      ['buried-pyramid', 'mit-rahina-museum'],
      ['pyramid-of-pepi-ii', 'sakkara-pyramids'],
      ['pyramid-of-sahure', 'pyramids-of-dahshur'],
    ]);
    // The mangrove site opens on a photo no site opens on, and says why it shows two rather than three.
    expect(taken.has(siteOf('mangrove-forest-egypt').heroImages[0])).toBe(false);
    expect(siteOf('mangrove-forest-egypt').photoShortfall).toBe('The two trips this site sells publish two photos between them.');
    for (const slug of MONUMENT_SITES) expect(siteOf(slug).photoShortfall).toBeUndefined();
    // Every site's own home photos are still distinct from each other, and every one is a record's own photo.
    const recordPhotos = new Set(B12.flatMap((site) => site.trips.flatMap((trip) => trip.images)));
    for (const site of B12) {
      expect(new Set(site.heroImages).size).toBe(site.heroImages.length);
      for (const url of site.heroImages) expect(recordPhotos.has(url)).toBe(true);
    }
    // Each photo is described once across the batch, so none is described two ways.
    const described = new Map<string, Set<string>>();
    for (const site of B12) for (const trip of site.trips) {
      trip.images.forEach((url, index) => {
        if (!described.has(url)) described.set(url, new Set());
        described.get(url)!.add(trip.imageAlts[index]);
      });
    }
    for (const [, alts] of described) expect(alts.size).toBe(1);
  });

  it('sells only the days the "nearest days" rule supports', () => {
    expect(B12.map((site) => [site.slug, site.trips.map((trip) => trip.path)])).toEqual([
      ['imhotep-museum', FIVE],
      ['serapeum-of-saqqara', FIVE],
      ['pyramid-of-teti', FIVE],
      ['pyramid-of-unas', FIVE],
      ['pyramid-of-userkaf', FIVE],
      ['tomb-of-nefer', FIVE],
      ['buried-pyramid', FIVE],
      ['pyramid-of-pepi-ii', BOTH_ENDS],
      ['pyramid-of-sahure', GIZA_ROAD],
      ['mangrove-forest-egypt', ['ras-mohamed-half-day-by-bus', 'dawn-quad-ride-and-ras-mohamed']],
    ]);
    expect(B12.reduce((total, site) => total + site.trips.length, 0)).toBe(43);
    // The seven necropolis monuments stand inside Saqqara, so they sell exactly the same five.
    for (const slug of NECROPOLIS) {
      expect(siteOf(slug).trips.map((trip) => trip.price)).toEqual(siteOf('imhotep-museum').trips.map((trip) => trip.price));
    }
    // What each record the batch sells says about itself, kept beside this test: its published title, its
    // booking options, its schedule and what it includes, from the dated snapshot.
    for (const [slug, record] of Object.entries(RECORDS)) {
      const found = tour(slug)!;
      expect(found.detail.title).toBe(record.title);
      expect((found.options as Array<{ title: string }>).map((option) => option.title)).toEqual(record.options);
      expect((found.options as Array<{ pricingKey: string }>).map((option) => option.pricingKey)).toEqual(record.optionKeys);
      expect((found.detail.itinerary as Array<{ title: string }> | null || []).map((step) => step.title)).toEqual(record.itinerary);
    }
    // Every record the nine monument sites sell names Sakkara or Saqqara in its own published words.
    for (const slug of MONUMENT_SITES) {
      for (const trip of siteOf(slug).trips) expect(JSON.stringify(RECORDS[trip.price.source])).toMatch(/sakkara|saqqara/i);
    }
    // South Saqqara lies between Saqqara and Dahshur, so Pepi II sells only the days that stop at both, and
    // the two that reach Saqqara without Dahshur are held back from it.
    for (const trip of siteOf('pyramid-of-pepi-ii').trips) {
      expect(scheduleOf(trip)).toMatch(/Dahshur/);
      expect(scheduleOf(trip)).toMatch(/Sakkara|Saqqara/);
    }
    for (const path of FIVE.filter((item) => !BOTH_ENDS.includes(item))) {
      const trip = siteOf('imhotep-museum').trips.find((item) => item.path === path)!;
      expect(scheduleOf(trip)).not.toMatch(/Dahshur/);
    }
    // Abusir sits on the road from the Giza plateau to Saqqara, so Sahure sells only the days that drive it.
    for (const trip of siteOf('pyramid-of-sahure').trips) {
      expect(scheduleOf(trip)).toMatch(/Giza plateau/);
      expect(scheduleOf(trip)).toMatch(/Sakkara|Saqqara/);
    }
    for (const path of FIVE.filter((item) => !GIZA_ROAD.includes(item))) {
      const trip = siteOf('imhotep-museum').trips.find((item) => item.path === path)!;
      expect(scheduleOf(trip)).not.toMatch(/Giza plateau/);
    }
    // The one true match in the batch: both mangrove days name the mangroves in the record's own words.
    for (const trip of siteOf('mangrove-forest-egypt').trips) {
      const found = tour(trip.price.source)!;
      const included = (found.detail.whatsIncluded?.length ? found.detail.whatsIncluded : found.detail.includes) as string[];
      expect(included.join('\n')).toMatch(/mangrove/i);
    }
  });

  it('says on every page what the programme names, and never that the monument is a stop', () => {
    for (const slug of MONUMENT_SITES) {
      const site = siteOf(slug);
      const monument = MONUMENT[slug];
      const clause = NOT_A_STOP[slug];
      for (const trip of site.trips) {
        // Each trip says once, plainly, what its programme names and that the monument is not among it.
        expect(trip.description).toContain('The programme names ');
        expect(trip.description.split(clause)).toHaveLength(2);
        // Outside that one clause, the trip's own words never mention the monument at all.
        expect(ownCopyOf(trip).split(clause).join(' ')).not.toMatch(monument);
      }
      // And nowhere on the site does a visiting word stand in front of the monument's name.
      const everyWord = [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription,
        ...site.seo.keywords, ...site.trips.map(ownCopyOf), ...site.trips.flatMap((trip) => trip.imageAlts)].join('\n');
      expect(everyWord).not.toMatch(new RegExp(`(?:${VISIT})\\s+(?:the\\s+)?(?:${monument.source})`, 'i'));
    }
    // Every site's description carries its own "nearest days" sentence, word for word.
    for (const site of B12) {
      expect(site.description.split(NEAREST[site.slug])).toHaveLength(2);
      // Two short paragraphs, and the closing line batch B11 ends on.
      expect(site.description.split('\n\n')).toHaveLength(2);
      expect(site.description).toContain('Every trip collects you from your hotel and brings you back');
      expect(site.description).toContain('Hold a place online and pay later');
    }
    // The mangrove site says its days do stop at the mangroves, and names no other mangrove coast.
    const mangrove = siteOf('mangrove-forest-egypt');
    const mangroveCopy = [mangrove.description, ...mangrove.trips.map(ownCopyOf)].join('\n');
    expect(mangroveCopy).toMatch(/stop at that shore|the mangroves are among the stops|The mangrove shore is one of the stops/);
    expect(mangroveCopy).not.toMatch(/Nabq|Hamata|Marsa Alam/i);
  });

  it('builds every trip from the dated snapshot, never from a price typed here', () => {
    for (const site of B12) for (const trip of site.trips) {
      expect(trip.price.provider).toBe('eeo');
      expect(trip.price.tenant).toBe('egypt-excursions-online');
      expect((SNAPSHOT.tours as Array<{ slug: string }>).map((item) => item.slug)).toContain(trip.price.source);
    }
    // Nothing in the batch data is a price, a child rate, a currency, an option or a departure of its own:
    // every one of them is read from the record at build time. The header's notes describe the client's
    // published records, so the rule is about the data below them.
    const whole = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'network-sites', 'b12.ts'), 'utf8');
    const source = whole.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/\bprice:\s*[\d.]/);
    expect(source).not.toMatch(/\bchildPrice\b|\bchildNote\b|\bpriceFrom\b|\bcurrency:\s*'(?!USD\b)/);
    expect(source).not.toMatch(/\bdepartures:|\bdepartureLabels:|\boptions:|\baddons:|\bomit:|\badd:|\brename:/);
    expect(source).not.toMatch(/[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/);
    // No sentence this batch writes names a sum of money either; a guest reads the structured price.
    const ownCopy = B12.flatMap((site) => [site.tagline, site.description, ...site.trips.map(ownCopyOf)]);
    expect(ownCopy.filter((line) => /[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line))).toEqual([]);
    // Not one line any B12 trip copies from a record names a sum of money, so no page shows a figure beside
    // the structured price. Named here so a changed record cannot introduce one unnoticed.
    const copiedMoney = B12.flatMap((site) => built(site, site.trips))
      .flatMap((document) => [...document.inclusions, ...document.exclusions, ...document.needToKnow, ...document.whatToBring] as string[])
      .filter((line) => /[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line));
    expect([...new Set(copiedMoney)].sort()).toEqual([]);
    // Every price a guest sees is the published one, copied at build time.
    for (const site of B12) for (const document of built(site, site.trips)) {
      const found = tour((site.trips.find((trip) => `${site.slugPrefix}${trip.path}` === document.slug)!).price.source)!;
      for (const option of document.pricingOptions as Array<Record<string, any>>) {
        const published = (found.options as Array<Record<string, any>>).find((item) => item.pricingKey === option.id)!;
        expect(option.price).toBe(published.guestPrices.adult);
      }
    }
  });

  it('writes every page to the same shape: two paragraphs, four highlights, a photo described', () => {
    for (const site of B12) {
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
    for (const site of B12) for (const document of built(site, site.trips)) { expectCompleteTrip(site, document); count += 1; }
    expect(count).toBe(43);
  });

  it('writes no programme of its own: every one is the batch that first sold the record', () => {
    const reused: Array<[string, unknown]> = [
      ['sakkara-memphis-and-dahshur-shared', B03.MAS_SHARED],
      ['private-sakkara-memphis-and-dahshur', B03.MAS_PRIVATE],
      ['giza-pyramids-sakkara-and-memphis', B03.MAS_WITH_GIZA],
      ['private-day-with-lunch-and-a-nile-sail', B03.MAS_NILE_SAIL],
      ['two-private-days-in-cairo', B10N.TWO_DAY_PRIVATE],
      ['ras-mohamed-half-day-by-bus', B03R.STG_RAS_MOHAMED_BUS],
      ['dawn-quad-ride-and-ras-mohamed', B03R.SSS_RAS_MOHAMED_ATV],
    ];
    for (const [tripPath, programme] of reused) {
      const trips = B12.flatMap((site) => site.trips).filter((trip) => trip.path === tripPath);
      expect(trips.length).toBeGreaterThan(0);
      // The same object, so the network says the same thing about the same trip wherever it is sold.
      for (const trip of trips) expect(trip.price).toBe(programme);
    }
    const earlier = new Set<unknown>([...Object.values(B03), ...Object.values(B03R), ...Object.values(B10N)]);
    expect(B12.flatMap((site) => site.trips).filter((trip) => !earlier.has(trip.price))).toEqual([]);
    // Seven programmes, and the batch adds none: the file exports its two groups and nothing else.
    expect(new Set(B12.flatMap((site) => site.trips).map((trip) => trip.price)).size).toBe(7);
  });

  it('holds each held-back record to the reason the batch gives', () => {
    const sold = new Set(B12.flatMap((site) => site.trips).map((trip) => trip.price.source));
    // The long packages are not in the snapshot at all, so none of them can be sold.
    for (const slug of [
      'cairo-3-day-tour-pyramids-museums-islamic-cairo-nile-cruise',
      'cairo-4-day-highlights-pyramids-ancient-sites-old-cairo',
      'cairo-nile-cruise-6-day-egypt-highlights-abu-simbel-hot-air-balloon',
      'egypt-in-9-days-cairo-alexandria-nile-cruise-luxor-abu-simbel',
    ]) {
      expect(tour(slug)).toBeUndefined();
      expect(sold.has(slug)).toBe(false);
    }
    // The museum-choice record sells its hotel transfer as an add-on, so it does not include the pickup
    // every network trip promises; the seed refuses it, exactly as it did for batches B10 and B11.
    const choice = tour('cairo-private-guided-tour-to-your-choice-of-top-attractions')!;
    expect(sold.has(choice.slug)).toBe(false);
    expect((choice.detail.whatsNotIncluded || []).join('\n')).toMatch(/hotel (?:transfers|pick-up)/i);
    const site = { ...siteOf('imhotep-museum'), slugPrefix: 'tmp-' } as NetworkSite;
    const spec = { provider: 'eeo' as const, tenant: 'egypt-excursions-online', source: choice.slug, category: 'day-trips', options: ['saqqara-half-day-guided-tour-of-the-ancient-m-2544df7da254'], addons: [], departures: ['09:00'] };
    expect(() => tripDocument(site, { ...site.trips[0], path: 'held-back', price: spec }, eeoSourceProgramme(spec), 0, new Types.ObjectId()))
      .toThrow(/does not include hotel pickup/);
    // The two-day record from Sharm names Memphis and Saqqara in an option title its own description
    // contradicts, so no site here sells it.
    expect(sold.has('sharm-el-sheikh-2-day-cairo-pyramids-gem-luxury-stay')).toBe(false);
    // The dawn safari is also sold for two, three and four riders sharing one vehicle. The programme batch
    // B03 wrote sells the two single-rider options only, and nothing here widens that.
    const atv = tour('early-morning-atv-safari-to-ras-mohammed-allah-gate')!;
    expect((atv.options as Array<{ pricingKey: string }>).length).toBe(6);
    expect(B03R.SSS_RAS_MOHAMED_ATV.options).toEqual([
      '1-person-1-sgl-quad-and-allah-gates-entrance-e92db079e1fc',
      '1-person-1-sgl-buggy-and-allah-gates-entrance-d64290a67f41',
    ]);
  });

  it('starts each site where its own trips start', () => {
    for (const slug of MONUMENT_SITES) {
      const site = siteOf(slug);
      expect([site.city, site.pickupDestination, site.area]).toEqual(['Cairo', 'cairo', 'Cairo or Giza']);
      expect(site.coordinates).toEqual({ lat: 30.0444, lng: 31.2357 });
      for (const trip of site.trips) expect(trip.where).toBeUndefined();
      for (const document of built(site, site.trips)) expect(document.meetingPoint.address).toBe('Your hotel in Cairo or Giza');
    }
    // The mangrove site follows the Sharm sites of batch B03: the same town, pickup area and coordinates.
    const mangrove = siteOf('mangrove-forest-egypt');
    expect([mangrove.city, mangrove.pickupDestination, mangrove.area]).toEqual(['Sharm El Sheikh', 'sharm-el-sheikh', 'Sharm el-Sheikh']);
    const sharm = B03C.sites.find((item) => item.slug === 'sharm-tour-guide')!;
    expect(mangrove.coordinates).toEqual(sharm.coordinates);
    for (const trip of mangrove.trips) expect(trip.where).toBeUndefined();
  });

  it('takes no booking on a new site until its domain is connected and the owner opens it', () => {
    for (const site of B12) expect(isTenantBookingCreationClosed({ slug: site.slug })).toBe(true);
    for (const site of B12) {
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
    const complete = Object.fromEntries(B12.map((site) => [site.slug, good(site.slug)]));
    for (const batch of GROUPS) expect(logoProblems(batch, complete)).toEqual([]);
    // Every one of the ten is required: a file missing any single site refuses the group it belongs to.
    for (const site of B12) {
      const { [site.slug]: _dropped, ...withoutOne } = complete;
      const batch = B12A.sites.includes(site) ? B12A : B12B;
      expect(logoProblems(batch, withoutOne)).toEqual([`${site.slug}: no logo entry.`]);
    }
    expect(logoProblems(B12B, { ...complete, 'mangrove-forest-egypt': { ...good('mangrove-forest-egypt'), favicon: '' } }))
      .toEqual(['mangrove-forest-egypt: favicon is missing.']);
    expect(logoProblems(B12A, { ...complete, 'imhotep-museum': { ...good('imhotep-museum'), logoDark: 'https://example.com/logo.png' } }))
      .toEqual(["imhotep-museum: logoDark must already be on the network's Cloudinary: https://example.com/logo.png"]);
  });

  it('counts the trips its copy names', () => {
    for (const site of B12) {
      const copy = [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription, ...site.seo.keywords].join('\n');
      for (const count of statedTripCounts(copy)) expect(count).toBe(site.trips.length);
    }
  });
});
