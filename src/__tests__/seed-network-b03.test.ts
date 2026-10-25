import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { copiedFactProblems, eeoSourceProgramme, tripDocument, validateBatch } from '../scripts/seed-network-sites';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';
import { B02 } from '../scripts/network-sites/b02';
import { B03A } from '../scripts/network-sites/b03';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';

const tripsOf = (slug: string) => B03A.sites.find((site) => site.slug === slug)!;

describe('batch B03 group 1: the three Giza domains', () => {
  it('is a valid batch: claim-free copy, places each site serves, network-hosted photos', () => {
    expect(validateBatch(B03A)).toEqual([]);
  });

  it('builds three sites, none of them a site already built', () => {
    expect(B03A.id).toBe('b03a');
    expect(B03A.sites.map((site) => site.domain)).toEqual([
      'gizaplateaupyramids.com', 'pyramidsofgizaegypt.com', 'memphisandsakkara.com',
    ]);
    const built = new Set([...B01_SAFARI.sites, ...B02.sites].flatMap((site) => [site.slug, site.domain, site.slugPrefix]));
    for (const site of B03A.sites) {
      expect(built.has(site.slug) || built.has(site.domain) || built.has(site.slugPrefix)).toBe(false);
      expect(site.currency).toBe('USD');
      expect(site.listingPath).toBe('/trips');
      // There is no Giza destination on the network, so the trips are filed under and collected from Cairo.
      expect([site.city, site.pickupDestination, site.area]).toEqual(['Cairo', 'cairo', 'Cairo or Giza']);
    }
    // Neighbouring sites never open on the same photo, across all three batches.
    const firstHeroes = [...B01_SAFARI.sites, ...B02.sites, ...B03A.sites].map((site) => site.heroImages[0]);
    expect(new Set(firstHeroes).size).toBe(firstHeroes.length);
    // And no site's title is another's, across all three batches.
    const titles = [...B01_SAFARI.sites, ...B02.sites, ...B03A.sites].map((site) => site.seo.metaTitle.trim().toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('adds the nine programmes it sells to the snapshot and leaves the twelve of B02 where they were', () => {
    const slugs = SNAPSHOT.tours.map((tour) => tour.slug);
    expect(slugs).toHaveLength(21);
    // B02 read its twelve first; they keep their place and their order.
    expect(slugs.slice(0, 12)).toEqual([
      'sharm-ras-mohamed-white-island-snorkeling-adventure-with-lunch',
      'sharm-el-sheikh-white-island-ras-mohammed-small-group-cruise',
      'sharm-el-sheikh-luxury-ras-mohammed-white-island-boat-trip',
      'from-sharm-el-sheikh-ras-mohammed-white-island-yacht-cruise',
      'sharm-el-sheikh-ras-mohamed-white-island-snorkeling-diving-lunch',
      'harm-el-sheikh-discover-ras-mohamed-white-island-underwater',
      'sharm-el-sheikh-elite-vip-ras-mohammed-cruise-bbq-lunch',
      'sharm-el-sheikh-tiran-island-cruise-with-snorkeling-diving-lunch',
      'cairo-fayoum-oasis-waterfalls-valley-of-the-whales-adventure',
      'from-cairo-fayoum-desert-safari-magic-lake-waterfalls-adventure',
      'hurghada-yacht-cruise-to-orange-bay-giftun-magawish-with-dolphins',
      'hurghada-speedboat-trip-to-6-islands-with-dolphin-watching-snorkeling',
    ]);
    const sold = new Set(B03A.sites.flatMap((site) => site.trips.map((trip) => trip.price.source)));
    expect(sold.size).toBe(9);
    for (const source of sold) expect(slugs.slice(12)).toContain(source);
    // A programme added later carries the date it was read, so the batch date is never implied for it.
    for (const tour of SNAPSHOT.tours.slice(12)) expect(tour.readAt).toMatch(/^2026-10-25T/);
  });

  it('builds every trip from the dated snapshot into a complete trip', () => {
    const tenantId = new Types.ObjectId();
    let built = 0;
    for (const site of B03A.sites) {
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
        // Every network trip promises hotel pickup, and every one of these says so in its own words.
        expect(document.hasHotelPickup).toBe(true);
        expect(document.inclusions as string[]).toEqual(expect.arrayContaining([expect.stringMatching(/[Hh]otel pick-?up/)]));
        // A line that is true only "if the option is selected" never reaches a site: the option sold decides it.
        expect((document.inclusions as string[]).filter((line) => /\(if |if selected|if add-on/i.test(line))).toEqual([]);
        for (const field of ['inclusions', 'exclusions', 'needToKnow', 'whatToBring'] as const) {
          const lines = document[field] as string[];
          expect(new Set(lines).size).toBe(lines.length);
        }
        // Every option sold is priced per guest in the site's currency, with the published child rate.
        for (const option of document.pricingOptions as Array<Record<string, unknown>>) {
          expect(option.pricingModel).toBe('per-person');
          expect(Number(option.price)).toBeGreaterThan(0);
        }
        expect(document.entryWindows.length).toBeGreaterThan(0);
        expect(document.itinerary.length).toBeGreaterThan(2);
        // The client publishes add-ons on several of these trips, but binds none of them to a booking option,
        // so the published record offers none with the options sold.
        expect(document.addons).toEqual([]);
      });
    }
    expect(built).toBe(11);
  });

  it('sells no programme on two sites, and keeps the two pyramid sites apart', () => {
    const keys = B03A.sites.flatMap((site) => site.trips.map((trip) => `${trip.price.source}#${trip.price.options.join('+')}`));
    expect(new Set(keys).size).toBe(keys.length);
    const sources = B03A.sites.map((site) => new Set(site.trips.map((trip) => trip.price.source)));
    for (const [a, b] of [[0, 1], [0, 2], [1, 2]] as const) {
      expect([...sources[a]].filter((source) => sources[b].has(source))).toEqual([]);
    }
    // The plateau site stays on the plateau; the museum site always carries on into the city.
    const plateau = tripsOf('giza-plateau-pyramids');
    expect(plateau.trips.every((trip) => /pyramid|sphinx/i.test(trip.title))).toBe(true);
    const museums = tripsOf('pyramids-of-giza-egypt');
    expect(museums.trips.every((trip) => /museum|khan el-khalili/i.test(trip.title))).toBe(true);
  });

  it('names the attraction each site is named after in every trip it sells', () => {
    for (const [slug, names] of [
      ['giza-plateau-pyramids', /pyramid|sphinx/i],
      ['pyramids-of-giza-egypt', /pyramid/i],
      ['memphis-and-sakkara', /sakkara|memphis/i],
    ] as const) {
      const site = tripsOf(slug);
      for (const trip of site.trips) {
        const copy = [trip.title, trip.short, trip.description, ...trip.highlights].join('\n');
        expect(copy).toMatch(names);
      }
    }
    // Every trip this site sells really stops at Sakkara or at Memphis; none is a plateau-only option.
    for (const trip of tripsOf('memphis-and-sakkara').trips) {
      expect(trip.description).toMatch(/Sakkara/);
      expect(trip.description).toMatch(/Memphis/);
    }
  });

  it('blocks the places each site does not serve, in its own copy and in what it copies', () => {
    const elsewhere = ['Hurghada', 'Sharm el-Sheikh', 'Marsa Alam', 'Luxor', 'Aswan', 'the Fayoum'];
    for (const site of B03A.sites) {
      for (const place of elsewhere) expect(site.foreignPlaces.test(`A day trip to ${place}.`)).toBe(true);
      // What each site does serve is never blocked.
      for (const place of ['Cairo', 'Giza', 'the Giza plateau']) expect(site.foreignPlaces.test(`A day at ${place}.`)).toBe(false);
    }
    // The two pyramid sites refuse the other site's places, so neither drifts into the Saqqara catalogue.
    for (const slug of ['giza-plateau-pyramids', 'pyramids-of-giza-egypt'] as const) {
      for (const place of ['Saqqara', 'Sakkara', 'Memphis', 'Dahshur']) expect(tripsOf(slug).foreignPlaces.test(`A stop at ${place}.`)).toBe(true);
    }
    // And the Saqqara site allows exactly those.
    for (const place of ['Sakkara', 'Memphis', 'Dahshur']) expect(tripsOf('memphis-and-sakkara').foreignPlaces.test(`A stop at ${place}.`)).toBe(false);
  });

  it('takes fewer than three home photos only where the trips publish fewer, and says so', () => {
    for (const site of B03A.sites) {
      const photos = new Set(site.trips.flatMap((trip) => trip.images));
      if (site.photoShortfall) expect(photos.size).toBeLessThan(3);
      else expect(site.heroImages).toHaveLength(3);
      // Every photo a site shows is one of the photos its own trips publish.
      for (const hero of site.heroImages) expect(photos.has(hero)).toBe(true);
      for (const trip of site.trips) expect(trip.imageAlts.filter((alt) => alt.trim().length > 20)).toHaveLength(trip.images.length);
    }
    expect(B03A.sites.filter((site) => site.photoShortfall).map((site) => site.slug)).toEqual(['memphis-and-sakkara']);
  });
});
