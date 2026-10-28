import mongoose, { Types } from 'mongoose';
import { DomainClaim } from '../models/DomainClaim';
import { Tenant } from '../models/Tenant';
import { normalizeCustomDomain } from '../utils/customDomain';
import { legacyDomainWriteBlocked } from './gatewayDomainScope';

export class GatewayOwnershipConflict extends Error {}

/** Existing ownership requires explicit exact-domain and tenant confirmation. */
export async function createGatewayDomainOwnership(input: string, tenantId: string, actorId: string,
  adoption?: { adoptExisting: boolean; expectedCurrentDomain?: string }, inventoryLimit = 10_000) {
  if (process.env.GATEWAY_DOMAIN_OWNERSHIP_ENABLED !== 'true' ||
      process.env.GATEWAY_DOMAIN_NAMESPACE_READY !== 'true' ||
      process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED !== 'true') {
    throw new GatewayOwnershipConflict('Gateway ownership unavailable');
  }
  const domain = normalizeCustomDomain(input);
  if (!legacyDomainWriteBlocked(domain) || !Types.ObjectId.isValid(tenantId) || !Types.ObjectId.isValid(actorId)) {
    throw new GatewayOwnershipConflict('Domain or tenant unavailable');
  }
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const tenant = await Tenant.findById(tenantId).select('_id slug status customDomain').session(session).lean();
      if (!tenant || tenant.status !== 'active') throw new GatewayOwnershipConflict('Domain or tenant unavailable');
      if (adoption?.adoptExisting === true &&
          (adoption.expectedCurrentDomain !== domain || tenant.customDomain !== domain)) {
        throw new GatewayOwnershipConflict('Existing domain changed; reload and retry');
      }
      // Onboarding is rare and super-admin only. Read a strictly bounded snapshot
      // so legacy Unicode, whitespace and host variants use the same normalizer.
      // Fail closed at the bound until a normalized indexed namespace is ready.
      const inventory = await Tenant.find({}).select('_id domain customDomain').limit(inventoryLimit + 1)
        .maxTimeMS(5000).session(session).lean();
      if (inventory.length > inventoryLimit) throw new GatewayOwnershipConflict('Domain inventory exceeds the safe bound');
      for (const candidate of inventory) {
        if (String(candidate._id) === tenantId) continue;
        for (const value of [candidate.domain, candidate.customDomain]) {
          if (!value) continue;
          if (typeof value !== 'string') throw new GatewayOwnershipConflict('Domain inventory requires review');
          try {
            if (normalizeCustomDomain(value) === domain) throw new GatewayOwnershipConflict('Domain already assigned');
          } catch (error) {
            if (error instanceof GatewayOwnershipConflict) throw error;
          }
        }
      }
      const existing = await DomainClaim.findById(domain).session(session).lean();
      if (existing) {
        if (existing.provider === 'cloudflare' && String(existing.tenantId) === tenantId && tenant.customDomain === domain) {
          return { id: tenantId, slug: tenant.slug, customDomain: domain, status: 'active' as const };
        }
        if (!existing.provider && String(existing.tenantId) === tenantId && tenant.customDomain === domain &&
            adoption?.adoptExisting === true && adoption.expectedCurrentDomain === domain) {
          const confirmed = await Tenant.findOneAndUpdate({ _id: tenant._id, status: 'active', customDomain: domain },
            { $inc: { gatewayDomainRevision: 1 } }, { session, new: true, runValidators: true }).lean();
          if (!confirmed) throw new GatewayOwnershipConflict('Tenant changed; reload and retry');
          const updated = await DomainClaim.updateOne({ _id: domain, tenantId: tenant._id, provider: { $exists: false } },
            { $set: { provider: 'cloudflare' } }, { session });
          if (updated.modifiedCount !== 1) throw new GatewayOwnershipConflict('Claim changed; reload and retry');
          return { id: tenantId, slug: tenant.slug, customDomain: domain, status: 'active' as const };
        }
        throw new GatewayOwnershipConflict('Existing claim requires review');
      }
      if (tenant.customDomain && !(tenant.customDomain === domain && adoption?.adoptExisting === true && adoption.expectedCurrentDomain === domain)) {
        throw new GatewayOwnershipConflict('Existing domain requires review');
      }
      await DomainClaim.create([{ _id: domain, tenantId: tenant._id, provider: 'cloudflare', createdBy: actorId }], { session });
      if (tenant.customDomain === domain) {
        // Fence the tenant read against concurrent changes while retaining all
        // existing Netlify readiness and site settings for the adoption path.
        const confirmed = await Tenant.findOneAndUpdate({ _id: tenant._id, status: 'active', customDomain: domain },
          { $inc: { gatewayDomainRevision: 1 } }, { session, new: true, runValidators: true }).lean();
        if (!confirmed) throw new GatewayOwnershipConflict('Tenant changed; reload and retry');
        return { id: String(confirmed._id), slug: confirmed.slug, customDomain: domain, status: 'active' as const };
      }
      const updated = await Tenant.findOneAndUpdate({ _id: tenant._id, status: 'active',
        $or: [{customDomain:{$exists:false}}, {customDomain:null}, {customDomain:''}] },
        { $set: { customDomain: domain, customDomainStatus: 'pending_dns', domainMigrated: false, customDomainLastChangedBy: actorId },
          $inc: { gatewayDomainRevision: 1 } },
        { session, new: true, runValidators: true }).lean();
      if (!updated) throw new GatewayOwnershipConflict('Tenant changed; reload and retry');
      return { id: String(updated._id), slug: updated.slug, customDomain: domain, status: 'active' as const };
    }, { readConcern: { level: 'snapshot' } });
  } catch (error) {
    if ((error as {code?:number})?.code === 11000) throw new GatewayOwnershipConflict('Domain already claimed');
    throw error;
  } finally { await session.endSession(); }
}
