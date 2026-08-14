/**
 * Seed one reversible Makadi TEST catalogue without activating checkout.
 *
 * Dry run:
 *   railway run npx ts-node src/scripts/seed-makadi-bundle-test.ts
 * Apply:
 *   railway run npx ts-node src/scripts/seed-makadi-bundle-test.ts --apply
 * Remove only unused capacity rows owned by this TEST seed:
 *   railway run npx ts-node src/scripts/seed-makadi-bundle-test.ts --cleanup-capacity
 */
import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import {
  buildMakadiTestSeedManifest,
  MAKADI_TEST_BUNDLE_SLUG,
  MAKADI_TEST_TERMS_VERSION,
  pendingBundleSeedTransitions,
  pendingOfferSeedTransitions,
} from '../bundles/makadiTestSeed';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { BundleDefinition, IBundleDefinition } from '../models/BundleDefinition';
import { BundleOrder } from '../models/BundleOrder';
import { BundleSupplyOffer, IBundleSupplyOffer } from '../models/BundleSupplyOffer';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { appendBundleEvent } from '../services/bundleAudit.service';
import {
  createBundleDefinition,
  transitionBundleDefinition,
} from '../services/bundleCatalog.service';
import { getBundleLaunchReadiness } from '../services/bundleLaunchReadiness.service';
import { runBundleTransaction } from '../services/bundleInventory.service';
import {
  createBundleSupplyOffer,
  transitionBundleSupplyOffer,
} from '../services/bundleSupplyOffer.service';

const apply = process.argv.includes('--apply');
const cleanupCapacity = process.argv.includes('--cleanup-capacity');
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error('MONGODB_URI is required');
}

const revision = (document: { get(path: string): unknown }): number =>
  Number(document.get('revision') || 0);

const capacitySeedKey = (componentId: string): string =>
  `bundle-test:${MAKADI_TEST_TERMS_VERSION}:${componentId}`;

const seedTestCapacity = async (
  offers: ReturnType<typeof buildMakadiTestSeedManifest>['offers'],
  attractionBySlug: Map<string, InstanceType<typeof Attraction>>
): Promise<Array<{ seedKey: string; date: Date }>> => {
  const seeded: Array<{ seedKey: string; date: Date }> = [];
  for (const [index, offer] of offers.entries()) {
    const attraction = attractionBySlug.get(offer.attractionSlug);
    if (!attraction) throw new Error(`TEST capacity attraction missing for ${offer.attractionSlug}`);
    const seedKey = capacitySeedKey(`test-day-${index + 1}`);
    const date = new Date(offer.capacityDate);
    const existing = await Availability.findOne({ attractionId: attraction._id, date });
    if (existing) {
      const slot = existing.timeSlots.find((item) => item.time === offer.startTime);
      if (
        existing.seedKey !== seedKey ||
        existing.isBlocked ||
        !slot ||
        slot.capacity !== 8
      ) {
        throw new Error(`Existing non-seed capacity blocks ${offer.attractionSlug} on ${offer.capacityDate}`);
      }
      seeded.push({ seedKey, date });
      continue;
    }
    await Availability.create({
      attractionId: attraction._id,
      date,
      timeSlots: [{ time: offer.startTime, capacity: 8, booked: 0 }],
      isBlocked: false,
      seedKey,
    });
    seeded.push({ seedKey, date });
  }
  return seeded;
};

const removeTestCapacity = async (): Promise<number> => {
  const seedKeys = [1, 2, 3].map((day) => capacitySeedKey(`test-day-${day}`));
  const unsafe = await Availability.findOne({
    seedKey: { $in: seedKeys },
    $or: [
      { 'timeSlots.booked': { $gt: 0 } },
      { allDayBooked: { $gt: 0 } },
    ],
  }).select('_id seedKey');
  if (unsafe) throw new Error(`TEST capacity ${unsafe.seedKey} still has booked inventory`);
  const result = await Availability.deleteMany({ seedKey: { $in: seedKeys } });
  return result.deletedCount;
};

const activateOffer = async (
  offer: IBundleSupplyOffer,
  actorId: Types.ObjectId
): Promise<IBundleSupplyOffer> => {
  let current = offer;
  for (const status of pendingOfferSeedTransitions(current.status)) {
    current = await transitionBundleSupplyOffer(
      current._id.toString(),
      status,
      { actorType: 'user', actorId },
      { expectedRevision: revision(current), reason: 'Authorized Makadi TEST catalogue seed' }
    );
  }
  return current;
};

const publishBundle = async (
  bundle: IBundleDefinition,
  actorId: Types.ObjectId
): Promise<IBundleDefinition> => {
  let current = bundle;
  for (const status of pendingBundleSeedTransitions(current.status)) {
    current = await transitionBundleDefinition(
      current._id.toString(),
      status,
      { actorType: 'user', actorId },
      'Authorized Makadi TEST catalogue seed',
      revision(current)
    );
  }
  return current;
};

const clearVerifiedTerminalRecovery = async (
  storefrontTenantId: Types.ObjectId,
  actorId: Types.ObjectId
): Promise<number> => {
  const candidates = await BundleOrder.find({
    storefrontTenantId,
    status: 'refunded',
    paymentStatus: 'refunded',
    'recovery.required': true,
  });
  let cleared = 0;
  for (const candidate of candidates) {
    if (
      candidate.refundedMinor !== candidate.totalMinor ||
      candidate.refundPendingMinor !== 0 ||
      candidate.components.some((component) => component.status !== 'refunded')
    ) {
      throw new Error(`Terminal recovery invariant failed for order ${candidate._id}`);
    }
    const unsafeChildCount = await Booking.countDocuments({
      bundleOrderId: candidate._id,
      $or: [
        { status: { $ne: 'cancelled' } },
        { paymentStatus: { $ne: 'refunded' } },
        { inventoryReleasedAt: { $exists: false } },
      ],
    });
    if (unsafeChildCount > 0) {
      throw new Error(`Child booking recovery is incomplete for order ${candidate._id}`);
    }
    const wasCleared = await runBundleTransaction(async (session) => {
      const current = await BundleOrder.findOne({
        _id: candidate._id,
        storefrontTenantId,
        status: 'refunded',
        paymentStatus: 'refunded',
        refundedMinor: candidate.totalMinor,
        refundPendingMinor: 0,
        'recovery.required': true,
      }).session(session);
      if (!current) return false;
      current.recovery.required = false;
      current.recovery.reason = undefined;
      await current.save({ session });
      await appendBundleEvent({
        aggregateType: 'order',
        aggregateId: current._id,
        storefrontTenantId,
        actorType: 'user',
        actorId,
        command: 'recovery.terminal_reconciled',
        fromState: 'refunded',
        toState: 'refunded',
        reason: 'Verified full refund and released child inventory',
        metadata: { seededCatalogue: MAKADI_TEST_TERMS_VERSION },
      }, session);
      return true;
    });
    if (wasCleared) cleared += 1;
  }
  return cleared;
};

const run = async (): Promise<void> => {
  const manifest = buildMakadiTestSeedManifest();
  await mongoose.connect(mongoUri);
  const tenantSlugs = [...new Set([
    manifest.storefrontTenantSlug,
    ...manifest.offers.map((offer) => offer.supplierTenantSlug),
  ])];
  const tenants = await Tenant.find({ slug: { $in: tenantSlugs }, status: 'active' });
  if (tenants.length !== tenantSlugs.length) {
    throw new Error('Every TEST seed tenant must exist and be active');
  }
  const tenantBySlug = new Map(tenants.map((tenant) => [tenant.slug, tenant]));
  const storefront = tenantBySlug.get(manifest.storefrontTenantSlug)!;
  const priorControlledSeed = await BundleDefinition.findOne({
    storefrontTenantId: storefront._id,
    slug: 'qa-bundle-to-win-live',
    status: 'retired',
  }).sort({ version: -1 }).select('createdBy');
  const actor = priorControlledSeed?.createdBy
    ? await User.findOne({
      _id: priorControlledSeed.createdBy,
      role: 'super-admin',
      status: 'active',
    })
    : null;
  if (!actor) throw new Error('An active super-admin actor is required for audited seeding');

  const attractions = await Attraction.find({
    slug: { $in: manifest.offers.map((offer) => offer.attractionSlug) },
    status: 'active',
    instantConfirmation: true,
  });
  if (attractions.length !== manifest.offers.length) {
    throw new Error('Every TEST seed attraction must exist, be active and instant-confirmation');
  }
  const attractionBySlug = new Map(attractions.map((attraction) => [attraction.slug, attraction]));
  for (const offer of manifest.offers) {
    const tenant = tenantBySlug.get(offer.supplierTenantSlug)!;
    const attraction = attractionBySlug.get(offer.attractionSlug)!;
    if (
      String(attraction.ownerTenantId) !== String(tenant._id) ||
      !attraction.tenantIds.some((tenantId) => String(tenantId) === String(tenant._id))
    ) {
      throw new Error(`Supplier ownership mismatch for ${offer.attractionSlug}`);
    }
  }

  const existingOffers = await BundleSupplyOffer.find({
    attractionId: { $in: attractions.map((attraction) => attraction._id) },
    status: { $nin: ['archived', 'rejected'] },
  });
  const foreignOpenOffer = existingOffers.find(
    (offer) => offer.termsVersion !== MAKADI_TEST_TERMS_VERSION
  );
  if (foreignOpenOffer) {
    throw new Error(`Existing non-seed offer blocks attraction ${foreignOpenOffer.attractionId}`);
  }
  const existingBundle = await BundleDefinition.findOne({
    storefrontTenantId: storefront._id,
    slug: MAKADI_TEST_BUNDLE_SLUG,
    status: { $ne: 'retired' },
  });

  console.log(JSON.stringify({
    mode: cleanupCapacity ? 'cleanup-capacity' : apply ? 'apply' : 'dry-run',
    storefront: manifest.storefrontTenantSlug,
    suppliers: manifest.offers.map((offer) => offer.supplierTenantSlug),
    attractions: manifest.offers.map((offer) => offer.attractionSlug),
    existingSeedOffers: existingOffers.length,
    existingSeedBundle: existingBundle?.status || null,
    activationMode: storefront.bundleSettings?.mode || 'discovery',
  }, null, 2));
  if (cleanupCapacity) {
    const removedCapacity = await removeTestCapacity();
    console.log(JSON.stringify({ cleaned: true, removedCapacity }, null, 2));
    return;
  }
  if (!apply) return;

  const seededCapacity = await seedTestCapacity(manifest.offers, attractionBySlug);

  const activeOffers: IBundleSupplyOffer[] = [];
  for (const offerPlan of manifest.offers) {
    const supplier = tenantBySlug.get(offerPlan.supplierTenantSlug)!;
    const attraction = attractionBySlug.get(offerPlan.attractionSlug)!;
    let offer = existingOffers.find(
      (candidate) => String(candidate.attractionId) === String(attraction._id)
    ) as unknown as IBundleSupplyOffer | undefined;
    if (!offer) {
      offer = await createBundleSupplyOffer({
        supplierTenantId: supplier._id.toString(),
        attractionId: attraction._id.toString(),
        currency: manifest.bundle.currency,
        supplierNetPricesMinor: offerPlan.supplierNetPricesMinor,
        optionIds: offerPlan.optionIds,
        entryWindowLabels: offerPlan.entryWindowLabels,
        capacityPerDeparture: 8,
        validTravelFrom: manifest.offerWindow.travelFrom,
        validTravelTo: manifest.offerWindow.travelTo,
        blackoutDates: [],
        leadTimeHours: 0,
        cancellationPolicy: 'TEST catalogue only; no live supplier commitment.',
        termsVersion: manifest.termsVersion,
      }, { actorType: 'user', actorId: actor._id });
    }
    activeOffers.push(await activateOffer(offer, actor._id));
  }

  let bundle = existingBundle as unknown as IBundleDefinition | null;
  if (!bundle) {
    bundle = await createBundleDefinition({
      storefrontTenantId: storefront._id.toString(),
      slug: manifest.bundleSlug,
      title: manifest.bundle.title,
      shortDescription: manifest.bundle.shortDescription,
      description: manifest.bundle.description,
      images: manifest.offers.map(
        (offer) => attractionBySlug.get(offer.attractionSlug)!.images[0]
      ).filter(Boolean),
      area: manifest.bundle.area,
      category: manifest.bundle.category,
      currency: manifest.bundle.currency,
      customerPricesMinor: manifest.bundle.customerPricesMinor,
      platformFeeReserveMinor: manifest.bundle.platformFeeReserveMinor,
      taxReserveMinor: manifest.bundle.taxReserveMinor,
      components: activeOffers.map((offer, index) => ({
        componentId: `test-day-${index + 1}`,
        supplyOfferId: offer._id.toString(),
        dayNumber: manifest.offers[index].dayNumber,
        startTime: manifest.offers[index].startTime,
        sortOrder: index,
      })),
      policies: manifest.bundle.policies,
    }, { actorType: 'user', actorId: actor._id });
  }
  if (!bundle) throw new Error('Makadi TEST bundle could not be created');
  const publishedBundle = await publishBundle(bundle, actor._id);
  const clearedRecoveryItems = await clearVerifiedTerminalRecovery(storefront._id, actor._id);
  const readiness = await getBundleLaunchReadiness(storefront);
  console.log(JSON.stringify({
    applied: true,
    offers: activeOffers.map((offer) => ({ id: offer._id, version: offer.version, status: offer.status })),
    bundle: {
      id: publishedBundle._id,
      version: publishedBundle.version,
      status: publishedBundle.status,
      slug: publishedBundle.slug,
    },
    clearedRecoveryItems,
    seededCapacity,
    readiness: {
      state: readiness.state,
      canActivateTest: readiness.canActivateTest,
      activationMode: readiness.tenant.activationMode,
      acceptingCheckout: readiness.acceptingCheckout,
      supply: readiness.supply,
      storefront: readiness.storefront,
      recoveryQueueCount: readiness.operations.recoveryQueueCount,
    },
  }, null, 2));
};

run()
  .catch((error: Error) => {
    console.error(`Makadi TEST seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
  });
