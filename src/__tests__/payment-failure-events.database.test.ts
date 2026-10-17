import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Booking } from '../models/Booking';
import { Availability } from '../models/Availability';
import { WebhookEvent } from '../models/WebhookEvent';
import { WebhookEndpoint } from '../models/WebhookEndpoint';
import { WebhookDelivery } from '../models/WebhookDelivery';
import { BookingPaymentNotification } from '../models/BookingPaymentNotification';
import { recordCardPaymentFailure } from '../services/bookingPaymentFailure.service';
import { env } from '../config/env';

jest.mock('../services/bookingPaymentEmail.service', () => ({ sendBookingPaymentNotice: jest.fn() }));
jest.setTimeout(120_000);
let mongo: MongoMemoryReplSet;
const tenantId = new Types.ObjectId(), otherTenant = new Types.ObjectId(), bookingId = new Types.ObjectId(), attractionId = new Types.ObjectId();
const paymentIntentId = 'pi_qa_failure';
const input = (eventId = 'evt_qa_failure') => ({ tenantId, bookingId, paymentIntentId, eventId, currentPaymentStatus: 'requires_payment_method' });
const endpoint = (site = tenantId) => WebhookEndpoint.create({ tenantId: site, url: 'https://receiver.example.invalid/events', secret: 'qa-secret', events: ['payment.failed'] });
const previous = env.bookingPaymentFollowupStartAt;
const models = [Booking, Availability, WebhookEvent, WebhookEndpoint, WebhookDelivery, BookingPaymentNotification];
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('payment_failure_events'));
  await Promise.all(models.map(model => model.init()));
});
afterAll(async () => { env.bookingPaymentFollowupStartAt = previous; await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  jest.restoreAllMocks();
  env.bookingPaymentFollowupStartAt = new Date(Date.now() - 60 * 60_000).toISOString();
  await Promise.all(models.map(model => model.collection.deleteMany({})));
  await Booking.collection.insertOne({ _id: bookingId, tenantId, attractionId, reference: 'QA-FAILURE-EVENT',
    paymentMethod: 'card', paymentStatus: 'processing', status: 'pending', stripePaymentIntentId: paymentIntentId,
    subtotal: 100, fees: 0, total: 100, currency: 'USD', createdAt: new Date(), updatedAt: new Date(), items: [],
    inventoryReservedAt: new Date(), inventoryReservations: [{ date: new Date('2027-07-15'), guests: 1 }],
    guestDetails: { firstName: 'QA', lastName: 'Guest', email: 'qa@example.invalid', phone: '+200000000000', country: 'EG' } });
  await Availability.create({ attractionId, date: new Date('2027-07-15'), allDayCapacity: 5, allDayBooked: 1, timeSlots: [] });
});

it('commits failed state, both followups and one tenant-scoped webhook with the receipt', async () => {
  const subscribed = await endpoint(); await endpoint(otherTenant);
  expect(await recordCardPaymentFailure(input())).toEqual({ duplicate: false, transitioned: true });
  expect(await Booking.findById(bookingId)).toMatchObject({ status: 'pending', paymentStatus: 'failed', paymentFailureReason: 'payment_failed', paymentFailureAt: expect.any(Date) });
  expect((await Availability.findOne())?.allDayBooked).toBe(1);
  expect(await BookingPaymentNotification.countDocuments()).toBe(2);
  const rows = await WebhookDelivery.find().lean(); expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ tenantId, endpointId: subscribed._id, eventType: 'payment.failed', dispatchVersion: 1,
    payload: { bookingId: String(bookingId), reference: 'QA-FAILURE-EVENT', tenantId: String(tenantId), attractionId: String(attractionId),
      status: 'pending', paymentStatus: 'failed', total: 100, currency: 'USD' } });
  expect(rows[0].payload).not.toHaveProperty('customer');
  expect(await WebhookEvent.findOne()).toMatchObject({ provider: 'stripe', eventId: 'evt_qa_failure', eventType: 'payment_intent.payment_failed', tenantId, completedTenantIds: [tenantId] });
});

it('serializes duplicate concurrent deliveries and never adds late subscribers on replay', async () => {
  await endpoint();
  const results = await Promise.all(Array.from({ length: 6 }, () => recordCardPaymentFailure(input())));
  expect(results.filter(result => !result.duplicate)).toHaveLength(1);
  const before = await WebhookDelivery.find().lean(); expect(before).toHaveLength(1);
  const booking = await Booking.findById(bookingId);
  await endpoint(); expect(await recordCardPaymentFailure(input())).toEqual({ duplicate: true, transitioned: false });
  expect(await WebhookDelivery.find().lean()).toEqual(before);
  expect((await Booking.findById(bookingId))?.paymentFailureAt).toEqual(booking?.paymentFailureAt);
  expect(await BookingPaymentNotification.countDocuments()).toBe(2);
});

it('keeps separate declines on one intent distinct, including concurrent unordered event IDs', async () => {
  await endpoint();
  await Promise.all([recordCardPaymentFailure(input('evt_new')), recordCardPaymentFailure(input('evt_old'))]);
  expect(await WebhookEvent.countDocuments()).toBe(2);
  expect(new Set((await WebhookDelivery.find().lean()).map(row => row.eventId)).size).toBe(2);
  expect(await BookingPaymentNotification.countDocuments()).toBe(2);
});

it.each(['processing', 'requires_action', 'requires_confirmation', 'requires_capture', 'succeeded', 'canceled'])('acknowledges stale failure with current %s without regressing local state', async currentPaymentStatus => {
  await endpoint();
  expect(await recordCardPaymentFailure({ ...input(), currentPaymentStatus })).toEqual({ duplicate: false, transitioned: false });
  expect((await Booking.findById(bookingId))?.paymentStatus).toBe('processing');
  expect(await WebhookEvent.countDocuments()).toBe(1);
  expect(await WebhookDelivery.countDocuments()).toBe(0); expect(await BookingPaymentNotification.countDocuments()).toBe(0);
});

it.each([
  { status: 'confirmed', paymentStatus: 'succeeded' }, { status: 'refunded', paymentStatus: 'refunded' },
  { status: 'cancelled', paymentStatus: 'failed', inventoryReleasedAt: new Date() },
])('never regresses terminal local state even if the provider read preceded it: %j', async state => {
  await endpoint(); await Booking.updateOne({ _id: bookingId }, { $set: state });
  expect(await recordCardPaymentFailure(input())).toEqual({ duplicate: false, transitioned: false });
  expect(await Booking.findById(bookingId)).toMatchObject(state);
  expect(await WebhookDelivery.countDocuments()).toBe(0);
});

it.each(['webhook', 'followup'])('aborts receipt and state if %s persistence fails, then retries once', async target => {
  await endpoint();
  const write = target === 'webhook' ? jest.spyOn(WebhookDelivery, 'updateOne') : jest.spyOn(BookingPaymentNotification, 'updateOne');
  write.mockRejectedValueOnce(new Error('queue unavailable'));
  await expect(recordCardPaymentFailure(input())).rejects.toThrow('queue unavailable');
  expect((await Booking.findById(bookingId))?.paymentStatus).toBe('processing');
  expect(await WebhookEvent.countDocuments()).toBe(0); expect(await WebhookDelivery.countDocuments()).toBe(0);
  expect(await BookingPaymentNotification.countDocuments()).toBe(0);
  write.mockRestore(); expect(await recordCardPaymentFailure(input())).toEqual({ duplicate: false, transitioned: true });
  expect(await WebhookDelivery.countDocuments()).toBe(1);
});

it('rejects foreign tenant, wrong binding and bundle components without consuming the event', async () => {
  await expect(recordCardPaymentFailure({ ...input(), tenantId: otherTenant })).rejects.toThrow('PAYMENT_FAILURE_BINDING_CHANGED');
  await expect(recordCardPaymentFailure({ ...input(), paymentIntentId: 'pi_other' })).rejects.toThrow('PAYMENT_FAILURE_BINDING_CHANGED');
  await Booking.collection.updateOne({ _id: bookingId }, { $set: { bundleOrderId: new Types.ObjectId() } });
  await expect(recordCardPaymentFailure(input())).rejects.toThrow('PAYMENT_FAILURE_BINDING_CHANGED');
  expect(await WebhookEvent.countDocuments()).toBe(0);
});

it('fails closed for foreign receipt ownership and never backfills acknowledged historical failures', async () => {
  await endpoint();
  await WebhookEvent.create({ provider: 'stripe', eventId: input().eventId, eventType: 'payment_intent.payment_failed', tenantId: otherTenant });
  await expect(recordCardPaymentFailure(input())).rejects.toThrow('PAYMENT_FAILURE_EVENT_SCOPE_CONFLICT');
  await WebhookEvent.updateOne({}, { $set: { tenantId } });
  expect(await recordCardPaymentFailure(input())).toEqual({ duplicate: true, transitioned: false });
  expect(await WebhookDelivery.countDocuments()).toBe(0);
  expect((await Booking.findById(bookingId))?.paymentStatus).toBe('processing');
});

it('retries only a receipt uniqueness race in a fresh transaction', async () => {
  await endpoint();
  jest.spyOn(WebhookEvent, 'updateOne').mockRejectedValueOnce(Object.assign(new Error('duplicate receipt'), { code: 11000, keyPattern: { provider: 1, eventId: 1 } }));
  expect(await recordCardPaymentFailure(input())).toEqual({ duplicate: false, transitioned: true });
  expect(await WebhookDelivery.countDocuments()).toBe(1);
});

it('validates event identity and fails closed on unknown provider states', async () => {
  await expect(recordCardPaymentFailure({ ...input(), eventId: '' })).rejects.toThrow('INVALID_PAYMENT_FAILURE_EVENT_ID');
  await expect(recordCardPaymentFailure({ ...input(), tenantId: 'invalid' })).rejects.toThrow('INVALID_PAYMENT_FAILURE_BINDING');
  await expect(recordCardPaymentFailure({ ...input(), currentPaymentStatus: 'unknown' })).rejects.toThrow('PAYMENT_FAILURE_PROVIDER_STATE_UNSUPPORTED');
  expect(await WebhookEvent.countDocuments()).toBe(0);
});

it('remembers a no-subscriber attempt and never sends it to a later endpoint', async () => {
  expect(await recordCardPaymentFailure(input())).toEqual({ duplicate: false, transitioned: true });
  await endpoint(); expect(await recordCardPaymentFailure(input())).toEqual({ duplicate: true, transitioned: false });
  expect(await WebhookDelivery.countDocuments()).toBe(0);
});

it('refuses an existing foreign completion marker or incompatible event type', async () => {
  await endpoint();
  await WebhookEvent.create({ provider: 'stripe', eventId: input().eventId, eventType: 'payment_intent.payment_failed', tenantId, completedTenantIds: [otherTenant] });
  await expect(recordCardPaymentFailure(input())).rejects.toThrow('PAYMENT_FAILURE_EVENT_SCOPE_CONFLICT');
  await WebhookEvent.updateOne({}, { $set: { completedTenantIds: [tenantId], eventType: 'payment_intent.succeeded' } });
  await expect(recordCardPaymentFailure(input())).rejects.toThrow('PAYMENT_FAILURE_EVENT_SCOPE_CONFLICT');
  expect(await WebhookDelivery.countDocuments()).toBe(0);
  expect((await Booking.findById(bookingId))?.paymentStatus).toBe('processing');
});
