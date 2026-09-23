import crypto from 'crypto';
import { IBooking } from '../types';
import { addonLineTotal } from '../utils/bookingAddons';

export type CommerceEvent = {
  tenantId: string;
  event: 'view_item' | 'begin_checkout' | 'purchase';
  currency: string;
  value: number;
  items: Array<{ item_id: string; price: number; quantity: number }>;
  transaction_id?: string;
};
const digest = (input: string): string => crypto.createHash('sha256').update(input).digest('hex');
const cents = (n: number): number => {
  if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new Error('INVALID_COMMERCE_AMOUNT');
  return Math.round(n * 100);
};
/** Each selection is one priced package. Its amount includes the exact guest tiers
 * and selected extras, rather than pretending all guests paid the adult price.
 * Allocate order discounts in integer minor units; fees are a separate line.
 * Only opaque catalog identifiers and amounts leave the booking boundary.
 */
export function commerceSelection(input: Pick<IBooking, 'tenantId' | 'attractionId' | 'items' | 'subtotal' | 'fees' | 'discount' | 'total' | 'currency'>,
  event: 'begin_checkout' | 'purchase', bookingId?: string): CommerceEvent {
  const currency = input.currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || !input.items.length || input.items.length > 49) throw new Error('INVALID_COMMERCE_SELECTION');
  const amounts = input.items.map(item => cents(item.totalPrice) + (item.addons || []).reduce((sum, addon) => sum + cents(addonLineTotal(addon)), 0));
  const subtotal = amounts.reduce((sum, n) => sum + n, 0);
  const discount = cents(input.discount);
  const fees = cents(input.fees);
  const total = cents(input.total);
  if (subtotal !== cents(input.subtotal) || discount > subtotal || subtotal + fees - discount !== total) throw new Error('COMMERCE_TOTAL_MISMATCH');
  const allocations = amounts.map(amount => subtotal ? Math.floor(discount * amount / subtotal) : 0);
  let remainder = discount - allocations.reduce((sum, n) => sum + n, 0);
  const ranked = amounts.map((amount, index) => ({ index, fraction: subtotal ? discount * amount % subtotal : 0 }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of ranked) { if (remainder > 0 && allocations[index] < amounts[index]) { allocations[index]++; remainder--; } }
  if (remainder) throw new Error('COMMERCE_TOTAL_MISMATCH');
  const items = amounts.map((amount, index) => {
    const allocation = allocations[index];
    return { item_id: String(input.attractionId), price: (amount - allocation) / 100, quantity: 1 };
  });
  if (fees) items.push({ item_id: 'service_fee', price: fees / 100, quantity: 1 });
  if (event === 'purchase' && !bookingId) throw new Error('MISSING_PURCHASE_ID');
  return { tenantId: String(input.tenantId), event, currency, value: total / 100, items,
    ...(event === 'purchase' ? { transaction_id: digest(`purchase:v1:${input.tenantId}:${bookingId}`) } : {}) };
}
