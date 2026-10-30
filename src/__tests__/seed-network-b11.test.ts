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
import { B03B, B03C, B03D } from '../scripts/network-sites/b03-rest';
import { B08A, B08B, B08C, B08D, PROGRAMMES_D } from '../scripts/network-sites/b08';
import { B09A, B09B, B09C, PROGRAMMES_A, PROGRAMMES_B } from '../scripts/network-sites/b09';
import { B10A, B10B, B10C, B10D, NEW_PROGRAMMES as B10N } from '../scripts/network-sites/b10';
import { B11A, B11B } from '../scripts/network-sites/b11';
import {
  B11_EXISTING, PROGRAMMES as B11EP, validateExisting, type ExistingSite,
} from '../scripts/seed-network-b11-existing';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';
import { isTenantBookingCreationClosed } from '../services/tenantBookingPolicy.service';

const EARLIER = [B01_SAFARI, B02, B03A, B03B, B03C, B03D, B08A, B08B, B08C, B08D, B09A, B09B, B09C, B10A, B10B, B10C, B10D]
  .flatMap((batch) => batch.sites);
const GROUPS: NetworkBatch[] = [B11A, B11B];
const B11 = GROUPS.flatMap((batch) => batch.sites);
const siteOf = (slug: string) => B11.find((site) => site.slug === slug)!;
const existingOf = (slug: string) => B11_EXISTING.sites.find((site) => site.slug === slug)!;

/** Each new site's storefront design, from the network build queue; the storefront picks it by slug. */
const DESIGNS: Record<string, string> = {
  'saqqara-necropolis': 'necropolis',
  'pyramid-of-djoser': 'djoser',
  'red-pyramid-egypt': 'redpyramid',
  'sphinx-of-memphis': 'memphissphinx',
  'samadai-beach': 'samadaibeach',
  'hurghada-speedboat': 'hrgspeedboat',
};

/** Every new site's domain, as Fouad's list gives it. */
const DOMAINS: Record<string, string> = {
  'saqqara-necropolis': 'saqqaranecropolis.com',
  'pyramid-of-djoser': 'pyramidofdjoser.com',
  'red-pyramid-egypt': 'redpyramidegypt.com',
  'sphinx-of-memphis': 'sphinxofmemphis.com',
  'samadai-beach': 'samadaibeach.com',
  'hurghada-speedboat': 'hurghadaspeedboat.com',
};

/** A line that holds only for an option the trip does not sell, or for an extra it cannot offer. */
const CONDITIONAL = /\(if |if selected|if add-on|if (?:the )?option|add on selection|5h Tour:|8h Tour:|depending on the option/i;
/** The one line on the network that reads as a condition and is kept (batch B03's shopping stops). */
const SHOPPING_STOPS = 'Visits: Papyrus Gallery, Oils Factory, Bazaar, Cotton Store, Carpet School (upon request)';

const RECORDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'network-b11-record-names.json'), 'utf8')) as Record<string, Record<string, unknown>>;

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

/** Every rule a B11 trip keeps, on a new site or on one that already exists. */
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

describe('batch B11: the six new sites', () => {
  it('is two valid groups of the six sites, none of them built before', () => {
    expect(GROUPS.map((batch) => batch.id)).toEqual(['b11a', 'b11b']);
    for (const batch of GROUPS) expect(validateBatch(batch)).toEqual([]);
    expect(B11.map((site) => site.slug)).toEqual(Object.keys(DESIGNS));
    expect(B11.map((site) => site.name)).toEqual([
      'Saqqara Necropolis', 'Pyramid of Djoser', 'Red Pyramid Egypt', 'Sphinx of Memphis',
      'Samadai Beach', 'Hurghada Speedboat',
    ]);
    for (const site of B11) {
      expect(site.domain).toBe(DOMAINS[site.slug]);
      expect(DESIGNS[site.slug]).toMatch(/^[a-z]+$/);
      expect([site.currency, site.listingPath]).toEqual(['USD', '/trips']);
      // The tenant record keeps every network site on the shared design; the storefront picks the brand by slug.
      expect(tenantRecord(site).designMode).toBe('desertfox');
    }
    const before = new Set(EARLIER.flatMap((site) => [site.slug, site.domain, site.slugPrefix]));
    for (const site of B11) {
      expect(before.has(site.slug) || before.has(site.domain) || before.has(site.slugPrefix)).toBe(false);
    }
    // No site across every batch shares a title or a trip slug.
    const every = [...EARLIER, ...B11];
    const titles = every.map((site) => site.seo.metaTitle.trim().toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    const slugs = every.flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('names every site that opens on a photo another site already opens on', () => {
    // The client publishes three distinct photos across every record the monument sites sell, and one for the
    // Samadai reef, and each already opens a site that is live. Nothing is invented and nothing is mislabelled,
    // so the overlap is named here rather than hidden, and it goes once the client supplies each site's own
    // photography. Only Hurghada Speedboat, which sells five records of its own, opens on a photo no site does.
    const taken = new Map(EARLIER.map((site) => [site.heroImages[0], site.slug]));
    const sharing = B11
      .filter((site) => taken.has(site.heroImages[0]))
      .map((site) => [site.slug, taken.get(site.heroImages[0])]);
    expect(sharing).toEqual([
      ['saqqara-necropolis', 'mit-rahina-museum'],
      ['pyramid-of-djoser', 'sakkara-pyramids'],
      ['red-pyramid-egypt', 'mit-rahina-museum'],
      ['sphinx-of-memphis', 'sakkara-pyramids'],
      ['samadai-beach', 'shaab-samadai'],
    ]);
    expect(taken.has(siteOf('hurghada-speedboat').heroImages[0])).toBe(false);
    // Every site's own home photos are still distinct from each other.
    for (const site of B11) expect(new Set(site.heroImages).size).toBe(site.heroImages.length);
  });

  it('sells only the trips whose record names that site\'s own place', () => {
    expect(B11.map((site) => [site.slug, site.trips.length])).toEqual([
      ['saqqara-necropolis', 5],
      ['pyramid-of-djoser', 3],
      ['red-pyramid-egypt', 2],
      ['sphinx-of-memphis', 5],
      ['samadai-beach', 1],
      ['hurghada-speedboat', 5],
    ]);
    expect(B11.reduce((total, site) => total + site.trips.length, 0)).toBe(21);
    // What each record the batch sells says about itself, kept beside this test: the client's published title,
    // description, inclusions, options and stops, read from the live list and booking API on 30 October 2026.
    for (const [slug, record] of Object.entries(RECORDS)) {
      const tour = (SNAPSHOT.tours as Array<Record<string, any>>).find((item) => item.slug === slug)!;
      expect(tour.detail.title).toBe(record.title);
      expect((tour.options as Array<{ title: string }>).map((option) => option.title)).toEqual(record.options);
    }
    const named = (slug: string, pattern: RegExp) => {
      for (const trip of siteOf(slug).trips) expect(JSON.stringify(RECORDS[trip.price.source])).toMatch(pattern);
    };
    named('saqqara-necropolis', /sakkara|saqqara/i);
    named('pyramid-of-djoser', /djoser|step pyramid/i);
    named('red-pyramid-egypt', /red pyramid/i);
    // The alabaster sphinx stands in the Mit Rahina open-air museum, so the rule is the day's own stops: each
    // record lists "Memphis, Egypt" or the Alabaster Sphinx in its published schedule, never Memphis in passing.
    for (const trip of siteOf('sphinx-of-memphis').trips) {
      expect((RECORDS[trip.price.source].itinerary as string[]).join(' | ')).toMatch(/Memphis, Egypt|Alabaster Sphinx/i);
    }
    // It is exactly the catalogue batch B10's Mit Rahina Museum sells, which is what the records support.
    const mitRahina = B10B.sites.find((item) => item.slug === 'mit-rahina-museum')!;
    expect(siteOf('sphinx-of-memphis').trips.map((trip) => trip.path)).toEqual(mitRahina.trips.map((trip) => trip.path));
    expect(siteOf('sphinx-of-memphis').trips.map((trip) => trip.price)).toEqual(mitRahina.trips.map((trip) => trip.price));
    named('samadai-beach', /samadai/i);
    named('hurghada-speedboat', /speedboat/i);
    // The Red Pyramid is the strict reading: the record names it AND the option sold goes to Dahshur.
    for (const trip of siteOf('red-pyramid-egypt').trips) {
      expect(trip.price.source).toBe('sakkara-memphis-dahshur-giza-pyramids-day-tour');
      expect(trip.price.options.join(' ')).toMatch(/dahshur/i);
    }
  });

  it('builds every trip from the dated snapshot, never from a price typed here', () => {
    for (const site of B11) for (const trip of site.trips) {
      expect(trip.price.provider).toBe('eeo');
      expect(trip.price.tenant).toBe('egypt-excursions-online');
      expect((SNAPSHOT.tours as Array<{ slug: string }>).map((tour) => tour.slug)).toContain(trip.price.source);
    }
    // Nothing in the batch data is a price, a child rate or a currency of its own. The header's held-back notes
    // describe the client's published records, so the rule is about the data below them; the companion script's
    // machinery reads `childPrice` to print a plan, so only its data region is held to the same rule.
    const files: Array<[string, (text: string) => string]> = [
      ['scripts/network-sites/b11.ts', (text) => text],
      ['scripts/seed-network-b11-existing.ts', (text) => text.slice(0, text.indexOf('const copyOf = '))],
    ];
    for (const [file, dataOnly] of files) {
      const whole = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      const source = dataOnly(whole).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(source).not.toMatch(/\bprice:\s*[\d.]/);
      expect(source).not.toMatch(/\bchildPrice\b|\bpriceFrom\b|\bcurrency:\s*'(?!USD\b)/);
      // An `omit` names a line of the client's record word for word, so a price inside one is the client's, not
      // ours, and the line is being taken off the trip rather than shown. Everywhere else, no sum of money.
      expect(source.replace(/omit: \{[\s\S]*?\n {4}\},/g, '')).not.toMatch(/[$€]\d/);
    }
    // The only priced lines quoted in the batch data are the two this batch takes off a trip.
    const omitted = [...B11, ...B11_EXISTING.sites].flatMap((site) => site.trips)
      .flatMap((trip) => Object.values(trip.price.omit || {}).flat() as string[])
      .filter((line) => /[$€£]\s?\d/.test(line));
    expect([...new Set(omitted)].sort()).toEqual([
      'Optional: Scarf & Goggles for $5',
      'Pickup from outside Makadi: $5 per person',
    ]);
    // No sentence this batch writes names a sum of money either; a guest reads the structured price.
    const ownCopy = [...B11, ...B11_EXISTING.sites].flatMap((site) => site.trips.flatMap((trip) => [
      trip.title, trip.short, trip.description, ...trip.highlights, trip.seo.metaTitle, trip.seo.metaDescription,
      ...Object.values(trip.price.rename || {}).flatMap((words) => [words.name, words.description]),
      ...(trip.price.add?.inclusions || []), ...(trip.price.add?.exclusions || []), ...(trip.price.add?.needToKnow || []),
      ...(trip.price.itinerary || []).flatMap((step) => [step.title, step.description]),
    ]));
    expect(ownCopy.filter((line) => /[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line))).toEqual([]);
    // Where the client's own record prices something inside a line, the line is copied as it stands. These are
    // the only ones on any B11 trip, and they are named so a new one cannot appear unnoticed.
    const copiedMoney = [...B11, ...B11_EXISTING.sites].flatMap((site) => built(site, site.trips))
      .flatMap((document) => [...document.inclusions, ...document.exclusions, ...document.needToKnow, ...document.whatToBring] as string[])
      .filter((line) => /[$€£]\s?\d|\b\d+\s?(?:USD|EUR|EGP)\b/.test(line));
    expect([...new Set(copiedMoney)].sort()).toEqual([
      'Nature Reserve Fee: €5 per person (adult/child), not included. Pay by cash, Visa, or payment link',
      'Nature reserve fee: $5',
    ]);
    // Every price a guest sees is the published one, copied at build time.
    for (const site of B11) for (const document of built(site, site.trips)) {
      const tour = (SNAPSHOT.tours as Array<Record<string, any>>).find((item) => item.slug === (site.trips
        .find((trip) => `${site.slugPrefix}${trip.path}` === document.slug)!).price.source)!;
      for (const option of document.pricingOptions as Array<Record<string, any>>) {
        const published = (tour.options as Array<Record<string, any>>).find((item) => item.pricingKey === option.id)!;
        expect(option.price).toBe(published.guestPrices.adult);
      }
    }
  });

  it('builds every trip into a complete trip', () => {
    let count = 0;
    for (const site of B11) for (const document of built(site, site.trips)) { expectCompleteTrip(site, document); count += 1; }
    expect(count).toBe(21);
  });

  it('writes no programme of its own: every one is the batch that first sold the record', () => {
    const reused: Array<[string, unknown]> = [
      ['sakkara-memphis-and-dahshur-shared', B03.MAS_SHARED],
      ['private-sakkara-memphis-and-dahshur', B03.MAS_PRIVATE],
      ['giza-pyramids-sakkara-and-memphis', B03.MAS_WITH_GIZA],
      ['private-day-with-lunch-and-a-nile-sail', B03.MAS_NILE_SAIL],
      ['two-private-days-in-cairo', B10N.TWO_DAY_PRIVATE],
      ['samadai-reef-snorkelling-boat-day', PROGRAMMES_B.SHAAB_SAMADAI],
      ['speedboat-snorkelling-trip', PROGRAMMES_A.HBT_SPEEDBOAT_SNORKEL],
      ['dolphin-watching-by-speedboat', PROGRAMMES_A.HBT_DOLPHIN_WATCH],
      ['six-islands-by-speedboat', PROGRAMMES_A.HBT_SIX_ISLANDS],
      ['dolphin-house-by-speedboat', PROGRAMMES_A.HBT_DOLPHIN_SPEEDBOAT],
      ['hula-hula-island-by-speedboat', PROGRAMMES_A.HBT_HULA_SPEEDBOAT],
    ];
    for (const [tripPath, programme] of reused) {
      const trips = B11.flatMap((site) => site.trips).filter((trip) => trip.path === tripPath);
      expect(trips.length).toBeGreaterThan(0);
      // The same object, so the network says the same thing about the same trip wherever it is sold.
      for (const trip of trips) expect(trip.price).toBe(programme);
    }
    const earlier = new Set<unknown>([
      ...Object.values(B03), ...Object.values(PROGRAMMES_A), ...Object.values(PROGRAMMES_B),
      ...Object.values(PROGRAMMES_D), ...Object.values(B10N),
    ]);
    expect(B11.flatMap((site) => site.trips).filter((trip) => !earlier.has(trip.price))).toEqual([]);
  });

  it('holds each held-back record to the reason the batch gives', () => {
    const tours = SNAPSHOT.tours as unknown as Array<{
      slug: string;
      detail: { whatsIncluded?: string[]; includes?: string[]; whatsNotIncluded?: string[] };
      options: Array<{ pricingKey: string; title: string; type: string; guestPrices: { adult: number; child?: number }; timeSlots: Array<{ time: string; guestPrices?: { adult: number } }> }>;
    }>;
    const tour = (slug: string) => tours.find((item) => item.slug === slug);
    const sold = new Set([...B11, ...B11_EXISTING.sites].flatMap((site) => site.trips).map((trip) => trip.price.source));

    // The long packages and the two that start in Luxor are not in the snapshot at all, so none can be sold.
    for (const slug of [
      'cairo-3-day-tour-pyramids-museums-islamic-cairo-nile-cruise',
      'cairo-4-day-highlights-pyramids-ancient-sites-old-cairo',
      'cairo-nile-cruise-6-day-egypt-highlights-abu-simbel-hot-air-balloon',
      'egypt-in-9-days-cairo-alexandria-nile-cruise-luxor-abu-simbel',
    ]) {
      expect(tour(slug)).toBeUndefined();
      expect(sold.has(slug)).toBe(false);
    }

    // The museum-choice record sells its hotel transfer as an add-on, so it does not include the pickup every
    // network trip promises; the seed refuses it.
    const choice = tour('cairo-private-guided-tour-to-your-choice-of-top-attractions')!;
    expect(sold.has(choice.slug)).toBe(false);
    expect((choice.detail.whatsNotIncluded || []).join('\n')).toMatch(/hotel (?:transfers|pick-up)/i);
    const site = { ...siteOf('saqqara-necropolis'), slugPrefix: 'tmp-' } as NetworkSite;
    const spec = { provider: 'eeo' as const, tenant: 'egypt-excursions-online', source: choice.slug, category: 'day-trips', options: ['saqqara-half-day-guided-tour-of-the-ancient-m-2544df7da254'], addons: [], departures: ['09:00'] };
    expect(() => tripDocument(site, { ...site.trips[0], path: 'held-back', price: spec }, eeoSourceProgramme(spec), 0, new Types.ObjectId()))
      .toThrow(/does not include hotel pickup/);

    // The Paradise Island record prices each departure apart from its option, which the seed refuses outright.
    const paradise = tour('from-hurghada-paradise-island-yacht-speedboat-cruise-with-snorkeling-lunch')!;
    expect(sold.has(paradise.slug)).toBe(false);
    const hurghadaOption = paradise.options.find((option) => option.pricingKey === '7-hour-yacht-tour-from-hurghada-hotels-990333086c06')!;
    expect(hurghadaOption.timeSlots.some((slot) => slot.guestPrices!.adult !== hurghadaOption.guestPrices.adult)).toBe(true);
    expect(() => eeoSourceProgramme({ provider: 'eeo', tenant: 'egypt-excursions-online', source: paradise.slug, category: 'water-activities', options: [hurghadaOption.pricingKey], addons: [], departures: ['11:30'] }))
      .toThrow(/prices its 09:00 departure apart from the option/);
    // Every one of its options sells a yacht tour, so none of them is a speedboat day.
    for (const option of paradise.options) expect(option.title).toMatch(/Yacht Tour/i);

    // The Makadi records that promise their pickup only conditionally, or price an option per group or per couple.
    for (const slug of [
      'from-makadi-bay-hurghada-desert-quad-bike-camel-ride',
      'makadi-bay-atv-camel-safari-with-dinner-and-stargazing',
      'makadi-bay-sunset-atv-quad-safari-with-stunning-sea-views',
      'sunrise-buggy-safari-in-makadi-bay-with-breakfast',
      'hurghada-quad-biking-adventure-with-dinner-show-stargazing-options',
    ]) {
      const record = tour(slug)!;
      expect(sold.has(slug)).toBe(false);
      const included = (record.detail.whatsIncluded?.length ? record.detail.whatsIncluded : record.detail.includes) || [];
      const notIncluded = record.detail.whatsNotIncluded || [];
      const conditionalPickup = included.some((line) => /hotel pickup/i.test(line) && CONDITIONAL.test(line));
      const excludedPickup = notIncluded.some((line) => /hotel pickup/i.test(line));
      expect(conditionalPickup || excludedPickup).toBe(true);
    }
    // Every option of the sunrise buggy record is priced per group, which the record's own type says.
    for (const option of tour('sunrise-buggy-safari-in-makadi-bay-with-breakfast')!.options) expect(option.type).toBe('Per Group');
    // The two-hour quad record's second option is priced per couple, so only the single quad is sold.
    const twoHour = tour('makadi-bay-2-hour-quad-bike-adventure-across-desert-coast')!;
    expect(twoHour.options.find((option) => option.pricingKey === 'double-quad-4a3e1777d7d0')!.type).toBe('Per Couple');
    expect(existingOf('makadi-bay-safari').trips.find((trip) => trip.price.source === twoHour.slug)!.price.options)
      .toEqual(['single-quad-652928d03bae']);

    // The client publishes no Luxor day that leaves from Hurghada; the one it sells from the coast leaves Makadi Bay.
    const luxor = tour('makadi-bay-to-luxor-discover-the-valley-of-the-kings-king-tut-s-tomb')!;
    expect(((luxor.detail.whatsIncluded?.length ? luxor.detail.whatsIncluded : luxor.detail.includes) || []).join('\n'))
      .toMatch(/Hotel pickup and drop-off from your hotel in Makadi Bay/i);
    for (const trip of existingOf('luxor-tour-from-hurghada').trips) {
      expect(trip.where).toEqual({ city: 'Makadi Bay', area: 'Makadi Bay', coordinates: { lat: 26.9956, lng: 33.8955 } });
      expect(trip.short).toMatch(/leaves Makadi Bay, south of Hurghada/);
    }

    // The Grand Egyptian Museum is an extra bound to no booking option on the Cairo day from Hurghada.
    const fromHurghada = (SNAPSHOT.tours as Array<Record<string, any>>)
      .find((item) => item.slug === 'from-hurghada-cairo-pyramids-grand-egyptian-museum-citadel-day-trip')!;
    for (const addon of fromHurghada.addons as Array<{ bookingOptionKeys?: string[] }>) expect(addon.bookingOptionKeys || []).toEqual([]);
    expect(built(existingOf('cairo-tour-from-hurghada'), existingOf('cairo-tour-from-hurghada').trips)[0].addons).toEqual([]);

    // The Hurghada Dolphin House records are not sold on Samadai Beach: only one record names the Samadai reef.
    for (const slug of [
      'hurghada-dolphin-house-morning-cruise-dolphin-swim',
      'hurghada-dolphin-house-yacht-cruise-with-dolphin-swim-lunch',
      'hurghada-dolphin-house-yacht-trip-with-snorkeling-lunch',
    ]) {
      expect(siteOf('samadai-beach').trips.map((trip) => trip.price.source)).not.toContain(slug);
    }
    // The two pool photographs the client publishes are used nowhere in this batch.
    const everyPhoto = [...B11, ...B11_EXISTING.sites].flatMap((site) => site.trips.flatMap((trip) => trip.images));
    for (const pool of ['z4gtxleicoone3uj2kvq', 'dnvtjuhbfcyjrjl8b9xv']) {
      expect(everyPhoto.some((url) => url.includes(pool))).toBe(false);
    }
  });

  it('starts each site where its own trips start', () => {
    for (const slug of ['saqqara-necropolis', 'pyramid-of-djoser', 'red-pyramid-egypt', 'sphinx-of-memphis']) {
      const site = siteOf(slug);
      expect([site.city, site.pickupDestination, site.area]).toEqual(['Cairo', 'cairo', 'Cairo or Giza']);
      for (const trip of site.trips) expect(trip.where).toBeUndefined();
      for (const document of built(site, site.trips)) expect(document.meetingPoint.address).toBe('Your hotel in Cairo or Giza');
    }
    expect([siteOf('samadai-beach').city, siteOf('samadai-beach').pickupDestination]).toEqual(['Marsa Alam', 'marsa-alam']);
    expect([siteOf('hurghada-speedboat').city, siteOf('hurghada-speedboat').pickupDestination]).toEqual(['Hurghada', 'hurghada']);
  });

  it('takes no booking on a new site until its domain is connected and the owner opens it', () => {
    for (const site of B11) expect(isTenantBookingCreationClosed({ slug: site.slug })).toBe(true);
    for (const site of B11) {
      const record = tenantRecord(site);
      expect(record.customDomain).toBeUndefined();
      expect(record.domainMigrated).toBe(false);
      expect(record.domain).toBe(`${site.slug}.foxesnetwork.com`);
      expect((record.paymentSettings as { enabledGateways: string[] }).enabledGateways).toEqual(['pay-later']);
    }
    // The five that already exist are closed here too (coordinator, 30 October): their catalogue is being
    // replaced, and neither of them has a payment gateway or a booking inbox to take a real booking with.
    for (const site of B11_EXISTING.sites) expect(isTenantBookingCreationClosed({ slug: site.slug })).toBe(true);
  });

  it('refuses to apply a new site until it has its approved logo, dark logo and favicon', () => {
    for (const batch of GROUPS) expect(logoProblems(batch, null)).toEqual(['No --logos=<path> given.']);
    const good = (slug: string) => ({
      logo: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/logo.png`,
      logoDark: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/logo-dark.png`,
      favicon: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/favicon.png`,
    });
    const complete = Object.fromEntries(B11.map((site) => [site.slug, good(site.slug)]));
    for (const batch of GROUPS) expect(logoProblems(batch, complete)).toEqual([]);
    const { 'samadai-beach': _dropped, ...withoutSamadai } = complete;
    expect(logoProblems(B11B, withoutSamadai)).toEqual(['samadai-beach: no logo entry.']);
    expect(logoProblems(B11B, { ...complete, 'hurghada-speedboat': { ...good('hurghada-speedboat'), favicon: '' } }))
      .toEqual(['hurghada-speedboat: favicon is missing.']);
    expect(logoProblems(B11B, { ...complete, 'hurghada-speedboat': { ...good('hurghada-speedboat'), logoDark: 'https://example.com/logo.png' } }))
      .toEqual(["hurghada-speedboat: logoDark must already be on the network's Cloudinary: https://example.com/logo.png"]);
  });

  it('counts the trips its copy names', () => {
    for (const site of B11) {
      const copy = [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription, ...site.seo.keywords].join('\n');
      for (const count of statedTripCounts(copy)) expect(count).toBe(site.trips.length);
    }
  });
});

describe('batch B11: the five sites that already exist', () => {
  it('is five existing sites with their domains and designs, and creates no tenant', () => {
    expect(validateExisting(B11_EXISTING)).toEqual([]);
    expect(B11_EXISTING.sites.map((site) => [site.slug, site.domain, site.design])).toEqual([
      ['makadi-bay-safari', 'makadibaysafari.com', 'makadidunes'],
      ['cairo-tour-from-hurghada', 'cairotourfromhurghada.com', 'cairoday'],
      ['luxor-tour-from-hurghada', 'luxortourfromhurghada.com', 'luxorday'],
      ['hurghada-snorkeling', 'hurghadasnorkeling.com', 'hrgsnorkel'],
      ['cairo-night-cruise', 'caironightcruise.com', 'nightnile'],
    ]);
    // None of the five is one of the six new sites, and none shares a trip slug with any batch before it.
    const newSlugs = new Set(B11.map((site) => site.slug));
    for (const site of B11_EXISTING.sites) expect(newSlugs.has(site.slug)).toBe(false);
    const everySlug = [...EARLIER, ...B11].flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`));
    const ours = B11_EXISTING.sites.flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`));
    expect(ours.filter((slug) => everySlug.includes(slug))).toEqual([]);
    expect(new Set(ours).size).toBe(ours.length);
  });

  it('plans the client\'s real trips on each, and takes nothing else on', () => {
    expect(B11_EXISTING.sites.map((site) => [site.slug, site.trips.length, site.retire.length, site.keep.length])).toEqual([
      ['makadi-bay-safari', 3, 2, 0],
      ['cairo-tour-from-hurghada', 1, 17, 0],
      ['luxor-tour-from-hurghada', 2, 15, 0],
      ['hurghada-snorkeling', 11, 13, 0],
      ['cairo-night-cruise', 1, 4, 0],
    ]);
    // Nothing is kept, because not one listing on the five sites is the client's: every one is a demo record.
    expect(B11_EXISTING.sites.flatMap((site) => site.keep)).toEqual([]);
    expect(B11_EXISTING.sites.reduce((total, site) => total + site.trips.length, 0)).toBe(18);
    expect(B11_EXISTING.sites.reduce((total, site) => total + site.retire.length, 0)).toBe(51);
    // No retired slug is one this batch writes, so nothing is created and taken off in the same run.
    for (const site of B11_EXISTING.sites) {
      const wanted = site.trips.map((trip) => `${site.slugPrefix}${trip.path}`);
      expect(site.retire.filter((slug) => wanted.includes(slug))).toEqual([]);
    }
  });

  it('builds every trip of the five into a complete trip, from the dated snapshot', () => {
    let count = 0;
    for (const site of B11_EXISTING.sites) {
      for (const trip of site.trips) {
        expect(trip.price.provider).toBe('eeo');
        expect((SNAPSHOT.tours as Array<{ slug: string }>).map((tour) => tour.slug)).toContain(trip.price.source);
        expect(trip.price.category).toBe(site.category);
      }
      for (const document of built(site, site.trips)) { expectCompleteTrip(site, document); count += 1; }
    }
    expect(count).toBe(18);
    // Every price a guest sees is the published one, copied at build time.
    for (const site of B11_EXISTING.sites) for (const document of built(site, site.trips)) {
      const trip = site.trips.find((item) => `${site.slugPrefix}${item.path}` === document.slug)!;
      const tour = (SNAPSHOT.tours as Array<Record<string, any>>).find((item) => item.slug === trip.price.source)!;
      for (const option of document.pricingOptions as Array<Record<string, any>>) {
        expect(option.price).toBe((tour.options as Array<Record<string, any>>).find((item) => item.pricingKey === option.id)!.guestPrices.adult);
      }
    }
  });

  it('reuses the programme an earlier batch wrote, and writes its own only where none exists', () => {
    const reused: Array<[string, string, unknown]> = [
      ['cairo-night-cruise', 'museum-citadel-old-cairo-and-a-nile-dinner-cruise', PROGRAMMES_D.EGM_DINNER_CRUISE],
      ['hurghada-snorkeling', 'speedboat-snorkelling-trip', PROGRAMMES_A.HBT_SPEEDBOAT_SNORKEL],
      ['hurghada-snorkeling', 'six-islands-by-speedboat', PROGRAMMES_A.HBT_SIX_ISLANDS],
      ['hurghada-snorkeling', 'hula-hula-island-by-speedboat', PROGRAMMES_A.HBT_HULA_SPEEDBOAT],
      ['hurghada-snorkeling', 'semi-submarine-and-snorkelling', PROGRAMMES_A.HBT_SEMI_SUBMARINE],
    ];
    for (const [siteSlug, tripPath, programme] of reused) {
      expect(existingOf(siteSlug).trips.find((trip) => trip.path === tripPath)!.price).toBe(programme);
    }
    // The five written here are for records no earlier batch sells.
    const earlier = new Set<unknown>([...Object.values(PROGRAMMES_A), ...Object.values(PROGRAMMES_D)]);
    const own = B11_EXISTING.sites.flatMap((site) => site.trips).filter((trip) => !earlier.has(trip.price));
    expect([...new Set(own.map((trip) => trip.price.source))].sort()).toEqual([
      'from-hurghada-cairo-pyramids-grand-egyptian-museum-citadel-day-trip',
      'golden-sunset-quad-safari-in-makadi-bay',
      'makadi-bay-2-hour-quad-bike-adventure-across-desert-coast',
      'makadi-bay-luxury-desert-dinner-stargazing-experience',
      'makadi-bay-to-luxor-discover-the-valley-of-the-kings-king-tut-s-tomb',
    ]);
    expect(Object.keys(B11EP).sort()).toEqual([
      'CAIRO_FROM_HURGHADA', 'LUXOR_FROM_MAKADI_PRIVATE', 'LUXOR_FROM_MAKADI_SHARED',
      'MAKADI_DESERT_DINNER', 'MAKADI_SUNSET_QUAD', 'MAKADI_TWO_HOUR_QUAD',
    ]);
    // The two Luxor options leave at different hours, so each is its own trip rather than one with two departures.
    expect([B11EP.LUXOR_FROM_MAKADI_SHARED.departures, B11EP.LUXOR_FROM_MAKADI_PRIVATE.departures]).toEqual([['04:00'], ['05:00']]);
  });

  it('sells on Hurghada Snorkeling only the days whose own record names snorkelling in its title', () => {
    for (const trip of existingOf('hurghada-snorkeling').trips) {
      const tour = (SNAPSHOT.tours as Array<Record<string, any>>).find((item) => item.slug === trip.price.source)!;
      expect(`${tour.slug} ${tour.detail.title}`).toMatch(/snorkel/i);
    }
    // The six Hurghada boat records whose titles do not name snorkelling stay on batch B09's boat site.
    const sold = new Set(existingOf('hurghada-snorkeling').trips.map((trip) => trip.price.source));
    for (const key of ['HBT_DOLPHIN_MORNING', 'HBT_DOLPHIN_SPEEDBOAT', 'HBT_DOLPHIN_YACHT', 'HBT_CATAMARAN', 'HBT_THREE_ISLANDS', 'HBT_ORANGE_LUNCH'] as const) {
      expect(sold.has(PROGRAMMES_A[key].source)).toBe(false);
    }
  });

  it('plans the currency correction as the only tenant field it would ever write', () => {
    // All five carry EGP today and every record the client publishes is priced in USD; a price is never converted.
    for (const site of B11_EXISTING.sites) expect([site.currencyNow, site.currency]).toEqual(['EGP', 'USD']);
    // Nothing else about a tenant is named in the batch data: no name change, no domain, no theme, no contact.
    for (const site of B11_EXISTING.sites as ExistingSite[]) {
      expect(Object.keys(site).sort()).toEqual([
        'area', 'category', 'city', 'coordinates', 'currency', 'currencyNow', 'design', 'domain', 'foreignPlaces',
        'keep', 'listingPath', 'name', 'retire', 'slug', 'slugPrefix', 'trips',
      ]);
    }
    // The script writes a tenant's currency and nothing else; no other Tenant field is set anywhere in it.
    const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'seed-network-b11-existing.ts'), 'utf8');
    // The correction lands in the same run as the trips and before them, so a USD trip is never written to a site
    // still selling in EGP; the restore unwinds in the opposite order, so the trips go before the currency reverts.
    const apply = script.slice(script.indexOf('async function apply('), script.indexOf('async function restore('));
    expect(apply.indexOf('defaultCurrency: state.currencyChange.to')).toBeLessThan(apply.indexOf('for (const [index, trip] of site.trips.entries())'));
    expect(apply.indexOf('for (const [index, trip] of site.trips.entries())')).toBeLessThan(apply.indexOf('for (const entry of state.unlist)'));
    const restoreBody = script.slice(script.indexOf('async function restore('));
    expect(restoreBody.indexOf('deleteMany')).toBeLessThan(restoreBody.indexOf('defaultCurrency: journal.currency.from'));
    // It is written only behind its own fence, and only when the value read is still the value on the record.
    expect(apply).toMatch(/currencyFenced\(site\)/);
    expect(apply).toMatch(/Tenant\.updateOne\(\{ slug: site\.slug, defaultCurrency: state\.currencyChange\.from \}/);
    const tenantWrites = [...script.matchAll(/Tenant\.updateOne\([^)]*\$set: \{ ([a-zA-Z]+):/g)].map((match) => match[1]);
    expect([...new Set(tenantWrites)]).toEqual(['defaultCurrency']);
    expect(script).not.toMatch(/Tenant\.(?:create|insertMany|deleteOne|deleteMany|findOneAndDelete)/);
    expect(script).not.toMatch(/Attraction\.deleteOne\b|Attraction\.findOneAndDelete\b/);
    // Taking a listing off is reversible: a pull from tenantIds, or an archive that keeps the status it had.
    expect(script).toMatch(/\$pull: \{ tenantIds: state\.tenantId \}/);
    expect(script).toMatch(/statusBeforeArchive: entry\.status/);
  });

  it('never writes a logo, a dark logo or a favicon on any of the five', () => {
    // Four of the five carry the client's own marks and must keep them exactly (coordinator, 30 October). The
    // script writes no mark on any site, so none of the four can be touched by it.
    const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'seed-network-b11-existing.ts'), 'utf8');
    for (const field of ['logo', 'logoDark', 'favicon']) expect(script).not.toMatch(new RegExp(`\\b${field}\\b\\s*:`));
    // The batch data names no mark either, so there is nothing for a later edit to start writing.
    expect(JSON.stringify(B11_EXISTING)).not.toMatch(/"logo"|"logoDark"|"favicon"/);
    // `--logos` belongs to the six new sites only: the runner's logo book is checked against a NetworkBatch, and
    // the five that already exist are not in one. A file carrying all seven marks still satisfies b11a and b11b.
    const mark = (slug: string, kind: string) => `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/${kind}.png`;
    const sevenMarks = Object.fromEntries([...B11.map((site) => site.slug), 'makadi-bay-safari']
      .map((slug) => [slug, { logo: mark(slug, 'logo'), logoDark: mark(slug, 'logo-dark'), favicon: mark(slug, 'favicon') }]));
    for (const batch of GROUPS) expect(logoProblems(batch, sevenMarks)).toEqual([]);
    // Nothing in this batch consumes makadi-bay-safari's mark, so it stays an open item rather than a silent no-op.
    expect(GROUPS.flatMap((batch) => batch.sites).map((site) => site.slug)).not.toContain('makadi-bay-safari');
  });
});
