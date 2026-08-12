import { Request, Response } from 'express';
import { requireTenantBundleMode } from '../bundles/featureFlags';
import {
  BundleLaunchReadinessInput,
  evaluateBundleLaunchReadiness,
} from '../services/bundleLaunchReadiness.service';

const base = (): BundleLaunchReadinessInput => ({
  tenant: {
    id: 'tenant-1',
    slug: 'ready-tenant',
    name: 'Ready Tenant',
    status: 'active',
    revision: 4,
    activationMode: 'discovery',
  },
  features: { discovery: true, checkout: true, recovery: true },
  payment: {
    enabled: true,
    mode: 'test',
    hasPublishableKey: true,
    hasSecretKey: true,
    hasWebhookSecret: true,
  },
  supply: {
    currencyPools: [{ currency: 'USD', activeOfferCount: 3, supplierCount: 2, eligible: true }],
  },
  storefront: {
    counts: { published: 1 },
    publishedBundleCount: 1,
    sellablePublishedBundleCount: 1,
  },
  operations: { recoveryQueueCount: 0 },
});

describe('Bundle per-tenant launch readiness', () => {
  it('marks a complete TEST tenant ready without silently activating checkout', () => {
    const readiness = evaluateBundleLaunchReadiness(base(), new Date('2026-08-12T12:00:00.000Z'));
    expect(readiness.state).toBe('test_ready');
    expect(readiness.canActivateTest).toBe(true);
    expect(readiness.canActivateLive).toBe(false);
    expect(readiness.acceptingCheckout).toBe(false);
    expect(readiness.evaluatedAt).toBe('2026-08-12T12:00:00.000Z');
  });

  it('requires the matching activation mode before a ready tenant accepts checkout', () => {
    const input = base();
    input.tenant.activationMode = 'test';
    expect(evaluateBundleLaunchReadiness(input).acceptingCheckout).toBe(true);
  });

  it('fails checkout closed when an activated tenant is no longer active', () => {
    const input = base();
    input.tenant.activationMode = 'test';
    input.tenant.status = 'suspended';
    expect(evaluateBundleLaunchReadiness(input).acceptingCheckout).toBe(false);
  });

  it('separates LIVE readiness from TEST credentials', () => {
    const input = base();
    input.payment.mode = 'live';
    const readiness = evaluateBundleLaunchReadiness(input);
    expect(readiness.state).toBe('live_ready');
    expect(readiness.canActivateLive).toBe(true);
    expect(readiness.canActivateTest).toBe(false);
  });

  it.each([
    ['inactive tenant', (input: BundleLaunchReadinessInput) => { input.tenant.status = 'coming_soon'; }],
    ['disabled recovery service', (input: BundleLaunchReadinessInput) => { input.features.recovery = false; }],
    ['mixed payment keys', (input: BundleLaunchReadinessInput) => { input.payment.mode = 'mixed'; }],
    ['pending recovery work', (input: BundleLaunchReadinessInput) => { input.operations.recoveryQueueCount = 1; }],
  ])('blocks activation for %s', (_name, mutate) => {
    const input = base();
    mutate(input);
    const readiness = evaluateBundleLaunchReadiness(input);
    expect(readiness.state).toBe('blocked');
    expect(readiness.canActivateTest).toBe(false);
    expect(readiness.canActivateLive).toBe(false);
  });

  it.each([
    ['payment configuration', (input: BundleLaunchReadinessInput) => { input.payment.hasWebhookSecret = false; }],
    ['multi-supplier supply', (input: BundleLaunchReadinessInput) => { input.supply.currencyPools = []; }],
    ['published inventory', (input: BundleLaunchReadinessInput) => { input.storefront.publishedBundleCount = 0; input.storefront.sellablePublishedBundleCount = 0; }],
    ['sellable inventory', (input: BundleLaunchReadinessInput) => { input.storefront.sellablePublishedBundleCount = 0; }],
  ])('keeps a tenant in setup-required state when %s is incomplete', (_name, mutate) => {
    const input = base();
    mutate(input);
    expect(evaluateBundleLaunchReadiness(input).state).toBe('setup_required');
  });

  it('defaults legacy tenants to discovery and fails checkout closed', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const next = jest.fn();
    const req = { tenant: { status: 'active' } } as unknown as Request;
    const res = { status, json } as unknown as Response;

    requireTenantBundleMode(['discovery', 'test', 'live'])(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    next.mockClear();
    requireTenantBundleMode(['test', 'live'])(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Bundle checkout is not active for this storefront',
    }));
  });

  it('rejects checkout for a suspended tenant even when its saved mode is LIVE', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const next = jest.fn();
    const req = {
      tenant: { status: 'suspended', bundleSettings: { mode: 'live' } },
    } as unknown as Request;
    const res = { status, json } as unknown as Response;

    requireTenantBundleMode(['test', 'live'])(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
  });
});
