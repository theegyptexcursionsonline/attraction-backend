import { ClientSession, Types } from 'mongoose';
import { assertTransition, BundleStatus } from '../bundles/domain';
import { assertBundleEconomics } from '../bundles/money';
import { Attraction } from '../models/Attraction';
import {
  BundleDefinition,
  IBundleComponentSnapshot,
  IBundleDefinition,
} from '../models/BundleDefinition';
import { BundleSupplyOffer } from '../models/BundleSupplyOffer';
import { appendBundleEvent, BundleActor } from './bundleAudit.service';
import { runBundleTransaction } from './bundleInventory.service';

export class BundleCatalogError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400) {
    super(message);
  }
}

export interface BundleComponentInput {
  componentId: string;
  supplyOfferId: string;
  dayNumber: number;
  startTime?: string;
  sortOrder: number;
}

export interface BundleDefinitionInput {
  storefrontTenantId: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  images: string[];
  area: string;
  category: string;
  currency: string;
  customerPricesMinor: { adult: number; child: number; infant: number };
  platformFeeReserveMinor: number;
  taxReserveMinor: number;
  components: BundleComponentInput[];
  policies: {
    cancellation: string;
    refund: string;
    substitution: string;
    promoStacking: false;
  };
}

const hydrateComponents = async (
  components: BundleComponentInput[],
  currency: string,
  session?: ClientSession
): Promise<IBundleComponentSnapshot[]> => {
  if (new Set(components.map((item) => item.componentId)).size !== components.length) {
    throw new BundleCatalogError('DUPLICATE_COMPONENT', 'Every component identifier must be unique');
  }
  if (new Set(components.map((item) => item.sortOrder)).size !== components.length) {
    throw new BundleCatalogError('DUPLICATE_SORT_ORDER', 'Every component requires a unique itinerary position');
  }
  const offerIds = components.map((component) => component.supplyOfferId);
  if (new Set(offerIds).size !== offerIds.length) {
    throw new BundleCatalogError('DUPLICATE_SUPPLY_OFFER', 'A supplier offer can appear only once');
  }
  const offers = await BundleSupplyOffer.find({
    _id: { $in: offerIds },
    status: 'active',
  }).session(session || null).lean();
  if (offers.length !== offerIds.length) {
    throw new BundleCatalogError('SUPPLY_OFFER_NOT_ACTIVE', 'Every component requires an active supply offer');
  }
  const offerById = new Map(offers.map((offer) => [offer._id.toString(), offer]));
  if (offers.some((offer) => offer.currency !== currency.toUpperCase())) {
    throw new BundleCatalogError('CURRENCY_MISMATCH', 'All supply offers must use the bundle currency');
  }
  if (new Set(offers.map((offer) => offer.supplierTenantId.toString())).size < 2) {
    throw new BundleCatalogError('MULTI_SUPPLIER_REQUIRED', 'A bundle must include at least two suppliers');
  }
  if (new Set(offers.map((offer) => offer.attractionId.toString())).size !== offers.length) {
    throw new BundleCatalogError('UNIQUE_ATTRACTIONS_REQUIRED', 'Each component must use a different attraction');
  }
  const attractions = await Attraction.find({
    _id: { $in: offers.map((offer) => offer.attractionId) },
    status: 'active',
    instantConfirmation: true,
  }).select('title ownerTenantId').session(session || null).lean();
  if (attractions.length !== offers.length) {
    throw new BundleCatalogError('ATTRACTION_NOT_ELIGIBLE', 'Every attraction must be active and instant-confirmation');
  }
  const attractionById = new Map(attractions.map((item) => [item._id.toString(), item]));
  const snapshots = components.map((component) => {
    const offer = offerById.get(component.supplyOfferId)!;
    const attraction = attractionById.get(offer.attractionId.toString())!;
    if (String(attraction.ownerTenantId) !== String(offer.supplierTenantId)) {
      throw new BundleCatalogError('SUPPLIER_OWNERSHIP_MISMATCH', 'Supplier ownership changed for an attraction');
    }
    return {
      componentId: component.componentId,
      supplyOfferId: offer._id,
      supplyOfferVersion: offer.version,
      supplierTenantId: offer.supplierTenantId,
      attractionId: offer.attractionId,
      attractionTitle: attraction.title,
      supplierNetPricesMinor: offer.supplierNetPricesMinor,
      optionIds: offer.optionIds,
      entryWindowLabels: offer.entryWindowLabels,
      dayNumber: component.dayNumber,
      startTime: component.startTime,
      sortOrder: component.sortOrder,
    };
  });
  return snapshots.sort((a, b) => a.sortOrder - b.sortOrder);
};

const validateEconomics = (
  customerPricesMinor: BundleDefinitionInput['customerPricesMinor'],
  components: IBundleComponentSnapshot[],
  platformFeeReserveMinor: number,
  taxReserveMinor: number
): void => {
  assertBundleEconomics({
    customerPricesMinor,
    supplierPriceSetsMinor: components.map((component) => component.supplierNetPricesMinor),
    fixedObligationsMinor: platformFeeReserveMinor + taxReserveMinor,
  });
};

export const createBundleDefinition = async (
  input: BundleDefinitionInput,
  actor: BundleActor & { actorId: Types.ObjectId }
): Promise<IBundleDefinition> => runBundleTransaction(async (session) => {
  const components = await hydrateComponents(input.components, input.currency, session);
  validateEconomics(
    input.customerPricesMinor,
    components,
    input.platformFeeReserveMinor,
    input.taxReserveMinor
  );
  const latest = await BundleDefinition.findOne({
    storefrontTenantId: input.storefrontTenantId,
    slug: input.slug,
  }).sort({ version: -1 }).session(session);
  if (latest && latest.status !== 'retired') {
    throw new BundleCatalogError('OPEN_BUNDLE_VERSION_EXISTS', 'Retire the existing bundle before creating a new version', 409);
  }
  const [bundle] = await BundleDefinition.create([{
      ...input,
      components,
      version: (latest?.version || 0) + 1,
      previousVersionId: latest?._id,
      status: 'draft',
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    }], { session });
  await appendBundleEvent({
    aggregateType: 'bundle',
    aggregateId: bundle._id,
    storefrontTenantId: bundle.storefrontTenantId,
    ...actor,
    command: 'create',
    toState: 'draft',
    metadata: { slug: bundle.slug, version: bundle.version },
  }, session);
  return bundle;
});

export const updateDraftBundleDefinition = async (
  bundleId: string,
  storefrontTenantId: string,
  patch: Partial<Omit<BundleDefinitionInput, 'storefrontTenantId' | 'slug' | 'components'>>,
  expectedRevision: number,
  actor: BundleActor & { actorId: Types.ObjectId }
): Promise<IBundleDefinition> => runBundleTransaction(async (session) => {
  const bundle = await BundleDefinition.findOne({
    _id: bundleId,
    storefrontTenantId,
  }).session(session);
  if (!bundle) throw new BundleCatalogError('BUNDLE_NOT_FOUND', 'Bundle not found', 404);
  if (bundle.status !== 'draft') {
    throw new BundleCatalogError('BUNDLE_NOT_EDITABLE', 'Only draft bundles can be edited', 409);
  }
  if (bundle.get('revision') !== expectedRevision) {
    throw new BundleCatalogError('REVISION_CONFLICT', 'The bundle changed; refresh and try again', 409);
  }
  Object.assign(bundle, patch, { updatedBy: actor.actorId });
  validateEconomics(
    bundle.customerPricesMinor,
    bundle.components,
    bundle.platformFeeReserveMinor,
    bundle.taxReserveMinor
  );
  await bundle.save({ session });
  await appendBundleEvent({
    aggregateType: 'bundle',
    aggregateId: bundle._id,
    storefrontTenantId: bundle.storefrontTenantId,
    ...actor,
    command: 'update_draft',
    fromState: 'draft',
    toState: 'draft',
    metadata: { version: bundle.version },
  }, session);
  return bundle;
});

export const replaceDraftBundleComponents = async (
  bundleId: string,
  storefrontTenantId: string,
  componentsInput: BundleComponentInput[],
  expectedRevision: number,
  actor: BundleActor & { actorId: Types.ObjectId }
): Promise<IBundleDefinition> => runBundleTransaction(async (session) => {
  const bundle = await BundleDefinition.findOne({
    _id: bundleId,
    storefrontTenantId,
  }).session(session);
  if (!bundle) throw new BundleCatalogError('BUNDLE_NOT_FOUND', 'Bundle not found', 404);
  if (bundle.status !== 'draft') {
    throw new BundleCatalogError('BUNDLE_NOT_EDITABLE', 'Only draft bundles can be edited', 409);
  }
  if (bundle.get('revision') !== expectedRevision) {
    throw new BundleCatalogError('REVISION_CONFLICT', 'The bundle changed; refresh and try again', 409);
  }
  bundle.components = await hydrateComponents(componentsInput, bundle.currency, session);
  validateEconomics(
    bundle.customerPricesMinor,
    bundle.components,
    bundle.platformFeeReserveMinor,
    bundle.taxReserveMinor
  );
  bundle.updatedBy = actor.actorId;
  await bundle.save({ session });
  await appendBundleEvent({
    aggregateType: 'bundle',
    aggregateId: bundle._id,
    storefrontTenantId: bundle.storefrontTenantId,
    ...actor,
    command: 'replace_components',
    fromState: 'draft',
    toState: 'draft',
    metadata: { componentCount: bundle.components.length },
  }, session);
  return bundle;
});

export const transitionBundleDefinition = async (
  bundleId: string,
  toStatus: BundleStatus,
  actor: BundleActor & { actorId: Types.ObjectId },
  reason: string | undefined,
  expectedRevision: number,
  storefrontTenantId: string
): Promise<IBundleDefinition> => runBundleTransaction(async (session) => {
  const bundle = await BundleDefinition.findOne({
    _id: bundleId,
    storefrontTenantId,
  }).session(session);
  if (!bundle) throw new BundleCatalogError('BUNDLE_NOT_FOUND', 'Bundle not found', 404);
  if (bundle.get('revision') !== expectedRevision) {
    throw new BundleCatalogError('REVISION_CONFLICT', 'The bundle changed; refresh and try again', 409);
  }
  assertTransition('bundle', bundle.status, toStatus);
  if (['in_review', 'approved', 'published'].includes(toStatus)) {
    const components = await hydrateComponents(
      bundle.components.map((item) => ({
        componentId: item.componentId,
        supplyOfferId: item.supplyOfferId.toString(),
        dayNumber: item.dayNumber,
        startTime: item.startTime,
        sortOrder: item.sortOrder,
      })),
      bundle.currency,
      session
    );
    validateEconomics(
      bundle.customerPricesMinor,
      components,
      bundle.platformFeeReserveMinor,
      bundle.taxReserveMinor
    );
  }
  const fromState = bundle.status;
  bundle.status = toStatus;
  bundle.updatedBy = actor.actorId;
  if (toStatus === 'approved') {
    bundle.approvedAt = new Date();
    bundle.approvedBy = actor.actorId;
  }
  if (toStatus === 'published') bundle.publishedAt = new Date();
  if (toStatus === 'suspended') {
    bundle.suspendedAt = new Date();
    bundle.suspensionReason = reason;
  }
  await bundle.save({ session });
  await appendBundleEvent({
    aggregateType: 'bundle',
    aggregateId: bundle._id,
    storefrontTenantId: bundle.storefrontTenantId,
    ...actor,
    command: `transition.${toStatus}`,
    fromState,
    toState: toStatus,
    reason,
    metadata: { version: bundle.version },
  }, session);
  return bundle;
});
