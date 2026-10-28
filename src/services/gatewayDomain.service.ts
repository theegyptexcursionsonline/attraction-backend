import mongoose from 'mongoose';
import { DomainClaim } from '../models/DomainClaim';
import { Tenant } from '../models/Tenant';
import { normalizeCustomDomain } from '../utils/customDomain';
import { domainToASCII } from 'url';

const validGeneration=(value:unknown):value is string => typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const validVerification=(value:unknown):boolean => {
  const time=value instanceof Date ? value.getTime() : NaN, now=Date.now();
  return Number.isFinite(time) && time<=now;
};

/** A routing identity is valid only when both ownership records agree. */
export async function resolveGatewayDomain(hostname: string) {
  let domain: string;
  try { domain = normalizeCustomDomain(hostname); } catch { return null; }
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const claim = await DomainClaim.findById(domain).session(session).lean();
      if (!claim || claim.provider !== 'cloudflare' || !validGeneration(claim.claimGeneration)) return null;
      if ((claim as {kind?:unknown}).kind !== undefined && (claim as {kind?:unknown}).kind !== 'alias') return null;
      // Runtime trusts this unique normalized namespace only after every scoped
      // writer is fenced and the bounded onboarding inventory succeeds.
      const tenant = await Tenant.findById(claim.tenantId)
        .select('_id slug status customDomain gatewayVerifiedEmailDomain gatewayEmailState gatewayEmailManaged').session(session).lean();
      if (!tenant) return null;
      if (claim.kind === 'alias') {
        let primary:string;
        try { primary = normalizeCustomDomain(claim.primaryDomain || ''); } catch { return null; }
        if (process.env.GATEWAY_ALIAS_ENABLED !== 'true' || !claim.primaryDomain || String(tenant._id) !== String(claim.tenantId) ||
            tenant.status !== 'active' || tenant.customDomain !== claim.primaryDomain ||
            primary !== claim.primaryDomain || claim.primaryDomain === domain) return null;
        const visitorHost = domainToASCII(hostname.trim().toLowerCase().replace(/\.$/, ''));
        if (visitorHost !== domain && visitorHost !== `www.${domain}`) return null;
        const primaryClaim=await DomainClaim.findById(primary).session(session).lean();
        const canonicalReady=claim.gatewayState==='active' && validVerification(claim.gatewayVerifiedAt) && !!primaryClaim && primaryClaim.provider==='cloudflare' && primaryClaim.kind===undefined &&
          String(primaryClaim.tenantId)===String(tenant._id) && validGeneration(primaryClaim.claimGeneration) &&
          primaryClaim.gatewayState==='active' && tenant.gatewayEmailManaged===true && tenant.gatewayEmailState==='verified' && tenant.gatewayVerifiedEmailDomain===primary &&
          validVerification(primaryClaim.gatewayVerifiedAt);
        return { id: String(tenant._id), slug: tenant.slug, status:'active' as const, claimId:domain, claimGeneration:claim.claimGeneration,
          visitorHost, aliasApex:domain, primaryCanonical:claim.primaryDomain, canonicalReady, customDomain:claim.primaryDomain };
      }
      if (String(tenant._id) !== String(claim.tenantId) || tenant.status !== 'active' || tenant.customDomain !== domain) return null;
      const canonicalReady=claim.gatewayState==='active' && tenant.gatewayEmailManaged===true && tenant.gatewayEmailState==='verified' && tenant.gatewayVerifiedEmailDomain===domain && validVerification(claim.gatewayVerifiedAt);
      return { id: String(tenant._id), slug: tenant.slug, customDomain: domain, status: 'active' as const, claimId:domain, claimGeneration:claim.claimGeneration,canonicalReady };
    }, { readConcern: { level: 'snapshot' } });
  } finally { await session.endSession(); }
}
