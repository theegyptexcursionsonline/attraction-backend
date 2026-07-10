import { Tenant } from '../models/Tenant';
import { decryptSecret, encryptSecret } from '../utils/secretCrypto';

export interface TenantStripeConfig {
  enabled: boolean;
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
}

export type StripeConfirmationPolicy =
  | { allowed: true; verifyIntent: boolean }
  | { allowed: false; error: string };

export const evaluateStripeConfirmation = (
  config: TenantStripeConfig | null,
  paymentIntentId: string | undefined,
  isProduction: boolean
): StripeConfirmationPolicy => {
  const configured = !!(
    config?.enabled &&
    config.publishableKey &&
    config.secretKey
  );

  if (configured && !paymentIntentId) {
    return { allowed: false, error: 'A Stripe payment session is required for this booking' };
  }
  if (paymentIntentId && !configured) {
    return { allowed: false, error: 'The tenant Stripe gateway is not fully configured' };
  }
  if (!paymentIntentId && isProduction) {
    return { allowed: false, error: 'A verified payment session is required' };
  }
  return { allowed: true, verifyIntent: !!paymentIntentId };
};

/**
 * Load and decrypt a tenant's own Stripe gateway config. Returns null when the
 * tenant has never configured Stripe. The secret + webhook fields are select:false
 * on the model, so they are only ever read here — never in a normal tenant query.
 */
export const getTenantStripeConfig = async (
  tenantId: unknown
): Promise<TenantStripeConfig | null> => {
  const tenant = await Tenant.findById(tenantId as string)
    .select('+paymentSettings.stripe.secretKeyEnc +paymentSettings.stripe.webhookSecretEnc')
    .lean();
  const s = (tenant as { paymentSettings?: { stripe?: Record<string, string | boolean> } } | null)
    ?.paymentSettings?.stripe;
  if (!s) return null;
  return {
    enabled: !!s.enabled,
    publishableKey: (s.publishableKey as string) || '',
    secretKey: decryptSecret(s.secretKeyEnc as string),
    webhookSecret: decryptSecret(s.webhookSecretEnc as string),
  };
};

/**
 * Persist a tenant's Stripe gateway config from the admin. Secrets are encrypted
 * before storage; a blank secret/webhook value is treated as "leave unchanged" so
 * an admin can toggle `enabled` or update the publishable key without re-entering
 * the secrets. Returns a client-safe summary (never the secret values).
 */
export const saveTenantStripeConfig = async (
  tenantId: string,
  input: { enabled?: boolean; publishableKey?: string; secretKey?: string; webhookSecret?: string }
): Promise<{ enabled: boolean; publishableKey: string; hasSecretKey: boolean; hasWebhookSecret: boolean }> => {
  // Load-mutate-save (not a dotted `$set`, which collides on the select:false
  // encrypted subpaths in Mongoose). Explicitly select the hidden fields so they
  // round-trip when other fields change.
  const tenant = await Tenant.findById(tenantId).select(
    '+paymentSettings.stripe.secretKeyEnc +paymentSettings.stripe.webhookSecretEnc'
  );
  if (!tenant) throw new Error('Tenant not found');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ps = (tenant as any).paymentSettings || ((tenant as any).paymentSettings = {});
  const stripe = ps.stripe || (ps.stripe = {});

  if (typeof input.enabled === 'boolean') stripe.enabled = input.enabled;
  if (input.publishableKey !== undefined) stripe.publishableKey = input.publishableKey.trim();
  if (input.secretKey) stripe.secretKeyEnc = encryptSecret(input.secretKey.trim());
  if (input.webhookSecret) stripe.webhookSecretEnc = encryptSecret(input.webhookSecret.trim());
  stripe.configuredAt = new Date();

  tenant.markModified('paymentSettings');
  await tenant.save();

  const cfg = await getTenantStripeConfig(tenantId);
  return {
    enabled: !!cfg?.enabled,
    publishableKey: cfg?.publishableKey || '',
    hasSecretKey: !!cfg?.secretKey,
    hasWebhookSecret: !!cfg?.webhookSecret,
  };
};
