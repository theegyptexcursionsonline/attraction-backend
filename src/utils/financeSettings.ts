import { z } from 'zod';

export const FINANCE_FEE_KINDS = ['transaction', 'tax', 'booking', 'payout'] as const;
export type FinanceFeeKind = typeof FINANCE_FEE_KINDS[number];
const amount = z.number().finite().min(0).max(1_000_000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use at most two decimal places');
const common = { enabled: z.boolean(), payer: z.enum(['customer', 'business']) };
export const financeFeeRuleSchema = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('percentage'), percentage: amount.refine(value => value <= 100, 'Percentage must be between 0 and 100') }).strict(),
  z.object({ ...common, type: z.literal('fixed'), fixedAmounts: z.record(z.string().regex(/^[A-Z]{3}$/), amount).refine(value => Object.keys(value).length <= 30, 'At most 30 currencies') }).strict(),
]);
export const financeFeesSchema = z.object({ transaction: financeFeeRuleSchema, tax: financeFeeRuleSchema, booking: financeFeeRuleSchema, payout: financeFeeRuleSchema }).strict();
/**
 * Fees a super admin can fix for a website so its own admins cannot change them (client
 * request, 10 Oct 2026). Tax is the website's own and can never be locked.
 */
export const FINANCE_LOCKABLE_KINDS = ['transaction', 'booking', 'payout'] as const;
export type FinanceLockableKind = typeof FINANCE_LOCKABLE_KINDS[number];
export const financeLocksSchema = z.object({ transaction: z.boolean(), booking: z.boolean(), payout: z.boolean() }).strict();
export type FinanceLocks = z.infer<typeof financeLocksSchema>;
export const initialFinanceLocks = (): FinanceLocks => ({ transaction: false, booking: false, payout: false });
export const financeSettingsUpdateSchema = z.object({ expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1), fees: financeFeesSchema, locks: financeLocksSchema.optional() }).strict();
export type FinanceFeeRule = z.infer<typeof financeFeeRuleSchema>;
export type FinanceFees = z.infer<typeof financeFeesSchema>;
/** `locks` is absent on settings saved before locks existed: nothing is locked then. */
export type FinanceSettings = { version: 1; fees: FinanceFees; locks?: FinanceLocks };
export const financeSettingsSchema = z.object({ version: z.literal(1), fees: financeFeesSchema, locks: financeLocksSchema.optional() }).strict();

/** Two rules are the same fee when every field that changes a charge is equal (fixed-amount key order aside). */
export function sameFinanceFeeRule(left: FinanceFeeRule, right: FinanceFeeRule): boolean {
  const canonical = (rule: FinanceFeeRule) => JSON.stringify(rule.type === 'percentage'
    ? [rule.enabled, rule.payer, rule.type, rule.percentage]
    : [rule.enabled, rule.payer, rule.type, Object.entries(rule.fixedAmounts).sort(([a], [b]) => a.localeCompare(b))]);
  return canonical(left) === canonical(right);
}

/** Display defaults are not an activation: absent settings preserve each product's legacy contract. */
export function initialFinanceFees(): FinanceFees {
  return {
    transaction: { enabled: false, type: 'percentage', payer: 'business', percentage: 0 },
    tax: { enabled: false, type: 'percentage', payer: 'customer', percentage: 0 },
    booking: { enabled: true, type: 'percentage', payer: 'customer', percentage: 5 },
    payout: { enabled: false, type: 'percentage', payer: 'business', percentage: 0 },
  };
}

export class FinanceError extends Error {
  constructor(public readonly code: 'FINANCE_UNAVAILABLE' | 'FINANCE_CHANGED' | 'FINANCE_CURRENCY_UNAVAILABLE' | 'FINANCE_MARGIN_INVALID', message: string) { super(message); }
}

export interface FinancePolicy { tenantId: string; revision: number; configured: boolean; fees: FinanceFees; locks: FinanceLocks }
export function financePolicy(site: { _id: unknown; financeSettings?: unknown; financeRevision?: unknown }): FinancePolicy {
  const revision = site.financeRevision ?? 0;
  if (!Number.isSafeInteger(revision) || Number(revision) < 0) throw new FinanceError('FINANCE_UNAVAILABLE', 'Website fee settings are unavailable.');
  if (site.financeSettings === undefined || site.financeSettings === null) {
    if (revision !== 0) throw new FinanceError('FINANCE_UNAVAILABLE', 'Website fee settings are incomplete.');
    return { tenantId: String(site._id), revision: 0, configured: false, fees: initialFinanceFees(), locks: initialFinanceLocks() };
  }
  const parsed = financeSettingsSchema.safeParse(site.financeSettings);
  if (!parsed.success || revision === 0) throw new FinanceError('FINANCE_UNAVAILABLE', 'Website fee settings are invalid.');
  return { tenantId: String(site._id), revision: Number(revision), configured: true, fees: parsed.data.fees, locks: parsed.data.locks ?? initialFinanceLocks() };
}

export interface FinanceLine {
  kind: FinanceFeeKind;
  type: 'percentage' | 'fixed';
  payer: 'customer' | 'business';
  percentage?: number;
  fixedAmountMinor?: number;
  amountMinor: number;
}
export interface FinanceSnapshot {
  version: 1;
  policyTenantId: string;
  policyRevision: number;
  currency: string;
  serviceSubtotalMinor: number;
  discountMinor: number;
  discountedServiceMinor: number;
  lines: FinanceLine[];
  customerFeesMinor: number;
  businessFeesMinor: number;
  totalMinor: number;
}

export const financeMinor = (major: number): number => {
  const minor = Math.round(major * 100);
  if (!Number.isFinite(major) || major < 0 || !Number.isSafeInteger(minor)) throw new FinanceError('FINANCE_UNAVAILABLE', 'Booking amount is invalid.');
  return minor;
};

/** Existing booking/payment rails use hundredths. Refuse unsupported precision, never guess FX. */
export function financeCurrency(currency: string): string {
  const normalized = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(normalized) || new Intl.NumberFormat('en', { style: 'currency', currency: normalized }).resolvedOptions().maximumFractionDigits !== 2) {
    throw new FinanceError('FINANCE_CURRENCY_UNAVAILABLE', 'Fee pricing is unavailable for this booking currency.');
  }
  return normalized;
}

/** Fees never compound: every percentage uses the same discounted service amount. */
/** What a price needs from the policy: who may edit the fees (locks) never changes a charge. */
export type FinancePricingPolicy = Omit<FinancePolicy, 'locks'>;
export function calculateFinance(input: { policy: FinancePricingPolicy; currency: string; serviceSubtotalMinor: number; discountMinor: number }): FinanceSnapshot {
  const { policy, serviceSubtotalMinor, discountMinor } = input;
  if (!policy.configured) throw new FinanceError('FINANCE_UNAVAILABLE', 'Finance policy has not been activated.');
  const currency = financeCurrency(input.currency);
  if (![serviceSubtotalMinor, discountMinor].every(value => Number.isSafeInteger(value) && value >= 0) || discountMinor > serviceSubtotalMinor) {
    throw new FinanceError('FINANCE_UNAVAILABLE', 'Booking amount is invalid.');
  }
  const discountedServiceMinor = serviceSubtotalMinor - discountMinor;
  const lines = FINANCE_FEE_KINDS.flatMap((kind): FinanceLine[] => {
    const rule = policy.fees[kind];
    if (!rule.enabled) return [];
    if (rule.type === 'percentage') {
      const basisPoints = Math.round(rule.percentage * 100);
      const amountMinor = Number((BigInt(discountedServiceMinor) * BigInt(basisPoints) + 5000n) / 10000n);
      return [{ kind, type: rule.type, payer: rule.payer, percentage: rule.percentage, amountMinor }];
    }
    const fixed = rule.fixedAmounts[currency];
    if (fixed === undefined) throw new FinanceError('FINANCE_CURRENCY_UNAVAILABLE', `The ${kind} fee has no amount configured for ${currency}.`);
    const fixedAmountMinor = financeMinor(fixed);
    return [{ kind, type: rule.type, payer: rule.payer, fixedAmountMinor, amountMinor: fixedAmountMinor }];
  });
  const sum = (payer: FinanceLine['payer']) => lines.filter(line => line.payer === payer).reduce((total, line) => total + line.amountMinor, 0);
  const customerFeesMinor = sum('customer');
  const businessFeesMinor = sum('business');
  const totalMinor = discountedServiceMinor + customerFeesMinor;
  if (![customerFeesMinor, businessFeesMinor, totalMinor].every(Number.isSafeInteger)) throw new FinanceError('FINANCE_UNAVAILABLE', 'Booking amount is too large.');
  return { version: 1, policyTenantId: policy.tenantId, policyRevision: policy.revision, currency,
    serviceSubtotalMinor, discountMinor, discountedServiceMinor, lines, customerFeesMinor, businessFeesMinor, totalMinor };
}

export function customerFinance(snapshot: FinanceSnapshot) {
  return { version: snapshot.version, policyRevision: snapshot.policyRevision, configured: true as const,
    discountedServiceMinor: snapshot.discountedServiceMinor, customerFeesMinor: snapshot.customerFeesMinor, totalMinor: snapshot.totalMinor,
    lines: snapshot.lines.filter(line => line.payer === 'customer').map(({ payer: _payer, ...line }) => line) };
}

/** General tenant editors cannot bypass the versioned Finance endpoint. */
export const withoutFinanceFields = (body: unknown): Record<string, unknown> => Object.fromEntries(
  Object.entries(body && typeof body === 'object' && !Array.isArray(body) ? body : {}).filter(([key]) => !['financeSettings', 'financeRevision', 'financeBookingFence', 'attendanceBookingFence'].some(field => key === field || key.startsWith(`${field}.`))),
);
