import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import {
  copiedFactProblems, eeoSourceProgramme, logoProblems, readLogoBook, statedTripCounts, tenantRecord, tripDocument,
  validateBatch, type NetworkBatch, type NetworkSite,
} from '../scripts/seed-network-sites';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';
import { B02 } from '../scripts/network-sites/b02';
import { B03A, PROGRAMMES as B03 } from '../scripts/network-sites/b03';
import { B03B, B03C, B03D, PROGRAMMES as B03R } from '../scripts/network-sites/b03-rest';
import { B08A, B08B, B08C, B08D, PROGRAMMES_C, PROGRAMMES_D } from '../scripts/network-sites/b08';
import { B09A, B09B, B09C, PROGRAMMES_A } from '../scripts/network-sites/b09';
import { B10A, B10B, B10C, B10D } from '../scripts/network-sites/b10';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';
import { isTenantBookingCreationClosed } from '../services/tenantBookingPolicy.service';

const EARLIER = [B01_SAFARI, B02, B03A, B03B, B03C, B03D, B08A, B08B, B08C, B08D, B09A, B09B, B09C]
  .flatMap((batch) => batch.sites);
const GROUPS: NetworkBatch[] = [B10A, B10B, B10C, B10D];
const B10 = GROUPS.flatMap((batch) => batch.sites);
const siteOf = (slug: string) => B10.find((site) => site.slug === slug)!;

/**
 * Each site's storefront design, from the network build queue. The backend keeps every tenant on `desertfox` and
 * the storefront picks the design by slug, so the pairing lives here, where the slugs are decided.
 */
const DESIGNS: Record<string, string> = {
  'great-sphinx-of-giza': 'greatsphinx',
  'pyramid-complex-giza': 'pyramidcomplex',
  'great-pyramid-of-cheops': 'cheops',
  'mit-rahina-museum': 'mitrahina',
  'sakkara-pyramids': 'sakkara',
  'pyramids-of-dahshur': 'dahshur',
  'pyramid-of-khafre': 'khafre',
  'pyramid-of-menkaure': 'menkaure',
  'statue-of-ramesses-ii': 'ramesses',
  'three-pools-dahab': 'threepools',
};

/** Every site's domain, as Fouad's list gives it. */
const DOMAINS: Record<string, string> = {
  'great-sphinx-of-giza': 'greatsphinxofgiza.com',
  'pyramid-complex-giza': 'pyramidcomplexgiza.com',
  'great-pyramid-of-cheops': 'greatpyramidofcheops.com',
  'mit-rahina-museum': 'mitrahinamuseum.com',
  'sakkara-pyramids': 'sakkarapyramids.com',
  'pyramids-of-dahshur': 'pyramidsofdahshur.com',
  'pyramid-of-khafre': 'pyramidofkhafre.com',
  'pyramid-of-menkaure': 'pyramidofmenkaure.com',
  'statue-of-ramesses-ii': 'statueoframessesii.com',
  'three-pools-dahab': 'threepoolsdahab.com',
};

/** A line that holds only for an option the trip does not sell, or for an extra it cannot offer. */
const CONDITIONAL = /\(if |if selected|if add-on|if (?:the )?option|add on selection|5h Tour:|8h Tour:|depending on the option/i;
/**
 * The one line on the network that reads as a condition and is kept: the shopping stops batch B03's Civilization
 * Museum trip offers on request, which cost nothing and are not an option or an extra the trip cannot sell.
 */
const SHOPPING_STOPS = 'Visits: Papyrus Gallery, Oils Factory, Bazaar, Cotton Store, Carpet School (upon request)';

const built = (site: NetworkSite) => site.trips
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

/** Every rule a B10 trip keeps, whichever of the ten sites sells it. */
function expectCompleteTrip(site: NetworkSite, document: Record<string, any>): void {
  expect(copiedFactProblems(site, document)).toEqual([]);
  expect(new Attraction(document).validateSync()?.errors ?? {}).toEqual({});
  expect([document.currency, document.rating, document.reviewCount, document.instantConfirmation, document.hasHotelPickup])
    .toEqual(['USD', 0, 0, false, true]);
  expect([...document.inclusions, ...document.exclusions].filter((line: string) => CONDITIONAL.test(line))).toEqual([]);
  const optional = [...document.inclusions, ...document.exclusions, ...document.needToKnow].filter((line: string) => /upon request/i.test(line));
  expect(optional.filter((line: string) => line !== SHOPPING_STOPS)).toEqual([]);
  // Where the line is kept, the trip's own words say the stops can be added and can be left out.
  if (optional.length) expect(document.description).toMatch(/can be added on request/);
  expect(guestCopy(document)).not.toMatch(/authentic|\bexpert\b|breathtaking|spectacular|\bbest\b|unforgettable|world.s largest|\bfamous\b|Pickup location|drop-off locations|magical|luxury VIP/i);
  // A guest reads the trip, not our notes on it: no line speaks of the record it was written from.
  expect(guestCopy(document)).not.toMatch(/\bsnapshot\b|\bbatch\b|\bprogramme record\b/i);
  for (const field of ['inclusions', 'exclusions', 'needToKnow', 'whatToBring'] as const) {
    const lines = document[field] as string[];
    expect(new Set(lines).size).toBe(lines.length);
  }
  expect(document.itinerary.length).toBeGreaterThan(2);
  // Hours, a range of hours, or the record's own whole days for the trips that last a day or more.
  expect(String(document.duration)).toMatch(/^\d+(\.\d+)?(( ?- ?| to )\d+(\.\d+)?)? (hours?|days?)$/);
  for (const option of document.pricingOptions as Array<Record<string, unknown>>) {
    expect(Number(option.price)).toBeGreaterThan(0);
    if (option.childPrice !== undefined) expect(Number(option.childPrice)).toBeLessThan(Number(option.price));
  }
  expect(document.availability.type).toBe(document.entryWindows.length ? 'time-slots' : 'date-only');
  const childPriced = (document.pricingOptions as Array<Record<string, unknown>>).some((option) => option.childPrice !== undefined);
  expect((document.needToKnow as string[]).join('\n')).toMatch(childPriced ? /have their own price/ : /pay the same price as adults/);
}

describe('batch B10: the ten monument sites', () => {
  it('is four valid groups of the ten sites, none of them built before', () => {
    expect(GROUPS.map((batch) => batch.id)).toEqual(['b10a', 'b10b', 'b10c', 'b10d']);
    for (const batch of GROUPS) expect(validateBatch(batch)).toEqual([]);
    expect(B10.map((site) => site.slug)).toEqual(Object.keys(DESIGNS));
    expect(B10.map((site) => site.name)).toEqual([
      'Great Sphinx of Giza', 'Pyramid Complex Giza', 'Great Pyramid of Cheops', 'Mit Rahina Museum',
      'Sakkara Pyramids', 'Pyramids of Dahshur', 'Pyramid of Khafre', 'Pyramid of Menkaure',
      'Statue of Ramesses II', 'Three Pools Dahab',
    ]);
    for (const site of B10) {
      expect(site.domain).toBe(DOMAINS[site.slug]);
      expect(DESIGNS[site.slug]).toMatch(/^[a-z]+$/);
      expect([site.currency, site.listingPath]).toEqual(['USD', '/trips']);
      // The tenant record keeps every network site on the shared design; the storefront picks the brand by slug.
      expect(tenantRecord(site).designMode).toBe('desertfox');
    }
    const before = new Set(EARLIER.flatMap((site) => [site.slug, site.domain, site.slugPrefix]));
    for (const site of B10) {
      expect(before.has(site.slug) || before.has(site.domain) || before.has(site.slugPrefix)).toBe(false);
    }
    // No site across every batch opens on the same photo, shares a title or a trip slug.
    const every = [...EARLIER, ...B10];
    const firstHeroes = every.map((site) => site.heroImages[0]);
    expect(new Set(firstHeroes).size).toBe(firstHeroes.length);
    const titles = every.map((site) => site.seo.metaTitle.trim().toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    const slugs = every.flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('sells only the trips whose record names that site\'s own place', () => {
    expect(B10.map((site) => [site.slug, site.trips.length])).toEqual([
      ['great-sphinx-of-giza', 17],
      ['pyramid-complex-giza', 17],
      ['great-pyramid-of-cheops', 13],
      ['mit-rahina-museum', 5],
      ['sakkara-pyramids', 5],
      ['pyramids-of-dahshur', 3],
      ['pyramid-of-khafre', 6],
      ['pyramid-of-menkaure', 6],
      ['statue-of-ramesses-ii', 6],
      ['three-pools-dahab', 1],
    ]);
    expect(B10.reduce((total, site) => total + site.trips.length, 0)).toBe(79);
    // What each record the batch sells says about itself, kept beside this test: the client's published title,
    // description, highlights, inclusions, options and stops. The snapshot keeps only what the seed copies, and
    // the highlights are where several records name a single pyramid, so the evidence for a site's catalogue
    // lives here. Every record is in the snapshot too, and the client's list is unchanged since 27 October.
    const RECORDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'network-b10-record-names.json'), 'utf8')) as Record<string, Record<string, unknown>>;
    expect(Object.keys(RECORDS).sort())
      .toEqual([...new Set(B10.flatMap((site) => site.trips).map((trip) => trip.price.source))].sort());
    for (const [slug, record] of Object.entries(RECORDS)) {
      const tour = (SNAPSHOT.tours as Array<Record<string, any>>).find((item) => item.slug === slug)!;
      expect(tour.detail.title).toBe(record.title);
      expect((tour.options as Array<{ title: string }>).map((option) => option.title)).toEqual(record.options);
    }
    const named = (slug: string, pattern: RegExp) => {
      for (const trip of siteOf(slug).trips) expect(JSON.stringify(RECORDS[trip.price.source])).toMatch(pattern);
    };
    named('pyramid-of-khafre', /khafre|chephren/i);
    named('pyramid-of-menkaure', /menkaure|mykerin/i);
    named('great-pyramid-of-cheops', /great pyramid|khufu|cheops/i);
    named('great-sphinx-of-giza', /sphinx/i);
    named('pyramids-of-dahshur', /dahshur|bent pyramid|red pyramid/i);
    named('mit-rahina-museum', /memphis/i);
    named('sakkara-pyramids', /sakkara|saqqara/i);
    named('statue-of-ramesses-ii', /rams[ei]s/i);
  });

  it('builds every trip from the dated snapshot, never from a price typed here', () => {
    for (const site of B10) for (const trip of site.trips) {
      expect(trip.price.provider).toBe('eeo');
      expect(trip.price.tenant).toBe('egypt-excursions-online');
      expect((SNAPSHOT.tours as Array<{ slug: string }>).map((tour) => tour.slug)).toContain(trip.price.source);
    }
    // Nothing in the batch file is a price, a child rate or a departure time of its own.
    const whole = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'network-sites', 'b10.ts'), 'utf8');
    // The header's held-back notes quote the client's published prices; the rule is about the data below them.
    const source = whole.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(source).not.toMatch(/\bprice:\s*[\d.]/);
    expect(source).not.toMatch(/\bchildPrice\b|\bpriceFrom\b|\bcurrency:\s*'(?!USD)/);
    expect(source).not.toMatch(/\$\d/);
    // Every price a guest sees is the published one, copied at build time.
    for (const site of B10) for (const document of built(site)) {
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
    for (const site of B10) for (const document of built(site)) { expectCompleteTrip(site, document); count += 1; }
    expect(count).toBe(79);
  });

  it('reuses the programme an earlier batch already wrote for the same record', () => {
    const reused: Array<[string, unknown]> = [
      ['private-half-day-pyramids-and-sphinx', B03.GPP_HALF_DAY],
      ['sunrise-camel-ride-and-breakfast', B03R.PCT_SHARED_SUNRISE],
      ['private-sunrise-camel-ride-and-breakfast', B03R.PCT_PRIVATE_SUNRISE],
      ['private-day-with-a-camel-ride-and-lunch', B03R.PCT_CAMEL_LUNCH],
      ['pyramids-and-an-hour-on-the-nile', B03.GPP_FELUCCA],
      ['pyramids-sphinx-and-the-grand-egyptian-museum', B03.PGE_GEM],
      ['pyramids-egyptian-museum-and-khan-el-khalili', B03.PGE_BAZAAR],
      ['pyramids-civilization-museum-and-old-cairo', B03.PGE_NMEC],
      ['private-day-pyramids-museum-and-bazaar', PROGRAMMES_D.EGM_PYRAMIDS],
      ['sakkara-memphis-and-dahshur-shared', B03.MAS_SHARED],
      ['private-sakkara-memphis-and-dahshur', B03.MAS_PRIVATE],
      ['giza-pyramids-sakkara-and-memphis', B03.MAS_WITH_GIZA],
      ['private-day-with-lunch-and-a-nile-sail', B03.MAS_NILE_SAIL],
      ['cairo-day-trip-from-sharm-el-sheikh', PROGRAMMES_A.GEM_FROM_SHARM],
      ['two-days-in-cairo-from-sharm-el-sheikh', PROGRAMMES_A.GEM_TWO_DAYS],
      ['grand-egyptian-museum-visit', PROGRAMMES_A.GEM_VISIT],
      ['three-pools-camel-ride-and-red-canyon-day', PROGRAMMES_C.CRD_THREE_POOLS],
    ];
    for (const [tripPath, programme] of reused) {
      const trips = B10.flatMap((site) => site.trips).filter((trip) => trip.path === tripPath);
      expect(trips.length).toBeGreaterThan(0);
      // The same object, so the network says the same thing about the same trip wherever it is sold.
      for (const trip of trips) expect(trip.price).toBe(programme);
    }
    // The five written here are the only ones that are not an earlier batch's.
    const earlierSpecs = new Set<unknown>([
      ...Object.values(B03), ...Object.values(B03R), ...Object.values(PROGRAMMES_C), ...Object.values(PROGRAMMES_D),
      ...Object.values(PROGRAMMES_A),
    ]);
    const ownSources = new Set(B10.flatMap((site) => site.trips)
      .filter((trip) => !earlierSpecs.has(trip.price)).map((trip) => trip.price.source));
    expect([...ownSources].sort()).toEqual([
      'cairo-private-day-trip-by-car-from-sharm-el-sheikh',
      'full-day-cairo-giza-pyramids-egyptian-museum',
      'giza-pyramids-sphinx-custom-cairo-sightseeing-tour',
      'secrets-of-cairo-2-day-private-sightseeing-tour',
    ]);
  });

  it('holds each held-back record to the reason the batch gives', () => {
    const tours = SNAPSHOT.tours as unknown as Array<{
      slug: string;
      detail: { duration?: string; whatsIncluded?: string[]; includes?: string[]; whatsNotIncluded?: string[] };
      options: Array<{ pricingKey: string; title: string; description?: string; timeSlots: Array<{ time: string }> }>;
    }>;
    const tour = (slug: string) => tours.find((item) => item.slug === slug);
    const sold = new Set(B10.flatMap((site) => site.trips).map((trip) => trip.price.source));

    // The long packages and the two that start in Luxor are not in the snapshot at all, so none can be sold.
    for (const slug of [
      'cairo-3-day-tour-pyramids-museums-islamic-cairo-nile-cruise',
      'cairo-4-day-highlights-pyramids-ancient-sites-old-cairo',
      'cairo-nile-cruise-6-day-egypt-highlights-abu-simbel-hot-air-balloon',
      'egypt-in-9-days-cairo-alexandria-nile-cruise-luxor-abu-simbel',
      'luxor-day-tour-to-cairo-by-flight-with-pyramids-egyptian-museum',
      'overnight-cairo-day-tour-from-luxor-by-vip-train',
    ]) {
      expect(tour(slug)).toBeUndefined();
      expect(sold.has(slug)).toBe(false);
    }

    // The two museum-choice records sell their hotel transfer as an add-on, so neither includes the pickup
    // every network trip promises; the seed refuses them.
    for (const [slug, key] of [
      ['cairo-museum-tour-choose-your-museum-explore-egypt-s-history', 'half-day-guided-tour-inside-memphis-museum-0cd1ae447124'],
      ['cairo-private-guided-tour-to-your-choice-of-top-attractions', 'saqqara-half-day-guided-tour-of-the-ancient-m-2544df7da254'],
    ] as const) {
      const record = tour(slug)!;
      expect(sold.has(slug)).toBe(false);
      expect((record.detail.whatsNotIncluded || []).join('\n')).toMatch(/hotel (?:transfers|pick-up)/i);
      const site = { ...siteOf('sakkara-pyramids'), slugPrefix: 'tmp-' } as NetworkSite;
      const spec = { provider: 'eeo' as const, tenant: 'egypt-excursions-online', source: slug, category: 'day-trips', options: [key], addons: [], departures: ['09:00'] };
      expect(() => tripDocument(site, { ...site.trips[0], path: 'held-back', price: spec }, eeoSourceProgramme(spec), 0, new Types.ObjectId()))
        .toThrow(/does not include hotel pickup/);
    }

    // The second option of the two-day stay names Memphis but offers a choice of sites that leaves it out.
    const twoDay = tour('sharm-el-sheikh-2-day-cairo-pyramids-gem-luxury-stay')!;
    const dayTwo = twoDay.options.find((option) => option.pricingKey === 'day-1-pyramids-gem-day-2-memphis-saqqara-old--cf2e4f7df460')!;
    expect(dayTwo.title).toMatch(/Memphis/);
    expect(dayTwo.description).not.toMatch(/Memphis/);
    expect(B10.flatMap((site) => site.trips).filter((trip) => trip.price.options.includes(dayTwo.pricingKey))).toEqual([]);

    // The custom-day record's other two options: one leaves at another hour and never reaches the pyramids,
    // the other adds the Citadel, lunch and a felucca its own schedule does not show.
    const custom = tour('giza-pyramids-sphinx-custom-cairo-sightseeing-tour')!;
    const museumOnly = custom.options.find((option) => option.pricingKey === 'egyptian-museum-old-cairo-khan-khalili-shared-63856fdfa130')!;
    expect(museumOnly.timeSlots.map((slot) => slot.time)).toEqual(['11:00']);
    expect(museumOnly.title).not.toMatch(/pyramid/i);
    const vip = custom.options.find((option) => option.pricingKey === 'vip-private-pyramid-museum-citadel-old-cairo--be85505e4e07')!;
    expect(vip.title).toMatch(/Citadel/);
    const customTrip = B10.flatMap((site) => site.trips).find((trip) => trip.price.source === custom.slug)!;
    expect(customTrip.price.options).toEqual([
      'pyramids-egyptian-museum-old-cairo-shared-wit-d7d116d74da4',
      'pyramids-egyptian-museum-old-cairo-private-wi-b9e6510bf37e',
    ]);

    // The day south of Giza makes the plateau an optional add-on, so no Giza site sells it.
    for (const slug of ['great-sphinx-of-giza', 'pyramid-complex-giza', 'great-pyramid-of-cheops']) {
      expect(siteOf(slug).trips.map((trip) => trip.price.source)).not.toContain('sakkara-memphis-dahshur-giza-pyramids-day-tour');
    }
    // The coach photo the client publishes on the private Sharm day carries another company's name.
    const sharmTrip = B10.flatMap((site) => site.trips)
      .find((trip) => trip.price.source === 'cairo-private-day-trip-by-car-from-sharm-el-sheikh')!;
    expect(sharmTrip.images.every((url) => !url.includes('mglbr5nrb1keq9qqfnfg'))).toBe(true);
  });

  it('starts each Sharm El Sheikh trip from Sharm El Sheikh and the rest from Cairo or Giza', () => {
    for (const site of B10.filter((item) => item.slug !== 'three-pools-dahab')) {
      expect([site.city, site.pickupDestination, site.area]).toEqual(['Cairo', 'cairo', 'Cairo or Giza']);
      for (const trip of site.trips) {
        const fromSharm = /sharm/i.test(trip.price.source);
        expect(Boolean(trip.where)).toBe(fromSharm);
        if (fromSharm) expect(trip.where).toEqual({ city: 'Sharm El Sheikh', area: 'Sharm El Sheikh', coordinates: { lat: 27.7369, lng: 34.3394 } });
      }
      for (const document of built(site)) {
        const where = /sharm/i.test(String(document.slug)) ? 'Sharm El Sheikh' : 'Cairo or Giza';
        expect(document.meetingPoint.address).toBe(`Your hotel in ${where}`);
      }
    }
    const pools = siteOf('three-pools-dahab');
    expect([pools.city, pools.pickupDestination, pools.area]).toEqual(['Sharm El Sheikh', 'sharm-el-sheikh', 'Sharm El Sheikh']);
    expect(pools.trips[0].where).toBeUndefined();
  });

  it('takes no booking until each domain is connected and the owner opens the site', () => {
    for (const site of B10) expect(isTenantBookingCreationClosed({ slug: site.slug })).toBe(true);
    for (const site of B10) {
      const record = tenantRecord(site);
      expect(record.customDomain).toBeUndefined();
      expect(record.domainMigrated).toBe(false);
      expect(record.domain).toBe(`${site.slug}.foxesnetwork.com`);
      expect((record.paymentSettings as { enabledGateways: string[] }).enabledGateways).toEqual(['pay-later']);
    }
  });

  it('refuses to apply until every site has its approved logo, dark logo and favicon', () => {
    for (const batch of GROUPS) expect(logoProblems(batch, null)).toEqual(['No --logos=<path> given.']);
    const good = (slug: string) => ({
      logo: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/logo.png`,
      logoDark: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/logo-dark.png`,
      favicon: `https://res.cloudinary.com/dm3sxllch/image/upload/attractions-network/tenant-logos/${slug}/favicon.png`,
    });
    const complete = Object.fromEntries(B10.map((site) => [site.slug, good(site.slug)]));
    for (const batch of GROUPS) expect(logoProblems(batch, complete)).toEqual([]);
    // A missing site, a missing field and a mark that is not on the network's Cloudinary are each refused.
    const { 'pyramid-of-khafre': _dropped, ...withoutKhafre } = complete;
    expect(logoProblems(B10C, withoutKhafre)).toEqual(['pyramid-of-khafre: no logo entry.']);
    expect(logoProblems(B10D, { 'three-pools-dahab': { ...good('three-pools-dahab'), favicon: '' } }))
      .toEqual(['three-pools-dahab: favicon is missing.']);
    expect(logoProblems(B10D, { 'three-pools-dahab': { ...good('three-pools-dahab'), logoDark: 'https://example.com/logo.png' } }))
      .toEqual(["three-pools-dahab: logoDark must already be on the network's Cloudinary: https://example.com/logo.png"]);
    // The approved marks reach the tenant record; without them the stand-in monogram stays, which --apply refuses.
    const site = siteOf('three-pools-dahab');
    expect(tenantRecord(site, good(site.slug)).favicon).toBe(good(site.slug).favicon);
    expect(tenantRecord(site).logoDark).toBe(site.logo);
  });

  it('reads the logo book from a file and refuses anything that is not an object of slugs', () => {
    const file = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'b10-logos-')), 'logos.json');
    expect(readLogoBook(null)).toBeNull();
    fs.writeFileSync(file, JSON.stringify({ 'three-pools-dahab': { logo: 'a', logoDark: 'b', favicon: 'c' } }));
    expect(readLogoBook(file)).toEqual({ 'three-pools-dahab': { logo: 'a', logoDark: 'b', favicon: 'c' } });
    fs.writeFileSync(file, JSON.stringify([{ slug: 'three-pools-dahab' }]));
    expect(() => readLogoBook(file)).toThrow('expected an object of site slugs');
  });

  it('counts the trips its copy names', () => {
    for (const site of B10) {
      const copy = [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription, ...site.seo.keywords].join('\n');
      for (const count of statedTripCounts(copy)) expect(count).toBe(site.trips.length);
    }
  });
});
