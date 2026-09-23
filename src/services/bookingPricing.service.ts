import { IAttraction, ITenant, IBooking } from '../types';
import { PromoCode, IPromoCode } from '../models/PromoCode';
import { SpecialOffer } from '../models/SpecialOffer';
import { calculateTourLinePrice } from '../utils/attractionPricing';
import { normalizeBookingAddons, addonsTotal } from '../utils/bookingAddons';
import { CreateBookingInput } from '../utils/validators';
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Read-only price authority shared by checkout quotes and actual booking creation.
 * This never reserves inventory, consumes promotions, or writes a booking.
 * Creation still rechecks eligibility and claims inventory/discounts transactionally.
 */
export async function priceBookingSelection(attraction: IAttraction, bookingTenant: ITenant | undefined,
  items: CreateBookingInput['items'], promoCode?: string) {
    const attractionId = attraction._id;
    // Whether THIS booking's tenant has opted into dual (Foreigner/Resident) pricing.
    // The Resident rate is honoured only when the tenant flag is on AND the option has a residentPrice set.
    const residentPricingEnabled = bookingTenant?.pricingSettings?.enableResidentPricing === true;

    // Recalculate line items on the server to prevent client-side price tampering.
    const temporalChecks: Array<{ date: string; time?: string; cutoffMinutes: number }> = [];
    const normalizedItems: IBooking['items'] = items.map((item) => {
      const option = attraction.pricingOptions.find((o) => o.id === item.optionId);
      if (!option) {
        throw new Error(`INVALID_OPTION:${item.optionId}`);
      }

      const quantities = {
        adults: item.quantities?.adults || 0,
        children: item.quantities?.children || 0,
        infants: item.quantities?.infants || 0,
      };
      const values = Object.values(quantities);
      if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 100)) {
        throw new Error('INVALID_QUANTITY');
      }

      const payableGuests = quantities.adults + quantities.children;
      const capacityGuests = payableGuests + quantities.infants;
      if (payableGuests <= 0) {
        throw new Error('INVALID_QUANTITY');
      }
      if (capacityGuests > 50) throw new Error('INVALID_QUANTITY');

      const minimumParticipants = option.minParticipants ?? 1;
      const maximumParticipants = option.maxParticipants ?? 50;
      if (capacityGuests < minimumParticipants || capacityGuests > maximumParticipants) {
        throw new Error(`PARTICIPANT_LIMIT:${minimumParticipants}:${maximumParticipants}`);
      }

      if (!item.date) throw new Error('INVALID_DATE');

      // Pick the right tier. Falls back to foreigner price if resident is requested
      // but the flag is off or the option doesn't carry a residentPrice — never throws.
      const useResident =
        residentPricingEnabled &&
        item.category === 'resident' &&
        typeof option.residentPrice === 'number' &&
        option.residentPrice > 0;
      const selectedOptionSlot = item.time
        ? option.timeSlots?.find((window) => window.startTime === item.time)
        : undefined;
      const selectedWindow = item.time
        ? attraction.entryWindows?.find((window) => window.startTime === item.time)
        : undefined;
      if (attraction.availability?.type === 'time-slots') {
        const hasConfiguredSlots = (option.timeSlots?.length || 0) > 0 || (attraction.entryWindows?.length || 0) > 0;
        if (!item.time || (hasConfiguredSlots && !selectedOptionSlot && !selectedWindow)) {
          throw new Error('INVALID_TIME_SLOT');
        }
      }
      temporalChecks.push({
        date: item.date,
        time: item.time,
        cutoffMinutes: option.bookingCutoffMinutes ?? 0,
      });
      const linePricing = calculateTourLinePrice({
        option,
        quantities,
        time: item.time,
        legacyEntryWindows: attraction.entryWindows || [],
        useResidentPrice: useResident,
      });
      const appliedCategory: 'foreigner' | 'resident' | undefined = residentPricingEnabled
        ? useResident
          ? 'resident'
          : 'foreigner'
        : undefined;

      // Add-ons: catalogue is the price authority; quantity is validated against
      // the add-on's pricing type (per_unit → once, per_person → ≤ participants).
      const validAddons = normalizeBookingAddons({
        catalog: attraction.addons,
        requested: item.addons,
        participants: capacityGuests,
      });

      // Catalog pickup validation runs after completed idempotent replays below.
      const hotelPickup = item.hotelPickup;

      return {
        optionId: option.id,
        optionName: option.name,
        date: item.date,
        time: item.time,
        quantities,
        unitPrice: linePricing.unitPrice,
        totalPrice: linePricing.totalPrice,
        pricingBreakdown: linePricing.pricingBreakdown,
        ...(appliedCategory ? { category: appliedCategory } : {}),
        ...(validAddons.length > 0 ? { addons: validAddons } : {}),
        ...(hotelPickup ? { hotelPickup } : {}),
      };
    });

    const subtotal = round2(normalizedItems.reduce(
      (acc: number, item: { totalPrice: number; addons?: Array<{ price: number; quantity?: number }> }) =>
        acc + item.totalPrice + addonsTotal(item.addons),
      0
    ));

    const fees = round2(subtotal * 0.05); // 5% service fee
    const tenantId = bookingTenant?._id || attraction.tenantIds[0];
    if (!tenantId) {
      throw new Error('MISSING_TENANT');
    }

    const now = new Date();
    let promoCandidate: IPromoCode | null = null;
    let promoDiscount = 0;
    if (promoCode) {
      const promoBase = {
        code: String(promoCode).trim().toUpperCase(),
        currency: attraction.currency.toUpperCase(),
        isActive: true,
        validFrom: { $lte: now },
        validUntil: { $gte: now },
        minOrderAmount: { $lte: subtotal },
        $expr: { $lt: ['$usageCount', '$usageLimit'] },
      };
      promoCandidate = await PromoCode.findOne({ ...promoBase, tenantId });
      if (!promoCandidate) {
        promoCandidate = await PromoCode.findOne({
          ...promoBase,
          $or: [{ tenantId: null }, { tenantId: { $exists: false } }],
        });
      }
      if (!promoCandidate) throw new Error('INVALID_PROMO');

      promoDiscount = promoCandidate.discountType === 'percentage'
        ? round2(subtotal * (promoCandidate.discountValue / 100))
        : promoCandidate.discountValue;
      if (promoCandidate.maxDiscount !== undefined) {
        promoDiscount = Math.min(promoDiscount, promoCandidate.maxDiscount);
      }
    }

    // Auto-apply best special offer (if better than promo code)
    const activeOffer = await SpecialOffer.findOne({
      attractionId,
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      $expr: { $lt: ['$usageCount', '$usageLimit'] },
    }).sort({ discountValue: -1 });

    let offerDiscount = 0;
    if (activeOffer) {
      offerDiscount = activeOffer.discountType === 'percentage'
        ? round2(subtotal * (activeOffer.discountValue / 100))
        : activeOffer.discountValue;
    }

    const useSpecialOffer = !!activeOffer && offerDiscount > promoDiscount;
    const discount = round2(Math.min(Math.max(useSpecialOffer ? offerDiscount : promoDiscount, 0), subtotal));
    const total = round2(Math.max(subtotal + fees - discount, 0));

    return { normalizedItems, temporalChecks, subtotal, fees, tenantId, now, promoCandidate,
      activeOffer, useSpecialOffer, discount, total };
}
