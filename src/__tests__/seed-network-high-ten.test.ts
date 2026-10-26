import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { copiedFactProblems, eeoSourceProgramme, tripDocument } from '../scripts/seed-network-sites';
import {
  NETWORK_CATEGORIES, clientHostedPhotos, retirePlan, sitePhoto, validateHighTen,
} from '../scripts/seed-network-high-ten';
import { HIGH_TEN } from '../scripts/network-sites/high-ten';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';
import { B02 } from '../scripts/network-sites/b02';
import { B03A } from '../scripts/network-sites/b03';
import { B03B, B03C, B03D } from '../scripts/network-sites/b03-rest';
import SNAPSHOT from '../scripts/network-sites/high-ten-snapshot.json';
import type { EeoSnapshot } from '../scripts/network-sites/eeo-source';

const snapshot = SNAPSHOT as EeoSnapshot;
const siteOf = (slug: string) => HIGH_TEN.sites.find((site) => site.slug === slug)!;
const eeoTrips = HIGH_TEN.sites.flatMap((site) => site.trips
  .filter((trip) => trip.price.provider === 'eeo')
  .map((trip, index) => ({ site, trip, index })));

describe('the ten sites of the high-priority batch, whose catalogues are replaced in place', () => {
  it('is a valid batch: claim-free copy, the places each site serves, photos the network holds', () => {
    expect(validateHighTen(HIGH_TEN)).toEqual([]);
  });

  it('touches these ten sites and no other, and creates no site', () => {
    expect(HIGH_TEN.sites.map((site) => site.slug)).toEqual([
      'giftun-island-hurghada', 'hurghada-jeep-safari', 'orange-bay-tours', 'horse-riding-hurghada',
      'hurghada-private-safari', 'parasailing-hurghada', 'camel-riding-hurghada', 'hurghada-dolphins',
      'hurghada-luxury-cruise', 'cairo-tours-packages',
    ]);
    // cairo-night-cruise has no real product behind it and is deliberately not in the batch.
    expect(HIGH_TEN.sites.map((site) => site.slug)).not.toContain('cairo-night-cruise');
    // None of these is a site an earlier batch built, and no trip slug of theirs is reused.
    const built = [...B01_SAFARI.sites, ...B02.sites, ...B03A.sites, ...B03B.sites, ...B03C.sites, ...B03D.sites];
    const theirSlugs = new Set(built.map((site) => site.slug));
    const theirTrips = new Set(built.flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`)));
    for (const site of HIGH_TEN.sites) {
      expect(theirSlugs.has(site.slug)).toBe(false);
      for (const trip of site.trips) expect(theirTrips.has(`${site.slugPrefix}${trip.path}`)).toBe(false);
    }
  });

  it("sells in each site's own currency and files every trip under a category the network has", () => {
    for (const site of HIGH_TEN.sites) {
      expect(site.currency).toBe('USD');
      expect(NETWORK_CATEGORIES).toContain(site.category);
      for (const trip of site.trips) expect(trip.price.category).toBe(site.category);
    }
    // Horse riding and desert safari have no category of their own on the network; both sit under the
    // one that does exist, and a category of their own is a decision for the client.
    expect(siteOf('horse-riding-hurghada').category).toBe('adventures');
    expect(siteOf('hurghada-private-safari').category).toBe('adventures');
  });

  it("builds every trip from the client's own record into a complete trip", () => {
    const tenantId = new Types.ObjectId();
    let built = 0;
    for (const { site, trip, index } of eeoTrips) {
      const programme = { ...eeoSourceProgramme(trip.price, snapshot), category: site.category };
      const document = tripDocument(site, { ...trip, images: trip.images.map(sitePhoto) }, programme, index, tenantId) as Record<string, any>;
      built += 1;
      expect(copiedFactProblems(site, document)).toEqual([]);
      expect(new Attraction(document).validateSync()?.errors ?? {}).toEqual({});
      expect(document.currency).toBe('USD');
      // Nothing invents a reputation: the ratings on these sites today stand behind no review at all.
      expect(document.rating).toBe(0);
      expect(document.reviewCount).toBe(0);
      expect(document.instantConfirmation).toBe(false);
      expect(document.hasHotelPickup).toBe(true);
      expect(document.inclusions as string[]).toEqual(expect.arrayContaining([expect.stringMatching(/^Hotel pickup and drop-off/)]));
      // A line that is true only with another option never reaches a guest, and nothing is said twice.
      expect((document.inclusions as string[]).filter((line) => /\(if |if selected|Know Before You Go|upon request/i.test(line))).toEqual([]);
      for (const field of ['inclusions', 'exclusions', 'needToKnow', 'whatToBring'] as const) {
        const lines = document[field] as string[];
        expect(new Set(lines).size).toBe(lines.length);
      }
      expect((document.entryWindows as unknown[]).length).toBeGreaterThan(0);
      // This batch sells no extra: the client binds its add-ons to single options, and most are transfers
      // from towns these sites do not collect from.
      expect(document.addons).toEqual([]);
    }
    expect(built).toBe(eeoTrips.length);
    expect(built).toBeGreaterThan(40);
  });

  it("charges the price the client's own record carries, never a converted or rounded one", () => {
    const tenantId = new Types.ObjectId();
    for (const { site, trip, index } of eeoTrips) {
      const tour = snapshot.tours.find((item) => item.slug === trip.price.source)!;
      expect(tour).toBeDefined();
      expect(String(tour.detail.pricingSummary?.currency).toUpperCase()).toBe(site.currency);
      const programme = { ...eeoSourceProgramme(trip.price, snapshot), category: site.category };
      const document = tripDocument(site, { ...trip, images: trip.images.map(sitePhoto) }, programme, index, tenantId) as Record<string, any>;
      for (const option of document.pricingOptions as Array<Record<string, any>>) {
        const source = tour.options.find((item) => item.pricingKey === option.id)!;
        expect(source).toBeDefined();
        expect(option.price).toBe(source.guestPrices.adult);
        if (option.childPrice !== undefined) expect(option.childPrice).toBe(source.guestPrices.child);
        // Every departure sold is priced exactly as the option is, so one price on the page is the truth.
        for (const slot of source.timeSlots || []) {
          expect(slot.guestPrices?.adult ?? source.guestPrices.adult).toBe(source.guestPrices.adult);
        }
      }
      const cheapest = Math.min(...(document.pricingOptions as Array<{ price: number }>).map((option) => option.price));
      expect(document.priceFrom).toBe(cheapest);
      // A child price is never quoted without saying in plain words how it is applied.
      const hasChildPrice = (document.pricingOptions as Array<Record<string, any>>).some((option) => option.childPrice !== undefined);
      if (hasChildPrice) expect((document.needToKnow as string[]).join(' ')).toMatch(/Children have their own price/);
    }
  });

  it("shows only photos the network holds, and for the client's trips only the one that trip publishes", () => {
    for (const site of HIGH_TEN.sites) {
      const own = new Set(site.trips.flatMap((trip) => trip.images));
      for (const hero of site.heroImages) expect(own.has(hero)).toBe(true);
      if (!site.photoShortfall) expect(site.heroImages).toHaveLength(3);
      for (const trip of site.trips) {
        expect(trip.images.length).toBe(trip.imageAlts.length);
        for (const url of trip.images) {
          expect(url).toMatch(/^https:\/\/res\.cloudinary\.com\/dm3sxllch\/image\/upload\//);
          // Never another tenant's media folder, and never a stock photo library.
          expect(url).not.toMatch(/\/attractions-network\/tenant-|images\.unsplash\.com|pexels/);
        }
        if (trip.price.provider !== 'eeo') continue;
        const tour = snapshot.tours.find((item) => item.slug === trip.price.source)!;
        expect(trip.images).toEqual([(tour.detail as { image?: string }).image]);
      }
    }
    // Until each site holds its own copy of the client's photos, apply refuses: the check names them.
    expect(Array.isArray(clientHostedPhotos(HIGH_TEN))).toBe(true);
  });

  it('speaks to guests in plain words, never in the words of the catalogue it copied', () => {
    const notGuestCopy = new Set([
      'slug', 'listingPath', 'pickupDestination', 'currency', 'slugPrefix', 'category', 'heroImages',
      'images', 'path', 'provider', 'tenant', 'source', 'options', 'departures', 'omit', 'photoShortfall',
      'keep', 'retire', 'readAt', 'id', 'name', 'city',
    ]);
    const internal = /\bpublished\b|does not sell|\b(?:the|on|in the) record\b|snapshot|pretend/i;
    const leaks: string[] = [];
    const walk = (value: unknown, at: string): void => {
      if (typeof value === 'string') {
        if (internal.test(value)) leaks.push(`${at}: ${value.slice(0, 90)}`);
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${at}[${index}]`));
      } else if (value && typeof value === 'object' && !(value instanceof RegExp)) {
        for (const [key, item] of Object.entries(value)) if (!notGuestCopy.has(key)) walk(item, `${at}.${key}`);
      }
    };
    for (const site of HIGH_TEN.sites) walk(site, site.slug);
    expect(leaks).toEqual([]);
  });

  it('keeps the trips that have a record behind them and takes only the others off', () => {
    // The six parasailing products match the operator's own live prices, and a Desert Fox jeep safari was
    // copied onto the private safari site intact; nine more there are real programmes at prices the
    // operator's own site contradicts, so they stay and the price goes to the client.
    expect(siteOf('parasailing-hurghada').keep).toEqual([
      'parasailing-fly-hurghada-sky', 'private-hurghada-parasailing-pickup', 'mega-fun-parasailing-tube-banana',
      'fun-day-quad-parasailing-turkish-bath', 'deluxe-quad-submarine-parasailing-spa',
      'super-mega-submarine-parasailing-banana',
    ]);
    expect(siteOf('hurghada-private-safari').keep).toContain('hurghada-jeep-safari-redsea');
    expect(siteOf('hurghada-private-safari').keep).toHaveLength(10);
    expect(siteOf('cairo-tours-packages').keep).toHaveLength(1);
    for (const site of HIGH_TEN.sites) {
      expect(site.keep.filter((slug) => site.retire.includes(slug))).toEqual([]);
      const created = site.trips.map((trip) => `${site.slugPrefix}${trip.path}`);
      expect(created.filter((slug) => site.retire.includes(slug) || site.keep.includes(slug))).toEqual([]);
    }
    // 98 trips across the ten sites have no record behind them: 75 on the nine Hurghada sites and 23 on
    // the Cairo one. Seventeen of them are the copies that circulate across eight tenants.
    expect(Object.fromEntries(HIGH_TEN.sites.map((site) => [site.slug, site.retire.length]))).toEqual({
      'giftun-island-hurghada': 5, 'hurghada-jeep-safari': 4, 'orange-bay-tours': 7, 'horse-riding-hurghada': 9,
      'hurghada-private-safari': 17, 'parasailing-hurghada': 21, 'camel-riding-hurghada': 4,
      'hurghada-dolphins': 4, 'hurghada-luxury-cruise': 4, 'cairo-tours-packages': 23,
    });
    expect(HIGH_TEN.sites.reduce((total, site) => total + site.retire.length, 0)).toBe(98);
  });

  it('archives a trip only this site sells and unlists one that other sites also sell', () => {
    const onSite = [
      { slug: 'only-here', status: 'active', listedOn: 1 },
      { slug: 'also-elsewhere', status: 'active', listedOn: 7 },
      { slug: 'already-off', status: 'archived', listedOn: 1 },
      { slug: 'a-draft-only-here', status: 'draft', listedOn: 1 },
    ];
    const plan = retirePlan(['only-here', 'also-elsewhere', 'already-off', 'a-draft-only-here', 'gone'], onSite);
    expect(plan.archive).toEqual([
      { slug: 'only-here', status: 'active' },
      { slug: 'a-draft-only-here', status: 'draft' },
    ]);
    expect(plan.unlist).toEqual([{ slug: 'also-elsewhere', listedOn: 7 }]);
    // One already off is left alone, and one that has moved stops the run rather than being guessed at.
    expect(plan.problems).toEqual(['gone is no longer on the site; read the site again.']);
  });

  it("refuses a batch that converts a price, invents a category or shows another site's photo", () => {
    const site = HIGH_TEN.sites[0];
    const wrongCurrency = { ...HIGH_TEN, sites: [{ ...site, currency: 'EUR' as unknown as 'USD' }] };
    expect(validateHighTen(wrongCurrency)).toEqual(expect.arrayContaining([expect.stringContaining('sells in USD only')]));
    const wrongCategory = { ...HIGH_TEN, sites: [{ ...site, category: 'horse-riding' as never }] };
    expect(validateHighTen(wrongCategory)).toEqual(expect.arrayContaining([expect.stringContaining("is not one of the network's categories")]));
    const foreignHero = { ...HIGH_TEN, sites: [{ ...site, heroImages: ['https://res.cloudinary.com/dm3sxllch/image/upload/v1/attractions-network/tenant-logos/other/x.png'] }] };
    expect(validateHighTen(foreignHero)).toEqual(expect.arrayContaining([expect.stringContaining('not one of the photos its own trips publish')]));
    const bothWays = { ...HIGH_TEN, sites: [{ ...site, keep: [site.retire[0]] }] };
    expect(validateHighTen(bothWays)).toEqual(expect.arrayContaining([expect.stringContaining('is both kept and taken off')]));
  });
});
