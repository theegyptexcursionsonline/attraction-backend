import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Booking } from '../models/Booking';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { BookingPaymentNotification } from '../models/BookingPaymentNotification';
import { BookingOperatorNotification } from '../models/BookingOperatorNotification';
import { BookingCustomerNotification } from '../models/BookingCustomerNotification';
import { EmailReceipt } from '../models/EmailReceipt';
import { enqueueBookingPaymentNotifications, ensureBookingPaymentNotificationIndexes, processBookingPaymentNotifications } from '../services/bookingPaymentNotification.service';
import { paymentFollowupEnabledFor } from '../utils/bookingPaymentFollowupPolicy';
import { getTenantStripeConfig, stripeCredentialMode } from '../services/tenantPayment.service';
import { retrievePaymentIntent } from '../services/stripe.service';
import { sendBookingPaymentNotice } from '../services/bookingPaymentEmail.service';

jest.mock('../services/email.service', () => ({ recipientFingerprint: () => 'a'.repeat(64) }));
jest.mock('../services/bookingPaymentEmail.service', () => ({ sendBookingPaymentNotice: jest.fn() }));
jest.mock('../services/tenantPayment.service', () => ({ getTenantStripeConfig: jest.fn(), stripeCredentialMode: jest.fn() }));
jest.mock('../services/stripe.service', () => ({ retrievePaymentIntent: jest.fn() }));
jest.mock('../utils/bookingPaymentFollowupPolicy', () => ({ paymentFollowupEnabledFor: jest.fn() }));
jest.setTimeout(120_000);
let mongo: MongoMemoryReplSet;
const tenantId = new Types.ObjectId(), bookingId = new Types.ObjectId(), attractionId = new Types.ObjectId();
const otherTenantId = new Types.ObjectId();
const fixture = () => ({ _id: bookingId, tenantId, attractionId, reference: 'QA-PAYMENT-NOTICE',
  createdAt: new Date(), paymentMethod: 'card', paymentStatus: 'failed', status: 'pending',
  paymentFailureReason: 'payment_failed', paymentFailureAt: new Date(), stripePaymentIntentId: 'pi_qa_notice',
  stripePaymentBinding: { accountId: 'acct_qa_notice', mode: 'test' }, total: 120, currency: 'EUR',
  guestDetails: { firstName: 'QA', lastName: 'Guest', email: 'guest@example.invalid' },
  items: [{ date: '2030-01-01', time: '10:00' }],
});
const evidence = () => ({ id: 'pi_qa_notice', amount: 12000, amountReceived: 0, currency: 'eur',
  status: 'requires_payment_method', livemode: false, metadata: { bookingId: String(bookingId), tenantId: String(tenantId) } });
const now = () => BookingPaymentNotification.updateMany({}, { $set: { nextAttemptAt: new Date(0) } });
const enqueue = async (kind: 'payment_failed' | 'checkout_expired' = 'payment_failed') => {
  await enqueueBookingPaymentNotifications(fixture(), { kind }); await now();
};
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('payment_notices'), { autoIndex: false });
  await ensureBookingPaymentNotificationIndexes();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  jest.restoreAllMocks(); jest.clearAllMocks();
  await Promise.all([Booking.collection.deleteMany({}), Tenant.collection.deleteMany({}), Attraction.collection.deleteMany({}),
    BookingPaymentNotification.deleteMany({}), EmailReceipt.deleteMany({}), BookingOperatorNotification.deleteMany({}), BookingCustomerNotification.deleteMany({})]);
  await Booking.collection.insertOne(fixture());
  await Tenant.collection.insertOne({ _id: tenantId, name: 'QA Cruises', slug: 'qa-cruises', flatUrls: true,
    notificationSettings: { bookingEmail: 'operator@example.invalid', bookingCcEmails: ['copy@example.invalid'] } });
  await Attraction.collection.insertOne({ _id: attractionId, tenantIds: [tenantId], title: 'QA Yacht', slug: 'qa-yacht-id', pathSlug: 'qa-yacht', status: 'active' });
  (paymentFollowupEnabledFor as jest.Mock).mockReturnValue(true);
  (getTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true, secretKey: 'sk_test_mock', verifiedAccountId: 'acct_qa_notice', verifiedCredentialFingerprint: 'qa' });
  (stripeCredentialMode as jest.Mock).mockReturnValue('test');
  (retrievePaymentIntent as jest.Mock).mockResolvedValue(evidence());
  (sendBookingPaymentNotice as jest.Mock).mockResolvedValue({ status: 'sent' });
});

it('writes both audiences in the caller transaction, rolls back together, and dedupes competing transactions', async () => {
  const session = await mongoose.startSession();
  await expect(session.withTransaction(async () => {
    await enqueueBookingPaymentNotifications(fixture(), { kind: 'payment_failed' }, session);
    expect(await BookingPaymentNotification.countDocuments().session(session)).toBe(2); throw new Error('abort');
  })).rejects.toThrow('abort');
  await session.endSession(); expect(await BookingPaymentNotification.countDocuments()).toBe(0);
  await Promise.all(Array.from({ length: 4 }, () => enqueueBookingPaymentNotifications(fixture(), { kind: 'payment_failed' })));
  expect(await BookingPaymentNotification.countDocuments()).toBe(2);
  expect(await processBookingPaymentNotifications()).toEqual({ sent: 0, retried: 0, manualReview: 0, suppressed: 0 });
  expect(retrievePaymentIntent).not.toHaveBeenCalled(); expect(sendBookingPaymentNotice).not.toHaveBeenCalled();
  expect(await BookingOperatorNotification.findOne({ status: { $in: ['pending', 'retry'] } })).toBeNull();
  expect(await BookingCustomerNotification.findOne({ status: { $in: ['pending', 'retry'] } })).toBeNull();
});

it('sends each audience once under competing workers, minting a customer token only for active payment', async () => {
  await enqueue(); await Promise.all(Array.from({ length: 4 }, () => processBookingPaymentNotifications()));
  expect(sendBookingPaymentNotice).toHaveBeenCalledTimes(2);
  const calls = (sendBookingPaymentNotice as jest.Mock).mock.calls;
  expect(calls.find(([d]) => d.audience === 'customer')?.[0]).toMatchObject({ guestAccessToken: expect.any(String), experience: 'QA Yacht' });
  expect(calls.find(([d]) => d.audience === 'operator')?.[0]).not.toHaveProperty('guestAccessToken');
  expect(await EmailReceipt.findOne()).toMatchObject({ status: 'sent' });
  expect(JSON.stringify(await BookingPaymentNotification.find().lean())).not.toMatch(/guestAccessToken|guest@example/);
  await enqueue(); expect((await processBookingPaymentNotifications()).sent).toBe(0);
});

it('never enqueues while disabled and pauses durable work without consuming it when the switch closes', async () => {
  (paymentFollowupEnabledFor as jest.Mock).mockReturnValue(false); await enqueue();
  expect(await BookingPaymentNotification.countDocuments()).toBe(0);
  (paymentFollowupEnabledFor as jest.Mock).mockReturnValue(true); await enqueue();
  const before = await BookingPaymentNotification.find().sort({ _id: 1 }).lean();
  (paymentFollowupEnabledFor as jest.Mock).mockReturnValue(false);
  expect(await processBookingPaymentNotifications()).toEqual({ sent: 0, retried: 0, manualReview: 0, suppressed: 0 });
  expect(await BookingPaymentNotification.find().sort({ _id: 1 }).lean()).toEqual(before);
  expect(sendBookingPaymentNotice).not.toHaveBeenCalled();
  (paymentFollowupEnabledFor as jest.Mock).mockReturnValue(true);
  expect((await processBookingPaymentNotifications()).sent).toBe(2);
});

it('suppresses historical queued rows even when the global activation switch is open', async () => {
  await enqueue(); const cutoff = Date.now() - 60_000;
  await Booking.collection.updateOne({ _id: bookingId }, { $set: { createdAt: new Date(cutoff - 60_000) } });
  (paymentFollowupEnabledFor as jest.Mock).mockImplementation(value => new Date(value).getTime() >= cutoff);
  expect((await processBookingPaymentNotifications()).suppressed).toBe(2); expect(sendBookingPaymentNotice).not.toHaveBeenCalled();
});

it.each(['paid', 'old-hold', 'released', 'cancelled', 'processing'])('suppresses stale %s booking state', async state => {
  await enqueue();
  const change = state === 'paid' ? { paymentStatus: 'succeeded', status: 'confirmed' } : state === 'old-hold' ? { createdAt: new Date(Date.now() - 31 * 60_000) }
    : state === 'released' ? { inventoryReleasedAt: new Date() } : state === 'cancelled' ? { status: 'cancelled' } : { paymentStatus: 'processing' };
  await Booking.collection.updateOne({ _id: bookingId }, { $set: change });
  expect((await processBookingPaymentNotifications()).suppressed).toBe(2); expect(sendBookingPaymentNotice).not.toHaveBeenCalled();
});

it.each(['succeeded', 'processing', 'requires_capture', 'requires_action', 'requires_confirmation'])('suppresses provider %s while local state lags', async status => {
  await enqueue(); (retrievePaymentIntent as jest.Mock).mockResolvedValue({ ...evidence(), status });
  expect((await processBookingPaymentNotifications()).suppressed).toBe(2); expect(sendBookingPaymentNotice).not.toHaveBeenCalled();
});

it('rechecks booking state after provider lookup before sending', async () => {
  await enqueue(); (retrievePaymentIntent as jest.Mock).mockImplementation(async () => {
    await Booking.collection.updateOne({ _id: bookingId }, { $set: { status: 'confirmed', paymentStatus: 'succeeded' } }); return evidence();
  });
  expect((await processBookingPaymentNotifications()).suppressed).toBe(2); expect(sendBookingPaymentNotice).not.toHaveBeenCalled();
});

it.each(['foreign-booking', 'bundle', 'foreign-attraction', 'foreign-provider', 'account', 'mode', 'amount'])('fails closed for %s scope or binding', async problem => {
  await enqueue();
  if (problem === 'foreign-booking') await Booking.collection.updateOne({ _id: bookingId }, { $set: { tenantId: otherTenantId } });
  if (problem === 'bundle') await Booking.collection.updateOne({ _id: bookingId }, { $set: { bundleOrderId: new Types.ObjectId() } });
  if (problem === 'foreign-attraction') await Attraction.collection.updateOne({ _id: attractionId }, { $set: { tenantIds: [otherTenantId] } });
  if (problem === 'foreign-provider') (retrievePaymentIntent as jest.Mock).mockResolvedValue({ ...evidence(), metadata: { bookingId: String(bookingId), tenantId: String(otherTenantId) } });
  if (problem === 'account') (getTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true, secretKey: 'sk_test_mock', verifiedAccountId: 'acct_other', verifiedCredentialFingerprint: 'qa' });
  if (problem === 'mode') (retrievePaymentIntent as jest.Mock).mockResolvedValue({ ...evidence(), livemode: true });
  if (problem === 'amount') (retrievePaymentIntent as jest.Mock).mockResolvedValue({ ...evidence(), amount: 1 });
  const result = await processBookingPaymentNotifications();
  if (problem === 'foreign-attraction') {
    expect(result.sent).toBe(2); expect((sendBookingPaymentNotice as jest.Mock).mock.calls[0][0].experience).toBeUndefined();
  } else { expect(result.manualReview).toBe(2); expect(sendBookingPaymentNotice).not.toHaveBeenCalled(); }
});

it('retries unavailable provider reads with bounded backoff and never sends from unknown state', async () => {
  await enqueue(); (retrievePaymentIntent as jest.Mock).mockResolvedValue(null);
  expect((await processBookingPaymentNotifications()).retried).toBe(2);
  expect((await processBookingPaymentNotifications()).retried).toBe(0);
  await BookingPaymentNotification.updateMany({}, { $set: { attempts: 4, nextAttemptAt: new Date(0) } });
  expect((await processBookingPaymentNotifications()).manualReview).toBe(2); expect(sendBookingPaymentNotice).not.toHaveBeenCalled();
});

it.each([new Error('request timeout'), { status: 429 }, { status: 503 }])('retries thrown provider reads without sending until current evidence is available', async error => {
  await enqueue(); (retrievePaymentIntent as jest.Mock).mockRejectedValue(error);
  expect((await processBookingPaymentNotifications()).retried).toBe(2);
  expect(sendBookingPaymentNotice).not.toHaveBeenCalled(); expect(await EmailReceipt.countDocuments()).toBe(0);
  await now(); (retrievePaymentIntent as jest.Mock).mockResolvedValue(evidence());
  expect((await processBookingPaymentNotifications()).sent).toBe(2);
});

it.each(['sent', 'claimed', 'skipped'])('coordinates with legacy %s customer receipt without duplicate send', async status => {
  await enqueue(); await EmailReceipt.create({ tenantId, dedupeKey: 'booking.payment_failed:QA-PAYMENT-NOTICE', eventType: 'booking.payment_failed', recipientHash: 'b'.repeat(64), status });
  const result = await processBookingPaymentNotifications();
  expect(result.sent).toBe(1); expect(status === 'sent' ? result.suppressed : result.manualReview).toBe(1);
  expect((sendBookingPaymentNotice as jest.Mock).mock.calls[0][0].audience).toBe('operator');
});

it('claims the exact legacy unique identity before send so a concurrent old sender cannot win', async () => {
  await enqueue();
  (sendBookingPaymentNotice as jest.Mock).mockImplementation(async details => {
    if (details.audience === 'customer') await expect(EmailReceipt.create({ tenantId, dedupeKey: `booking.payment_failed:${details.reference}`, eventType: 'booking.payment_failed', recipientHash: 'b'.repeat(64), status: 'claimed' })).rejects.toMatchObject({ code: 11000 });
    return { status: 'sent' };
  });
  expect((await processBookingPaymentNotifications()).sent).toBe(2);
});

it('suppresses a payment that succeeds while acquiring the legacy receipt and records known non-delivery', async () => {
  await enqueue(); await BookingPaymentNotification.deleteOne({ audience: 'operator' });
  const create = EmailReceipt.create.bind(EmailReceipt);
  const acquisition = jest.spyOn(EmailReceipt, 'create').mockImplementation((async (doc: any) => {
    const result = await create(doc);
    await Booking.collection.updateOne({ _id: bookingId }, { $set: { status: 'confirmed', paymentStatus: 'succeeded' } });
    return result;
  }) as typeof EmailReceipt.create);
  expect((await processBookingPaymentNotifications()).suppressed).toBe(1); acquisition.mockRestore();
  expect(sendBookingPaymentNotice).not.toHaveBeenCalled();
  expect(await EmailReceipt.findOne()).toMatchObject({ status: 'skipped', lastError: 'BOOKING_STATE_CHANGED' });
});

it('does not send when the final booking read outlives the renewed lease', async () => {
  await enqueue(); await BookingPaymentNotification.deleteOne({ audience: 'operator' });
  const started = Date.now(); let reads = 0;
  const find = Booking.findOne.bind(Booking);
  const read = jest.spyOn(Booking, 'findOne').mockImplementation((filter: any) => {
    const query = find(filter);
    if (++reads === 3) {
      const lean = query.lean.bind(query);
      query.lean = jest.fn(async () => {
        const row = await lean(); jest.spyOn(Date, 'now').mockReturnValue(started + 6 * 60_000); return row;
      }) as unknown as typeof query.lean;
    }
    return query;
  });
  expect((await processBookingPaymentNotifications()).manualReview).toBe(1); read.mockRestore();
  expect(sendBookingPaymentNotice).not.toHaveBeenCalled();
  expect(await EmailReceipt.findOne()).toMatchObject({ status: 'skipped' });
});

it('retries explicit 429 only, releases its owned legacy claim, and quarantines ambiguous provider errors', async () => {
  await enqueue(); (sendBookingPaymentNotice as jest.Mock).mockRejectedValue({ status: 429 });
  expect((await processBookingPaymentNotifications()).retried).toBe(2); expect(await EmailReceipt.countDocuments()).toBe(0);
  await now(); (sendBookingPaymentNotice as jest.Mock).mockRejectedValue(new Error('network lost'));
  expect((await processBookingPaymentNotifications()).manualReview).toBe(2); expect(await EmailReceipt.findOne()).toMatchObject({ status: 'claimed' });
  expect((await processBookingPaymentNotifications()).sent).toBe(0);
});

it('quarantines expired leases and does not send or retry', async () => {
  await enqueue(); await BookingPaymentNotification.updateMany({}, { $set: { status: 'processing', leaseUntil: new Date(0), leaseToken: 'qa' } });
  expect((await processBookingPaymentNotifications()).manualReview).toBe(2); expect(sendBookingPaymentNotice).not.toHaveBeenCalled();
});

it('sends expiry with a public tour link and no capability after provider cancellation', async () => {
  await Booking.collection.updateOne({ _id: bookingId }, { $set: { status: 'cancelled', paymentFailureReason: 'expired', inventoryReleasedAt: new Date() } });
  (retrievePaymentIntent as jest.Mock).mockResolvedValue({ ...evidence(), status: 'canceled' });
  await enqueue('checkout_expired'); expect((await processBookingPaymentNotifications()).sent).toBe(2);
  for (const [details] of (sendBookingPaymentNotice as jest.Mock).mock.calls) { expect(details).not.toHaveProperty('guestAccessToken'); expect(details.tourPath).toBe('/qa-yacht'); }
});

it('allows never-claimed expiry but quarantines missing identity after a provider creation claim', async () => {
  await Booking.collection.updateOne({ _id: bookingId }, { $set: { status: 'cancelled', paymentFailureReason: 'expired', inventoryReleasedAt: new Date() }, $unset: { stripePaymentIntentId: 1 } });
  await enqueue('checkout_expired'); expect((await processBookingPaymentNotifications()).sent).toBe(2); expect(retrievePaymentIntent).not.toHaveBeenCalled();
  await BookingPaymentNotification.deleteMany({});
  await Booking.collection.updateOne({ _id: bookingId }, { $set: { stripePaymentSessionClaimedAt: new Date(), stripePaymentSessionClosedAt: new Date() } });
  await enqueue('checkout_expired'); expect((await processBookingPaymentNotifications()).manualReview).toBe(2);
});

it('quarantines missing recipients independently and does not falsely report a skipped provider send', async () => {
  await enqueue();
  await Booking.collection.updateOne({ _id: bookingId }, { $unset: { 'guestDetails.email': 1 } });
  (sendBookingPaymentNotice as jest.Mock).mockResolvedValue({ status: 'skipped', reason: 'provider_not_configured' });
  expect((await processBookingPaymentNotifications()).manualReview).toBe(2);
  expect(await BookingPaymentNotification.findOne({ audience: 'customer' })).toMatchObject({ lastError: 'CUSTOMER_RECIPIENT_MISSING' });
  expect(await BookingPaymentNotification.findOne({ audience: 'operator' })).toMatchObject({ lastError: 'DELIVERY_SKIPPED_PROVIDER_NOT_CONFIGURED' });
  expect(sendBookingPaymentNotice).toHaveBeenCalledTimes(1);
});

it('retains an uncertain legacy receipt after acceptance if receipt completion fails', async () => {
  await enqueue();
  await BookingPaymentNotification.deleteOne({ audience: 'operator' });
  const failure = jest.spyOn(EmailReceipt, 'updateOne').mockRejectedValueOnce(new Error('receipt database interrupted'));
  expect((await processBookingPaymentNotifications()).manualReview).toBe(1); failure.mockRestore();
  expect(await BookingPaymentNotification.findOne()).toMatchObject({ lastError: 'DELIVERY_UNCERTAIN_COMPLETION' });
  expect(await EmailReceipt.findOne()).toMatchObject({ status: 'claimed' });
  await processBookingPaymentNotifications(); expect(sendBookingPaymentNotice).toHaveBeenCalledTimes(1);
});

it('never retries an accepted email after the queue completion write fails', async () => {
  await enqueue(); await BookingPaymentNotification.deleteOne({ audience: 'customer' });
  const update = BookingPaymentNotification.updateOne.bind(BookingPaymentNotification);
  const write = jest.spyOn(BookingPaymentNotification, 'updateOne').mockImplementation((filter: any, change?: any, options?: any) => {
    if (change?.$set?.status === 'sent') throw new Error('completion interrupted');
    return update(filter, change, options);
  });
  await expect(processBookingPaymentNotifications()).rejects.toThrow('completion interrupted'); write.mockRestore();
  expect(await BookingPaymentNotification.findOne()).toMatchObject({ status: 'processing' });
  await BookingPaymentNotification.updateMany({}, { $set: { leaseUntil: new Date(0) } });
  expect((await processBookingPaymentNotifications()).manualReview).toBe(1);
  await processBookingPaymentNotifications(); expect(sendBookingPaymentNotice).toHaveBeenCalledTimes(1);
});

it('retains a legacy claim and quarantines when releasing it after explicit rejection fails', async () => {
  await enqueue(); await BookingPaymentNotification.deleteOne({ audience: 'operator' });
  (sendBookingPaymentNotice as jest.Mock).mockRejectedValue({ status: 429 });
  const write = jest.spyOn(EmailReceipt, 'deleteOne').mockRejectedValueOnce(new Error('receipt unavailable'));
  expect((await processBookingPaymentNotifications()).manualReview).toBe(1); write.mockRestore();
  expect(await EmailReceipt.findOne()).toMatchObject({ status: 'claimed' });
  expect(await BookingPaymentNotification.findOne()).toMatchObject({ lastError: 'LEGACY_DELIVERY_UNCERTAIN' });
});


it('suppresses both expiry notices after a pause exceeds the six-hour followup window', async () => {
  const failedAt = new Date(Date.now() - 60_000);
  await Booking.collection.updateOne({ _id: bookingId }, { $set: { status: 'cancelled', paymentFailureReason: 'expired', inventoryReleasedAt: failedAt, paymentFailureAt: failedAt } });
  (retrievePaymentIntent as jest.Mock).mockResolvedValue({ ...evidence(), status: 'canceled' });
  await enqueue('checkout_expired');
  (paymentFollowupEnabledFor as jest.Mock).mockReturnValue(false);
  await processBookingPaymentNotifications();
  expect(await BookingPaymentNotification.countDocuments({ status: 'pending' })).toBe(2);
  jest.spyOn(Date, 'now').mockReturnValue(failedAt.getTime() + 6 * 60 * 60_000);
  (paymentFollowupEnabledFor as jest.Mock).mockReturnValue(true);
  expect((await processBookingPaymentNotifications()).suppressed).toBe(2);
  expect(await BookingPaymentNotification.countDocuments({ lastError: 'CHECKOUT_NOTICE_TOO_OLD' })).toBe(2);
  expect(sendBookingPaymentNotice).not.toHaveBeenCalled();
});

it.each([undefined, new Date(Date.now() + 60_000)])('quarantines expired notices without a valid past expiry timestamp (%s)', async paymentFailureAt => {
  await Booking.collection.updateOne({ _id: bookingId }, { $set: { status: 'cancelled', paymentFailureReason: 'expired', inventoryReleasedAt: new Date(), paymentFailureAt } });
  await enqueue('checkout_expired');
  expect((await processBookingPaymentNotifications()).manualReview).toBe(2);
  expect(sendBookingPaymentNotice).not.toHaveBeenCalled();
});

it('records known non-delivery and settles its receipt when the final lease cannot renew', async () => {
  await enqueue();
  await BookingPaymentNotification.deleteMany({ audience: 'operator' });
  const original = BookingPaymentNotification.updateOne.bind(BookingPaymentNotification);
  let renewals = 0;
  jest.spyOn(BookingPaymentNotification, 'updateOne').mockImplementation(((...args: any[]) => {
    if (args[0].leaseUntil && ++renewals === 2) return Promise.resolve({ modifiedCount: 0 });
    return (original as any)(...args);
  }) as any);
  expect((await processBookingPaymentNotifications()).manualReview).toBe(1);
  expect(await BookingPaymentNotification.findOne()).toMatchObject({ status: 'manual_review', lastError: 'DELIVERY_NOT_STARTED' });
  expect(await EmailReceipt.findOne()).toMatchObject({ status: 'skipped', lastError: 'DELIVERY_NOT_STARTED' });
  expect(sendBookingPaymentNotice).not.toHaveBeenCalled();
});
