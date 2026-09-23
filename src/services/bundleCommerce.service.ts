import crypto from 'crypto';
import { Types } from 'mongoose';
import { CommerceEvent } from './storefrontCommerce.service';

/** Bundle amounts are persisted in minor units by the checkout price authority.
 * A bundle is one retail package: supplier allocations never leave this boundary. */
export function bundleCommerceEvent(input: {
  storefrontTenantId: Types.ObjectId | string;
  bundleDefinitionId: Types.ObjectId | string;
  currency: string;
  totalMinor: number;
}, event: CommerceEvent['event'], orderId?: string): CommerceEvent {
  if (!/^[A-Z]{3}$/.test(input.currency) || !Number.isSafeInteger(input.totalMinor)
    || input.totalMinor <= 0 || input.totalMinor > 100_000_000_000) throw new Error('COMMERCE_INVALID_AMOUNT');
  if (event === 'purchase' && !orderId) throw new Error('COMMERCE_PURCHASE_ID_REQUIRED');
  const value = input.totalMinor / 100;
  return { tenantId: String(input.storefrontTenantId), event, currency: input.currency, value,
    items: [{ item_id: String(input.bundleDefinitionId), price: value, quantity: 1 }],
    ...(event === 'purchase' && orderId ? { transaction_id: crypto.createHash('sha256')
      .update(`bundle-purchase:v1:${input.storefrontTenantId}:${orderId}`).digest('hex') } : {}) };
}
