import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { copiedFactProblems, eeoSourceProgramme, statedTripCounts, tripDocument, validateBatch, type NetworkSite } from '../scripts/seed-network-sites';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';
import { B02 } from '../scripts/network-sites/b02';
import { B03A } from '../scripts/network-sites/b03';
import { B03B, B03C, B03D } from '../scripts/network-sites/b03-rest';
import { B08A, B08B, B08C, B08D } from '../scripts/network-sites/b08';
import { B09A, B09B, B09C } from '../scripts/network-sites/b09';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';

const EARLIER = [B01_SAFARI, B02, B03A, B03B, B03C, B03D, B08A, B08B, B08C, B08D].flatMap((batch) => batch.sites);
const B09 = [...B09A.sites, ...B09B.sites, ...B09C.sites];
const siteOf = (slug: string) => B09.find((site) => site.slug === slug)!;

/**
 * The two partner records as the network published them on 28 October 2026, kept beside this test: the seed reads
 * them live at --check and --apply, and this test builds the trips from the same shape.
 */
const PARTNER = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'network-b09-partner-records.json'), 'utf8')) as Record<string, Record<string, any>>;

/** A line that holds only for an option the trip does not sell, or for an extra it cannot offer. */
const CONDITIONAL = /\(if |if selected|if add-on|if (?:the )?option|add on selection|upon request|VIP|5h Tour:|8h Tour:/i;
/** Names from a record that a network site never shows: the client's boats and the partner's grading. */
const RECORD_NAMES = /Pirates|Class A|Rittal|Sataya/i;

const programmeOf = (trip: NetworkSite['trips'][number]) => (trip.price.provider === 'eeo'
  ? eeoSourceProgramme(trip.price)
  : PARTNER[`${trip.price.tenant}/${trip.price.source}`]);

const built = (site: NetworkSite) => site.trips.map((trip, index) => tripDocument(site, trip, programmeOf(trip), index, new Types.ObjectId()) as Record<string, any>);

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

/** Every rule a B09 trip keeps, whichever site sells it. */
function expectCompleteTrip(site: NetworkSite, document: Record<string, any>): void {
  expect(copiedFactProblems(site, document)).toEqual([]);
  expect(new Attraction(document).validateSync()?.errors ?? {}).toEqual({});
  expect([document.currency, document.rating, document.reviewCount, document.instantConfirmation, document.hasHotelPickup]).toEqual(['USD', 0, 0, false, true]);
  expect([...document.inclusions, ...document.exclusions].filter((line: string) => CONDITIONAL.test(line))).toEqual([]);
  expect(guestCopy(document)).not.toMatch(/authentic|\bexpert\b|breathtaking|spectacular|\bbest\b|unforgettable|world.s largest|famous|Pickup location|drop-off locations|\\times/i);
  expect(guestCopy(document)).not.toMatch(RECORD_NAMES);
  // No wildlife is promised: a guest is told where to look, never what it will see.
  expect(guestCopy(document)).not.toMatch(/swim with|swim alongside|you will see (?:turtles|dugongs|dolphins)/i);
  for (const field of ['inclusions', 'exclusions', 'needToKnow', 'whatToBring'] as const) {
    const lines = document[field] as string[];
    expect(new Set(lines).size).toBe(lines.length);
  }
  expect(document.itinerary.length).toBeGreaterThan(2);
  // Hours, or the record's own whole days for the trips that last a day or more.
  expect(String(document.duration)).toMatch(/^\d+(\.\d+)?( to \d+(\.\d+)?)? (hours?|days?)$/);
  for (const option of document.pricingOptions as Array<Record<string, unknown>>) {
    expect(Number(option.price)).toBeGreaterThan(0);
    if (option.childPrice !== undefined) expect(Number(option.childPrice)).toBeLessThan(Number(option.price));
  }
  expect(document.availability.type).toBe(document.entryWindows.length ? 'time-slots' : 'date-only');
  if (document.enquiryOnly) return;
  const childPriced = (document.pricingOptions as Array<Record<string, unknown>>).some((option) => option.childPrice !== undefined);
  expect((document.needToKnow as string[]).join('\n')).toMatch(childPriced ? /have their own price/ : /pay the same price as adults/);
  if (!document.entryWindows.length) expect((document.needToKnow as string[]).join('\n')).toMatch(/sold by the day/);
}

describe('batch B09: the network build queue', () => {
  it('is three valid groups of the eight queue sites, none of them built before', () => {
    expect([B09A.id, B09B.id, B09C.id]).toEqual(['b09a', 'b09b', 'b09c']);
    for (const batch of [B09A, B09B, B09C]) expect(validateBatch(batch)).toEqual([]);
    expect(B09.map((site) => site.slug)).toEqual([
      'grand-egyptian-museum', 'hurghada-boat-tour', 'dive2egypt',
      'marsa-alam-red-sea-egypt', 'wadi-el-gemal-reserve', 'shaab-samadai',
      'bahria-oasis', 'turtle-bay-hurghada',
    ]);
    const before = new Set(EARLIER.flatMap((site) => [site.slug, site.domain, site.slugPrefix]));
    for (const site of B09) {
      expect(before.has(site.slug) || before.has(site.domain) || before.has(site.slugPrefix)).toBe(false);
      expect([site.currency, site.listingPath]).toEqual(['USD', '/trips']);
    }
    // No site across every batch opens on the same photo, shares a title or a trip slug.
    const every = [...EARLIER, ...B09];
    const firstHeroes = every.map((site) => site.heroImages[0]);
    expect(new Set(firstHeroes).size).toBe(firstHeroes.length);
    const titles = every.map((site) => site.seo.metaTitle.trim().toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    const slugs = every.flatMap((site) => site.trips.map((trip) => `${site.slugPrefix}${trip.path}`));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('sells client trips from the dated snapshot and the two partner trips from the network default', () => {
    for (const site of [...B09A.sites, ...B09B.sites]) for (const trip of site.trips) expect(trip.price.provider).toBe('eeo');
    expect(siteOf('bahria-oasis').trips.map((trip) => [trip.price.provider ?? 'network', trip.price.tenant, trip.price.source]))
      .toEqual([['network', 'rittal-travel-egypt', 'desert-safari-white']]);
    expect(siteOf('turtle-bay-hurghada').trips.map((trip) => [trip.price.provider ?? 'network', trip.price.tenant, trip.price.source]))
      .toEqual([['network', 'makadi-bay-snorkeling', 'makadi-snorkel-and-turtle-bay-trip']]);
    // Every client trip it sells was read on 28 October 2026; the ones it holds back are named in the batch's header.
    const tours = SNAPSHOT.tours as Array<{ slug: string; readAt?: string }>;
    const added = tours.slice(73);
    const sold = new Set(B09.flatMap((site) => site.trips.map((trip) => trip.price.source)));
    for (const source of sold) if (!source.includes('desert-safari') && !source.includes('turtle-bay')) expect(tours.map((tour) => tour.slug)).toContain(source);
    expect(added.map((tour) => tour.slug).filter((slug) => !sold.has(slug)).sort()).toEqual([
      'from-hurghada-cairo-pyramids-grand-egyptian-museum-citadel-day-trip',
      'from-hurghada-paradise-island-yacht-speedboat-cruise-with-snorkeling-lunch',
      'hurghada-beginner-intro-diving-experience-in-the-red-sea',
      'hurghada-dolphin-house-yacht-trip-with-snorkeling-lunch',
      'hurghada-hula-hula-island-snorkeling-water-sports-lunch',
      'hurghada-hula-hula-island-yacht-cruise-with-lunch-snorkeling',
      'hurghada-orange-bay-snorkeling-diving-cruise-with-massage',
      'hurghada-panoramic-semi-submarine-cruise-with-snorkeling',
      'marsa-alam-desert-quad-bike-camel-ride-bedouin-village-experience',
      'marsa-alam-desert-stargazing-safari-with-quad-dinner-telescope',
      'marsa-alam-tondoba-beach-shore-diving-adventure',
      'tawila-island-luxury-day-use-snorkeling-cruise-from-hurghada',
    ]);
  });

  it('builds every trip into a complete trip', () => {
    let count = 0;
    for (const site of B09) for (const document of built(site)) { expectCompleteTrip(site, document); count += 1; }
    expect(count).toBe(43);
  });

  it('holds each held-back record to the reason the batch gives', () => {
    const tours = SNAPSHOT.tours as unknown as Array<{ slug: string; detail: { duration: string }; options: Array<{ pricingKey: string; guestPrices: { adult: number }; timeSlots: Array<{ time: string; guestPrices?: { adult: number } }> }> }>;
    const tour = (slug: string) => tours.find((item) => item.slug === slug)!;
    // A departure priced apart from its option.
    for (const [slug, key] of [
      ['from-hurghada-paradise-island-yacht-speedboat-cruise-with-snorkeling-lunch', '7-hour-yacht-tour-from-hurghada-hotels-990333086c06'],
      ['hurghada-hula-hula-island-snorkeling-water-sports-lunch', '4-hour-speedboat-tour-from-hurghada-hotels-02b8a5ec42ca'],
      ['hurghada-hula-hula-island-yacht-cruise-with-lunch-snorkeling', '7-hour-hula-hula-island-yacht-tour-from-hurgh-2e195ad73640'],
    ]) {
      const option = tour(slug).options.find((item) => item.pricingKey === key)!;
      expect(option.timeSlots.some((slot) => slot.guestPrices && slot.guestPrices.adult !== option.guestPrices.adult)).toBe(true);
      expect(() => eeoSourceProgramme({ provider: 'eeo', tenant: 'egypt-excursions-online', source: slug, options: [key], addons: [], departures: [] })).toThrow('prices its');
    }
    expect(tour('hurghada-orange-bay-snorkeling-diving-cruise-with-massage').detail.duration).toBe('$$69');
  });

  it('keeps the Grand Egyptian Museum trips on the museum, from Cairo or Giza and from Sharm El Sheikh', () => {
    const site = siteOf('grand-egyptian-museum');
    expect([site.city, site.pickupDestination, site.area]).toEqual(['Cairo', 'cairo', 'Cairo or Giza']);
    const documents = built(site);
    for (const document of documents) expect(guestCopy(document)).toMatch(/Grand Egyptian Museum/);
    // The Sharm El Sheikh day sells only the option with the Grand Egyptian Museum ticket.
    expect(site.trips[2].price.options).toEqual(['giza-pyramids-sphinx-grand-egyptian-museum-en-ddc5355863f0']);
    expect(documents.slice(2).map((document) => document.destination.city)).toEqual(['Sharm El Sheikh', 'Sharm El Sheikh']);
    expect(documents.slice(2).map((document) => document.meetingPoint.address)).toEqual(['Your hotel in Sharm El Sheikh', 'Your hotel in Sharm El Sheikh']);
    for (const place of ['Hurghada', 'the Citadel', 'Tahrir Square', 'Saqqara']) expect(site.foreignPlaces.test(`A stop at ${place}.`)).toBe(true);
    for (const place of ['the Giza pyramids', 'Sharm El Sheikh', 'Cairo or Giza']) expect(site.foreignPlaces.test(`A stop at ${place}.`)).toBe(false);
  });

  it('starts each Dive2Egypt trip from the town it dives from', () => {
    const site = siteOf('dive2egypt');
    expect(built(site).map((document) => document.destination.city)).toEqual([
      'Hurghada', 'Hurghada', 'Hurghada', 'Hurghada', 'El Gouna', 'Makadi Bay', 'Sharm El Sheikh', 'Sharm El Sheikh', 'Sharm El Sheikh', 'Dahab',
    ]);
    // Who each dive is for is said on the trip.
    const gouna = built(site)[4];
    expect(gouna.needToKnow.join('\n')).toMatch(/certified divers/);
  });

  it('sells Shaab Samadai by enquiry, without a price, and never as Dolphin House', () => {
    for (const site of [siteOf('shaab-samadai'), siteOf('marsa-alam-red-sea-egypt')]) {
      const samadai = built(site).find((document) => /shaab-samadai/.test(document.slug))!;
      expect(samadai.enquiryOnly).toBe(true);
      expect([samadai.pricingOptions, samadai.addons, samadai.entryWindows, samadai.priceFrom]).toEqual([[], [], [], undefined]);
      expect(samadai.needToKnow.join('\n')).toMatch(/booked by enquiry/);
      expect(guestCopy(samadai)).not.toMatch(/Dolphin House|Free cancellation|full refund/i);
      expect(site.foreignPlaces.test('home to the famous Dolphin House')).toBe(true);
    }
  });

  it('sells the partner trips as their records sell them', () => {
    const [desert] = built(siteOf('bahria-oasis'));
    expect(desert.pricingOptions.map((option: Record<string, unknown>) => [option.id, option.name])).toEqual([['opt_1', 'Overnight in the White Desert']]);
    expect(desert.addons.map((addon: Record<string, unknown>) => [addon.id, addon.name, addon.pricingModel])).toEqual([
      ['addon_lunch', 'Lunch', 'per-person'],
      ['addon_photo', 'Photo package', 'per-booking'],
    ]);
    // Sold by the day: the record's "Morning" and "Afternoon" windows contradict its own schedule.
    expect(desert.availability.type).toBe('date-only');
    expect(guestCopy(desert)).not.toMatch(/Eastern Desert|Skip the line|Egyptologist|Class A|premium|dune bashing/i);

    const [turtle] = built(siteOf('turtle-bay-hurghada'));
    // The child rate rides on the adult option, and the family pack is one price for four.
    expect(turtle.pricingOptions.map((option: Record<string, unknown>) => [option.id, option.price, option.childPrice, option.pricingModel, option.maxParticipants])).toEqual([
      ['adult', 38, 23, undefined, undefined],
      ['family', 108, undefined, 'per-booking', 4],
    ]);
    expect(turtle.priceFrom).toBe(38);
    expect(turtle.addons.map((addon: Record<string, unknown>) => [addon.id, addon.pricingModel])).toEqual([
      ['pickup', 'per-person'], ['photos', 'per-booking'], ['wetsuit', 'per-person'],
    ]);
    // Pickup is sold as the extra it is, and the record's rating is not carried.
    expect(turtle.exclusions).toContain('Hotel pickup, which is an extra');
    expect(turtle.needToKnow.join('\n')).toMatch(/Hotel pickup and drop-off in Makadi Bay is an extra/);
    expect([turtle.rating, turtle.reviewCount]).toEqual([0, 0]);
    expect(guestCopy(turtle)).not.toMatch(/Best chance|captures your turtle/i);
  });

  it('counts the trips its copy names', () => {
    for (const site of B09) {
      const copy = [site.tagline, site.description, site.seo.metaTitle, site.seo.metaDescription].join('\n');
      for (const count of statedTripCounts(copy)) expect(count).toBe(site.trips.length);
    }
  });
});
