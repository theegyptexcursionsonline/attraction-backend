import mongoose from 'mongoose';
import { DomainClaim } from '../models/DomainClaim';
import { Tenant } from '../models/Tenant';
import { normalizeCustomDomain } from '../utils/customDomain';

/** A routing identity is valid only when both ownership records agree. */
export async function resolveGatewayDomain(hostname: string) {
  let domain: string;
  try { domain = normalizeCustomDomain(hostname); } catch { return null; }
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const claim = await DomainClaim.findById(domain).session(session).lean();
      if (!claim || claim.provider !== 'cloudflare') return null;
      // Runtime trusts this unique normalized namespace only after every scoped
      // writer is fenced and the bounded onboarding inventory succeeds.
      const tenant = await Tenant.findById(claim.tenantId)
        .select('_id slug status customDomain').session(session).lean();
      if (!tenant) return null;
      if (String(tenant._id) !== String(claim.tenantId) || tenant.status !== 'active' || tenant.customDomain !== domain) return null;
      return { id: String(tenant._id), slug: tenant.slug, customDomain: domain, status: 'active' as const };
    }, { readConcern: { level: 'snapshot' } });
  } finally { await session.endSession(); }
}
