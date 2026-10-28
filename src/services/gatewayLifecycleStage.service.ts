import mongoose from 'mongoose';
import { DomainClaim } from '../models/DomainClaim';
import { Tenant } from '../models/Tenant';
import { GatewayLifecycleNonce } from '../models/GatewayLifecycleNonce';
import { authenticateGatewayLifecycleProof, evaluateGatewayLifecycleProof, GatewayLifecycleProof } from './gatewayLifecycleProof';
import { validateGatewayRollbackReceipt } from './gatewayRollbackReceipt';
import { legacyDomainWriteBlocked } from './gatewayDomainScope';
import { GatewayLifecycleConflict } from './gatewayLifecycleActivation.service';
import { recordGatewayLifecycleOperation } from './gatewayLifecycleOperation.service';

/** Internal only: authenticated producer and super-admin route are not yet wired. */
export async function stageGatewayDomain(proof:GatewayLifecycleProof, signature:string, receipt:string, now=Date.now()) {
  if(process.env.GATEWAY_LIFECYCLE_ENABLED!=='true' || process.env.GATEWAY_DOMAIN_NAMESPACE_READY!=='true' ||
     process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED!=='true') throw new GatewayLifecycleConflict('Gateway lifecycle unavailable');
  const secret=process.env.GATEWAY_LIFECYCLE_ATTESTATION_SECRET || '', accountId=process.env.GATEWAY_LIFECYCLE_ACCOUNT_ID || '';
  let zones:Record<string,string>;
  try {zones=JSON.parse(process.env.GATEWAY_LIFECYCLE_ZONE_MAP || '');} catch {throw new GatewayLifecycleConflict('Gateway lifecycle unavailable');}
  if(proof.action!=='stage' || !legacyDomainWriteBlocked(proof.domain) || !authenticateGatewayLifecycleProof(proof,signature,secret,now))
    throw new GatewayLifecycleConflict('Observation unavailable');
  const zoneId=zones[proof.domain] || '';
  const hash=validateGatewayRollbackReceipt(receipt,accountId,zoneId,proof.domain);
  if(!hash || hash!==proof.previousTarget) throw new GatewayLifecycleConflict('Rollback receipt unavailable');
  const session=await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const claim=await DomainClaim.findById(proof.domain).session(session).lean();
      const tenant=await Tenant.findById(proof.tenantId).select('_id slug status customDomain gatewayDomainRevision').session(session).lean();
      if(!claim || claim.provider!=='cloudflare' || String(claim.tenantId)!==proof.tenantId || !tenant || tenant.status!=='active' ||
         tenant.gatewayDomainRevision!==proof.claimRevision || (claim.kind==='alias'?tenant.customDomain!==claim.primaryDomain:tenant.customDomain!==proof.domain))
        throw new GatewayLifecycleConflict('Ownership changed');
      if((claim as {kind?:unknown}).kind!==undefined && (claim as {kind?:unknown}).kind!=='alias') throw new GatewayLifecycleConflict('Ownership changed');
      const expected={domain:String(claim._id),claimId:String(claim._id),claimGeneration:claim.claimGeneration || '',tenantId:String(tenant._id),tenantSlug:tenant.slug,
        claimRevision:tenant.gatewayDomainRevision!,accountId,zoneId};
      if(!evaluateGatewayLifecycleProof(proof,expected).allowed) throw new GatewayLifecycleConflict('Observation unavailable');
      if(!authenticateGatewayLifecycleProof(proof,signature,secret,Date.now())) throw new GatewayLifecycleConflict('Observation expired');
      if(['active','unverified'].includes(claim.gatewayState || '') || (claim.gatewayRollbackTarget && claim.gatewayRollbackTarget!==hash) ||
         (claim.gatewayRoutePolicyFingerprint && claim.gatewayRoutePolicyFingerprint!==proof.routeFingerprint) ||
         (claim.gatewayRollbackReceipt && claim.gatewayRollbackReceipt!==receipt)) throw new GatewayLifecycleConflict('Gateway baseline changed');
      await GatewayLifecycleNonce.create([{_id:proof.nonce,expiresAt:new Date(proof.expiresAt+300_000)}],{session});
      await recordGatewayLifecycleOperation(proof,'staged',session);
      const savedClaim=await DomainClaim.findOneAndUpdate({_id:proof.domain,tenantId:tenant._id,provider:'cloudflare',claimGeneration:proof.claimGeneration},
        {$set:{gatewayState:'staged',gatewayRollbackTarget:hash,gatewayRollbackReceipt:receipt,gatewayRoutePolicyFingerprint:proof.routeFingerprint}},
        {session,new:true,runValidators:true}).lean();
      if(!savedClaim) throw new GatewayLifecycleConflict('Ownership changed');
      const savedTenant=await Tenant.findOneAndUpdate({_id:tenant._id,slug:proof.tenantSlug,status:'active',customDomain:tenant.customDomain,gatewayDomainRevision:proof.claimRevision},
        {$inc:{gatewayDomainRevision:1}},{session,new:true,runValidators:true}).lean();
      if(!savedTenant) throw new GatewayLifecycleConflict('Ownership changed');
      return {domain:proof.domain,tenantId:proof.tenantId,revision:savedTenant.gatewayDomainRevision,state:'staged' as const};
    },{readConcern:{level:'snapshot'}});
  } catch(error) {
    if((error as {code?:number})?.code===11000) throw new GatewayLifecycleConflict('Observation already used');
    throw error;
  } finally {await session.endSession();}
}
