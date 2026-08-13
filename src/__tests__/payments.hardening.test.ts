import type { NextFunction, Request, Response } from 'express';
import {
  confirmPayment,
  createPaymentIntent,
  handleWebhook,
  refundPayment,
  updatePaymentGateway,
} from '../controllers/payments.controller';
import { Booking } from '../models/Booking';
import { User } from '../models/User';
import {
  constructWebhookEvent,
  createPaymentIntent as stripeCreatePaymentIntent,
  createRefund as stripeCreateRefund,
  retrievePaymentIntent,
  retrieveSucceededRefundAmount,
  verifyStripeCredentialBinding,
  verifyStripeEventAccountBinding,
} from '../services/stripe.service';
import {
  getTenantStripeConfig,
  markTenantStripeWebhookVerified,
  saveTenantStripeConfig,
} from '../services/tenantPayment.service';
import { BundleOrder } from '../models/BundleOrder';
import { sendBookingConfirmation } from '../services/email.service';
import { recordInboundEvent } from '../services/webhook.service';

jest.mock('../models/Booking', () => ({
  Booking: {
    findById: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    exists: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  },
}));

jest.mock('../models/Tenant', () => ({
  Tenant: {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          name: 'Test Operator',
          slug: 'test-operator',
          contactInfo: {},
        }),
      }),
    }),
  },
}));

jest.mock('../models/User', () => ({
  User: { findByIdAndUpdate: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../models/BundleOrder', () => ({
  BundleOrder: { findOne: jest.fn(), countDocuments: jest.fn() },
}));

jest.mock('../services/stripe.service', () => ({
  createPaymentIntent: jest.fn(),
  retrievePaymentIntent: jest.fn(),
  createRefund: jest.fn(),
  retrieveSucceededRefundAmount: jest.fn(),
  constructWebhookEvent: jest.fn(),
  verifyStripeCredentialBinding: jest.fn(),
  verifyStripeEventAccountBinding: jest.fn(),
}));

jest.mock('../services/tenantPayment.service', () => ({
  evaluateStripeConfirmation: jest.fn().mockReturnValue({ allowed: true, verifyIntent: true }),
  getTenantStripeConfig: jest.fn(),
  isStripeWebhookRotationProtected: jest.fn((config) => !!config?.previousWebhookSecret &&
    !!config?.previousWebhookValidUntil &&
    new Date(config.previousWebhookValidUntil).getTime() > Date.now()),
  markTenantStripeWebhookVerified: jest.fn().mockResolvedValue(true),
  saveTenantStripeConfig: jest.fn(),
}));

jest.mock('../services/pdf.service', () => ({
  generateTicketPdf: jest.fn().mockResolvedValue(Buffer.from('ticket')),
}));

jest.mock('../services/email.service', () => ({
  sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
  sendAdminBookingNotification: jest.fn().mockResolvedValue(undefined),
  sendBookingStatusEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/webhook.service', () => ({
  safeEmitEvent: jest.fn(),
  recordInboundEvent: jest.fn().mockResolvedValue({ duplicate: false }),
}));

jest.mock('../utils/bookingAccess', () => ({
  generateBookingAccessToken: jest.fn().mockReturnValue('guest-access-token'),
  verifyBookingAccessToken: jest.fn((token: unknown) => token === 'guest-access-token'),
}));

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const INTENT_ID = 'pi_test_bound';

const stripeConfig = {
  enabled: true,
  publishableKey: 'pk_test_public',
  secretKey: 'sk_test_secret',
  webhookSecret: 'whsec_test',
  verifiedAccountId: 'acct_verified',
  verifiedCredentialFingerprint: 'fingerprint_verified',
  credentialsVerifiedAt: new Date('2030-01-01T00:00:00.000Z'),
  configRevision: 4,
  configuredAt: new Date('2030-01-01T00:00:00.000Z'),
  webhookContextFingerprint: 'webhook-fingerprint-a',
};

const bookingFixture = (overrides: Record<string, unknown> = {}) => ({
  _id: BOOKING_ID,
  reference: 'ATT-SECURE-001',
  tenantId: TENANT_ID,
  userId: undefined,
  attractionId: {
    title: 'Secure Tour',
    destination: { city: 'Hurghada' },
    meetingPoint: {},
  },
  items: [
    {
      optionId: 'standard',
      optionName: 'Standard',
      date: '2030-08-20',
      time: '09:00',
      quantities: { adults: 2, children: 0, infants: 0 },
      unitPrice: 50,
      totalPrice: 100,
    },
  ],
  guestDetails: {
    firstName: 'Rdmi',
    lastName: 'Team',
    email: 'info@rdmiwebservices.com',
    phone: '+201000000000',
    country: 'EG',
  },
  subtotal: 100,
  fees: 5,
  discount: 0,
  total: 105,
  currency: 'USD',
  paymentMethod: 'card',
  paymentStatus: 'processing',
  status: 'pending',
  stripePaymentIntentId: INTENT_ID,
  ...overrides,
});

const paymentIntent = (overrides: Record<string, unknown> = {}) => ({
  id: INTENT_ID,
  clientSecret: `${INTENT_ID}_secret_test`,
  amount: 10500,
  amountReceived: 10500,
  currency: 'usd',
  status: 'succeeded',
  metadata: { bookingId: BOOKING_ID, tenantId: TENANT_ID },
  ...overrides,
});

const webhookEvent = (
  type = 'payment_intent.succeeded',
  objectOverrides: Record<string, unknown> = {},
  id = 'evt_secure_1'
) => ({
  id,
  type,
  data: {
    object: {
      id: INTENT_ID,
      amount: 10500,
      amount_received: 10500,
      currency: 'usd',
      status: 'succeeded',
      metadata: { bookingId: BOOKING_ID, tenantId: TENANT_ID },
      ...objectOverrides,
    },
  },
});

const responseMock = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  (res.json as jest.Mock).mockReturnValue(res);
  return res;
};

const webhookRequest = (signature = 'valid-signature') =>
  ({
    params: { tenantId: TENANT_ID },
    headers: signature ? { 'stripe-signature': signature } : {},
    body: Buffer.from('{}'),
  }) as unknown as Request;

const invoke = async (
  handler: (req: never, res: Response, next: NextFunction) => Promise<void>,
  req: unknown
) => {
  const res = responseMock();
  const next = jest.fn();
  await handler(req as never, res, next);
  expect(next).not.toHaveBeenCalled();
  return res;
};

describe('Stripe payment hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantStripeConfig as jest.Mock).mockResolvedValue(stripeConfig);
    (recordInboundEvent as jest.Mock).mockResolvedValue({ duplicate: false });
    (Booking.exists as jest.Mock).mockResolvedValue({ _id: BOOKING_ID });
    (BundleOrder.countDocuments as jest.Mock).mockResolvedValue(0);
    (verifyStripeCredentialBinding as jest.Mock).mockResolvedValue({
      accountId: 'acct_verified',
      chargesEnabled: true,
      credentialFingerprint: 'fingerprint_verified',
    });
    (verifyStripeEventAccountBinding as jest.Mock).mockResolvedValue(true);
    (saveTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true });
  });

  describe('webhook authenticity and payment binding', () => {
    it('returns 503 without processing when tenant webhook credentials are missing', async () => {
      (getTenantStripeConfig as jest.Mock).mockResolvedValue({
        ...stripeConfig,
        webhookSecret: '',
      });

      const res = await invoke(handleWebhook as never, webhookRequest());

      expect(res.status).toHaveBeenCalledWith(503);
      expect(constructWebhookEvent).not.toHaveBeenCalled();
      expect(Booking.findOne).not.toHaveBeenCalled();
    });

    it('rejects an unsigned webhook without parsing its body', async () => {
      const res = await invoke(handleWebhook as never, webhookRequest(''));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(constructWebhookEvent).not.toHaveBeenCalled();
      expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects an unverifiable signature', async () => {
      (constructWebhookEvent as jest.Mock).mockImplementation(() => {
        throw new Error('bad signature');
      });

      const res = await invoke(handleWebhook as never, webhookRequest());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('does not restore webhook trust when the signed event is absent from the current account', async () => {
      (constructWebhookEvent as jest.Mock).mockReturnValue(
        webhookEvent('checkout.session.completed', {}, 'evt_other_account')
      );
      (verifyStripeEventAccountBinding as jest.Mock).mockResolvedValue(false);

      const res = await invoke(handleWebhook as never, webhookRequest());

      expect(verifyStripeEventAccountBinding).toHaveBeenCalledWith(
        stripeConfig.secretKey,
        'evt_other_account'
      );
      expect(markTenantStripeWebhookVerified).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ received: true, ignored: 'checkout.session.completed' })
      );
    });

    it('compare-and-sets trust against the exact configuration snapshot after provider verification', async () => {
      (constructWebhookEvent as jest.Mock).mockReturnValue(
        webhookEvent('checkout.session.completed', {}, 'evt_snapshot_bound')
      );
      let releaseProviderLookup: (() => void) | undefined;
      (verifyStripeEventAccountBinding as jest.Mock).mockImplementation(() =>
        new Promise<boolean>((resolve) => {
          releaseProviderLookup = () => resolve(true);
        })
      );

      const pending = invoke(handleWebhook as never, webhookRequest());
      await Promise.resolve();
      await Promise.resolve();
      expect(releaseProviderLookup).toBeDefined();

      // This represents account C being saved after the handler read account B.
      // The real persistence update will modify zero rows because configRevision
      // and both account-bound fields are part of its atomic predicate.
      (markTenantStripeWebhookVerified as jest.Mock).mockResolvedValueOnce(false);
      releaseProviderLookup!();
      const res = await pending;

      expect(markTenantStripeWebhookVerified).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          configRevision: 4,
          configuredAt: new Date('2030-01-01T00:00:00.000Z'),
          webhookContextFingerprint: 'webhook-fingerprint-a',
          verifiedAccountId: 'acct_verified',
          verifiedCredentialFingerprint: 'fingerprint_verified',
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ received: true, ignored: 'checkout.session.completed' })
      );
    });

    it('accepts an in-flight event signed by the prior secret without verifying the replacement', async () => {
      (getTenantStripeConfig as jest.Mock).mockResolvedValue({
        ...stripeConfig,
        previousWebhookSecret: 'whsec_previous',
        previousWebhookValidUntil: new Date(Date.now() + 60_000),
      });
      (constructWebhookEvent as jest.Mock)
        .mockImplementationOnce(() => { throw new Error('not the replacement secret'); })
        .mockReturnValueOnce(webhookEvent('checkout.session.completed'));

      const res = await invoke(handleWebhook as never, webhookRequest());

      expect(constructWebhookEvent).toHaveBeenNthCalledWith(
        2,
        stripeConfig.secretKey,
        'whsec_previous',
        expect.any(Buffer),
        'valid-signature'
      );
      expect(markTenantStripeWebhookVerified).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ received: true, ignored: 'checkout.session.completed' })
      );
    });

    it('does not treat checkout.session.completed as payment proof', async () => {
      (constructWebhookEvent as jest.Mock).mockReturnValue(
        webhookEvent('checkout.session.completed', { payment_status: 'paid' })
      );

      const res = await invoke(handleWebhook as never, webhookRequest());

      expect(Booking.findOne).not.toHaveBeenCalled();
      expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ received: true, ignored: 'checkout.session.completed' })
      );
    });

    it.each([
      ['amount', { amount: 100, amount_received: 100 }],
      ['currency', { currency: 'eur' }],
      ['tenant metadata', { metadata: { bookingId: BOOKING_ID, tenantId: 'tenant-2' } }],
      ['booking metadata', { metadata: { bookingId: 'booking-2', tenantId: TENANT_ID } }],
    ])('rejects succeeded events with mismatched %s', async (_label, mismatch) => {
      (constructWebhookEvent as jest.Mock).mockReturnValue(
        webhookEvent('payment_intent.succeeded', mismatch)
      );
      (Booking.findOne as jest.Mock).mockResolvedValue(bookingFixture());

      const res = await invoke(handleWebhook as never, webhookRequest());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
      expect(recordInboundEvent).not.toHaveBeenCalled();
    });

    it('marks a declined intent retryable without cancelling the booking hold', async () => {
      (constructWebhookEvent as jest.Mock).mockReturnValue(
        webhookEvent('payment_intent.payment_failed', {
          status: 'requires_payment_method',
          amount_received: 0,
        })
      );
      const booking = bookingFixture();
      (Booking.findOne as jest.Mock).mockResolvedValue(booking);
      (Booking.findOneAndUpdate as jest.Mock).mockResolvedValue(
        bookingFixture({ paymentStatus: 'failed' })
      );

      const res = await invoke(handleWebhook as never, webhookRequest());

      expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: BOOKING_ID,
          stripePaymentIntentId: INTENT_ID,
          status: 'pending',
          inventoryReleasedAt: { $exists: false },
        }),
        { $set: { paymentStatus: 'failed' } },
        { new: true }
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ received: true }));
    });

    it('uses one atomic transition so concurrent valid events send side effects once', async () => {
      (constructWebhookEvent as jest.Mock)
        .mockReturnValueOnce(webhookEvent('payment_intent.succeeded', {}, 'evt_race_1'))
        .mockReturnValueOnce(webhookEvent('payment_intent.succeeded', {}, 'evt_race_2'));
      (Booking.findOne as jest.Mock).mockResolvedValue(bookingFixture());
      (Booking.findOneAndUpdate as jest.Mock)
        .mockReturnValueOnce({
          populate: jest.fn().mockResolvedValue(
            bookingFixture({
              paymentStatus: 'succeeded',
              status: 'confirmed',
              userId: 'customer-1',
            })
          ),
        })
        .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue(null) });

      await Promise.all([
        invoke(handleWebhook as never, webhookRequest()),
        invoke(handleWebhook as never, webhookRequest()),
      ]);

      expect(Booking.findOneAndUpdate).toHaveBeenCalledTimes(2);
      expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: BOOKING_ID,
          tenantId: TENANT_ID,
          stripePaymentIntentId: INTENT_ID,
          paymentMethod: 'card',
          status: 'pending',
          inventoryReleasedAt: { $exists: false },
          paymentStatus: { $in: ['pending', 'processing', 'failed'] },
        }),
        expect.objectContaining({
          $set: expect.objectContaining({ paymentStatus: 'succeeded', status: 'confirmed' }),
        }),
        { new: true }
      );
      expect(sendBookingConfirmation).toHaveBeenCalledTimes(1);
      expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'customer-1',
        { $inc: { totalSpent: 105 } }
      );
      expect(sendBookingConfirmation).toHaveBeenCalledWith(
        'info@rdmiwebservices.com',
        expect.objectContaining({ guestAccessToken: 'guest-access-token' }),
        expect.any(Buffer),
        expect.anything()
      );
    });

    it('does not acknowledge a paid event when the booking can no longer be finalized', async () => {
      (constructWebhookEvent as jest.Mock).mockReturnValue(webhookEvent());
      (Booking.findOne as jest.Mock).mockResolvedValue(
        bookingFixture({ status: 'cancelled', inventoryReleasedAt: new Date() })
      );
      (Booking.findOneAndUpdate as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
      });
      (Booking.exists as jest.Mock).mockResolvedValue(null);

      const res = await invoke(handleWebhook as never, webhookRequest());

      expect(res.status).toHaveBeenCalledWith(409);
      expect(recordInboundEvent).not.toHaveBeenCalled();
    });
  });

  describe('gateway configuration', () => {
    it('cannot enable card payments without a webhook signing secret', async () => {
      (getTenantStripeConfig as jest.Mock).mockResolvedValue({
        enabled: false,
        publishableKey: '',
        secretKey: '',
        webhookSecret: '',
      });

      const res = await invoke(updatePaymentGateway as never, {
        params: { tenantId: TENANT_ID },
        protocol: 'https',
        get: jest.fn(() => 'api.example.test'),
        body: {
          enabled: true,
          publishableKey: 'pk_test_public',
          secretKey: 'sk_test_secret',
        },
      });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringMatching(/webhook signing secret/i),
      }));
    });

    it('authenticates an enabled gateway with Stripe before saving it as launch-ready', async () => {
      (getTenantStripeConfig as jest.Mock).mockResolvedValue({
        enabled: false,
        publishableKey: '',
        secretKey: '',
        webhookSecret: '',
      });
      const res = await invoke(updatePaymentGateway as never, {
        params: { tenantId: TENANT_ID },
        protocol: 'https',
        get: jest.fn(() => 'api.example.test'),
        body: {
          enabled: true,
          publishableKey: 'pk_test_public',
          secretKey: 'sk_test_secret',
          webhookSecret: 'whsec_test',
        },
      });

      expect(verifyStripeCredentialBinding).toHaveBeenCalledWith('sk_test_secret', 'pk_test_public');
      expect(saveTenantStripeConfig).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          verifiedAccountId: 'acct_verified',
          verifiedCredentialFingerprint: 'fingerprint_verified',
        })
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('blocks a same-mode Stripe account change while a provider-bound Bundle order remains refundable', async () => {
      (BundleOrder.countDocuments as jest.Mock).mockResolvedValue(1);
      (verifyStripeCredentialBinding as jest.Mock).mockResolvedValue({
        accountId: 'acct_replacement',
        chargesEnabled: true,
        credentialFingerprint: 'fingerprint_replacement',
      });

      const res = await invoke(updatePaymentGateway as never, {
        params: { tenantId: TENANT_ID },
        protocol: 'https',
        get: jest.fn(() => 'api.example.test'),
        body: {
          enabled: true,
          publishableKey: 'pk_test_replacement',
          secretKey: 'sk_test_replacement',
          webhookSecret: 'whsec_replacement',
        },
      });

      expect(BundleOrder.countDocuments).toHaveBeenCalledWith({
        storefrontTenantId: TENANT_ID,
        checkoutMode: 'test',
        stripePaymentIntentId: { $exists: true, $ne: '' },
        $expr: { $lt: [{ $ifNull: ['$refundedMinor', 0] }, '$totalMinor'] },
      });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(saveTenantStripeConfig).not.toHaveBeenCalled();
    });

    it('invalidates webhook trust after an account change even when no provider-bound order remains', async () => {
      (verifyStripeCredentialBinding as jest.Mock).mockResolvedValue({
        accountId: 'acct_replacement',
        chargesEnabled: true,
        credentialFingerprint: 'fingerprint_replacement',
      });

      const res = await invoke(updatePaymentGateway as never, {
        params: { tenantId: TENANT_ID },
        protocol: 'https',
        get: jest.fn(() => 'api.example.test'),
        body: {
          publishableKey: 'pk_test_replacement',
          secretKey: 'sk_test_replacement',
        },
      });

      expect(saveTenantStripeConfig).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ resetWebhookTrust: true })
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('invalidates old-context webhook trust when TEST credentials change to LIVE credentials', async () => {
      (verifyStripeCredentialBinding as jest.Mock).mockResolvedValue({
        accountId: 'acct_live',
        chargesEnabled: true,
        credentialFingerprint: 'fingerprint_live',
      });

      const res = await invoke(updatePaymentGateway as never, {
        params: { tenantId: TENANT_ID },
        protocol: 'https',
        get: jest.fn(() => 'api.example.test'),
        body: {
          publishableKey: 'pk_live_replacement',
          secretKey: 'sk_live_replacement',
          webhookSecret: 'whsec_live_replacement',
        },
      });

      expect(saveTenantStripeConfig).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ resetWebhookTrust: true })
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('keeps checkout closed across disable, staged account change, and re-enable', async () => {
      let stagedConfig: {
        enabled: boolean;
        publishableKey: string;
        secretKey: string;
        webhookSecret: string;
        verifiedAccountId?: string;
        verifiedCredentialFingerprint?: string;
        credentialsVerifiedAt?: Date;
        webhookVerifiedAt?: Date;
        previousWebhookSecret?: string;
        previousWebhookValidUntil?: Date;
      } = {
        ...stripeConfig,
        webhookVerifiedAt: new Date('2030-01-01T00:00:00.000Z'),
        previousWebhookSecret: 'whsec_previous',
        previousWebhookValidUntil: new Date('2030-01-02T00:00:00.000Z'),
      };
      (getTenantStripeConfig as jest.Mock).mockImplementation(async () => stagedConfig);
      (saveTenantStripeConfig as jest.Mock).mockImplementation(async (_tenantId, input) => {
        const keyChanged = (input.publishableKey !== undefined && input.publishableKey !== stagedConfig.publishableKey) ||
          (!!input.secretKey && input.secretKey !== stagedConfig.secretKey);
        stagedConfig = {
          ...stagedConfig,
          enabled: typeof input.enabled === 'boolean' ? input.enabled : stagedConfig.enabled,
          publishableKey: input.publishableKey ?? stagedConfig.publishableKey,
          secretKey: input.secretKey || stagedConfig.secretKey,
          webhookSecret: input.webhookSecret || stagedConfig.webhookSecret,
          verifiedAccountId: keyChanged ? '' : stagedConfig.verifiedAccountId,
          verifiedCredentialFingerprint: keyChanged ? '' : stagedConfig.verifiedCredentialFingerprint,
          credentialsVerifiedAt: keyChanged ? undefined : stagedConfig.credentialsVerifiedAt,
          ...(input.verifiedAccountId && input.verifiedCredentialFingerprint ? {
            verifiedAccountId: input.verifiedAccountId,
            verifiedCredentialFingerprint: input.verifiedCredentialFingerprint,
            credentialsVerifiedAt: new Date(),
          } : {}),
          ...(input.resetWebhookTrust || (keyChanged && !input.verifiedAccountId) ? {
            webhookVerifiedAt: undefined,
            previousWebhookSecret: '',
            previousWebhookValidUntil: undefined,
          } : {}),
          ...(input.clearWebhookSecret ? { webhookSecret: '' } : {}),
        };
        return { enabled: stagedConfig.enabled };
      });

      await invoke(updatePaymentGateway as never, {
        params: { tenantId: TENANT_ID }, protocol: 'https',
        get: jest.fn(() => 'api.example.test'), body: { enabled: false },
      });
      expect(stagedConfig.webhookVerifiedAt).toEqual(expect.any(Date));

      await invoke(updatePaymentGateway as never, {
        params: { tenantId: TENANT_ID }, protocol: 'https',
        get: jest.fn(() => 'api.example.test'),
        body: { publishableKey: 'pk_test_account_b', secretKey: 'sk_test_account_b' },
      });
      expect(saveTenantStripeConfig).toHaveBeenLastCalledWith(
        TENANT_ID,
        expect.objectContaining({ resetWebhookTrust: true, clearWebhookSecret: true })
      );
      expect(stagedConfig.webhookVerifiedAt).toBeUndefined();
      expect(stagedConfig.previousWebhookSecret).toBe('');
      expect(stagedConfig.webhookSecret).toBe('');

      (verifyStripeCredentialBinding as jest.Mock).mockResolvedValueOnce({
        accountId: 'acct_b', chargesEnabled: true, credentialFingerprint: 'fingerprint_b',
      });
      const blockedEnable = await invoke(updatePaymentGateway as never, {
        params: { tenantId: TENANT_ID }, protocol: 'https',
        get: jest.fn(() => 'api.example.test'), body: { enabled: true },
      });

      expect(blockedEnable.status).toHaveBeenCalledWith(400);
      expect(stagedConfig.enabled).toBe(false);

      await invoke(updatePaymentGateway as never, {
        params: { tenantId: TENANT_ID }, protocol: 'https',
        get: jest.fn(() => 'api.example.test'),
        body: { enabled: true, webhookSecret: 'whsec_account_b' },
      });

      expect(stagedConfig.enabled).toBe(true);
      expect(stagedConfig.verifiedAccountId).toBe('acct_b');
      expect(stagedConfig.webhookSecret).toBe('whsec_account_b');
      expect(stagedConfig.webhookVerifiedAt).toBeUndefined();
      expect(markTenantStripeWebhookVerified).not.toHaveBeenCalled();
    });

    it('allows a same-account API key and webhook-secret rotation with bounded overlap', async () => {
      const res = await invoke(updatePaymentGateway as never, {
        params: { tenantId: TENANT_ID },
        protocol: 'https',
        get: jest.fn(() => 'api.example.test'),
        body: {
          enabled: true,
          secretKey: 'sk_test_replacement',
          webhookSecret: 'whsec_replacement',
        },
      });

      expect(verifyStripeCredentialBinding).toHaveBeenCalledWith(
        'sk_test_replacement',
        'pk_test_public'
      );
      expect(BundleOrder.countDocuments).not.toHaveBeenCalled();
      expect(saveTenantStripeConfig).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          secretKey: 'sk_test_replacement',
          webhookSecret: 'whsec_replacement',
          verifiedAccountId: 'acct_verified',
          verifiedCredentialFingerprint: 'fingerprint_verified',
        })
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('verifies an enabled gateway when enabled is omitted and blocks a different-account secret', async () => {
      (BundleOrder.countDocuments as jest.Mock).mockResolvedValue(1);
      (verifyStripeCredentialBinding as jest.Mock).mockResolvedValue({
        accountId: 'acct_replacement',
        chargesEnabled: true,
        credentialFingerprint: 'fingerprint_replacement',
      });

      const res = await invoke(updatePaymentGateway as never, {
        params: { tenantId: TENANT_ID },
        protocol: 'https',
        get: jest.fn(() => 'api.example.test'),
        body: { secretKey: 'sk_test_replacement' },
      });

      expect(verifyStripeCredentialBinding).toHaveBeenCalledWith(
        'sk_test_replacement',
        'pk_test_public'
      );
      expect(res.status).toHaveBeenCalledWith(409);
      expect(saveTenantStripeConfig).not.toHaveBeenCalled();
    });

    it('rejects a provider-detected key-account mismatch during initial configuration', async () => {
      (getTenantStripeConfig as jest.Mock).mockResolvedValue({
        enabled: false,
        publishableKey: '',
        secretKey: '',
        webhookSecret: '',
      });
      (verifyStripeCredentialBinding as jest.Mock).mockRejectedValue(new Error('account mismatch'));

      const res = await invoke(updatePaymentGateway as never, {
        params: { tenantId: TENANT_ID },
        protocol: 'https',
        get: jest.fn(() => 'api.example.test'),
        body: {
          enabled: true,
          publishableKey: 'pk_test_wrong_account',
          secretKey: 'sk_test_secret',
          webhookSecret: 'whsec_test',
        },
      });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(saveTenantStripeConfig).not.toHaveBeenCalled();
    });

    it('rejects a provider-detected key-account mismatch during publishable-key rotation', async () => {
      (verifyStripeCredentialBinding as jest.Mock).mockRejectedValue(new Error('account mismatch'));

      const res = await invoke(updatePaymentGateway as never, {
        params: { tenantId: TENANT_ID },
        protocol: 'https',
        get: jest.fn(() => 'api.example.test'),
        body: { publishableKey: 'pk_test_wrong_account' },
      });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(saveTenantStripeConfig).not.toHaveBeenCalled();
    });

    it('refuses a second webhook-secret rotation before the replacement is verified', async () => {
      (getTenantStripeConfig as jest.Mock).mockResolvedValue({
        ...stripeConfig,
        webhookVerifiedAt: undefined,
        previousWebhookSecret: 'whsec_previous',
        previousWebhookValidUntil: new Date(Date.now() + 60_000),
      });

      const res = await invoke(updatePaymentGateway as never, {
        params: { tenantId: TENANT_ID },
        protocol: 'https',
        get: jest.fn(() => 'api.example.test'),
        body: { enabled: true, webhookSecret: 'whsec_second_replacement' },
      });

      expect(res.status).toHaveBeenCalledWith(409);
      expect(saveTenantStripeConfig).not.toHaveBeenCalled();
    });
  });

  describe('PaymentIntent creation and confirmation', () => {
    it('rejects guest payment access without the booking access token', async () => {
      const booking = bookingFixture({ paymentStatus: 'pending', stripePaymentIntentId: undefined });
      (Booking.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(booking),
      });

      const res = await invoke(createPaymentIntent as never, {
        body: { bookingId: BOOKING_ID, guestEmail: 'info@rdmiwebservices.com' },
      });

      expect(res.status).toHaveBeenCalledWith(403);
      expect(stripeCreatePaymentIntent).not.toHaveBeenCalled();
    });

    it('resumes the existing processing intent instead of creating another charge', async () => {
      const booking = bookingFixture();
      (Booking.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(booking),
      });
      (retrievePaymentIntent as jest.Mock).mockResolvedValue(
        paymentIntent({ status: 'requires_payment_method', amountReceived: 0 })
      );

      const res = await invoke(createPaymentIntent as never, {
        body: {
          bookingId: BOOKING_ID,
          guestEmail: 'info@rdmiwebservices.com',
          guestAccessToken: 'guest-access-token',
        },
      });

      expect(stripeCreatePaymentIntent).not.toHaveBeenCalled();
      expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Payment session resumed' })
      );
    });

    it('refuses to resume payment after the booking hold was released', async () => {
      const booking = bookingFixture({
        paymentStatus: 'failed',
        status: 'cancelled',
        inventoryReleasedAt: new Date(),
      });
      (Booking.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(booking),
      });

      const res = await invoke(createPaymentIntent as never, {
        body: {
          bookingId: BOOKING_ID,
          guestEmail: 'info@rdmiwebservices.com',
          guestAccessToken: 'guest-access-token',
        },
      });

      expect(res.status).toHaveBeenCalledWith(409);
      expect(retrievePaymentIntent).not.toHaveBeenCalled();
      expect(stripeCreatePaymentIntent).not.toHaveBeenCalled();
    });

    it('creates and binds a new intent with a deterministic idempotency key', async () => {
      const pending = bookingFixture({
        paymentStatus: 'pending',
        stripePaymentIntentId: undefined,
      });
      const created = paymentIntent({ status: 'requires_payment_method', amountReceived: 0 });
      (Booking.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(pending),
      });
      (stripeCreatePaymentIntent as jest.Mock).mockResolvedValue(created);
      (Booking.findOneAndUpdate as jest.Mock).mockResolvedValue({
        ...pending,
        paymentStatus: 'processing',
        stripePaymentIntentId: INTENT_ID,
      });

      await invoke(createPaymentIntent as never, {
        body: {
          bookingId: BOOKING_ID,
          guestEmail: 'info@rdmiwebservices.com',
          guestAccessToken: 'guest-access-token',
        },
      });

      expect(stripeCreatePaymentIntent).toHaveBeenCalledWith(
        stripeConfig.secretKey,
        10500,
        'usd',
        expect.objectContaining({ bookingId: BOOKING_ID, tenantId: TENANT_ID }),
        { idempotencyKey: `booking:${BOOKING_ID}:payment:10500:usd` }
      );
      expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: BOOKING_ID,
          paymentMethod: 'card',
          status: 'pending',
          inventoryReleasedAt: { $exists: false },
          paymentStatus: { $in: ['pending', 'failed'] },
        }),
        expect.objectContaining({
          $set: { stripePaymentIntentId: INTENT_ID, paymentStatus: 'processing' },
        }),
        { new: true }
      );
    });

    it('does not finalize when provider evidence has the wrong amount', async () => {
      const booking = bookingFixture();
      (Booking.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue(booking),
      });
      (retrievePaymentIntent as jest.Mock).mockResolvedValue(paymentIntent({ amount: 10499 }));

      const res = await invoke(confirmPayment as never, {
        body: {
          bookingId: BOOKING_ID,
          guestEmail: 'info@rdmiwebservices.com',
          guestAccessToken: 'guest-access-token',
        },
      });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
      expect(sendBookingConfirmation).not.toHaveBeenCalled();
    });

    it('finalizes a provider-verified retry after an earlier card decline', async () => {
      const retryable = bookingFixture({ paymentStatus: 'failed' });
      const confirmed = bookingFixture({ paymentStatus: 'succeeded', status: 'confirmed' });
      (Booking.findById as jest.Mock)
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(retryable) })
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(confirmed) });
      (retrievePaymentIntent as jest.Mock).mockResolvedValue(paymentIntent());
      (Booking.findOneAndUpdate as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(confirmed),
      });

      const res = await invoke(confirmPayment as never, {
        body: {
          bookingId: BOOKING_ID,
          guestEmail: 'info@rdmiwebservices.com',
          guestAccessToken: 'guest-access-token',
        },
      });

      expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: BOOKING_ID,
          paymentStatus: { $in: ['pending', 'processing', 'failed'] },
          status: 'pending',
          inventoryReleasedAt: { $exists: false },
        }),
        expect.objectContaining({
          $set: expect.objectContaining({ paymentStatus: 'succeeded', status: 'confirmed' }),
        }),
        { new: true }
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          paymentStatus: 'succeeded',
          bookingStatus: 'confirmed',
        }),
      }));
    });
  });

  describe('refund state integrity', () => {
    const adminRequest = (amount?: number) => ({
      params: { bookingId: BOOKING_ID },
      body: amount === undefined ? {} : { amount },
      user: {
        _id: 'admin-1',
        role: 'brand-admin',
        assignedTenants: [TENANT_ID],
      },
    });

    it('returns 503 and leaves state unchanged when the Stripe secret is missing', async () => {
      (Booking.findById as jest.Mock).mockResolvedValue(
        bookingFixture({ paymentStatus: 'succeeded', status: 'confirmed' })
      );
      (getTenantStripeConfig as jest.Mock).mockResolvedValue({ ...stripeConfig, secretKey: '' });

      const res = await invoke(refundPayment as never, adminRequest());

      expect(res.status).toHaveBeenCalledWith(503);
      expect(stripeCreateRefund).not.toHaveBeenCalled();
      expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('does not mark a pending provider refund as completed', async () => {
      (Booking.findById as jest.Mock).mockResolvedValue(
        bookingFixture({ paymentStatus: 'succeeded', status: 'confirmed' })
      );
      (stripeCreateRefund as jest.Mock).mockResolvedValue({
        id: 're_pending',
        status: 'pending',
        amount: 10500,
      });

      const res = await invoke(refundPayment as never, adminRequest());

      expect(res.status).toHaveBeenCalledWith(202);
      expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('preserves paid booking state after a successful partial refund', async () => {
      (Booking.findById as jest.Mock).mockResolvedValue(
        bookingFixture({ paymentStatus: 'succeeded', status: 'confirmed' })
      );
      (stripeCreateRefund as jest.Mock).mockResolvedValue({
        id: 're_partial',
        status: 'succeeded',
        amount: 2500,
      });
      (retrieveSucceededRefundAmount as jest.Mock).mockResolvedValue(2500);
      (Booking.findOneAndUpdate as jest.Mock).mockResolvedValue(
        bookingFixture({ paymentStatus: 'succeeded', status: 'confirmed', refundedAmount: 0 })
      );

      const res = await invoke(refundPayment as never, adminRequest(25));

      expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: BOOKING_ID,
          bundleOrderId: { $exists: false },
          stripePaymentIntentId: INTENT_ID,
        },
        { $max: { refundedAmount: 25 } },
        { new: false }
      );
      expect(stripeCreateRefund).toHaveBeenCalledWith(
        stripeConfig.secretKey,
        INTENT_ID,
        2500,
        {
          allowPending: true,
          idempotencyKey: `booking:${BOOKING_ID}:refund:2500`,
        }
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            refundType: 'partial',
            refundedAmount: 25,
            remainingAmount: 80,
            paymentStatus: 'succeeded',
            bookingStatus: 'confirmed',
          }),
        })
      );
    });

    it('marks the booking refunded only after a successful full provider refund', async () => {
      (Booking.findById as jest.Mock).mockResolvedValue(
        bookingFixture({ paymentStatus: 'succeeded', status: 'confirmed' })
      );
      (stripeCreateRefund as jest.Mock).mockResolvedValue({
        id: 're_full',
        status: 'succeeded',
        amount: 10500,
      });
      (retrieveSucceededRefundAmount as jest.Mock).mockResolvedValue(10500);
      (Booking.findOneAndUpdate as jest.Mock).mockResolvedValue(
        bookingFixture({ paymentStatus: 'succeeded', status: 'confirmed', refundedAmount: 0 })
      );

      await invoke(refundPayment as never, adminRequest());

      expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: BOOKING_ID,
          bundleOrderId: { $exists: false },
          stripePaymentIntentId: INTENT_ID,
        },
        {
          $max: { refundedAmount: 105 },
          $set: { paymentStatus: 'refunded', status: 'refunded' },
        },
        { new: false }
      );
    });
  });
});
