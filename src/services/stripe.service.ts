import Stripe from 'stripe';
import crypto from 'crypto';

/**
 * Per-tenant Stripe payment service.
 *
 * Keys are NOT global/env — each tenant stores its own Stripe secret + webhook
 * secret on its record (encrypted, editable from that site's admin). Every call
 * takes the tenant's secret key, so one site's admin configures their own gateway
 * without touching anyone else's. When a secret key is empty the service falls back
 * to a deterministic mock so dev/tests run without a real account.
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
  currency: string;
  status: string;
}

/** Create a PaymentIntent on the tenant's own Stripe account. */
export const createPaymentIntent = async (
  secretKey: string | undefined,
  amountMinor: number,
  currency: string,
  metadata: Record<string, string>
): Promise<PaymentIntentResult> => {
  const stripe = getStripe(secretKey);
  if (stripe) {
    const pi = await stripe.paymentIntents.create({
      amount: amountMinor,
      currency: currency.toLowerCase(),
      metadata,
      payment_method_types: ['card'],
    });
    return {
      id: pi.id,
      clientSecret: pi.client_secret || '',
      amount: pi.amount,
      currency: pi.currency,
      status: pi.status,
    };
  }
  // Mock fallback (tenant has no key configured)
  const id = `pi_mock_${crypto.randomBytes(12).toString('hex')}`;
  return {
    id,
    clientSecret: `${id}_secret_${crypto.randomBytes(12).toString('hex')}`,
    amount: amountMinor,
    currency: currency.toLowerCase(),
    status: 'requires_confirmation',
  };
};

/**
 * Read a PaymentIntent's real status from the tenant's Stripe account, so the
 * frontend-triggered confirm endpoint can only finalize a booking whose charge
 * Stripe actually reports as succeeded (never trust the client). Returns
 * 'succeeded' in mock mode.
 */
export const retrievePaymentIntentStatus = async (
  secretKey: string | undefined,
  id: string
): Promise<string | null> => {
  const stripe = getStripe(secretKey);
  if (!stripe) return 'succeeded';
  try {
    const pi = await stripe.paymentIntents.retrieve(id);
    return pi.status;
  } catch {
    return null;
  }
};

export interface RefundResult {
  id: string;
  status: string;
  amount: number;
}

export const createRefund = async (
  secretKey: string | undefined,
  paymentIntentId: string,
  amountMinor?: number
): Promise<RefundResult> => {
  const stripe = getStripe(secretKey);
  if (stripe) {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(amountMinor ? { amount: amountMinor } : {}),
    });
    return { id: refund.id, status: refund.status || 'pending', amount: refund.amount };
  }
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
