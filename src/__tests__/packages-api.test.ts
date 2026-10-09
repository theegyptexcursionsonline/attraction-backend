import express from 'express';
import request from '../test/loopbackRequest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import attractionRoutes from '../routes/attractions.routes';
import packageRoutes from '../routes/packages.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { toPublicAttractionDto } from '../controllers/attractions.controller';
import { addDays, packageQuoteHash, packageSelectionSchema, pricePackageSelection, todayInZone } from '../services/packagePricing.service';
import { PackageDetailsInput, packageDetailsSchema } from '../utils/packageDetails';
import { samplePackageInput } from '../test/packageFixture';
import { refreshPackagePrices } from '../services/packageCatalog.service';

// Real routes, middleware, controllers and Mongo writes; only the signed-in identity is injected.
jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
  authenticate: (req: any, res: any, next: any) => {
    const role = req.header('x-test-role');
    if (!role) return res.status(401).json({ success: false });
    req.user = { _id: new Types.ObjectId(), role, assignedTenants: req.header('x-test-assigned')?.split(',').filter(Boolean) || [] };
    next();
  },
  // Routes open to visitors (the catalogue list): signed in only when the test says so.
  optionalAuth: (req: any, _res: any, next: any) => {
    const role = req.header('x-test-role');
    if (role) req.user = { _id: new Types.ObjectId(), role, assignedTenants: req.header('x-test-assigned')?.split(',').filter(Boolean) || [] };
    next();
  },
}));
jest.setTimeout(120_000);

const owner = new Types.ObjectId();
const other = new Types.ObjectId();
const app = express();
app.use(express.json());
app.use('/attractions', attractionRoutes);
app.use('/packages', packageRoutes);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ success: false, error: error.message }));

type Role = 'super-admin' | 'brand-admin' | 'manager' | 'editor' | 'viewer' | 'customer';
const as = (req: request.Test, role: Role = 'brand-admin', site: Types.ObjectId = owner) => req.set('x-test-role', role).set('x-test-assigned', String(site));

// Prices depend on the operator's calendar day, so seasons are laid out from today.
const TODAY = todayInZone('Africa/Cairo');
const WINTER_FROM = TODAY;
const WINTER_TO = addDays(TODAY, 150);
const SUMMER_FROM = addDays(TODAY, 151);
const SUMMER_TO = addDays(TODAY, 300);
const FIRST_DAY = addDays(TODAY, 2);
const details = (overrides: Partial<PackageDetailsInput> = {}): PackageDetailsInput => samplePackageInput({
  seasons: [
    { key: 'winter', name: 'Winter', from: WINTER_FROM, to: WINTER_TO },
    { key: 'summer', name: 'Summer', from: SUMMER_FROM, to: SUMMER_TO },
  ],
  daily: { weekdays: [0, 1, 2, 3, 4, 5, 6], blackoutDates: [], horizonMonths: 12, dailyCapacity: 20 },
  ...overrides,
});

const listing = (overrides: Record<string, unknown> = {}) => ({
  title: 'Classic Egypt: Cairo and the Nile',
  slug: `classic-egypt-${new Types.ObjectId()}`,
  shortDescription: 'Eight days from the Pyramids to Aswan with a Nile cruise.',
  description: 'A complete first trip to Egypt with expert guides.',
  category: 'multi-day-tours',
  destination: { city: 'Cairo', country: 'Egypt', coordinates: { lat: 30.0444, lng: 31.2357 } },
  currency: 'USD',
  status: 'draft',
  listingType: 'package',
  tenantIds: [String(owner)],
  ...overrides,
});

const createPackage = async (overrides: Record<string, unknown> = {}) =>
  (await as(request(app).post('/attractions')).send(listing(overrides)).expect(201)).body.data as { _id: string };

const savePackage = (id: string, body: object, role: Role = 'brand-admin', site = owner) =>
  as(request(app).put(`/packages/${id}`), role, site).send(body);

const publishedPackage = async (overrides: Partial<PackageDetailsInput> = {}) => {
  const pkg = await createPackage();
  await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details(overrides) }).expect(200);
  await as(request(app).post(`/packages/${pkg._id}/publish`)).send({ expectedRevision: 1 }).expect(200);
  return pkg;
};

const stored = (id: string) => Attraction.collection.findOne({ _id: new Types.ObjectId(id) });

let mongo: MongoMemoryReplSet;
let info: jest.SpyInstance;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('packages_api'));
  await Promise.all([Tenant.init(), Attraction.init(), Availability.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  process.env.URL_NAMESPACE_WRITES_READY = 'true';
  process.env.PACKAGES_PUBLISHING_ENABLED = 'true';
  info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  await Promise.all([Tenant.collection.deleteMany({}), Attraction.collection.deleteMany({}), Availability.collection.deleteMany({})]);
  await Tenant.collection.insertMany([owner, other].map((_id, index) => ({
    _id, slug: `package-site-${index}`, name: `Package site ${index}`, domain: `package-site-${index}.invalid`,
    status: 'active', timezone: 'Africa/Cairo', customPages: [],
  })));
});
afterEach(() => { info.mockRestore(); jest.restoreAllMocks(); delete process.env.PACKAGES_PUBLISHING_ENABLED; });

describe('listing types on the shared attraction endpoints (PLATFORM #1069)', () => {
  it('stores an attraction ticket sent with the older productType, with its validity and venue', async () => {
    const created = await as(request(app).post('/attractions')).send(listing({
      listingType: undefined, productType: 'attraction-ticket', validityDuration: '1 day',
      venueInfo: { address: 'Giza Plateau', openingHours: '08:00–17:00', instructions: 'Gate 2', mapUrl: 'https://maps.example.com/giza' },
    })).expect(201);
    const record = await stored(created.body.data._id);
    expect(record).toMatchObject({ listingType: 'attraction', validityDuration: '1 day', venueInfo: { address: 'Giza Plateau', openingHours: '08:00–17:00', instructions: 'Gate 2', mapUrl: 'https://maps.example.com/giza' } });
    expect(record).not.toHaveProperty('productType');

    await as(request(app).patch(`/attractions/${created.body.data._id}`)).send({ productType: 'attraction-ticket', validityDuration: '2 days' }).expect(200);
    expect(await stored(created.body.data._id)).toMatchObject({ listingType: 'attraction', validityDuration: '2 days' });
    await as(request(app).patch(`/attractions/${created.body.data._id}`)).send({ productType: 'tour' }).expect(200);
    expect((await stored(created.body.data._id))?.listingType).toBe('tour');
  });

  it('refuses a venue map link that is not https', async () => {
    const response = await as(request(app).post('/attractions')).send(listing({ listingType: 'attraction', venueInfo: { mapUrl: 'javascript:alert(1)' } })).expect(400);
    expect(JSON.stringify(response.body)).toContain('Use a map link that starts with https://');
  });

  it('creates a package only as a draft without tour prices', async () => {
    const pkg = await createPackage();
    expect(await stored(pkg._id)).toMatchObject({ listingType: 'package', status: 'draft' });
    const priced = await as(request(app).post('/attractions')).send(listing({ priceFrom: 900 })).expect(400);
    expect(priced.body.error).toBe('Package prices, dates, duration and cancellation terms are set in the package editor.');
  });

  it.each([
    [{ status: 'active' }, 'Publish a package from the package editor, so its prices and dates are checked first.'],
    [{ listingType: 'tour' }, 'A package cannot be changed into another kind of listing.'],
    [{ productType: 'tour' }, 'A package cannot be changed into another kind of listing.'],
    [{ pricingOptions: [{ id: 'adult', name: 'Adult', price: 10 }] }, 'Package prices, dates, duration and cancellation terms are set in the package editor.'],
    [{ priceFrom: 1 }, 'Package prices, dates, duration and cancellation terms are set in the package editor.'],
    [{ duration: '3 hours' }, 'Package prices, dates, duration and cancellation terms are set in the package editor.'],
    [{ enquiryOnly: true }, 'Package prices, dates, duration and cancellation terms are set in the package editor.'],
  ])('keeps the tour editor from changing a package with %j', async (body, message) => {
    const pkg = await createPackage();
    const before = await stored(pkg._id);
    const response = await as(request(app).patch(`/attractions/${pkg._id}`)).send(body).expect(400);
    expect(response.body.error).toBe(message);
    expect(await stored(pkg._id)).toEqual(before);
  });

  it('lets the shared editor change a package title, and refuses turning a tour into a package', async () => {
    const pkg = await createPackage();
    await as(request(app).patch(`/attractions/${pkg._id}`)).send({ title: 'Classic Egypt in eight days' }).expect(200);
    expect((await stored(pkg._id))?.title).toBe('Classic Egypt in eight days');
    const tour = await as(request(app).post('/attractions')).send(listing({ listingType: 'tour' })).expect(201);
    const refused = await as(request(app).patch(`/attractions/${tour.body.data._id}`)).send({ listingType: 'package' }).expect(400);
    expect(refused.body.error).toBe('A tour or ticket cannot become a package. Create a new package instead.');
  });

  it("answers another site's admin with access denied, never with the listing's type", async () => {
    const pkg = await createPackage();
    const response = await as(request(app).patch(`/attractions/${pkg._id}`), 'brand-admin', other).send({ status: 'active' }).expect(403);
    expect(response.body.error).toBe('Access denied to this attraction');
  });

  it('duplicates a package as a draft package with its trip details', async () => {
    const pkg = await createPackage();
    await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details() }).expect(200);
    const copy = await as(request(app).post(`/attractions/${pkg._id}/duplicate`)).send({}).expect(201);
    const record = await stored(copy.body.data._id);
    expect(record).toMatchObject({ listingType: 'package', status: 'draft', packageDetails: { durationDays: 8, tiers: expect.any(Array) } });
    expect(record?.packageRevision ?? 0).toBe(0);
  });

  it('shows a package to the storefront without its rate matrix', () => {
    const dto = toPublicAttractionDto({ _id: 'x', title: 'Classic Egypt', listingType: 'package', packageDetails: packageDetailsSchema.parse(details()), packageRevision: 4 });
    expect(dto).toMatchObject({ listingType: 'package', packageDetails: { durationDays: 8, startCity: 'Cairo' } });
    expect(dto).not.toHaveProperty('packageRevision');
    expect(dto.packageDetails).not.toHaveProperty('rates');
    expect(toPublicAttractionDto({ _id: 'y', listingType: 'package', packageDetails: { version: 1, rates: 'broken' } })).not.toHaveProperty('packageDetails');
  });
});

describe('listing type filter on the admin list', () => {
  it('lists packages, tours (including listings saved before types existed) or tickets on their own', async () => {
    const pkg = await createPackage();
    const tour = await Attraction.collection.insertOne({ title: 'Old tour', slug: `old-tour-${new Types.ObjectId()}`, status: 'draft', tenantIds: [owner], createdAt: new Date() });
    const ticket = await Attraction.collection.insertOne({ title: 'Museum ticket', slug: `ticket-${new Types.ObjectId()}`, status: 'draft', listingType: 'attraction', tenantIds: [owner], createdAt: new Date() });
    const ids = async (listingType: string) => (await as(request(app).get(`/attractions?scope=admin&status=draft&listingType=${listingType}`)).expect(200))
      .body.data.map((row: { _id?: string; id?: string }) => String(row._id ?? row.id));
    expect(await ids('package')).toEqual([pkg._id]);
    expect(await ids('tour')).toEqual([String(tour.insertedId)]);
    expect(await ids('attraction')).toEqual([String(ticket.insertedId)]);
  });

  it("never widens an admin's sites, and refuses an unknown type", async () => {
    await createPackage();
    const foreign = await as(request(app).get('/attractions?scope=admin&status=draft&listingType=package'), 'brand-admin', other).expect(200);
    expect(foreign.body.data).toEqual([]);
    await as(request(app).get('/attractions?scope=admin&status=draft&listingType=cruise')).expect(400);
  });
});

describe('package editor', () => {
  it('opens a new package with defaults and says what is missing', async () => {
    const pkg = await createPackage();
    const response = await as(request(app).get(`/packages/${pkg._id}`)).expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.data).toMatchObject({ packageRevision: 0, status: 'draft', currency: 'USD', fromPrice: null, firstBookableDate: null });
    expect(response.body.data.packageDetails).toMatchObject({ version: 1, departureMode: 'daily', tiers: [] });
    expect(response.body.data.problems).toEqual(expect.arrayContaining(['Set how many days the trip lasts', 'Add at least one hotel level']));
    // The same problems for the editor, each with the section that fixes it, and the fee it shows prices with.
    expect(response.body.data.checklist).toEqual(expect.arrayContaining([
      { section: 'trip', message: 'Set how many days the trip lasts' },
      { section: 'levels', message: 'Add at least one hotel level' },
    ]));
    expect(response.body.data.checklist.map((problem: { message: string }) => problem.message)).toEqual(response.body.data.problems);
    expect(response.body.data.problemTotals).toMatchObject({ trip: 4, levels: 1 });
    expect(response.body.data.feeBasisPoints).toBe(500);
  });

  it("names a complete package's last problem — no bookable date — under departures", async () => {
    const pkg = await createPackage();
    await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details({ daily: { weekdays: [0, 1, 2, 3, 4, 5, 6], blackoutDates: [], horizonMonths: 1, dailyCapacity: 20 }, minNoticeDays: 60 }) }).expect(200);
    const response = await as(request(app).get(`/packages/${pkg._id}`)).expect(200);
    expect(response.body.data.checklist).toEqual([{ section: 'departures', message: expect.stringContaining('No date can be booked yet') }]);
    expect(response.body.data.problemTotals).toEqual({ departures: 1 });
  });

  it.each([
    ['super-admin', owner, 200], ['brand-admin', owner, 200], ['manager', owner, 200], ['editor', owner, 200], ['viewer', owner, 200],
    ['brand-admin', other, 404], ['viewer', other, 404], ['customer', owner, 403],
  ] as Array<[Role, Types.ObjectId, number]>)('lets %s of %s open it: %s', async (role, site, status) => {
    const pkg = await createPackage();
    await as(request(app).get(`/packages/${pkg._id}`), role, site).expect(status);
  });

  it('refuses anonymous callers, tours and malformed ids', async () => {
    const pkg = await createPackage();
    await request(app).get(`/packages/${pkg._id}`).expect(401);
    const tour = await as(request(app).post('/attractions')).send(listing({ listingType: 'tour' })).expect(201);
    await as(request(app).get(`/packages/${tour.body.data._id}`)).expect(404);
    await as(request(app).get('/packages/not-an-id')).expect(404);
  });

  it('saves the whole package, computes the from-price and duration, and bumps the revision', async () => {
    const pkg = await createPackage();
    const response = await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details() }).expect(200);
    expect(response.body.data).toMatchObject({ packageRevision: 1, problems: [], firstBookableDate: FIRST_DAY, fromPrice: { perPerson: 735, date: SUMMER_FROM, tierKey: 'gold', travellers: 2, basis: 'double' } });
    expect(await stored(pkg._id)).toMatchObject({ packageRevision: 1, priceFrom: 735, duration: '8 days / 7 nights', status: 'draft' });
    expect(info).toHaveBeenCalledWith('[packages] details saved', expect.objectContaining({ attractionId: pkg._id, revision: 1, live: false }));
  });

  it('refuses a stale save without changing anything', async () => {
    const pkg = await createPackage();
    await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details() }).expect(200);
    const before = await stored(pkg._id);
    const stale = await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details({ startCity: 'Luxor' }) }).expect(409);
    expect(stale.body.error).toBe('This package changed since you opened it. Reload to see the latest version, then try again.');
    expect(await stored(pkg._id)).toEqual(before);
  });

  it('refuses a save that lost a race after its read', async () => {
    const pkg = await createPackage();
    const original = Attraction.findOneAndUpdate.bind(Attraction);
    // Another save lands between this save's read and its write.
    jest.spyOn(Attraction, 'findOneAndUpdate').mockImplementationOnce(((...args: Parameters<typeof original>) => {
      const query = original(...args);
      const exec = query.exec.bind(query);
      query.exec = (async () => {
        await Attraction.collection.updateOne({ _id: new Types.ObjectId(pkg._id) }, { $set: { packageRevision: 1 } });
        return exec();
      }) as typeof query.exec;
      return query;
    }) as any);
    await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details() }).expect(409);
    expect((await stored(pkg._id))?.packageDetails).toBeUndefined();
  });

  it('names each invalid value', async () => {
    const pkg = await createPackage();
    const response = await savePackage(pkg._id, { expectedRevision: 0, packageDetails: { version: 1, rates: [{ tierKey: 'gold', seasonKey: 'w', bandKey: 'b', double: -5 }] } }).expect(400);
    expect(response.body.error).toBe('Some package details are not valid');
    expect(response.body.errors).toEqual(expect.arrayContaining([
      { field: 'rates.0.double', message: 'Prices cannot be negative' },
      { field: 'rates.0.tierKey', message: 'This price belongs to a hotel level that does not exist' },
    ]));
    await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details(), extra: true }).expect(400);
  });

  it.each([
    ['editor', owner, 200], ['viewer', owner, 403], ['customer', owner, 403], ['brand-admin', other, 404],
  ] as Array<[Role, Types.ObjectId, number]>)('lets %s of %s save: %s', async (role, site, status) => {
    const pkg = await createPackage();
    await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details() }, role, site).expect(status);
  });
});

describe('publishing a package', () => {
  it('publishes a complete package with its from-price and duration', async () => {
    const pkg = await createPackage();
    await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details() }).expect(200);
    const response = await as(request(app).post(`/packages/${pkg._id}/publish`)).send({ expectedRevision: 1 }).expect(200);
    expect(response.body.message).toBe('Package published');
    expect(response.body.data).toMatchObject({ status: 'active', packageRevision: 2 });
    expect(await stored(pkg._id)).toMatchObject({ status: 'active', priceFrom: 735, duration: '8 days / 7 nights', packageRevision: 2 });
    const again = await as(request(app).post(`/packages/${pkg._id}/publish`)).send({ expectedRevision: 2 }).expect(200);
    expect(again.body.message).toBe('Package is already published');
  });

  it('lists everything that stops publication: the trip and the listing', async () => {
    const pkg = await createPackage({ shortDescription: undefined, description: undefined });
    await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details({ cancellation: [] }) }).expect(200);
    const response = await as(request(app).post(`/packages/${pkg._id}/publish`)).send({ expectedRevision: 1 }).expect(400);
    const messages = response.body.errors.map((error: { message: string }) => error.message);
    expect(messages).toEqual(expect.arrayContaining([
      'Add the cancellation terms (a single rule with 0 % refund means non-refundable)',
      'Listing: add the one-sentence summary',
      'Listing: add a description',
    ]));
    expect((await stored(pkg._id))?.status).toBe('draft');
    // The editor shows the same listing problems before anyone presses publish.
    const editor = await as(request(app).get(`/packages/${pkg._id}`)).expect(200);
    expect(editor.body.data.checklist).toEqual(expect.arrayContaining([
      { section: 'listing', message: 'Listing: add the one-sentence summary' },
      { section: 'listing', message: 'Listing: add a description' },
      { section: 'cancellation', message: 'Add the cancellation terms (a single rule with 0 % refund means non-refundable)' },
    ]));
    expect(editor.body.data.problemTotals).toMatchObject({ listing: 2, cancellation: 1 });
  });

  it('names a missing category in words, in the editor and on publish', async () => {
    const pkg = await createPackage({ category: undefined });
    await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details() }).expect(200);
    const editor = await as(request(app).get(`/packages/${pkg._id}`)).expect(200);
    expect(editor.body.data.checklist).toEqual([{ section: 'listing', message: 'Listing: choose a category' }]);
    const refused = await as(request(app).post(`/packages/${pkg._id}/publish`)).send({ expectedRevision: 1 }).expect(400);
    expect(refused.body.errors.map((error: { message: string }) => error.message)).toEqual(['Listing: choose a category']);
  });

  it('refuses a package no customer could book', async () => {
    const pkg = await createPackage();
    await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details({ departureMode: 'fixed' }) }).expect(200);
    const response = await as(request(app).post(`/packages/${pkg._id}/publish`)).send({ expectedRevision: 1 }).expect(400);
    expect(response.body.errors).toEqual([{ field: 'packageDetails', message: 'No date can be booked yet — check the seasons, start days, notice period and departures' }]);
  });

  it('stays a draft while publishing packages is switched off', async () => {
    const pkg = await createPackage();
    await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details() }).expect(200);
    process.env.PACKAGES_PUBLISHING_ENABLED = 'false';
    const response = await as(request(app).post(`/packages/${pkg._id}/publish`)).send({ expectedRevision: 1 }).expect(409);
    expect(response.body.error).toBe('Packages cannot go live on the websites yet. Keep this one as a draft; it can be published once package pages open.');
    delete process.env.PACKAGES_PUBLISHING_ENABLED;
    await as(request(app).post(`/packages/${pkg._id}/publish`)).send({ expectedRevision: 1 }).expect(409);
    expect((await stored(pkg._id))?.status).toBe('draft');
  });

  it('refuses stale, foreign and unauthorised publication', async () => {
    const pkg = await createPackage();
    await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details() }).expect(200);
    await as(request(app).post(`/packages/${pkg._id}/publish`)).send({ expectedRevision: 0 }).expect(409);
    await as(request(app).post(`/packages/${pkg._id}/publish`), 'brand-admin', other).send({ expectedRevision: 1 }).expect(404);
    await as(request(app).post(`/packages/${pkg._id}/publish`), 'viewer').send({ expectedRevision: 1 }).expect(403);
    expect((await stored(pkg._id))?.status).toBe('draft');
  });

  it('keeps a live package sellable: a save that breaks it is refused', async () => {
    const pkg = await publishedPackage();
    const before = await stored(pkg._id);
    const response = await savePackage(pkg._id, { expectedRevision: 2, packageDetails: details({ rates: [] }) }).expect(400);
    expect(response.body.error).toBe('This package is live. Fix these before saving, or unpublish it first.');
    expect(response.body.errors[0]).toEqual({ field: 'packageDetails', message: 'Gold · Winter · 1 traveller: single room price missing' });
    expect(await stored(pkg._id)).toEqual(before);
    const fine = await savePackage(pkg._id, { expectedRevision: 2, packageDetails: details({ startCity: 'Giza' }) }).expect(200);
    expect(fine.body.data).toMatchObject({ status: 'active', packageRevision: 3 });
  });
  it('does not save a stale headline price or publish a discounted family rate as an adult reference', async () => {
    const pkg = await publishedPackage();
    const before = await stored(pkg._id);
    const familyOnly = details({
      rooms: { allowSingle: false, allowTriple: false, maxChildrenPerRoom: 1 },
      groupBands: [{ key: 'small', min: 3, max: 3 }],
      rates: samplePackageInput().rates!.filter(row => row.bandKey === 'small'),
      extras: [{ id: 'guide', name: 'Guide', unit: 'per_traveller', price: 30, priceChild: 15 }],
      optionGroups: [{ id: 'guide', name: 'Guide', kind: 'guide', required: true, extraIds: ['guide'] }],
    });
    const message = 'The catalogue needs a bookable price for its reference adult party. Check room types, group sizes and required options.';
    const response = await savePackage(pkg._id, { expectedRevision: 2, packageDetails: familyOnly }).expect(400);
    expect(response.body.errors).toContainEqual({ field: 'packageDetails', message });
    expect(await stored(pkg._id)).toEqual(before);
    const draft = await createPackage();
    const saved = await savePackage(draft._id, { expectedRevision: 0, packageDetails: familyOnly }).expect(200);
    expect(saved.body.data).toMatchObject({ status: 'draft', fromPrice: null, problemTotals: { prices: 1 } });
    expect(saved.body.data.checklist).toContainEqual({ section: 'prices', message });
    const publication = await as(request(app).post(`/packages/${draft._id}/publish`)).send({ expectedRevision: 1 }).expect(400);
    expect(publication.body.errors).toContainEqual({ field: 'packageDetails', message });
    expect((await stored(draft._id))?.status).toBe('draft');
  });
});

describe('package departures', () => {
  const fixedPackage = async () => {
    const pkg = await createPackage();
    await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details({ departureMode: 'fixed' }) }).expect(200);
    return pkg;
  };
  const d1 = addDays(TODAY, 20);
  const d2 = addDays(TODAY, 27);
  const d3 = addDays(TODAY, 34);

  it('adds dated departures without touching existing ones', async () => {
    const pkg = await fixedPackage();
    const first = await as(request(app).post(`/packages/${pkg._id}/departures`)).send({ dates: [d1, d2], seats: 12 }).expect(200);
    expect(first.body.data).toEqual({ created: 2, existing: 0 });
    await Availability.collection.updateOne({ attractionId: new Types.ObjectId(pkg._id), date: new Date(`${d2}T00:00:00.000Z`) }, { $set: { allDayBooked: 3 } });
    const second = await as(request(app).post(`/packages/${pkg._id}/departures`)).send({ dates: [d2, d3], seats: 8 }).expect(200);
    expect(second.body.data).toEqual({ created: 1, existing: 1 });
    const listed = await as(request(app).get(`/packages/${pkg._id}/departures?from=${TODAY}&to=${addDays(TODAY, 60)}`)).expect(200);
    expect(listed.body.data).toEqual({
      departureMode: 'fixed',
      departures: [
        { date: d1, seats: 12, booked: 0, closed: false },
        { date: d2, seats: 12, booked: 3, closed: false },
        { date: d3, seats: 8, booked: 0, closed: false },
      ],
    });
  });

  it('never sets seats below what is already booked, and closes or reopens a departure', async () => {
    const pkg = await fixedPackage();
    await as(request(app).put(`/packages/${pkg._id}/departures/${d1}`)).send({ seats: 10 }).expect(200);
    await Availability.collection.updateOne({ attractionId: new Types.ObjectId(pkg._id), date: new Date(`${d1}T00:00:00.000Z`) }, { $set: { allDayBooked: 4 } });
    const refused = await as(request(app).put(`/packages/${pkg._id}/departures/${d1}`)).send({ seats: 3 }).expect(409);
    expect(refused.body.error).toBe('4 places are already booked on this departure. Seats cannot go below that.');
    const closed = await as(request(app).put(`/packages/${pkg._id}/departures/${d1}`)).send({ seats: 4, closed: true }).expect(200);
    expect(closed.body.data).toEqual({ date: d1, seats: 4, booked: 4, closed: true });
    const reopened = await as(request(app).put(`/packages/${pkg._id}/departures/${d1}`)).send({ seats: 6 }).expect(200);
    expect(reopened.body.data).toEqual({ date: d1, seats: 6, booked: 4, closed: false });
    expect(await Availability.collection.findOne({ attractionId: new Types.ObjectId(pkg._id) })).not.toHaveProperty('blockReason');
  });

  it('removes a departure only while nobody has booked it', async () => {
    const pkg = await fixedPackage();
    await as(request(app).post(`/packages/${pkg._id}/departures`)).send({ dates: [d1, d2], seats: 12 }).expect(200);
    await Availability.collection.updateOne({ attractionId: new Types.ObjectId(pkg._id), date: new Date(`${d1}T00:00:00.000Z`) }, { $set: { allDayBooked: 1 } });
    const refused = await as(request(app).delete(`/packages/${pkg._id}/departures/${d1}`)).expect(409);
    expect(refused.body.error).toBe('This departure has bookings. Close it to stop new bookings instead.');
    await as(request(app).delete(`/packages/${pkg._id}/departures/${d2}`)).expect(200);
    await as(request(app).delete(`/packages/${pkg._id}/departures/${d2}`)).expect(404);
  });

  it('refuses past dates, any-day packages and roles without stop-sale rights', async () => {
    const pkg = await fixedPackage();
    await as(request(app).put(`/packages/${pkg._id}/departures/${addDays(TODAY, -1)}`)).send({ seats: 5 }).expect(400);
    await as(request(app).post(`/packages/${pkg._id}/departures`)).send({ dates: [addDays(TODAY, -1)], seats: 5 }).expect(400);
    await as(request(app).post(`/packages/${pkg._id}/departures`), 'editor').send({ dates: [d1], seats: 5 }).expect(403);
    await as(request(app).post(`/packages/${pkg._id}/departures`), 'manager').send({ dates: [d1], seats: 5 }).expect(200);
    await as(request(app).put(`/packages/${pkg._id}/departures/${d1}`), 'brand-admin', other).send({ seats: 5 }).expect(404);
    await as(request(app).get(`/packages/${pkg._id}/departures?from=${TODAY}&to=${addDays(TODAY, 401)}`)).expect(400);
    const daily = await createPackage();
    await savePackage(daily._id, { expectedRevision: 0, packageDetails: details() }).expect(200);
    const refused = await as(request(app).post(`/packages/${daily._id}/departures`)).send({ dates: [d1], seats: 5 }).expect(409);
    expect(refused.body.error).toContain('This package starts on any allowed day.');
  });
});

describe('public calendar and quote', () => {
  const month = TODAY.slice(0, 7);
  const selection = (overrides: Record<string, unknown> = {}) => ({ date: addDays(TODAY, 10), tierKey: 'gold', rooms: [{ adults: 2, children: 1 }], extras: [{ id: 'airport', quantity: 1 }], ...overrides });
  const site = (req: request.Test, tenant: Types.ObjectId = owner) => req.set('x-tenant-id', String(tenant));

  it('shows nothing for a draft, another site or a tour', async () => {
    const draft = await createPackage();
    await savePackage(draft._id, { expectedRevision: 0, packageDetails: details() }).expect(200);
    await site(request(app).get(`/packages/${draft._id}/calendar?month=${month}`)).expect(404);
    await site(request(app).post(`/packages/${draft._id}/quote`)).send(selection()).expect(404);
    const pkg = await publishedPackage();
    await site(request(app).get(`/packages/${pkg._id}/calendar?month=${month}`), other).expect(404);
    await site(request(app).post(`/packages/${pkg._id}/quote`), other).send(selection()).expect(404);
  });

  it('shows a month of start days with seats and per-person prices', async () => {
    const pkg = await publishedPackage();
    const response = await site(request(app).get(`/packages/${pkg._id}/calendar?month=${month}&travellers=2`)).expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const days = response.body.data.days as Array<{ date: string; status: string; reason?: string; perPersonFrom?: number }>;
    expect(response.body.data).toMatchObject({ month, currency: 'USD', travellers: 2, priceBasis: 'reference-adults' });
    expect(days.find(day => day.date === TODAY)).toMatchObject({ status: 'closed', reason: 'too-soon' });
    if (FIRST_DAY.startsWith(month)) expect(days.find(day => day.date === FIRST_DAY)).toMatchObject({ status: 'available', seatsLeft: 20, perPersonFrom: 1050 });
    await site(request(app).get(`/packages/${pkg._id}/calendar?month=2020-01`)).expect(400);
    // The storefront client adds its site scope to every request.
    await site(request(app).get(`/packages/${pkg._id}/calendar?month=${month}&tenantId=${owner}`)).expect(200);
    await site(request(app).post(`/packages/${pkg._id}/quote?tenantId=${owner}`)).send(selection()).expect(200);
    await site(request(app).get(`/packages/${pkg._id}/calendar?month=${month}&travellers=0`)).expect(400);
  });

  it('points to the next available date when a month has none', async () => {
    const pkg = await publishedPackage({ minNoticeDays: 60 });
    const response = await site(request(app).get(`/packages/${pkg._id}/calendar?month=${month}`)).expect(200);
    expect(response.body.data.days.every((day: { status: string }) => day.status !== 'available')).toBe(true);
    expect(response.body.data.nextAvailableDate).toBe(addDays(TODAY, 60));
  });

  const familyOptions: Partial<PackageDetailsInput> = {
    rooms: { allowSingle: false, allowTriple: false, maxChildrenPerRoom: 1 },
    groupBands: samplePackageInput().groupBands!.filter(band => band.min >= 2),
    rates: samplePackageInput().rates!.filter(row => row.bandKey !== 'solo'),
    extras: [{ id: 'guide', name: 'Guide', unit: 'per_traveller', price: 30, priceChild: 15 }],
    optionGroups: [{ id: 'guide', name: 'Guide language', kind: 'guide', required: true, extraIds: ['guide'] }],
  };
  it('prices the selected family rooms instead of treating the child as an extra adult', async () => {
    const pkg = await publishedPackage(familyOptions);
    const date = addDays(TODAY, 10);
    const rooms = [{ adults: 2, children: 1, infants: 1 }];
    const response = await site(request(app).get(`/packages/${pkg._id}/calendar`)).query({ month: date.slice(0, 7), travellers: 3, rooms: JSON.stringify(rooms) }).expect(200);
    expect(response.body.data.priceBasis).toBe('selected-rooms');
    const day = response.body.data.days.find((item: { date: string }) => item.date === date);
    const quoted = await site(request(app).post(`/packages/${pkg._id}/quote`)).send(selection({ date, rooms, extras: [{ id: 'guide', adults: 2, children: 1 }] })).expect(200);
    expect(day).toMatchObject({ status: 'available', perPersonFrom: quoted.body.data.quote.perPerson });
    expect(day.perPersonFrom).toBe(901.25);
    const old = await site(request(app).get(`/packages/${pkg._id}/calendar`)).query({ month: date.slice(0, 7), travellers: 3 }).expect(200);
    expect(old.body.data.days.find((item: { date: string }) => item.date === date)).toMatchObject({ status: 'closed', reason: 'no-price' });
  });
  it('finds the next family departure using the same exact room composition', async () => {
    const pkg = await publishedPackage({ ...familyOptions, minNoticeDays: 60 });
    const response = await site(request(app).get(`/packages/${pkg._id}/calendar`)).query({ month, travellers: 3, rooms: JSON.stringify([{ adults: 2, children: 1 }]) }).expect(200);
    expect(response.body.data.days.every((day: { status: string }) => day.status !== 'available')).toBe(true);
    expect(response.body.data.nextAvailableDate).toBe(addDays(TODAY, 60));
    expect(response.body.data.priceBasis).toBe('selected-rooms');
  });
  it.each([
    { travellers: 2, rooms: '[' },
    { travellers: 2, rooms: 'null' },
    { travellers: 2, rooms: '[null]' },
    { travellers: 2, rooms: JSON.stringify({ adults: 2 }) },
    { travellers: 2, rooms: '[]' },
    { travellers: 3, rooms: JSON.stringify([{ adults: 2 }]) },
    { travellers: 2, rooms: JSON.stringify([{ adults: 0, children: 2 }]) },
    { travellers: 2, rooms: JSON.stringify([{ adults: -1, children: 3 }]) },
    { travellers: 2, rooms: JSON.stringify([{ adults: 2.5 }]) },
    { travellers: 2, rooms: JSON.stringify([{ adults: 2, price: 1 }]) },
    { travellers: 21, rooms: JSON.stringify(Array.from({ length: 21 }, () => ({ adults: 1 }))) },
    { travellers: 61, rooms: JSON.stringify([...Array.from({ length: 19 }, () => ({ adults: 3 })), { adults: 3, children: 1 }]) },
  ])('refuses malformed or inconsistent calendar parties without a fallback: %j', async query => {
    const pkg = await publishedPackage();
    await site(request(app).get(`/packages/${pkg._id}/calendar`)).query({ month, ...query }).expect(400);
  });

  it('quotes exactly what the pricing engine computes, with tier comparisons and cancellation dates', async () => {
    const pkg = await publishedPackage();
    const response = await site(request(app).post(`/packages/${pkg._id}/quote`)).send(selection()).expect(200);
    const parsedSelection = packageSelectionSchema.parse(selection());
    const engine = pricePackageSelection({ details: packageDetailsSchema.parse(details()), currency: 'USD', selection: parsedSelection, today: TODAY });
    if (!engine.ok) throw new Error(engine.message);
    expect(response.body.data.quote).toEqual({ ...engine.quote, packageRevision: 2 });
    expect(response.body.data.quote.total).toBe(2 * 1050 + 525 + 42);
    expect(response.body.data.quoteHash).toBe(packageQuoteHash(pkg._id, parsedSelection, engine.quote));
    expect(response.body.data.alternatives).toEqual([
      // The extra (42) is in every total but not in the trip price per person: (2 × 1050 + 525) ÷ 3.
      { key: 'gold', name: 'Gold', total: 2667, perPerson: 889, tripPerPerson: 875, difference: 0 },
      { key: 'diamond', name: 'Diamond', total: 2 * 1470 + 735 + 42, perPerson: 1239, tripPerPerson: 1225, difference: 1050 },
    ]);
    expect(response.body.data.cancellation).toEqual([
      { daysBefore: 30, refundPercent: 100, cancelBy: addDays(TODAY, -20) },
      { daysBefore: 14, refundPercent: 50, cancelBy: addDays(TODAY, -4) },
      { daysBefore: 0, refundPercent: 0, cancelBy: addDays(TODAY, 10) },
    ]);
    expect(response.body.data.seatsLeft).toBe(20);
    expect(response.body.data.today).toBe(TODAY);
  });

  it('never accepts a price from the client', async () => {
    const pkg = await publishedPackage();
    const response = await site(request(app).post(`/packages/${pkg._id}/quote`)).send({ ...selection(), total: 1 }).expect(400);
    expect(response.body.error).toContain('Unrecognized key');
  });

  it.each([
    ['too soon', { date: TODAY }, { code: 'DATE_UNAVAILABLE', dateStatus: 'too-soon' }],
    ['a room without an adult', { rooms: [{ adults: 0, children: 1 }] }, { code: 'ROOM_INVALID', room: 1 }],
    ['an unknown hotel level', { tierKey: 'platinum' }, { code: 'UNKNOWN_TIER' }],
  ])('explains a refusal: %s', async (_label, change, expected) => {
    const pkg = await publishedPackage();
    const response = await site(request(app).post(`/packages/${pkg._id}/quote`)).send(selection(change)).expect(409);
    expect(response.body).toMatchObject({ success: false, ...expected });
    expect(typeof response.body.error).toBe('string');
  });

  it('checks seats in the database: closed, nearly full and full days', async () => {
    const pkg = await publishedPackage();
    const day = (offset: number) => new Date(`${addDays(TODAY, offset)}T00:00:00.000Z`);
    await Availability.collection.insertMany([
      { attractionId: new Types.ObjectId(pkg._id), date: day(10), timeSlots: [], allDayBooked: 0, isBlocked: true },
      { attractionId: new Types.ObjectId(pkg._id), date: day(11), timeSlots: [], allDayBooked: 19, isBlocked: false },
      { attractionId: new Types.ObjectId(pkg._id), date: day(12), timeSlots: [], allDayBooked: 20, isBlocked: false },
    ]);
    const closed = await site(request(app).post(`/packages/${pkg._id}/quote`)).send(selection({ date: addDays(TODAY, 10) })).expect(409);
    expect(closed.body).toMatchObject({ code: 'DATE_UNAVAILABLE', error: 'This date is closed for booking. Choose another date.' });
    const nearlyFull = await site(request(app).post(`/packages/${pkg._id}/quote`)).send(selection({ date: addDays(TODAY, 11) })).expect(409);
    expect(nearlyFull.body).toMatchObject({ code: 'NOT_ENOUGH_SEATS', seatsLeft: 1, error: 'Only 1 place is left on this date.' });
    const full = await site(request(app).post(`/packages/${pkg._id}/quote`)).send(selection({ date: addDays(TODAY, 12) })).expect(409);
    expect(full.body).toMatchObject({ code: 'SOLD_OUT', seatsLeft: 0 });
    // Infants do not take a seat.
    await site(request(app).post(`/packages/${pkg._id}/quote`)).send(selection({ date: addDays(TODAY, 11), rooms: [{ adults: 1, infants: 1 }] })).expect(200);
  });

  it('sells a fixed-departure package only on its departures', async () => {
    const pkg = await createPackage();
    await savePackage(pkg._id, { expectedRevision: 0, packageDetails: details({ departureMode: 'fixed' }) }).expect(200);
    await as(request(app).post(`/packages/${pkg._id}/departures`)).send({ dates: [addDays(TODAY, 20)], seats: 4 }).expect(200);
    await as(request(app).post(`/packages/${pkg._id}/publish`)).send({ expectedRevision: 1 }).expect(200);
    const missing = await site(request(app).post(`/packages/${pkg._id}/quote`)).send(selection({ date: addDays(TODAY, 21) })).expect(409);
    expect(missing.body).toMatchObject({ code: 'NO_DEPARTURE' });
    const quoted = await site(request(app).post(`/packages/${pkg._id}/quote`)).send(selection({ date: addDays(TODAY, 20) })).expect(200);
    expect(quoted.body.data.seatsLeft).toBe(4);
  });
});

describe('catalogue price refresh', () => {
  it('corrects a live package whose cheapest bookable price changed, and leaves the rest alone', async () => {
    const pkg = await publishedPackage();
    const draft = await createPackage();
    await savePackage(draft._id, { expectedRevision: 0, packageDetails: details() }).expect(200);
    await Attraction.collection.updateMany({}, { $set: { priceFrom: 999 } });
    const unchanged = await publishedPackage();
    await Attraction.collection.updateOne({ _id: new Types.ObjectId(unchanged._id) }, { $set: { priceFrom: 735 } });
    const before = await stored(unchanged._id);

    expect(await refreshPackagePrices()).toEqual({ checked: 2, updated: 1, unbookable: 0 });
    expect((await stored(pkg._id))?.priceFrom).toBe(735);
    expect((await stored(draft._id))?.priceFrom).toBe(999);
    expect(await stored(unchanged._id)).toEqual(before);
  });

  it('reports a live package nobody can book any more instead of advertising it silently', async () => {
    const pkg = await publishedPackage();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const afterEverySeason = new Date(`${addDays(SUMMER_TO, 1)}T12:00:00.000Z`);
    expect(await refreshPackagePrices(afterEverySeason)).toEqual({ checked: 1, updated: 0, unbookable: 1 });
    expect(warn).toHaveBeenCalledWith('[packages] live package has no bookable date', { attractionId: pkg._id });
    expect((await stored(pkg._id))?.priceFrom).toBe(735);
  });

  it('follows the cheapest season as earlier ones end', async () => {
    const pkg = await publishedPackage({
      rates: samplePackageInput().rates!.map(row => (row.seasonKey === 'winter' ? { ...row, double: (row.double as number) / 2 } : row)),
    });
    expect((await stored(pkg._id))?.priceFrom).toBe(525);
    expect(await refreshPackagePrices(new Date(`${addDays(WINTER_TO, 1)}T12:00:00.000Z`))).toMatchObject({ updated: 1 });
    expect((await stored(pkg._id))?.priceFrom).toBe(735);
  });
});
