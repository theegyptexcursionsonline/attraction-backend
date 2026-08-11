import { ClientSession, Types } from 'mongoose';
import { assertTransition, SupplyOfferStatus } from '../bundles/domain';
import { Attraction } from '../models/Attraction';
import { BundleSupplyOffer, IBundleSupplyOffer } from '../models/BundleSupplyOffer';
import { appendBundleEvent, BundleActor } from './bundleAudit.service';
import { runBundleTransaction } from './bundleInventory.service';

export class BundleSupplyOfferError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400) {
    super(message);
  }
}

export interface SupplyOfferInput {
  supplierTenantId: string;
  attractionId: string;
  currency: string;
  supplierNetPricesMinor: { adult: number; child: number; infant: number };
  optionIds: string[];
  entryWindowLabels: string[];
  capacityPerDeparture: number;
  validTravelFrom: string;
  validTravelTo: string;
  salesStartsAt?: string;
  salesEndsAt?: string;
  blackoutDates: string[];
  leadTimeHours: number;
  cancellationPolicy: string;
  termsVersion: string;
}

export const validateOfferCommercialRules = (input: SupplyOfferInput): void => {
  const prices = Object.values(input.supplierNetPricesMinor);
  if (
    prices.some((price) => !Number.isSafeInteger(price) || price < 0) ||
    prices.reduce((sum, price) => sum + price, 0) <= 0
  ) {
    throw new BundleSupplyOfferError(
      'INVALID_SUPPLIER_PRICES',
      'Supplier prices must use non-negative integer minor units with at least one paid guest category'
    );
  }
  const travelFrom = new Date(input.validTravelFrom);
  const travelTo = new Date(input.validTravelTo);
  if (!Number.isFinite(travelFrom.getTime()) || !Number.isFinite(travelTo.getTime()) || travelFrom >= travelTo) {
    throw new BundleSupplyOfferError('INVALID_TRAVEL_WINDOW', 'Travel end must follow travel start');
  }
  if (input.salesStartsAt && input.salesEndsAt) {
    const salesStartsAt = new Date(input.salesStartsAt);
    const salesEndsAt = new Date(input.salesEndsAt);
    if (
      !Number.isFinite(salesStartsAt.getTime()) ||
      !Number.isFinite(salesEndsAt.getTime()) ||
      salesStartsAt >= salesEndsAt
    ) {
      throw new BundleSupplyOfferError('INVALID_SALES_WINDOW', 'Sales end must follow sales start');
    }
  }
  for (const blackoutDate of input.blackoutDates) {
    const blackout = new Date(blackoutDate);
    if (!Number.isFinite(blackout.getTime()) || blackout < travelFrom || blackout > travelTo) {
      throw new BundleSupplyOfferError(
        'INVALID_BLACKOUT_DATE',
        'Every blackout date must fall inside the travel window'
      );
    }
  }
};

const validateOfferAttraction = async (input: SupplyOfferInput): Promise<void> => {
  const attraction = await Attraction.findOne({
    _id: input.attractionId,
    ownerTenantId: input.supplierTenantId,
    tenantIds: { $in: [input.supplierTenantId] },
    status: 'active',
    instantConfirmation: true,
  }).lean();
  if (!attraction) {
    throw new BundleSupplyOfferError(
      'ATTRACTION_NOT_ELIGIBLE',
      'Only an active, instant-confirmation attraction owned by this supplier can be offered',
      404
    );
  }
  if (attraction.currency.toUpperCase() !== input.currency.toUpperCase()) {
    throw new BundleSupplyOfferError('CURRENCY_MISMATCH', 'Offer and attraction currencies must match');
  }
  const validOptions = new Set(attraction.pricingOptions.map((option) => option.id));
  if (input.optionIds.some((optionId) => !validOptions.has(optionId))) {
    throw new BundleSupplyOfferError('INVALID_OPTION', 'One or more attraction options are invalid');
  }
  const validWindows = new Set((attraction.entryWindows || []).map((window) => window.label));
  if (input.entryWindowLabels.some((label) => !validWindows.has(label))) {
    throw new BundleSupplyOfferError('INVALID_ENTRY_WINDOW', 'One or more entry windows are invalid');
  }
};

const eventTenant = (offer: IBundleSupplyOffer): Types.ObjectId => offer.supplierTenantId;

export const createBundleSupplyOffer = async (
  input: SupplyOfferInput,
  actor: BundleActor & { actorId: Types.ObjectId }
): Promise<IBundleSupplyOffer> => {
  validateOfferCommercialRules(input);
  await validateOfferAttraction(input);
  return runBundleTransaction(async (session) => {
    const latest = await BundleSupplyOffer.findOne({
      supplierTenantId: input.supplierTenantId,
      attractionId: input.attractionId,
    }).sort({ version: -1 }).session(session);
    if (latest && !['archived', 'rejected'].includes(latest.status)) {
      throw new BundleSupplyOfferError(
        'OPEN_OFFER_EXISTS',
        'Archive or finish the current offer before creating a new version',
        409
      );
    }
    const [offer] = await BundleSupplyOffer.create(
      [{
        ...input,
        validTravelFrom: new Date(input.validTravelFrom),
        validTravelTo: new Date(input.validTravelTo),
        salesStartsAt: input.salesStartsAt ? new Date(input.salesStartsAt) : undefined,
        salesEndsAt: input.salesEndsAt ? new Date(input.salesEndsAt) : undefined,
        blackoutDates: input.blackoutDates.map((date) => new Date(date)),
        version: (latest?.version || 0) + 1,
        previousVersionId: latest?._id,
        status: 'draft',
        createdBy: actor.actorId,
        updatedBy: actor.actorId,
      }],
      { session }
    );
    await appendBundleEvent({
      aggregateType: 'supply_offer',
      aggregateId: offer._id,
      supplierTenantId: eventTenant(offer),
      ...actor,
      command: 'create',
      toState: 'draft',
      metadata: { version: offer.version, attractionId: offer.attractionId.toString() },
    }, session);
    return offer;
  });
};

export const reviseBundleSupplyOffer = async (
  offerId: string,
  patch: Partial<Omit<SupplyOfferInput, 'supplierTenantId' | 'attractionId'>>,
  expectedRevision: number,
  actor: BundleActor & { actorId: Types.ObjectId },
  supplierTenantId?: string
): Promise<IBundleSupplyOffer> => runBundleTransaction(async (session) => {
  const scope = supplierTenantId ? { supplierTenantId } : {};
  const current = await BundleSupplyOffer.findOne({ _id: offerId, ...scope }).session(session);
  if (!current) throw new BundleSupplyOfferError('OFFER_NOT_FOUND', 'Supply offer not found', 404);
  if (!['draft', 'rejected'].includes(current.status)) {
    throw new BundleSupplyOfferError('OFFER_NOT_EDITABLE', 'Only draft or rejected offers can be revised', 409);
  }
  if (current.get('revision') !== expectedRevision) {
    throw new BundleSupplyOfferError('REVISION_CONFLICT', 'The offer changed; refresh and try again', 409);
  }
  const nextInput: SupplyOfferInput = {
    supplierTenantId: current.supplierTenantId.toString(),
    attractionId: current.attractionId.toString(),
    currency: patch.currency ?? current.currency,
    supplierNetPricesMinor: patch.supplierNetPricesMinor ?? current.supplierNetPricesMinor,
    optionIds: patch.optionIds ?? current.optionIds,
    entryWindowLabels: patch.entryWindowLabels ?? current.entryWindowLabels,
    capacityPerDeparture: patch.capacityPerDeparture ?? current.capacityPerDeparture,
    validTravelFrom: patch.validTravelFrom ?? current.validTravelFrom.toISOString(),
    validTravelTo: patch.validTravelTo ?? current.validTravelTo.toISOString(),
    salesStartsAt: patch.salesStartsAt ?? current.salesStartsAt?.toISOString(),
    salesEndsAt: patch.salesEndsAt ?? current.salesEndsAt?.toISOString(),
    blackoutDates: patch.blackoutDates ?? current.blackoutDates.map((date) => date.toISOString()),
    leadTimeHours: patch.leadTimeHours ?? current.leadTimeHours,
    cancellationPolicy: patch.cancellationPolicy ?? current.cancellationPolicy,
    termsVersion: patch.termsVersion ?? current.termsVersion,
  };
  validateOfferCommercialRules(nextInput);
  await validateOfferAttraction(nextInput);
  const fromState = current.status;
  current.status = 'archived';
  current.updatedBy = actor.actorId;
  await current.save({ session });
  const [next] = await BundleSupplyOffer.create(
    [{
      ...nextInput,
      validTravelFrom: new Date(nextInput.validTravelFrom),
      validTravelTo: new Date(nextInput.validTravelTo),
      salesStartsAt: nextInput.salesStartsAt ? new Date(nextInput.salesStartsAt) : undefined,
      salesEndsAt: nextInput.salesEndsAt ? new Date(nextInput.salesEndsAt) : undefined,
      blackoutDates: nextInput.blackoutDates.map((date) => new Date(date)),
      version: current.version + 1,
      previousVersionId: current._id,
      status: 'draft',
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    }],
    { session }
  );
  await appendBundleEvent({
    aggregateType: 'supply_offer',
    aggregateId: next._id,
    supplierTenantId: next.supplierTenantId,
    ...actor,
    command: 'revise',
    fromState,
    toState: 'draft',
    metadata: { version: next.version, previousVersionId: current._id.toString() },
  }, session);
  return next;
});

export const transitionBundleSupplyOffer = async (
  offerId: string,
  toStatus: SupplyOfferStatus,
  actor: BundleActor & { actorId: Types.ObjectId },
  options: { supplierTenantId?: string; reason?: string; expectedRevision: number }
): Promise<IBundleSupplyOffer> => runBundleTransaction(async (session) => {
  const filter = options.supplierTenantId
    ? { _id: offerId, supplierTenantId: options.supplierTenantId }
    : { _id: offerId };
  const offer = await BundleSupplyOffer.findOne(filter).session(session);
  if (!offer) throw new BundleSupplyOfferError('OFFER_NOT_FOUND', 'Supply offer not found', 404);
  if (offer.get('revision') !== options.expectedRevision) {
    throw new BundleSupplyOfferError('REVISION_CONFLICT', 'The offer changed; refresh and try again', 409);
  }
  assertTransition('supply-offer', offer.status, toStatus);
  const fromState = offer.status;
  offer.status = toStatus;
  offer.updatedBy = actor.actorId;
  if (toStatus === 'submitted') offer.submittedAt = new Date();
  if (toStatus === 'approved') {
    offer.approvedAt = new Date();
    offer.approvedBy = actor.actorId;
  }
  if (toStatus === 'rejected') offer.rejectionReason = options.reason;
  if (toStatus === 'paused') offer.pausedReason = options.reason;
  await offer.save({ session });
  await appendBundleEvent({
    aggregateType: 'supply_offer',
    aggregateId: offer._id,
    supplierTenantId: offer.supplierTenantId,
    ...actor,
    command: `transition.${toStatus}`,
    fromState,
    toState: toStatus,
    reason: options.reason,
    metadata: { version: offer.version },
  }, session);
  return offer;
});
