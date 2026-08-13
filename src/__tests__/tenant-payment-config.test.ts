import { Tenant } from '../models/Tenant';
import { saveTenantStripeConfig } from '../services/tenantPayment.service';

jest.mock('../models/Tenant', () => ({
  Tenant: { findById: jest.fn() },
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
      verifiedAccountId: 'acct_verified',
      verifiedCredentialFingerprint: 'fingerprint_verified',
      credentialsVerifiedAt: new Date('2030-01-01T00:00:00.000Z'),
      webhookVerifiedAt: webhookVerified ? new Date('2030-01-01T00:00:00.000Z') : undefined,
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
    }));
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
});
