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
import { User } from '../models/User';
import { IdempotencyKey } from '../models/IdempotencyKey';
import { WebhookEndpoint } from '../models/WebhookEndpoint';
import { WebhookDelivery } from '../models/WebhookDelivery';
import { BookingCancellation } from '../models/BookingCancellation';
import { BookingOperatorNotification } from '../models/BookingOperatorNotification';
import { BookingCustomerNotification } from '../models/BookingCustomerNotification';
import { requestBookingCancellation, finalizeBookingCancellation, processBookingCancellation } from '../services/bookingCancellation.service';
import { bookingEventPayload } from '../utils/bookingEventPayload';
import { encryptSecret } from '../utils/secretCrypto';

// All business transactions and endpoint selection are real; no worker or provider runs.
jest.mock('../services/email.service', () => ({
  ...jest.requireActual('../services/email.service'),
  sendBookingConfirmation: jest.fn().mockResolvedValue({ status: 'sent' }),
  sendAdminBookingNotification: jest.fn().mockResolvedValue({ status: 'sent' }),
  sendBookingPaymentLinkEmail: jest.fn().mockResolvedValue({ status: 'sent' }),
}));
jest.mock('../services/pdf.service', () => ({ generateTicketPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')) }));
jest.mock('../services/notification.service', () => ({ createAdminNotifications: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../middleware/rate-limit.middleware', () => ({
  ...jest.requireActual('../middleware/rate-limit.middleware'),
  bookingLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.setTimeout(120_000);
const tenantId = new Types.ObjectId(), otherTenantId = new Types.ObjectId(), attractionId = new Types.ObjectId();
const app = express(); app.use(express.json()); app.use('/bookings', bookingRoutes);
app.use((error: Error, _req: unknown, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: error.message }));
const date = () => new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
const book = (key = `qa-${new Types.ObjectId()}`, paymentMethod = 'pay-later') => request(app).post('/bookings?tenant=qa-webhook-site')
  .set('Idempotency-Key', key).send({ attractionId: String(attractionId), paymentMethod,
    items: [{ optionId: 'shared', date: date(), quantities: { adults: 2, children: 0, infants: 0 } }],
    guestDetails: { firstName: 'QA', lastName: 'Guest', email: 'qa@example.invalid', phone: '+200000000000', country: 'Egypt' } });
const endpoint = (tenant = tenantId, enabled = true, events = ['*']) => WebhookEndpoint.create({
  tenantId: tenant, url: 'https://receiver.example.invalid/events', secret: 'qa-webhook-secret', enabled, events,
});
const models = [Tenant, Attraction, Availability, Booking, IdempotencyKey, WebhookEndpoint, WebhookDelivery,
  BookingCancellation, BookingOperatorNotification, BookingCustomerNotification, User];
let mongo: MongoMemoryReplSet;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('nonpayment_webhook_producers'));
  await Promise.all(models.map(model => model.init()));
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  jest.restoreAllMocks();
  await Promise.all(models.map(model => model.collection.deleteMany({})));
  await Tenant.collection.insertOne({ _id: tenantId, slug: 'qa-webhook-site', name: 'QA Webhook Site', domain: 'qa-webhook.invalid',
    status: 'active', defaultCurrency: 'USD', timezone: 'Africa/Cairo', customPages: [],
    paymentSettings: { stripe: { enabled: true, publishableKey: 'pk_test_qa', secretKeyEnc: encryptSecret('sk_test_qa') } } });
  await Attraction.collection.insertOne({ _id: attractionId, slug: 'qa-tour', title: 'QA Tour', shortDescription: 'A tour', description: 'A complete tour',
    category: 'boat-trips', destination: { city: 'Hurghada', country: 'Egypt' }, duration: '4 hours', status: 'active',
    tenantIds: [tenantId], ownerTenantId: tenantId, currency: 'USD', priceFrom: 35, availability: { type: 'date-only', advanceBooking: 60 },
    pricingOptions: [{ id: 'shared', name: 'Shared trip', price: 35, pricingModel: 'per-person' }],
    entryWindows: [], images: [], highlights: [], inclusions: [], exclusions: [], addons: [], itinerary: [], presentationRevision: 0 });
});

it('commits created and immediate confirmation with only the authorized subscriber snapshot', async () => {
  const subscribed = await endpoint();
  await endpoint(otherTenantId); await endpoint(tenantId, false); await endpoint(tenantId, true, ['payment.failed']);
  const response = await book().expect(201);
  const booking = await Booking.findById(response.body.data._id);
  const rows = await WebhookDelivery.find().sort({ eventType: 1 }).lean();
  expect(rows.map(row => row.eventType)).toEqual(['booking.confirmed', 'booking.created']);
  for (const row of rows) {
    expect(row).toMatchObject({ tenantId, endpointId: subscribed._id, dispatchVersion: 1, attempts: 0, status: 'pending',
      payload: bookingEventPayload(booking!) });
    expect(row.payload).not.toHaveProperty('guestAccessToken');
    expect(row.payload).not.toHaveProperty('items');
  }
  expect(new Set(rows.map(row => row.eventId)).size).toBe(2);
});

it('commits only created for an unpaid card reservation', async () => {
  await endpoint(); await book(undefined, 'card').expect(201);
  expect((await WebhookDelivery.find().lean()).map(row => row.eventType)).toEqual(['booking.created']);
});

it('rolls back the booking, seats and completed idempotency result if confirmation enqueue fails', async () => {
  await endpoint();
  const update = WebhookDelivery.updateOne.bind(WebhookDelivery);
  const spy = jest.spyOn(WebhookDelivery, 'updateOne').mockImplementation(((...args: unknown[]) => {
    if ((args[1] as { $setOnInsert?: { eventType?: string } }).$setOnInsert?.eventType === 'booking.confirmed') throw new Error('queue unavailable');
    return Reflect.apply(update, WebhookDelivery, args);
  }) as typeof WebhookDelivery.updateOne);
  const key = `qa-${new Types.ObjectId()}`;
  await book(key).expect(500);
  expect(await Booking.countDocuments()).toBe(0);
  expect(await WebhookDelivery.countDocuments()).toBe(0);
  expect(await IdempotencyKey.countDocuments({ status: 'completed' })).toBe(0);
  expect(await Availability.countDocuments({ allDayBooked: { $gt: 0 } })).toBe(0);
  spy.mockRestore();
  await book(key).expect(201);
  expect(await Booking.countDocuments()).toBe(1);
  expect(await WebhookDelivery.countDocuments()).toBe(2);
});

it('concurrent requests and replay retain the original events without notifying new subscribers', async () => {
  await endpoint(); const key = `qa-${new Types.ObjectId()}`;
  const responses = await Promise.all([book(key), book(key), book(key)]);
  expect(responses.some(response => response.status === 201)).toBe(true);
  expect(responses.every(response => [200, 201, 409].includes(response.status))).toBe(true);
  const before = await WebhookDelivery.find().sort({ eventType: 1 }).lean();
  expect(before).toHaveLength(2);
  await endpoint(); await book(key).expect(200);
  expect(await Booking.countDocuments()).toBe(1);
  expect(await WebhookDelivery.find().sort({ eventType: 1 }).lean()).toEqual(before);
});

it('distinct bookings receive distinct event identities and no subscribers remains a valid creation', async () => {
  await book().expect(201); expect(await WebhookDelivery.countDocuments()).toBe(0);
  await endpoint(); await book().expect(201); await book().expect(201);
  expect(new Set((await WebhookDelivery.find().lean()).map(row => row.eventId)).size).toBe(4);
});

const cancellable = async () => {
  const response = await book().expect(201);
  const bookingId = new Types.ObjectId(response.body.data._id);
  await requestBookingCancellation(bookingId, tenantId);
  return bookingId;
};

it('concurrent cancellation finalizers persist one event with inventory release and both notices', async () => {
  const bookingId = await cancellable(); await endpoint();
  await Promise.all([finalizeBookingCancellation(bookingId, tenantId), finalizeBookingCancellation(bookingId, tenantId)]);
  expect(await Booking.findById(bookingId)).toMatchObject({ status: 'cancelled', inventoryReleasedAt: expect.any(Date) });
  expect((await Availability.findOne())?.allDayBooked).toBe(0);
  const rows = await WebhookDelivery.find().lean(); expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ eventType: 'booking.cancelled', payload: { bookingId: String(bookingId), status: 'cancelled' } });
  expect(await BookingOperatorNotification.countDocuments({ bookingId })).toBe(1);
  expect(await BookingCustomerNotification.countDocuments({ bookingId })).toBe(1);
  const before = rows[0]; await endpoint(); await finalizeBookingCancellation(bookingId, tenantId);
  expect(await WebhookDelivery.find().lean()).toEqual([before]);
});

it('queue failure rolls cancellation back and the recovery worker commits the event on retry', async () => {
  const bookingId = await cancellable(); await endpoint();
  const spy = jest.spyOn(WebhookDelivery, 'updateOne').mockRejectedValueOnce(new Error('queue unavailable'));
  expect(await processBookingCancellation(bookingId, tenantId)).toBeNull();
  expect(await Booking.findById(bookingId)).toMatchObject({ status: 'confirmed' });
  expect((await Availability.findOne())?.allDayBooked).toBe(2);
  expect(await WebhookDelivery.countDocuments()).toBe(0);
  expect(await BookingCustomerNotification.countDocuments({ bookingId })).toBe(0);
  expect(await BookingCancellation.findById(bookingId)).toMatchObject({ status: 'retry' });
  spy.mockRestore();
  await BookingCancellation.updateOne({ _id: bookingId }, { $set: { nextAttemptAt: new Date(0) } });
  expect(await processBookingCancellation(bookingId, tenantId)).toMatchObject({ status: 'cancelled' });
  expect(await WebhookDelivery.countDocuments({ eventType: 'booking.cancelled' })).toBe(1);
});

it('rejects a foreign cancellation and never backfills an already completed historical cancellation', async () => {
  const bookingId = await cancellable(); await endpoint(otherTenantId);
  await expect(finalizeBookingCancellation(bookingId, otherTenantId)).rejects.toThrow('CANCELLATION_CONFLICT');
  expect(await WebhookDelivery.countDocuments()).toBe(0);
  await finalizeBookingCancellation(bookingId, tenantId);
  await endpoint(); await finalizeBookingCancellation(bookingId, tenantId);
  expect(await WebhookDelivery.countDocuments()).toBe(0);
});

it('refund evidence cannot commit accounting without its cancellation event, and retries apply it once', async () => {
  const bookingId = await cancellable(); await endpoint(); const userId = new Types.ObjectId();
  const total = (await Booking.findById(bookingId))!.total;
  await User.collection.insertOne({ _id: userId, totalSpent: total });
  await Booking.updateOne({ _id: bookingId }, { $set: { userId, paymentMethod: 'card', paymentStatus: 'succeeded', stripePaymentIntentId: 'pi_qa_cancel' } });
  const refund = { id: 're_qa_cancel', status: 'succeeded', amount: Math.round(total * 100), paymentIntentId: 'pi_qa_cancel', metadata: {
    atnRefundFlow: 'booking-cancellation', bookingId: String(bookingId), tenantId: String(tenantId),
  } };
  const write = jest.spyOn(WebhookDelivery, 'updateOne').mockRejectedValueOnce(new Error('queue unavailable'));
  await expect(finalizeBookingCancellation(bookingId, tenantId, [refund])).rejects.toThrow('queue unavailable');
  expect(await Booking.findById(bookingId)).toMatchObject({ status: 'confirmed', paymentStatus: 'succeeded' });
  expect((await User.collection.findOne({ _id: userId }))?.totalSpent).toBe(total);
  expect((await Availability.findOne())?.allDayBooked).toBe(2);
  expect(await WebhookDelivery.countDocuments()).toBe(0);
  write.mockRestore();
  await Promise.all([finalizeBookingCancellation(bookingId, tenantId, [refund]), finalizeBookingCancellation(bookingId, tenantId, [refund])]);
  expect(await Booking.findById(bookingId)).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded', refundedAmount: total });
  expect((await User.collection.findOne({ _id: userId }))?.totalSpent).toBe(0);
  expect(await WebhookDelivery.countDocuments({ eventType: 'booking.cancelled' })).toBe(1);
});
