/**
 * The platform service fee charged on storefront bookings, in one place for every product line.
 * Whether the fee stays, and how it is presented, is an open owner decision (PLATFORM #1058);
 * changing it here changes tours and packages together.
 *
 * Tours add it on top of the subtotal at checkout. Packages show it inside every price a customer
 * sees (see packagePricing.service), so a package total never grows at checkout.
 */
export const SERVICE_FEE_BASIS_POINTS = 500;

/** Fee on a subtotal, rounded to cents: the tour checkout rule. */
export const serviceFeeOn = (subtotal: number): number =>
  Math.round(subtotal * (SERVICE_FEE_BASIS_POINTS / 10_000) * 100) / 100;

/** A price in cents with the fee inside it, rounded to the cent: the package display rule. */
export const withServiceFeeCents = (cents: number, basisPoints = SERVICE_FEE_BASIS_POINTS): number =>
  cents + Math.round((cents * basisPoints) / 10_000);
