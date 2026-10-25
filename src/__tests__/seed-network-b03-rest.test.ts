import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { copiedFactProblems, eeoSourceProgramme, tripDocument, validateBatch } from '../scripts/seed-network-sites';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';
import { B02 } from '../scripts/network-sites/b02';
import { B03A } from '../scripts/network-sites/b03';
import { B03B, B03C, B03D } from '../scripts/network-sites/b03-rest';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';

const BATCHES = [B03B, B03C, B03D];
const SITES = BATCHES.flatMap((batch) => batch.sites);
const siteOf = (slug: string) => SITES.find((site) => site.slug === slug)!;

describe('batch B03 groups 2 to 4: the seven remaining domains', () => {
  it('is three valid batches: claim-free copy, places each site serves, network-hosted photos', () => {
    for (const batch of BATCHES) expect([batch.id, ...validateBatch(batch)]).toEqual([batch.id]);
    expect(BATCHES.map((batch) => batch.id)).toEqual(['b03b', 'b03c', 'b03d']);
  });

  it('builds the seven domains in their release groups, none of them a site already built', () => {
    expect(B03B.sites.map((site) => site.domain)).toEqual([
      'templeofkarnak.com', 'valleyofthenobles.com', 'whalevalleywadialhitan.com',
    ]);
    expect(B03C.sites.map((site) => site.domain)).toEqual([
      'pyramidscameltour.com', 'sharmtourguide.com', 'quadsafarihurghada.com',
    ]);
    expect(B03D.sites.map((site) => site.domain)).toEqual(['safarisharmelsheikh.com']);
    const built = new Set([...B01_SAFARI.sites, ...B02.sites, ...B03A.sites].flatMap((site) => [site.slug, site.domain, site.slugPrefix]));
    for (const site of SITES) {
      expect(built.has(site.slug) || built.has(site.domain) || built.has(site.slugPrefix)).toBe(false);
      expect(site.currency).toBe('USD');
      expect(site.listingPath).toBe('/trips');
      // Each site is filed under, and collects from, the network destination its trips start in.
      expect([site.city.toLowerCase().replace(/ /g, '-'), site.pickupDestination]).toEqual([site.pickupDestination, site.pickupDestination]);
    }
    // No two sites across every batch built so far open on the same photo, or share a title.
    const everySite = [...B01_SAFARI.sites, ...B02.sites, ...B03A.sites, ...SITES];
    const firstHeroes = everySite.map((site) => site.heroImages[0]);
    expect(new Set(firstHeroes).size).toBe(firstHeroes.length);
    const titles = everySite.map((site) => site.seo.metaTitle.trim().toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    // And no two sites of these three batches share a trip slug with any site already built.
    const slugs = everySite.flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('sells only programmes that are in the dated snapshot, and leaves the earlier batches where they were', () => {
    const slugs = SNAPSHOT.tours.map((tour) => tour.slug);
    expect(slugs).toHaveLength(44);
    // B02 read its twelve first and B03A its nine; both keep their place and their order.
    expect(slugs.slice(0, 21)).toEqual([
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
      'giza-pyramids-great-sphinx-half-day-private-tour',
      'giza-pyramids-sunrise-morning-guided-tour-with-camel-ride-breakfast',
      'vip-giza-pyramids-experience-private-tour-camel-ride-lunch',
      'giza-pyramids-tour-with-1-hour-nile-felucca-sail',
      'giza-pyramids-sphinx-grand-egyptian-museum-private',
      'private-pyramids-egyptian-museum-khan-el-khalili-tour',
      'giza-pyramids-sphinx-nmec-museum-historic-citadel',
      'sakkara-memphis-dahshur-giza-pyramids-day-tour',
      'giza-pyramids-sakkara-memphis-day-tour-with-nile-sail',
    ]);
    const sold = new Set(SITES.flatMap((site) => site.trips.map((trip) => trip.price.source)));
    expect(sold.size).toBe(29);
    for (const source of sold) expect(slugs).toContain(source);
    // The twenty-three programmes these batches added were read on the batch's own day.
    for (const tour of SNAPSHOT.tours.slice(21)) expect(tour.readAt).toMatch(/^2026-10-25T/);
    // Nothing these batches added to the snapshot is left unsold.
    expect(slugs.slice(21).filter((slug) => !sold.has(slug))).toEqual([]);
  });

  it('builds every trip from the dated snapshot into a complete trip', () => {
    const tenantId = new Types.ObjectId();
    let built = 0;
    for (const site of SITES) {
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
        expect(document.inclusions as string[]).toEqual(expect.arrayContaining([expect.stringMatching(/hotel pick-?up|pickup and drop-off at your hotel/i)]));
        // A line that is true only on an option the trip may not sell never reaches a site.
        for (const field of ['inclusions', 'exclusions'] as const) {
          expect((document[field] as string[]).filter((line) => /\(\s*if |if selected|if add-?on|if the option|add on selection|depending on the option you choose/i.test(line))).toEqual([]);
        }
        for (const field of ['inclusions', 'exclusions', 'needToKnow', 'whatToBring'] as const) {
          const lines = document[field] as string[];
          expect(new Set(lines).size).toBe(lines.length);
        }
        // Every option sold is priced per guest in the site's currency.
        for (const option of document.pricingOptions as Array<Record<string, unknown>>) {
          expect(option.pricingModel).toBe('per-person');
          expect(Number(option.price)).toBeGreaterThan(0);
        }
        expect(document.entryWindows.length).toBeGreaterThan(0);
        expect(document.itinerary.length).toBeGreaterThan(2);
        // An extra is sold only where the published record binds it to every option the trip sells.
        for (const addon of document.addons as Array<Record<string, unknown>>) {
          expect(Number(addon.price)).toBeGreaterThan(0);
          expect(addon.pricingModel).toBe('per-person');
        }
      });
    }
    expect(built).toBe(35);
  });

  it('puts the trips of each release group on their own site, and never one trip twice on one site', () => {
    for (const site of SITES) {
      const keys = site.trips.map((trip) => `${trip.price.source}#${[...trip.price.options].sort().join('+')}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
    // The Karnak site and the Nobles site share one programme and no more: the day on both banks is the only
    // published one that walks the West Bank monuments the Tombs of the Nobles were cut beside (owner, 25 Oct).
    const karnak = new Set(siteOf('temple-of-karnak').trips.map((trip) => trip.price.source));
    const nobles = siteOf('valley-of-the-nobles').trips.map((trip) => trip.price.source);
    expect(nobles.filter((source) => karnak.has(source))).toEqual([
      'luxor-east-west-bank-private-tour-with-traditional-felucca-nile-cruise',
    ]);
    // Each site sells the number of trips its brief asks for.
    expect(SITES.map((site) => [site.slug, site.trips.length])).toEqual([
      ['temple-of-karnak', 2],
      ['valley-of-the-nobles', 3],
      ['whale-valley-wadi-al-hitan', 1],
      ['pyramids-camel-tour', 3],
      ['sharm-tour-guide', 13],
      ['quad-safari-hurghada', 6],
      ['safari-sharm-el-sheikh', 7],
    ]);
  });

  it('names the attraction each site is named after, or says plainly that it is not on the day', () => {
    for (const [slug, names] of [
      ['temple-of-karnak', /Karnak/],
      ['whale-valley-wadi-al-hitan', /Wadi Al Hitan|Valley of the Whales|whale/i],
      ['pyramids-camel-tour', /camel/i],
      ['quad-safari-hurghada', /quad|buggy/i],
      ['safari-sharm-el-sheikh', /quad|buggy|jeep|desert|canyon/i],
    ] as const) {
      for (const trip of siteOf(slug).trips) {
        expect([trip.title, trip.short, trip.description, ...trip.highlights].join('\n')).toMatch(names);
      }
    }
    // Every camel trip really carries the ride in its price, so the site's promise holds.
    for (const trip of siteOf('pyramids-camel-tour').trips) {
      expect(`${trip.title}\n${trip.short}`).toMatch(/camel/i);
    }
    // No published day reaches the Tombs of the Nobles, so each trip of that site says so twice over:
    // in the words a guest reads first and in the trip's own "Need to know".
    for (const trip of siteOf('valley-of-the-nobles').trips) {
      expect(trip.description).toMatch(/does not include the Tombs of the Nobles/);
      expect(trip.price.add?.needToKnow ?? []).toEqual(
        expect.arrayContaining([expect.stringMatching(/does not include the Tombs of the Nobles/)]),
      );
    }
    expect(siteOf('valley-of-the-nobles').description).toMatch(/None of the Luxor trips on this site goes inside them/);
  });

  it('speaks to guests in plain words, never in the catalogue talk the trips were copied from', () => {
    // Ids, addresses, colours, source option lists and the strings the seed removes are not guest copy.
    const notGuestCopy = new Set([
      'slug', 'listingPath', 'domain', 'pickupDestination', 'currency', 'slugPrefix', 'theme', 'heroImages', 'logo',
      'images', 'path', 'provider', 'tenant', 'source', 'category', 'options', 'departures', 'omit', 'photoShortfall',
    ]);
    const internal = /\bpublished\b|does not sell|\b(?:the|on|in the) record\b|snapshot|pretend/i;
    const leaks: string[] = [];
    const walk = (value: unknown, at: string): void => {
      if (typeof value === 'string') {
        if (internal.test(value)) leaks.push(`${at}: ${value.slice(0, 90)}`);
      } else if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, `${at}[${i}]`));
      } else if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) if (!notGuestCopy.has(key)) walk(item, `${at}.${key}`);
      }
    };
    for (const site of [...B03A.sites, ...SITES]) walk(site, site.slug);
    expect(leaks).toEqual([]);
  });

  it('blocks the places each site does not serve, in its own copy and in what it copies', () => {
    const blockedEverywhere: Record<string, string[]> = {
      'temple-of-karnak': ['Hurghada', 'Sharm el-Sheikh', 'Cairo', 'Aswan'],
      'valley-of-the-nobles': ['Hurghada', 'Sharm el-Sheikh', 'Cairo', 'Aswan'],
      'whale-valley-wadi-al-hitan': ['Hurghada', 'Sharm el-Sheikh', 'Luxor', 'Sakkara'],
      'pyramids-camel-tour': ['Hurghada', 'Sharm el-Sheikh', 'Luxor', 'the Fayoum'],
      'sharm-tour-guide': ['Hurghada', 'Marsa Alam', 'Luxor', 'El Gouna'],
      'quad-safari-hurghada': ['Sharm el-Sheikh', 'Marsa Alam', 'Luxor', 'Cairo'],
      'safari-sharm-el-sheikh': ['Hurghada', 'Marsa Alam', 'Luxor', 'Cairo'],
    };
    for (const [slug, places] of Object.entries(blockedEverywhere)) {
      const site = siteOf(slug);
      for (const place of places) expect([slug, site.foreignPlaces.test(`A day trip to ${place}.`)]).toEqual([slug, true]);
    }
    // What each site does serve is never blocked.
    const served: Record<string, string[]> = {
      'temple-of-karnak': ['Luxor', 'Karnak', 'the Valley of the Kings', 'the Nile'],
      // The day on both banks ends at Karnak, so Karnak is served here as well as on its own site.
      'valley-of-the-nobles': ['Luxor', 'the West Bank', 'Wadi Ziad', 'Karnak', 'the Valley of the Kings'],
      'whale-valley-wadi-al-hitan': ['Cairo', 'the Fayoum', 'Wadi Al Hitan', 'Lake Qarun'],
      'pyramids-camel-tour': ['Cairo', 'Giza', 'the Giza plateau'],
      'sharm-tour-guide': ['Sharm el-Sheikh', 'Ras Mohamed', 'Dahab', 'Tiran Island', 'Cairo'],
      'quad-safari-hurghada': ['Hurghada', 'Makadi Bay', 'Sahl Hasheesh', 'El Gouna'],
      'safari-sharm-el-sheikh': ['Sharm el-Sheikh', 'Dahab', 'Ras Mohamed', 'the Coloured Canyon'],
    };
    for (const [slug, places] of Object.entries(served)) {
      const site = siteOf(slug);
      for (const place of places) expect([slug, site.foreignPlaces.test(`A day at ${place}.`)]).toEqual([slug, false]);
    }
  });

  it('takes fewer than three home photos only where the trips publish fewer, and says so', () => {
    for (const site of SITES) {
      const photos = new Set(site.trips.flatMap((trip) => trip.images));
      if (site.photoShortfall) expect([site.slug, photos.size < 3]).toEqual([site.slug, true]);
      else expect([site.slug, site.heroImages.length]).toEqual([site.slug, 3]);
      // Every photo a site shows is one of the photos its own trips publish, and lives in its own folder.
      for (const hero of site.heroImages) expect(photos.has(hero)).toBe(true);
      for (const url of photos) expect(url).toContain(`/attractions-network/network-b03/${site.slug}/`);
      for (const trip of site.trips) expect(trip.imageAlts.filter((alt) => alt.trim().length > 20)).toHaveLength(trip.images.length);
    }
    expect(SITES.filter((site) => site.photoShortfall).map((site) => site.slug)).toEqual([
      'temple-of-karnak', 'whale-valley-wadi-al-hitan', 'pyramids-camel-tour',
    ]);
  });
});
