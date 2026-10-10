import express from 'express';
import request from '../test/loopbackRequest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import bookingRoutes from '../routes/bookings.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { IdempotencyKey } from '../models/IdempotencyKey';
import { PromoCode } from '../models/PromoCode';
import { SpecialOffer } from '../models/SpecialOffer';
import { initialFinanceFees } from '../utils/financeSettings';
import { bookingStripePaymentRequest } from '../services/bookingPaymentBinding.service';
import { applyBookingRefundTotal } from '../services/bookingRefund.service';
import { BookingOperatorNotification } from '../models/BookingOperatorNotification';
import { fenceFinancePolicy, loadFinancePolicy } from '../services/tenantFinance.service';

jest.mock('../services/email.service', () => ({ sendBookingConfirmation: jest.fn(), sendAdminBookingNotification: jest.fn(), sendBookingPaymentLinkEmail: jest.fn(), getEmailBrand: jest.fn(() => ({})), brandedLink: jest.fn(() => '') }));
jest.mock('../services/notification.service', () => ({ createAdminNotifications: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/webhook.service', () => ({ safeEmitEvent: jest.fn() }));
jest.mock('../middleware/auth.middleware', () => {
  const actual = jest.requireActual('../middleware/auth.middleware');
  const inject = (req: any) => { if (req.header('x-test-role')) req.user = { _id: new Types.ObjectId('0000000000000000000000aa'), role: req.header('x-test-role'), assignedTenants: (req.header('x-test-assigned') || '').split(',') }; };
  return { ...actual, optionalAuth: (req: any, _res: any, next: any) => { inject(req); next(); }, authenticate: (req: any, res: any, next: any) => { inject(req); if (!req.user) return res.status(401).json({ success: false }); next(); } };
});
jest.setTimeout(120_000);
const site = new Types.ObjectId(), other = new Types.ObjectId(), attraction = new Types.ObjectId();
const app = express(); app.use(express.json()); app.use('/bookings', bookingRoutes);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ error: error.message }));
const items = [{ optionId: 'adult', date: '2030-11-10', quantities: { adults: 2, children: 0, infants: 0 } }];
const guestDetails = { firstName: 'QA', lastName: 'Guest', email: 'theegyptexcursionsonline@gmail.com', phone: '+201000000000', country: 'Egypt' };
const quote = (body: object = { attractionId: String(attraction), items }, tenant = site) => request(app).post('/bookings/quote').set('x-tenant-id', String(tenant)).send(body);
const create = (body: object, key = `finance-tour-${new Types.ObjectId()}`) => request(app).post('/bookings').set('x-tenant-id', String(site)).set('Idempotency-Key', key).send({ attractionId: String(attraction), items, guestDetails, paymentMethod: 'pay-later', ...body });
const activate = async (revision = 1) => {
 const fees = initialFinanceFees(); fees.transaction = { enabled: true, type: 'percentage', payer: 'business', percentage: 3 }; fees.payout = { enabled: true, type: 'fixed', payer: 'customer', fixedAmounts: { EUR: 2 } };
 await Tenant.collection.updateOne({ _id: site }, { $set: { financeRevision: revision, financeSettings: { version: 1, fees } } });
};
let mongo: MongoMemoryReplSet;
beforeAll(async () => {
 const found = spawnSync('which', ['mongod'], { encoding: 'utf8' }); const systemBinary = found.status === 0 ? found.stdout.trim() : undefined;
 const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
 mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
 await mongoose.connect(mongo.getUri('tour_finance')); await Promise.all([Tenant, Attraction, Availability, Booking, IdempotencyKey, PromoCode, SpecialOffer, BookingOperatorNotification].map(model => model.init()));
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
 await Promise.all([Tenant, Attraction, Availability, Booking, IdempotencyKey, PromoCode, SpecialOffer, BookingOperatorNotification].map(model => model.collection.deleteMany({})));
 await Tenant.collection.insertMany([{ _id: site, slug: 'finance-tour', name: 'Finance tour', domain: 'finance-tour.invalid', status: 'active', timezone: 'Africa/Cairo', defaultCurrency: 'EUR' }, { _id: other, slug: 'finance-other', status: 'active' }]);
 await Attraction.collection.insertOne({ _id: attraction, title: 'Finance trip', status: 'active', tenantIds: [site], currency: 'EUR', pricingOptions: [{ id: 'adult', name: 'Adult', price: 100 }], availability: { type: 'all-day' } });
});
afterEach(() => jest.restoreAllMocks());
it('quotes legacy prices and keeps unconfigured creation compatible', async () => {
 const quoted = await quote().expect(200); expect(quoted.body.data).toMatchObject({ total: 210, fees: 10, finance: { configured: false, policyRevision: 0 } });
 const saved = await create({}).expect(201); expect(saved.body.data.total).toBe(210); expect(saved.body.data).not.toHaveProperty('financeSnapshot');
});
it('charges customer fees once, records private business cost and replays the accepted receipt after a policy edit', async () => {
 await activate(); const quoted = (await quote().expect(200)).body.data;
 expect(quoted).toMatchObject({ subtotal: 200, fees: 12, total: 212, finance: { customerFeesMinor: 1200, totalMinor: 21200 } });
 expect(JSON.stringify(quoted)).not.toContain('business'); expect(quoted.finance.lines).toHaveLength(2);
 const key = `finance-tour-replay-${new Types.ObjectId()}`;
 const saved = await create({ quoteHash: quoted.quoteHash }, key).expect(201);
 const booking = (await Booking.findById(saved.body.data._id))!;
 expect(booking.financeSnapshot).toMatchObject({ policyRevision: 1, serviceSubtotalMinor: 20000, businessFeesMinor: 600, totalMinor: 21200 });
 expect(saved.body.data.finance).toEqual(quoted.finance); expect(saved.body.data).not.toHaveProperty('financeSnapshot');
 await activate(2); const replay = await create({ quoteHash: quoted.quoteHash }, key).expect(200);
 expect(replay.body.data._id).toBe(saved.body.data._id); expect(replay.body.data.finance.policyRevision).toBe(1);
 expect(await Booking.countDocuments()).toBe(1);
});
it('requires acceptance and rejects changed policy/selection without reserving inventory', async () => {
 await activate(); const quoted = (await quote().expect(200)).body.data;
 expect((await create({})).status).toBe(409);
 await activate(2); const refused = await create({ quoteHash: quoted.quoteHash }).expect(409);
 expect(refused.body.code).toBe('PRICE_CHANGED'); expect(refused.body.quote.total).toBe(quoted.total);
 expect(await Booking.countDocuments()).toBe(0); expect(await Availability.countDocuments()).toBe(0);
});
it('uses discounted service as every percentage basis and reports the selected promotion', async () => {
 await activate(); await PromoCode.collection.insertOne({ code: 'HALF', tenantId: site, currency: 'EUR', discountType: 'percentage', discountValue: 50, minOrderAmount: 0, isActive: true, validFrom: new Date(0), validUntil: new Date('2035-01-01'), usageCount: 0, usageLimit: 100 });
 const quoted = (await quote({ attractionId: String(attraction), items, promoCode: 'HALF' }).expect(200)).body.data;
 expect(quoted).toMatchObject({ subtotal: 200, discount: 100, fees: 7, total: 107, discountSource: 'promo', appliedPromoCode: 'HALF' });
});
it('isolates the quote tenant, rejects caller prices and permits only assigned staff tenant overrides', async () => {
 await quote(undefined, other).expect(404); await quote({ attractionId: String(attraction), items, total: 1 }).expect(400);
 await quote({ attractionId: String(attraction), items, tenantId: String(site) }).expect(403);
 await request(app).post('/bookings/quote').set('x-test-role', 'brand-admin').set('x-test-assigned', String(other)).send({ attractionId: String(attraction), items, tenantId: String(site) }).expect(404);
 await request(app).post('/bookings/quote').set('x-test-role', 'brand-admin').set('x-test-assigned', String(site)).send({ attractionId: String(attraction), items, tenantId: String(site) }).expect(200);
});
it('fences a saved policy against a transaction that already accepted an earlier revision', async () => {
 await activate(); const policy = await loadFinancePolicy(site); const session = await mongoose.startSession();
 try {
   await activate(2);
   await expect(session.withTransaction(async () => { await fenceFinancePolicy(policy, session); await Booking.collection.insertOne({ _id: new Types.ObjectId(), tenantId: site }, { session }); })).rejects.toThrow('Website fees changed');
   expect(await Booking.countDocuments()).toBe(0);
 } finally { await session.endSession(); }
});

it('returns only customer fee lines after customer cancellation', async () => {
 await activate(); const quoted = (await quote().expect(200)).body.data;
 const created = await create({ quoteHash: quoted.quoteHash }).set('x-test-role', 'customer').expect(201);
 const result = await request(app).patch(`/bookings/${created.body.data._id}/cancel`).set('x-test-role', 'customer').send({}).expect(200);
 expect(result.body.data.finance).toEqual(quoted.finance); expect(result.body.data).not.toHaveProperty('financeSnapshot');
 expect(JSON.stringify(result.body.data.finance)).not.toContain('business');
});
it('payment requests and refund reconciliation use the accepted total after the policy changes', async () => {
 await activate(); const quoted = (await quote().expect(200)).body.data;
 const created = await create({ quoteHash: quoted.quoteHash }).expect(201);
 await Booking.updateOne({ _id: created.body.data._id }, { $set: { stripePaymentIntentId: 'pi_snapshot', paymentStatus: 'succeeded' } });
 const booking = (await Booking.findById(created.body.data._id))!;
 const snapshot = JSON.parse(JSON.stringify(booking.financeSnapshot));
 await activate(2);
 expect(bookingStripePaymentRequest(booking)).toMatchObject({ amount: 21200, currency: 'eur' });
 expect(await applyBookingRefundTotal(booking, 21200)).toMatchObject({ fullRefund: true, newlyRefunded: 212 });
 expect(await applyBookingRefundTotal(booking, 21200)).toMatchObject({ newlyRefunded: 0 });
 const final = (await Booking.findById(booking._id).lean())!;
 expect(final.total).toBe(212); expect(final.refundedAmount).toBe(212); expect(final.financeSnapshot).toEqual(snapshot);
});
