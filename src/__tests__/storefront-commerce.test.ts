import { spawnSync } from 'child_process';
import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Booking } from '../models/Booking';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { StorefrontPurchase } from '../models/StorefrontPurchase';
import { generateBookingAccessToken } from '../utils/bookingAccess';
import { commerceSelection } from '../services/storefrontCommerce.service';
import commerceRoutes from '../routes/storefrontCommerce.routes';
import { priceBookingSelection } from '../services/bookingPricing.service';
import { PromoCode } from '../models/PromoCode';
import { SpecialOffer } from '../models/SpecialOffer';

jest.setTimeout(120_000);
let mongo: MongoMemoryReplSet;
const tenantId = new Types.ObjectId(), otherTenant = new Types.ObjectId(), bookingId = new Types.ObjectId(), attractionId = new Types.ObjectId();
const reference = 'AN-COMMERCE';
const guestToken = generateBookingAccessToken(String(bookingId), reference);
const app = express(); app.use(express.json()); app.use('/commerce', commerceRoutes);
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: err.message }));
const selection = [{ optionId: 'adult', date: '2099-01-01', time: '09:00', quantities: { adults: 2, children: 1, infants: 0 }, addons: [] }];
const paid = () => ({ _id: bookingId, tenantId, attractionId, reference, status: 'confirmed', paymentStatus: 'succeeded', paymentMethod: 'card', stripePaymentIntentId: 'pi_fixture',
  items: [{ optionId: 'adult', optionName: 'Public tour', date: '2099-01-01', time: '09:00', quantities: { adults: 2, children: 1, infants: 0 }, unitPrice: 80, totalPrice: 240 }],
  subtotal: 240, fees: 12, discount: 20, total: 232, currency: 'USD', guestDetails: { email: 'private-sentinel@invalid.test', firstName: 'PRIVATE_SENTINEL' } });
const claim = (tenant = tenantId, token = guestToken) => request(app).post(`/commerce/purchase/${reference}/claim`).set('X-Tenant-ID', String(tenant)).set('X-Booking-Access-Token', token).send({ consent: true });
beforeAll(async () => {
  const found = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = found.status === 0 ? found.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('commerce'));
  await Promise.all([StorefrontPurchase.init(), Booking.init(), Tenant.init(), Attraction.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await Promise.all([Booking.collection.deleteMany({}), Tenant.collection.deleteMany({}), StorefrontPurchase.collection.deleteMany({}), Attraction.collection.deleteMany({}), PromoCode.collection.deleteMany({}), SpecialOffer.collection.deleteMany({})]);
  await Tenant.collection.insertMany([{ _id: tenantId, name: 'One', slug: 'one', domain: 'one.invalid', status: 'active' }, { _id: otherTenant, name: 'Two', slug: 'two', domain: 'two.invalid', status: 'active' }]);
  await Booking.collection.insertOne(paid());
  await Attraction.collection.insertOne({ _id: attractionId, tenantIds: [tenantId], status: 'active', title: 'Public tour', slug: 'public-tour', currency: 'USD', pricingOptions: [{ id: 'adult', name: 'Tour', price: 100, childPrice: 40 }], addons: [] });
});
it('uses one server price authority without creating bookings or consuming discounts', async () => {
  await PromoCode.collection.insertOne({ code: 'SAVE', tenantId, currency: 'USD', isActive: true, validFrom: new Date('2020-01-01'), validUntil: new Date('2100-01-01'), minOrderAmount: 0, usageCount: 0, usageLimit: 10, discountType: 'fixed', discountValue: 20 });
  const result = await request(app).post('/commerce/checkout').set('X-Tenant-ID', String(tenantId)).send({ attractionId, items: selection, promoCode: 'SAVE' });
  expect(result.status).toBe(200); expect(result.body.data.value).toBe(232);
  const price = await priceBookingSelection((await Attraction.findById(attractionId))!, (await Tenant.findById(tenantId))!, selection, 'SAVE');
  expect(price.total).toBe(result.body.data.value);
  expect(await Booking.countDocuments()).toBe(1); expect((await PromoCode.findOne({ code: 'SAVE' }))!.usageCount).toBe(0);
  expect(JSON.stringify(result.body)).not.toMatch(/guest|2099|private-sentinel|Public tour/);
});
it('rejects cross-tenant quote/item lookups, invalid options, and extra customer fields', async () => {
  const quote = (body: object, tenant = tenantId) => request(app).post('/commerce/checkout').set('X-Tenant-ID', String(tenant)).send(body);
  expect((await quote({ attractionId, items: selection }, otherTenant)).status).toBe(404);
  expect((await quote({ attractionId, items: [{ ...selection[0], optionId: 'missing' }] })).status).toBe(400);
  expect((await quote({ attractionId, items: selection, email: 'private@invalid.test' })).status).toBe(400);
  expect((await request(app).get(`/commerce/item/${attractionId}`).set('X-Tenant-ID', String(otherTenant))).status).toBe(404);
  const item = await request(app).get(`/commerce/item/${attractionId}`).set('X-Tenant-ID', String(tenantId));
  expect(item.status).toBe(200); expect(item.body.data.value).toBe(100);
});
it('allows only one concurrent purchase claim and never exposes customer/capability fields in event', async () => {
  const results = await Promise.all(Array.from({ length: 6 }, () => claim()));
  expect(results.every(r => r.status === 200)).toBe(true);
  const winners = results.filter(r => r.body.data.event); expect(winners).toHaveLength(1);
  const event = winners[0].body.data.event;
  expect(event.transaction_id).toMatch(/^[a-f0-9]{64}$/); expect(event.value).toBe(232); expect(event.items[0].item_id).toBe(String(attractionId));
  expect(Object.keys(event).sort()).toEqual(['currency', 'event', 'items', 'tenantId', 'transaction_id', 'value']);
  expect(JSON.stringify(event)).not.toMatch(/PRIVATE|private|pi_fixture|AN-COMMERCE|2099|Public tour/);
  expect(event.items.reduce((n: number, i: {price: number; quantity: number}) => n + i.price * i.quantity, 0)).toBe(232);
});
it('denies absent/incorrect capabilities and cross-tenant receipt scope', async () => {
  expect((await claim(tenantId, '')).status).toBe(404);
  expect((await claim(tenantId, 'wrong')).status).toBe(404);
  expect((await claim(otherTenant)).status).toBe(404);
  expect(await StorefrontPurchase.countDocuments()).toBe(0);
});
it.each([{ paymentStatus: 'pending' }, { paymentMethod: 'pay-later' }, { status: 'cancelled' }, { status: 'refunded' }, { refundedAmount: 1 }, { stripePaymentIntentId: '' }, { bundleOrderId: new Types.ObjectId() }])('does not emit unqualified purchase %j', async (patch) => {
  await Booking.collection.updateOne({ _id: bookingId }, { $set: patch });
  expect((await claim()).status).toBe(404);
});
it('recovers an expired browser claim with same transaction id and fences its old acknowledgement', async () => {
  const first = (await claim()).body.data;
  await StorefrontPurchase.updateOne({ bookingId }, { $set: { leaseUntil: new Date(0) } });
  const second = (await claim()).body.data;
  expect(second.event.transaction_id).toBe(first.event.transaction_id); expect(second.claimToken).not.toBe(first.claimToken);
  const ack = (token: string) => request(app).post(`/commerce/purchase/${reference}/ack`).set('X-Tenant-ID', String(tenantId)).set('X-Booking-Access-Token', guestToken).send({ claimToken: token });
  expect((await ack(first.claimToken)).status).toBe(409);
  expect((await ack(second.claimToken)).status).toBe(200);
  expect((await claim()).body.data.event).toBeNull();
});
it('requires explicit consent and refuses malformed requests', async () => {
  const noConsent = await request(app).post(`/commerce/purchase/${reference}/claim`).set('X-Tenant-ID', String(tenantId)).send({ consent: false });
  expect(noConsent.status).toBe(400); expect(await StorefrontPurchase.countDocuments()).toBe(0);
});
it('allocates rounding including zero lines without negative prices and fails corrupt totals', () => {
  const input = { ...paid(), items: [1, 1, 1, 0].map((n, index) => ({ ...paid().items[0], optionId: String(index), totalPrice: n / 100 })), subtotal: 0.03, discount: 0.02, fees: 0, total: 0.01 } as unknown as Parameters<typeof commerceSelection>[0];
  const event = commerceSelection(input, 'begin_checkout');
  expect(event.items.every(i => i.price >= 0)).toBe(true); expect(event.items.reduce((n, i) => n + i.price, 0)).toBe(0.01);
  expect(() => commerceSelection({ ...input, total: 9 }, 'begin_checkout')).toThrow('COMMERCE_TOTAL_MISMATCH');
});
