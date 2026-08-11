import { Types } from 'mongoose';
import { assertTransition, canTransition, InvalidBundleTransitionError } from '../bundles/domain';
import { bundleFingerprint, bundleReference } from '../bundles/hash';
import { generateBundleAccessToken, verifyBundleAccessToken } from '../bundles/guestAccess';
import {
  addGuestPrices,
  allocateProportionally,
  assertBundleEconomics,
  priceForGuests,
} from '../bundles/money';
import {
  createBundleQuoteSchema,
  createBundleSchema,
  createSupplyOfferSchema,
  bundleCommandSchema,
  cancelBundleOrderSchema,
  refundBundleOrderSchema,
  supplyOfferListQuerySchema,
} from '../bundles/validators';
import { assertOfferTravelRules } from '../services/bundleOrder.service';
import { validateOfferCommercialRules } from '../services/bundleSupplyOffer.service';

describe('Bundle to Win domain invariants', () => {
  it('accepts only explicit lifecycle transitions', () => {
    expect(canTransition('supply-offer', 'draft', 'submitted')).toBe(true);
    expect(canTransition('bundle', 'draft', 'published')).toBe(false);
    expect(canTransition('order', 'payment_pending', 'paid')).toBe(true);
    expect(() => assertTransition('settlement', 'on_hold', 'paid')).toThrow(
      InvalidBundleTransitionError
    );
  });

  it('prices integer minor units and preserves every cent during allocation', () => {
    expect(priceForGuests(
      { adult: 12_500, child: 7_500, infant: 0 },
      { adults: 2, children: 1, infants: 1 }
    )).toBe(32_500);
    const split = allocateProportionally(10_001, [5, 3, 2]);
    expect(split).toEqual([5_001, 3_000, 2_000]);
    expect(split.reduce((sum, amount) => sum + amount, 0)).toBe(10_001);
  });

  it('rejects customer prices below total supplier returns', () => {
    expect(addGuestPrices([
      { adult: 4_000, child: 2_000, infant: 0 },
      { adult: 3_000, child: 1_500, infant: 0 },
    ])).toEqual({ adult: 7_000, child: 3_500, infant: 0 });
    expect(() => assertBundleEconomics({
      customerPricesMinor: { adult: 6_999, child: 3_500, infant: 0 },
      supplierPriceSetsMinor: [
        { adult: 4_000, child: 2_000, infant: 0 },
        { adult: 3_000, child: 1_500, infant: 0 },
      ],
    })).toThrow('CUSTOMER_PRICE_BELOW_SUPPLIER_RETURNS:adult');
    expect(() => assertBundleEconomics({
      customerPricesMinor: { adult: 7_500, child: 3_500, infant: 0 },
      supplierPriceSetsMinor: [
        { adult: 4_000, child: 2_000, infant: 0 },
        { adult: 3_000, child: 1_500, infant: 0 },
      ],
      fixedObligationsMinor: 1_000,
    })).toThrow('CUSTOMER_PRICE_BELOW_FIXED_OBLIGATIONS:adult');
  });

  it('canonicalizes fingerprints and creates non-sequential references', () => {
    expect(bundleFingerprint({ b: 2, a: 1 })).toBe(bundleFingerprint({ a: 1, b: 2 }));
    expect(bundleReference('BTW')).toMatch(/^BTW-[A-F0-9]{10}$/);
  });

  it('binds a guest access token to both order id and reference', () => {
    const token = generateBundleAccessToken('order-1', 'BTW-ABC');
    expect(verifyBundleAccessToken(token, 'order-1', 'BTW-ABC')).toBe(true);
    expect(verifyBundleAccessToken(token, 'order-2', 'BTW-ABC')).toBe(false);
    expect(verifyBundleAccessToken(token, 'order-1', 'BTW-OTHER')).toBe(false);
  });

  it('validates commercial offer, bundle, quote, and refund boundaries', () => {
    const supplierTenantId = new Types.ObjectId().toString();
    const attractionId = new Types.ObjectId().toString();
    expect(createSupplyOfferSchema.safeParse({
      supplierTenantId,
      attractionId,
      currency: 'usd',
      supplierNetPricesMinor: { adult: 5000, child: 3000, infant: 0 },
      optionIds: ['standard'],
      entryWindowLabels: [],
      capacityPerDeparture: 12,
      validTravelFrom: '2030-01-01T00:00:00.000Z',
      validTravelTo: '2030-12-31T23:59:59.000Z',
      blackoutDates: [],
      leadTimeHours: 24,
      cancellationPolicy: 'Non-refundable inside 24 hours.',
      termsVersion: 'v1',
    }).success).toBe(true);

    const supplyIds = Array.from({ length: 3 }, () => new Types.ObjectId().toString());
    const bundle = createBundleSchema.safeParse({
      storefrontTenantId: new Types.ObjectId().toString(),
      slug: 'red-sea-weekender',
      title: 'Red Sea Weekender',
      shortDescription: 'Three coordinated experiences.',
      description: 'A professionally coordinated multi-attraction itinerary.',
      images: [],
      area: 'Hurghada',
      category: 'Curated itinerary',
      currency: 'USD',
      customerPricesMinor: { adult: 20000, child: 12000, infant: 0 },
      platformFeeReserveMinor: 1000,
      taxReserveMinor: 500,
      components: supplyIds.map((supplyOfferId, index) => ({
        componentId: `day-${index + 1}`,
        supplyOfferId,
        dayNumber: index + 1,
        startTime: '09:00',
        sortOrder: index,
      })),
      policies: {
        cancellation: 'See booking terms.',
        refund: 'Refunds follow the confirmed policy.',
        substitution: 'No silent substitutions.',
        promoStacking: false,
      },
    });
    expect(bundle.success).toBe(true);
    expect(createBundleSchema.safeParse({
      ...bundle.data!,
      components: bundle.data!.components.map((component) => ({ ...component, sortOrder: 0 })),
    }).success).toBe(false);

    expect(createBundleQuoteSchema.safeParse({
      storefrontTenantId: new Types.ObjectId().toString(),
      quantities: { adults: 0, children: 0, infants: 0 },
      selections: supplyIds.map((_, index) => ({
        componentId: `day-${index + 1}`,
        optionId: 'standard',
        date: '2030-04-01',
        time: '09:00',
      })),
    }).success).toBe(false);

    expect(refundBundleOrderSchema.safeParse({
      operationId: 'refund-operation-001',
      amountMinor: 0,
      reason: 'Customer request',
    }).success).toBe(false);

    expect(bundleCommandSchema.safeParse({ reason: 'Publish' }).success).toBe(false);
    expect(bundleCommandSchema.safeParse({ revision: 3, reason: 'Publish' }).success).toBe(true);
    expect(cancelBundleOrderSchema.safeParse({ reason: 'No longer travelling' }).success).toBe(true);
    expect(createSupplyOfferSchema.safeParse({
      supplierTenantId,
      attractionId,
      currency: 'USD',
      supplierNetPricesMinor: { adult: 0, child: 0, infant: 0 },
      optionIds: ['standard'],
      capacityPerDeparture: 1,
      validTravelFrom: '2030-01-01T00:00:00.000Z',
      validTravelTo: '2030-12-31T23:59:59.000Z',
      leadTimeHours: 0,
      cancellationPolicy: 'Published policy',
      termsVersion: 'v1',
    }).success).toBe(false);
    expect(supplyOfferListQuerySchema.parse({ allSuppliers: 'false' }).allSuppliers).toBe(false);
  });

  it('revalidates full commercial windows after a partial supplier revision', () => {
    const input = {
      supplierTenantId: new Types.ObjectId().toString(),
      attractionId: new Types.ObjectId().toString(),
      currency: 'USD',
      supplierNetPricesMinor: { adult: 5_000, child: 3_000, infant: 0 },
      optionIds: ['standard'],
      entryWindowLabels: ['Morning'],
      capacityPerDeparture: 12,
      validTravelFrom: '2030-01-01T00:00:00.000Z',
      validTravelTo: '2030-12-31T23:59:59.000Z',
      blackoutDates: ['2030-04-10T00:00:00.000Z'],
      leadTimeHours: 24,
      cancellationPolicy: 'Published policy',
      termsVersion: 'v1',
    };
    expect(() => validateOfferCommercialRules(input)).not.toThrow();
    expect(() => validateOfferCommercialRules({
      ...input,
      validTravelFrom: '2031-01-01T00:00:00.000Z',
    })).toThrow('Travel end must follow travel start');
    expect(() => validateOfferCommercialRules({
      ...input,
      blackoutDates: ['2031-04-10T00:00:00.000Z'],
    })).toThrow('Every blackout date must fall inside the travel window');
  });

  it('enforces the supplier entry windows chosen for an offer', () => {
    const offer = {
      validTravelFrom: new Date('2030-01-01T00:00:00.000Z'),
      validTravelTo: new Date('2030-12-31T23:59:59.000Z'),
      blackoutDates: [],
      leadTimeHours: 0,
      entryWindowLabels: ['Morning'],
    };
    const windows = [
      { label: 'Morning', startTime: '09:00', endTime: '12:00' },
      { label: 'Afternoon', startTime: '13:00', endTime: '17:00' },
    ];
    expect(() => assertOfferTravelRules(offer, '2030-04-10', '10:00', windows)).not.toThrow();
    expect(() => assertOfferTravelRules(offer, '2030-04-10', '14:00', windows)).toThrow(
      'outside the entry windows'
    );
  });
});
