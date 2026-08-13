import { Request, Response } from 'express';
import { requireTenantBundleMode } from '../bundles/featureFlags';
import {
  BundleLaunchReadinessInput,
  evaluateBundleLaunchReadiness,
  hasCompleteFutureCapacityWindow,
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
    credentialsVerified: true,
    webhookVerified: true,
  },
  supply: {
    currencyPools: [{ currency: 'USD', activeOfferCount: 3, supplierCount: 2, eligible: true }],
  },
  storefront: {
    counts: { published: 1 },
    publishedBundleCount: 1,
    sellablePublishedBundleCount: 1,
    futureCapacityReadyBundleCount: 1,
  },
  operations: { recoveryQueueCount: 0, outboxPendingCount: 0, outboxDeadLetterCount: 0 },
});

describe('Bundle per-tenant launch readiness', () => {
  it('requires aligned future capacity across every itinerary day', () => {
    const components = [
      { attractionId: 'a1', supplyOfferId: 'o1', dayNumber: 1, startTime: '08:00' },
      { attractionId: 'a2', supplyOfferId: 'o2', dayNumber: 2, startTime: '08:00' },
      { attractionId: 'a3', supplyOfferId: 'o3', dayNumber: 3, startTime: '08:00' },
    ];
    const offers = ['o1', 'o2', 'o3'].map((_id) => ({
      _id,
      capacityPerDeparture: 8,
      validTravelFrom: new Date('2026-08-01T00:00:00.000Z'),
      validTravelTo: new Date('2027-08-31T23:59:59.999Z'),
      blackoutDates: [],
      leadTimeHours: 0,
    }));
    const availabilities = [
      ['a1', '2026-08-20'],
      ['a2', '2026-08-21'],
      ['a3', '2026-08-22'],
    ].map(([attractionId, date]) => ({
      attractionId,
      date: new Date(`${date}T00:00:00.000Z`),
      timeSlots: [{ time: '08:00', capacity: 8, booked: 0 }],
      isBlocked: false,
    }));

    expect(hasCompleteFutureCapacityWindow({
      components,
      offers,
      availabilities,
      inventories: [],
      now: new Date('2026-08-13T00:00:00.000Z'),
    })).toBe(true);

    availabilities[2].date = new Date('2026-08-23T00:00:00.000Z');
    expect(hasCompleteFutureCapacityWindow({
      components,
      offers,
      availabilities,
      inventories: [],
      now: new Date('2026-08-13T00:00:00.000Z'),
    })).toBe(false);
  });

  it('fails an aligned path when supplier allocation is exhausted', () => {
    const components = [1, 2, 3].map((dayNumber) => ({
      attractionId: `a${dayNumber}`,
      supplyOfferId: `o${dayNumber}`,
      dayNumber,
      startTime: '08:00',
    }));
    const offers = [1, 2, 3].map((number) => ({
      _id: `o${number}`,
      capacityPerDeparture: 8,
      validTravelFrom: new Date('2026-08-01T00:00:00.000Z'),
      validTravelTo: new Date('2027-08-31T23:59:59.999Z'),
      blackoutDates: [],
      leadTimeHours: 0,
    }));
    const availabilities = [1, 2, 3].map((number) => ({
      attractionId: `a${number}`,
      date: new Date(`2026-08-${19 + number}T00:00:00.000Z`),
      timeSlots: [{ time: '08:00', capacity: 8, booked: 0 }],
      isBlocked: false,
    }));

    expect(hasCompleteFutureCapacityWindow({
      components,
      offers,
      availabilities,
      inventories: [{
        supplyOfferId: 'o2',
        date: new Date('2026-08-21T00:00:00.000Z'),
        timeKey: '08:00',
        capacity: 8,
        reserved: 8,
      }],
      now: new Date('2026-08-13T00:00:00.000Z'),
    })).toBe(false);
  });

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

  it('keeps active checkout protected during webhook rotation but requires replacement verification for activation', () => {
    const input = base();
    input.tenant.activationMode = 'test';
    input.payment.webhookVerified = false;
    input.payment.webhookRotationProtectedUntil = '2030-01-02T00:00:00.000Z';

    const readiness = evaluateBundleLaunchReadiness(
      input,
      new Date('2030-01-01T00:00:00.000Z')
    );

    expect(readiness.state).toBe('setup_required');
    expect(readiness.canActivateTest).toBe(false);
    expect(readiness.acceptingCheckout).toBe(true);
    expect(readiness.checks).toContainEqual(expect.objectContaining({
      key: 'payment_gateway',
      state: 'action_required',
      detail: expect.stringContaining('Checkout is protected by the prior verified webhook secret'),
    }));
  });

  it('keeps normal queued outbox work visible without flapping checkout closed', () => {
    const input = base();
    input.tenant.activationMode = 'test';
    input.operations.outboxPendingCount = 3;

    const readiness = evaluateBundleLaunchReadiness(input);

    expect(readiness.state).toBe('test_ready');
    expect(readiness.canActivateTest).toBe(true);
    expect(readiness.acceptingCheckout).toBe(true);
    expect(readiness.checks).toContainEqual(expect.objectContaining({
      key: 'notification_queue',
      state: 'pass',
      detail: '3 delivery item(s) are queued or retrying normally; none require manual recovery.',
    }));
  });

  it('blocks a new activation for dead letters without taking an active checkout offline', () => {
    const input = base();
    input.tenant.activationMode = 'test';
    input.operations.outboxPendingCount = 2;
    input.operations.outboxDeadLetterCount = 1;

    const readiness = evaluateBundleLaunchReadiness(input);

    expect(readiness.state).toBe('blocked');
    expect(readiness.canActivateTest).toBe(false);
    expect(readiness.acceptingCheckout).toBe(true);
    expect(readiness.checks).toContainEqual(expect.objectContaining({
      key: 'notification_queue',
      state: 'blocked',
      detail: '1 delivery item(s) require manual recovery; 2 are queued or retrying.',
    }));
  });

  it('fails checkout closed when an activated tenant is no longer active', () => {
    const input = base();
    input.tenant.activationMode = 'test';
    input.tenant.status = 'suspended';
    expect(evaluateBundleLaunchReadiness(input).acceptingCheckout).toBe(false);
  });

  it('reports checkout closed when an activated tenant loses complete capacity', () => {
    const input = base();
    input.tenant.activationMode = 'test';
    input.storefront.futureCapacityReadyBundleCount = 0;
    expect(evaluateBundleLaunchReadiness(input).acceptingCheckout).toBe(false);
  });

  it('requires complete future capacity for every published bundle', () => {
    const input = base();
    input.storefront.publishedBundleCount = 2;
    input.storefront.sellablePublishedBundleCount = 2;
    input.storefront.futureCapacityReadyBundleCount = 1;

    const readiness = evaluateBundleLaunchReadiness(input);

    expect(readiness.state).toBe('setup_required');
    expect(readiness.canActivateTest).toBe(false);
    expect(readiness.checks).toContainEqual(expect.objectContaining({
      key: 'future_capacity',
      state: 'action_required',
      detail: '1 published bundle(s) lack complete aligned future capacity.',
    }));
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
    ['dead-lettered notification delivery', (input: BundleLaunchReadinessInput) => { input.operations.outboxDeadLetterCount = 1; }],
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
    ['provider credential verification', (input: BundleLaunchReadinessInput) => { input.payment.credentialsVerified = false; }],
    ['signed webhook verification', (input: BundleLaunchReadinessInput) => { input.payment.webhookVerified = false; }],
    ['multi-supplier supply', (input: BundleLaunchReadinessInput) => { input.supply.currencyPools = []; }],
    ['published inventory', (input: BundleLaunchReadinessInput) => { input.storefront.publishedBundleCount = 0; input.storefront.sellablePublishedBundleCount = 0; }],
    ['sellable inventory', (input: BundleLaunchReadinessInput) => { input.storefront.sellablePublishedBundleCount = 0; }],
    ['future departure capacity', (input: BundleLaunchReadinessInput) => { input.storefront.futureCapacityReadyBundleCount = 0; }],
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
