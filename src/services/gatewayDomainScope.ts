import { normalizeCustomDomain } from '../utils/customDomain';

/** Seeds that clear customDomain must atomically refuse gateway-owned tenants. */
export function gatewaySafeSeedFilter(slug: string) {
  return { slug, gatewayDomainRevision: { $exists: false } };
}

/** Mongoose save uses $where as an atomic extra predicate on existing documents. */
export function guardGatewaySeedDocument(document: { $where?: Record<string, unknown> }, domain: unknown): void {
  if (legacyDomainWriteBlocked(domain)) throw new Error('Scoped gateway domains cannot be changed by a legacy seed');
  document.$where = { ...document.$where, gatewayDomainRevision: { $exists: false } };
}

/** The bulk reset touches all tenants and cannot safely run during gateway ownership. */
export function assertDestructiveTenantSeedAllowed(): void {
  if (process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED === 'true') {
    throw new Error('The bulk tenant seed is unavailable while gateway ownership is fenced');
  }
}

export async function runDestructiveTenantReset<T>(reset: () => Promise<T>): Promise<T> {
  assertDestructiveTenantSeedAllowed();
  return reset();
}

/** When explicitly enabled, scoped hosts must use the gateway ownership path. */
export function legacyDomainWriteBlocked(input: unknown): boolean {
  if (process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED !== 'true') return false;
  const configured = process.env.GATEWAY_DOMAIN_SCOPE;
  if (!configured) throw new Error('Gateway domain scope unavailable');
  const values = configured.split(',').map(value => value.trim());
  if (values.some(value => !value)) throw new Error('Gateway domain scope unavailable');
  const scope = new Set(values.map(value => normalizeCustomDomain(value)));
  if (typeof input !== 'string' || !input) return false;
  try { return scope.has(normalizeCustomDomain(input)); } catch { return false; }
}
