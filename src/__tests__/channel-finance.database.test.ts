import express from 'express';
import request from '../test/loopbackRequest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import octoRoutes from '../routes/octo.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { OctoHold } from '../models/OctoHold';
import { ApiKey } from '../models/ApiKey';
import { BundleDefinition } from '../models/BundleDefinition';
import { BundleSupplyOffer } from '../models/BundleSupplyOffer';
import { BundleQuote } from '../models/BundleQuote';
import { BundleOrder } from '../models/BundleOrder';
import { BundleIdempotency } from '../models/BundleIdempotency';
import { BundleOfferInventory } from '../models/BundleOfferInventory';
import { BundleEvent } from '../models/BundleEvent';
import { BundleOutboxEvent } from '../models/BundleOutboxEvent';
import { BundleLedgerEntry } from '../models/BundleLedgerEntry';
import { createBundleQuote, createBundleOrder, customerBundleQuoteDto, customerBundleOrderDto } from '../services/bundleOrder.service';
import { finalizeBundlePayment, refundBundleOrder } from '../services/bundlePayment.service';
import * as stripeService from '../services/stripe.service';
import * as tenantPaymentService from '../services/tenantPayment.service';
import { initialFinanceFees } from '../utils/financeSettings';
import { hashToken } from '../utils/hash';

jest.setTimeout(120_000);
const site = new Types.ObjectId(), supplier = new Types.ObjectId(), attraction = new Types.ObjectId(), offer = new Types.ObjectId(), bundleId = new Types.ObjectId();
const key = 'fxs_att_local-finance-integration';
const guestDetails = { firstName: 'QA', lastName: 'Guest', email: 'theegyptexcursionsonline@gmail.com', phone: '+201000000000', country: 'Egypt' };
const models = [Tenant, Attraction, Availability, Booking, OctoHold, ApiKey, BundleDefinition, BundleSupplyOffer, BundleQuote, BundleOrder, BundleIdempotency, BundleOfferInventory, BundleEvent, BundleOutboxEvent, BundleLedgerEntry];
const app = express(); app.use(express.json()); app.use('/octo', octoRoutes); app.use((error: any, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));
const holdBody = (uuid = 'finance-channel-hold') => ({ uuid, productId: String(attraction), optionId: 'DEFAULT', availabilityId: '2030-11-10', unitItems: [{ unitId: 'adult', quantity: 2 }] });
const hold = (body = holdBody()) => request(app).post('/octo/bookings').set('x-api-key', key).send(body);
const confirm = (uuid = 'finance-channel-hold') => request(app).post(`/octo/bookings/${uuid}/confirm`).set('x-api-key', key).send({ contact: { firstName: 'QA', lastName: 'Guest', emailAddress: guestDetails.email } });
const activate = async (revision = 1, business = 3) => {
 const fees = initialFinanceFees(); fees.transaction = { enabled: true, type: 'percentage', payer: 'business', percentage: business };
 fees.payout = { enabled: true, type: 'fixed', payer: 'customer', fixedAmounts: { EUR: 2 } };
 await Tenant.collection.updateOne({ _id: site }, { $set: { financeRevision: revision, financeSettings: { version: 1, fees } } });
};
const bundleQuote = () => createBundleQuote({ storefrontTenantId: String(site), checkoutMode: 'test', slug: 'finance-bundle', request: { quantities: { adults: 2, children: 0, infants: 0 }, selections: [{ componentId: 'one', optionId: 'adult', date: '2030-11-10' }] } });
let mongo: MongoMemoryReplSet;
beforeAll(async () => {
 const located = spawnSync('which', ['mongod'], { encoding: 'utf8' }); const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
 const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
 mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, args: ['--setParameter', 'maxTransactionLockRequestTimeoutMillis=1000'] }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
 await mongoose.connect(mongo.getUri('channel_finance')); await Promise.all(models.map(model => model.init()));
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
afterEach(() => jest.restoreAllMocks());
beforeEach(async () => {
 await Promise.all(models.map(model => model.collection.deleteMany({})));
 await Tenant.collection.insertMany([{ _id: site, slug: 'finance-channel', domain: 'finance-channel.invalid', status: 'active', defaultCurrency: 'EUR' }, { _id: supplier, slug: 'finance-supplier', domain: 'finance-supplier.invalid', status: 'active' }]);
 await ApiKey.collection.insertOne({ tenantId: site, hashedKey: hashToken(key), revoked: false, scopes: ['read', 'write'] });
 await Attraction.collection.insertOne({ _id: attraction, title: 'Finance channel', status: 'active', ownerTenantId: supplier, tenantIds: [site, supplier], instantConfirmation: true, currency: 'EUR', availability: { type: 'all-day' }, pricingOptions: [{ id: 'adult', name: 'Adult', price: 100 }] });
 await Availability.collection.insertOne({ attractionId: attraction, date: new Date('2030-11-10'), allDayCapacity: 20, allDayBooked: 0, timeSlots: [], isBlocked: false });
 await BundleSupplyOffer.collection.insertOne({ _id: offer, supplierTenantId: supplier, attractionId: attraction, status: 'active', version: 1, optionIds: ['adult'], supplierNetPricesMinor: { adult: 3000, child: 0, infant: 0 }, capacityPerDeparture: 20, validTravelFrom: new Date('2030-01-01'), validTravelTo: new Date('2031-01-01'), blackoutDates: [], leadTimeHours: 0, entryWindowLabels: [] });
 await BundleDefinition.collection.insertOne({ _id: bundleId, storefrontTenantId: site, slug: 'finance-bundle', status: 'published', version: 1, currency: 'EUR', customerPricesMinor: { adult: 10000, child: 0, infant: 0 }, platformFeeReserveMinor: 1000, taxReserveMinor: 500, components: [{ componentId: 'one', supplyOfferId: offer, supplyOfferVersion: 1, supplierTenantId: supplier, attractionId: attraction, optionIds: ['adult'], dayNumber: 1, sortOrder: 0 }] });
});
it('snapshots OCTO fees at hold and preserves them across policy edits, confirmation and replay', async () => {
 await activate(); const reserved = await hold().expect(201); expect(reserved.body.pricing).toMatchObject({ retail: 21200, currency: 'EUR' });
 expect(JSON.stringify(reserved.body)).not.toContain('businessFees'); await activate(2);
 const replay = await hold().expect(200); expect(replay.body.pricing.retail).toBe(21200);
 await confirm().expect(200); await confirm().expect(200);
 const booking = await Booking.findOne({ tenantId: site }).lean();
 expect(booking).toMatchObject({ subtotal: 200, fees: 12, total: 212, financeSnapshot: { policyRevision: 1, businessFeesMinor: 600 } });
 expect(await Booking.countDocuments()).toBe(1); expect((await Availability.findOne().lean())?.allDayBooked).toBe(2);
});
it('keeps unconfigured OCTO pricing unchanged and rolls back failed configured currency holds', async () => {
 const result = await hold().expect(201); expect(result.body.pricing.retail).toBe(20000);
 await activate(); await Tenant.collection.updateOne({ _id: site }, { $set: { 'financeSettings.fees.payout.fixedAmounts': { USD: 2 } } });
 const refused = await hold(holdBody('missing-currency')).expect(409); expect(refused.body.error).toBe('FINANCE_CURRENCY_UNAVAILABLE');
 expect(await OctoHold.countDocuments()).toBe(1); expect((await Availability.findOne().lean())?.allDayBooked).toBe(2);
});
it('charges bundle fees once on the parent, protects suppliers and replays the original policy', async () => {
 await activate(); const quoted = await bundleQuote();
 expect(quoted).toMatchObject({ totalMinor: 21200, supplierTotalMinor: 6000, platformAllocationMinor: 11900, paymentFeeReserveMinor: 1000, taxMinor: 500, financeSnapshot: { businessFeesMinor: 600, customerFeesMinor: 1200 } });
 const publicQuote = customerBundleQuoteDto(quoted); expect(publicQuote).not.toHaveProperty('supplierTotalMinor'); expect(publicQuote).not.toHaveProperty('financeSnapshot'); expect(publicQuote.selections[0]).not.toHaveProperty('supplierNetPricesMinor');
 const input = { quoteId: String(quoted._id), guestDetails, idempotencyKey: 'finance-bundle-order-key', checkoutMode: 'test' as const };
 const result = await createBundleOrder(input); expect(result.order.financeSnapshot?.policyRevision).toBe(1);
 expect((await Booking.find({ bundleOrderId: result.order._id }).lean())[0].financeSnapshot).toBeUndefined();
 expect(customerBundleOrderDto(result.order)).not.toHaveProperty('financeSnapshot');
 await activate(2); expect((await createBundleOrder(input)).replayed).toBe(true);
 expect((await Availability.findOne().lean())?.allDayBooked).toBe(2);
});
it('refuses stale bundle policy and negative margin without creating allocations', async () => {
 await activate(); const quoted = await bundleQuote(); await activate(2);
 await expect(createBundleOrder({ quoteId: String(quoted._id), guestDetails, idempotencyKey: 'finance-bundle-stale-key', checkoutMode: 'test' })).rejects.toMatchObject({ code: 'FINANCE_CHANGED' });
 await activate(3, 100); await expect(bundleQuote()).rejects.toMatchObject({ code: 'BUNDLE_ECONOMICS_INVALID' });
 expect(await BundleOrder.countDocuments()).toBe(0); expect((await Availability.findOne().lean())?.allDayBooked).toBe(0);
});
it('balances captured bundle ledger using its original configured fee reserve', async () => {
 await activate(); const quoted = await bundleQuote(); const { order } = await createBundleOrder({ quoteId: String(quoted._id), guestDetails, idempotencyKey: 'finance-bundle-paid-key', checkoutMode: 'test' });
 await BundleOrder.updateOne({ _id: order._id }, { $set: { status: 'payment_pending', paymentStatus: 'intent_created', stripePaymentIntentId: 'pi_local_bound' } });
 await activate(2, 10);
 const intent = { id: 'pi_local_bound', clientSecret: '', amount: order.totalMinor, amountReceived: order.totalMinor, currency: 'eur', status: 'succeeded', livemode: false, metadata: { paymentKind: 'bundle', bundleOrderId: String(order._id), storefrontTenantId: String(site), checkoutMode: 'test' } };
 await finalizeBundlePayment(String(order._id), intent, 'stripe');
 await finalizeBundlePayment(String(order._id), intent, 'stripe');
 const entries = await BundleLedgerEntry.find({ orderId: order._id }).lean();
 expect(entries.find(entry => entry.account === 'configured_fee_reserve')).toMatchObject({ direction: 'credit', amountMinor: 1800 });
 expect(entries.filter(entry => entry.direction === 'debit').reduce((sum, entry) => sum + entry.amountMinor, 0)).toBe(entries.filter(entry => entry.direction === 'credit').reduce((sum, entry) => sum + entry.amountMinor, 0));
 expect(entries.filter(entry => entry.account === 'configured_fee_reserve')).toHaveLength(1);
});

it('reverses the accepted configured fee reserve exactly once on full refund after a policy edit', async () => {
 await activate(); const quoted = await bundleQuote();
 const { order } = await createBundleOrder({ quoteId: String(quoted._id), guestDetails, idempotencyKey: 'finance-bundle-refund-key', checkoutMode: 'test' });
 await BundleOrder.updateOne({ _id: order._id }, { $set: { status: 'payment_pending', paymentStatus: 'intent_created', stripePaymentIntentId: 'pi_local_refund_bound' } });
 await finalizeBundlePayment(String(order._id), { id: 'pi_local_refund_bound', clientSecret: '', amount: order.totalMinor, amountReceived: order.totalMinor,
  currency: 'eur', status: 'succeeded', livemode: false, metadata: { paymentKind: 'bundle', bundleOrderId: String(order._id), storefrontTenantId: String(site), checkoutMode: 'test' } }, 'stripe');
 await activate(2, 10);
 jest.spyOn(tenantPaymentService, 'getTenantStripeConfig').mockResolvedValue({ enabled: true, publishableKey: 'pk_test_local', secretKey: 'sk_test_local', webhookSecret: '' });
 const provider = jest.spyOn(stripeService, 'createRefund').mockResolvedValue({ id: 're_local_finance', amount: 21200, paymentIntentId: 'pi_local_refund_bound', status: 'succeeded' });
 const request = { orderId: String(order._id), operationId: 'finance-full-refund', amountMinor: 21200, reason: 'Full cancellation', actorId: new Types.ObjectId() };
 const refunded = await refundBundleOrder(request);
 expect(refunded.duplicate).toBe(false);
 expect(refunded.order).toMatchObject({ status: 'refunded', totalMinor: 21200, refundedMinor: 21200,
  financeSnapshot: { policyRevision: 1, customerFeesMinor: 1200, businessFeesMinor: 600 } });
 expect((await refundBundleOrder(request)).duplicate).toBe(true);
 expect(provider).toHaveBeenCalledTimes(1);
 expect(provider).toHaveBeenCalledWith('sk_test_local', 'pi_local_refund_bound', 21200, expect.objectContaining({ idempotencyKey: `bundle-refund:${order._id}:finance-full-refund` }));
 const entries = await BundleLedgerEntry.find({ orderId: order._id }).lean();
 const reversals = entries.filter(entry => entry.operationId === 'refund:finance-full-refund');
 expect(reversals.find(entry => entry.account === 'configured_fee_reserve')).toMatchObject({ direction: 'debit', amountMinor: 1800 });
 expect(entries.filter(entry => entry.account === 'configured_fee_reserve')).toHaveLength(2);
 for (const lines of [entries, reversals]) expect(lines.filter(entry => entry.direction === 'debit').reduce((sum, entry) => sum + entry.amountMinor, 0))
  .toBe(lines.filter(entry => entry.direction === 'credit').reduce((sum, entry) => sum + entry.amountMinor, 0));
 expect((await Availability.findOne().lean())?.allDayBooked).toBe(0);
 expect((await Booking.find({ bundleOrderId: order._id }).lean())[0]).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded' });
});
