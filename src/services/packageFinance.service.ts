import { createHash } from 'crypto';
import { FinancePolicy, calculateFinance, customerFinance, financeMinor } from '../utils/financeSettings';
import { PackageQuote } from './packagePricing.service';

/** Called after promo selection on a package priced with feeBasisPoints:0. */
export function applyPackageFinance(quote: PackageQuote, policy: FinancePolicy) {
  if (!policy.configured) return undefined;
  const snapshot = calculateFinance({ policy, currency: quote.currency, serviceSubtotalMinor: financeMinor(quote.subtotal), discountMinor: financeMinor(quote.discount ?? 0) });
  quote.total = snapshot.totalMinor / 100;
  quote.serviceFee = snapshot.customerFeesMinor / 100;
  quote.perPerson = Math.round(snapshot.totalMinor / (quote.travellers.adults + quote.travellers.children)) / 100;
  if (quote.discount) quote.preDiscountTotal = quote.total + quote.discount;
  quote.finance = customerFinance(snapshot);
  quote.financeHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return snapshot;
}

/** Calendar/from prices are a reference booking, so a fixed fee applies once to that party. */
export function packageFinancePerPerson(rawPerPerson: number, travellers: number, currency: string, policy: FinancePolicy): number {
  if (!policy.configured) return rawPerPerson;
  const snapshot = calculateFinance({ policy, currency, serviceSubtotalMinor: financeMinor(rawPerPerson) * travellers, discountMinor: 0 });
  return Math.round(snapshot.totalMinor / travellers) / 100;
}
