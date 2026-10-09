import { ClientSession } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { BundleDefinition } from '../models/BundleDefinition';
import { siteSaleCurrencies, normalizeCurrencyCode } from '../utils/discountCurrency';
import { FinanceError, FinancePolicy, financePolicy } from '../utils/financeSettings';

export async function loadFinancePolicy(tenantId: unknown, session?: ClientSession): Promise<FinancePolicy> {
  const site = await Tenant.findOne({ _id: tenantId }).select('financeSettings financeRevision').session(session ?? null).lean();
  if (!site) throw new FinanceError('FINANCE_UNAVAILABLE', 'Website fee settings are unavailable.');
  return financePolicy(site);
}

/** A real write inside booking creation serializes price acceptance against a policy edit. */
export async function fenceFinancePolicy(policy: FinancePolicy, session?: ClientSession): Promise<void> {
  const result = await Tenant.updateOne({ _id: policy.tenantId,
    financeRevision: policy.revision === 0 ? { $in: [0, null] } : policy.revision,
  }, { $inc: { financeBookingFence: 1 } }, { ...(session ? { session } : {}), timestamps: false });
  if (result.matchedCount !== 1) throw new FinanceError('FINANCE_CHANGED', 'Website fees changed. Review the new price before booking.');
}

export async function financeSaleCurrencies(tenantId: unknown): Promise<string[]> {
  const [tours, bundles] = await Promise.all([
    siteSaleCurrencies(tenantId),
    BundleDefinition.distinct('currency', { storefrontTenantId: tenantId, status: { $ne: 'archived' } }),
  ]);
  return [...new Set([...tours, ...bundles.map(normalizeCurrencyCode).filter((value): value is string => value !== null)])].sort();
}
