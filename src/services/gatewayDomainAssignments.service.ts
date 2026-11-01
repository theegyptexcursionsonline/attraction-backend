import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { DomainClaim } from '../models/DomainClaim';

/**
 * Domains served through the Cloudflare domain gateway (workers/domain-gateway in the storefront
 * repository) rather than as Netlify aliases. The storefront resolves a gateway domain by the
 * tenant whose customDomain equals it, so each needs that field and its domain claim. Network
 * seed scripts set it when they create a site; this list covers sites created another way.
 *
 * Applied on start-up, once per domain in effect: an assignment already in place is left alone.
 * It never overwrites a different domain and never takes a domain or claim another site holds.
 */
export const GATEWAY_DOMAIN_ASSIGNMENTS: ReadonlyArray<{ slug: string; domain: string }> = [
  // Coral Safari Hurghada: DNS, gateway routes and the Worker's domain list went live 1 Nov 2026.
  { slug: 'coral-safari-hurghada', domain: 'coralsafarihurghada.com' },
];

export type GatewayDomainOutcome =
  | 'attached'
  | 'unchanged'
  | 'missing-site'
  | 'site-has-other-domain'
  | 'domain-in-use'
  | 'claim-held-elsewhere'
  | 'changed-concurrently';

export async function applyGatewayDomainAssignment(slug: string, domain: string): Promise<GatewayDomainOutcome> {
  const site = await Tenant.collection.findOne(
    { slug, status: 'active' },
    { projection: { _id: 1, customDomain: 1 } },
  );
  if (!site) return 'missing-site';
  const _id = site._id as Types.ObjectId;
  const current = typeof site.customDomain === 'string' ? site.customDomain.trim().toLowerCase() : '';
  if (current && current !== domain) return 'site-has-other-domain';

  const others = await Tenant.collection.countDocuments({
    _id: { $ne: _id },
    $or: [{ customDomain: domain }, { domain }],
  });
  if (others) return 'domain-in-use';

  try {
    await DomainClaim.create({ _id: domain, tenantId: _id });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const claim = await DomainClaim.findById(domain).lean();
    if (!claim || String(claim.tenantId) !== String(_id)) return 'claim-held-elsewhere';
  }
  if (current === domain) return 'unchanged';

  const result = await Tenant.collection.updateOne(
    { _id, slug, $or: [{ customDomain: { $exists: false } }, { customDomain: null }, { customDomain: '' }] },
    { $set: { customDomain: domain, customDomainStatus: 'pending_dns', customDomainLastCheckedAt: new Date() } },
  );
  return result.modifiedCount === 1 ? 'attached' : 'changed-concurrently';
}

/** Start-up hook. Logs each outcome and never stops the server from starting. */
export async function applyGatewayDomainAssignments(): Promise<void> {
  for (const { slug, domain } of GATEWAY_DOMAIN_ASSIGNMENTS) {
    try {
      const outcome = await applyGatewayDomainAssignment(slug, domain);
      const log = outcome === 'attached' || outcome === 'unchanged' ? console.log : console.warn;
      log(`[gateway-domains] ${slug} → ${domain}: ${outcome}`);
    } catch (error) {
      console.error(`[gateway-domains] ${slug} → ${domain} failed:`, (error as Error)?.message);
    }
  }
}
