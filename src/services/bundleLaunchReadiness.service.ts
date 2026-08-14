import { ClientSession, Types } from 'mongoose';
import { isBundleFeatureEnabled } from '../bundles/featureFlags';
import { Attraction } from '../models/Attraction';
import { BundleDefinition } from '../models/BundleDefinition';
import { BundleOfferInventory } from '../models/BundleOfferInventory';
import { BundleOrder } from '../models/BundleOrder';
import { BundleOutboxEvent } from '../models/BundleOutboxEvent';
import { BundleSupplyOffer } from '../models/BundleSupplyOffer';
import { Availability } from '../models/Availability';
import { Tenant } from '../models/Tenant';
import { BundleLaunchMode, ITenant } from '../types';
import { appendBundleEvent } from './bundleAudit.service';
import { runBundleTransaction } from './bundleInventory.service';
import {
  getTenantStripeConfig,
  isStripeWebhookRotationProtected,
  stripeCredentialMode,
} from './tenantPayment.service';

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
    credentialsVerified: boolean;
    webhookVerified: boolean;
    webhookRotationProtectedUntil?: string;
  };
  supply: {
    currencyPools: BundleSupplyCurrencyPool[];
  };
  storefront: {
    counts: Record<string, number>;
    publishedBundleCount: number;
    sellablePublishedBundleCount: number;
    futureCapacityReadyBundleCount: number;
  };
  operations: {
    recoveryQueueCount: number;
    outboxPendingCount: number;
    outboxDeadLetterCount: number;
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
    input.payment.credentialsVerified &&
    input.payment.webhookVerified &&
    !['mixed', 'unconfigured'].includes(input.payment.mode);
  const webhookRotationProtected = !input.payment.webhookVerified &&
    !!input.payment.webhookRotationProtectedUntil &&
    new Date(input.payment.webhookRotationProtectedUntil).getTime() > evaluatedAt.getTime();
  const runtimePaymentComplete = paymentComplete || (
    input.payment.enabled &&
    input.payment.hasPublishableKey &&
    input.payment.hasSecretKey &&
    input.payment.hasWebhookSecret &&
    input.payment.credentialsVerified &&
    webhookRotationProtected &&
    !['mixed', 'unconfigured'].includes(input.payment.mode)
  );
  const eligiblePools = input.supply.currencyPools.filter((pool) => pool.eligible);
  const supplyReady = eligiblePools.length > 0;
  const hasPublished = input.storefront.publishedBundleCount > 0;
  const allPublishedSellable = hasPublished &&
    input.storefront.sellablePublishedBundleCount === input.storefront.publishedBundleCount;
  const futureCapacityReady = hasPublished &&
    input.storefront.futureCapacityReadyBundleCount === input.storefront.publishedBundleCount;
  const recoveryClear = input.operations.recoveryQueueCount === 0;
  // Pending, processing and scheduled-retry rows are the normal transactional
  // outbox lifecycle. They must remain visible to operators, but cannot make a
  // healthy checkout flap closed between enqueue and the next worker sweep.
  // Dead letters are different: they require manual recovery and block a new
  // TEST/LIVE activation. An already-active checkout remains available so an
  // email-provider outage cannot take the money path offline.
  const notificationQueueHealthy = input.operations.outboxDeadLetterCount === 0;
  const unsafeConfiguration = input.payment.mode === 'mixed';
  const runtimeBlocked = !tenantReady || !featureReady || !recoveryClear || unsafeConfiguration;
  const activationBlocked = runtimeBlocked || !notificationQueueHealthy;
  const setupComplete = paymentComplete && supplyReady && hasPublished && allPublishedSellable && futureCapacityReady;
  const runtimeSetupComplete = runtimePaymentComplete && supplyReady && hasPublished && allPublishedSellable && futureCapacityReady;
  const runtimeReady = !runtimeBlocked && runtimeSetupComplete;
  const canActivateTest = !activationBlocked && setupComplete && input.payment.mode === 'test';
  const canActivateLive = !activationBlocked && setupComplete && input.payment.mode === 'live';
  const state: BundleLaunchState = activationBlocked
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
        ? `Stripe ${input.payment.mode.toUpperCase()} credentials and signed webhook are provider-verified.`
        : webhookRotationProtected
          ? `Checkout is protected by the prior verified webhook secret until ${input.payment.webhookRotationProtectedUntil}; verify the replacement before that deadline.`
        : unsafeConfiguration
          ? 'Stripe publishable and secret key modes do not match.'
          : 'Verify this tenant\'s Stripe credentials and deliver a signed webhook before activation.',
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
      'future_capacity',
      'Complete future departure',
      futureCapacityReady,
      futureCapacityReady
        ? 'Every published bundle has a complete future capacity path.'
        : hasPublished
          ? `${input.storefront.publishedBundleCount - input.storefront.futureCapacityReadyBundleCount} published bundle(s) lack complete aligned future capacity.`
          : 'Capacity can be checked after the first bundle is published.',
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
    check(
      'notification_queue',
      'Notification delivery queue',
      notificationQueueHealthy,
      notificationQueueHealthy
        ? input.operations.outboxPendingCount === 0
          ? 'No Bundle notification requires delivery or manual recovery.'
          : `${input.operations.outboxPendingCount} delivery item(s) are queued or retrying normally; none require manual recovery.`
        : `${input.operations.outboxDeadLetterCount} delivery item(s) require manual recovery; ${input.operations.outboxPendingCount} are queued or retrying.`,
      true
    ),
  ];

  return {
    ...input,
    state,
    canActivateTest,
    canActivateLive,
    acceptingCheckout:
      runtimeReady && (
        (input.tenant.activationMode === 'test' && input.payment.mode === 'test') ||
        (input.tenant.activationMode === 'live' && input.payment.mode === 'live')
      ),
    checks,
    evaluatedAt: evaluatedAt.toISOString(),
  };
};

interface CapacityComponent {
  attractionId: Types.ObjectId | string;
  supplyOfferId: Types.ObjectId | string;
  dayNumber: number;
  startTime?: string;
}

interface CapacityAvailability {
  attractionId: Types.ObjectId | string;
  date: Date;
  timeSlots: Array<{ time: string; capacity: number; booked: number }>;
  allDayCapacity?: number;
  allDayBooked?: number;
  isBlocked: boolean;
}

interface CapacityOffer {
  _id: Types.ObjectId | string;
  capacityPerDeparture: number;
  validTravelFrom: Date;
  validTravelTo: Date;
  blackoutDates: Date[];
  leadTimeHours: number;
}

interface CapacityInventory {
  supplyOfferId: Types.ObjectId | string;
  date: Date;
  timeKey: string;
  capacity: number;
  reserved: number;
}

const dateKey = (value: Date): string => value.toISOString().slice(0, 10);
const shiftDateKey = (value: string, days: number): string => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
};

export const hasCompleteFutureCapacityWindow = (input: {
  components: CapacityComponent[];
  availabilities: CapacityAvailability[];
  offers: CapacityOffer[];
  inventories: CapacityInventory[];
  now: Date;
}): boolean => {
  if (input.components.length < 3 || input.components.length > 4) return false;
  const offerById = new Map(input.offers.map((offer) => [String(offer._id), offer]));
  const inventoryByKey = new Map(input.inventories.map((item) => [
    `${String(item.supplyOfferId)}:${dateKey(item.date)}:${item.timeKey}`,
    item,
  ]));
  const baseDatesByComponent = input.components.map((component) => {
    const offer = offerById.get(String(component.supplyOfferId));
    if (!offer) return new Set<string>();
    const blackouts = new Set(offer.blackoutDates.map(dateKey));
    const earliest = new Date(input.now.getTime() + offer.leadTimeHours * 60 * 60 * 1000);
    const baseDates = new Set<string>();
    for (const availability of input.availabilities) {
      if (String(availability.attractionId) !== String(component.attractionId) || availability.isBlocked) continue;
      if (availability.date < earliest || availability.date < offer.validTravelFrom || availability.date > offer.validTravelTo) continue;
      const key = dateKey(availability.date);
      if (blackouts.has(key)) continue;
      const actualCapacity = component.startTime
        ? availability.timeSlots.find((slot) => slot.time === component.startTime)
        : undefined;
      const actualAvailable = component.startTime
        ? Boolean(actualCapacity && actualCapacity.booked < actualCapacity.capacity)
        : availability.allDayCapacity !== undefined && (availability.allDayBooked || 0) < availability.allDayCapacity;
      if (!actualAvailable) continue;
      const timeKey = component.startTime || 'all-day';
      const inventory = inventoryByKey.get(`${String(component.supplyOfferId)}:${key}:${timeKey}`);
      const allocationAvailable = inventory
        ? inventory.reserved < inventory.capacity && inventory.capacity === offer.capacityPerDeparture
        : offer.capacityPerDeparture > 0;
      if (allocationAvailable) baseDates.add(shiftDateKey(key, -(component.dayNumber - 1)));
    }
    return baseDates;
  });
  if (baseDatesByComponent.some((dates) => dates.size === 0)) return false;
  return [...baseDatesByComponent[0]].some((baseDate) =>
    baseDatesByComponent.slice(1).every((dates) => dates.has(baseDate))
  );
};

const loadFutureCapacityReadyBundleCount = async (
  tenantId: Types.ObjectId,
  now: Date
): Promise<number> => {
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 366);
  const bundles = await BundleDefinition.find({ storefrontTenantId: tenantId, status: 'published' })
    .select('components')
    .lean();
  const attractionIds = bundles.flatMap((bundle) => bundle.components.map((component) => component.attractionId));
  const offerIds = bundles.flatMap((bundle) => bundle.components.map((component) => component.supplyOfferId));
  if (!attractionIds.length || !offerIds.length) return 0;
  const [availabilities, offers, inventories] = await Promise.all([
    Availability.find({
      attractionId: { $in: attractionIds },
      date: { $gte: windowStart, $lte: windowEnd },
      isBlocked: false,
    }).select('attractionId date timeSlots allDayCapacity allDayBooked isBlocked').lean(),
    BundleSupplyOffer.find({ _id: { $in: offerIds }, status: 'active' })
      .select('capacityPerDeparture validTravelFrom validTravelTo blackoutDates leadTimeHours')
      .lean(),
    BundleOfferInventory.find({
      supplyOfferId: { $in: offerIds },
      date: { $gte: windowStart, $lte: windowEnd },
    }).select('supplyOfferId date timeKey capacity reserved').lean(),
  ]);
  return bundles.filter((bundle) => hasCompleteFutureCapacityWindow({
    components: bundle.components,
    availabilities,
    offers,
    inventories,
    now,
  })).length;
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

export const loadBundleOutboxHealth = async (
  tenantId: Types.ObjectId
): Promise<{ outboxPendingCount: number; outboxDeadLetterCount: number }> => {
  const rows = await BundleOutboxEvent.aggregate<{
    outboxPendingCount: number;
    outboxDeadLetterCount: number;
  }>([
    { $match: { status: { $in: ['pending', 'processing', 'retry', 'dead_letter'] }, orderId: { $exists: true } } },
    {
      $lookup: {
        from: BundleOrder.collection.name,
        localField: 'orderId',
        foreignField: '_id',
        as: 'order',
      },
    },
    { $unwind: '$order' },
    { $match: { 'order.storefrontTenantId': tenantId } },
    {
      $group: {
        _id: null,
        outboxDeadLetterCount: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ['$status', 'dead_letter'] },
                  { $eq: ['$manualRecoveryRequired', true] },
                ],
              },
              1,
              0,
            ],
          },
        },
        outboxPendingCount: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ['$status', 'dead_letter'] },
                  { $eq: ['$manualRecoveryRequired', true] },
                ],
              },
              0,
              1,
            ],
          },
        },
      },
    },
    { $project: { _id: 0, outboxPendingCount: 1, outboxDeadLetterCount: 1 } },
  ]);
  return rows[0] || { outboxPendingCount: 0, outboxDeadLetterCount: 0 };
};

export const getBundleLaunchReadiness = async (
  tenant: ITenant,
  now = new Date()
): Promise<BundleLaunchReadiness> => {
  const tenantId = tenant._id;
  const [config, currencyPools, counts, publishedHealth, futureCapacityReadyBundleCount, recoveryQueueCount, outboxHealth] = await Promise.all([
    getTenantStripeConfig(tenantId),
    loadSupplyPools(now),
    loadBundleCounts(tenantId),
    loadPublishedHealth(tenantId, now),
    loadFutureCapacityReadyBundleCount(tenantId, now),
    BundleOrder.countDocuments({
      storefrontTenantId: tenantId,
      $or: [
        { status: { $in: ['manual_review', 'paid_allocation_pending'] } },
        {
          'recovery.required': true,
          $or: [
            { status: { $nin: ['cancelled', 'refunded', 'reservation_failed'] } },
            { 'components.settlementStatus': 'disputed' },
          ],
        },
      ],
    }),
    loadBundleOutboxHealth(tenantId),
  ]);
  const paymentMode: StripeMode = stripeCredentialMode(config);
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
      credentialsVerified: !!config?.verifiedAccountId &&
        !!config?.verifiedCredentialFingerprint &&
        !!config?.credentialsVerifiedAt,
      webhookVerified: !!config?.webhookVerifiedAt,
      webhookRotationProtectedUntil:
        isStripeWebhookRotationProtected(config, now) && config?.previousWebhookValidUntil
          ? config.previousWebhookValidUntil.toISOString()
          : undefined,
    },
    supply: { currencyPools },
    storefront: {
      counts,
      ...publishedHealth,
      futureCapacityReadyBundleCount,
    },
    operations: { recoveryQueueCount, ...outboxHealth },
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
  if (
    (fromMode === 'test' || fromMode === 'live') &&
    (input.mode === 'test' || input.mode === 'live') &&
    input.mode !== fromMode
  ) {
    const unresolvedInPreviousMode = await BundleOrder.countDocuments({
      storefrontTenantId: tenant._id,
      checkoutMode: fromMode,
      status: { $nin: ['cancelled', 'refunded', 'reservation_failed'] },
    });
    if (unresolvedInPreviousMode > 0) {
      throw new BundleLaunchModeError(
        409,
        `Resolve ${unresolvedInPreviousMode} ${fromMode.toUpperCase()} Bundle order(s) before changing payment environment`
      );
    }
  }
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
