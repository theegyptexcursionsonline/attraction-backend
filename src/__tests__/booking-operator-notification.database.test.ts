import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Booking } from '../models/Booking';
import { Tenant } from '../models/Tenant';
import { BookingOperatorNotification } from '../models/BookingOperatorNotification';
import {
  enqueueBookingOperatorNotification, ensureBookingOperatorNotificationIndexes,
  processBookingOperatorNotifications,
} from '../services/bookingOperatorNotification.service';

// No requireActual: the provider module and credentials are never loaded.
jest.mock('../services/email.service', () => ({ sendOperatorBookingStatusEmail: jest.fn() }));
const send = jest.requireMock('../services/email.service').sendOperatorBookingStatusEmail as jest.Mock;
jest.setTimeout(120_000);
let mongo: MongoMemoryReplSet;
const tenantId = new Types.ObjectId();
const bookingId = new Types.ObjectId();
const booking = {
  _id: bookingId, tenantId, reference: 'QA-OPERATOR-STATUS', currency: 'EUR', total: 100,
  guestDetails: { firstName: 'QA', lastName: 'Guest', email: 'guest@example.invalid' },
};
const cancellation = { kind: 'cancelled' as const, eventKey: 'cancelled' };
const row = () => BookingOperatorNotification.findOne().lean();
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('booking_operator_notifications'));
  await ensureBookingOperatorNotificationIndexes();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await Promise.all([Booking.collection.deleteMany({}), Tenant.collection.deleteMany({}), BookingOperatorNotification.deleteMany({})]);
  await Booking.collection.insertOne(booking);
  await Tenant.collection.insertOne({
    _id: tenantId, name: 'QA operator', slug: 'qa-operator', contactInfo: { email: 'support@example.invalid' },
    notificationSettings: { bookingEmail: 'bookings@example.invalid', bookingCcEmails: ['copies@example.invalid'] },
  });
  send.mockReset().mockResolvedValue({ status: 'sent' });
});

it('persists transactionally and aborts with the booking operation', async () => {
  const session = await mongoose.startSession();
  try {
    await expect(session.withTransaction(async () => {
      await enqueueBookingOperatorNotification(booking, cancellation, session);
      expect(await BookingOperatorNotification.countDocuments().session(session)).toBe(1);
      throw new Error('abort');
    })).rejects.toThrow('abort');
    expect(await BookingOperatorNotification.countDocuments()).toBe(0);
    await session.withTransaction(() => enqueueBookingOperatorNotification(booking, cancellation, session));
    expect(await BookingOperatorNotification.countDocuments()).toBe(1);
    expect(send).not.toHaveBeenCalled();
  } finally { await session.endSession(); }
});

it('deduplicates concurrent enqueue but preserves distinct refunds and tenant identities', async () => {
  await Promise.all(Array.from({ length: 10 }, () => enqueueBookingOperatorNotification(booking, cancellation)));
  expect(await BookingOperatorNotification.countDocuments()).toBe(1);
  await enqueueBookingOperatorNotification(booking, { kind: 'refunded', eventKey: 'refund-1', refundAmount: 20 });
  await enqueueBookingOperatorNotification(booking, { kind: 'refunded', eventKey: 'refund-2', refundAmount: 30 });
  await enqueueBookingOperatorNotification({ ...booking, tenantId: new Types.ObjectId() }, cancellation);
  expect(await BookingOperatorNotification.countDocuments()).toBe(4);
  expect(send).not.toHaveBeenCalled();
});

it('deduplicates competing transactions without losing their committed intent', async () => {
  await Promise.all(Array.from({ length: 4 }, async () => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(() => enqueueBookingOperatorNotification(booking, cancellation, session));
    } finally { await session.endSession(); }
  }));
  expect(await BookingOperatorNotification.countDocuments()).toBe(1);
  expect(send).not.toHaveBeenCalled();
});

it('claims once across workers and sends no guest email or guest access secret', async () => {
  await enqueueBookingOperatorNotification(booking, { ...cancellation, refundAmount: 100, fullRefund: true });
  const summaries = await Promise.all(Array.from({ length: 5 }, () => processBookingOperatorNotifications()));
  expect(summaries.reduce((sum, result) => sum + result.sent, 0)).toBe(1);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toEqual({
    reference: booking.reference, currency: 'EUR', guestName: 'QA Guest',
    kind: 'cancelled', refundAmount: 100, fullRefund: true,
  });
  expect(send.mock.calls[0][1].notificationSettings).toMatchObject({ bookingCcEmails: ['copies@example.invalid'] });
  expect(JSON.stringify(send.mock.calls)).not.toContain(booking.guestDetails.email);
  expect(await row()).toMatchObject({ status: 'sent', attempts: 1 });
  await enqueueBookingOperatorNotification(booking, cancellation);
  await processBookingOperatorNotifications();
  expect(send).toHaveBeenCalledTimes(1);
});

it('retries explicit provider rejection with backoff independently of customer delivery', async () => {
  await enqueueBookingOperatorNotification(booking, cancellation);
  send.mockRejectedValueOnce(Object.assign(new Error('private provider payload'), { status: 429 }));
  expect(await processBookingOperatorNotifications()).toEqual({ sent: 0, retried: 1, manualReview: 0 });
  expect(await row()).toMatchObject({ status: 'retry', attempts: 1, lastError: 'PROVIDER_REJECTED_429' });
  expect((await row())!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  await processBookingOperatorNotifications();
  expect(send).toHaveBeenCalledTimes(1);
  await BookingOperatorNotification.updateMany({}, { $set: { nextAttemptAt: new Date(0) } });
  expect((await processBookingOperatorNotifications()).sent).toBe(1);
  expect(await row()).toMatchObject({ status: 'sent', attempts: 2 });
});

it('bounds rejection retries and retains controlled diagnostics', async () => {
  await enqueueBookingOperatorNotification(booking, cancellation);
  send.mockRejectedValue({ status: 429, message: 'private provider payload' });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await BookingOperatorNotification.updateMany({}, { $set: { nextAttemptAt: new Date(0) } });
    await processBookingOperatorNotifications();
  }
  expect(await row()).toMatchObject({ status: 'manual_review', attempts: 5, lastError: 'PROVIDER_REJECTED_429' });
  await processBookingOperatorNotifications();
  expect(send).toHaveBeenCalledTimes(5);
});

it.each(['tenant', 'recipient', 'scope', 'invalid-copy'])('fails closed for missing or invalid %s', async (problem) => {
  await enqueueBookingOperatorNotification(booking, cancellation);
  if (problem === 'tenant') await Tenant.collection.deleteMany({});
  if (problem === 'recipient') await Tenant.collection.updateOne({ _id: tenantId }, { $unset: { contactInfo: 1, notificationSettings: 1 } });
  if (problem === 'scope') await Booking.collection.updateOne({ _id: bookingId }, { $set: { tenantId: new Types.ObjectId() } });
  if (problem === 'invalid-copy') await Tenant.collection.updateOne({ _id: tenantId }, { $set: { 'notificationSettings.bookingCcEmails': ['bad\r\nCc: unsafe@example.invalid'] } });
  expect((await processBookingOperatorNotifications()).manualReview).toBe(1);
  expect(await row()).toMatchObject({ status: 'manual_review' });
  expect(send).not.toHaveBeenCalled();
});

it('does not send unqueued historical cancellations and respects the batch bound', async () => {
  await Booking.collection.updateOne({ _id: bookingId }, { $set: { status: 'cancelled' } });
  expect(await processBookingOperatorNotifications()).toEqual({ sent: 0, retried: 0, manualReview: 0 });
  expect(send).not.toHaveBeenCalled();
  await enqueueBookingOperatorNotification(booking, cancellation);
  await enqueueBookingOperatorNotification(booking, { kind: 'refunded', eventKey: 'refund-1', refundAmount: 10 });
  expect((await processBookingOperatorNotifications(1)).sent).toBe(1);
  expect(await BookingOperatorNotification.countDocuments({ status: 'pending' })).toBe(1);
});

it('quarantines expired in-flight delivery instead of resending', async () => {
  await enqueueBookingOperatorNotification(booking, cancellation);
  await BookingOperatorNotification.updateMany({}, { $set: {
    status: 'processing', attempts: 1, leaseToken: 'old-worker', leaseUntil: new Date(0),
  } });
  expect((await processBookingOperatorNotifications()).manualReview).toBe(1);
  expect(await row()).toMatchObject({ status: 'manual_review', lastError: 'DELIVERY_UNCERTAIN_LEASE_EXPIRED' });
  expect(send).not.toHaveBeenCalled();
});

it('fences late completion after another worker quarantines a slow send', async () => {
  await enqueueBookingOperatorNotification(booking, cancellation);
  let complete!: (value: { status: string }) => void;
  let entered!: () => void;
  const sending = new Promise<void>((resolve) => { entered = resolve; });
  send.mockImplementationOnce(() => { entered(); return new Promise((resolve) => { complete = resolve; }); });
  const first = processBookingOperatorNotifications(1);
  await sending;
  await BookingOperatorNotification.updateMany({}, { $set: { leaseUntil: new Date(0) } });
  expect((await processBookingOperatorNotifications()).manualReview).toBe(1);
  complete({ status: 'sent' });
  expect((await first).sent).toBe(0);
  expect(await row()).toMatchObject({ status: 'manual_review', lastError: 'DELIVERY_UNCERTAIN_LEASE_EXPIRED' });
  expect(send).toHaveBeenCalledTimes(1);
});

it.each([
  { error: new Error('socket timeout'), code: 'DELIVERY_UNCERTAIN' },
  { result: { status: 'skipped', reason: 'provider_not_configured' }, code: 'DELIVERY_SKIPPED_PROVIDER_NOT_CONFIGURED' },
])('never marks ambiguous or skipped delivery sent ($code)', async ({ error, result, code }) => {
  await enqueueBookingOperatorNotification(booking, cancellation);
  if (error) send.mockRejectedValue(error); else send.mockResolvedValue(result);
  expect((await processBookingOperatorNotifications()).manualReview).toBe(1);
  expect(await row()).toMatchObject({ status: 'manual_review', lastError: code });
  await processBookingOperatorNotifications();
  expect(send).toHaveBeenCalledTimes(1);
});


it.each([408, 500, 502, 503, 504])('quarantines ambiguous HTTP %s rather than resending a possibly accepted message', async (status) => {
  await enqueueBookingOperatorNotification(booking, cancellation);
  send.mockRejectedValue({ status });
  expect((await processBookingOperatorNotifications()).manualReview).toBe(1);
  await processBookingOperatorNotifications();
  expect(send).toHaveBeenCalledTimes(1);
  expect(await row()).toMatchObject({ status: 'manual_review', lastError: 'DELIVERY_UNCERTAIN' });
});
