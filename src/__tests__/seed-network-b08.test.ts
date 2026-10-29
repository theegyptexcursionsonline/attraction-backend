import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { copiedFactProblems, eeoSourceProgramme, statedTripCounts, tripDocument, validateBatch } from '../scripts/seed-network-sites';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';
import { B02 } from '../scripts/network-sites/b02';
import { B03A } from '../scripts/network-sites/b03';
import { B03B, B03C, B03D } from '../scripts/network-sites/b03-rest';
import { B08A, B08B, B08C, B08D } from '../scripts/network-sites/b08';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';

const siteOf = (slug: string) => B08A.sites.find((site) => site.slug === slug)!;
const EARLIER = [...B01_SAFARI.sites, ...B02.sites, ...B03A.sites, ...B03B.sites, ...B03C.sites, ...B03D.sites];
const B08 = [...B08A.sites, ...B08B.sites, ...B08C.sites, ...B08D.sites];

/** Names from the client's own record that a network site never shows: its boats and its branded goods. */
const CLIENT_NAMES = /Pirates|Nile Crystal|Scarf Arafat|\bFTS\b/i;
/** A line that holds only for an option the trip does not sell, or for an extra it cannot offer. */
const CONDITIONAL = /\(if |if selected|if add-on|if (?:the )?option|add on selection|upon request|VIP|Shared Tour:|Private Tour:/i;

/**
 * Everything a guest reads on the page. An option's id stays the client's own pricing key, which binds the sale
 * to its published record (`marsa-alam-pirates-premium-boat-…`), so the key is checked against the record, not
 * against the words the network shows.
 */
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

const built = (site: (typeof B08)[number]) =>
  site.trips.map((trip, index) => tripDocument(site, trip, eeoSourceProgramme(trip.price), index, new Types.ObjectId()) as Record<string, any>);

/** The departures the client publishes for one booking option, read straight from the dated snapshot. */
const publishedTimes = (slug: string, pricingKey: string): string[] => {
  const tours = SNAPSHOT.tours as unknown as Array<{ slug: string; options: Array<{ pricingKey: string; timeSlots?: Array<{ time: string }> }> }>;
  const tour = tours.find((item) => item.slug === slug)!;
  return (tour.options.find((option) => option.pricingKey === pricingKey)?.timeSlots || []).map((slot) => slot.time);
};

/** Every rule a B08 trip keeps, whichever group sells it. */
function expectCompleteTrip(site: (typeof B08)[number], document: Record<string, any>): void {
  expect(copiedFactProblems(site, document)).toEqual([]);
  expect(new Attraction(document).validateSync()?.errors ?? {}).toEqual({});
  expect([document.currency, document.rating, document.reviewCount, document.instantConfirmation, document.hasHotelPickup]).toEqual(['USD', 0, 0, false, true]);
  expect(document.inclusions as string[]).toEqual(expect.arrayContaining([expect.stringMatching(/[Hh]otel pick-?up|[Pp]ickup and drop-off at your hotel/)]));
  expect([...document.inclusions, ...document.exclusions].filter((line: string) => CONDITIONAL.test(line))).toEqual([]);
  expect(guestCopy(document)).not.toMatch(/authentic|\bexpert\b|breathtaking|spectacular|\bbest\b|unforgettable|Pickup location|drop-off locations/i);
  expect(guestCopy(document)).not.toMatch(CLIENT_NAMES);
  // No wildlife is promised: a guest is told what to look for, never what it will see.
  expect(guestCopy(document)).not.toMatch(/swim with|you will see (?:turtles|dugongs|dolphins)/i);
  for (const field of ['inclusions', 'exclusions', 'needToKnow', 'whatToBring'] as const) {
    const lines = document[field] as string[];
    expect(new Set(lines).size).toBe(lines.length);
  }
  expect(document.itinerary.length).toBeGreaterThan(2);
  expect(String(document.duration)).toMatch(/\d+(\.\d+)?\s*(to \d+(\.\d+)? )?hours?\b/);
  // A child price below the adult one is sold with its terms; where the record prices children as adults
  // there is no child price at all, and the trip says so rather than inventing one.
  for (const option of document.pricingOptions as Array<Record<string, unknown>>) {
    expect(option.pricingModel).toBe('per-person');
    expect(Number(option.price)).toBeGreaterThan(0);
    if (option.childPrice !== undefined) expect(Number(option.childPrice)).toBeLessThan(Number(option.price));
  }
  const childPriced = (document.pricingOptions as Array<Record<string, unknown>>).some((option) => option.childPrice !== undefined);
  expect((document.needToKnow as string[]).join('\n')).toMatch(childPriced ? /Children have their own price/ : /pay the same price as adults/);
  // A trip that names no departure is sold by the day, and says so.
  expect(document.availability.type).toBe(document.entryWindows.length ? 'time-slots' : 'date-only');
  if (!document.entryWindows.length) expect((document.needToKnow as string[]).join('\n')).toMatch(/sold by the day/);
}

describe('batch B08 group 1: Nabq National Park, Khan el Khalili Market and Moez Street', () => {
  it('is a valid batch: claim-free copy, places each site serves, network-hosted photos', () => {
    expect(validateBatch(B08A)).toEqual([]);
  });

  it('builds three sites, none of them a site already built, with Nabq (the last HIGH domain) first', () => {
    expect(B08A.id).toBe('b08a');
    expect(B08A.sites.map((site) => site.domain)).toEqual(['nabqnationalpark.com', 'khanelkhalilimarket.com', 'moezstreet.com']);
    const built = new Set(EARLIER.flatMap((site) => [site.slug, site.domain, site.slugPrefix]));
    for (const site of B08A.sites) {
      expect(built.has(site.slug) || built.has(site.domain) || built.has(site.slugPrefix)).toBe(false);
      expect(site.currency).toBe('USD');
      expect(site.listingPath).toBe('/trips');
    }
    expect([siteOf('nabq-national-park').city, siteOf('nabq-national-park').pickupDestination]).toEqual(['Sharm El Sheikh', 'sharm-el-sheikh']);
    for (const slug of ['khan-el-khalili-market', 'moez-street']) {
      const site = siteOf(slug);
      expect([site.city, site.pickupDestination, site.area]).toEqual(['Cairo', 'cairo', 'Cairo or Giza']);
    }
    // No site across every batch opens on the same photo, shares a title or a trip slug.
    const everySite = [...EARLIER, ...B08A.sites];
    const firstHeroes = everySite.map((site) => site.heroImages[0]);
    expect(new Set(firstHeroes).size).toBe(firstHeroes.length);
    const titles = everySite.map((site) => site.seo.metaTitle.trim().toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    const tripSlugs = everySite.flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`));
    expect(new Set(tripSlugs).size).toBe(tripSlugs.length);
  });

  it('adds its programmes to the end of the snapshot and leaves the forty-four of B02 and B03 where they were', () => {
    const slugs = SNAPSHOT.tours.map((tour) => tour.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs[0]).toBe('sharm-ras-mohamed-white-island-snorkeling-adventure-with-lunch');
    expect(slugs[43]).toBe('sharm-el-sheikh-colored-canyon-blue-hole-dahab-jeep-adventure');
    // B08's own entries: the twenty-nine after B02's and B03's; the network queue's batch (B09) follows them.
    const added = SNAPSHOT.tours.slice(44, 73);
    expect(SNAPSHOT.tours.slice(73).every((tour) => /^2026-10-28T/.test(String((tour as { readAt?: string }).readAt)))).toBe(true);
    // B08 read its programmes on its own day, each with the time its record was read.
    for (const tour of added) expect(tour.readAt).toMatch(/^2026-10-27T/);
    const sold = new Set(B08.flatMap((site) => site.trips.map((trip) => trip.price.source)));
    for (const source of sold) expect(slugs).toContain(source);
    // Nothing B08 added is left unsold.
    expect(added.map((tour) => tour.slug).filter((slug) => !sold.has(slug))).toEqual([]);
  });

  it('builds every trip from the dated snapshot into a complete trip', () => {
    const tenantId = new Types.ObjectId();
    let built = 0;
    for (const site of B08A.sites) {
      site.trips.forEach((trip, index) => {
        expect(trip.price.provider).toBe('eeo');
        const document = tripDocument(site, trip, eeoSourceProgramme(trip.price), index, tenantId) as Record<string, any>;
        built += 1;
        expect(copiedFactProblems(site, document)).toEqual([]);
        expect(new Attraction(document).validateSync()?.errors ?? {}).toEqual({});
        expect(document.currency).toBe('USD');
        expect(document.rating).toBe(0);
        expect(document.reviewCount).toBe(0);
        expect(document.instantConfirmation).toBe(false);
        expect(document.hasHotelPickup).toBe(true);
        expect(document.inclusions as string[]).toEqual(expect.arrayContaining([expect.stringMatching(/[Hh]otel pick-?up|[Pp]ickup and drop-off at your hotel/)]));
        // No line that holds only "if the option is selected", and no word the network never shows.
        expect((document.inclusions as string[]).filter((line) => /\(if |if selected|if add-on|if option/i.test(line))).toEqual([]);
        expect(JSON.stringify(document)).not.toMatch(/authentic|expert|264J\+|Pickup location|drop-off locations/i);
        for (const field of ['inclusions', 'exclusions', 'needToKnow', 'whatToBring'] as const) {
          const lines = document[field] as string[];
          expect(new Set(lines).size).toBe(lines.length);
        }
        for (const option of document.pricingOptions as Array<Record<string, unknown>>) {
          expect(option.pricingModel).toBe('per-person');
          expect(Number(option.price)).toBeGreaterThan(0);
          // Every option sold here publishes a child price below the adult one.
          expect(Number(option.childPrice)).toBeGreaterThan(0);
          expect(Number(option.childPrice)).toBeLessThan(Number(option.price));
        }
        // Durations carry their unit; the record's own "1H" never reaches a page.
        expect(String(document.duration)).toMatch(/\d+(\.\d+)?\s*(hour|hours)\b/);
        expect(document.entryWindows.length).toBeGreaterThan(0);
        expect(document.itinerary.length).toBeGreaterThan(2);
        // The pickup-area add-ons the client publishes are bound to no booking option, so none is sold.
        expect(document.addons).toEqual([]);
      });
    }
    expect(built).toBe(10);
  });

  it('sells Nabq as two rides of one programme, told apart by the length each sells', () => {
    const nabq = siteOf('nabq-national-park');
    expect(nabq.trips.map((trip) => [trip.price.source, trip.price.options.length, trip.price.duration])).toEqual([
      ['sharm-el-sheikh-sinai-desert-red-sea-horseback-riding', 1, '1 hour'],
      ['sharm-el-sheikh-sinai-desert-red-sea-horseback-riding', 1, '2 hours'],
    ]);
    const [one, two] = nabq.trips.map((trip, index) => tripDocument(nabq, trip, eeoSourceProgramme(trip.price), index, new Types.ObjectId()) as Record<string, any>);
    expect([one.priceFrom, two.priceFrom]).toEqual([45, 80]);
    // The ride enters the park: its published price includes the park fee.
    for (const document of [one, two]) expect(document.inclusions).toContain('Nabq National Park fee');
    // Each start the page states is a start the ride publishes.
    expect(one.entryWindows.map((window: { startTime: string }) => window.startTime).sort()).toEqual(['10:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
    expect(two.entryWindows.map((window: { startTime: string }) => window.startTime).sort()).toEqual(['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
  });

  it('sells no programme twice in the group, and nothing an earlier batch already sells', () => {
    const keys = B08A.sites.flatMap((site) => site.trips.map((trip) => `${trip.price.source}#${trip.price.options.join('+')}`));
    expect(new Set(keys).size).toBe(keys.length);
    const earlier = new Set(EARLIER.flatMap((site) => site.trips.map((trip) => trip.price.source)));
    expect(B08A.sites.flatMap((site) => site.trips.map((trip) => trip.price.source)).filter((source) => earlier.has(source))).toEqual([]);
  });

  it('names the place each site is named after in every trip it sells', () => {
    for (const [slug, names] of [
      ['nabq-national-park', /Nabq/],
      ['khan-el-khalili-market', /Khan el Khalili/],
      ['moez-street', /Muizz|Mu’izz|Moez/],
    ] as const) {
      for (const trip of siteOf(slug).trips) {
        expect([trip.title, trip.short, trip.description, ...trip.highlights].join('\n')).toMatch(names);
      }
    }
  });

  it('counts only the trips each site sells, and blocks the places it does not serve', () => {
    for (const site of B08A.sites) {
      for (const count of statedTripCounts([site.tagline, site.description].join('\n'))) expect(count).toBe(site.trips.length);
    }
    const nabq = siteOf('nabq-national-park');
    for (const place of ['Hurghada', 'Dahab', 'Cairo', 'Giza', 'Luxor', 'Saint Catherine']) expect(nabq.foreignPlaces.test(`A day trip to ${place}.`)).toBe(true);
    expect(nabq.foreignPlaces.test('A ride in Nabq from Sharm El Sheikh.')).toBe(false);
    for (const slug of ['khan-el-khalili-market', 'moez-street']) {
      const site = siteOf(slug);
      for (const place of ['Sharm El Sheikh', 'Hurghada', 'the Giza pyramids', 'the Citadel', 'Coptic Cairo', 'Saqqara']) expect(site.foreignPlaces.test(`A stop at ${place}.`)).toBe(true);
      for (const place of ['Khan el Khalili', 'Al-Muizz Street', 'Al-Azhar Mosque', 'Cairo or Giza']) expect(site.foreignPlaces.test(`A stop at ${place}.`)).toBe(false);
    }
  });

  it('takes fewer than three home photos only where the trips publish fewer, and says so', () => {
    for (const site of B08A.sites) {
      const photos = new Set(site.trips.flatMap((trip) => trip.images));
      if (site.photoShortfall) expect(photos.size).toBeLessThan(3);
      else expect(site.heroImages).toHaveLength(3);
      for (const hero of site.heroImages) expect(photos.has(hero)).toBe(true);
      for (const trip of site.trips) expect(trip.imageAlts.filter((alt) => alt.trim().length > 20)).toHaveLength(trip.images.length);
    }
    expect(B08A.sites.filter((site) => site.photoShortfall).map((site) => site.slug)).toEqual(['nabq-national-park']);
  });
});

describe('batch B08 group 2: Coptic Museum Cairo, Mount Sinai and Dahab Blue Hole', () => {
  const site = (slug: string) => B08B.sites.find((item) => item.slug === slug)!;

  it('is a valid batch of three new sites', () => {
    expect(validateBatch(B08B)).toEqual([]);
    expect(B08B.id).toBe('b08b');
    expect(B08B.sites.map((item) => item.domain)).toEqual(['copticmuseumcairo.com', 'mountsinaieg.com', 'dahabbluehole.com']);
    const built = new Set([...EARLIER, ...B08A.sites].flatMap((item) => [item.slug, item.domain, item.slugPrefix]));
    for (const item of B08B.sites) {
      expect(built.has(item.slug) || built.has(item.domain) || built.has(item.slugPrefix)).toBe(false);
      expect([item.currency, item.listingPath]).toEqual(['USD', '/trips']);
    }
    const everySite = [...EARLIER, ...B08A.sites, ...B08B.sites];
    for (const values of [
      everySite.map((item) => item.heroImages[0]),
      everySite.map((item) => item.seo.metaTitle.trim().toLowerCase()),
      everySite.flatMap((item) => item.trips.map((trip) => `${item.slugPrefix}${trip.path}`)),
    ]) expect(new Set(values).size).toBe(values.length);
  });

  it('builds every trip into a complete trip with pickup, published prices and no conditional lines', () => {
    const tenantId = new Types.ObjectId();
    let built = 0;
    for (const item of B08B.sites) {
      item.trips.forEach((trip, index) => {
        const document = tripDocument(item, trip, eeoSourceProgramme(trip.price), index, tenantId) as Record<string, any>;
        built += 1;
        expect(copiedFactProblems(item, document)).toEqual([]);
        expect(new Attraction(document).validateSync()?.errors ?? {}).toEqual({});
        expect([document.currency, document.rating, document.reviewCount, document.instantConfirmation, document.hasHotelPickup]).toEqual(['USD', 0, 0, false, true]);
        expect(document.inclusions as string[]).toEqual(expect.arrayContaining([expect.stringMatching(/[Hh]otel pick-?up|[Pp]ickup and drop-off at your hotel/)]));
        expect([...document.inclusions, ...document.exclusions].filter((line: string) => /if (the )?option|if add-ons?|\(if /i.test(line))).toEqual([]);
        expect(JSON.stringify(document)).not.toMatch(/authentic|expert|breathtaking|spectacular|FTS|Pickup location|drop-off locations/i);
        for (const option of document.pricingOptions as Array<Record<string, unknown>>) {
          expect(Number(option.price)).toBeGreaterThan(0);
          expect(Number(option.childPrice)).toBeGreaterThan(0);
          expect(Number(option.childPrice)).toBeLessThan(Number(option.price));
        }
        expect(String(document.duration)).toMatch(/\d+(\.\d+)?\s*(to \d+ )?hours?\b/);
        expect(document.itinerary.length).toBeGreaterThan(2);
      });
    }
    expect(built).toBe(9);
  });

  it('says on every Coptic Museum trip that the museum itself is not part of it', () => {
    for (const trip of site('coptic-museum-cairo').trips) {
      expect(trip.description).toMatch(/does not go inside the Coptic Museum/);
      expect(trip.price.add?.needToKnow).toEqual(expect.arrayContaining([expect.stringMatching(/not the museum itself/)]));
    }
    expect(site('coptic-museum-cairo').description).toMatch(/None of these days goes inside the Coptic Museum/);
  });

  it('sells only the Blue Hole options on the Blue Hole site, and the mask and fins per guest', () => {
    const blueHole = site('dahab-blue-hole');
    const documents = blueHole.trips.map((trip, index) => tripDocument(blueHole, trip, eeoSourceProgramme(trip.price), index, new Types.ObjectId()) as Record<string, any>);
    for (const document of documents) {
      expect(document.inclusions.join('\n')).toMatch(/Entry to the Blue Hole/);
      expect(document.pricingOptions.map((option: { name: string }) => option.name).join('\n')).not.toMatch(/without/i);
    }
    expect(documents[0].addons).toEqual([]);
    expect(documents[1].addons).toEqual([expect.objectContaining({ name: 'Snorkel mask and fins', price: 23.35, pricingModel: 'per-person' })]);
  });

  it('tells every Mount Sinai guest about the monastery days, and shares only three programmes with earlier sites', () => {
    for (const trip of site('mount-sinai').trips) expect(trip.price.add?.needToKnow?.join('\n')).toMatch(/closed on Sundays/);
    const earlier = new Set(EARLIER.flatMap((item) => item.trips.map((trip) => trip.price.source)));
    // The client publishes these three once; Sharm Tour Guide and Safari Sharm El Sheikh already sell them in other words.
    expect(B08B.sites.flatMap((item) => item.trips.map((trip) => trip.price.source)).filter((source) => earlier.has(source)).sort()).toEqual([
      'sharm-el-sheikh-colored-canyon-blue-hole-dahab-jeep-adventure',
      'sharm-el-sheikh-mount-sinai-sunrise-hike-st-catherine-s-monastery',
      'sharm-el-sheikh-private-st-catherine-s-monastery-tour',
    ]);
  });
});

describe('batch B08 group 3: Coral Reefs Dahab, Marsa Mubarak and Citadel of Saladin', () => {
  const site = (slug: string) => B08C.sites.find((item) => item.slug === slug)!;

  it('is a valid batch of three new sites', () => {
    expect(validateBatch(B08C)).toEqual([]);
    expect(B08C.id).toBe('b08c');
    expect(B08C.sites.map((item) => item.domain)).toEqual(['coralreefsdahab.com', 'marsamubarak.com', 'citadelofsaladin.com']);
    const already = new Set([...EARLIER, ...B08A.sites, ...B08B.sites].flatMap((item) => [item.slug, item.domain, item.slugPrefix]));
    for (const item of B08C.sites) {
      expect(already.has(item.slug) || already.has(item.domain) || already.has(item.slugPrefix)).toBe(false);
      expect([item.currency, item.listingPath]).toEqual(['USD', '/trips']);
    }
    expect([site('coral-reefs-dahab').city, site('coral-reefs-dahab').pickupDestination]).toEqual(['Sharm El Sheikh', 'sharm-el-sheikh']);
    // The Marsa Alam sites already built collect from the same destination, at the same coordinates.
    const marsaAlam = EARLIER.find((item) => item.slug === 'safari-marsa-alam')!;
    expect([site('marsa-mubarak').city, site('marsa-mubarak').pickupDestination]).toEqual(['Marsa Alam', marsaAlam.pickupDestination]);
    expect(site('marsa-mubarak').coordinates).toEqual(marsaAlam.coordinates);
    expect([site('citadel-of-saladin').city, site('citadel-of-saladin').pickupDestination, site('citadel-of-saladin').area]).toEqual(['Cairo', 'cairo', 'Cairo or Giza']);
  });

  it('opens on its own photo, under its own title, with trip slugs no other site holds', () => {
    const everySite = [...EARLIER, ...B08A.sites, ...B08B.sites, ...B08C.sites];
    for (const values of [
      everySite.map((item) => item.heroImages[0]),
      everySite.map((item) => item.seo.metaTitle.trim().toLowerCase()),
      everySite.flatMap((item) => item.trips.map((trip) => `${item.slugPrefix}${trip.path}`)),
    ]) expect(new Set(values).size).toBe(values.length);
    for (const item of B08C.sites) {
      const photos = new Set(item.trips.flatMap((trip) => trip.images));
      expect(item.photoShortfall).toBeUndefined();
      expect(item.heroImages).toHaveLength(3);
      for (const hero of item.heroImages) expect(photos.has(hero)).toBe(true);
      for (const trip of item.trips) expect(trip.imageAlts.filter((alt) => alt.trim().length > 20)).toHaveLength(trip.images.length);
    }
  });

  it('builds every trip into a complete trip with pickup, published prices and no conditional lines', () => {
    let count = 0;
    for (const item of B08C.sites) {
      for (const document of built(item)) {
        expectCompleteTrip(item, document);
        count += 1;
      }
    }
    expect(count).toBe(10);
  });

  it('never sells the Blue Hole on Coral Reefs Dahab, and says plainly where a day stops short of it', () => {
    const dahab = site('coral-reefs-dahab');
    for (const trip of dahab.trips) for (const option of trip.price.options) expect(option).not.toMatch(/blue-hole/);
    const documents = built(dahab);
    for (const document of documents) {
      const sold = [...document.inclusions, ...document.pricingOptions.map((option: { name: string; description: string }) => `${option.name} ${option.description}`)].join('\n');
      expect(sold).not.toMatch(/Blue Hole/i);
    }
    // The one programme here that also publishes a Blue Hole option says that this day does not go there.
    expect(documents[1].needToKnow.join('\n')).toMatch(/does not go to the Blue Hole/);
    expect(dahab.description).toMatch(/None of these days goes to the Blue Hole/);
  });

  it('sells the Marsa Mubarak dugong trip by the day, because its one published start is at night', () => {
    const marsa = site('marsa-mubarak');
    const trip = marsa.trips.find((item) => item.price.source === 'marsa-mubarak-boat-trip-snorkel-with-dugongs-giant-turtles')!;
    expect(publishedTimes(trip.price.source, trip.price.options[0])).toEqual(['21:00']);
    expect(trip.price.departures).toEqual([]);
    const [document] = marsa.trips.filter((item) => item === trip).map((item, index) => tripDocument(marsa, item, eeoSourceProgramme(item.price), index, new Types.ObjectId()) as Record<string, any>);
    expect(document.entryWindows).toEqual([]);
    expect(document.availability.type).toBe('date-only');
    expect(trip.description).toMatch(/sold by the day and the team confirms your pickup time/);
    // The other two sail at the times the client publishes, and the sailing boat's label says so.
    const [sailing, turtle] = built(marsa);
    // The sale stays bound to the client's own published option, whose key names its boat; the page never does.
    expect(sailing.pricingOptions.map((option: { id: string }) => option.id)).toEqual(marsa.trips[0].price.options);
    expect(guestCopy(sailing)).not.toMatch(CLIENT_NAMES);
    expect(sailing.entryWindows.map((window: { label: string; startTime: string }) => [window.label, window.startTime])).toEqual([['Boat leaves at 09:00', '09:00'], ['Boat leaves at 14:00', '14:00']]);
    expect(sailing.needToKnow.join('\n')).toMatch(/roughly ninety minutes earlier/);
    expect(turtle.entryWindows.map((window: { startTime: string }) => window.startTime)).toEqual(['09:00']);
    expect(turtle.needToKnow.join('\n')).toMatch(/North Marsa Alam costs extra and cannot be booked/);
  });

  it('tells every guest looking for turtles and dugongs that no boat can promise a sighting', () => {
    const marsa = site('marsa-mubarak');
    expect(marsa.description).toMatch(/no boat can promise a sighting/);
    const lookFor = built(marsa).filter((document) => /dugongs/.test(guestCopy(document)));
    expect(lookFor.length).toBeGreaterThanOrEqual(2);
    for (const document of lookFor) expect(document.needToKnow).toContain('Turtles and dugongs are wild animals, so no boat can promise a sighting.');
  });

  it('names the Citadel on every trip the Citadel site sells, and never calls itself the Citadel’s own site', () => {
    const citadel = site('citadel-of-saladin');
    for (const trip of citadel.trips) {
      expect([trip.title, trip.short, trip.description, ...trip.highlights].join('\n')).toMatch(/Citadel/);
    }
    expect([citadel.tagline, citadel.description, citadel.seo.metaTitle, citadel.seo.metaDescription].join('\n')).not.toMatch(/official|the home of|book direct/i);
    // The shared Citadel morning prices children as adults, so it claims no child price.
    const [shared] = built(citadel);
    expect(shared.pricingOptions.every((option: { childPrice?: number }) => option.childPrice === undefined)).toBe(true);
    expect(shared.needToKnow).toContain('Children pay the same price as adults.');
  });

  it('counts only the trips each site sells, and blocks the places it does not serve', () => {
    for (const item of B08C.sites) {
      for (const count of statedTripCounts([item.tagline, item.description].join('\n'))) expect(count).toBe(item.trips.length);
    }
    for (const [slug, foreign, own] of [
      ['coral-reefs-dahab', ['Hurghada', 'Cairo', 'Marsa Alam', 'Ras Mohamed', 'Saint Catherine'], ['Dahab', 'Sharm El Sheikh', 'Abu Galum', 'the Red Canyon']],
      ['marsa-mubarak', ['Hurghada', 'Sharm El Sheikh', 'Cairo', 'the Giza pyramids', 'El Quseir'], ['Marsa Mubarak', 'Marsa Alam', 'Port Ghalib', 'Marsa Shona']],
      ['citadel-of-saladin', ['Sharm El Sheikh', 'Hurghada', 'the Giza pyramids', 'Saqqara', 'Luxor'], ['the Citadel', 'Khan el Khalili', 'Coptic Cairo', 'the Hanging Church']],
    ] as const) {
      const item = site(slug);
      for (const place of foreign) expect(item.foreignPlaces.test(`A stop at ${place}.`)).toBe(true);
      for (const place of own) expect(item.foreignPlaces.test(`A stop at ${place}.`)).toBe(false);
    }
  });

  it('sells no option twice in the group, and only one programme an earlier batch already sells', () => {
    const keys = B08C.sites.flatMap((item) => item.trips.map((trip) => `${trip.price.source}#${trip.price.options.join('+')}`));
    expect(new Set(keys).size).toBe(keys.length);
    const earlier = new Set(EARLIER.flatMap((item) => item.trips.map((trip) => trip.price.source)));
    // Sharm Tour Guide and Safari Sharm El Sheikh already sell the Three Pools day in their own words.
    expect(B08C.sites.flatMap((item) => item.trips.map((trip) => trip.price.source)).filter((source) => earlier.has(source))).toEqual([
      'sharm-el-sheikh-dahab-3-pools-camel-ride-red-canyon-lunch-tour',
    ]);
  });
});

describe('batch B08 group 4: Egyptian Museum', () => {
  const museum = B08D.sites[0];

  it('is a valid batch of one new site selling five trips', () => {
    expect(validateBatch(B08D)).toEqual([]);
    expect(B08D.id).toBe('b08d');
    expect([museum.slug, museum.domain, museum.slugPrefix]).toEqual(['egyptian-museum', 'egyptianmuseum.net', 'egm-']);
    expect([museum.city, museum.pickupDestination, museum.area, museum.currency, museum.listingPath]).toEqual(['Cairo', 'cairo', 'Cairo or Giza', 'USD', '/trips']);
    expect(museum.trips).toHaveLength(5);
    const already = new Set([...EARLIER, ...B08A.sites, ...B08B.sites, ...B08C.sites].flatMap((item) => [item.slug, item.domain, item.slugPrefix]));
    expect(already.has(museum.slug) || already.has(museum.domain) || already.has(museum.slugPrefix)).toBe(false);
    const everySite = [...EARLIER, ...B08];
    for (const values of [
      everySite.map((item) => item.heroImages[0]),
      everySite.map((item) => item.seo.metaTitle.trim().toLowerCase()),
      everySite.flatMap((item) => item.trips.map((trip) => `${item.slugPrefix}${trip.path}`)),
    ]) expect(new Set(values).size).toBe(values.length);
    const photos = new Set(museum.trips.flatMap((trip) => trip.images));
    expect(museum.heroImages).toHaveLength(3);
    for (const hero of museum.heroImages) expect(photos.has(hero)).toBe(true);
  });

  it('builds every trip into a complete trip with pickup, published prices and no conditional lines', () => {
    const documents = built(museum);
    for (const document of documents) expectCompleteTrip(museum, document);
    expect(documents).toHaveLength(5);
    expect(documents.map((document) => document.priceFrom)).toEqual([48.55, 79, 267, 277, 95]);
  });

  it('takes every one of its five trips into the Egyptian Museum', () => {
    for (const trip of museum.trips) {
      expect([trip.title, trip.short, trip.description, ...trip.highlights].join('\n')).toMatch(/Egyptian Museum/);
    }
    for (const document of built(museum)) {
      expect(document.itinerary.map((step: { title: string }) => step.title)).toContain('The Egyptian Museum');
    }
    expect(museum.description).toMatch(/all go into the Egyptian Museum on Tahrir Square/);
  });

  it('says on the site and on every trip that it is the museum on Tahrir Square, not the Grand Egyptian Museum', () => {
    expect(museum.description).toMatch(/not the Grand Egyptian Museum near the Giza Pyramids/);
    for (const document of built(museum)) {
      expect(document.needToKnow).toContain('This trip visits the Egyptian Museum on Tahrir Square in central Cairo, not the Grand Egyptian Museum near the Giza Pyramids.');
    }
  });

  it('describes the museum rather than promising an exhibit that may have moved', () => {
    const copy = built(museum).map((document) => JSON.stringify(document)).join('\n');
    expect(copy).not.toMatch(/Tutankhamun|mummies|the golden mask/i);
  });

  it('says where children pay the adult price, and prices the rest with their own child rate', () => {
    const documents = built(museum);
    const samePrice = documents.filter((document) => document.pricingOptions.every((option: { childPrice?: number }) => option.childPrice === undefined));
    expect(samePrice.map((document) => document.slug)).toEqual([
      'egm-shared-guided-tour-of-the-egyptian-museum',
      'egm-museum-old-cairo-and-khan-el-khalili-shared-day',
      'egm-pyramids-sphinx-museum-and-khan-el-khalili-day',
    ]);
    for (const document of samePrice) expect(document.needToKnow.join('\n')).toMatch(/pay the same price as adults/);
    // The one option the client also prices infants at the adult rate says so.
    expect(documents[1].pricingOptions[0].infantPrice).toBe(79);
    expect(documents[1].needToKnow).toContain('Children and infants pay the same price as adults.');
  });

  it('never names the cruise boat, and sells nothing a B08 site already sells', () => {
    const cruise = built(museum).find((document) => document.slug.includes('nile-dinner-cruise'))!;
    expect(JSON.stringify(cruise)).not.toMatch(/Nile Crystal/i);
    expect(cruise.itinerary.map((step: { title: string }) => step.title)).toContain('Dinner cruise on the Nile');
    // The whole of B08 sells each published option once.
    const keys = B08.flatMap((item) => item.trips.map((trip) => `${trip.price.source}#${trip.price.options.join('+')}`));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
