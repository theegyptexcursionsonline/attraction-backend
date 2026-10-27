import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { copiedFactProblems, eeoSourceProgramme, statedTripCounts, tripDocument, validateBatch } from '../scripts/seed-network-sites';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';
import { B02 } from '../scripts/network-sites/b02';
import { B03A } from '../scripts/network-sites/b03';
import { B03B, B03C, B03D } from '../scripts/network-sites/b03-rest';
import { B08A, B08B } from '../scripts/network-sites/b08';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';

const siteOf = (slug: string) => B08A.sites.find((site) => site.slug === slug)!;
const EARLIER = [...B01_SAFARI.sites, ...B02.sites, ...B03A.sites, ...B03B.sites, ...B03C.sites, ...B03D.sites];

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
    const added = SNAPSHOT.tours.slice(44);
    // B08 read its programmes on its own day, each with the time its record was read.
    for (const tour of added) expect(tour.readAt).toMatch(/^2026-10-27T/);
    const sold = new Set([...B08A.sites, ...B08B.sites].flatMap((site) => site.trips.map((trip) => trip.price.source)));
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
