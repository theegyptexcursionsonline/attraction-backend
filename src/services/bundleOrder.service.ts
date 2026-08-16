import { ClientSession, Types } from 'mongoose';
import { bundleFingerprint, bundleReference } from '../bundles/hash';
import {
  allocateProportionally,
  priceForGuests,
  totalGuests,
  GuestQuantities,
} from '../bundles/money';
import { Attraction } from '../models/Attraction';
import { Booking } from '../models/Booking';
import { BundleDefinition, IBundleDefinition } from '../models/BundleDefinition';
import { BundleIdempotency } from '../models/BundleIdempotency';
import { BundleOrder, IBundleOrder, IBundleOrderComponent } from '../models/BundleOrder';
import { BundleQuote, IBundleQuote } from '../models/BundleQuote';
import { BundleSupplyOffer } from '../models/BundleSupplyOffer';
import { generateBookingReference } from '../utils/hash';
import { appendBundleEvent, enqueueBundleOutbox } from './bundleAudit.service';
import {
  BundleIdempotencyError,
  claimBundleIdempotency,
  failBundleIdempotency,
} from './bundleIdempotency.service';
import {
  assertBundleInventoryAvailable,
  BundleInventoryError,
  reserveBundleInventory,
  runBundleTransaction,
} from './bundleInventory.service';
import { assertTenantIdsBookingCreationAllowed } from './tenantBookingPolicy.service';

export class BundleOrderError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400) {
    super(message);
  }
}

export interface BundleQuoteRequest {
  quantities: GuestQuantities;
  selections: Array<{
    componentId: string;
    optionId: string;
    date: string;
    time?: string;
  }>;
}

export interface BundleGuestDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
  specialRequests?: string;
}

const travelInstant = (date: string, time?: string): Date =>
  new Date(`${date}T${time || '00:00'}:00.000Z`);

const dateKey = (value: Date): string => value.toISOString().slice(0, 10);

export const assertOfferTravelRules = (
  offer: {
    validTravelFrom: Date;
    validTravelTo: Date;
    salesStartsAt?: Date;
    salesEndsAt?: Date;
    blackoutDates: Date[];
    leadTimeHours: number;
    entryWindowLabels?: string[];
  },
  date: string,
  time?: string,
  entryWindows: Array<{ label: string; startTime: string; endTime: string }> = []
): void => {
  const now = new Date();
  const travel = travelInstant(date, time);
  if (travel < offer.validTravelFrom || travel > offer.validTravelTo) {
    throw new BundleOrderError('TRAVEL_DATE_OUTSIDE_OFFER', 'A selected date is outside the supplier offer');
  }
  if (offer.salesStartsAt && now < offer.salesStartsAt) {
    throw new BundleOrderError('OFFER_SALES_NOT_STARTED', 'A selected offer is not on sale yet');
  }
  if (offer.salesEndsAt && now > offer.salesEndsAt) {
    throw new BundleOrderError('OFFER_SALES_ENDED', 'A selected offer is no longer on sale');
  }
  if (offer.blackoutDates.some((blackout) => dateKey(blackout) === date)) {
    throw new BundleOrderError('OFFER_BLACKOUT_DATE', 'A selected date is unavailable');
  }
  if (travel.getTime() - now.getTime() < offer.leadTimeHours * 60 * 60 * 1000) {
    throw new BundleOrderError('OFFER_LEAD_TIME', 'A selected date is inside the supplier lead time');
  }
  if (offer.entryWindowLabels?.length) {
    const allowedWindows = entryWindows.filter((window) => offer.entryWindowLabels!.includes(window.label));
    if (
      !time ||
      !allowedWindows.some((window) => time >= window.startTime && time < window.endTime)
    ) {
      throw new BundleOrderError(
        'OFFER_ENTRY_WINDOW',
        'The selected time is outside the entry windows committed by the supplier'
      );
    }
  }
};

export const assertOrderSelectionsTravelRules = async (input: {
  selections: Array<{
    attractionId: Types.ObjectId;
    supplyOfferId: Types.ObjectId;
    supplierTenantId: Types.ObjectId;
    date: string;
    time?: string;
  }>;
  offers: Array<{
    _id: Types.ObjectId;
    supplierTenantId: Types.ObjectId;
    validTravelFrom: Date;
    validTravelTo: Date;
    salesStartsAt?: Date;
    salesEndsAt?: Date;
    blackoutDates: Date[];
    leadTimeHours: number;
    entryWindowLabels?: string[];
  }>;
  session?: ClientSession;
}): Promise<void> => {
  const attractions = await Attraction.find({
    _id: { $in: input.selections.map((selection) => selection.attractionId) },
    status: 'active',
    instantConfirmation: true,
  })
    .select('ownerTenantId entryWindows')
    .session(input.session || null)
    .lean();
  if (attractions.length !== input.selections.length) {
    throw new BundleOrderError(
      'BUNDLE_ATTRACTION_CHANGED',
      'An attraction changed before checkout',
      409
    );
  }
  const attractionById = new Map(attractions.map((item) => [item._id.toString(), item]));
  const offerById = new Map(input.offers.map((offer) => [offer._id.toString(), offer]));
  for (const selection of input.selections) {
    const attraction = attractionById.get(selection.attractionId.toString());
    const offer = offerById.get(selection.supplyOfferId.toString());
    if (
      !attraction ||
      !offer ||
      String(attraction.ownerTenantId) !== String(selection.supplierTenantId) ||
      String(offer.supplierTenantId) !== String(selection.supplierTenantId)
    ) {
      throw new BundleOrderError(
        'BUNDLE_SUPPLY_CHANGED',
        'Supplier ownership or terms changed before checkout',
        409
      );
    }
    assertOfferTravelRules(
      offer,
      selection.date,
      selection.time,
      attraction.entryWindows || []
    );
  }
};

export const publicBundleDto = (bundle: IBundleDefinition): Record<string, unknown> => ({
  id: bundle._id.toString(),
  slug: bundle.slug,
  version: bundle.version,
  title: bundle.title,
  shortDescription: bundle.shortDescription,
  description: bundle.description,
  images: bundle.images,
  area: bundle.area,
  category: bundle.category,
  currency: bundle.currency,
  customerPricesMinor: bundle.customerPricesMinor,
  components: bundle.components.map((component) => ({
    componentId: component.componentId,
    attractionId: component.attractionId.toString(),
    attractionTitle: component.attractionTitle,
    optionIds: component.optionIds,
    entryWindowLabels: component.entryWindowLabels,
    dayNumber: component.dayNumber,
    startTime: component.startTime,
    sortOrder: component.sortOrder,
  })),
  policies: bundle.policies,
});

export const createBundleQuote = async (input: {
  storefrontTenantId: Types.ObjectId | string;
  checkoutMode: 'test' | 'live';
  slug: string;
  request: BundleQuoteRequest;
}): Promise<IBundleQuote> => {
  const bundle = await BundleDefinition.findOne({
    storefrontTenantId: input.storefrontTenantId,
    slug: input.slug,
    status: 'published',
  });
  if (!bundle) throw new BundleOrderError('BUNDLE_NOT_FOUND', 'Bundle not found', 404);
  const selectedByComponent = new Map(
    input.request.selections.map((selection) => [selection.componentId, selection])
  );
  if (
    selectedByComponent.size !== bundle.components.length ||
    bundle.components.some((component) => !selectedByComponent.has(component.componentId))
  ) {
    throw new BundleOrderError('INCOMPLETE_BUNDLE_SELECTION', 'Select every bundle component exactly once');
  }
  const itinerary = [...bundle.components].sort(
    (left, right) => left.dayNumber - right.dayNumber || left.sortOrder - right.sortOrder
  );
  for (let index = 1; index < itinerary.length; index += 1) {
    const previous = itinerary[index - 1];
    const current = itinerary[index];
    const previousDate = selectedByComponent.get(previous.componentId)!.date;
    const currentDate = selectedByComponent.get(current.componentId)!.date;
    if (
      (current.dayNumber === previous.dayNumber && currentDate !== previousDate) ||
      (current.dayNumber > previous.dayNumber && currentDate <= previousDate)
    ) {
      throw new BundleOrderError(
        'INVALID_ITINERARY_DATES',
        'Selected dates must follow the published bundle day sequence'
      );
    }
  }

  const offers = await BundleSupplyOffer.find({
    _id: { $in: bundle.components.map((component) => component.supplyOfferId) },
    status: 'active',
  });
  if (offers.length !== bundle.components.length) {
    throw new BundleOrderError('BUNDLE_SUPPLY_CHANGED', 'This bundle is temporarily unavailable', 409);
  }
  const offerById = new Map(offers.map((offer) => [offer._id.toString(), offer]));
  const attractions = await Attraction.find({
    _id: { $in: bundle.components.map((component) => component.attractionId) },
    status: 'active',
    instantConfirmation: true,
  }).select('title pricingOptions ownerTenantId entryWindows');
  if (attractions.length !== bundle.components.length) {
    throw new BundleOrderError('BUNDLE_ATTRACTION_CHANGED', 'This bundle is temporarily unavailable', 409);
  }
  const attractionById = new Map(attractions.map((item) => [item._id.toString(), item]));
  const guests = totalGuests(input.request.quantities);

  const selections = bundle.components.map((component) => {
    const selection = selectedByComponent.get(component.componentId)!;
    const offer = offerById.get(component.supplyOfferId.toString())!;
    const attraction = attractionById.get(component.attractionId.toString())!;
    if (
      offer.version !== component.supplyOfferVersion ||
      String(offer.supplierTenantId) !== String(component.supplierTenantId) ||
      String(attraction.ownerTenantId) !== String(component.supplierTenantId)
    ) {
      throw new BundleOrderError('BUNDLE_SUPPLY_CHANGED', 'Supplier ownership or terms changed', 409);
    }
    if (!component.optionIds.includes(selection.optionId) || !offer.optionIds.includes(selection.optionId)) {
      throw new BundleOrderError('INVALID_BUNDLE_OPTION', 'A selected option is not included in this bundle');
    }
    if (component.startTime && selection.time !== component.startTime) {
      throw new BundleOrderError('INVALID_BUNDLE_TIME', 'A selected time does not match the bundle itinerary');
    }
    assertOfferTravelRules(offer, selection.date, selection.time, attraction.entryWindows || []);
    const option = attraction.pricingOptions.find((item) => item.id === selection.optionId);
    if (!option) throw new BundleOrderError('OPTION_NO_LONGER_AVAILABLE', 'A selected option is no longer available', 409);
    return {
      componentId: component.componentId,
      supplyOfferId: offer._id,
      supplierTenantId: offer.supplierTenantId,
      attractionId: attraction._id,
      attractionTitle: attraction.title,
      optionId: option.id,
      optionName: option.name,
      date: selection.date,
      time: selection.time,
      supplierNetPricesMinor: offer.supplierNetPricesMinor,
      supplierNetTotalMinor: priceForGuests(offer.supplierNetPricesMinor, input.request.quantities),
      offerCapacity: offer.capacityPerDeparture,
    };
  });

  await Promise.all(selections.map((selection) => assertBundleInventoryAvailable({
    attractionId: selection.attractionId,
    supplyOfferId: selection.supplyOfferId,
    date: selection.date,
    time: selection.time,
    guests,
    offerCapacity: selection.offerCapacity,
  })));

  const totalMinor = priceForGuests(bundle.customerPricesMinor, input.request.quantities);
  if (totalMinor <= 0) {
    throw new BundleOrderError(
      'BUNDLE_REQUIRES_PAYING_GUEST',
      'This bundle requires at least one guest in a paid category'
    );
  }
  const supplierTotalMinor = selections.reduce((sum, item) => sum + item.supplierNetTotalMinor, 0);
  const platformAllocationMinor =
    totalMinor - supplierTotalMinor - bundle.platformFeeReserveMinor - bundle.taxReserveMinor;
  if (platformAllocationMinor < 0) {
    throw new BundleOrderError('BUNDLE_ECONOMICS_INVALID', 'Bundle pricing no longer covers its obligations', 409);
  }
  const customerAllocations = allocateProportionally(
    totalMinor,
    selections.map((selection) => selection.supplierNetTotalMinor)
  );
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  return BundleQuote.create({
    reference: bundleReference('BQ'),
    storefrontTenantId: bundle.storefrontTenantId,
    checkoutMode: input.checkoutMode,
    bundleDefinitionId: bundle._id,
    bundleVersion: bundle.version,
    requestFingerprint: bundleFingerprint(input.request),
    quantities: input.request.quantities,
    selections: selections.map(({ offerCapacity: _offerCapacity, ...selection }, index) => ({
      ...selection,
      customerAllocationMinor: customerAllocations[index],
    })),
    currency: bundle.currency,
    customerPricesMinor: bundle.customerPricesMinor,
    supplierTotalMinor,
    platformAllocationMinor,
    paymentFeeReserveMinor: bundle.platformFeeReserveMinor,
    taxMinor: bundle.taxReserveMinor,
    totalMinor,
    expiresAt,
    status: 'active',
  });
};

const createChildBooking = async (
  orderId: Types.ObjectId,
  component: IBundleOrder['components'][number],
  order: {
    userId?: Types.ObjectId;
    storefrontTenantId: Types.ObjectId;
    guestDetails: BundleGuestDetails;
    currency: string;
  },
  session: ClientSession
): Promise<{ bookingId: Types.ObjectId; bookingReference: string }> => {
  const reference = generateBookingReference();
  const guests = totalGuests(component.quantities);
  const totalMajor = component.customerAllocationMinor / 100;
  const [booking] = await Booking.create([{
    reference,
    userId: order.userId,
    tenantId: component.supplierTenantId,
    attractionId: component.attractionId,
    items: [{
      optionId: component.optionId,
      optionName: component.optionName,
      date: component.date,
      time: component.time,
      quantities: component.quantities,
      unitPrice: totalMajor / guests,
      totalPrice: totalMajor,
    }],
    guestDetails: order.guestDetails,
    subtotal: totalMajor,
    fees: 0,
    discount: 0,
    total: totalMajor,
    currency: order.currency,
    paymentMethod: 'card',
    paymentStatus: 'pending',
    status: 'pending',
    supplierTenantId: component.supplierTenantId,
    sellerTenantId: order.storefrontTenantId,
    isResale: true,
    revenueBreakdown: {
      commissionPercent: 0,
      sellerEarnings: (component.customerAllocationMinor - component.supplierNetTotalMinor) / 100,
      paymentFee: 0,
      supplierEarnings: component.supplierNetTotalMinor / 100,
    },
    settlementStatus: 'pending',
    inventoryReservedAt: new Date(),
    inventoryReservations: [{
      date: travelInstant(component.date),
      time: component.time,
      guests,
    }],
    bundleOrderId: orderId,
    bundleComponentId: component.componentId,
    bundleAllocation: {
      supplierNetMinor: component.supplierNetTotalMinor,
      customerAllocationMinor: component.customerAllocationMinor,
      currency: order.currency,
      supplyOfferId: component.supplyOfferId,
    },
  }], { session });
  return { bookingId: booking._id, bookingReference: reference };
};

export const createBundleOrder = async (input: {
  quoteId: string;
  guestDetails: BundleGuestDetails;
  userId?: Types.ObjectId;
  idempotencyKey: string;
  checkoutMode: 'test' | 'live';
}): Promise<{ order: IBundleOrder; replayed: boolean }> => {
  const quoteSnapshot = await BundleQuote.findById(input.quoteId);
  if (!quoteSnapshot) throw new BundleOrderError('QUOTE_NOT_FOUND', 'Quote not found', 404);
  const claim = await claimBundleIdempotency({
    scope: 'bundle-order.create',
    storefrontTenantId: quoteSnapshot.storefrontTenantId,
    key: input.idempotencyKey,
    request: { quoteId: input.quoteId, guestDetails: input.guestDetails, userId: input.userId?.toString() },
  });
  if (claim.replayResourceId) {
    const existing = await BundleOrder.findById(claim.replayResourceId);
    if (!existing) throw new BundleIdempotencyError('IDEMPOTENT_RESOURCE_MISSING', 'The original order is unavailable');
    return { order: existing, replayed: true };
  }

  try {
    // A bundle may create Makadi child bookings even when sold by another
    // storefront. Check the storefront and every supplier before inventory or
    // child Booking writes. Completed idempotent replays returned above.
    await assertTenantIdsBookingCreationAllowed([
      quoteSnapshot.storefrontTenantId,
      ...quoteSnapshot.selections.map((selection) => selection.supplierTenantId),
    ]);

    const order = await runBundleTransaction(async (session) => {
      const quote = await BundleQuote.findOne({
        _id: input.quoteId,
        status: 'active',
        expiresAt: { $gt: new Date() },
        checkoutMode: input.checkoutMode,
      }).session(session);
      if (!quote) throw new BundleOrderError('QUOTE_EXPIRED', 'Refresh this bundle before checkout', 409);
      const offers = await BundleSupplyOffer.find({
        _id: { $in: quote.selections.map((selection) => selection.supplyOfferId) },
        status: 'active',
      }).session(session);
      if (offers.length !== quote.selections.length) {
        throw new BundleOrderError('BUNDLE_SUPPLY_CHANGED', 'Supplier terms changed before checkout', 409);
      }
      await assertOrderSelectionsTravelRules({
        selections: quote.selections,
        offers,
        session,
      });
      const offerById = new Map(offers.map((offer) => [offer._id.toString(), offer]));
      const guests = totalGuests(quote.quantities);
      const orderId = new Types.ObjectId();
      const components: IBundleOrderComponent[] = quote.selections.map((selection) => ({
        componentId: selection.componentId,
        supplyOfferId: selection.supplyOfferId,
        supplierTenantId: selection.supplierTenantId,
        attractionId: selection.attractionId,
        attractionTitle: selection.attractionTitle,
        optionId: selection.optionId,
        optionName: selection.optionName,
        date: selection.date,
        time: selection.time,
        supplierNetPricesMinor: selection.supplierNetPricesMinor,
        supplierNetTotalMinor: selection.supplierNetTotalMinor,
        customerAllocationMinor: selection.customerAllocationMinor,
        quantities: quote.quantities,
        status: 'reserved' as const,
        settlementStatus: 'on_hold' as const,
        refundedMinor: 0,
        refundStatus: 'none' as const,
      }));
      for (const selection of quote.selections) {
        const offer = offerById.get(selection.supplyOfferId.toString())!;
        await reserveBundleInventory({
          attractionId: selection.attractionId,
          supplyOfferId: selection.supplyOfferId,
          date: selection.date,
          time: selection.time,
          guests,
          offerCapacity: offer.capacityPerDeparture,
        }, session);
      }
      const orderData = {
        userId: input.userId,
        storefrontTenantId: quote.storefrontTenantId,
        checkoutMode: input.checkoutMode,
        guestDetails: input.guestDetails,
        currency: quote.currency,
      };
      for (const component of components) {
        const child = await createChildBooking(orderId, component, orderData, session);
        component.bookingId = child.bookingId;
        component.bookingReference = child.bookingReference;
      }
      const [created] = await BundleOrder.create([{
        _id: orderId,
        reference: bundleReference('BTW'),
        storefrontTenantId: quote.storefrontTenantId,
        checkoutMode: input.checkoutMode,
        bundleDefinitionId: quote.bundleDefinitionId,
        bundleVersion: quote.bundleVersion,
        quoteId: quote._id,
        userId: input.userId,
        guestDetails: input.guestDetails,
        status: 'reserved',
        paymentStatus: 'not_started',
        components,
        currency: quote.currency,
        supplierTotalMinor: quote.supplierTotalMinor,
        platformAllocationMinor: quote.platformAllocationMinor,
        paymentFeeReserveMinor: quote.paymentFeeReserveMinor,
        taxMinor: quote.taxMinor,
        totalMinor: quote.totalMinor,
        refundedMinor: 0,
        holdExpiresAt: quote.expiresAt,
        idempotencyFingerprint: claim.record.requestHash,
        refunds: [],
        recovery: { required: false, attempts: 0 },
      }], { session });
      const quoteClaim = await BundleQuote.updateOne(
        { _id: quote._id, status: 'active' },
        { $set: { status: 'consumed', consumedByOrderId: created._id } },
        { session }
      );
      if (quoteClaim.modifiedCount !== 1) throw new BundleOrderError('QUOTE_ALREADY_USED', 'This quote was already used', 409);
      const idemComplete = await BundleIdempotency.updateOne(
        { _id: claim.record._id, status: 'processing' },
        { $set: { status: 'completed', resourceId: created._id } },
        { session }
      );
      if (idemComplete.modifiedCount !== 1) throw new Error('IDEMPOTENCY_COMPLETION_CONFLICT');
      await appendBundleEvent({
        aggregateType: 'order',
        aggregateId: created._id,
        storefrontTenantId: created.storefrontTenantId,
        actorType: input.userId ? 'user' : 'guest',
        actorId: input.userId,
        command: 'reserve',
        toState: 'reserved',
        idempotencyKeyHash: claim.record.keyHash,
        metadata: { componentCount: created.components.length, totalMinor: created.totalMinor },
      }, session);
      await enqueueBundleOutbox({
        orderId: created._id,
        tenantId: created.storefrontTenantId,
        audience: 'storefront',
        eventType: 'bundle.order_reserved',
        payload: { orderId: created._id.toString(), reference: created.reference },
      }, session);
      return created;
    });
    return { order, replayed: false };
  } catch (error) {
    const retryable =
      typeof (error as { hasErrorLabel?: (label: string) => boolean }).hasErrorLabel === 'function' &&
      (error as { hasErrorLabel: (label: string) => boolean }).hasErrorLabel('TransientTransactionError');
    await failBundleIdempotency(
      claim.record._id,
      retryable ? 'failed_retryable' : 'failed_final',
      {
        code: error instanceof BundleInventoryError || error instanceof BundleOrderError
          ? error.code
          : 'ORDER_CREATION_FAILED',
        message: error instanceof Error ? error.message : 'Order creation failed',
      }
    );
    throw error;
  }
};

export const customerBundleOrderDto = (order: IBundleOrder): Record<string, unknown> => ({
  id: order._id.toString(),
  reference: order.reference,
  status: order.status,
  paymentStatus: order.paymentStatus,
  currency: order.currency,
  totalMinor: order.totalMinor,
  refundedMinor: order.refundedMinor,
  holdExpiresAt: order.holdExpiresAt,
  guestDetails: order.guestDetails,
  components: order.components.map((component) => ({
    componentId: component.componentId,
    attractionId: component.attractionId.toString(),
    attractionTitle: component.attractionTitle,
    optionId: component.optionId,
    optionName: component.optionName,
    date: component.date,
    time: component.time,
    quantities: component.quantities,
    status: component.status,
    refundStatus: component.refundStatus,
    refundedMinor: component.refundedMinor,
    bookingReference: component.bookingReference,
  })),
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

export const supplierBundleOrderDto = (
  order: IBundleOrder,
  supplierTenantId: string
): Record<string, unknown> => ({
  id: order._id.toString(),
  reference: order.reference,
  status: order.status,
  currency: order.currency,
  components: order.components
    .filter((component) => String(component.supplierTenantId) === supplierTenantId)
    .map((component) => ({
      componentId: component.componentId,
      attractionId: component.attractionId.toString(),
      attractionTitle: component.attractionTitle,
      optionId: component.optionId,
      optionName: component.optionName,
      date: component.date,
      time: component.time,
      quantities: component.quantities,
      status: component.status,
      refundStatus: component.refundStatus,
      refundedMinor: component.refundedMinor,
      settlementStatus: component.settlementStatus,
      supplierNetTotalMinor: component.supplierNetTotalMinor,
      bookingReference: component.bookingReference,
    })),
  createdAt: order.createdAt,
});
