import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import attractionRoutes from '../routes/attractions.routes';
import packageRoutes from '../routes/packages.routes';
import bookingRoutes from '../routes/bookings.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { IdempotencyKey } from '../models/IdempotencyKey';
import { encryptSecret } from '../utils/secretCrypto';
import { addDays, packageQuoteHash, packageSelectionSchema, todayInZone } from '../services/packagePricing.service';
import { expireStaleCardHolds } from '../services/bookingInventory.service';
import { PackageDetailsInput } from '../utils/packageDetails';
import { samplePackageInput } from '../test/packageFixture';

// Real routes, middleware, controllers and Mongo transactions; only the signed-in identity is injected.
jest.mock('../middleware/auth.middleware', () => {
  const actual = jest.requireActual('../middleware/auth.middleware');
  const inject = (req: any) => {
    const role = req.header('x-test-role');
    if (!role) return false;
    req.user = {
      _id: new Types.ObjectId(req.header('x-test-user') || '0000000000000000000000aa'),
      role,
      assignedTenants: req.header('x-test-assigned')?.split(',').filter(Boolean) || [],
    };
    return true;
  };
  return {
    ...actual,
    authenticate: (req: any, res: any, next: any) => (inject(req) ? next() : res.status(401).json({ success: false })),
    optionalAuth: (req: any, _res: any, next: any) => { inject(req); next(); },
  };
});
jest.setTimeout(180_000);

const owner = new Types.ObjectId();
const other = new Types.ObjectId();
const customerId = '0000000000000000000000c1';
const app = express();
app.use(express.json());
app.use('/attractions', attractionRoutes);
app.use('/packages', packageRoutes);
app.use('/bookings', bookingRoutes);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ success: false, error: error.message }));

const staff = (req: request.Test) => req.set('x-test-role', 'brand-admin').set('x-test-assigned', `${owner},${other}`);
const TODAY = todayInZone('Africa/Cairo');
const details = (overrides: Partial<PackageDetailsInput> = {}): PackageDetailsInput => samplePackageInput({
  seasons: [
    { key: 'winter', name: 'Winter', from: TODAY, to: addDays(TODAY, 150) },
    { key: 'summer', name: 'Summer', from: addDays(TODAY, 151), to: addDays(TODAY, 300) },
  ],
  daily: { weekdays: [0, 1, 2, 3, 4, 5, 6], blackoutDates: [], horizonMonths: 12, dailyCapacity: 20 },
  ...overrides,
});

const publishedPackage = async (overrides: Partial<PackageDetailsInput> = {}, departures: Array<[string, number]> = []) => {
  const created = await staff(request(app).post('/attractions')).send({
    title: 'Classic Egypt: Cairo and the Nile', slug: `classic-egypt-${new Types.ObjectId()}`,
    shortDescription: 'Eight days from the Pyramids to Aswan.', description: 'A complete first trip to Egypt.',
    category: 'multi-day-tours', destination: { city: 'Cairo', country: 'Egypt', coordinates: { lat: 30.04, lng: 31.23 } },
    currency: 'USD', status: 'draft', listingType: 'package', tenantIds: [String(owner), String(other)],
  }).expect(201);
  const id = created.body.data._id as string;
  await staff(request(app).put(`/packages/${id}`)).send({ expectedRevision: 0, packageDetails: details(overrides) }).expect(200);
  for (const [date, seats] of departures) await staff(request(app).put(`/packages/${id}/departures/${date}`)).send({ seats }).expect(200);
  await staff(request(app).post(`/packages/${id}/publish`)).send({ expectedRevision: 1 }).expect(200);
  return id;
};

const guestDetails = { firstName: 'Egypt Excursions', lastName: 'Online QA', email: 'theegyptexcursionsonline@gmail.com', phone: '+201000000000', country: 'Egypt' };
const selection = (overrides: Record<string, unknown> = {}) => ({ date: addDays(TODAY, 10), tierKey: 'gold', rooms: [{ adults: 2, children: 1 }], extras: [{ id: 'airport', quantity: 1 }], ...overrides });
const quote = async (id: string, chosen = selection(), site = owner) =>
  (await request(app).post(`/packages/${id}/quote`).set('x-tenant-id', String(site)).send(chosen).expect(200)).body.data;
const book = (id: string, body: Record<string, unknown>, key = `qa-${new Types.ObjectId()}-key`, site: Types.ObjectId | null = owner) => {
  const req = request(app).post(`/packages/${id}/bookings`).set('Idempotency-Key', key);
  if (site) req.set('x-tenant-id', String(site));
  return req.send(body);
};
const day = (offset: number) => new Date(`${addDays(TODAY, offset)}T00:00:00.000Z`);
const seatsBooked = async (id: string, offset: number) =>
  (await Availability.collection.findOne({ attractionId: new Types.ObjectId(id), date: day(offset) }))?.allDayBooked ?? 0;

let mongo: MongoMemoryReplSet;
let info: jest.SpyInstance;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('package_booking'));
  // autoIndex is off in production; build the unique indexes these guarantees rely on.
  await Promise.all([Tenant.init(), Attraction.init(), Availability.init(), Booking.init(), IdempotencyKey.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  process.env.URL_NAMESPACE_WRITES_READY = 'true';
  process.env.PACKAGES_PUBLISHING_ENABLED = 'true';
  info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  await Promise.all([Tenant, Attraction, Availability, Booking, IdempotencyKey].map(model => model.collection.deleteMany({})));
  await Tenant.collection.insertMany([
    { _id: owner, slug: 'package-site', name: 'Package site', domain: 'package-site.invalid', status: 'active', timezone: 'Africa/Cairo', customPages: [],
      paymentSettings: { stripe: { enabled: true, publishableKey: 'pk_test_qa', secretKeyEnc: encryptSecret('sk_test_qa') } } },
    { _id: other, slug: 'enquiry-site', name: 'Enquiry site', domain: 'enquiry-site.invalid', status: 'active', timezone: 'Africa/Cairo', customPages: [] },
  ]);
});
afterEach(() => { info.mockRestore(); jest.restoreAllMocks(); delete process.env.PACKAGES_PUBLISHING_ENABLED; });

describe('booking a package', () => {
  it('books what was quoted: a pending card booking, seats held, the quote snapshotted', async () => {
    const id = await publishedPackage();
    const quoted = await quote(id);
    const response = await book(id, { selection: selection(), quoteHash: quoted.quoteHash, guestDetails, travellerNames: ['Lead Traveller'] }).expect(201);
    expect(response.body.data.guestAccessToken).toEqual(expect.any(String));
    const booking = await Booking.collection.findOne({ _id: new Types.ObjectId(response.body.data._id) });
    expect(booking).toMatchObject({
      tenantId: owner, attractionId: new Types.ObjectId(id), status: 'pending', paymentStatus: 'pending', paymentMethod: 'card',
      total: quoted.quote.total, subtotal: quoted.quote.total, fees: 0, discount: 0, currency: 'USD',
      inventoryReservations: [{ date: day(10), guests: 3 }],
      items: [{
        optionId: 'package:gold', optionName: 'Gold · 8 days / 7 nights', date: addDays(TODAY, 10),
        quantities: { adults: 2, children: 1, infants: 0 }, totalPrice: 2625,
        addons: [{ id: 'airport', name: 'Private airport transfer', price: 42, quantity: 1, pricingType: 'per_unit', totalPrice: 42 }],
      }],
      packageBooking: {
        version: 1, departureDate: addDays(TODAY, 10), returnDate: addDays(TODAY, 17), quoteHash: quoted.quoteHash,
        total: 2667, serviceFee: 127, operatorSubtotal: 2540, travellerNames: ['Lead Traveller'],
        tier: { key: 'gold', name: 'Gold', hotels: expect.any(Array) },
      },
    });
    expect(await seatsBooked(id, 10)).toBe(3);
    expect(info).toHaveBeenCalledWith('[packages] booking created', expect.objectContaining({ attractionId: id, guests: 3, total: 2667 }));
  });

  it('refuses a price that changed since the quote, with the new figure, and changes nothing', async () => {
    const id = await publishedPackage();
    const quoted = await quote(id);
    await Attraction.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { 'packageDetails.rates.$[cell].double': 1100 } }, { arrayFilters: [{ 'cell.tierKey': 'gold', 'cell.seasonKey': 'winter', 'cell.bandKey': 'small' }] });
    const refused = await book(id, { selection: selection(), quoteHash: quoted.quoteHash, guestDetails }).expect(409);
    expect(refused.body).toMatchObject({ code: 'PRICE_CHANGED', error: 'The price for this trip is now USD 2877.00. Review it before booking.', quote: { total: 2877 } });
    expect(refused.body.quoteHash).not.toBe(quoted.quoteHash);
    expect(await Booking.countDocuments()).toBe(0);
    expect(await seatsBooked(id, 10)).toBe(0);
  });

  it('returns the same booking for a retried request, and refuses the key for a different one', async () => {
    const id = await publishedPackage();
    const quoted = await quote(id);
    const body = { selection: selection(), quoteHash: quoted.quoteHash, guestDetails };
    const first = await book(id, body, 'qa-retry-key-000001').expect(201);
    const replay = await book(id, body, 'qa-retry-key-000001').expect(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body.data._id).toBe(first.body.data._id);
    await book(id, { ...body, guestDetails: { ...guestDetails, firstName: 'Someone else' } }, 'qa-retry-key-000001').expect(409);
    expect(await Booking.countDocuments()).toBe(1);
    expect(await seatsBooked(id, 10)).toBe(3);
  });

  it('gives the last places to exactly one of two customers booking at the same moment', async () => {
    const departure = addDays(TODAY, 20);
    const id = await publishedPackage({ departureMode: 'fixed' }, [[departure, 3]]);
    const chosen = selection({ date: departure, rooms: [{ adults: 2 }], extras: [] });
    const quoted = await quote(id, chosen);
    const results = await Promise.all([1, 2].map(n => book(id, { selection: chosen, quoteHash: quoted.quoteHash, guestDetails: { ...guestDetails, firstName: `Racer ${n}` } })));
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const loser = results.find(result => result.status === 409)!;
    expect(['SEATS_UNAVAILABLE', 'NOT_ENOUGH_SEATS']).toContain(loser.body.code);
    expect(await Booking.countDocuments()).toBe(1);
    expect(await seatsBooked(id, 20)).toBe(2);
  });

  it('answers like the quote for a date without a departure or without enough places', async () => {
    const id = await publishedPackage({ departureMode: 'fixed' }, [[addDays(TODAY, 20), 2]]);
    const missing = selection({ date: addDays(TODAY, 21), rooms: [{ adults: 2 }], extras: [] });
    const missingQuote = packageQuoteHash(id, packageSelectionSchema.parse(missing), { currency: 'USD', total: 2100 });
    expect((await book(id, { selection: missing, quoteHash: missingQuote, guestDetails }).expect(409)).body.code).toBe('NO_DEPARTURE');
    const tooMany = selection({ date: addDays(TODAY, 20), rooms: [{ adults: 3 }], extras: [] });
    const hash = packageQuoteHash(id, packageSelectionSchema.parse(tooMany), { currency: 'USD', total: 2992.5 });
    expect((await book(id, { selection: tooMany, quoteHash: hash, guestDetails }).expect(409)).body).toMatchObject({ code: 'NOT_ENOUGH_SEATS', seatsLeft: 2 });
  });

  it('refuses side doors: no key, a client price or promo code, no site, another site, a site without card payments', async () => {
    const id = await publishedPackage();
    const quoted = await quote(id);
    const body = { selection: selection(), quoteHash: quoted.quoteHash, guestDetails };
    await request(app).post(`/packages/${id}/bookings`).set('x-tenant-id', String(owner)).send(body).expect(400);
    expect((await book(id, { ...body, total: 1 }).expect(400)).body.error).toContain('Unrecognized key');
    expect((await book(id, { ...body, promoCode: 'SAVE50' }).expect(400)).body.error).toContain('Unrecognized key');
    expect((await book(id, body, undefined, null).expect(400)).body.error).toBe('Book this trip from the website that lists it');
    const elsewhere = new Types.ObjectId();
    await Tenant.collection.insertOne({ _id: elsewhere, slug: 'unrelated-site', name: 'Unrelated', domain: 'unrelated.invalid', status: 'active', customPages: [] });
    await book(id, body, undefined, elsewhere).expect(404);
    const enquiryQuote = await quote(id, selection(), other);
    expect((await book(id, { ...body, quoteHash: enquiryQuote.quoteHash }, undefined, other).expect(409)).body.error)
      .toBe('This website does not take card payments online yet. Please send an enquiry for this trip.');
    expect(await Booking.countDocuments()).toBe(0);
  });

  it('cannot be booked through tour checkout', async () => {
    const id = await publishedPackage();
    const response = await request(app).post('/bookings').set('x-tenant-id', String(owner)).set('Idempotency-Key', 'qa-tour-path-key-0001').send({
      attractionId: id, items: [{ optionId: 'package:gold', date: addDays(TODAY, 10), quantities: { adults: 2, children: 0, infants: 0 } }],
      guestDetails, paymentMethod: 'card',
    }).expect(400);
    expect(response.body.error).toBe('Invalid pricing option selected');
  });

  it('gives the places back when an unpaid hold expires', async () => {
    const id = await publishedPackage();
    const quoted = await quote(id);
    const created = await book(id, { selection: selection(), quoteHash: quoted.quoteHash, guestDetails }).expect(201);
    expect(await seatsBooked(id, 10)).toBe(3);
    await Booking.collection.updateOne({ _id: new Types.ObjectId(created.body.data._id) }, { $set: { createdAt: new Date(Date.now() - 31 * 60_000) } });
    expect(await expireStaleCardHolds()).toBe(1);
    expect(await seatsBooked(id, 10)).toBe(0);
  });
});

describe('cancelling a package booking', () => {
  const paidBooking = async (offset: number) => {
    const id = await publishedPackage();
    const chosen = selection({ date: addDays(TODAY, offset) });
    const quoted = await quote(id, chosen);
    const created = await book(id, { selection: chosen, quoteHash: quoted.quoteHash, guestDetails }).expect(201);
    const bookingId = created.body.data._id as string;
    await Booking.collection.updateOne({ _id: new Types.ObjectId(bookingId) }, { $set: { userId: new Types.ObjectId(customerId), status: 'confirmed', paymentStatus: 'succeeded' } });
    return bookingId;
  };
  const cancelAs = (bookingId: string, role: string, extra: Record<string, string> = {}) => {
    const req = request(app).patch(`/bookings/${bookingId}/cancel`).set('x-test-role', role);
    for (const [header, value] of Object.entries(extra)) req.set(header, value);
    return req;
  };

  it('sends a customer to the operator when the terms no longer refund in full', async () => {
    const bookingId = await paidBooking(10);
    const response = await cancelAs(bookingId, 'customer', { 'x-test-user': customerId }).expect(409);
    expect(response.body.error).toBe("Under this trip's terms, cancelling now is not refundable. Please contact us if you need to cancel.");
    expect((await Booking.collection.findOne({ _id: new Types.ObjectId(bookingId) }))?.status).toBe('confirmed');
  });

  it('leaves the decision to staff, who reach the normal refund checks', async () => {
    const bookingId = await paidBooking(10);
    const response = await cancelAs(bookingId, 'brand-admin', { 'x-test-assigned': String(owner) });
    expect(response.body.error).not.toContain("Under this trip's terms");
    expect(response.body.error).toBe('Collected payment requires a verified gateway refund before cancellation');
  });

  it('lets a customer cancel an unpaid trip and gives the places back', async () => {
    const id = await publishedPackage();
    const quoted = await quote(id);
    const created = await book(id, { selection: selection(), quoteHash: quoted.quoteHash, guestDetails }).expect(201);
    await Booking.collection.updateOne({ _id: new Types.ObjectId(created.body.data._id) }, { $set: { userId: new Types.ObjectId(customerId) } });
    await cancelAs(created.body.data._id, 'customer', { 'x-test-user': customerId }).expect(200);
    expect((await Booking.collection.findOne({ _id: new Types.ObjectId(created.body.data._id) }))?.status).toBe('cancelled');
    expect(await seatsBooked(id, 10)).toBe(0);
  });

  it("writes the package's own cancellation terms on the listing for emails and tickets", async () => {
    const id = await publishedPackage();
    expect((await Attraction.collection.findOne({ _id: new Types.ObjectId(id) }))?.cancellationPolicy)
      .toBe('Cancel at least 30 days before departure: full refund. At least 14 days before: 50% refund. Later: no refund.');
  });
});
