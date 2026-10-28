import { normalizeCustomDomain } from '../utils/customDomain';

/** Seeds that clear customDomain must atomically refuse gateway-owned tenants. */
export function gatewaySafeSeedFilter(slug: string, revision?:number) {
  return { slug, gatewayDomainRevision: revision===undefined ? { $exists:false } : revision,
    $or:[{gatewayOwnedCount:{$exists:false}},{gatewayOwnedCount:0}] };
}

/** Mongoose save uses $where as an atomic extra predicate on existing documents. */
export function guardGatewaySeedDocument(document: { $where?: Record<string, unknown>; gatewayDomainRevision?:number }, domain: unknown): void {
  if (legacyDomainWriteBlocked(domain) || legacyAliasPrimaryWriteBlocked(domain)) throw new Error('Scoped gateway domains cannot be changed by a legacy seed');
  const revision=document.gatewayDomainRevision;
  document.$where = { $and:[document.$where || {},
    {gatewayDomainRevision:revision===undefined?{$exists:false}:revision},
    {$or:[{gatewayOwnedCount:{$exists:false}},{gatewayOwnedCount:0}]}] };
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

/** Alias primaries are separately scoped because they may not be gateway hosts. */
export function legacyAliasPrimaryWriteBlocked(input: unknown): boolean {
  if (process.env.GATEWAY_ALIAS_ENABLED !== 'true') return false;
  const configured=process.env.GATEWAY_ALIAS_PRIMARY_SCOPE;
  if (!configured) throw new Error('Gateway alias primary scope unavailable');
  const values=configured.split(',').map(value=>value.trim());
  if(values.some(value=>!value)) throw new Error('Gateway alias primary scope unavailable');
  const scope=new Set(values.map(value=>normalizeCustomDomain(value)));
  if(typeof input!=='string' || !input) return false;
  try {return scope.has(normalizeCustomDomain(input));} catch {return false;}
}
