import mongoose from 'mongoose';
import { DomainClaim } from '../models/DomainClaim';
import { Tenant } from '../models/Tenant';
import { GatewayLifecycleNonce } from '../models/GatewayLifecycleNonce';
import { authenticateGatewayLifecycleProof, evaluateGatewayLifecycleProof, GatewayLifecycleProof } from './gatewayLifecycleProof';
import { gatewayRollbackOriginKind, validateGatewayRollbackReceipt } from './gatewayRollbackReceipt';
import { legacyDomainWriteBlocked } from './gatewayDomainScope';
import { GatewayLifecycleConflict } from './gatewayLifecycleActivation.service';
import { recordGatewayLifecycleOperation } from './gatewayLifecycleOperation.service';

/** Rollback preserves the claim; external routing must already be restored. */
export async function rollbackGatewayDomain(proof:GatewayLifecycleProof, signature:string, now=Date.now()) {
  if(process.env.GATEWAY_LIFECYCLE_ENABLED!=='true' || process.env.GATEWAY_DOMAIN_NAMESPACE_READY!=='true' ||
     process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED!=='true') throw new GatewayLifecycleConflict('Gateway lifecycle unavailable');
  const secret=process.env.GATEWAY_LIFECYCLE_ATTESTATION_SECRET || '', accountId=process.env.GATEWAY_LIFECYCLE_ACCOUNT_ID || '';
  let zones:Record<string,string>;
  try {zones=JSON.parse(process.env.GATEWAY_LIFECYCLE_ZONE_MAP || '');} catch {throw new GatewayLifecycleConflict('Gateway lifecycle unavailable');}
  if(proof.action!=='rollback' || !legacyDomainWriteBlocked(proof.domain) || !authenticateGatewayLifecycleProof(proof,signature,secret,now))
    throw new GatewayLifecycleConflict('Observation unavailable');
  const zoneId=zones[proof.domain] || '', session=await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const claim=await DomainClaim.findById(proof.domain).session(session).lean();
      const tenant=await Tenant.findById(proof.tenantId).select('_id slug status customDomain gatewayDomainRevision').session(session).lean();
      if(!claim || claim.provider!=='cloudflare' || !['active','unverified'].includes(claim.gatewayState || '') || String(claim.tenantId)!==proof.tenantId || !tenant ||
         tenant.status!=='active' || tenant.gatewayDomainRevision!==proof.claimRevision ||
         (claim.kind==='alias'?tenant.customDomain!==claim.primaryDomain:tenant.customDomain!==proof.domain)) throw new GatewayLifecycleConflict('Ownership changed');
      if((claim as {kind?:unknown}).kind!==undefined && (claim as {kind?:unknown}).kind!=='alias') throw new GatewayLifecycleConflict('Ownership changed');
      const expected={domain:String(claim._id),claimId:String(claim._id),claimGeneration:claim.claimGeneration || '',tenantId:String(tenant._id),tenantSlug:tenant.slug,
        claimRevision:tenant.gatewayDomainRevision!,accountId,zoneId};
      if(!evaluateGatewayLifecycleProof(proof,expected).allowed || !authenticateGatewayLifecycleProof(proof,signature,secret,Date.now()))
        throw new GatewayLifecycleConflict('Observation unavailable');
      const hash=validateGatewayRollbackReceipt(claim.gatewayRollbackReceipt || '',accountId,zoneId,proof.domain);
      const originKind=gatewayRollbackOriginKind(claim.gatewayRollbackReceipt || '',accountId,zoneId,proof.domain);
      if(!hash || claim.gatewayRollbackTarget!==hash || proof.previousTarget!==hash || typeof claim.gatewayPreviousEmailDomainPresent!=='boolean')
        throw new GatewayLifecycleConflict('Rollback baseline unavailable');
      if(!originKind || (originKind==='network' && proof.tenant!=='matched')) throw new GatewayLifecycleConflict('Rollback tenant verification unavailable');
      await GatewayLifecycleNonce.create([{_id:proof.nonce,expiresAt:new Date(proof.expiresAt+300_000)}],{session});
      await recordGatewayLifecycleOperation(proof,'rolled_back',session);
      const changed=await DomainClaim.findOneAndUpdate({_id:proof.domain,tenantId:tenant._id,provider:'cloudflare',claimGeneration:proof.claimGeneration,gatewayState:claim.gatewayState},
        {$set:{gatewayState:'rolled_back'}},{session,new:true,runValidators:true}).lean();
      if(!changed) throw new GatewayLifecycleConflict('Ownership changed');
      const update:Record<string,unknown>={$inc:{gatewayDomainRevision:1}};
      if(claim.kind!=='alias') {
        if(typeof claim.gatewayPreviousEmailStatePresent!=='boolean' || typeof claim.gatewayPreviousEmailManagedPresent!=='boolean') throw new GatewayLifecycleConflict('Rollback email baseline unavailable');
        const set:Record<string,unknown>={}, unset:Record<string,number>={};
        if(claim.gatewayPreviousEmailDomainPresent) {
          if(claim.gatewayPreviousEmailDomain===undefined) throw new GatewayLifecycleConflict('Rollback email baseline unavailable');
          set.gatewayVerifiedEmailDomain=claim.gatewayPreviousEmailDomain;
        } else unset.gatewayVerifiedEmailDomain=1;
        if(claim.gatewayPreviousEmailStatePresent) {
          if(claim.gatewayPreviousEmailState===undefined) throw new GatewayLifecycleConflict('Rollback email baseline unavailable');
          set.gatewayEmailState=claim.gatewayPreviousEmailState;
        } else unset.gatewayEmailState=1;
        if(claim.gatewayPreviousEmailManagedPresent) {
          if(claim.gatewayPreviousEmailManaged===undefined) throw new GatewayLifecycleConflict('Rollback email baseline unavailable');
          set.gatewayEmailManaged=claim.gatewayPreviousEmailManaged;
        } else unset.gatewayEmailManaged=1;
        if(Object.keys(set).length) update.$set=set;
        if(Object.keys(unset).length) update.$unset=unset;
      }
      const saved=await Tenant.findOneAndUpdate({_id:tenant._id,slug:proof.tenantSlug,status:'active',customDomain:tenant.customDomain,gatewayDomainRevision:proof.claimRevision},
        update,{session,new:true,runValidators:true}).lean();
      if(!saved) throw new GatewayLifecycleConflict('Ownership changed');
      return {domain:proof.domain,tenantId:proof.tenantId,revision:saved.gatewayDomainRevision,state:'rolled_back' as const};
    },{readConcern:{level:'snapshot'}});
  } catch(error) {
    if((error as {code?:number})?.code===11000) throw new GatewayLifecycleConflict('Observation already used');
    throw error;
  } finally {await session.endSession();}
}
