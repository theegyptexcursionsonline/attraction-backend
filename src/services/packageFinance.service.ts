import { createHash } from 'crypto';
import { FinancePolicy, calculateFinance, customerFinance, financeMinor } from '../utils/financeSettings';
import { PackageQuote } from './packagePricing.service';

/** Called after promo selection on a package priced with feeBasisPoints:0. */
export function applyPackageFinance(quote: PackageQuote, policy: FinancePolicy) {
  if (!policy.configured) return undefined;
  const snapshot = calculateFinance({ policy, currency: quote.currency, serviceSubtotalMinor: financeMinor(quote.subtotal), discountMinor: financeMinor(quote.discount ?? 0) });
  quote.total = snapshot.totalMinor / 100;
  quote.serviceFee = snapshot.customerFeesMinor / 100;
  const roomTotalMinor = quote.rooms.reduce((total, room) => total + financeMinor(room.amount), 0);
  quote.tripPerPerson = Math.round(calculateFinance({ policy, currency: quote.currency, serviceSubtotalMinor: roomTotalMinor, discountMinor: 0 }).totalMinor / (quote.travellers.adults + quote.travellers.children)) / 100;
  quote.perPerson = Math.round(snapshot.totalMinor / (quote.travellers.adults + quote.travellers.children)) / 100;
  if (quote.discount) quote.preDiscountTotal = quote.total + quote.discount;
  quote.finance = customerFinance(snapshot);
  quote.financeHash = createHash('sha256').update(JSON.stringify({ policyTenantId: policy.tenantId, finance: quote.finance })).digest('hex');
  return snapshot;
}

/** Transform the complete reference booking before dividing for per-person display. */
export const packageFinanceTotal = (currency: string, policy: FinancePolicy) => (serviceSubtotalMinor: number): number =>
  calculateFinance({ policy, currency, serviceSubtotalMinor, discountMinor: 0 }).totalMinor;
