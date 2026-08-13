import { Tenant } from '../models/Tenant';
import crypto from 'crypto';
import {
  markTenantStripeWebhookVerified,
  saveTenantStripeConfig,
} from '../services/tenantPayment.service';

jest.mock('../models/Tenant', () => ({
  Tenant: { findById: jest.fn(), updateOne: jest.fn() },
}));

jest.mock('../utils/secretCrypto', () => ({
  encryptSecret: jest.fn((value: string) => `enc:${value}`),
  decryptSecret: jest.fn((value?: string) => value?.startsWith('enc:') ? value.slice(4) : ''),
}));

const tenantDocument = (webhookVerified: boolean) => ({
  paymentSettings: {
    stripe: {
      enabled: true,
      publishableKey: 'pk_test_public',
      secretKeyEnc: 'enc:sk_test_secret',
      webhookSecretEnc: 'enc:whsec_current',
      previousWebhookSecretEnc: '',
      previousWebhookValidUntil: undefined as Date | undefined,
      verifiedAccountId: 'acct_verified',
      verifiedCredentialFingerprint: 'fingerprint_verified',
      credentialsVerifiedAt: new Date('2030-01-01T00:00:00.000Z'),
      webhookVerifiedAt: webhookVerified ? new Date('2030-01-01T00:00:00.000Z') : undefined,
      configRevision: 4,
      configuredAt: new Date('2030-01-01T00:00:00.000Z'),
      webhookContextFingerprint: 'webhook-fingerprint-a',
    },
  },
  markModified: jest.fn(),
  save: jest.fn().mockResolvedValue(undefined),
});

const preparePersistence = (document: ReturnType<typeof tenantDocument>) => {
  (Tenant.findById as jest.Mock)
    .mockReturnValueOnce({ select: jest.fn().mockReturnValue(document) })
    .mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockImplementation(async () => document),
      }),
    });
};

describe('tenant Stripe credential persistence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retains a verified webhook secret for a bounded overlap during rotation', async () => {
    const document = tenantDocument(true);
    preparePersistence(document);

    await saveTenantStripeConfig('tenant-1', { webhookSecret: 'whsec_replacement' });

    expect(document.paymentSettings.stripe).toEqual(expect.objectContaining({
      webhookSecretEnc: 'enc:whsec_replacement',
      previousWebhookSecretEnc: 'enc:whsec_current',
      previousWebhookValidUntil: expect.any(Date),
      webhookVerifiedAt: undefined,
    }));
  });

  it('never promotes an unverified webhook secret into the trusted overlap', async () => {
    const document = tenantDocument(false);
    preparePersistence(document);

    await saveTenantStripeConfig('tenant-1', { webhookSecret: 'whsec_replacement' });

    expect(document.paymentSettings.stripe).toEqual(expect.objectContaining({
      webhookSecretEnc: 'enc:whsec_replacement',
      previousWebhookSecretEnc: '',
      previousWebhookValidUntil: undefined,
      configRevision: 5,
      webhookContextFingerprint: crypto
        .createHash('sha256')
        .update('whsec_replacement')
        .digest('hex'),
    }));
  });

  it('distinguishes concurrent same-account webhook rotations under a frozen clock', async () => {
    const documentB = tenantDocument(true);
    const documentC = tenantDocument(true);
    jest.useFakeTimers().setSystemTime(new Date('2030-03-17T00:00:00.000Z'));

    try {
      // Both documents are independently loaded copies of revision 4, as they
      // would be in concurrent requests. Even when both saves compute revision
      // 5 and the same timestamp, their secret-derived contexts remain unique.
      preparePersistence(documentB);
      await saveTenantStripeConfig('tenant-1', { webhookSecret: 'whsec_b' });
      preparePersistence(documentC);
      await saveTenantStripeConfig('tenant-1', { webhookSecret: 'whsec_c' });
    } finally {
      jest.useRealTimers();
    }

    expect(documentB.paymentSettings.stripe.configRevision).toBe(5);
    expect(documentC.paymentSettings.stripe.configRevision).toBe(5);
    expect(documentB.paymentSettings.stripe.configuredAt).toEqual(
      documentC.paymentSettings.stripe.configuredAt
    );
    expect(documentB.paymentSettings.stripe.webhookContextFingerprint).not.toBe(
      documentC.paymentSettings.stripe.webhookContextFingerprint
    );

    (Tenant.updateOne as jest.Mock).mockImplementation(async (filter) => ({
      modifiedCount: filter['paymentSettings.stripe.webhookContextFingerprint'] ===
        documentC.paymentSettings.stripe.webhookContextFingerprint ? 1 : 0,
    }));
    await expect(markTenantStripeWebhookVerified('tenant-1', {
      configRevision: documentB.paymentSettings.stripe.configRevision,
      configuredAt: documentB.paymentSettings.stripe.configuredAt,
      verifiedAccountId: documentB.paymentSettings.stripe.verifiedAccountId,
      verifiedCredentialFingerprint:
        documentB.paymentSettings.stripe.verifiedCredentialFingerprint,
      webhookContextFingerprint:
        documentB.paymentSettings.stripe.webhookContextFingerprint,
    })).resolves.toBe(false);
  });

  it('rejects a stale webhook trust write after the configuration revision changes', async () => {
    (Tenant.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 0 });

    await expect(markTenantStripeWebhookVerified('tenant-1', {
      configRevision: 5,
      configuredAt: new Date('2030-01-01T00:00:00.000Z'),
      verifiedAccountId: 'acct_b',
      verifiedCredentialFingerprint: 'fingerprint_b',
      webhookContextFingerprint: 'webhook-fingerprint-b',
    })).resolves.toBe(false);

    expect(Tenant.updateOne).toHaveBeenCalledWith(
      {
        _id: 'tenant-1',
        'paymentSettings.stripe.configRevision': 5,
        'paymentSettings.stripe.configuredAt': new Date('2030-01-01T00:00:00.000Z'),
        'paymentSettings.stripe.verifiedAccountId': 'acct_b',
        'paymentSettings.stripe.verifiedCredentialFingerprint': 'fingerprint_b',
        'paymentSettings.stripe.webhookContextFingerprint': 'webhook-fingerprint-b',
      },
      { $set: { 'paymentSettings.stripe.webhookVerifiedAt': expect.any(Date) } }
    );
  });

  it('supports the pre-revision configuration exactly once without weakening the CAS', async () => {
    (Tenant.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await expect(markTenantStripeWebhookVerified('tenant-1', {
      configRevision: 0,
      configuredAt: undefined,
      verifiedAccountId: 'acct_legacy',
      verifiedCredentialFingerprint: 'fingerprint_legacy',
      webhookContextFingerprint: 'webhook-fingerprint-legacy',
    })).resolves.toBe(true);

    expect(Tenant.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'tenant-1',
        'paymentSettings.stripe.configuredAt': { $exists: false },
        $and: [
          {
            $or: [
              { 'paymentSettings.stripe.webhookContextFingerprint': 'webhook-fingerprint-legacy' },
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
      }),
      { $set: { 'paymentSettings.stripe.webhookVerifiedAt': expect.any(Date) } }
    );
  });

  it('clears stale account proof whenever either account-bound key changes', async () => {
    const document = tenantDocument(true);
    preparePersistence(document);

    await saveTenantStripeConfig('tenant-1', { publishableKey: 'pk_test_replacement' });

    expect(document.paymentSettings.stripe).toEqual(expect.objectContaining({
      publishableKey: 'pk_test_replacement',
      verifiedAccountId: undefined,
      verifiedCredentialFingerprint: undefined,
      credentialsVerifiedAt: undefined,
      webhookVerifiedAt: undefined,
    }));
  });

  it('fails closed when account keys are staged while the gateway cannot verify them', async () => {
    const document = tenantDocument(true);
    document.paymentSettings.stripe.enabled = false;
    document.paymentSettings.stripe.previousWebhookSecretEnc = 'enc:whsec_previous';
    document.paymentSettings.stripe.previousWebhookValidUntil = new Date('2030-01-02T00:00:00.000Z');
    preparePersistence(document);

    await saveTenantStripeConfig('tenant-1', {
      publishableKey: 'pk_test_account_b',
      secretKey: 'sk_test_account_b',
      clearWebhookSecret: true,
    });

    expect(document.paymentSettings.stripe).toEqual(expect.objectContaining({
      verifiedAccountId: undefined,
      verifiedCredentialFingerprint: undefined,
      credentialsVerifiedAt: undefined,
      webhookSecretEnc: '',
      webhookVerifiedAt: undefined,
      previousWebhookSecretEnc: '',
      previousWebhookValidUntil: undefined,
    }));
  });

  it('persists fresh provider binding evidence atomically with rotated keys', async () => {
    const document = tenantDocument(true);
    preparePersistence(document);

    await saveTenantStripeConfig('tenant-1', {
      secretKey: 'sk_test_replacement',
      verifiedAccountId: 'acct_verified',
      verifiedCredentialFingerprint: 'fingerprint_replacement',
    });

    expect(document.paymentSettings.stripe).toEqual(expect.objectContaining({
      secretKeyEnc: 'enc:sk_test_replacement',
      verifiedAccountId: 'acct_verified',
      verifiedCredentialFingerprint: 'fingerprint_replacement',
      credentialsVerifiedAt: expect.any(Date),
    }));
  });

  it('invalidates current and overlap webhook trust when the Stripe account context changes', async () => {
    const document = tenantDocument(true);
    document.paymentSettings.stripe.previousWebhookSecretEnc = 'enc:whsec_previous';
    document.paymentSettings.stripe.previousWebhookValidUntil = new Date('2030-01-02T00:00:00.000Z');
    preparePersistence(document);

    await saveTenantStripeConfig('tenant-1', {
      publishableKey: 'pk_test_account_b',
      secretKey: 'sk_test_account_b',
      verifiedAccountId: 'acct_b',
      verifiedCredentialFingerprint: 'fingerprint_b',
      resetWebhookTrust: true,
    });

    expect(document.paymentSettings.stripe).toEqual(expect.objectContaining({
      webhookVerifiedAt: undefined,
      previousWebhookSecretEnc: '',
      previousWebhookValidUntil: undefined,
    }));
  });
});
