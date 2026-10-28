import mongoose, { Types } from 'mongoose';
import { DomainClaim } from '../models/DomainClaim';
import { Tenant } from '../models/Tenant';
import { GatewayLifecycleArchive } from '../models/GatewayLifecycleArchive';
import { GatewayLifecycleOperation } from '../models/GatewayLifecycleOperation';
import { normalizeCustomDomain } from '../utils/customDomain';
import { GatewayLifecycleConflict } from './gatewayLifecycleActivation.service';

/** Historical result only; provider routing and DNS are never inferred here. */
function allowedStatusDomain(domain:string):boolean {
  if(process.env.GATEWAY_LIFECYCLE_STATUS_ENABLED!=='true') throw new GatewayLifecycleConflict('Lifecycle status unavailable');
  const configured=process.env.GATEWAY_LIFECYCLE_STATUS_SCOPE;
  if(!configured) throw new GatewayLifecycleConflict('Lifecycle status unavailable');
  let scope:Set<string>;
  try {
    const entries=configured.split(',').map(item=>item.trim());
    if(entries.some(item=>!item)) throw new Error();
    scope=new Set(entries.map(normalizeCustomDomain));
    if(normalizeCustomDomain(domain)!==domain) return false;
  } catch {throw new GatewayLifecycleConflict('Lifecycle status unavailable');}
  return scope.has(domain);
}

export async function getGatewayLifecycleStatus(domain:string,tenantId:string,generation:string) {
  if(!allowedStatusDomain(domain) || !Types.ObjectId.isValid(tenantId) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(generation)) return null;
  const session=await mongoose.startSession();
  try {
    return await session.withTransaction(async()=>{
      const archive=await GatewayLifecycleArchive.findOne({_id:`${domain}:${generation}`,tenantId:new Types.ObjectId(tenantId)})
        .select('_id domain tenantId claimGeneration detachedAt').session(session).lean();
      if(!archive) return null;
      const claim=await DomainClaim.findById(domain).select('_id tenantId provider claimGeneration gatewayState').session(session).lean();
      const tenant=await Tenant.findById(tenantId).select('_id gatewayDomainRevision gatewayOwnedCount').session(session).lean();
      const currentClaim=!claim ? 'absent' : String(claim.tenantId)!==tenantId ? 'another-owner' :
        claim.provider==='cloudflare' ? 'gateway-claim' : 'legacy-claim';
      return {domain,tenantId,claimGeneration:generation,historical:{outcome:'detached' as const,at:archive.detachedAt},
        current:{claim:currentClaim,state:claim && String(claim.tenantId)===tenantId && claim.provider==='cloudflare' ? claim.gatewayState ?? 'reserved' : null,
          tenantPresent:!!tenant,revision:tenant?.gatewayDomainRevision ?? null,ownedCount:tenant?.gatewayOwnedCount ?? null},
        routing:'not-checked' as const};
    },{readConcern:{level:'snapshot'}});
  } finally {await session.endSession();}
}

/** Recover a historical operation without assuming the current provider state. */
export async function getGatewayLifecycleOperation(domain:string,tenantId:string,operationId:string) {
  if(!allowedStatusDomain(domain) || !Types.ObjectId.isValid(tenantId) || !/^[a-f0-9]{32}$/.test(operationId)) return null;
  const session=await mongoose.startSession();
  try {
    return await session.withTransaction(async()=>{
      const operation=await GatewayLifecycleOperation.findOne({_id:operationId,domain,tenantId:new Types.ObjectId(tenantId)})
        .select('_id domain tenantId claimGeneration action proofHash resultState resultRevision createdAt expiresAt').session(session).lean();
      if(!operation) return null;
      const claim=await DomainClaim.findById(domain).select('_id tenantId provider claimGeneration gatewayState').session(session).lean();
      const tenant=await Tenant.findById(tenantId).select('_id gatewayDomainRevision gatewayOwnedCount').session(session).lean();
      const sameOwner=!!claim && String(claim.tenantId)===tenantId;
      const currentClaim=!claim?'absent':!sameOwner?'another-owner':claim.provider==='cloudflare'?'gateway-claim':'legacy-claim';
      return {domain,tenantId,operationId,historical:{action:operation.action,state:operation.resultState,revision:operation.resultRevision,
        claimGeneration:operation.claimGeneration,proofHash:operation.proofHash,at:operation.createdAt,retainedUntil:operation.expiresAt},
        current:{claim:currentClaim,state:sameOwner && claim?.provider==='cloudflare' ? claim.gatewayState ?? 'reserved' : null,
          sameGeneration:sameOwner ? claim?.claimGeneration===operation.claimGeneration : false,
          revision:tenant?.gatewayDomainRevision ?? null,ownedCount:tenant?.gatewayOwnedCount ?? null},routing:'not-checked' as const};
    },{readConcern:{level:'snapshot'}});
  } finally {await session.endSession();}
}
