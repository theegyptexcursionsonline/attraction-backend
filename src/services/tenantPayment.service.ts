import { Tenant } from '../models/Tenant';
import { decryptSecret, encryptSecret } from '../utils/secretCrypto';
import crypto from 'crypto';

export interface TenantStripeConfig {
  enabled: boolean;
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
  previousWebhookSecret?: string;
  previousWebhookValidUntil?: Date;
  verifiedAccountId?: string;
  verifiedCredentialFingerprint?: string;
  credentialsVerifiedAt?: Date;
  webhookVerifiedAt?: Date;
  webhookContextFingerprint?: string;
  configRevision?: number;
  configuredAt?: Date;
}

export const STRIPE_WEBHOOK_ROTATION_GRACE_MS = 72 * 60 * 60 * 1000;

const stripeWebhookContextFingerprint = (secret: string): string =>
  secret ? crypto.createHash('sha256').update(secret).digest('hex') : '';

export const isStripeWebhookRotationProtected = (
  config: Pick<TenantStripeConfig, 'previousWebhookSecret' | 'previousWebhookValidUntil'> | null,
  now = new Date()
): boolean => !!config?.previousWebhookSecret &&
  !!config.previousWebhookValidUntil &&
  new Date(config.previousWebhookValidUntil).getTime() > now.getTime();

export type StripeCredentialMode = 'test' | 'live' | 'mixed' | 'unconfigured';

/** Classify a tenant's key pair without exposing either credential. */
export const stripeCredentialMode = (
  config: TenantStripeConfig | null
): StripeCredentialMode => {
  const publishable = config?.publishableKey || '';
  const secret = config?.secretKey || '';
  const publicMode = publishable.startsWith('pk_test_')
    ? 'test'
    : publishable.startsWith('pk_live_') ? 'live' : '';
  const secretMode = /^(sk|rk)_test_/.test(secret)
    ? 'test'
    : /^(sk|rk)_live_/.test(secret) ? 'live' : '';
  if (!publicMode && !secretMode) return 'unconfigured';
  if (!publicMode || !secretMode || publicMode !== secretMode) return 'mixed';
  return publicMode;
};

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
    .select('+paymentSettings.stripe.secretKeyEnc +paymentSettings.stripe.webhookSecretEnc +paymentSettings.stripe.previousWebhookSecretEnc')
    .lean();
  const s = (tenant as { paymentSettings?: { stripe?: Record<string, unknown> } } | null)
    ?.paymentSettings?.stripe;
  if (!s) return null;
  const currentWebhookSecret = decryptSecret(s.webhookSecretEnc as string);
  return {
    enabled: !!s.enabled,
    publishableKey: (s.publishableKey as string) || '',
    secretKey: decryptSecret(s.secretKeyEnc as string),
    webhookSecret: currentWebhookSecret,
    previousWebhookSecret: decryptSecret(s.previousWebhookSecretEnc as string),
    previousWebhookValidUntil: s.previousWebhookValidUntil as Date | undefined,
    verifiedAccountId: (s.verifiedAccountId as string) || '',
    verifiedCredentialFingerprint: (s.verifiedCredentialFingerprint as string) || '',
    credentialsVerifiedAt: s.credentialsVerifiedAt as Date | undefined,
    webhookVerifiedAt: s.webhookVerifiedAt as Date | undefined,
    webhookContextFingerprint: (s.webhookContextFingerprint as string) ||
      stripeWebhookContextFingerprint(currentWebhookSecret),
    configRevision: Number(s.configRevision || 0),
    configuredAt: s.configuredAt as Date | undefined,
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
  input: {
    enabled?: boolean;
    publishableKey?: string;
    secretKey?: string;
    webhookSecret?: string;
    verifiedAccountId?: string;
    verifiedCredentialFingerprint?: string;
    resetWebhookTrust?: boolean;
    clearWebhookSecret?: boolean;
  }
): Promise<{ enabled: boolean; publishableKey: string; hasSecretKey: boolean; hasWebhookSecret: boolean }> => {
  // Load-mutate-save (not a dotted `$set`, which collides on the select:false
  // encrypted subpaths in Mongoose). Explicitly select the hidden fields so they
  // round-trip when other fields change.
  const tenant = await Tenant.findById(tenantId).select(
    '+paymentSettings.stripe.secretKeyEnc +paymentSettings.stripe.webhookSecretEnc +paymentSettings.stripe.previousWebhookSecretEnc'
  );
  if (!tenant) throw new Error('Tenant not found');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ps = (tenant as any).paymentSettings || ((tenant as any).paymentSettings = {});
  const stripe = ps.stripe || (ps.stripe = {});

  const currentPublishableKey = String(stripe.publishableKey || '');
  const currentSecretKey = decryptSecret(stripe.secretKeyEnc as string);
  const nextPublishableKey = input.publishableKey !== undefined
    ? input.publishableKey.trim()
    : currentPublishableKey;
  const nextSecretKey = input.secretKey ? input.secretKey.trim() : currentSecretKey;
  const keyBindingChanged = nextPublishableKey !== currentPublishableKey ||
    nextSecretKey !== currentSecretKey;

  if (typeof input.enabled === 'boolean') stripe.enabled = input.enabled;
  if (input.publishableKey !== undefined) stripe.publishableKey = input.publishableKey.trim();
  if (input.secretKey) stripe.secretKeyEnc = encryptSecret(input.secretKey.trim());
  if (input.webhookSecret) {
    const nextWebhookSecret = input.webhookSecret.trim();
    const currentWebhookSecret = decryptSecret(stripe.webhookSecretEnc as string);
    if (nextWebhookSecret !== currentWebhookSecret) {
      if (currentWebhookSecret && stripe.webhookVerifiedAt) {
        // Stripe can sign with the old or new endpoint secret during a controlled
        // rotation. Retain the last verified secret only for a short overlap so
        // in-flight retries are not lost while the replacement is being proven.
        stripe.previousWebhookSecretEnc = stripe.webhookSecretEnc;
        stripe.previousWebhookValidUntil = new Date(Date.now() + STRIPE_WEBHOOK_ROTATION_GRACE_MS);
      } else {
        stripe.previousWebhookSecretEnc = '';
        stripe.previousWebhookValidUntil = undefined;
      }
      stripe.webhookSecretEnc = encryptSecret(nextWebhookSecret);
      stripe.webhookVerifiedAt = undefined;
    }
  }
  if (input.clearWebhookSecret && !input.webhookSecret) {
    // Staged credentials that cannot be provider-bound must not inherit the
    // prior account's endpoint secret. Re-enabling now requires the new
    // account's webhook secret and a fresh signed delivery.
    stripe.webhookSecretEnc = '';
  }
  const persistedWebhookSecret = decryptSecret(stripe.webhookSecretEnc as string);
  stripe.webhookContextFingerprint = stripeWebhookContextFingerprint(persistedWebhookSecret);
  if (keyBindingChanged) {
    stripe.verifiedAccountId = undefined;
    stripe.verifiedCredentialFingerprint = undefined;
    stripe.credentialsVerifiedAt = undefined;
  }
  if (input.verifiedAccountId && input.verifiedCredentialFingerprint) {
    stripe.verifiedAccountId = input.verifiedAccountId;
    stripe.verifiedCredentialFingerprint = input.verifiedCredentialFingerprint;
    stripe.credentialsVerifiedAt = new Date();
  }
  const unverifiedCredentialContextChanged = keyBindingChanged &&
    !(input.verifiedAccountId && input.verifiedCredentialFingerprint);
  if (input.resetWebhookTrust || unverifiedCredentialContextChanged) {
    // A signed event proves one exact Stripe account/mode/webhook context. It
    // cannot be carried to a different account or TEST/LIVE environment, and
    // an old-context secret cannot keep runtime checkout open during rotation.
    stripe.webhookVerifiedAt = undefined;
    stripe.previousWebhookSecretEnc = '';
    stripe.previousWebhookValidUntil = undefined;
  }
  // Advance the compare-and-set token on every configuration save. A webhook
  // handler using an older snapshot can no longer trust a newly saved context.
  stripe.configRevision = Number(stripe.configRevision || 0) + 1;
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

export const markTenantStripeWebhookVerified = async (
  tenantId: string,
  expected: Pick<
    TenantStripeConfig,
    'configRevision' | 'configuredAt' | 'verifiedAccountId' |
    'verifiedCredentialFingerprint' | 'webhookContextFingerprint'
  >
): Promise<boolean> => {
  if (
    !expected.verifiedAccountId ||
    !expected.verifiedCredentialFingerprint ||
    !expected.webhookContextFingerprint
  ) return false;
  const expectedRevision = Number(expected.configRevision || 0);
  const expectedConfiguredAt = expected.configuredAt;
  const result = await Tenant.updateOne(
    {
      _id: tenantId,
      'paymentSettings.stripe.verifiedAccountId': expected.verifiedAccountId,
      'paymentSettings.stripe.verifiedCredentialFingerprint': expected.verifiedCredentialFingerprint,
      ...(expectedRevision === 0 ? {
        $and: [
          {
            $or: [
              { 'paymentSettings.stripe.webhookContextFingerprint': expected.webhookContextFingerprint },
              { 'paymentSettings.stripe.webhookContextFingerprint': { $exists: false } },
            ],
          },
          {
            $or: [
              { 'paymentSettings.stripe.configRevision': 0 },
              { 'paymentSettings.stripe.configRevision': { $exists: false } },
            ],
          },
        ],
      } : {
        'paymentSettings.stripe.webhookContextFingerprint': expected.webhookContextFingerprint,
        'paymentSettings.stripe.configRevision': expectedRevision,
      }),
      ...(expectedConfiguredAt ? {
        'paymentSettings.stripe.configuredAt': expectedConfiguredAt,
      } : {
        'paymentSettings.stripe.configuredAt': { $exists: false },
      }),
    },
    { $set: { 'paymentSettings.stripe.webhookVerifiedAt': new Date() } }
  );
  return result.modifiedCount === 1;
};
