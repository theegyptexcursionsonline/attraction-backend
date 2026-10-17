import { env } from '../config/env';
import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Booking } from '../models/Booking';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { BookingPaidEffectV1 } from '../models/BookingPaidEffectV1';
import { WebhookEndpoint } from '../models/WebhookEndpoint';
import { WebhookDelivery } from '../models/WebhookDelivery';
import { finalizePaidBooking, processBookingPaidEffects, ensureBookingPaidEffectIndexes } from '../services/bookingPaidEffects.service';
import { enqueueWebhookEvent, processWebhookDeliveries, ensureWebhookDeliveryIndexes } from '../services/webhook.service';
import { runBookingTransaction } from '../services/bookingInventory.service';
import { preparePaidBookingNotice } from '../services/bookingPaidNotice.service';
import { listNotificationFailures, reconcileNotificationFailure } from '../controllers/notificationFailures.controller';

jest.mock('../services/bookingPaidNotice.service', () => ({ preparePaidBookingNotice: jest.fn() }));
jest.setTimeout(120_000);
let mongo: MongoMemoryReplSet;
const tenantId = new Types.ObjectId(), foreignTenant = new Types.ObjectId(), bookingId = new Types.ObjectId();
const attractionId = new Types.ObjectId(), userId = new Types.ObjectId(), endpointId = new Types.ObjectId();
const send = jest.fn();
const finalize = () => finalizePaidBooking(String(bookingId), { tenantId, paymentIntentId: 'pi_qa_paid' });
const rows = () => BookingPaidEffectV1.find().sort({ audience: 1 }).lean();
const due = () => BookingPaidEffectV1.updateMany({ status: 'retry' }, { $set: { nextAttemptAt: new Date(0) } });
const prepare = preparePaidBookingNotice as jest.Mock;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('paid_effects_recovery'));
  await Promise.all([Booking.init(), User.init(), Tenant.init(), Attraction.init(), WebhookEndpoint.init(), ensureBookingPaidEffectIndexes(), ensureWebhookDeliveryIndexes()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  jest.restoreAllMocks(); jest.clearAllMocks();
  env.bookingPaidEffectsDeliveryEnabled = true; env.webhookDeliveryV1Enabled = true;
  await Promise.all([Booking.collection.deleteMany({}), User.collection.deleteMany({}), Tenant.collection.deleteMany({}), Attraction.collection.deleteMany({}),
    BookingPaidEffectV1.deleteMany({}), WebhookEndpoint.deleteMany({}), WebhookDelivery.deleteMany({})]);
  await Booking.collection.insertOne({ _id: bookingId, tenantId, attractionId, userId, reference: 'QA-PAID-RECOVERY',
    paymentMethod: 'card', paymentStatus: 'processing', status: 'pending', stripePaymentIntentId: 'pi_qa_paid',
    subtotal: 100, fees: 0, total: 100, currency: 'EUR', createdAt: new Date(),
    items: [{ optionId: 'standard', optionName: 'Standard', date: '2030-08-20', quantities: { adults: 1, children: 0, infants: 0 }, unitPrice: 100, totalPrice: 100 }],
    guestDetails: { firstName: 'QA', lastName: 'Guest', email: 'qa@example.invalid', phone: '+200000000000', country: 'EG' } });
  await User.collection.insertOne({ _id: userId, totalSpent: 0 });
  await Tenant.collection.insertOne({ _id: tenantId, name: 'QA Operator', slug: 'qa-paid', status: 'active', contactInfo: { email: 'operator@example.invalid' } });
  await Attraction.collection.insertOne({ _id: attractionId, tenantIds: [tenantId], title: 'QA Tour' });
  await WebhookEndpoint.create({ _id: endpointId, tenantId, url: 'https://receiver.example.invalid/hooks', secret: 'qa-webhook-secret', events: ['*'], enabled: true });
  send.mockReset().mockResolvedValue({ status: 'sent' });
  prepare.mockReset().mockResolvedValue(send);
});

it('commits payment, accounting, both confirmation intents and tenant webhook fanout once under concurrency', async () => {
  await WebhookEndpoint.create({ tenantId: foreignTenant, url: 'https://foreign.example.invalid', secret: 'foreign', events: ['*'] });
  const results = await Promise.all(Array.from({ length: 4 }, finalize));
  expect(results.filter(Boolean)).toHaveLength(1);
  expect((await User.collection.findOne({ _id: userId }))?.totalSpent).toBe(100);
  expect(await Booking.findById(bookingId)).toMatchObject({ paymentStatus: 'succeeded', status: 'confirmed' });
  expect((await rows()).map(row => row.audience)).toEqual(['customer', 'operator']);
  expect(await WebhookDelivery.countDocuments({ tenantId })).toBe(2);
  expect(await WebhookDelivery.countDocuments({ tenantId: foreignTenant })).toBe(0);
  expect(prepare).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});

it.each(['accounting', 'confirmation', 'webhook'])('rolls back every effect when %s persistence fails, then retry completes', async failure => {
  const spy = failure === 'accounting' ? jest.spyOn(User, 'findByIdAndUpdate') : failure === 'confirmation'
    ? jest.spyOn(BookingPaidEffectV1, 'updateOne') : jest.spyOn(WebhookDelivery, 'updateOne');
  spy.mockRejectedValueOnce(new Error('write interrupted'));
  await expect(finalize()).rejects.toThrow('write interrupted');
  expect(await Booking.findById(bookingId)).toMatchObject({ status: 'pending', paymentStatus: 'processing' });
  expect((await User.collection.findOne({ _id: userId }))?.totalSpent).toBe(0);
  expect(await BookingPaidEffectV1.countDocuments()).toBe(0); expect(await WebhookDelivery.countDocuments()).toBe(0);
  spy.mockRestore(); expect(await finalize()).toBe(true);
});

it('refuses wrong tenant/intent, released holds and bundle components without creating work', async () => {
  expect(await finalizePaidBooking(String(bookingId), { tenantId: foreignTenant, paymentIntentId: 'pi_qa_paid' })).toBe(false);
  expect(await finalizePaidBooking(String(bookingId), { tenantId, paymentIntentId: 'pi_wrong' })).toBe(false);
  await Booking.collection.updateOne({ _id: bookingId }, { $set: { inventoryReleasedAt: new Date() } });
  expect(await finalize()).toBe(false);
  await Booking.collection.updateOne({ _id: bookingId }, { $unset: { inventoryReleasedAt: 1 }, $set: { bundleOrderId: new Types.ObjectId() } });
  expect(await finalize()).toBe(false); expect(await BookingPaidEffectV1.countDocuments()).toBe(0);
});

it('does not backfill or resend a historical already-paid booking', async () => {
  await Booking.collection.updateOne({ _id: bookingId }, { $set: { status: 'confirmed', paymentStatus: 'succeeded' } });
  expect(await finalize()).toBe(false); await processBookingPaidEffects();
  expect(await BookingPaidEffectV1.countDocuments()).toBe(0); expect(send).not.toHaveBeenCalled();
});

it('isolates customer/operator claims under concurrency and issues the ticket event only once', async () => {
  await finalize();
  await Promise.all(Array.from({ length: 4 }, () => processBookingPaidEffects()));
  expect(send).toHaveBeenCalledTimes(2); expect((await rows()).every(row => row.status === 'sent')).toBe(true);
  expect(await WebhookDelivery.countDocuments({ eventType: 'ticket.issued' })).toBe(1);
  await processBookingPaidEffects(); expect(send).toHaveBeenCalledTimes(2);
});

it('recovers a crash before any provider attempt, but quarantines an expired attempt without resending', async () => {
  await finalize();
  await BookingPaidEffectV1.updateMany({}, { $set: { status: 'processing', attempts: 1, leaseToken: 'old', leaseUntil: new Date(0) } });
  await BookingPaidEffectV1.updateOne({ audience: 'operator' }, { $set: { providerAttemptedAt: new Date() } });
  await processBookingPaidEffects();
  expect(send).toHaveBeenCalledTimes(1);
  expect(await BookingPaidEffectV1.findOne({ audience: 'operator' })).toMatchObject({ status: 'manual_review', lastError: 'DELIVERY_UNCERTAIN_LEASE_EXPIRED' });
  expect(await BookingPaidEffectV1.findOne({ audience: 'customer' })).toMatchObject({ status: 'sent' });
});

it('retries preparation failures without claiming a provider attempt or blocking the other audience', async () => {
  await finalize(); prepare.mockRejectedValueOnce(new Error('pdf unavailable'));
  await processBookingPaidEffects();
  const retry = await BookingPaidEffectV1.findOne({ status: 'retry' });
  expect(retry?.providerAttemptedAt).toBeUndefined(); expect(send).toHaveBeenCalledTimes(1);
  await due(); await processBookingPaidEffects(); expect(send).toHaveBeenCalledTimes(2);
  expect(await BookingPaidEffectV1.countDocuments({ status: 'sent' })).toBe(2);
});

it('bounds preparation retries and exposes exhausted work for reconciliation', async () => {
  await finalize(); prepare.mockRejectedValue(new Error('unavailable'));
  for (let i = 0; i < 5; i++) { await due(); await processBookingPaidEffects(); }
  expect((await rows()).every(row => row.status === 'manual_review' && row.attempts === 5)).toBe(true);
  expect(send).not.toHaveBeenCalled();
});

it('retries an explicitly rejected rate-limit response with the same ticket event', async () => {
  await finalize(); send.mockRejectedValueOnce({ status: 429 });
  await processBookingPaidEffects(); expect(await BookingPaidEffectV1.countDocuments({ status: 'retry' })).toBe(1);
  await due(); await processBookingPaidEffects();
  expect(send).toHaveBeenCalledTimes(3); expect(await WebhookDelivery.countDocuments({ eventType: 'ticket.issued' })).toBe(1);
});

it.each([{ status: 500 }, { status: 408 }, new Error('connection lost')])('does not retry an ambiguous mail outcome %p', async failure => {
  await finalize(); send.mockRejectedValueOnce(failure);
  await processBookingPaidEffects(); await due(); await processBookingPaidEffects();
  expect(send).toHaveBeenCalledTimes(2);
  expect(await BookingPaidEffectV1.countDocuments({ status: 'manual_review', lastError: 'DELIVERY_UNCERTAIN' })).toBe(1);
});

it('never reports a skipped provider as sent', async () => {
  await finalize(); send.mockResolvedValue({ status: 'skipped', reason: 'provider_not_configured' });
  await processBookingPaidEffects();
  expect(await BookingPaidEffectV1.countDocuments({ status: 'manual_review', lastError: 'DELIVERY_SKIPPED_PROVIDER_NOT_CONFIGURED' })).toBe(2);
});

it('does not resend if provider acceptance succeeds but the completion write fails', async () => {
  await finalize(); const original = BookingPaidEffectV1.updateOne.bind(BookingPaidEffectV1);
  jest.spyOn(BookingPaidEffectV1, 'updateOne').mockImplementation(((filter: unknown, update: { $set?: { status?: string } }, options: unknown) => {
    if (update.$set?.status === 'sent') throw new Error('completion lost');
    return original(filter as never, update as never, options as never);
  }) as never);
  await expect(processBookingPaidEffects(1)).rejects.toThrow('completion lost');
  expect(send).toHaveBeenCalledTimes(1); jest.restoreAllMocks();
  await BookingPaidEffectV1.updateMany({ status: 'processing' }, { $set: { leaseUntil: new Date(0) } });
  await processBookingPaidEffects(); expect(send).toHaveBeenCalledTimes(2);
  expect(await BookingPaidEffectV1.countDocuments({ status: 'manual_review' })).toBe(1);
});

it('fails closed on cross-tenant booking or attraction joins and changed payment evidence', async () => {
  await Attraction.collection.updateOne({ _id: attractionId }, { $set: { tenantIds: [foreignTenant] } }); await finalize();
  await processBookingPaidEffects(); expect(send).not.toHaveBeenCalled();
  expect(await BookingPaidEffectV1.countDocuments({ status: 'manual_review' })).toBe(2);
  await BookingPaidEffectV1.updateMany({}, { $set: { status: 'pending', attractionPresentation: { title: 'QA Tour' } } });
  await Attraction.collection.updateOne({ _id: attractionId }, { $set: { tenantIds: [tenantId] } });
  await Booking.collection.updateOne({ _id: bookingId }, { $set: { total: 200 } });
  await processBookingPaidEffects(); expect(send).not.toHaveBeenCalled();
  expect(await BookingPaidEffectV1.countDocuments({ lastError: 'BOOKING_STATE_CHANGED' })).toBe(2);
});

const invokeFailure = async (handler: typeof listNotificationFailures, overrides: Record<string, unknown> = {}) => {
  const req = { params: { tenantId: String(tenantId) }, query: { source: 'booking' }, user: { _id: userId, role: 'brand-admin', assignedTenants: [tenantId] }, ...overrides };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis() };
  const next = jest.fn(); await handler(req as never, res as never, next); expect(next).not.toHaveBeenCalled();
  return { status: res.status.mock.calls[0]?.[0] || 200, body: res.json.mock.calls[0]?.[0] };
};
it('surfaces confirmation failures in the scoped reconciliation API, with no resend or lease disclosure', async () => {
  await finalize(); send.mockRejectedValue(new Error('uncertain')); await processBookingPaidEffects();
  const listed = await invokeFailure(listNotificationFailures);
  expect(listed.body.data.data).toHaveLength(2);
  expect(JSON.stringify(listed.body)).not.toContain('leaseToken'); expect(JSON.stringify(listed.body)).not.toContain('qa@example.invalid');
  const row = (await rows())[0];
  const resolved = await invokeFailure(reconcileNotificationFailure, { params: { tenantId: String(tenantId), source: 'booking', id: row._id },
    body: { expectedUpdatedAt: row.updatedAt.toISOString(), decision: 'closed_without_resend', note: 'Customer contacted support.' } });
  expect(resolved.status).toBe(200); expect(send).toHaveBeenCalledTimes(2);
  expect((await invokeFailure(listNotificationFailures, { user: { role: 'brand-admin', assignedTenants: [foreignTenant] } })).status).toBe(403);
});

const fetchMock = () => jest.fn().mockResolvedValue({ ok: true, status: 200 });
const queueHook = (key = 'qa-event') => runBookingTransaction(session => enqueueWebhookEvent(tenantId, 'booking.created', { reference: 'QA-EVENT' }, session, key));
it('resumes webhook delivery after restart with a stable body/event ID and concurrent claims', async () => {
  await queueHook(); const fetch = fetchMock(); fetch.mockRejectedValueOnce(new Error('network'));
  await processWebhookDeliveries(1, { fetchImpl: fetch });
  const initial = await WebhookDelivery.findOne(); expect(initial?.status).toBe('pending');
  await WebhookDelivery.updateMany({}, { $set: { status: 'processing', leaseUntil: new Date(0), leaseToken: 'crashed' } });
  await Promise.all(Array.from({ length: 4 }, () => processWebhookDeliveries(1, { fetchImpl: fetch })));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][1].body).toEqual(fetch.mock.calls[1][1].body);
  expect(fetch.mock.calls[0][1].headers['X-Foxes-Delivery']).toEqual(fetch.mock.calls[1][1].headers['X-Foxes-Delivery']);
  expect(await WebhookDelivery.findOne()).toMatchObject({ status: 'success', attempts: 2 });
});
it('ignores historical pending webhook rows and does not replay them', async () => {
  await WebhookDelivery.create({ tenantId, endpointId, eventId: 'evt_legacy', eventType: 'booking.created', status: 'pending', attempts: 1 });
  const fetch = fetchMock(); await processWebhookDeliveries(20, { fetchImpl: fetch }); expect(fetch).not.toHaveBeenCalled();
});
it('does not deliver to a disabled or cross-tenant endpoint', async () => {
  await queueHook(); await WebhookEndpoint.updateOne({ _id: endpointId }, { $set: { enabled: false } });
  const fetch = fetchMock(); await processWebhookDeliveries(20, { fetchImpl: fetch }); expect(fetch).not.toHaveBeenCalled();
  expect(await WebhookDelivery.findOne()).toMatchObject({ status: 'failed', error: 'ENDPOINT_UNAVAILABLE' });
  await WebhookDelivery.updateMany({}, { $set: { status: 'pending', tenantId: foreignTenant, nextRetryAt: new Date(0) } });
  await WebhookEndpoint.updateOne({ _id: endpointId }, { $set: { enabled: true } });
  await processWebhookDeliveries(20, { fetchImpl: fetch }); expect(fetch).not.toHaveBeenCalled();
});
it('deduplicates event fanout and atomically rolls back incomplete fanout', async () => {
  await queueHook(); await queueHook(); expect(await WebhookDelivery.countDocuments()).toBe(1);
  await WebhookEndpoint.create({ tenantId, url: 'https://second.example.invalid', secret: 'second', events: ['*'] });
  const original = WebhookDelivery.updateOne.bind(WebhookDelivery); let calls = 0;
  jest.spyOn(WebhookDelivery, 'updateOne').mockImplementation(((...args: Parameters<typeof original>) => {
    if (++calls === 2) throw new Error('fanout unavailable'); return original(...args);
  }) as never);
  await expect(queueHook('new-event')).rejects.toThrow('fanout unavailable'); expect(await WebhookDelivery.countDocuments()).toBe(1);
});
it('bounds webhook retries, counts one terminal failure and disables an unhealthy endpoint', async () => {
  await WebhookEndpoint.updateOne({ _id: endpointId }, { $set: { consecutiveFailures: 14 } }); await queueHook();
  const fetch = fetchMock(); fetch.mockResolvedValue({ ok: false, status: 503 });
  for (let i = 0; i < 5; i++) { await WebhookDelivery.updateMany({ status: 'pending' }, { $set: { nextRetryAt: new Date(0) } }); await processWebhookDeliveries(1, { fetchImpl: fetch }); }
  expect(fetch).toHaveBeenCalledTimes(5); expect(await WebhookDelivery.findOne()).toMatchObject({ status: 'failed', attempts: 5 });
  expect(await WebhookEndpoint.findById(endpointId)).toMatchObject({ enabled: false, consecutiveFailures: 15 });
  await processWebhookDeliveries(1, { fetchImpl: fetch }); expect(fetch).toHaveBeenCalledTimes(5);
});
it('quarantines an exhausted crashed webhook without making another provider attempt', async () => {
  await queueHook(); await WebhookDelivery.updateMany({}, { $set: { status: 'processing', attempts: 5, leaseUntil: new Date(0) } });
  const fetch = fetchMock(); await processWebhookDeliveries(1, { fetchImpl: fetch });
  expect(fetch).not.toHaveBeenCalled(); expect(await WebhookDelivery.findOne()).toMatchObject({ status: 'failed', error: 'DELIVERY_ATTEMPTS_EXHAUSTED' });
});

it('credits only the global user bound to the verified booking', async () => {
  const otherUser = new Types.ObjectId(); await User.collection.insertOne({ _id: otherUser, email: 'other@example.invalid', totalSpent: 17 });
  await finalize();
  expect((await User.collection.findOne({ _id: userId }))?.totalSpent).toBe(100);
  expect((await User.collection.findOne({ _id: otherUser }))?.totalSpent).toBe(17);
});

it.each(['customer', 'operator', 'copies'])('quarantines a changed %s destination without sending to the replacement', async audience => {
  await finalize();
  if (audience === 'customer') await Booking.collection.updateOne({ _id: bookingId }, { $set: { 'guestDetails.email': 'replacement@example.invalid' } });
  else await Tenant.collection.updateOne({ _id: tenantId }, { $set: audience === 'operator'
    ? { 'notificationSettings.bookingEmail': 'replacement@example.invalid' }
    : { 'notificationSettings.bookingCcEmails': ['replacement@example.invalid'] } });
  await processBookingPaidEffects();
  expect(send).toHaveBeenCalledTimes(1);
  expect(await BookingPaidEffectV1.countDocuments({ status: 'manual_review', lastError: 'NOTIFICATION_RECIPIENT_CHANGED' })).toBe(1);
  expect(JSON.stringify(await rows())).not.toContain('replacement@example.invalid');
});

it('does not lose the payment when notification recipients are invalid or missing', async () => {
  await Tenant.collection.updateOne({ _id: tenantId }, { $unset: { 'contactInfo.email': 1 } });
  expect(await finalize()).toBe(true);
  expect(await BookingPaidEffectV1.findOne({ audience: 'operator' })).toMatchObject({ status: 'manual_review', lastError: 'NOTIFICATION_RECIPIENT_UNAVAILABLE' });
  await processBookingPaidEffects(); expect(send).toHaveBeenCalledTimes(1);
});

it('keeps an issued ticket event unchanged when mail retries after catalogue or subscription changes', async () => {
  await finalize();
  prepare.mockImplementation(async (_booking, _attraction, _tenant, audience) => audience === 'customer'
    ? jest.fn().mockRejectedValue({ status: 429 }) : send);
  await processBookingPaidEffects();
  const original = await WebhookDelivery.findOne({ eventType: 'ticket.issued' }).lean();
  expect(original?.payload.attractionTitle).toBe('QA Tour');
  await Attraction.collection.updateOne({ _id: attractionId }, { $set: { title: 'Renamed later' } });
  await WebhookEndpoint.create({ tenantId, url: 'https://new.example.invalid', secret: 'later', events: ['*'] });
  prepare.mockResolvedValue(send); await due(); await processBookingPaidEffects();
  expect(await WebhookDelivery.countDocuments({ eventType: 'ticket.issued' })).toBe(1);
  expect(prepare.mock.calls[prepare.mock.calls.length - 1][1].title).toBe('QA Tour');
  const retry = await WebhookDelivery.findOne({ eventType: 'ticket.issued' }).lean();
  expect(retry?.payload).toEqual(original?.payload); expect(retry?.eventCreatedAt).toEqual(original?.eventCreatedAt);
});

it('reaches every webhook subscriber beyond one query page', async () => {
  await WebhookEndpoint.insertMany(Array.from({ length: 101 }, () => ({ tenantId,
    url: 'https://tail.example.invalid', secret: 'tail', events: ['*'], enabled: true })));
  await queueHook(); expect(await WebhookDelivery.countDocuments({ tenantId })).toBe(102);
  expect(new Set((await WebhookDelivery.find().lean()).map(row => row.eventId)).size).toBe(1);
});

it('clears prior attempt errors when a webhook succeeds', async () => {
  await queueHook(); const fetch = fetchMock(); fetch.mockRejectedValueOnce(new Error('network'));
  await processWebhookDeliveries(1, { fetchImpl: fetch });
  expect((await WebhookDelivery.findOne())?.error).toBeTruthy();
  await WebhookDelivery.updateMany({}, { $set: { nextRetryAt: new Date(0) } });
  await processWebhookDeliveries(1, { fetchImpl: fetch });
  expect(await WebhookDelivery.findOne()).toMatchObject({ status: 'success', responseStatus: 200 });
  expect((await WebhookDelivery.findOne())?.error).toBeUndefined();
});

it('delivery kill switches retain every new intent without claiming or sending it', async () => {
  await finalize(); env.bookingPaidEffectsDeliveryEnabled = false; env.webhookDeliveryV1Enabled = false;
  const fetch = fetchMock();
  await processBookingPaidEffects(); await processWebhookDeliveries(20, { fetchImpl: fetch });
  expect(send).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  expect(await BookingPaidEffectV1.countDocuments({ status: 'pending', attempts: 0 })).toBe(2);
  expect(await WebhookDelivery.countDocuments({ status: 'pending', attempts: 0 })).toBe(2);
  env.bookingPaidEffectsDeliveryEnabled = true; env.webhookDeliveryV1Enabled = true;
  await processBookingPaidEffects(); await processWebhookDeliveries(20, { fetchImpl: fetch });
  expect(send).toHaveBeenCalledTimes(2); expect(fetch).toHaveBeenCalledTimes(3);
});
