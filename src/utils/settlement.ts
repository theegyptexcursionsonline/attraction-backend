// Settlement authority (Fouad, 2026-07-05):
// "the supplier settles only if they have their own gateway or cash-on-arrival;
//  else the super-admin acts, but reports still stay visible to supplier/reseller."
//
// Who holds the money on a resale booking decides who may mark it settled:
//   - cash-on-arrival (pay-later / cash)  → the SUPPLIER collected it   → supplier self-settles
//   - the supplier's OWN payment gateway   → the SUPPLIER received it    → supplier self-settles
//   - online card via the platform gateway → the PLATFORM holds it       → super-admin settles
//
// Reports are never gated by this — only the settle ACTION is.

/** True when the platform (Foxes) holds the funds, so only a super-admin may settle. */
export function isPlatformHeld(
  paymentMethod: string | undefined,
  supplierOwnGateway: boolean,
): boolean {
  return paymentMethod === 'card' && !supplierOwnGateway;
}

/** Who currently holds the money for this booking (for display in ledgers). */
export function settlementHeldBy(
  paymentMethod: string | undefined,
  supplierOwnGateway: boolean,
): 'platform' | 'supplier' {
  return isPlatformHeld(paymentMethod, supplierOwnGateway) ? 'platform' : 'supplier';
}

/** May a supplier (non-super-admin) self-settle this booking? */
export function canSupplierSelfSettle(
  paymentMethod: string | undefined,
  supplierOwnGateway: boolean,
): boolean {
  return !isPlatformHeld(paymentMethod, supplierOwnGateway);
}
