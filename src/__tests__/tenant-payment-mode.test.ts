import { stripeCredentialMode } from '../services/tenantPayment.service';

describe('tenant Stripe credential mode', () => {
  it.each([
    ['test', 'pk_test_public', 'sk_test_secret', 'test'],
    ['live', 'pk_live_public', 'rk_live_restricted', 'live'],
    ['mixed', 'pk_test_public', 'sk_live_secret', 'mixed'],
    ['incomplete', 'pk_test_public', '', 'mixed'],
  ])('%s credentials classify without exposing their values', (_label, publishableKey, secretKey, expected) => {
    expect(stripeCredentialMode({
      enabled: true,
      publishableKey,
      secretKey,
      webhookSecret: 'configured',
    })).toBe(expected);
  });

  it('treats a missing configuration as unconfigured', () => {
    expect(stripeCredentialMode(null)).toBe('unconfigured');
  });
});
