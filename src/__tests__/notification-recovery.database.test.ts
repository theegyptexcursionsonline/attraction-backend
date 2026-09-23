import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Booking } from '../models/Booking';
import { Availability } from '../models/Availability';
import { updateBookingStatus } from '../controllers/bookings.controller';
import { refundPayment } from '../controllers/payments.controller';
import { applyBookingRefundTotal } from '../services/bookingRefund.service';
import { BookingCancellation } from '../models/BookingCancellation';
import { BookingCustomerNotification } from '../models/BookingCustomerNotification';
import { BookingOperatorNotification } from '../models/BookingOperatorNotification';
import { BundleOutboxEvent } from '../models/BundleOutboxEvent';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import { enqueueBookingOperatorNotification, processBookingOperatorNotifications } from '../services/bookingOperatorNotification.service';
import { requestBookingCancellation, processBookingCancellation, finalizeBookingCancellation, processPendingBookingCancellations, ATN_REFUND_FLOW_KEY, ATN_CANCELLATION_REFUND_FLOW } from '../services/bookingCancellation.service';
import { createRefund, listPaymentIntentRefunds } from '../services/stripe.service';
import { getTenantStripeConfig } from '../services/tenantPayment.service';
import { listNotificationFailures, reconcileNotificationFailure } from '../controllers/notificationFailures.controller';

jest.mock('../services/stripe.service', () => ({ createRefund: jest.fn(), listPaymentIntentRefunds: jest.fn() }));
jest.mock('../services/tenantPayment.service', () => ({ getTenantStripeConfig: jest.fn(), stripeCredentialMode: jest.fn(() => 'test') }));
jest.mock('../services/email.service', () => ({ sendOperatorBookingStatusEmail: jest.fn(), sendBookingStatusEmail: jest.fn() }));
const email = jest.requireMock('../services/email.service');
jest.setTimeout(120_000);
let mongo: MongoMemoryReplSet;
const tenantId = new Types.ObjectId(), bookingId = new Types.ObjectId(), userId = new Types.ObjectId();
const otherTenant = new Types.ObjectId();
const refund = { id: 're_qa_cancel', status: 'succeeded', amount: 10000, paymentIntentId: 'pi_qa_cancel', metadata: {
  [ATN_REFUND_FLOW_KEY]: ATN_CANCELLATION_REFUND_FLOW, bookingId: String(bookingId), tenantId: String(tenantId),
} };
const insert = async () => {
  await Booking.collection.insertOne({ _id: bookingId, tenantId, userId, attractionId: new Types.ObjectId(), reference: 'QA-CANCEL-RECOVERY',
    status: 'confirmed', paymentStatus: 'succeeded', paymentMethod: 'card', stripePaymentIntentId: refund.paymentIntentId,
    subtotal: 100, total: 100, currency: 'EUR', refundedAmount: 0, refunds: [], items: [],
    guestDetails: { firstName: 'QA', lastName: 'Guest', email: 'qa@example.invalid', phone: '+200000000000', country: 'EG' } });
  await User.collection.insertOne({ _id: userId, totalSpent: 100 });
  await Tenant.collection.insertOne({ _id: tenantId, name: 'QA Cruises', slug: 'qa-cruises', contactInfo: { email: 'operator@example.invalid' }, notificationSettings: { bookingCcEmails: ['copy@example.invalid'] } });
};
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('notification_recovery'));
  await Promise.all([Booking.init(), BookingCancellation.init(), BookingOperatorNotification.init(), BookingCustomerNotification.init(), BundleOutboxEvent.init(), User.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  jest.restoreAllMocks(); jest.clearAllMocks();
  await Promise.all([Booking.collection.deleteMany({}), Tenant.collection.deleteMany({}), Availability.collection.deleteMany({}), BookingCancellation.deleteMany({}), BookingOperatorNotification.deleteMany({}), BookingCustomerNotification.deleteMany({}), BundleOutboxEvent.deleteMany({}), User.collection.deleteMany({})]);
  await insert();
  (getTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true, secretKey: 'sk_test_mock' });
  (listPaymentIntentRefunds as jest.Mock).mockResolvedValue([]);
  (createRefund as jest.Mock).mockResolvedValue(refund);
  email.sendOperatorBookingStatusEmail.mockReset().mockResolvedValue({ status: 'sent' });
  email.sendBookingStatusEmail.mockReset().mockResolvedValue({ status: 'sent' });
});
const counts = async () => ({ rows: await BookingOperatorNotification.countDocuments({ audience: 'operator' }), spent: (await User.collection.findOne({ _id: userId }))?.totalSpent });
const retryNow = async () => BookingCancellation.updateMany({}, { $set: { nextAttemptAt: new Date(0), leaseUntil: new Date(0) } });

it('persists intent before Stripe and completes booking, accounting and alert exactly once under concurrency', async () => {
  await requestBookingCancellation(bookingId, tenantId);
  (createRefund as jest.Mock).mockImplementationOnce(async () => {
    expect(await BookingCancellation.findById(bookingId)).toMatchObject({ status: 'processing', providerAttemptedAt: expect.any(Date) });
    return refund;
  });
  await Promise.all(Array.from({ length: 4 }, () => processBookingCancellation(bookingId, tenantId)));
  expect(createRefund).toHaveBeenCalledTimes(1);
  expect(await Booking.findById(bookingId)).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded', refundedAmount: 100 });
  expect(await counts()).toEqual({ rows: 1, spent: 0 });
  await processBookingCancellation(bookingId, tenantId);
  expect(createRefund).toHaveBeenCalledTimes(1);
});

it('recovers a crash after Stripe success and before local commit without issuing a second refund', async () => {
  await requestBookingCancellation(bookingId, tenantId);
  const save = jest.spyOn(Booking.prototype, 'save').mockRejectedValueOnce(new Error('database interrupted'));
  expect(await processBookingCancellation(bookingId, tenantId)).toBeNull();
  expect(await counts()).toEqual({ rows: 0, spent: 100 });
  expect(await BookingCancellation.findById(bookingId)).toMatchObject({ status: 'retry', providerAttemptedAt: expect.any(Date) });
  save.mockRestore();
  (listPaymentIntentRefunds as jest.Mock).mockResolvedValue([refund]);
  await retryNow(); await processPendingBookingCancellations();
  expect(createRefund).toHaveBeenCalledTimes(1);
  expect(await counts()).toEqual({ rows: 1, spent: 0 });
});

it('recovers an expired in-flight operation by provider read, and quarantines an unknown result without resending', async () => {
  await requestBookingCancellation(bookingId, tenantId);
  await BookingCancellation.updateOne({ _id: bookingId }, { $set: { status: 'processing', leaseUntil: new Date(0), providerAttemptedAt: new Date() } });
  await processPendingBookingCancellations();
  expect(createRefund).not.toHaveBeenCalled();
  expect(await BookingCancellation.findById(bookingId)).toMatchObject({ status: 'manual_review', lastError: 'CANCELLATION_REFUND_UNCERTAIN' });
  expect(await counts()).toEqual({ rows: 0, spent: 100 });
});

it('completes legacy cancellation-tagged provider evidence concurrently without a prior intent', async () => {
  await Promise.all([finalizeBookingCancellation(bookingId, tenantId, [refund]), finalizeBookingCancellation(bookingId, tenantId, [refund])]);
  expect(await counts()).toEqual({ rows: 1, spent: 0 });
  expect(await BookingCancellation.findById(bookingId)).toMatchObject({ status: 'completed' });
  expect(createRefund).not.toHaveBeenCalled();
});

it('never adopts evidence for a different tenant or booking', async () => {
  await expect(finalizeBookingCancellation(bookingId, otherTenant, [refund])).rejects.toThrow('CANCELLATION_CONFLICT');
  await expect(finalizeBookingCancellation(bookingId, tenantId, [{ ...refund, metadata: { ...refund.metadata, tenantId: String(otherTenant) } }])).rejects.toThrow('CANCELLATION_INTENT_MISSING');
  expect(await counts()).toEqual({ rows: 0, spent: 100 });
});

it('refunds only the remaining amount and subtracts only the unapplied accounting delta', async () => {
  await Booking.updateOne({ _id: bookingId }, { $set: { refundedAmount: 25 } });
  await User.collection.updateOne({ _id: userId }, { $set: { totalSpent: 75 } });
  (listPaymentIntentRefunds as jest.Mock).mockResolvedValue([{ ...refund, id: 're_prior', amount: 2500, metadata: {} }]);
  (createRefund as jest.Mock).mockResolvedValue({ ...refund, amount: 7500 });
  await requestBookingCancellation(bookingId, tenantId); await processBookingCancellation(bookingId, tenantId);
  expect(createRefund).toHaveBeenCalledWith(expect.any(String), refund.paymentIntentId, 7500, expect.any(Object));
  expect((await BookingOperatorNotification.find({ bookingId }).lean()).map((row) => row.refundAmount)).toEqual([75]);
  expect((await BookingCustomerNotification.find({ bookingId }).lean()).map((row) => row.refundAmount)).toEqual([75]);
  expect(await counts()).toEqual({ rows: 1, spent: 0 });
});

it('retains pending provider refunds for recovery and does not release inventory', async () => {
  (createRefund as jest.Mock).mockResolvedValue({ ...refund, status: 'pending' });
  await requestBookingCancellation(bookingId, tenantId); await processBookingCancellation(bookingId, tenantId);
  expect(await Booking.findById(bookingId)).toMatchObject({ status: 'confirmed' });
  expect(await BookingCancellation.findById(bookingId)).toMatchObject({ status: 'retry' });
  expect(await counts()).toEqual({ rows: 0, spent: 100 });
});

const invoke = async (handler: typeof listNotificationFailures, changes: Record<string, unknown> = {}) => {
  const req = { params: { tenantId: String(tenantId) }, query: { source: 'booking' }, user: { _id: userId, role: 'brand-admin', assignedTenants: [tenantId] }, ...changes };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis() };
  const next = jest.fn(); await handler(req as any, res as any, next); expect(next).not.toHaveBeenCalled();
  return { status: res.status.mock.calls[0]?.[0] || 200, body: res.json.mock.calls[0]?.[0] };
};
const seedFailures = async () => {
  for (let i = 1; i <= 4; i++) await BookingOperatorNotification.create({ _id: String(i).padStart(64, '0'), tenantId, bookingId, kind: 'cancelled', status: 'manual_review', lastError: 'DELIVERY_UNCERTAIN' });
  await BookingOperatorNotification.create({ _id: 'f'.repeat(64), tenantId: otherTenant, bookingId, kind: 'cancelled', status: 'manual_review' });
};
it('paginates through every scoped notification and excludes other tenants and private provider errors', async () => {
  await seedFailures();
  const one = await invoke(listNotificationFailures, { query: { source: 'booking', limit: '2' } });
  const two = await invoke(listNotificationFailures, { query: { source: 'booking', limit: '2', cursor: one.body.data.pageInfo.nextCursor } });
  expect(one.body.data.data).toHaveLength(2); expect(two.body.data.data).toHaveLength(2);
  expect(two.body.data.pageInfo.hasMore).toBe(false);
  expect(new Set([...one.body.data.data, ...two.body.data.data].map((row: any) => row.id)).size).toBe(4);
});
it.each(['customer', 'viewer', 'manager', 'editor'])('denies %s and cross-tenant admin access', async (role) => {
  expect((await invoke(listNotificationFailures, { user: { role, assignedTenants: [tenantId] } })).status).toBe(403);
  expect((await invoke(listNotificationFailures, { user: { role: 'brand-admin', assignedTenants: [otherTenant] } })).status).toBe(403);
});
it('reconciles with a compare-and-set, records the decision and never resends', async () => {
  await seedFailures(); const row = await BookingOperatorNotification.findOne({ tenantId });
  const request = { params: { tenantId: String(tenantId), source: 'booking', id: row!._id }, body: { expectedUpdatedAt: row!.updatedAt.toISOString(), decision: 'closed_without_resend', note: 'Reviewed provider history; no resend requested.' } };
  const results = await Promise.all([invoke(reconcileNotificationFailure, request), invoke(reconcileNotificationFailure, request)]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(await BookingOperatorNotification.findById(row!._id)).toMatchObject({ status: 'resolved', reconciliation: { actorId: userId, decision: 'closed_without_resend' } });
  expect(createRefund).not.toHaveBeenCalled();
});
it('does not reconcile a foreign row or accept a resend command', async () => {
  await seedFailures(); const row = await BookingOperatorNotification.findOne({ tenantId: otherTenant });
  const params = { tenantId: String(tenantId), source: 'booking', id: row!._id };
  const body = { expectedUpdatedAt: row!.updatedAt.toISOString(), decision: 'confirmed_delivered', note: 'Reviewed provider history and inbox.' };
  expect((await invoke(reconcileNotificationFailure, { params, body })).status).toBe(409);
  expect((await invoke(reconcileNotificationFailure, { params, body: { ...body, decision: 'resend' } })).status).toBe(400);
});

it('rolls back the cancellation claim if intent persistence fails before Stripe', async () => {
  const write = jest.spyOn(BookingCancellation, 'updateOne').mockRejectedValueOnce(new Error('intent unavailable'));
  await expect(requestBookingCancellation(bookingId, tenantId)).rejects.toThrow('intent unavailable');
  write.mockRestore();
  expect((await Booking.findById(bookingId))?.cancellationRequestedAt).toBeUndefined();
  expect(createRefund).not.toHaveBeenCalled();
});

it('does not release a payment session that is still being created', async () => {
  await Booking.updateOne({ _id: bookingId }, { $set: { status: 'pending', paymentStatus: 'pending', stripePaymentSessionClaimedAt: new Date() }, $unset: { stripePaymentIntentId: 1 } });
  await expect(requestBookingCancellation(bookingId, tenantId)).rejects.toThrow('CANCELLATION_PAYMENT_UNRESOLVED');
  expect(await BookingCancellation.countDocuments()).toBe(0); expect(createRefund).not.toHaveBeenCalled();
});

it('retains a recoverable claim when enqueue fails after a successful refund', async () => {
  await requestBookingCancellation(bookingId, tenantId);
  const write = jest.spyOn(BookingOperatorNotification, 'updateOne').mockRejectedValueOnce(new Error('outbox unavailable'));
  expect(await processBookingCancellation(bookingId, tenantId)).toBeNull();
  write.mockRestore(); expect(await counts()).toEqual({ rows: 0, spent: 100 });
  (listPaymentIntentRefunds as jest.Mock).mockResolvedValue([refund]);
  await retryNow(); await processPendingBookingCancellations();
  expect(await counts()).toEqual({ rows: 1, spent: 0 }); expect(createRefund).toHaveBeenCalledTimes(1);
});

it('keeps bundle recipient failures separate and redacts legacy provider content', async () => {
  await BundleOutboxEvent.create({ eventId: 'qa-supplier-event', orderId: new Types.ObjectId(), tenantId: otherTenant, audience: 'supplier', eventType: 'bundle.order_refunded', payload: {}, status: 'manual_review', lastError: 'recipient@other.example secret-token' });
  await BundleOutboxEvent.create({ eventId: 'qa-storefront-event', orderId: new Types.ObjectId(), tenantId, audience: 'storefront', eventType: 'bundle.order_refunded', payload: {}, status: 'manual_review', lastError: 'PRIVATE_PROVIDER_TOKEN' });
  const listed = await invoke(listNotificationFailures, { query: { source: 'bundle' } });
  expect(listed.body.data.data).toHaveLength(1);
  expect(listed.body.data.data[0].lastError).toBe('DELIVERY_REVIEW_REQUIRED');
  expect(JSON.stringify(listed.body)).not.toContain('PRIVATE_PROVIDER_TOKEN');
  const row = await BundleOutboxEvent.findOne({ tenantId });
  const updated = await invoke(reconcileNotificationFailure, { params: { tenantId: String(tenantId), source: 'bundle', id: String(row!._id) }, body: { expectedUpdatedAt: row!.updatedAt.toISOString(), decision: 'confirmed_delivered', note: 'Confirmed in provider history and recipient inbox.' } });
  expect(updated.status).toBe(200);
  expect(await BundleOutboxEvent.findById(row!._id)).toMatchObject({ status: 'delivered', manualRecoveryRequired: false, reconciliation: { decision: 'confirmed_delivered', note: 'Confirmed in provider history and recipient inbox.', actorId: userId, at: expect.any(Date) } });
  const resolved = await invoke(listNotificationFailures, { query: { source: 'bundle', status: 'resolved' } });
  expect(resolved.body.data.data).toHaveLength(1);
  expect(resolved.body.data.data[0].reconciliation.decision).toBe('confirmed_delivered');
});

it('blocks an admin completion or separate refund once cancellation owns the booking', async () => {
  await requestBookingCancellation(bookingId, tenantId);
  expect((await invoke(updateBookingStatus, { params: { id: String(bookingId) }, body: { status: 'completed' } })).status).toBe(409);
  expect((await invoke(refundPayment, { params: { bookingId: String(bookingId) }, body: { amount: 100 } })).status).toBe(409);
  expect(createRefund).not.toHaveBeenCalled();
});

it('racing refund accounting and cancellation finalization never decrement twice', async () => {
  const booking = await Booking.findById(bookingId);
  await requestBookingCancellation(bookingId, tenantId);
  await Promise.all([applyBookingRefundTotal(booking!, 10000), finalizeBookingCancellation(bookingId, tenantId, [refund])]);
  expect((await counts()).spent).toBe(0);
  expect(await BookingOperatorNotification.countDocuments({ tenantId, bookingId, kind: 'cancelled', audience: 'operator' })).toBe(1);
  expect(await Booking.findById(bookingId)).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded', refundedAmount: 100 });
});

it('releases all capacity-consuming guests once when recovery wins against a repeated finalizer', async () => {
  const attractionId = new Types.ObjectId(), date = new Date('2030-03-10T00:00:00.000Z');
  await Booking.updateOne({ _id: bookingId }, { $set: { attractionId, inventoryReservedAt: new Date(), inventoryReservations: [{ date, time: '09:00', guests: 3 }] } });
  await Availability.collection.insertOne({ attractionId, date, timeSlots: [{ time: '09:00', capacity: 10, booked: 3 }] });
  await requestBookingCancellation(bookingId, tenantId);
  await Promise.all([finalizeBookingCancellation(bookingId, tenantId, [refund]), finalizeBookingCancellation(bookingId, tenantId, [refund])]);
  expect((await Availability.collection.findOne({ attractionId, date }))?.timeSlots[0].booked).toBe(0);
  expect(await counts()).toEqual({ rows: 1, spent: 0 });
});

it('never resurrects a failed refund ledger entry from stale succeeded provider evidence', async () => {
  await requestBookingCancellation(bookingId, tenantId);
  await Booking.updateOne({ _id: bookingId }, { $push: { refunds: { providerRefundId: refund.id, amount: 100, status: 'failed', createdAt: new Date() } } });
  await expect(finalizeBookingCancellation(bookingId, tenantId, [refund])).rejects.toThrow('CANCELLATION_REFUND_REVERSED');
  (listPaymentIntentRefunds as jest.Mock).mockResolvedValue([refund]);
  await processBookingCancellation(bookingId, tenantId);
  expect(await BookingCancellation.findById(bookingId)).toMatchObject({ status: 'manual_review', lastError: 'CANCELLATION_REFUND_REVERSED' });
  expect(await Booking.findById(bookingId)).toMatchObject({ status: 'confirmed', paymentStatus: 'succeeded', refunds: [expect.objectContaining({ status: 'failed' })] });
  expect(await counts()).toEqual({ rows: 0, spent: 100 }); expect(createRefund).not.toHaveBeenCalled();
});

it('durably queues recovered cancellation for customer and operator separately without duplicate request sends', async () => {
  await finalizeBookingCancellation(bookingId, tenantId, [refund]);
  await finalizeBookingCancellation(bookingId, tenantId, [refund]);
  expect(await BookingOperatorNotification.countDocuments({ bookingId, kind: 'cancelled' })).toBe(1);
  expect(await BookingCustomerNotification.countDocuments({ bookingId, kind: 'cancelled' })).toBe(1);
  expect(email.sendBookingStatusEmail).not.toHaveBeenCalled();
  email.sendBookingStatusEmail.mockRejectedValueOnce({ status: 429 });
  const first = await processBookingOperatorNotifications();
  expect(first).toMatchObject({ sent: 1, retried: 1 });
  expect(email.sendOperatorBookingStatusEmail).toHaveBeenCalledTimes(1);
  expect(email.sendOperatorBookingStatusEmail.mock.calls[0][0]).not.toHaveProperty('guestAccessToken');
  expect(email.sendBookingStatusEmail.mock.calls[0][0]).toBe('qa@example.invalid');
  expect(email.sendBookingStatusEmail.mock.calls[0][1].guestAccessToken).toEqual(expect.any(String));
  await BookingCustomerNotification.updateMany({ status: 'retry' }, { $set: { nextAttemptAt: new Date(0) } });
  expect((await processBookingOperatorNotifications()).sent).toBe(1);
  expect(email.sendOperatorBookingStatusEmail).toHaveBeenCalledTimes(1);
  expect(email.sendBookingStatusEmail).toHaveBeenCalledTimes(2);
  expect(JSON.stringify([await BookingOperatorNotification.find().lean(), await BookingCustomerNotification.find().lean()])).not.toMatch(/guestAccessToken|qa@example.invalid/);
});


it('isolates customer intents from legacy worker claim and expired-lease selectors', async () => {
  const booking = (await Booking.findById(bookingId))!;
  const event = { kind: 'cancelled' as const, eventKey: 'cancelled', audience: 'customer' as const };
  await Promise.all(Array.from({ length: 4 }, () => enqueueBookingOperatorNotification(booking, event)));
  expect(await BookingCustomerNotification.countDocuments()).toBe(1);
  // Exact selectors from the pre-customer deployed worker, on its unchanged collection.
  expect(await BookingOperatorNotification.findOneAndUpdate({ status: { $in: ['pending', 'retry'] }, nextAttemptAt: { $lte: new Date() } }, { $set: { status: 'processing' } })).toBeNull();
  await BookingCustomerNotification.updateMany({}, { $set: { status: 'processing', leaseUntil: new Date(0), leaseToken: 'qa-expired' } });
  expect(await BookingOperatorNotification.findOneAndUpdate({ status: 'processing', leaseUntil: { $lte: new Date() } }, { $set: { status: 'manual_review' } })).toBeNull();
  expect(await processBookingOperatorNotifications(1)).toEqual({ sent: 0, retried: 0, manualReview: 1 });
  expect(await BookingCustomerNotification.findOne()).toMatchObject({ status: 'manual_review', lastError: 'DELIVERY_UNCERTAIN_LEASE_EXPIRED' });
  expect(email.sendBookingStatusEmail).not.toHaveBeenCalled(); expect(email.sendOperatorBookingStatusEmail).not.toHaveBeenCalled();
});

it('rolls back both queue intents and cancellation state when customer persistence fails', async () => {
  await requestBookingCancellation(bookingId, tenantId);
  const write = jest.spyOn(BookingCustomerNotification, 'updateOne').mockRejectedValueOnce(new Error('customer queue unavailable'));
  await expect(finalizeBookingCancellation(bookingId, tenantId, [refund])).rejects.toThrow('customer queue unavailable');
  write.mockRestore();
  expect(await BookingOperatorNotification.countDocuments()).toBe(0);
  expect(await BookingCustomerNotification.countDocuments()).toBe(0);
  expect(await Booking.findById(bookingId)).toMatchObject({ status: 'confirmed', refundedAmount: 0 });
  expect((await counts()).spent).toBe(100);
});

it('processes a customer-only queue concurrently without operator sends and respects the batch limit', async () => {
  const booking = (await Booking.findById(bookingId))!;
  for (let i = 0; i < 3; i++) await enqueueBookingOperatorNotification(booking, { kind: 'cancelled', eventKey: `qa-${i}`, audience: 'customer' });
  expect(await processBookingOperatorNotifications(1)).toEqual({ sent: 1, retried: 0, manualReview: 0 });
  expect(await BookingCustomerNotification.countDocuments({ status: 'pending' })).toBe(2);
  await Promise.all([processBookingOperatorNotifications(1), processBookingOperatorNotifications(1)]);
  expect(email.sendBookingStatusEmail).toHaveBeenCalledTimes(3);
  expect(email.sendOperatorBookingStatusEmail).not.toHaveBeenCalled();
});

it('paginates customer and operator failures together and reconciles customer rows with tenant/CAS fences', async () => {
  await seedFailures();
  const row = await BookingCustomerNotification.create({ _id: 'a'.repeat(64), tenantId, bookingId, kind: 'cancelled', status: 'manual_review' });
  await BookingCustomerNotification.create({ _id: 'b'.repeat(64), tenantId: otherTenant, bookingId, kind: 'cancelled', status: 'manual_review' });
  const pages: any[] = []; let cursor: string | null = null;
  do {
    const result = await invoke(listNotificationFailures, { query: { source: 'booking', limit: '2', tenantId: String(tenantId), ...(cursor ? { cursor } : {}) } });
    expect(result.status).toBe(200); pages.push(...result.body.data.data); cursor = result.body.data.pageInfo.nextCursor;
  } while (cursor);
  expect(pages).toHaveLength(5); expect(new Set(pages.map((item) => item.id)).size).toBe(5);
  expect(pages[0]).toMatchObject({ id: row._id, audience: 'customer', source: 'booking', reference: 'QA-CANCEL-RECOVERY' });
  expect((await invoke(listNotificationFailures, { query: { source: 'booking', tenantId: String(otherTenant) } })).status).toBe(400);
  const body = { expectedUpdatedAt: row.updatedAt.toISOString(), decision: 'closed_without_resend', note: 'Reviewed customer delivery history; no resend requested.' };
  expect((await invoke(reconcileNotificationFailure, { params: { tenantId: String(tenantId), source: 'booking', id: 'b'.repeat(64) }, body })).status).toBe(409);
  const request = { params: { tenantId: String(tenantId), source: 'booking', id: row._id }, body };
  const results = await Promise.all([invoke(reconcileNotificationFailure, request), invoke(reconcileNotificationFailure, request)]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  const resolved = await invoke(listNotificationFailures, { query: { source: 'booking', status: 'resolved' } });
  expect(resolved.body.data.data).toHaveLength(1); expect(resolved.body.data.data[0]).toMatchObject({ id: row._id, audience: 'customer', status: 'resolved' });
  expect(await BookingCustomerNotification.findById(row._id)).toMatchObject({ reconciliation: { actorId: userId, decision: 'closed_without_resend' } });
  expect(email.sendBookingStatusEmail).not.toHaveBeenCalled(); expect(email.sendOperatorBookingStatusEmail).not.toHaveBeenCalled();
});
