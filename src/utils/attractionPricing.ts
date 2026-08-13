export interface GuestQuantities {
  adults: number;
  children: number;
  infants: number;
}

export interface TourPricingSlot {
  id?: string;
  label?: string;
  startTime: string;
  endTime?: string;
  adultPrice?: number;
  childPrice?: number;
  infantPrice?: number;
}

export interface TourPricingOption {
  price: number;
  childPrice?: number;
  infantPrice?: number;
  discountPercentage?: number;
  residentPrice?: number;
  timeSlots?: TourPricingSlot[];
}

export interface LegacyEntryWindow {
  startTime: string;
  price?: number;
}

export interface PricingResult {
  totalPrice: number;
  unitPrice: number;
  pricingBreakdown: {
    adultUnitPrice: number;
    childUnitPrice: number;
    infantUnitPrice: number;
    discountPercentage: number;
  };
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const discounted = (price: number, percentage: number): number =>
  round2(price * (1 - percentage / 100));

/**
 * Calculates a booking line from server-owned tour pricing. New records can
 * price each guest category and each option-owned time slot. Legacy records
 * remain valid: child falls back to adult, infant remains free, and the old
 * top-level entry-window price overrides both adult and child.
 */
export const calculateTourLinePrice = ({
  option,
  quantities,
  time,
  legacyEntryWindows = [],
  useResidentPrice = false,
}: {
  option: TourPricingOption;
  quantities: GuestQuantities;
  time?: string;
  legacyEntryWindows?: LegacyEntryWindow[];
  useResidentPrice?: boolean;
}): PricingResult => {
  const slot = time ? option.timeSlots?.find((candidate) => candidate.startTime === time) : undefined;
  const legacySlot = !slot && time
    ? legacyEntryWindows.find((candidate) => candidate.startTime === time)
    : undefined;
  const percentage = Math.min(99.99, Math.max(0, option.discountPercentage || 0));

  const baseAdult = useResidentPrice && typeof option.residentPrice === 'number'
    ? option.residentPrice
    : slot?.adultPrice ?? legacySlot?.price ?? option.price;
  const baseChild = useResidentPrice && typeof option.residentPrice === 'number'
    ? option.residentPrice
    : slot?.childPrice ?? legacySlot?.price ?? option.childPrice ?? baseAdult;
  // Resident pricing historically applies to paying adults/children only;
  // infants keep their explicit tour price (or remain free).
  const baseInfant = slot?.infantPrice ?? option.infantPrice ?? 0;

  const adultUnitPrice = discounted(baseAdult, percentage);
  const childUnitPrice = discounted(baseChild, percentage);
  const infantUnitPrice = discounted(baseInfant, percentage);
  const totalPrice = round2(
    adultUnitPrice * quantities.adults +
    childUnitPrice * quantities.children +
    infantUnitPrice * quantities.infants
  );
  const chargedGuests = quantities.adults + quantities.children + quantities.infants;

  return {
    totalPrice,
    unitPrice: chargedGuests > 0 ? round2(totalPrice / chargedGuests) : 0,
    pricingBreakdown: {
      adultUnitPrice,
      childUnitPrice,
      infantUnitPrice,
      discountPercentage: percentage,
    },
  };
};

export const minimumTourPrice = (options: TourPricingOption[]): number => {
  const candidates = options.flatMap((option) => {
    const percentage = Math.min(99.99, Math.max(0, option.discountPercentage || 0));
    // Public "from" prices remain adult prices, matching the legacy card and
    // search contract. Child/infant rates must never make a tour look cheaper.
    const slots = (option.timeSlots || []).map((slot) => slot.adultPrice);
    return [option.price, ...slots]
      .filter((price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0)
      .map((price) => discounted(price, percentage));
  });
  return candidates.length > 0 ? Math.min(...candidates) : 0;
};
