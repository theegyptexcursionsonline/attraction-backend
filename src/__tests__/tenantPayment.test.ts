import {
  evaluateStripeConfirmation,
  isStripeWebhookRotationProtected,
  type TenantStripeConfig,
} from '../services/tenantPayment.service';

const configured: TenantStripeConfig = {
  enabled: true,
  publishableKey: 'pk_test_configured',
  secretKey: 'sk_test_configured',
  webhookSecret: 'whsec_configured',
};

describe('tenant Stripe confirmation policy', () => {
  it('requires a PaymentIntent for a configured tenant', () => {
    expect(evaluateStripeConfirmation(configured, undefined, true)).toEqual({
      allowed: false,
      error: 'A Stripe payment session is required for this booking',
    });
  });

  it('requires a complete tenant configuration for an existing PaymentIntent', () => {
    expect(evaluateStripeConfirmation(null, 'pi_test_123', true)).toEqual({
      allowed: false,
      error: 'The tenant Stripe gateway is not fully configured',
    });
  });

  it('allows a configured intent only with remote verification', () => {
    expect(evaluateStripeConfirmation(configured, 'pi_test_123', true)).toEqual({
      allowed: true,
      verifyIntent: true,
    });
  });

  it('keeps keyless mock confirmation development-only', () => {
    expect(evaluateStripeConfirmation(null, undefined, false)).toEqual({
      allowed: true,
      verifyIntent: false,
    });
    expect(evaluateStripeConfirmation(null, undefined, true)).toEqual({
      allowed: false,
      error: 'A verified payment session is required',
    });
  });

  it('accepts the prior webhook secret only inside its bounded rotation overlap', () => {
    const now = new Date('2030-01-01T00:00:00.000Z');
    expect(isStripeWebhookRotationProtected({
      previousWebhookSecret: 'whsec_previous',
      previousWebhookValidUntil: new Date('2030-01-01T01:00:00.000Z'),
    }, now)).toBe(true);
    expect(isStripeWebhookRotationProtected({
      previousWebhookSecret: 'whsec_previous',
      previousWebhookValidUntil: new Date('2029-12-31T23:59:59.000Z'),
    }, now)).toBe(false);
  });
});
