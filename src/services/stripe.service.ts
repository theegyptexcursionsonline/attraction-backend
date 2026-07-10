import Stripe from 'stripe';
import crypto from 'crypto';

/**
 * Per-tenant Stripe payment service.
 *
 * Keys are NOT global/env — each tenant stores its own Stripe secret + webhook
 * secret on its record (encrypted, editable from that site's admin). Every call
 * takes the tenant's secret key, so one site's admin configures their own gateway
 * without touching anyone else's. Missing credentials fail closed by default.
 * Tests that deliberately need a fake provider must opt in with `allowMock`.
 *
 * The webhook — not these create/confirm calls — is the source of truth that marks
 * a booking paid (see payments.controller handleWebhook), so a card charge can
 * never succeed at Stripe without confirming the matching booking.
 */
const clientCache = new Map<string, Stripe>();

const getStripe = (secretKey?: string): Stripe | null => {
  if (!secretKey) return null;
  let client = clientCache.get(secretKey);
  if (!client) {
    client = new Stripe(secretKey);
    clientCache.set(secretKey, client);
  }
  return client;
};

export interface PaymentIntentResult {
  id: string;
  clientSecret: string;
  amount: number;
  amountReceived: number;
  currency: string;
  status: string;
  metadata: Record<string, string>;
}

export interface StripeCallOptions {
  allowMock?: boolean;
  allowPending?: boolean;
  idempotencyKey?: string;
}

const missingKeyError = (): Error => new Error('Stripe secret key is required');

/** Create a PaymentIntent on the tenant's own Stripe account. */
export const createPaymentIntent = async (
  secretKey: string | undefined,
  amountMinor: number,
  currency: string,
  metadata: Record<string, string>,
  options: StripeCallOptions = {}
): Promise<PaymentIntentResult> => {
  const stripe = getStripe(secretKey);
  if (stripe) {
    const pi = await stripe.paymentIntents.create(
      {
        amount: amountMinor,
        currency: currency.toLowerCase(),
        metadata,
        payment_method_types: ['card'],
      },
      options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined
    );
    return {
      id: pi.id,
      clientSecret: pi.client_secret || '',
      amount: pi.amount,
      amountReceived: pi.amount_received,
      currency: pi.currency,
      status: pi.status,
      metadata: pi.metadata,
    };
  }
  if (!options.allowMock) throw missingKeyError();

  const id = `pi_mock_${crypto.randomBytes(12).toString('hex')}`;
  return {
    id,
    clientSecret: `${id}_secret_${crypto.randomBytes(12).toString('hex')}`,
    amount: amountMinor,
    amountReceived: 0,
    currency: currency.toLowerCase(),
    status: 'requires_confirmation',
    metadata,
  };
};

/** Retrieve the full provider evidence needed to bind a payment to a booking. */
export const retrievePaymentIntent = async (
  secretKey: string | undefined,
  id: string,
  options: StripeCallOptions = {}
): Promise<PaymentIntentResult | null> => {
  const stripe = getStripe(secretKey);
  if (!stripe) {
    if (!options.allowMock) throw missingKeyError();
    return {
      id,
      clientSecret: `${id}_secret_mock`,
      amount: 0,
      amountReceived: 0,
      currency: 'usd',
      status: 'succeeded',
      metadata: {},
    };
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(id);
    return {
      id: pi.id,
      clientSecret: pi.client_secret || '',
      amount: pi.amount,
      amountReceived: pi.amount_received,
      currency: pi.currency,
      status: pi.status,
      metadata: pi.metadata,
    };
  } catch {
    return null;
  }
};

/**
 * Read a PaymentIntent's real status from the tenant's Stripe account, so the
 * frontend-triggered confirm endpoint can only finalize a booking whose charge
 * Stripe actually reports as succeeded (never trust the client). Mock behavior is
 * available only when the caller explicitly sets `allowMock`.
 */
export const retrievePaymentIntentStatus = async (
  secretKey: string | undefined,
  id: string,
  options: StripeCallOptions = {}
): Promise<string | null> => {
  const pi = await retrievePaymentIntent(secretKey, id, options);
  return pi?.status || null;
};

export interface RefundResult {
  id: string;
  status: string;
  amount: number;
}

/** Sum provider-confirmed refunds so partial refunds retain accurate state. */
export const retrieveSucceededRefundAmount = async (
  secretKey: string | undefined,
  paymentIntentId: string,
  options: StripeCallOptions = {}
): Promise<number> => {
  const stripe = getStripe(secretKey);
  if (!stripe) {
    if (!options.allowMock) throw missingKeyError();
    return 0;
  }

  let total = 0;
  for await (const refund of stripe.refunds.list({ payment_intent: paymentIntentId })) {
    if (refund.status === 'succeeded') total += refund.amount;
  }
  return total;
};

export const createRefund = async (
  secretKey: string | undefined,
  paymentIntentId: string,
  amountMinor?: number,
  options: StripeCallOptions = {}
): Promise<RefundResult> => {
  const stripe = getStripe(secretKey);
  if (stripe) {
    const idempotencyKey =
      options.idempotencyKey || `refund:${paymentIntentId}:${amountMinor ?? 'full'}`;
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        ...(amountMinor ? { amount: amountMinor } : {}),
      },
      { idempotencyKey }
    );
    const result = { id: refund.id, status: refund.status || 'pending', amount: refund.amount };
    if (result.status !== 'succeeded' && !options.allowPending) {
      throw new Error(`Stripe refund is not complete (status: ${result.status})`);
    }
    return result;
  }
  if (!options.allowMock) throw missingKeyError();

  return {
    id: `re_mock_${crypto.randomBytes(12).toString('hex')}`,
    status: 'succeeded',
    amount: amountMinor || 0,
  };
};

/**
 * Verify + parse a Stripe webhook using the tenant's own signing secret. Throws on
 * an invalid signature (or when the tenant has no secret/key), which the caller
 * turns into a 400 so a forged "payment succeeded" event can't confirm a booking.
 */
export const constructWebhookEvent = (
  secretKey: string | undefined,
  webhookSecret: string | undefined,
  rawBody: Buffer | string,
  signature: string
): Stripe.Event => {
  const stripe = getStripe(secretKey);
  if (!stripe || !webhookSecret) {
    throw new Error('Stripe webhooks not configured for this tenant');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
};
