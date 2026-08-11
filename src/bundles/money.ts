export interface GuestQuantities {
  adults: number;
  children: number;
  infants: number;
}

export interface GuestPricesMinor {
  adult: number;
  child: number;
  infant: number;
}

export const assertMinorUnit = (value: number, field: string, allowZero = true): void => {
  const valid = Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0);
  if (!valid) throw new Error(`INVALID_MINOR_UNIT:${field}`);
};

export const assertGuestQuantities = (quantities: GuestQuantities): void => {
  for (const [key, value] of Object.entries(quantities)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`INVALID_GUEST_QUANTITY:${key}`);
    }
  }
  if (quantities.adults + quantities.children + quantities.infants < 1) {
    throw new Error('AT_LEAST_ONE_GUEST_REQUIRED');
  }
};

export const totalGuests = (quantities: GuestQuantities): number =>
  quantities.adults + quantities.children + quantities.infants;

export const priceForGuests = (
  prices: GuestPricesMinor,
  quantities: GuestQuantities
): number => {
  assertGuestQuantities(quantities);
  assertMinorUnit(prices.adult, 'adult');
  assertMinorUnit(prices.child, 'child');
  assertMinorUnit(prices.infant, 'infant');
  return (
    prices.adult * quantities.adults +
    prices.child * quantities.children +
    prices.infant * quantities.infants
  );
};

export const addGuestPrices = (prices: GuestPricesMinor[]): GuestPricesMinor =>
  prices.reduce(
    (total, item) => ({
      adult: total.adult + item.adult,
      child: total.child + item.child,
      infant: total.infant + item.infant,
    }),
    { adult: 0, child: 0, infant: 0 }
  );

export const allocateProportionally = (total: number, weights: number[]): number[] => {
  assertMinorUnit(total, 'allocation-total');
  if (!weights.length) throw new Error('ALLOCATION_WEIGHTS_REQUIRED');
  weights.forEach((weight, index) => assertMinorUnit(weight, `allocation-weight-${index}`));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  if (weightTotal <= 0) throw new Error('ALLOCATION_WEIGHT_TOTAL_REQUIRED');

  const allocations = weights.map((weight) => Math.floor((total * weight) / weightTotal));
  let remainder = total - allocations.reduce((sum, value) => sum + value, 0);
  const order = weights
    .map((weight, index) => ({ weight, index }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  let cursor = 0;
  while (remainder > 0) {
    allocations[order[cursor % order.length].index] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return allocations;
};

export const assertBundleEconomics = (input: {
  customerPricesMinor: GuestPricesMinor;
  supplierPriceSetsMinor: GuestPricesMinor[];
  fixedObligationsMinor?: number;
}): void => {
  const supplierTotals = addGuestPrices(input.supplierPriceSetsMinor);
  const fixedObligationsMinor = input.fixedObligationsMinor || 0;
  assertMinorUnit(fixedObligationsMinor, 'fixed-obligations');
  for (const category of ['adult', 'child', 'infant'] as const) {
    assertMinorUnit(input.customerPricesMinor[category], `customer-${category}`);
    if (input.customerPricesMinor[category] < supplierTotals[category]) {
      throw new Error(`CUSTOMER_PRICE_BELOW_SUPPLIER_RETURNS:${category}`);
    }
    if (
      input.customerPricesMinor[category] > 0 &&
      input.customerPricesMinor[category] < supplierTotals[category] + fixedObligationsMinor
    ) {
      throw new Error(`CUSTOMER_PRICE_BELOW_FIXED_OBLIGATIONS:${category}`);
    }
  }
};
