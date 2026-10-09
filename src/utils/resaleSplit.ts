import { FinanceError, FinanceSnapshot, financeMinor } from './financeSettings';
/**
 * Reseller revenue split for a booking sold on a reseller's site for a listing another site owns:
 * the reseller's commission on the total the customer pays, a payment-processing fee, and the
 * supplier's net. Internal accounting only — the customer is charged the same total.
 *
 * The rule is the one tour bookings record inline in createBooking (bookings.controller); package
 * bookings use this copy until that path moves onto it. Change both together.
 */
export const RESELLER_PAYMENT_FEE_PERCENT = 2.9;

const round2 = (value: number): number => Math.round(value * 100) / 100;

type Listing = {
  reseller?: { enabled?: boolean; value?: number } | null;
  ownerTenantId?: unknown;
  tenantIds?: unknown[];
};

export type ResaleFields =
  | { isResale: false }
  | {
      isResale: true;
      supplierTenantId: unknown;
      sellerTenantId: unknown;
      revenueBreakdown: { commissionPercent: number; sellerEarnings: number; paymentFee: number; supplierEarnings: number; configuredBusinessFees?: number; sellerNetAfterConfiguredFees?: number };
    };

export function resaleFieldsFor(listing: Listing, sellerTenantId: unknown, total: number, financeSnapshot?: FinanceSnapshot): ResaleFields {
  const supplierTenantId = listing.ownerTenantId || listing.tenantIds?.[0];
  if (!listing.reseller?.enabled || !supplierTenantId || !sellerTenantId || String(supplierTenantId) === String(sellerTenantId)) {
    return { isResale: false };
  }
  const commissionPercent = listing.reseller.value ?? 0;
  const sellerEarnings = round2((total * commissionPercent) / 100);
  const paymentFee = round2((total * RESELLER_PAYMENT_FEE_PERCENT) / 100);
  const configured = financeSnapshot ? {
    configuredBusinessFees: financeSnapshot.businessFeesMinor / 100,
    sellerNetAfterConfiguredFees: (financeMinor(sellerEarnings) - financeSnapshot.businessFeesMinor) / 100,
  } : {};
  if (configured.sellerNetAfterConfiguredFees !== undefined && configured.sellerNetAfterConfiguredFees < 0) {
    throw new FinanceError('FINANCE_MARGIN_INVALID', 'The website fees exceed the selling website commission. Update the fee settings before accepting this booking.');
  }
  return {
    isResale: true,
    supplierTenantId,
    sellerTenantId,
    revenueBreakdown: { commissionPercent, sellerEarnings, paymentFee, supplierEarnings: round2(total - sellerEarnings - paymentFee), ...configured },
  };
}

/** True when both splits record the same parties and the same amounts. */
export function sameResaleFields(left: ResaleFields, right: ResaleFields): boolean {
  if (!left.isResale || !right.isResale) return left.isResale === right.isResale;
  const a = left.revenueBreakdown;
  const b = right.revenueBreakdown;
  return String(left.supplierTenantId) === String(right.supplierTenantId)
    && String(left.sellerTenantId) === String(right.sellerTenantId)
    && a.commissionPercent === b.commissionPercent
    && a.sellerEarnings === b.sellerEarnings
    && a.paymentFee === b.paymentFee
    && a.supplierEarnings === b.supplierEarnings
    && a.configuredBusinessFees === b.configuredBusinessFees
    && a.sellerNetAfterConfiguredFees === b.sellerNetAfterConfiguredFees;
}
