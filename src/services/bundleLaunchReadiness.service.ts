import { ClientSession, Types } from 'mongoose';
import { isBundleFeatureEnabled } from '../bundles/featureFlags';
import { Attraction } from '../models/Attraction';
import { BundleDefinition } from '../models/BundleDefinition';
import { BundleOrder } from '../models/BundleOrder';
import { BundleSupplyOffer } from '../models/BundleSupplyOffer';
import { Tenant } from '../models/Tenant';
import { BundleLaunchMode, ITenant } from '../types';
import { appendBundleEvent } from './bundleAudit.service';
import { runBundleTransaction } from './bundleInventory.service';
import { getTenantStripeConfig, TenantStripeConfig } from './tenantPayment.service';

export type BundleLaunchState = 'blocked' | 'setup_required' | 'test_ready' | 'live_ready';
export type BundleReadinessCheckState = 'pass' | 'action_required' | 'blocked';
export type StripeMode = 'test' | 'live' | 'mixed' | 'unconfigured';

export interface BundleSupplyCurrencyPool {
  currency: string;
  activeOfferCount: number;
  supplierCount: number;
  eligible: boolean;
}

export interface BundleLaunchReadinessInput {
  tenant: {
    id: string;
    slug: string;
    name: string;
    status: string;
    revision: number;
    activationMode: BundleLaunchMode;
  };
  features: { discovery: boolean; checkout: boolean; recovery: boolean };
  payment: {
    enabled: boolean;
    mode: StripeMode;
    hasPublishableKey: boolean;
    hasSecretKey: boolean;
    hasWebhookSecret: boolean;
  };
  supply: {
    currencyPools: BundleSupplyCurrencyPool[];
  };
  storefront: {
    counts: Record<string, number>;
    publishedBundleCount: number;
    sellablePublishedBundleCount: number;
  };
  operations: {
    recoveryQueueCount: number;
  };
}

export interface BundleReadinessCheck {
  key: string;
  label: string;
  state: BundleReadinessCheckState;
  detail: string;
}

export interface BundleLaunchReadiness extends BundleLaunchReadinessInput {
  state: BundleLaunchState;
  canActivateTest: boolean;
  canActivateLive: boolean;
  acceptingCheckout: boolean;
  checks: BundleReadinessCheck[];
  evaluatedAt: string;
}

interface SupplyPoolRow {
  _id: string;
  activeOfferCount: number;
  supplierCount: number;
}

interface PublishedHealthRow {
  publishedBundleCount: number;
  sellablePublishedBundleCount: number;
}

const stripeMode = (config: TenantStripeConfig | null): StripeMode => {
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

const check = (
  key: string,
  label: string,
  passed: boolean,
  detail: string,
  blocked = false
): BundleReadinessCheck => ({
  key,
  label,
  state: passed ? 'pass' : blocked ? 'blocked' : 'action_required',
  detail,
});

export const evaluateBundleLaunchReadiness = (
  input: BundleLaunchReadinessInput,
  evaluatedAt = new Date()
): BundleLaunchReadiness => {
  const featureReady = Object.values(input.features).every(Boolean);
  const tenantReady = input.tenant.status === 'active';
  const paymentComplete = input.payment.enabled &&
    input.payment.hasPublishableKey &&
    input.payment.hasSecretKey &&
    input.payment.hasWebhookSecret &&
    !['mixed', 'unconfigured'].includes(input.payment.mode);
  const eligiblePools = input.supply.currencyPools.filter((pool) => pool.eligible);
  const supplyReady = eligiblePools.length > 0;
  const hasPublished = input.storefront.publishedBundleCount > 0;
  const allPublishedSellable = hasPublished &&
    input.storefront.sellablePublishedBundleCount === input.storefront.publishedBundleCount;
  const recoveryClear = input.operations.recoveryQueueCount === 0;
  const unsafeConfiguration = input.payment.mode === 'mixed';
  const platformBlocked = !tenantReady || !featureReady || !recoveryClear || unsafeConfiguration;
  const setupComplete = paymentComplete && supplyReady && hasPublished && allPublishedSellable;
  const canActivateTest = !platformBlocked && setupComplete && input.payment.mode === 'test';
  const canActivateLive = !platformBlocked && setupComplete && input.payment.mode === 'live';
  const state: BundleLaunchState = platformBlocked
    ? 'blocked'
    : !setupComplete
      ? 'setup_required'
      : canActivateLive ? 'live_ready' : 'test_ready';

  const checks: BundleReadinessCheck[] = [
    check(
      'tenant_status',
      'Active storefront',
      tenantReady,
      tenantReady ? 'The tenant can serve customer traffic.' : `Tenant status is ${input.tenant.status}.`,
      true
    ),
    check(
      'feature_flags',
      'Bundle platform services',
      featureReady,
      featureReady
        ? 'Discovery, checkout and recovery services are enabled.'
        : 'One or more global Bundle services are disabled.',
      true
    ),
    check(
      'payment_gateway',
      'Tenant-owned payment gateway',
      paymentComplete,
      paymentComplete
        ? `Stripe ${input.payment.mode.toUpperCase()} keys and webhook signing are configured.`
        : unsafeConfiguration
          ? 'Stripe publishable and secret key modes do not match.'
          : 'Enable this tenant\'s Stripe gateway with matching keys and a webhook secret.',
      unsafeConfiguration
    ),
    check(
      'compatible_supply',
      'Compatible multi-supplier supply',
      supplyReady,
      supplyReady
        ? `${eligiblePools.length} currency pool(s) have at least three active offers from two suppliers.`
        : 'Activate at least three compatible offers from two independent suppliers.',
    ),
    check(
      'published_inventory',
      'Published storefront bundle',
      hasPublished,
      hasPublished
        ? `${input.storefront.publishedBundleCount} bundle(s) are published.`
        : 'Approve and publish at least one three-to-four component bundle.',
    ),
    check(
      'sellable_inventory',
      'Current sellability',
      allPublishedSellable,
      allPublishedSellable
        ? 'Every published bundle has active current supply and eligible attractions.'
        : hasPublished
          ? `${input.storefront.publishedBundleCount - input.storefront.sellablePublishedBundleCount} published bundle(s) have stale or unavailable supply.`
          : 'Sellability can be checked after the first bundle is published.',
    ),
    check(
      'recovery_queue',
      'Recovery queue',
      recoveryClear,
      recoveryClear
        ? 'No storefront orders require payment or allocation recovery.'
        : `${input.operations.recoveryQueueCount} order(s) require controlled recovery before launch.`,
      true
    ),
  ];

  return {
    ...input,
    state,
    canActivateTest,
    canActivateLive,
    acceptingCheckout:
      input.features.checkout && input.tenant.status === 'active' &&
      (input.tenant.activationMode === 'test' || input.tenant.activationMode === 'live'),
    checks,
    evaluatedAt: evaluatedAt.toISOString(),
  };
};

const activeOfferMatch = (now: Date): Record<string, unknown> => ({
  status: 'active',
  validTravelTo: { $gt: now },
  $and: [
    { $or: [{ salesStartsAt: { $exists: false } }, { salesStartsAt: null }, { salesStartsAt: { $lte: now } }] },
    { $or: [{ salesEndsAt: { $exists: false } }, { salesEndsAt: null }, { salesEndsAt: { $gt: now } }] },
  ],
});

const loadSupplyPools = async (now: Date): Promise<BundleSupplyCurrencyPool[]> => {
  const rows = await BundleSupplyOffer.aggregate<SupplyPoolRow>([
    { $match: activeOfferMatch(now) },
    {
      $group: {
        _id: { currency: '$currency', supplierTenantId: '$supplierTenantId' },
        activeOfferCount: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.currency',
        activeOfferCount: { $sum: '$activeOfferCount' },
        supplierCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((row) => ({
    currency: row._id,
    activeOfferCount: row.activeOfferCount,
    supplierCount: row.supplierCount,
    eligible: row.activeOfferCount >= 3 && row.supplierCount >= 2,
  }));
};

const loadBundleCounts = async (tenantId: Types.ObjectId): Promise<Record<string, number>> => {
  const rows = await BundleDefinition.aggregate<{ _id: string; count: number }>([
    { $match: { storefrontTenantId: tenantId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
};

const loadPublishedHealth = async (
  tenantId: Types.ObjectId,
  now: Date
): Promise<PublishedHealthRow> => {
  const rows = await BundleDefinition.aggregate<PublishedHealthRow>([
    { $match: { storefrontTenantId: tenantId, status: 'published' } },
    { $unwind: '$components' },
    {
      $lookup: {
        from: BundleSupplyOffer.collection.name,
        let: { offerId: '$components.supplyOfferId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$offerId'] }, ...activeOfferMatch(now) } },
          { $project: { supplierTenantId: 1, attractionId: 1, currency: 1 } },
        ],
        as: 'currentOffer',
      },
    },
    {
      $lookup: {
        from: Attraction.collection.name,
        let: { attractionId: '$components.attractionId' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$_id', '$$attractionId'] },
              status: 'active',
              instantConfirmation: true,
            },
          },
          { $project: { _id: 1 } },
        ],
        as: 'eligibleAttraction',
      },
    },
    {
      $group: {
        _id: '$_id',
        componentCount: { $sum: 1 },
        validOfferCount: { $sum: { $cond: [{ $gt: [{ $size: '$currentOffer' }, 0] }, 1, 0] } },
        validAttractionCount: { $sum: { $cond: [{ $gt: [{ $size: '$eligibleAttraction' }, 0] }, 1, 0] } },
        supplierIds: { $addToSet: { $arrayElemAt: ['$currentOffer.supplierTenantId', 0] } },
        currencyMismatchCount: {
          $sum: {
            $cond: [
              { $eq: [{ $arrayElemAt: ['$currentOffer.currency', 0] }, '$currency'] },
              0,
              1,
            ],
          },
        },
      },
    },
    {
      $project: {
        sellable: {
          $and: [
            { $gte: ['$componentCount', 3] },
            { $lte: ['$componentCount', 4] },
            { $eq: ['$validOfferCount', '$componentCount'] },
            { $eq: ['$validAttractionCount', '$componentCount'] },
            { $gte: [{ $size: '$supplierIds' }, 2] },
            { $eq: ['$currencyMismatchCount', 0] },
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        publishedBundleCount: { $sum: 1 },
        sellablePublishedBundleCount: { $sum: { $cond: ['$sellable', 1, 0] } },
      },
    },
    { $project: { _id: 0, publishedBundleCount: 1, sellablePublishedBundleCount: 1 } },
  ]);
  return rows[0] || { publishedBundleCount: 0, sellablePublishedBundleCount: 0 };
};

export const getBundleLaunchReadiness = async (
  tenant: ITenant,
  now = new Date()
): Promise<BundleLaunchReadiness> => {
  const tenantId = tenant._id;
  const [config, currencyPools, counts, publishedHealth, recoveryQueueCount] = await Promise.all([
    getTenantStripeConfig(tenantId),
    loadSupplyPools(now),
    loadBundleCounts(tenantId),
    loadPublishedHealth(tenantId, now),
    BundleOrder.countDocuments({
      storefrontTenantId: tenantId,
      $or: [
        { status: { $in: ['manual_review', 'paid_allocation_pending'] } },
        {
          'recovery.required': true,
          status: { $nin: ['cancelled', 'refunded', 'reservation_failed'] },
        },
      ],
    }),
  ]);
  const paymentMode = stripeMode(config);
  return evaluateBundleLaunchReadiness({
    tenant: {
      id: tenantId.toString(),
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      revision: tenant.get('__v') || 0,
      activationMode: tenant.bundleSettings?.mode || 'discovery',
    },
    features: {
      discovery: isBundleFeatureEnabled('discovery'),
      checkout: isBundleFeatureEnabled('checkout'),
      recovery: isBundleFeatureEnabled('recovery'),
    },
    payment: {
      enabled: !!config?.enabled,
      mode: paymentMode,
      hasPublishableKey: !!config?.publishableKey,
      hasSecretKey: !!config?.secretKey,
      hasWebhookSecret: !!config?.webhookSecret,
    },
    supply: { currencyPools },
    storefront: {
      counts,
      ...publishedHealth,
    },
    operations: { recoveryQueueCount },
  }, now);
};

export class BundleLaunchModeError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export const updateTenantBundleLaunchMode = async (input: {
  tenantId: string;
  mode: BundleLaunchMode;
  reason: string;
  expectedRevision: number;
  actorId: Types.ObjectId;
}): Promise<BundleLaunchReadiness> => {
  const tenant = await Tenant.findById(input.tenantId);
  if (!tenant) throw new BundleLaunchModeError(404, 'Tenant not found');
  const readiness = await getBundleLaunchReadiness(tenant);
  if (input.mode === 'test' && !readiness.canActivateTest) {
    throw new BundleLaunchModeError(409, 'Complete every TEST readiness check before activation');
  }
  if (input.mode === 'live' && !readiness.canActivateLive) {
    throw new BundleLaunchModeError(409, 'Complete every LIVE readiness check before activation');
  }
  const fromMode = tenant.bundleSettings?.mode || 'discovery';
  const updated = await runBundleTransaction(async (session: ClientSession) => {
    const changed = await Tenant.findOneAndUpdate(
      { _id: tenant._id, __v: input.expectedRevision },
      {
        $set: {
          bundleSettings: {
            mode: input.mode,
            updatedAt: new Date(),
            updatedBy: input.actorId,
            reason: input.reason,
          },
        },
        $inc: { __v: 1 },
      },
      { new: true, session, runValidators: true }
    );
    if (!changed) {
      throw new BundleLaunchModeError(409, 'Tenant launch settings changed; refresh and try again');
    }
    await appendBundleEvent({
      aggregateType: 'tenant',
      aggregateId: tenant._id,
      storefrontTenantId: tenant._id,
      actorType: 'user',
      actorId: input.actorId,
      command: 'set_bundle_launch_mode',
      fromState: fromMode,
      toState: input.mode,
      reason: input.reason,
      metadata: {
        readinessState: readiness.state,
        publishedBundleCount: readiness.storefront.publishedBundleCount,
        sellablePublishedBundleCount: readiness.storefront.sellablePublishedBundleCount,
      },
    }, session);
    return changed;
  });
  return getBundleLaunchReadiness(updated);
};
