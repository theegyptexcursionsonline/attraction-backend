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
} from '../services/stripe.service';
import { getTenantStripeConfig } from '../services/tenantPayment.service';
import { sendBookingConfirmation } from '../services/email.service';
import { recordInboundEvent } from '../services/webhook.service';

jest.mock('../models/Booking', () => ({
  Booking: {
    findById: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
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

jest.mock('../services/stripe.service', () => ({
  createPaymentIntent: jest.fn(),
  retrievePaymentIntent: jest.fn(),
  createRefund: jest.fn(),
  retrieveSucceededRefundAmount: jest.fn(),
  constructWebhookEvent: jest.fn(),
}));

jest.mock('../services/tenantPayment.service', () => ({
  evaluateStripeConfirmation: jest.fn().mockReturnValue({ allowed: true, verifyIntent: true }),
  getTenantStripeConfig: jest.fn(),
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
        { _id: BOOKING_ID, stripePaymentIntentId: INTENT_ID },
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
