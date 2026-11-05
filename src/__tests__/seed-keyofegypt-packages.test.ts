import { spawnSync } from 'child_process';
import express from 'express';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from '../test/loopbackRequest';
import attractionRoutes from '../routes/attractions.routes';
import packageRoutes from '../routes/packages.routes';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';
import { B02 } from '../scripts/network-sites/b02';
import { B03A } from '../scripts/network-sites/b03';
import { B03B, B03C, B03D } from '../scripts/network-sites/b03-rest';
import { B08A, B08B, B08C, B08D } from '../scripts/network-sites/b08';
import { B09A, B09B, B09C } from '../scripts/network-sites/b09';
import { B10A, B10B, B10C, B10D } from '../scripts/network-sites/b10';
import { B11A, B11B } from '../scripts/network-sites/b11';
import { B12A, B12B } from '../scripts/network-sites/b12';
import { B13A, B13B } from '../scripts/network-sites/b13';
import { B14A, B14B } from '../scripts/network-sites/b14';
import { B15A, B15B } from '../scripts/network-sites/b15';
import { B15C } from '../scripts/network-sites/b15c';
import { B16 } from '../scripts/network-sites/b16';
import { KEYOFEGYPT } from '../scripts/network-sites/keyofegypt';
import SNAPSHOT from '../scripts/network-sites/eeo-snapshot.json';
import type { EeoSnapshot } from '../scripts/network-sites/eeo-source';
import {
  applyKeyOfEgyptPackages,
  buildPackageDetails,
  buildPackageListing,
  CANCELLATION_SCHEDULE,
  dryRunReport,
  isOwnRecord,
  KEYOFEGYPT_PACKAGES,
  KEYOFEGYPT_TENANT,
  KeyOfEgyptPackageError,
  packageProblems,
  packageSlug,
  photoPublicId,
  planKeyOfEgyptPackages,
  recordDayTitle,
  removeKeyOfEgyptPackages,
  type KeyOfEgyptPackage,
} from '../scripts/seed-keyofegypt-packages';
import { packagePublishChecklist } from '../utils/packageDetails';
import { addDays, packageSelectionSchema, pricePackageSelection, todayInZone } from '../services/packagePricing.service';
import {
  assertTenantIdsBookingCreationAllowed,
  isTenantBookingCreationClosed,
  TenantBookingCreationClosedError,
} from '../services/tenantBookingPolicy.service';

/**
 * The first two packages published anywhere on the network: Key of Egypt Tours' six-day Cairo and Nile trip
 * and its nine-day Cairo, Alexandria and Nile trip, both built from the client's own published records.
 *
 * What these tests hold the seed to: every price is the record's own, the words are this site's and nobody
 * else's, both packages are complete enough to sell by the admin path's own checklist, the public calendar and
 * quote charge exactly what the record publishes, no other site can read them, this site still takes no
 * booking, a dry run writes nothing, a second run writes nothing twice, and the removal archives only what the
 * seed itself created.
 */

// Real routes, middleware, controllers and writes; only the signed-in identity is injected.
jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
  authenticate: (req: any, res: any, next: any) => {
    const role = req.header('x-test-role');
    if (!role) return res.status(401).json({ success: false });
    req.user = { _id: new Types.ObjectId(), role, assignedTenants: req.header('x-test-assigned')?.split(',').filter(Boolean) || [] };
    next();
  },
  optionalAuth: (req: any, _res: any, next: any) => {
    const role = req.header('x-test-role');
    if (role) req.user = { _id: new Types.ObjectId(), role, assignedTenants: req.header('x-test-assigned')?.split(',').filter(Boolean) || [] };
    next();
  },
}));
jest.setTimeout(180_000);

const snapshot = SNAPSHOT as EeoSnapshot;
const TODAY = todayInZone('Africa/Cairo');
const SIX = KEYOFEGYPT_PACKAGES[0];
const NINE = KEYOFEGYPT_PACKAGES[1];
/** The photograph each record publishes, copied onto the network's own account at apply time. */
const PHOTO = 'https://res.cloudinary.com/dm3sxllch/image/upload/v1793900000/attractions-network/package-photos/test.jpg';
const image = (spec: KeyOfEgyptPackage) => ({ url: PHOTO, alt: spec.photoAlt });
const tourOf = (source: string) => snapshot.tours.find((tour) => tour.slug === source)!;
const copyOf = (spec: KeyOfEgyptPackage) => [spec.title, spec.short, spec.description, ...spec.highlights,
  spec.seo.metaTitle, spec.seo.metaDescription, spec.photoAlt].join('\n');

const app = express();
app.use(express.json());
app.use('/attractions', attractionRoutes);
app.use('/packages', packageRoutes);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ success: false, error: error.message }));

const site = (req: request.Test, slug = KEYOFEGYPT_TENANT) => req.query({ tenant: slug });

let mongo: MongoMemoryReplSet;
let tenantId: Types.ObjectId;
let otherTenantId: Types.ObjectId;
let logs: jest.SpyInstance;

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('keyofegypt_packages'));
  await Promise.all([Tenant.init(), Attraction.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

beforeEach(async () => {
  process.env.URL_NAMESPACE_WRITES_READY = 'true';
  process.env.PACKAGES_PUBLISHING_ENABLED = 'true';
  logs = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  await Promise.all([Tenant.collection.deleteMany({}), Attraction.collection.deleteMany({})]);
  tenantId = new Types.ObjectId();
  otherTenantId = new Types.ObjectId();
  await Tenant.collection.insertMany([
    { _id: tenantId, slug: KEYOFEGYPT_TENANT, name: 'Key of Egypt Tours', domain: 'key-of-egypt-tours.foxesnetwork.com', status: 'active', timezone: 'Africa/Cairo', defaultCurrency: 'USD', customPages: [] },
    { _id: otherTenantId, slug: 'another-network-site', name: 'Another network site', domain: 'another-network-site.foxesnetwork.com', status: 'active', timezone: 'Africa/Cairo', defaultCurrency: 'USD', customPages: [] },
  ]);
});
afterEach(() => { logs.mockRestore(); jest.restoreAllMocks(); delete process.env.PACKAGES_PUBLISHING_ENABLED; });

/** The seed's own photograph path, replaced: a test never reads the client's site or writes an image. */
const ports = () => ({
  readPhoto: jest.fn(async (source: string) => `https://cdn.example.invalid/${source}.jpg`),
  uploadPhoto: jest.fn(async (_url: string, _publicId: string) => PHOTO),
});

describe('what the two packages say, before anything is written', () => {
  it('builds both from the snapshot and leaves nothing for the publish checklist to refuse', () => {
    for (const spec of KEYOFEGYPT_PACKAGES) {
      const details = buildPackageDetails(spec, TODAY, snapshot);
      const listing = buildPackageListing(spec, details, { tenantId, today: TODAY, images: [image(spec)], snapshot });
      expect(packagePublishChecklist(details, TODAY).problems).toEqual([]);
      expect(packageProblems(spec, listing, details, TODAY)).toEqual([]);
      expect(listing.listingType).toBe('package');
      expect(listing.status).toBe('active');
      expect(listing.currency).toBe('USD');
      expect(listing.enquiryOnly).toBe(false);
      expect(listing.ownerTenantId).toBe(tenantId);
      expect(listing.tenantIds).toEqual([tenantId]);
      expect(listing.parentPage).toEqual({ label: 'Packages', path: '/packages' });
      expect(listing.images).toEqual([PHOTO]);
      expect(listing.imageAltTexts).toEqual([{ url: PHOTO, alt: spec.photoAlt }]);
    }
  });

  it('prices every level from the record and never types a price of its own', () => {
    const six = buildPackageDetails(SIX, TODAY, snapshot);
    const sixTour = tourOf(SIX.source);
    expect(six.rates.map((rate) => [rate.tierKey, rate.double, rate.child])).toEqual(
      SIX.levels.map((level) => {
        const option = sixTour.options.find((item) => item.pricingKey === level.pricingKey)!;
        return [level.key, option.guestPrices.adult, option.guestPrices.child];
      }),
    );
    expect(six.rates.map((rate) => [rate.double, rate.child])).toEqual([[2100, 1400], [2200, 1650], [2250, 1750]]);
    expect(six.rates.every((rate) => rate.single === null && rate.triple === null && rate.infant === null)).toBe(true);

    const nine = buildPackageDetails(NINE, TODAY, snapshot);
    const nineOption = tourOf(NINE.source).options[0];
    expect(nine.rates).toHaveLength(1);
    expect([nine.rates[0].double, nine.rates[0].child]).toEqual([nineOption.guestPrices.adult, nineOption.guestPrices.child]);
    expect([nine.rates[0].double, nine.rates[0].child]).toEqual([2300, 1200]);
  });

  it('offers the guide languages at the record add-ons\' own prices, with English included', () => {
    const details = buildPackageDetails(SIX, TODAY, snapshot);
    const addons = tourOf(SIX.source).addons;
    expect(details.extras.map((extra) => [extra.id, extra.price, extra.unit, extra.maxQuantity])).toEqual([
      ['guide-english', 0, 'per_booking', 1],
      ['guide-german', addons[0].price, 'per_booking', 1],
      ['guide-spanish', addons[0].price, 'per_booking', 1],
      ['guide-french', addons[0].price, 'per_booking', 1],
      ['guide-italian', addons[1].price, 'per_booking', 1],
    ]);
    expect(details.optionGroups).toEqual([{
      id: 'guide-language', name: 'Guide language', kind: 'guide', required: true,
      extraIds: ['guide-english', 'guide-german', 'guide-spanish', 'guide-french', 'guide-italian'],
    }]);
    // The nine-day record publishes no add-on, so that package offers no choice at all.
    expect(buildPackageDetails(NINE, TODAY, snapshot).extras).toEqual([]);
    expect(buildPackageDetails(NINE, TODAY, snapshot).optionGroups).toEqual([]);
  });

  it('sells both to a party of two sharing one room, with a child of 6 to 12 and no infant', () => {
    for (const spec of KEYOFEGYPT_PACKAGES) {
      const details = buildPackageDetails(spec, TODAY, snapshot);
      expect(details.groupBands).toEqual([{ key: 'two-travellers', min: 2, max: 2 }]);
      expect(details.rooms).toEqual({ allowSingle: false, allowTriple: false, maxChildrenPerRoom: 1, maxInfantsPerRoom: 0, bedPreferences: ['double', 'twin'] });
      expect(details.travellers).toEqual({ allowChildren: true, allowInfants: false, childMinAge: 6, childMaxAge: 12, childWithOneAdult: 'child' });
      expect(details.cancellation).toEqual(CANCELLATION_SCHEDULE);
      expect(details.departureMode).toBe('daily');
      expect(details.daily.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(details.seasons).toHaveLength(1);
      expect(details.seasons[0].from).toBe(addDays(TODAY, 1));
      expect(String(details.seasons[0].to) > TODAY).toBe(true);
    }
  });

  it('names no hotel, and says who confirms the ones it does not name', () => {
    for (const spec of KEYOFEGYPT_PACKAGES) {
      const details = buildPackageDetails(spec, TODAY, snapshot);
      for (const tier of details.tiers) {
        expect(tier.hotels.length).toBeGreaterThan(0);
        for (const hotel of tier.hotels) {
          expect(hotel.name).toMatch(/^(?:\d-star (?:hotel in \w+|Nile cruise)|Overnight sleeper train to Aswan)$/);
          expect(hotel.description).toMatch(/confirmed by the operator/);
          expect(hotel.city).not.toBe('');
        }
      }
      // The nights in the levels are the nights the trip has.
      const nights = details.tiers[0].hotels.reduce((sum, hotel) => sum + (hotel.nights ?? 0), 0);
      expect(nights).toBe(details.durationNights);
    }
  });

  it('writes the itinerary day by day from the record, with the night each day ends on', () => {
    const six = buildPackageDetails(SIX, TODAY, snapshot);
    expect(six.itinerary.map((day) => day.title)).toEqual(
      tourOf(SIX.source).detail.itinerary!.map((day) => recordDayTitle(day.title || '')),
    );
    expect(six.itinerary.map((day) => day.overnight)).toEqual(['Cairo', 'Luxor', 'Nile cruise', 'Nile cruise', 'Nile cruise', '']);
    expect(six.itinerary[0].title).toBe('Pyramids of Giza & Egyptian Museum');
    const nine = buildPackageDetails(NINE, TODAY, snapshot);
    expect(nine.itinerary.map((day) => day.overnight)).toEqual(
      ['Cairo', 'Cairo', 'Sleeper train to Aswan', 'Nile cruise', 'Nile cruise', 'Nile cruise', 'Cairo', 'Cairo', ''],
    );
    // No day claims a meal: neither record allocates one.
    expect([...six.itinerary, ...nine.itinerary].every((day) => day.meals.length === 0)).toBe(true);
  });

  it('carries the record\'s inclusions and exclusions, without the lines that promise nothing', () => {
    const listing = buildPackageListing(SIX, buildPackageDetails(SIX, TODAY, snapshot), { tenantId, today: TODAY, images: [image(SIX)], snapshot });
    const published = tourOf(SIX.source).detail.whatsIncluded!;
    expect(listing.inclusions).toContain('3 nights on a 5-star Nile cruise (full board)');
    expect(listing.inclusions).toContain('Domestic flights: Cairo to Luxor & Aswan to Cairo');
    expect(listing.inclusions).not.toContain('Meals as mentioned per day');
    // "Expert …" is a claim the network cannot back, and every network trip drops such a line.
    expect(published).toContain('Expert English-speaking Egyptologist guide for all tours');
    expect(listing.inclusions).not.toContain('Expert English-speaking Egyptologist guide for all tours');
    expect(listing.exclusions).toContain('Optional German-, Spanish-, French- or Italian-speaking guide (choose one language)');
    expect(listing.exclusions).not.toContain('Spanish-, German-, Italian- or French-speaking guide (available as an add-on)');

    const nine = buildPackageListing(NINE, buildPackageDetails(NINE, TODAY, snapshot), { tenantId, today: TODAY, images: [image(NINE)], snapshot });
    // The operator's own wording is carried as published, contradictions included; nothing is resolved here.
    expect(nine.inclusions).toContain('All sites mentioned in the program');
    expect(nine.exclusions).toEqual(['Tipping', 'Entrance fees']);
  });

  it('states the party, the departure and the refund terms in the network\'s own wording', () => {
    for (const spec of KEYOFEGYPT_PACKAGES) {
      const details = buildPackageDetails(spec, TODAY, snapshot);
      const listing = buildPackageListing(spec, details, { tenantId, today: TODAY, images: [image(spec)], snapshot });
      expect(listing.needToKnow).toEqual([
        expect.stringContaining('two travellers sharing one room'),
        'Select an available departure date when booking.',
        expect.stringContaining('100% at least seven days before departure'),
      ]);
      expect(listing.participantRequirements).toEqual([
        expect.stringContaining('Children must be 6–12 years old'),
        'Double or twin beds may be requested, subject to availability.',
      ]);
      expect(listing.cancellationPolicy).toContain('Cancel at least 7 days before departure');
    }
  });

  it('gives each package a title of its own, unlike the record\'s and unlike every other site\'s', () => {
    const networkTitles = [B01_SAFARI, B02, B03A, B03B, B03C, B03D, B08A, B08B, B08C, B08D, B09A, B09B, B09C,
      B10A, B10B, B10C, B10D, B11A, B11B, B12A, B12B, B13A, B13B, B14A, B14B, B15A, B15B, B15C, B16, KEYOFEGYPT]
      .flatMap((batch) => batch.sites)
      .flatMap((networkSite) => networkSite.trips.map((trip) => trip.title.toLowerCase()));
    const recordTitles = snapshot.tours.map((tour) => tour.detail.title.trim().toLowerCase());
    const ours = KEYOFEGYPT_PACKAGES.map((spec) => spec.title.toLowerCase());
    expect(new Set(ours).size).toBe(ours.length);
    for (const title of ours) {
      expect(networkTitles).not.toContain(title);
      expect(recordTitles).not.toContain(title);
    }
    // The address is this site's own namespace, and the two differ from its eight days.
    const dayPaths = KEYOFEGYPT.sites[0].trips.map((trip) => `koe-${trip.path}`);
    for (const spec of KEYOFEGYPT_PACKAGES) {
      expect(packageSlug(spec)).toMatch(/^koe-[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(dayPaths).not.toContain(packageSlug(spec));
    }
  });

  it('claims nothing about the company and keeps its search words inside their limits', () => {
    for (const spec of KEYOFEGYPT_PACKAGES) {
      const copy = copyOf(spec);
      expect(copy).not.toMatch(/\b(licen[cs]e|established|years of experience|rated|reviews?|award)\b/i);
      expect(copy).not.toMatch(/(?:\+|00)\d[\d\s()-]{7,}/);
      expect(spec.seo.metaTitle.length).toBeLessThanOrEqual(70);
      expect(spec.seo.metaDescription.length).toBeLessThanOrEqual(165);
      expect(spec.seo.metaTitle.length).toBeGreaterThan(0);
    }
  });
});

describe('a record that changed stops the run before anything is written', () => {
  const changed = (source: string, change: (tour: any) => void): EeoSnapshot => {
    const copy = JSON.parse(JSON.stringify(snapshot)) as EeoSnapshot;
    change(copy.tours.find((tour) => tour.slug === source)!);
    return copy;
  };

  it.each([
    ['an option that is no longer published', () => changed(SIX.source, (tour) => { tour.options.splice(0, 1); })],
    ['an option that is no longer per person', () => changed(SIX.source, (tour) => { tour.options[0].type = 'Per Group'; })],
    ['an option that was renamed', () => changed(SIX.source, (tour) => { tour.options[0].title = 'Something else entirely'; })],
    ['an adult price that vanished', () => changed(SIX.source, (tour) => { tour.options[0].guestPrices.adult = 0; })],
    ['a child charged more than an adult', () => changed(SIX.source, (tour) => { tour.options[0].guestPrices.child = 9999; })],
    ['a child price that vanished', () => changed(SIX.source, (tour) => { delete tour.options[0].guestPrices.child; })],
    ['a departure priced apart from its option', () => changed(SIX.source, (tour) => { tour.options[0].timeSlots[0].guestPrices.adult = 1; })],
    ['a guide add-on that is gone', () => changed(SIX.source, (tour) => { tour.addons.splice(1, 1); })],
    ['a guide add-on now charged per guest', () => changed(SIX.source, (tour) => { tour.addons[0].perGuest = true; })],
    ['another currency', () => changed(SIX.source, (tour) => { tour.detail.pricingSummary!.currency = 'EUR'; })],
    ['an inclusion this package leaves out that is gone', () => changed(SIX.source, (tour) => {
      tour.detail.whatsIncluded = tour.detail.whatsIncluded.filter((line: string) => line !== 'Meals as mentioned per day');
    })],
    ['an exclusion this package restates that is gone', () => changed(SIX.source, (tour) => { tour.detail.whatsNotIncluded = ['Tips (optional)']; })],
    ['a different number of days', () => changed(SIX.source, (tour) => { tour.detail.itinerary.push({ title: 'Day 7 - One more day', description: '' }); })],
    ['a day with no title', () => changed(SIX.source, (tour) => { tour.detail.itinerary[2].title = ''; })],
  ])('refuses %s', (_case, build) => {
    const altered = build();
    // Whichever half of the build reads the changed fact, the run stops before a write.
    expect(() => {
      const details = buildPackageDetails(SIX, TODAY, altered);
      buildPackageListing(SIX, details, { tenantId, today: TODAY, images: [image(SIX)], snapshot: altered });
    }).toThrow(KeyOfEgyptPackageError);
  });

  it('refuses a record the snapshot does not hold at all', () => {
    const without = { ...snapshot, tours: snapshot.tours.filter((tour) => tour.slug !== NINE.source) };
    expect(() => buildPackageDetails(NINE, TODAY, without)).toThrow(/not in the snapshot/);
  });

  it('refuses a photograph that is not on the network\'s own image account', () => {
    const details = buildPackageDetails(SIX, TODAY, snapshot);
    expect(() => buildPackageListing(SIX, details, {
      tenantId, today: TODAY, snapshot, images: [{ url: 'https://images.example.com/photo.jpg', alt: SIX.photoAlt }],
    })).toThrow(/network's own image account/);
  });
});

describe('what the dry run and the writes do to the database', () => {
  it('prints the tenant it found and both records, and writes nothing at all', async () => {
    const report = await dryRunReport(TODAY, { snapshot }) as any;
    expect(report.mode).toBe('dry-run');
    expect(report.tenant).toEqual({ slug: KEYOFEGYPT_TENANT, id: String(tenantId), status: 'active' });
    expect(report.writes).toBe('none');
    expect(report.packages.map((row: any) => [row.slug, row.action, row.days, row.nights, row.fromPrice])).toEqual([
      [packageSlug(SIX), 'create', 6, 5, 2205],
      [packageSlug(NINE), 'create', 9, 8, 2415],
    ]);
    expect(report.packages[0].levels).toEqual([
      'Premium 5-Star Hotels & Nile Cruise: adult 2100, child 1400 USD',
      'Deluxe 5-Star Hotels & Nile Cruise: adult 2200, child 1650 USD',
      'Luxury 5-Star Hotels & Nile Cruise: adult 2250, child 1750 USD',
    ]);
    expect(report.packages.every((row: any) => row.problems.length === 0)).toBe(true);
    expect(await Attraction.countDocuments({})).toBe(0);
  });

  it('refuses a dry run when the site does not exist here', async () => {
    await Tenant.collection.deleteOne({ _id: tenantId });
    await expect(dryRunReport(TODAY, { snapshot })).rejects.toThrow(/does not exist here/);
  });

  it('creates both packages once, and a second run writes nothing twice', async () => {
    const first = ports();
    const created = await applyKeyOfEgyptPackages(TODAY, { ...first, snapshot });
    expect(created.map((row) => [row.slug, row.result])).toEqual([
      [packageSlug(SIX), 'created'], [packageSlug(NINE), 'created'],
    ]);
    expect(first.readPhoto).toHaveBeenCalledTimes(2);
    expect(first.uploadPhoto).toHaveBeenCalledWith('https://cdn.example.invalid/' + SIX.source + '.jpg', photoPublicId(SIX));

    const again = await applyKeyOfEgyptPackages(TODAY, { ...ports(), snapshot });
    expect(again.map((row) => row.result)).toEqual(['unchanged', 'unchanged']);
    expect(await Attraction.countDocuments({ listingType: 'package' })).toBe(2);
    for (const spec of KEYOFEGYPT_PACKAGES) {
      const record = await Attraction.findOne({ slug: packageSlug(spec) }).lean();
      expect(record).toMatchObject({
        status: 'active', listingType: 'package', currency: 'USD', pathSlug: spec.path,
        ownerTenantId: tenantId, packageRevision: 0, rating: 0, reviewCount: 0, enquiryOnly: false,
      });
      expect((record!.tenantIds || []).map(String)).toEqual([String(tenantId)]);
      expect(record!.images).toEqual([PHOTO]);
    }
  });

  it('rewrites a record whose words drifted, under its own revision, and keeps one record each', async () => {
    await applyKeyOfEgyptPackages(TODAY, { ...ports(), snapshot });
    await Attraction.collection.updateOne({ slug: packageSlug(SIX) }, { $set: { shortDescription: 'An edit from somewhere else' } });
    const second = await applyKeyOfEgyptPackages(TODAY, { ...ports(), snapshot });
    expect(second.map((row) => row.result)).toEqual(['updated', 'unchanged']);
    const record = await Attraction.findOne({ slug: packageSlug(SIX) }).lean();
    expect(record!.shortDescription).toBe(SIX.short);
    expect(record!.packageRevision).toBe(1);
    expect(await Attraction.countDocuments({ listingType: 'package' })).toBe(2);
  });

  it('never overwrites a record of the same address that it did not write', async () => {
    await Attraction.collection.insertOne({
      slug: packageSlug(SIX), pathSlug: SIX.path, title: 'Someone else\'s listing', listingType: 'tour',
      status: 'active', ownerTenantId: otherTenantId, tenantIds: [otherTenantId], currency: 'USD',
    } as never);
    await expect(applyKeyOfEgyptPackages(TODAY, { ...ports(), snapshot })).rejects.toThrow(/held by another record/);
    const untouched = await Attraction.findOne({ slug: packageSlug(SIX) }).lean();
    expect(untouched!.title).toBe('Someone else\'s listing');
    // The whole run is checked before its first write, so the second package was not written either.
    expect(await Attraction.countDocuments({ slug: packageSlug(NINE) })).toBe(0);
  });

  it('writes nothing while website URL writes are paused', async () => {
    process.env.URL_NAMESPACE_WRITES_READY = 'false';
    await expect(applyKeyOfEgyptPackages(TODAY, { ...ports(), snapshot })).rejects.toThrow(/paused/);
    expect(await Attraction.countDocuments({})).toBe(0);
  });

  it('archives only the records it created, and refuses one it did not', async () => {
    await applyKeyOfEgyptPackages(TODAY, { ...ports(), snapshot });
    const archived = await removeKeyOfEgyptPackages();
    expect(archived).toEqual([
      { slug: packageSlug(SIX), result: 'archived' }, { slug: packageSlug(NINE), result: 'archived' },
    ]);
    for (const spec of KEYOFEGYPT_PACKAGES) {
      const record = await Attraction.findOne({ slug: packageSlug(spec) }).lean();
      expect(record).toMatchObject({ status: 'archived', statusBeforeArchive: 'active' });
      expect(record!.archivedAt).toBeInstanceOf(Date);
    }
    // Soft: the records are still there, and a repeat says so instead of changing them again.
    expect(await removeKeyOfEgyptPackages()).toEqual([
      { slug: packageSlug(SIX), result: 'already-archived' }, { slug: packageSlug(NINE), result: 'already-archived' },
    ]);
  });

  it('refuses to archive a record of the same address that another site owns', async () => {
    await applyKeyOfEgyptPackages(TODAY, { ...ports(), snapshot });
    await Attraction.collection.updateOne({ slug: packageSlug(NINE) }, { $set: { title: 'Renamed by someone else' } });
    await expect(removeKeyOfEgyptPackages()).rejects.toThrow(/not written by this script/);
    expect(await Attraction.countDocuments({ status: 'archived' })).toBe(0);
    expect(isOwnRecord(NINE, tenantId, { _id: new Types.ObjectId(), slug: packageSlug(NINE), title: 'Renamed by someone else', listingType: 'package', ownerTenantId: tenantId, tenantIds: [tenantId] })).toBe(false);
  });
});

describe('what a visitor, another site and the booking rails see', () => {
  const firstBookable = addDays(TODAY, 10);
  const month = firstBookable.slice(0, 7);
  const packageId = async (spec: KeyOfEgyptPackage) =>
    String((await Attraction.findOne({ slug: packageSlug(spec) }).select('_id').lean())!._id);

  beforeEach(async () => { await applyKeyOfEgyptPackages(TODAY, { ...ports(), snapshot }); });

  it('lists both packages on this site and opens each at its own address', async () => {
    const list = await site(request(app).get('/attractions')).query({ listingType: 'package' }).expect(200);
    expect(list.body.data.map((row: any) => row.slug).sort()).toEqual([packageSlug(NINE), packageSlug(SIX)].sort());
    const detail = await site(request(app).get(`/attractions/${SIX.path}`)).expect(200);
    expect(detail.body.data.title).toBe(SIX.title);
    expect(detail.body.data.packageDetails.durationDays).toBe(6);
    // The rate matrix never reaches a storefront: prices come from the quote and the calendar.
    expect(JSON.stringify(detail.body.data.packageDetails)).not.toContain('rates');
  });

  it('prices the calendar and the quote exactly as the record publishes, with the fee inside', async () => {
    const id = await packageId(SIX);
    const calendar = await site(request(app).get(`/packages/${id}/calendar`)).query({ month, travellers: 2 }).expect(200);
    const day = calendar.body.data.days.find((row: any) => row.date === firstBookable);
    expect(day.status).toBe('available');
    // 2100 for each of the two adults, plus the 5% service fee inside the price.
    expect(day.perPersonFrom).toBe(2205);

    const quote = await site(request(app).post(`/packages/${id}/quote`)).send({
      date: firstBookable, tierKey: 'premium', rooms: [{ adults: 2 }], extras: [{ id: 'guide-english', quantity: 1 }],
    }).expect(200);
    expect(quote.body.data.quote.subtotal).toBe(4200);
    expect(quote.body.data.quote.total).toBe(4410);
    expect(quote.body.data.quote.perPerson).toBe(2205);
    expect(quote.body.data.alternatives.map((row: any) => [row.key, row.total])).toEqual([
      ['premium', 4410], ['deluxe', 4620], ['luxury', 4725],
    ]);

    // One adult with one child pays the adult rate once and the record's child rate once.
    const family = await site(request(app).post(`/packages/${id}/quote`)).send({
      date: firstBookable, tierKey: 'premium', rooms: [{ adults: 1, children: 1 }], extras: [{ id: 'guide-english', quantity: 1 }],
    }).expect(200);
    expect(family.body.data.quote.subtotal).toBe(3500);
    expect(family.body.data.quote.total).toBe(3675);

    // The German guide costs what the record's own add-on costs, with the fee inside it.
    const german = await site(request(app).post(`/packages/${id}/quote`)).send({
      date: firstBookable, tierKey: 'premium', rooms: [{ adults: 2 }], extras: [{ id: 'guide-german', quantity: 1 }],
    }).expect(200);
    expect(german.body.data.quote.total).toBe(4410 + 262.5);
  });

  it('prices the nine-day trip at its one level', async () => {
    const id = await packageId(NINE);
    const quote = await site(request(app).post(`/packages/${id}/quote`)).send({
      date: firstBookable, tierKey: 'cairo-hotel-and-cruise', rooms: [{ adults: 2 }],
    }).expect(200);
    expect(quote.body.data.quote.subtotal).toBe(4600);
    expect(quote.body.data.quote.total).toBe(4830);
  });

  it('shows them to nobody else: another site\'s visitor gets nothing', async () => {
    const id = await packageId(SIX);
    const list = await site(request(app).get('/attractions'), 'another-network-site').query({ listingType: 'package' }).expect(200);
    expect(list.body.data).toEqual([]);
    await site(request(app).get(`/attractions/${SIX.path}`), 'another-network-site').expect(404);
    await site(request(app).get(`/packages/${id}/calendar`), 'another-network-site').query({ month, travellers: 2 }).expect(404);
    await site(request(app).post(`/packages/${id}/quote`), 'another-network-site')
      .send({ date: firstBookable, tierKey: 'premium', rooms: [{ adults: 2 }], extras: [{ id: 'guide-english', quantity: 1 }] })
      .expect(404);
  });

  it('still takes no booking for this site', async () => {
    expect(isTenantBookingCreationClosed({ slug: KEYOFEGYPT_TENANT } as never)).toBe(true);
    await expect(assertTenantIdsBookingCreationAllowed([tenantId])).rejects.toThrow(TenantBookingCreationClosedError);
    await expect(assertTenantIdsBookingCreationAllowed([tenantId])).rejects.toThrow(/temporarily unavailable/);
    // A site that is open is unaffected by this one's closure.
    await expect(assertTenantIdsBookingCreationAllowed([otherTenantId])).resolves.toBeUndefined();
  });

  it('passes the admin path\'s own create, save and publish, field for field', async () => {
    // The seed writes directly; this proves the same documents satisfy the editor's checks.
    const details = buildPackageDetails(SIX, TODAY, snapshot);
    const listing = buildPackageListing(SIX, details, { tenantId, today: TODAY, images: [image(SIX)], snapshot });
    const draft = {
      ...listing,
      slug: `${listing.slug}-through-the-editor`,
      pathSlug: `${SIX.path}-through-the-editor`,
      status: 'draft',
      tenantIds: [String(tenantId)],
    };
    for (const field of ['priceFrom', 'duration', 'cancellationPolicy', 'packageDetails', 'pricingOptions', 'entryWindows', 'addons']) {
      delete (draft as Record<string, unknown>)[field];
    }
    const created = await request(app).post('/attractions').set('x-test-role', 'super-admin').send(draft).expect(201);
    const id = created.body.data._id;
    const saved = await request(app).put(`/packages/${id}`).set('x-test-role', 'super-admin')
      .send({ expectedRevision: 0, packageDetails: details }).expect(200);
    expect(saved.body.data.problems).toEqual([]);
    const published = await request(app).post(`/packages/${id}/publish`).set('x-test-role', 'super-admin')
      .send({ expectedRevision: 1 }).expect(200);
    expect(published.body.data.status).toBe('active');
    expect(published.body.data.fromPrice.perPerson).toBe(2205);
    const stored = await Attraction.findById(id).lean();
    expect(stored!.duration).toBe(listing.duration);
    expect(stored!.priceFrom).toBe(listing.priceFrom);
    expect(stored!.cancellationPolicy).toBe(listing.cancellationPolicy);
  });
});

describe('the quote the pricing service gives, without a database', () => {
  it('charges the record\'s own prices for every level of the six-day trip', () => {
    const details = buildPackageDetails(SIX, TODAY, snapshot);
    const date = addDays(TODAY, 20);
    for (const [tierKey, total] of [['premium', 4410], ['deluxe', 4620], ['luxury', 4725]] as const) {
      const selection = packageSelectionSchema.parse({ date, tierKey, rooms: [{ adults: 2, bedPreference: 'twin' }], extras: [{ id: 'guide-english', quantity: 1 }] });
      expect(pricePackageSelection({ details, currency: 'USD', selection, today: TODAY }))
        .toMatchObject({ ok: true, quote: { bookingReady: true, total, travellers: { adults: 2, children: 0, infants: 0 } } });
    }
  });

  it('refuses a single room, a third traveller and an infant, as the package is configured', () => {
    const details = buildPackageDetails(SIX, TODAY, snapshot);
    const date = addDays(TODAY, 20);
    const price = (rooms: unknown) => pricePackageSelection({
      details, currency: 'USD', today: TODAY,
      selection: packageSelectionSchema.parse({ date, tierKey: 'premium', rooms, extras: [{ id: 'guide-english', quantity: 1 }] }),
    });
    expect(price([{ adults: 1 }])).toMatchObject({ ok: false, code: 'ROOM_INVALID' });
    expect(price([{ adults: 3 }])).toMatchObject({ ok: false, code: 'ROOM_INVALID' });
    expect(price([{ adults: 2, infants: 1 }])).toMatchObject({ ok: false, code: 'ROOM_INVALID' });
    expect(price([{ adults: 2 }, { adults: 2 }])).toMatchObject({ ok: false, code: 'PARTY_SIZE' });
  });

  it('cannot be booked before the notice period, and cannot be booked without a guide language', () => {
    const details = buildPackageDetails(SIX, TODAY, snapshot);
    const tooSoon = pricePackageSelection({
      details, currency: 'USD', today: TODAY,
      selection: packageSelectionSchema.parse({ date: addDays(TODAY, 2), tierKey: 'premium', rooms: [{ adults: 2 }] }),
    });
    expect(tooSoon).toMatchObject({ ok: false, code: 'DATE_UNAVAILABLE', dateStatus: 'too-soon' });
    const noLanguage = pricePackageSelection({
      details, currency: 'USD', today: TODAY,
      selection: packageSelectionSchema.parse({ date: addDays(TODAY, 20), tierKey: 'premium', rooms: [{ adults: 2 }] }),
    });
    expect(noLanguage).toMatchObject({ ok: true, quote: { bookingReady: false } });
  });
});

describe('the plan a run works from', () => {
  it('reads and copies one photograph per package, only when it writes', async () => {
    const dry = ports();
    const dryPlans = await planKeyOfEgyptPackages(tenantId, TODAY, { ...dry, snapshot, withPhotos: false });
    expect(dry.readPhoto).not.toHaveBeenCalled();
    expect(dry.uploadPhoto).not.toHaveBeenCalled();
    expect(dryPlans.flatMap((plan) => plan.problems)).toEqual([]);
    expect(dryPlans.map((plan) => (plan.listing.images as string[]).length)).toEqual([0, 0]);

    const live = ports();
    const plans = await planKeyOfEgyptPackages(tenantId, TODAY, { ...live, snapshot, withPhotos: true });
    expect(live.readPhoto.mock.calls.map((call) => call[0])).toEqual([SIX.source, NINE.source]);
    expect(live.uploadPhoto.mock.calls.map((call) => call[1])).toEqual([photoPublicId(SIX), photoPublicId(NINE)]);
    expect(plans.map((plan) => plan.listing.images)).toEqual([[PHOTO], [PHOTO]]);
    expect(plans.flatMap((plan) => plan.problems)).toEqual([]);
  });
});
