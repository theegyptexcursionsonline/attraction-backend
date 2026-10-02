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
import { PromoCode } from '../models/PromoCode';
import { encryptSecret } from '../utils/secretCrypto';
import { addDays, packageQuoteHash, packageSelectionSchema, todayInZone } from '../services/packagePricing.service';
import { expireStaleCardHolds, failCardBookingAndReleaseInventory, markCardPaymentFailed, releaseBookingInventory, runBookingTransaction } from '../services/bookingInventory.service';
import { bookingStripePaymentRequest } from '../services/bookingPaymentBinding.service';
import { PackageDetailsInput } from '../utils/packageDetails';
import { samplePackageInput } from '../test/packageFixture';
import * as packageBookingService from '../services/packageBooking.service';
import * as packagePromoService from '../services/packagePromo.service';
import * as stripeService from '../services/stripe.service';

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
  await Promise.all([Tenant.init(), Attraction.init(), Availability.init(), Booking.init(), IdempotencyKey.init(), PromoCode.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  process.env.URL_NAMESPACE_WRITES_READY = 'true';
  process.env.PACKAGES_PUBLISHING_ENABLED = 'true';
  info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  await Promise.all([Tenant, Attraction, Availability, Booking, IdempotencyKey, PromoCode].map(model => model.collection.deleteMany({})));
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

  it.each(['price', 'stock', 'gateway', 'source'] as const)('recovers the immutable receipt after %s changes and retains its commitment beyond TTL', async change => {
    const id = await publishedPackage();
    const quoted = await quote(id);
    const body = { selection: selection(), quoteHash: quoted.quoteHash, guestDetails };
    const key = 'qa-replay-mutable-000001';
    const first = await book(id, body, key).expect(201);
    if (change === 'price') await Attraction.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { 'packageDetails.rates.0.double': 99999, currency: 'EUR' } });
    if (change === 'stock') await Availability.collection.updateOne({ attractionId: new Types.ObjectId(id), date: day(10) }, { $set: { isBlocked: true, allDayCapacity: 0 } });
    if (change === 'gateway') await Tenant.collection.updateOne({ _id: owner }, { $set: { 'paymentSettings.stripe.enabled': false } });
    if (change === 'source') await Attraction.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { status: 'draft', archivedAt: new Date() }, $unset: { packageDetails: '' } });
    const replay = await book(id, body, key).expect(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body.data).toMatchObject({ _id: first.body.data._id, reference: first.body.data.reference, total: first.body.data.total, currency: first.body.data.currency });
    expect(await Booking.countDocuments()).toBe(1);
    expect(await seatsBooked(id, 10)).toBe(3);
    expect((await IdempotencyKey.findOne({ resourceId: first.body.data._id }).lean())?.expiresAt).toBeUndefined();
  });

  it('binds replay to its site, input and principal including guest/account changes', async () => {
    const id = await publishedPackage();
    const quoted = await quote(id);
    const body = { selection: selection(), quoteHash: quoted.quoteHash, guestDetails };
    const key = 'qa-replay-owner-000001';
    const first = await book(id, body, key).set('x-test-role', 'customer').set('x-test-user', customerId).expect(201);
    await book(id, body, key).set('x-test-role', 'customer').set('x-test-user', customerId).expect(200);
    for (const response of [await book(id, body, key), await book(id, body, key).set('x-test-role', 'customer').set('x-test-user', '0000000000000000000000c2'), await book(id, { ...body, guestDetails: { ...guestDetails, firstName: 'Other' } }, key).set('x-test-role', 'customer').set('x-test-user', customerId)]) {
      expect(response.status).toBe(409); expect(response.body.code).toBe('IDEMPOTENCY_CONFLICT'); expect(response.body).not.toHaveProperty('data');
    }
    const foreign = await book(id, body, key, other);
    expect(foreign.status).toBe(409); expect(foreign.body).not.toHaveProperty('data');
    expect(await Booking.countDocuments()).toBe(1);
    expect(await seatsBooked(id,10)).toBe(3);
    // Legacy commitments omitted principal; immutable Booking ownership still denies adoption.
    const record = await IdempotencyKey.findOne({ resourceId: first.body.data._id });
    expect(record).not.toBeNull();
    const crypto = require('crypto') as typeof import('crypto');
    const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}` : JSON.stringify(value) ?? 'null';
    const legacyHash = crypto.createHash('sha256').update(stable({ tenantId: String(owner), attractionId:id, selection:packageSelectionSchema.parse(selection()), guestDetails, travellerNames:null, paymentMethod:'card', quoteHash:quoted.quoteHash })).digest('hex');
    await IdempotencyKey.updateOne({ _id:record!._id },{ $set:{requestHash:legacyHash, expiresAt:new Date(Date.now()+60000)} });
    await book(id,body,key).set('x-test-role','customer').set('x-test-user',customerId).expect(200);
    expect((await IdempotencyKey.findById(record!._id).lean())?.expiresAt).toBeUndefined();
    expect((await book(id,body,key)).body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('serializes concurrent same-key calls into one booking and one seat reservation', async () => {
    const id = await publishedPackage(); const quoted = await quote(id);
    const body = { selection: selection(), quoteHash: quoted.quoteHash, guestDetails };
    const responses = await Promise.all([book(id,body,'qa-concurrent-same-0001'),book(id,body,'qa-concurrent-same-0001')]);
    expect(responses.filter(r=>r.status===201)).toHaveLength(1);
    const otherResponse = responses.find(r=>r.status!==201)!;
    expect([200,409]).toContain(otherResponse.status);
    if(otherResponse.status===409) expect(otherResponse.body).toMatchObject({code:'IDEMPOTENCY_PROCESSING',retryable:true});
    expect(await Booking.countDocuments()).toBe(1); expect(await seatsBooked(id,10)).toBe(3);
    await book(id,body,'qa-concurrent-same-0001').expect(200);
  });

  it('returns a retryable processing commitment without creating another hold', async () => {
    const id = await publishedPackage(); const quoted = await quote(id);
    const body = { selection: selection(), quoteHash: quoted.quoteHash, guestDetails };
    const key = 'qa-processing-key-000001';
    const first = await book(id,body,key).expect(201);
    await IdempotencyKey.updateOne({ resourceId:first.body.data._id },{$set:{status:'processing'}});
    const pending = await book(id,body,key).expect(409);
    expect(pending.headers['retry-after']).toBe('2');
    expect(pending.body).toMatchObject({code:'IDEMPOTENCY_PROCESSING',retryable:true});
    expect(pending.body).not.toHaveProperty('data');
    await book(id,{...body,guestDetails:{...guestDetails,firstName:'Changed'}},key).expect(409);
    expect(await Booking.countDocuments()).toBe(1); expect(await seatsBooked(id,10)).toBe(3);
    await IdempotencyKey.updateOne({ resourceId:first.body.data._id },{$set:{status:'completed'}});
    await book(id,body,key).expect(200);
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

describe('package promotion lifecycle', () => {
  const promo = (changes: Record<string, unknown> = {}) => PromoCode.create({
    code: 'PACKAGE10', description: 'Package savings', tenantId: owner, currency: 'USD', discountType: 'percentage', discountValue: 10,
    minOrderAmount: 0, usageLimit: 10, usageCount: 0, validFrom: new Date(Date.now() - 60_000), validUntil: new Date(Date.now() + 86_400_000), isActive: true,
    ...changes,
  });
  const chosen = () => selection({ promoCode: 'PACKAGE10' });
  const discountedBooking = async () => {
    const promotion = await promo(); const id = await publishedPackage(); const selected = chosen(); const quoted = await quote(id, selected);
    const response = await book(id, { selection: selected, quoteHash: quoted.quoteHash, guestDetails }).expect(201);
    return { promotion, id, quoted, bookingId: new Types.ObjectId(response.body.data._id) };
  };

  it('prices the verified operator discount, keeps the fee and snapshots the exact net payment', async () => {
    const promotion = await promo(); const id = await publishedPackage();
    await Attraction.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { ownerTenantId: other, reseller: { enabled: true, value: 10 } } });
    const selected = selection({ promoCode: ' package10 ' }); const quoted = await quote(id, selected);
    expect(quoted.quote).toMatchObject({ subtotal: 2540, serviceFee: 127, preDiscountTotal: 2667, discount: 254, total: 2413, perPerson: 804.33,
      promotion: { code: 'PACKAGE10', currency: 'USD', discount: 254, discountType: 'percentage', discountValue: 10 } });
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(0);
    const created = await book(id, { selection: selected, quoteHash: quoted.quoteHash, guestDetails }).expect(201);
    const stored = (await Booking.findById(created.body.data._id))!;
    expect(stored.toObject()).toMatchObject({ subtotal: 2667, fees: 0, discount: 254, total: 2413, promoCode: 'PACKAGE10',
      revenueBreakdown: { sellerEarnings: 241.3, paymentFee: 69.98, supplierEarnings: 2101.72 },
      packageBooking: { operatorSubtotal: 2540, serviceFee: 127, preDiscountTotal: 2667, discount: 254, total: 2413 },
      packagePromoClaim: { promoId: promotion._id, discount: 254 } });
    expect(bookingStripePaymentRequest(stored)).toMatchObject({ amount: 241300, currency: 'usd' });
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(1);
  });

  it.each([
    { discountType: 'fixed', discountValue: 100, expected: 100 },
    { discountType: 'percentage', discountValue: 20, maxDiscount: 50, expected: 50 },
    { discountType: 'fixed', discountValue: 9000, expected: 2540 },
  ])('caps and rounds a $discountType promotion without discounting the fee ($expected)', async ({ expected, ...changes }) => {
    await promo(changes); const id = await publishedPackage(); const quoted = await quote(id, chosen());
    expect(quoted.quote).toMatchObject({ discount: expected, total: 2667 - expected, serviceFee: 127, subtotal: 2540 });
    expect(quoted.quote.total).toBeGreaterThan(0);
  });

  it.each([{ currency: 'USD', minimum: 0.5 }, { currency: 'EUR', minimum: 0.5 }, { currency: 'GBP', minimum: 0.3 }])('refuses below the $currency card minimum before a hold, and accepts exactly $minimum', async ({ currency, minimum }) => {
    const id = await publishedPackage({ rates: samplePackageInput().rates!.map(row => ({ ...row, single: 1, double: 1, triple: 1, child: 1, infant: 0 })) });
    await Attraction.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { currency } });
    // Three travellers at 1.05 each. The code discounts the operator portion while the fee stays.
    const promotion = await promo({ currency, discountType: 'fixed', discountValue: Math.round((3.15 - minimum + 0.01) * 100) / 100 });
    const selected = selection({ promoCode: 'PACKAGE10', extras: [] });
    const refused = await request(app).post(`/packages/${id}/quote`).set('x-tenant-id', String(owner)).send(selected).expect(409);
    expect(refused.body).toMatchObject({ code: 'PROMO_UNAVAILABLE' });
    expect(refused.body.error).toContain(`less than ${currency} ${minimum.toFixed(2)} payable`);
    const direct = await book(id, { selection: selected, quoteHash: 'a'.repeat(32), guestDetails }).expect(409);
    expect(direct.body.code).toBe('PROMO_UNAVAILABLE');
    expect(await Booking.countDocuments()).toBe(0);
    expect(await IdempotencyKey.countDocuments()).toBe(0);
    expect(await seatsBooked(id, 10)).toBe(0);
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(0);

    await PromoCode.updateOne({ _id: promotion._id }, { $set: { discountValue: Math.round((3.15 - minimum) * 100) / 100 } });
    const quoted = await quote(id, selected);
    expect(quoted.quote).toMatchObject({ preDiscountTotal: 3.15, total: minimum, serviceFee: 0.15 });
    const created = await book(id, { selection: selected, quoteHash: quoted.quoteHash, guestDetails }).expect(201);
    expect(bookingStripePaymentRequest((await Booking.findById(created.body.data._id))!)).toMatchObject({ amount: Math.round(minimum * 100), currency: currency.toLowerCase() });
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(1);
  });

  it('explains unsupported discount currency without guessing FX or changing bookings without a code', async () => {
    const id = await publishedPackage();
    await Attraction.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { currency: 'EGP' } });
    const promotion = await promo({ currency: 'EGP' });
    const refused = await request(app).post(`/packages/${id}/quote`).set('x-tenant-id', String(owner)).send(chosen()).expect(409);
    expect(refused.body).toMatchObject({ code: 'PROMO_UNAVAILABLE', error: 'Package discount codes are not supported for EGP yet. Remove the code to continue.' });
    const direct = await book(id, { selection: chosen(), quoteHash: 'a'.repeat(32), guestDetails }).expect(409);
    expect(direct.body.code).toBe('PROMO_UNAVAILABLE');
    expect(await Booking.countDocuments()).toBe(0);
    expect(await IdempotencyKey.countDocuments()).toBe(0);
    expect(await seatsBooked(id, 10)).toBe(0);
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(0);
    const unchanged = await quote(id);
    expect(unchanged.quote).toMatchObject({ currency: 'EGP', total: 2667 });
    expect(unchanged.quote).not.toHaveProperty('promotion');
    await book(id, { selection: selection(), quoteHash: unchanged.quoteHash, guestDetails }).expect(201);
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(0);
  });

  it.each(['foreign', 'currency', 'expired', 'future', 'minimum', 'exhausted', 'inactive'] as const)('refuses %s eligibility without consuming a use or making a booking', async failure => {
    const changes = failure === 'foreign' ? { tenantId: other } : failure === 'currency' ? { currency: 'EUR' }
      : failure === 'expired' ? { validUntil: new Date(Date.now() - 1) } : failure === 'future' ? { validFrom: new Date(Date.now() + 60_000) }
        : failure === 'minimum' ? { minOrderAmount: 2600 } : failure === 'exhausted' ? { usageCount: 10 } : { isActive: false };
    await promo(changes); const id = await publishedPackage();
    const result = await request(app).post(`/packages/${id}/quote`).set('x-tenant-id', String(owner)).send(chosen()).expect(409);
    expect(result.body.code).toBe('PROMO_UNAVAILABLE');
    expect(await Booking.countDocuments()).toBe(0); expect(await IdempotencyKey.countDocuments()).toBe(0);
  });

  it('supports an explicitly global code but never accepts a client-supplied discount or promo identity', async () => {
    await promo({ tenantId: null }); const id = await publishedPackage(); const quoted = await quote(id, chosen());
    expect(quoted.quote.discount).toBe(254);
    await book(id, { selection: { ...chosen(), discount: 999 }, quoteHash: quoted.quoteHash, guestDetails }).expect(400);
    await book(id, { selection: chosen(), quoteHash: quoted.quoteHash, guestDetails, packagePromoClaim: { code: 'PACKAGE10' } }).expect(400);
    expect(await Booking.countDocuments()).toBe(0);
  });

  it('refuses a fully discounted zero-payable selection instead of creating an unpayable card hold', async () => {
    await promo({ discountType: 'percentage', discountValue: 100 });
    const id = await publishedPackage({ rates: details().rates!.map(rate => ({ ...rate, single: 0.01, double: 0.01, triple: 0.01, child: 0.01 })) });
    const response = await request(app).post(`/packages/${id}/quote`).set('x-tenant-id', String(owner))
      .send(selection({ rooms: [{ adults: 2 }], extras: [], promoCode: 'PACKAGE10' })).expect(409);
    expect(response.body.code).toBe('PROMO_UNAVAILABLE');
    expect(await Booking.countDocuments()).toBe(0);
  });

  it('binds equal-value promotion terms into the reviewed hash', async () => {
    const promotion = await promo(); const id = await publishedPackage(); const quoted = await quote(id, chosen());
    await PromoCode.updateOne({ _id: promotion._id }, { $set: { discountType: 'fixed', discountValue: 254 } });
    const refused = await book(id, { selection: chosen(), quoteHash: quoted.quoteHash, guestDetails }).expect(409);
    expect(refused.body).toMatchObject({ code: 'PRICE_CHANGED', quote: { total: quoted.quote.total } });
    expect(refused.body.quoteHash).not.toBe(quoted.quoteHash); expect(await Booking.countDocuments()).toBe(0);
  });

  it.each(['tenant', 'code', 'cap', 'minimum', 'expiry', 'active', 'amount'] as const)('rolls back all effects when promo %s changes after pricing', async change => {
    const promotion = await promo(); const id = await publishedPackage(); const quoted = await quote(id, chosen());
    const original = packagePromoService.claimPackagePromo;
    jest.spyOn(packagePromoService, 'claimPackagePromo').mockImplementationOnce(async (...args) => {
      const changed = change === 'tenant' ? { tenantId: other } : change === 'code' ? { code: 'RENAMED' }
        : change === 'cap' ? { maxDiscount: 5 } : change === 'minimum' ? { minOrderAmount: 1 }
          : change === 'expiry' ? { validUntil: new Date(Date.now() - 1) } : change === 'active' ? { isActive: false } : { discountValue: 20 };
      await PromoCode.collection.updateOne({ _id: promotion._id as Types.ObjectId }, { $set: changed });
      return original(...args);
    });
    const refused = await book(id, { selection: chosen(), quoteHash: quoted.quoteHash, guestDetails }).expect(409);
    expect(refused.body.code).toBe('PROMO_CHANGED');
    expect(await Booking.countDocuments()).toBe(0); expect(await IdempotencyKey.countDocuments()).toBe(0); expect(await seatsBooked(id, 10)).toBe(0);
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(0);
  });

  it('gives the last promo use to one concurrent booking only', async () => {
    const promotion = await promo({ usageLimit: 1 }); const id = await publishedPackage(); const quoted = await quote(id, chosen());
    const body = { selection: chosen(), quoteHash: quoted.quoteHash, guestDetails };
    const results = await Promise.all([book(id, body, 'qa-promo-last-use-00001'), book(id, body, 'qa-promo-last-use-00002')]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect(['PROMO_CHANGED', 'PROMO_UNAVAILABLE']).toContain(results.find(result => result.status === 409)!.body.code);
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(1);
    expect(await Booking.countDocuments()).toBe(1); expect(await IdempotencyKey.countDocuments()).toBe(1); expect(await seatsBooked(id, 10)).toBe(3);
  });

  it('replays a lost booking response after promo expiry without claiming again', async () => {
    const promotion = await promo(); const id = await publishedPackage(); const quoted = await quote(id, chosen());
    const body = { selection: chosen(), quoteHash: quoted.quoteHash, guestDetails }; const key = 'qa-promo-lost-response-0001';
    const first = await book(id, body, key).expect(201);
    await PromoCode.updateOne({ _id: promotion._id }, { $set: { isActive: false } });
    const replay = await book(id, body, key).expect(200);
    expect(replay.body.data._id).toBe(first.body.data._id); expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(1);
    expect((await book(id, { ...body, selection: selection() }, key).expect(409)).body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('consumes once for concurrent submissions of the same idempotent request', async () => {
    const promotion = await promo(); const id = await publishedPackage(); const quoted = await quote(id, chosen());
    const body = { selection: chosen(), quoteHash: quoted.quoteHash, guestDetails }; const key = 'qa-promo-duplicate-request-0001';
    const results = await Promise.all([book(id, body, key), book(id, body, key)]);
    expect(results.filter(result => result.status === 201)).toHaveLength(1);
    expect(results.every(result => [200, 201, 409].includes(result.status))).toBe(true);
    for (const result of results.filter(result => result.status === 409)) expect(result.body.code).toBe('IDEMPOTENCY_PROCESSING');
    await book(id, body, key).expect(200);
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(1);
    expect(await Booking.countDocuments()).toBe(1); expect(await seatsBooked(id, 10)).toBe(3);
  });

  it('rolls the claimed use back if persisting the booking fails', async () => {
    const promotion = await promo(); const id = await publishedPackage(); const quoted = await quote(id, chosen());
    jest.spyOn(Booking, 'create').mockRejectedValueOnce(new Error('Simulated booking write failure'));
    await book(id, { selection: chosen(), quoteHash: quoted.quoteHash, guestDetails }).expect(500);
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(0);
    expect(await Booking.countDocuments()).toBe(0); expect(await IdempotencyKey.countDocuments()).toBe(0); expect(await seatsBooked(id, 10)).toBe(0);
  });

  it('releases the unpaid reservation once when competing expiry workers run', async () => {
    const { promotion, id, bookingId } = await discountedBooking();
    await Booking.collection.updateOne({ _id: bookingId }, { $set: { createdAt: new Date(Date.now() - 60 * 60_000) } });
    await Promise.all([expireStaleCardHolds(), expireStaleCardHolds()]);
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(0); expect(await seatsBooked(id, 10)).toBe(0);
    expect((await Booking.findById(bookingId))?.packagePromoClaim?.releasedAt).toBeInstanceOf(Date);
    await expireStaleCardHolds(); expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(0);
  });

  it('returns a use after customer cancellation of an unstarted unpaid checkout', async () => {
    const { promotion, id, bookingId } = await discountedBooking();
    await Booking.collection.updateOne({ _id: bookingId }, { $set: { userId: new Types.ObjectId(customerId) } });
    await request(app).patch(`/bookings/${bookingId}/cancel`).set('x-test-role', 'customer').set('x-test-user', customerId).expect(200);
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(0); expect(await seatsBooked(id, 10)).toBe(0);
  });

  it('keeps usage while a declined payment can retry or a provider payment is processing', async () => {
    const { promotion, id, bookingId } = await discountedBooking();
    await Booking.collection.updateOne({ _id: bookingId }, { $set: { stripePaymentIntentId: 'pi_package_promo', createdAt: new Date(Date.now() - 60 * 60_000) } });
    await markCardPaymentFailed(bookingId, owner, 'pi_package_promo');
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(1);
    jest.spyOn(stripeService, 'retrievePaymentIntent').mockResolvedValue({ id: 'pi_package_promo', status: 'processing' } as never);
    await expireStaleCardHolds();
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(1); expect(await seatsBooked(id, 10)).toBe(3);
  });

  it('restores a claimed payment-session use only after provider cancellation is confirmed', async () => {
    const { promotion, id, bookingId } = await discountedBooking();
    await Booking.collection.updateOne({ _id: bookingId }, { $set: { stripePaymentIntentId: 'pi_package_promo', createdAt: new Date(Date.now() - 60 * 60_000) } });
    jest.spyOn(stripeService, 'retrievePaymentIntent').mockResolvedValue({ id: 'pi_package_promo', status: 'canceled' } as never);
    await expireStaleCardHolds();
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(0); expect(await seatsBooked(id, 10)).toBe(0);
    expect((await Booking.findById(bookingId))?.stripePaymentSessionClosedAt).toBeInstanceOf(Date);
  });

  it('releases a hold for a deleted promotion without touching another code', async () => {
    const { promotion, id, bookingId } = await discountedBooking();
    await PromoCode.deleteOne({ _id: promotion._id });
    const replacement = await promo({ usageCount: 4 });
    await failCardBookingAndReleaseInventory(bookingId, owner);
    expect((await PromoCode.findById(replacement._id))?.usageCount).toBe(4);
    expect(await seatsBooked(id, 10)).toBe(0);
  });

  it.each(['succeeded', 'refunded'] as const)('never restores a %s payment redemption when inventory is released', async paymentStatus => {
    const { promotion, bookingId } = await discountedBooking();
    await Booking.collection.updateOne({ _id: bookingId }, { $set: { paymentStatus } });
    await runBookingTransaction(async session => {
      const booking = (await Booking.findById(bookingId).session(session!))!;
      await releaseBookingInventory(booking, session); await booking.save({ session }); return true;
    });
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(1);
    expect((await Booking.findById(bookingId))?.packagePromoClaim?.releasedAt).toBeUndefined();
  });

  it('rolls back a release if payment succeeds while expiry holds an older booking snapshot', async () => {
    const { promotion, id, bookingId } = await discountedBooking();
    const original = packagePromoService.releaseUnpaidPackagePromo;
    jest.spyOn(packagePromoService, 'releaseUnpaidPackagePromo').mockImplementationOnce(async (...args) => {
      await Booking.collection.updateOne({ _id: bookingId }, { $set: { paymentStatus: 'succeeded', status: 'confirmed' } });
      return original(...args);
    });
    await failCardBookingAndReleaseInventory(bookingId, owner);
    expect((await Booking.findById(bookingId))?.paymentStatus).toBe('succeeded');
    expect((await PromoCode.findById(promotion._id))?.usageCount).toBe(1); expect(await seatsBooked(id, 10)).toBe(3);
    expect((await Booking.findById(bookingId))?.packagePromoClaim?.releasedAt).toBeUndefined();
  });
});

describe('package booking/editor transaction fence', () => {
  it.each(['edit', 'unpublish', 'unlist', 'archive', 'currency'] as const)(
    'refuses a concurrent %s after the preliminary checks without booking or inventory effects', async (change) => {
      const id = await publishedPackage();
      const quoted = await quote(id);
      const original = packageBookingService.fencePackageBooking;
      jest.spyOn(packageBookingService, 'fencePackageBooking').mockImplementationOnce(async (input, session) => {
        if (change === 'edit') {
          await staff(request(app).put(`/packages/${id}`)).send({ expectedRevision: quoted.quote.packageRevision, packageDetails: details({ startCity: 'New meeting city' }) }).expect(200);
        } else {
          const changes = change === 'unpublish' ? { status: 'draft' }
            : change === 'unlist' ? { tenantIds: [other] }
              : change === 'archive' ? { archivedAt: new Date() }
                : { currency: 'EUR' };
          await Attraction.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: changes });
        }
        return original(input, session);
      });
      const response = await book(id, { selection: selection(), quoteHash: quoted.quoteHash, guestDetails }).expect(409);
      expect(response.body.code).toBe('PACKAGE_CHANGED');
      expect(await Booking.countDocuments()).toBe(0);
      expect(await IdempotencyKey.countDocuments()).toBe(0);
      expect(await seatsBooked(id, 10)).toBe(0);
      expect((await Attraction.collection.findOne({ _id: new Types.ObjectId(id) }))?.packageBookingFence).toBeUndefined();
    },
  );

  it('retries a Mongo write conflict and rechecks the revision instead of committing a stale snapshot', async () => {
    const id = await publishedPackage(); const quoted = await quote(id);
    const original = packageBookingService.fencePackageBooking;
    const fence = jest.spyOn(packageBookingService, 'fencePackageBooking').mockImplementationOnce(async (input, session) => {
      expect(session?.inTransaction()).toBe(true);
      // Establish an old transaction snapshot before a competing editor writes the same record.
      await Attraction.findById(id).session(session!);
      await staff(request(app).put(`/packages/${id}`)).send({ expectedRevision: quoted.quote.packageRevision, packageDetails: details({ startCity: 'Changed city' }) }).expect(200);
      return original(input, session);
    });
    const response = await book(id, { selection: selection(), quoteHash: quoted.quoteHash, guestDetails }).expect(409);
    expect(response.body.code).toBe('PACKAGE_CHANGED');
    expect(fence).toHaveBeenCalledTimes(2);
    expect(await Booking.countDocuments()).toBe(0);
    expect(await IdempotencyKey.countDocuments()).toBe(0);
    expect(await seatsBooked(id, 10)).toBe(0);
  });

  it('books a legacy record without a stored revision and leaves its public revision and timestamp unchanged', async () => {
    const id = await publishedPackage();
    await Attraction.collection.updateOne({ _id: new Types.ObjectId(id) }, { $unset: { packageRevision: '' } });
    const before = await Attraction.collection.findOne({ _id: new Types.ObjectId(id) });
    const quoted = await quote(id);
    expect(quoted.quote.packageRevision).toBe(0);
    const body = { selection: selection(), quoteHash: quoted.quoteHash, guestDetails };
    const key = 'qa-legacy-fence-replay-0001';
    const created = await book(id, body, key).expect(201);
    await book(id, body, key).expect(200);
    const after = await Attraction.collection.findOne({ _id: new Types.ObjectId(id) });
    expect(after?.packageRevision).toBeUndefined();
    expect(after?.updatedAt).toEqual(before?.updatedAt);
    expect(after?.packageBookingFence).toBe(1);
    expect((await Attraction.findById(id).lean())?.packageBookingFence).toBeUndefined();
    expect((await Booking.collection.findOne({ _id: new Types.ObjectId(created.body.data._id) }))?.packageBooking.packageRevision).toBe(0);
  });

  it('fences the first editor save on a legacy record with no stored revision', async () => {
    const id = await publishedPackage();
    await Attraction.collection.updateOne({ _id: new Types.ObjectId(id) }, { $unset: { packageRevision: '' } });
    const quoted = await quote(id); const original = packageBookingService.fencePackageBooking;
    jest.spyOn(packageBookingService, 'fencePackageBooking').mockImplementationOnce(async (input, session) => {
      await staff(request(app).put(`/packages/${id}`)).send({ expectedRevision: 0, packageDetails: details({ startCity: 'Changed city' }) }).expect(200);
      return original(input, session);
    });
    const refused = await book(id, { selection: selection(), quoteHash: quoted.quoteHash, guestDetails }).expect(409);
    expect(refused.body.code).toBe('PACKAGE_CHANGED');
    expect(await Booking.countDocuments()).toBe(0);
    expect(await IdempotencyKey.countDocuments()).toBe(0);
    expect(await seatsBooked(id, 10)).toBe(0);
  });

  it('rolls the internal fence back when a later reservation fails', async () => {
    const id = await publishedPackage(); const quoted = await quote(id);
    jest.spyOn(packageBookingService, 'reservePackageSeats').mockRejectedValueOnce(new packageBookingService.PackageSeatsUnavailableError());
    const refused = await book(id, { selection: selection(), quoteHash: quoted.quoteHash, guestDetails }).expect(409);
    expect(refused.body.code).toBe('SEATS_UNAVAILABLE');
    expect((await Attraction.collection.findOne({ _id: new Types.ObjectId(id) }))?.packageBookingFence).toBeUndefined();
    expect(await Booking.countDocuments()).toBe(0);
    expect(await IdempotencyKey.countDocuments()).toBe(0);
  });
});

describe('configured package choices and guest details', () => {
  const choiceDetails = (): Partial<PackageDetailsInput> => ({
    rooms: { bedPreferences: ['double', 'twin'] },
    bookingRequirements: { travellerNames: true, dateOfBirth: true, nationality: true, arrivalDetails: 'required', bedPreference: true },
    extras: [
      { id: 'included-cabin', name: 'Included river cabin', unit: 'per_booking', price: 0, accommodation: { name: 'Example vessel', city: 'Luxor', accommodationType: 'cruise', roomType: 'River cabin', imageUrls: ['https://example.com/cabin.jpg'] } },
      { id: 'suite-cabin', name: 'Suite cabin', unit: 'per_booking', price: 200 },
    ],
    optionGroups: [{ id: 'cabin', name: 'Cabin', kind: 'cabin', required: true, extraIds: ['included-cabin', 'suite-cabin'] }],
  });
  const chosen = () => selection({ rooms: [{ adults: 2, bedPreference: 'twin' }], extras: [{ id: 'included-cabin', quantity: 1 }] });
  const people = () => [
    { name: 'First Traveller', type: 'adult', dateOfBirth: '1990-01-01', nationality: 'Egypt' },
    { name: 'Second Traveller', type: 'adult', dateOfBirth: '1991-01-01', nationality: 'Egypt' },
  ];
  const arrival = () => ({ date: addDays(TODAY, 10), time: '15:20', airport: 'CAI', pickupLocation: 'Cairo airport', flightNumber: 'MS 123' });

  it('quotes incomplete required choices but never reserves seats or claims a booking for them', async () => {
    const id = await publishedPackage(choiceDetails());
    const selection = { ...chosen(), extras: [] };
    const quoted = await quote(id, selection);
    expect(quoted.quote).toMatchObject({ bookingReady: false, selectionProblems: [{ code: 'OPTION_REQUIRED', groupId: 'cabin' }] });
    const refused = await book(id, { selection, quoteHash: quoted.quoteHash, packageRevision: quoted.quote.packageRevision, guestDetails, travellerDetails: people(), arrivalDetails: arrival() }).expect(400);
    expect(refused.body.code).toBe('OPTIONS_INCOMPLETE');
    expect(await seatsBooked(id, 10)).toBe(0);
    expect(await Booking.countDocuments()).toBe(0);
    expect(await IdempotencyKey.countDocuments()).toBe(0);
  });

  it('refuses missing or inconsistent required personal fields before any booking effects', async () => {
    const id = await publishedPackage(choiceDetails());
    const selection = chosen(); const quoted = await quote(id, selection);
    for (const changes of [
      {},
      { travellerDetails: people() },
      { travellerDetails: [people()[0]], arrivalDetails: arrival() },
      { travellerDetails: [people()[0], { ...people()[1], dateOfBirth: addDays(TODAY, 1) }], arrivalDetails: arrival() },
      { travellerDetails: people(), arrivalDetails: { ...arrival(), time: '99:00' } },
    ]) {
      const refused = await book(id, { selection, quoteHash: quoted.quoteHash, packageRevision: quoted.quote.packageRevision, guestDetails, ...changes }).expect(400);
      expect(refused.body.code).toBe('BOOKING_DETAILS_INVALID');
    }
    expect(await Booking.countDocuments()).toBe(0);
    expect(await IdempotencyKey.countDocuments()).toBe(0);
    expect(await seatsBooked(id, 10)).toBe(0);
  });

  it('persists typed details and accommodation choices, and binds replay to every submitted field', async () => {
    const id = await publishedPackage(choiceDetails());
    const selection = chosen(); const quoted = await quote(id, selection);
    expect(quoted.quote.bookingReady).toBe(true);
    const body = { selection, quoteHash: quoted.quoteHash, packageRevision: quoted.quote.packageRevision, guestDetails, travellerDetails: people(), arrivalDetails: arrival() };
    const key = 'qa-completion-replay-0001';
    const first = await book(id, body, key).expect(201);
    const stored = await Booking.collection.findOne({ _id: new Types.ObjectId(first.body.data._id) });
    expect(stored?.packageBooking).toMatchObject({
      travellerDetails: people(), arrivalDetails: arrival(), travellerNames: ['First Traveller', 'Second Traveller'],
      rooms: [{ bedPreference: 'twin' }],
      extras: [{ optionGroup: { id: 'cabin', name: 'Cabin', kind: 'cabin' }, accommodation: { name: 'Example vessel', roomType: 'River cabin' } }],
      bookingRequirements: { dateOfBirth: true },
    });
    await book(id, { ...body, arrivalDetails: { ...arrival(), time: '16:00' } }, key).expect(409);
    await book(id, { ...body, travellerDetails: [people()[0], { ...people()[1], nationality: 'France' }] }, key).expect(409);
    const malformedReplay = await book(id, { ...body, arrivalDetails: { ...arrival(), time: '99:00' } }, key).expect(409);
    expect(malformedReplay.body.code).toBe('IDEMPOTENCY_CONFLICT');
    await Attraction.collection.updateOne({ _id: new Types.ObjectId(id) }, { $unset: { packageDetails: '' }, $set: { status: 'draft' } });
    const replay = await book(id, body, key).expect(200);
    expect(replay.body.data._id).toBe(first.body.data._id);
    expect(await Booking.countDocuments()).toBe(1);
    expect(await seatsBooked(id, 10)).toBe(2);
  });

  it('refuses changed requested bedding against the previously reviewed quote', async () => {
    const id = await publishedPackage(choiceDetails());
    const selection = chosen(); const quoted = await quote(id, selection);
    const response = await book(id, { selection: { ...selection, rooms: [{ adults: 2, bedPreference: 'double' }] }, quoteHash: quoted.quoteHash, packageRevision: quoted.quote.packageRevision, guestDetails, travellerDetails: people(), arrivalDetails: arrival() }).expect(409);
    expect(response.body.code).toBe('PRICE_CHANGED');
    expect(await Booking.countDocuments()).toBe(0);
  });

  it('exposes the reviewed revision and refuses missing or stale package details without effects', async () => {
    const id = await publishedPackage(choiceDetails());
    const selection = chosen(); const quoted = await quote(id, selection);
    const listing = await request(app).get(`/attractions/${id}`).set('x-tenant-id', String(owner)).expect(200);
    expect(listing.body.data.packageDetails.packageRevision).toBe(quoted.quote.packageRevision);
    const body = { selection, quoteHash: quoted.quoteHash, guestDetails, travellerDetails: people(), arrivalDetails: arrival() };
    const missing = await book(id, body).expect(409);
    expect(missing.body.code).toBe('PACKAGE_CHANGED');
    await Attraction.collection.updateOne({ _id: new Types.ObjectId(id) }, { $inc: { packageRevision: 1 }, $set: { 'packageDetails.extras.0.accommodation.name': 'Changed accommodation' } });
    const stale = await book(id, { ...body, packageRevision: quoted.quote.packageRevision }).expect(409);
    expect(stale.body.code).toBe('PACKAGE_CHANGED');
    expect(await Booking.countDocuments()).toBe(0);
    expect(await IdempotencyKey.countDocuments()).toBe(0);
    expect(await seatsBooked(id, 10)).toBe(0);
  });

  it('refuses equal-price stay timing changes and shifts quote cancellation to the first paid stay', async () => {
    const id = await publishedPackage({ extras: [{ id: 'night', name: 'Extra night', unit: 'per_room', price: 100, maxQuantity: 3, timing: 'before_trip' }] });
    const picked = selection({ rooms: [{ adults: 2 }], extras: [{ id: 'night', quantity: 2 }] });
    const quoted = await quote(id, picked);
    expect(quoted.quote.cancellationReferenceDate).toBe(addDays(TODAY, 8));
    expect(quoted.cancellation[0].cancelBy).toBe(addDays(TODAY, 8 - 30));
    // Even a direct legacy writer that forgot the revision cannot silently change the booked stay.
    await Attraction.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { 'packageDetails.extras.0.timing': 'after_trip' } });
    const changed = await book(id, { selection: picked, quoteHash: quoted.quoteHash, packageRevision: quoted.quote.packageRevision, guestDetails }).expect(409);
    expect(changed.body).toMatchObject({ code: 'PRICE_CHANGED', quote: { total: quoted.quote.total } });
    expect(await Booking.countDocuments()).toBe(0);
  });
});
