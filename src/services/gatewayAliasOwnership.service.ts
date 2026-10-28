import mongoose, { Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { DomainClaim } from '../models/DomainClaim';
import { Tenant } from '../models/Tenant';
import { normalizeCustomDomain } from '../utils/customDomain';
import { legacyAliasPrimaryWriteBlocked, legacyDomainWriteBlocked } from './gatewayDomainScope';
import { GatewayOwnershipConflict } from './gatewayDomainOwnership.service';
import { gatewayOwnershipProvenance } from './gatewayOwnershipProvenance';

/** Claim an explicitly approved alias without changing the tenant's primary. */
export async function createGatewayAlias(input:string, tenantId:string, actorId:string, expectedPrimaryDomain:string, inventoryLimit=10_000) {
  if (process.env.GATEWAY_ALIAS_ENABLED !== 'true' || process.env.GATEWAY_DOMAIN_OWNERSHIP_ENABLED !== 'true' ||
      process.env.GATEWAY_DOMAIN_NAMESPACE_READY !== 'true' || process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED !== 'true') {
    throw new GatewayOwnershipConflict('Gateway alias ownership unavailable');
  }
  const alias=normalizeCustomDomain(input), primary=normalizeCustomDomain(expectedPrimaryDomain);
  if (expectedPrimaryDomain !== primary || alias === primary || !legacyDomainWriteBlocked(alias) || !legacyAliasPrimaryWriteBlocked(primary) ||
      !Types.ObjectId.isValid(tenantId) || !Types.ObjectId.isValid(actorId)) throw new GatewayOwnershipConflict('Alias or tenant unavailable');
  const session=await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const tenant=await Tenant.findById(tenantId).select('_id slug status customDomain customDomainStatus domainMigrated customDomainLastChangedBy gatewayDomainRevision gatewayOwnedCount').session(session).lean();
      if (!tenant || tenant.status !== 'active' || tenant.customDomain !== primary) throw new GatewayOwnershipConflict('Primary domain changed; reload and retry');
      const owned=await DomainClaim.countDocuments({tenantId:tenant._id,provider:'cloudflare'}).session(session);
      if((tenant.gatewayOwnedCount ?? 0)!==owned) throw new GatewayOwnershipConflict('Gateway ownership count requires reconciliation');
      const inventory=await Tenant.find({}).select('_id domain customDomain').limit(inventoryLimit+1).maxTimeMS(5000).session(session).lean();
      if (inventory.length>inventoryLimit) throw new GatewayOwnershipConflict('Domain inventory exceeds the safe bound');
      for(const candidate of inventory) {
        if(String(candidate._id)===tenantId) continue;
        for(const value of [candidate.domain,candidate.customDomain]) {
          if(!value) continue;
          if(typeof value!=='string') throw new GatewayOwnershipConflict('Domain inventory requires review');
          try { if([alias,primary].includes(normalizeCustomDomain(value))) throw new GatewayOwnershipConflict('Domain already assigned'); }
          catch(error) {if(error instanceof GatewayOwnershipConflict) throw error;}
        }
      }
      const primaryClaim=await DomainClaim.findById(primary).session(session).lean();
      if (primaryClaim && String(primaryClaim.tenantId)!==tenantId) throw new GatewayOwnershipConflict('Primary claim conflicts');
      const existing=await DomainClaim.findById(alias).session(session).lean();
      if(existing) {
        if(existing.provider==='cloudflare' && existing.claimGeneration && existing.kind==='alias' && String(existing.tenantId)===tenantId && existing.primaryDomain===primary)
          return {id:tenantId,slug:tenant.slug,aliasApex:alias,primaryCanonical:primary,status:'active' as const};
        throw new GatewayOwnershipConflict('Alias already claimed');
      }
      await DomainClaim.create([{_id:alias,tenantId:tenant._id,provider:'cloudflare',kind:'alias',primaryDomain:primary,claimGeneration:randomUUID(),createdBy:actorId,
        gatewayOriginal:gatewayOwnershipProvenance(tenant as unknown as Record<string,unknown>)}],{session});
      const updated=await Tenant.findOneAndUpdate({_id:tenant._id,status:'active',customDomain:primary},
        {$inc:{gatewayDomainRevision:1,gatewayOwnedCount:1}},{session,new:true,runValidators:true}).lean();
      if(!updated) throw new GatewayOwnershipConflict('Primary domain changed; reload and retry');
      return {id:String(updated._id),slug:updated.slug,aliasApex:alias,primaryCanonical:primary,status:'active' as const};
    },{readConcern:{level:'snapshot'}});
  } catch(error) {
    if((error as {code?:number})?.code===11000) throw new GatewayOwnershipConflict('Alias already claimed');
    throw error;
  } finally {await session.endSession();}
}
