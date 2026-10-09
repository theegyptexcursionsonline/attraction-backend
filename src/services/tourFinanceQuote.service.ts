import { createHash } from 'crypto';
import { customerFinance, financeMinor } from '../utils/financeSettings';
import { priceBookingSelection } from './bookingPricing.service';

type Pricing = Awaited<ReturnType<typeof priceBookingSelection>>;
export class TourPriceChangedError extends Error {
  constructor(public readonly quote: ReturnType<typeof tourFinanceQuote>) { super('The booking price changed. Review the current price before booking.'); }
}
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
  : JSON.stringify(value) ?? 'null';

export function tourFinanceQuote(attractionId: unknown, currency: string, pricing: Pricing) {
  const finance = pricing.financeSnapshot ? customerFinance(pricing.financeSnapshot) : {
    version: 1 as const, policyRevision: 0, configured: false,
    discountedServiceMinor: financeMinor(pricing.subtotal - pricing.discount),
    customerFeesMinor: financeMinor(pricing.fees), totalMinor: financeMinor(pricing.total),
    lines: [{ kind: 'booking' as const, type: 'percentage' as const, percentage: 5, amountMinor: financeMinor(pricing.fees) }],
  };
  // Bind the accepted selection and full policy snapshot, including business-paid terms
  // whose changes may leave the customer's total unchanged. The private terms never leave here.
  const quoteHash = createHash('sha256').update(stable({ attractionId: String(attractionId), tenantId: String(pricing.tenantId),
    currency, items: pricing.normalizedItems.map(({ hotelPickup: _pickup, ...item }) => item),
    subtotal: pricing.subtotal, discount: pricing.discount, total: pricing.total,
    policyRevision: pricing.policy.revision, financeSnapshot: pricing.financeSnapshot ?? null,
  })).digest('hex');
  const discountSource = pricing.discount <= 0 ? null : pricing.useSpecialOffer ? 'offer' as const : 'promo' as const;
  return { tenantId: String(pricing.tenantId), attractionId: String(attractionId), currency,
    subtotal: pricing.subtotal, discount: pricing.discount, fees: pricing.fees, total: pricing.total,
    discountSource, ...(discountSource === 'promo' ? { appliedPromoCode: pricing.promoCandidate?.code } : {}),
    finance, quoteHash, quotedAt: new Date().toISOString() };
}
