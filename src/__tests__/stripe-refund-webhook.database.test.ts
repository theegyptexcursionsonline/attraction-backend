import { spawnSync } from 'child_process';
import type { NextFunction, Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { handleWebhook, refundPayment } from '../controllers/payments.controller';
import { Booking } from '../models/Booking';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { WebhookEvent } from '../models/WebhookEvent';
import {
  createRefund,
  listPaymentIntentRefunds,
  retrieveSucceededRefundAmount,
  verifyStripeEventAccountBinding,
} from '../services/stripe.service';
import { sendBookingStatusEmail } from '../services/email.service';
import { getTenantStripeConfig } from '../services/tenantPayment.service';
import { ATN_CANCELLATION_REFUND_FLOW, ATN_REFUND_FLOW_KEY } from '../services/bookingRefund.service';

// Stripe is never called: signature verification parses the body only for the
// literal test signature, and every provider read is an explicit mock.
jest.mock('../services/stripe.service', () => ({
  ...jest.requireActual('../services/stripe.service'),
  constructWebhookEvent: jest.fn((_key: string, _secret: string, body: Buffer, signature: string) => {
    if (signature !== 'valid-signature') throw new Error('No signatures found matching the expected signature');
    return JSON.parse(body.toString());
  }),
  verifyStripeEventAccountBinding: jest.fn(),
  listPaymentIntentRefunds: jest.fn(),
  createRefund: jest.fn(),
  retrieveSucceededRefundAmount: jest.fn(),
}));
jest.mock('../services/tenantPayment.service', () => ({
  ...jest.requireActual('../services/tenantPayment.service'),
  getTenantStripeConfig: jest.fn(),
  markTenantStripeWebhookVerified: jest.fn().mockResolvedValue(true),
}));
jest.mock('../services/email.service', () => ({
  ...jest.requireActual('../services/email.service'),
  sendBookingStatusEmail: jest.fn().mockResolvedValue(undefined),
  sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
  sendAdminBookingNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/webhook.service', () => ({
  ...jest.requireActual('../services/webhook.service'),
  safeEmitEvent: jest.fn(),
}));
jest.setTimeout(120_000);

let mongo: MongoMemoryReplSet;
const tenantId = new Types.ObjectId();
const otherTenantId = new Types.ObjectId();
const bookingId = new Types.ObjectId();
const userId = new Types.ObjectId();
const INTENT = 'pi_refund_webhook';

const stripeConfig = {
  enabled: true,
  publishableKey: 'pk_test_public',
  secretKey: 'sk_test_secret',
  webhookSecret: 'whsec_test',
  verifiedAccountId: 'acct_verified',
  verifiedCredentialFingerprint: 'fingerprint_verified',
  webhookVerifiedAt: new Date('2030-01-01T00:00:00.000Z'),
  configRevision: 1,
};

const providerRefund = (overrides: Record<string, unknown> = {}) => ({
  id: 're_dashboard_full',
  status: 'succeeded',
  amount: 10500,
  paymentIntentId: INTENT,
  metadata: {},
  ...overrides,
});

const chargeRefundedEvent = (id = 'evt_charge_refunded', intent = INTENT) => ({
  id,
  type: 'charge.refunded',
  data: { object: { id: 'ch_1', object: 'charge', payment_intent: intent, amount_refunded: 10500 } },
});
const refundEvent = (type: string, id: string, intent = INTENT, refundId = 're_dashboard_full') => ({
  id,
  type,
  data: { object: { id: refundId, object: 'refund', payment_intent: intent } },
});

const webhookRequest = (event: unknown, forTenant = tenantId, signature = 'valid-signature') => ({
  params: { tenantId: String(forTenant) },
  headers: signature ? { 'stripe-signature': signature } : {},
  body: Buffer.from(JSON.stringify(event)),
}) as unknown as Request;

const invoke = async (handler: unknown, req: unknown) => {
  const res = { status: jest.fn(), json: jest.fn() } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  (res.json as jest.Mock).mockReturnValue(res);
  const next = jest.fn() as NextFunction;
  await (handler as (req: unknown, res: Response, next: NextFunction) => Promise<void>)(req, res, next);
  expect(next).not.toHaveBeenCalled();
  return res;
};
const statusOf = (res: Response) => (res.status as jest.Mock).mock.calls[0]?.[0] ?? 200;
const bodyOf = (res: Response) => (res.json as jest.Mock).mock.calls[0]?.[0];
const flush = () => new Promise((resolve) => setTimeout(resolve, 30));

const insertBooking = async (overrides: Record<string, unknown> = {}) => {
  await Booking.collection.insertOne({
    _id: bookingId,
    tenantId,
    userId,
    reference: 'ATT-REFUND-1',
    paymentMethod: 'card',
    status: 'confirmed',
    paymentStatus: 'succeeded',
    total: 105,
    currency: 'USD',
    stripePaymentIntentId: INTENT,
    refundedAmount: 0,
    refunds: [],
    items: [],
    guestDetails: { firstName: 'QA', lastName: 'Guest', email: 'theegyptexcursionsonline@gmail.com' },
    ...overrides,
  });
};

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('stripe_refund_webhook'));
  await Promise.all([Tenant.init(), Booking.init(), User.init(), WebhookEvent.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  await Promise.all([
    Tenant.collection.deleteMany({}),
    Booking.collection.deleteMany({}),
    User.collection.deleteMany({}),
    WebhookEvent.collection.deleteMany({}),
  ]);
  await Tenant.collection.insertOne({ _id: tenantId, slug: 'refund-tenant', domain: 'refund-tenant.invalid', name: 'Refund tenant' });
  await User.collection.insertOne({ _id: userId, email: 'qa-refund@example.invalid', totalSpent: 105 });
  (getTenantStripeConfig as jest.Mock).mockResolvedValue(stripeConfig);
  (verifyStripeEventAccountBinding as jest.Mock).mockResolvedValue(true);
  (listPaymentIntentRefunds as jest.Mock).mockResolvedValue([providerRefund()]);
});

const loadBooking = async () => (await Booking.findById(bookingId).lean())!;
const loadSpent = async () => ((await User.collection.findOne({ _id: userId })) as unknown as { totalSpent: number }).totalSpent;
const warnEvents = () => (console.warn as jest.Mock).mock.calls.map((call) => call[1]?.event);

describe('Stripe refund webhook reconciliation', () => {
  it('requires a Stripe signature before reading or changing anything', async () => {
    await insertBooking();
    const unsigned = await invoke(handleWebhook, webhookRequest(chargeRefundedEvent(), tenantId, ''));
    const forged = await invoke(handleWebhook, webhookRequest(chargeRefundedEvent(), tenantId, 'forged'));

    expect(statusOf(unsigned)).toBe(400);
    expect(statusOf(forged)).toBe(400);
    expect(listPaymentIntentRefunds).not.toHaveBeenCalled();
    expect((await loadBooking()).refundedAmount).toBe(0);
    expect(await WebhookEvent.countDocuments()).toBe(0);
  });

  it('rejects refund events whose account binding cannot be proven', async () => {
    await insertBooking();
    (verifyStripeEventAccountBinding as jest.Mock).mockResolvedValue(false);
    const res = await invoke(handleWebhook, webhookRequest(chargeRefundedEvent()));
    expect(statusOf(res)).toBe(409);
    expect(listPaymentIntentRefunds).not.toHaveBeenCalled();
    expect((await loadBooking()).paymentStatus).toBe('succeeded');
  });

  it('applies a full dashboard refund with the admin refund terminal state, once', async () => {
    await insertBooking();
    const res = await invoke(handleWebhook, webhookRequest(chargeRefundedEvent()));
    await flush();

    expect(bodyOf(res)).toEqual(expect.objectContaining({ received: true, refund: 'applied' }));
    const booking = await loadBooking();
    expect(booking.paymentStatus).toBe('refunded');
    expect(booking.status).toBe('refunded');
    expect(booking.refundedAmount).toBe(105);
    expect(booking.refunds).toEqual([expect.objectContaining({ providerRefundId: 're_dashboard_full', amount: 105, status: 'succeeded' })]);
    expect(await loadSpent()).toBe(0);
    expect(sendBookingStatusEmail).toHaveBeenCalledTimes(1);
    expect(sendBookingStatusEmail).toHaveBeenCalledWith(
      'theegyptexcursionsonline@gmail.com',
      expect.objectContaining({ kind: 'refunded', refundAmount: 105, fullRefund: true }),
      expect.anything()
    );
    expect(listPaymentIntentRefunds).toHaveBeenCalledWith('sk_test_secret', INTENT);
    expect(await WebhookEvent.countDocuments({ provider: 'stripe', eventId: 'evt_charge_refunded' })).toBe(1);
  });

  it('records a partial refund amount without cancelling the paid booking', async () => {
    await insertBooking();
    (listPaymentIntentRefunds as jest.Mock).mockResolvedValue([providerRefund({ id: 're_partial', amount: 2500 })]);
    await invoke(handleWebhook, webhookRequest(refundEvent('refund.created', 'evt_partial', INTENT, 're_partial')));
    await flush();

    const booking = await loadBooking();
    expect(booking.paymentStatus).toBe('succeeded');
    expect(booking.status).toBe('confirmed');
    expect(booking.refundedAmount).toBe(25);
    expect(booking.refunds).toHaveLength(1);
    expect(await loadSpent()).toBe(80);
    expect(sendBookingStatusEmail).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ refundAmount: 25, fullRefund: false }),
      expect.anything()
    );
  });

  it('treats a replay of the same event id as a no-op', async () => {
    await insertBooking();
    await invoke(handleWebhook, webhookRequest(chargeRefundedEvent('evt_replayed')));
    const replay = await invoke(handleWebhook, webhookRequest(chargeRefundedEvent('evt_replayed')));
    await flush();

    expect(bodyOf(replay)).toEqual({ received: true, duplicate: true });
    expect(listPaymentIntentRefunds).toHaveBeenCalledTimes(1);
    expect(sendBookingStatusEmail).toHaveBeenCalledTimes(1);
    expect(await loadSpent()).toBe(0);
    expect((await loadBooking()).refunds).toHaveLength(1);
  });

  it('does not double-apply a refund ATN already recorded through the admin refund endpoint', async () => {
    await insertBooking();
    (createRefund as jest.Mock).mockResolvedValue({ id: 're_admin', status: 'succeeded', amount: 10500, paymentIntentId: INTENT });
    (retrieveSucceededRefundAmount as jest.Mock).mockResolvedValue(10500);
    const admin = await invoke(refundPayment, {
      params: { bookingId: String(bookingId) },
      body: {},
      user: { _id: new Types.ObjectId(), role: 'brand-admin', assignedTenants: [tenantId] },
    });
    expect(bodyOf(admin)).toEqual(expect.objectContaining({ success: true }));
    await flush();
    expect(sendBookingStatusEmail).toHaveBeenCalledTimes(1);

    (listPaymentIntentRefunds as jest.Mock).mockResolvedValue([providerRefund({ id: 're_admin' })]);
    const res = await invoke(handleWebhook, webhookRequest(chargeRefundedEvent('evt_after_admin')));
    await flush();

    expect(bodyOf(res)).toEqual(expect.objectContaining({ refund: 'no-change' }));
    const booking = await loadBooking();
    expect(booking.refunds).toHaveLength(1);
    expect(booking.refundedAmount).toBe(105);
    expect(booking.status).toBe('refunded');
    expect(await loadSpent()).toBe(0);
    expect(sendBookingStatusEmail).toHaveBeenCalledTimes(1);
  });

  it('keeps a single email and decrement when the webhook lands before the admin request finishes', async () => {
    await insertBooking();
    (listPaymentIntentRefunds as jest.Mock).mockResolvedValue([providerRefund({ id: 're_admin' })]);
    await invoke(handleWebhook, webhookRequest(refundEvent('refund.created', 'evt_first', INTENT, 're_admin')));
    (createRefund as jest.Mock).mockResolvedValue({ id: 're_admin', status: 'succeeded', amount: 10500, paymentIntentId: INTENT });
    (retrieveSucceededRefundAmount as jest.Mock).mockResolvedValue(10500);
    // The admin pre-check ran against the paid booking before the webhook won.
    const staleBooking = await Booking.findById(bookingId);
    const findById = jest.spyOn(Booking, 'findById').mockResolvedValueOnce(
      Object.assign(staleBooking!, { paymentStatus: 'succeeded', status: 'confirmed', refundedAmount: 0 }) as never
    );
    await invoke(refundPayment, {
      params: { bookingId: String(bookingId) },
      body: {},
      user: { _id: new Types.ObjectId(), role: 'brand-admin', assignedTenants: [tenantId] },
    });
    findById.mockRestore();
    await flush();

    expect(sendBookingStatusEmail).toHaveBeenCalledTimes(1);
    expect(await loadSpent()).toBe(0);
    expect((await loadBooking()).refunds).toHaveLength(1);
  });

  it('never touches another tenant\'s booking for the same payment intent id', async () => {
    await insertBooking({ tenantId: otherTenantId });
    const res = await invoke(handleWebhook, webhookRequest(chargeRefundedEvent()));

    expect(statusOf(res)).toBe(200);
    expect(bodyOf(res)).toEqual(expect.objectContaining({ received: true, ignored: 'payment intent is not bound to this tenant' }));
    expect(listPaymentIntentRefunds).not.toHaveBeenCalled();
    const booking = await loadBooking();
    expect(booking.paymentStatus).toBe('succeeded');
    expect(booking.refundedAmount).toBe(0);
    expect(warnEvents()).toContain('refund_unmatched_payment_intent');
  });

  it('acknowledges an unknown payment intent with no effect and a structured log', async () => {
    await insertBooking();
    const res = await invoke(handleWebhook, webhookRequest(chargeRefundedEvent('evt_unknown', 'pi_unknown')));

    expect(statusOf(res)).toBe(200);
    expect(listPaymentIntentRefunds).not.toHaveBeenCalled();
    expect((await loadBooking()).refundedAmount).toBe(0);
    expect(console.warn).toHaveBeenCalledWith('[stripe-refund]', expect.objectContaining({
      event: 'refund_unmatched_payment_intent',
      tenantId: String(tenantId),
      paymentIntentId: 'pi_unknown',
      eventId: 'evt_unknown',
    }));
    expect(await WebhookEvent.countDocuments({ eventId: 'evt_unknown' })).toBe(1);
  });

  it('flags a refund that fails after success for manual review without reopening the booking', async () => {
    await insertBooking();
    await invoke(handleWebhook, webhookRequest(chargeRefundedEvent('evt_success')));
    (listPaymentIntentRefunds as jest.Mock).mockResolvedValue([providerRefund({ status: 'failed' })]);
    const res = await invoke(handleWebhook, webhookRequest(refundEvent('refund.updated', 'evt_failed')));
    await flush();

    expect(bodyOf(res)).toEqual(expect.objectContaining({ refund: 'manual-review' }));
    const booking = await loadBooking();
    expect(booking.refunds).toEqual([expect.objectContaining({ providerRefundId: 're_dashboard_full', status: 'failed' })]);
    expect(booking.paymentStatus).toBe('refunded');
    expect(booking.status).toBe('refunded');
    expect(booking.refundedAmount).toBe(105);
    expect(warnEvents()).toContain('refund_reversed_manual_review');
    expect(sendBookingStatusEmail).toHaveBeenCalledTimes(1);
  });

  it('is safe against out-of-order delivery because provider state is authoritative', async () => {
    await insertBooking();
    (listPaymentIntentRefunds as jest.Mock).mockResolvedValue([providerRefund({ status: 'pending' })]);
    await invoke(handleWebhook, webhookRequest(refundEvent('refund.created', 'evt_pending')));
    let booking = await loadBooking();
    expect(booking.refunds).toEqual([expect.objectContaining({ status: 'pending' })]);
    expect(booking.paymentStatus).toBe('succeeded');

    (listPaymentIntentRefunds as jest.Mock).mockResolvedValue([providerRefund()]);
    await invoke(handleWebhook, webhookRequest(refundEvent('refund.updated', 'evt_succeeded')));
    // A stale, late-arriving event must not move the ledger back to pending.
    await invoke(handleWebhook, webhookRequest(refundEvent('charge.refund.updated', 'evt_stale_created')));
    await flush();

    booking = await loadBooking();
    expect(booking.refunds).toEqual([expect.objectContaining({ status: 'succeeded' })]);
    expect(booking.paymentStatus).toBe('refunded');
    expect(sendBookingStatusEmail).toHaveBeenCalledTimes(1);
  });

  it('applies money and email exactly once when two deliveries race', async () => {
    await insertBooking();
    const results = await Promise.all([
      invoke(handleWebhook, webhookRequest(chargeRefundedEvent('evt_race_charge'))),
      invoke(handleWebhook, webhookRequest(refundEvent('refund.updated', 'evt_race_refund'))),
      invoke(handleWebhook, webhookRequest(refundEvent('refund.created', 'evt_race_created'))),
    ]);
    await flush();

    expect(results.map(statusOf)).toEqual([200, 200, 200]);
    const booking = await loadBooking();
    expect(booking.refunds).toHaveLength(1);
    expect(booking.refundedAmount).toBe(105);
    expect(booking.paymentStatus).toBe('refunded');
    expect(await loadSpent()).toBe(0);
    expect(sendBookingStatusEmail).toHaveBeenCalledTimes(1);
  });

  it('fails closed and records nothing when Stripe cannot list the refunds', async () => {
    await insertBooking();
    (listPaymentIntentRefunds as jest.Mock).mockRejectedValue(new Error('provider unavailable'));
    const res = { status: jest.fn(), json: jest.fn() } as unknown as Response;
    (res.status as jest.Mock).mockReturnValue(res);
    const next = jest.fn();
    await handleWebhook(webhookRequest(chargeRefundedEvent('evt_provider_down')), res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'provider unavailable' }));
    expect(res.json).not.toHaveBeenCalled();
    expect(await WebhookEvent.countDocuments({ eventId: 'evt_provider_down' })).toBe(0);
    expect((await loadBooking()).paymentStatus).toBe('succeeded');
  });

  it('asks Stripe to redeliver when the payment has not been finalized yet', async () => {
    await insertBooking({ status: 'pending', paymentStatus: 'processing' });
    const res = await invoke(handleWebhook, webhookRequest(chargeRefundedEvent('evt_early')));

    expect(statusOf(res)).toBe(409);
    expect(listPaymentIntentRefunds).not.toHaveBeenCalled();
    expect((await loadBooking()).refunds).toHaveLength(0);
    expect(await WebhookEvent.countDocuments({ eventId: 'evt_early' })).toBe(0);
  });

  it('leaves an in-flight customer cancellation refund to the cancellation flow', async () => {
    await insertBooking();
    (listPaymentIntentRefunds as jest.Mock).mockResolvedValue([
      providerRefund({ id: 're_cancel', metadata: { [ATN_REFUND_FLOW_KEY]: ATN_CANCELLATION_REFUND_FLOW } }),
    ]);
    const res = await invoke(handleWebhook, webhookRequest(chargeRefundedEvent('evt_cancel')));
    await flush();

    expect(bodyOf(res)).toEqual(expect.objectContaining({ refund: 'deferred-to-cancellation' }));
    const booking = await loadBooking();
    expect(booking.status).toBe('confirmed');
    expect(booking.paymentStatus).toBe('succeeded');
    expect(booking.refundedAmount).toBe(0);
    expect(await loadSpent()).toBe(105);
    expect(sendBookingStatusEmail).not.toHaveBeenCalled();
  });

  it('does not overwrite a completed cancellation when its refund webhook arrives later', async () => {
    await insertBooking({
      status: 'cancelled',
      paymentStatus: 'refunded',
      refundedAmount: 105,
      inventoryReleasedAt: new Date(),
      refunds: [{ providerRefundId: 're_cancel', amount: 105, status: 'succeeded', createdAt: new Date() }],
    });
    await User.collection.updateOne({ _id: userId }, { $set: { totalSpent: 0 } });
    (listPaymentIntentRefunds as jest.Mock).mockResolvedValue([
      providerRefund({ id: 're_cancel', metadata: { [ATN_REFUND_FLOW_KEY]: ATN_CANCELLATION_REFUND_FLOW } }),
    ]);
    await invoke(handleWebhook, webhookRequest(chargeRefundedEvent('evt_cancel_late')));
    await flush();

    const booking = await loadBooking();
    expect(booking.status).toBe('cancelled');
    expect(booking.paymentStatus).toBe('refunded');
    expect(booking.refunds).toHaveLength(1);
    expect(await loadSpent()).toBe(0);
    expect(sendBookingStatusEmail).not.toHaveBeenCalled();
  });
});
