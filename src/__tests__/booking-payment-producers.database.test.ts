import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Booking } from '../models/Booking';
import { Availability } from '../models/Availability';
import { BookingPaymentNotification } from '../models/BookingPaymentNotification';
import { ensureBookingPaymentNotificationIndexes } from '../services/bookingPaymentNotification.service';
import { failCardBookingAndReleaseInventory, markCardPaymentFailed } from '../services/bookingInventory.service';
import { env } from '../config/env';
import { listNotificationFailures, reconcileNotificationFailure } from '../controllers/notificationFailures.controller';

jest.mock('../services/bookingPaymentEmail.service', () => ({ sendBookingPaymentNotice: jest.fn() }));
jest.setTimeout(120_000);
let mongo: MongoMemoryReplSet;
const tenantId = new Types.ObjectId(), bookingId = new Types.ObjectId(), attractionId = new Types.ObjectId(), foreignTenant = new Types.ObjectId();
const day = new Date('2027-07-15T00:00:00Z');
const previous = env.bookingPaymentFollowupStartAt;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('payment_followup_producers'));
  await Promise.all([Booking.init(), Availability.init(), ensureBookingPaymentNotificationIndexes()]);
});
afterAll(async () => { env.bookingPaymentFollowupStartAt = previous; await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  jest.restoreAllMocks();
  env.bookingPaymentFollowupStartAt = new Date(Date.now() - 60 * 60_000).toISOString();
  await Promise.all([Booking.collection.deleteMany({}), Availability.collection.deleteMany({}), BookingPaymentNotification.deleteMany({})]);
  await Booking.collection.insertOne({ _id: bookingId, tenantId, attractionId, reference: 'QA-PAYMENT-FOLLOWUP',
    paymentMethod: 'card', paymentStatus: 'pending', status: 'pending', stripePaymentIntentId: 'pi_qa_followup',
    subtotal: 100, fees: 0, total: 100, currency: 'USD', createdAt: new Date(Date.now() - 10 * 60_000), updatedAt: new Date(),
    items: [{ optionId: 'standard', optionName: 'Standard', date: '2027-07-15', quantities: { adults: 1, children: 0, infants: 0 }, unitPrice: 100, totalPrice: 100 }],
    inventoryReservedAt: new Date(), inventoryReservations: [{ date: day, guests: 1 }],
    guestDetails: { firstName: 'QA', lastName: 'Guest', email: 'qa@example.invalid', phone: '+200000000000', country: 'EG' } });
  await Availability.create({ attractionId, date: day, allDayCapacity: 5, allDayBooked: 1, timeSlots: [] });
});

it('persists both audiences with failed state atomically and deduplicates concurrent webhooks', async () => {
  await Promise.all(Array.from({ length: 4 }, () => markCardPaymentFailed(bookingId, tenantId, 'pi_qa_followup')));
  expect(await Booking.findById(bookingId)).toMatchObject({ paymentStatus: 'failed', status: 'pending', paymentFailureReason: 'payment_failed', paymentFailureAt: expect.any(Date) });
  const rows = await BookingPaymentNotification.find({ tenantId }).lean();
  expect(rows).toHaveLength(2); expect(rows.map(r => r.audience).sort()).toEqual(['customer', 'operator']);
  expect(rows.every(r => r.kind === 'payment_failed' && r.nextAttemptAt.getTime() > Date.now())).toBe(true);
  expect((await Availability.findOne())?.allDayBooked).toBe(1);
});

it('rolls back failure state and all intents when queue persistence fails', async () => {
  jest.spyOn(BookingPaymentNotification, 'updateOne').mockRejectedValueOnce(new Error('queue unavailable'));
  await expect(markCardPaymentFailed(bookingId, tenantId, 'pi_qa_followup')).rejects.toThrow('queue unavailable');
  expect(await Booking.findById(bookingId)).toMatchObject({ status: 'pending', paymentStatus: 'pending' });
  expect(await BookingPaymentNotification.countDocuments()).toBe(0);
});

it('releases inventory, records expiry and enqueues once in the same transaction', async () => {
  const results = await Promise.all(Array.from({ length: 3 }, () => failCardBookingAndReleaseInventory(bookingId, tenantId, 'pi_qa_followup', true)));
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await Booking.findById(bookingId)).toMatchObject({ paymentStatus: 'failed', status: 'cancelled', paymentFailureReason: 'expired', inventoryReleasedAt: expect.any(Date), stripePaymentSessionClosedAt: expect.any(Date) });
  expect((await Availability.findOne())?.allDayBooked).toBe(0);
  expect(await BookingPaymentNotification.countDocuments({ kind: 'checkout_expired' })).toBe(2);
});

it('rolls back released inventory and expired state if either followup cannot be persisted', async () => {
  const original = BookingPaymentNotification.updateOne.bind(BookingPaymentNotification);
  let calls = 0;
  jest.spyOn(BookingPaymentNotification, 'updateOne').mockImplementation(((...args: unknown[]) => {
    if (++calls === 2) return Promise.reject(new Error('second audience unavailable'));
    return (original as (...values: unknown[]) => unknown)(...args);
  }) as never);
  await expect(failCardBookingAndReleaseInventory(bookingId, tenantId, 'pi_qa_followup', true)).rejects.toThrow('second audience unavailable');
  expect(await Booking.findById(bookingId)).toMatchObject({ status: 'pending', paymentStatus: 'pending' });
  expect((await Availability.findOne())?.allDayBooked).toBe(1);
  expect(await BookingPaymentNotification.countDocuments()).toBe(0);
});

it('persists the recovered cancelled payment identity before releasing a claimed session', async () => {
  await Booking.updateOne({ _id: bookingId, tenantId }, { $unset: { stripePaymentIntentId: 1 }, $set: { stripePaymentSessionClaimedAt: new Date() } });
  await failCardBookingAndReleaseInventory(bookingId, tenantId, undefined, true, 'pi_recovered');
  expect(await Booking.findById(bookingId)).toMatchObject({ stripePaymentIntentId: 'pi_recovered', paymentFailureReason: 'expired' });
  expect(await BookingPaymentNotification.countDocuments()).toBe(2);
});

it('cannot overwrite a concurrently bound different payment or release a newly claimed session', async () => {
  expect(await failCardBookingAndReleaseInventory(bookingId, tenantId, undefined, true, 'pi_different')).toBeNull();
  await Booking.updateOne({ _id: bookingId, tenantId }, { $unset: { stripePaymentIntentId: 1 }, $set: { stripePaymentSessionClaimedAt: new Date() } });
  expect(await failCardBookingAndReleaseInventory(bookingId, tenantId)).toBeNull();
  expect((await Availability.findOne())?.allDayBooked).toBe(1);
  expect(await BookingPaymentNotification.countDocuments()).toBe(0);
});

it('updates old payment truth without sending retrospective followups', async () => {
  await Booking.collection.updateOne({ _id: bookingId }, { $set: { createdAt: new Date(0) } });
  await markCardPaymentFailed(bookingId, tenantId, 'pi_qa_followup');
  await failCardBookingAndReleaseInventory(bookingId, tenantId, 'pi_qa_followup', true);
  expect(await Booking.findById(bookingId)).toMatchObject({ paymentFailureReason: 'expired' });
  expect(await BookingPaymentNotification.countDocuments()).toBe(0);
});

it('never mutates a paid, foreign-tenant or bundle-component booking', async () => {
  expect(await markCardPaymentFailed(bookingId, foreignTenant, 'pi_qa_followup')).toBeNull();
  await Booking.updateOne({ _id: bookingId, tenantId }, { $set: { paymentStatus: 'succeeded', status: 'confirmed' } });
  expect(await markCardPaymentFailed(bookingId, tenantId, 'pi_qa_followup')).toBeNull();
  expect(await failCardBookingAndReleaseInventory(bookingId, tenantId, 'pi_qa_followup', true)).toBeNull();
  await Booking.collection.updateOne({ _id: bookingId }, { $set: { paymentStatus: 'pending', status: 'pending', bundleOrderId: new Types.ObjectId() } });
  expect(await markCardPaymentFailed(bookingId, tenantId, 'pi_qa_followup')).toBeNull();
  expect(await BookingPaymentNotification.countDocuments()).toBe(0);
});

const invoke = async (handler: Function, overrides: Record<string, unknown> = {}) => {
  const req = { user: { _id: new Types.ObjectId(), role: 'brand-admin', assignedTenants: [tenantId] }, params: { tenantId: String(tenantId) }, query: { source: 'booking' }, ...overrides };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };
  const next = jest.fn(); await handler(req, res, next); if (next.mock.calls[0]) throw next.mock.calls[0][0];
  return { status: res.status.mock.calls[0]?.[0] || 200, body: res.json.mock.calls[0]?.[0] };
};
it('includes payment notices in tenant-scoped cursor review and reconciles without resending', async () => {
  await markCardPaymentFailed(bookingId, tenantId, 'pi_qa_followup');
  await BookingPaymentNotification.updateMany({}, { $set: { status: 'manual_review', lastError: 'PRIVATE_PROVIDER_CONTENT' } });
  const first = await invoke(listNotificationFailures, { query: { source: 'booking', limit: '1' } });
  const second = await invoke(listNotificationFailures, { query: { source: 'booking', limit: '1', cursor: first.body.data.pageInfo.nextCursor } });
  expect(first.body.data.data).toHaveLength(1); expect(second.body.data.data).toHaveLength(1);
  expect(second.body.data.pageInfo.hasMore).toBe(false); expect(JSON.stringify(first.body)).not.toContain('PRIVATE_PROVIDER_CONTENT');
  const row = await BookingPaymentNotification.findOne();
  const body = { expectedUpdatedAt: row!.updatedAt.toISOString(), decision: 'closed_without_resend', note: 'Reviewed provider delivery evidence; no resend.' };
  const result = await invoke(reconcileNotificationFailure, { params: { tenantId: String(tenantId), source: 'booking', id: row!._id }, body });
  expect(result.status).toBe(200); expect(await BookingPaymentNotification.findById(row!._id)).toMatchObject({ status: 'resolved' });
  expect((await invoke(reconcileNotificationFailure, { params: { tenantId: String(foreignTenant), source: 'booking', id: row!._id }, body })).status).toBe(403);
});

it.each(['PAYMENT_CONTEXT_MISSING', 'PAYMENT_CONTEXT_MISMATCH', 'PAYMENT_CONTEXT_CHANGED', 'PAYMENT_STATUS_UNAVAILABLE', 'PAYMENT_STATUS_INCOMPATIBLE', 'PAYMENT_FAILURE_TIME_INVALID', 'LEGACY_DELIVERY_UNCERTAIN'])('exposes only the controlled payment review reason %s', async reason => {
  await markCardPaymentFailed(bookingId, tenantId, 'pi_qa_followup');
  await BookingPaymentNotification.updateMany({}, { $set: { status: 'manual_review', lastError: reason } });
  const result = await invoke(listNotificationFailures);
  expect(result.status).toBe(200);
  expect(result.body.data.data).toHaveLength(2);
  expect(result.body.data.data.every((row: { lastError: string }) => row.lastError === reason)).toBe(true);
});
