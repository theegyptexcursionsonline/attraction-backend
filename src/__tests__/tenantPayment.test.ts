import { evaluateStripeConfirmation, type TenantStripeConfig } from '../services/tenantPayment.service';

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
});
