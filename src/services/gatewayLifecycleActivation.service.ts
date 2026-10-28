import mongoose from 'mongoose';
import { DomainClaim } from '../models/DomainClaim';
import { Tenant } from '../models/Tenant';
import { GatewayLifecycleNonce } from '../models/GatewayLifecycleNonce';
import { authenticateGatewayLifecycleProof, classifyGatewayReconciliation, evaluateGatewayLifecycleProof, GatewayLifecycleProof } from './gatewayLifecycleProof';
import { legacyDomainWriteBlocked } from './gatewayDomainScope';
import { validateGatewayRollbackReceipt } from './gatewayRollbackReceipt';
import { recordGatewayLifecycleOperation } from './gatewayLifecycleOperation.service';

export class GatewayLifecycleConflict extends Error {}

/** Internal only: caller must enforce super-admin; producer and rollback are not yet wired. */
export async function activateGatewayDomain(proof:GatewayLifecycleProof, signature:string, now=Date.now()) {
  if (process.env.GATEWAY_LIFECYCLE_ENABLED !== 'true' || process.env.GATEWAY_DOMAIN_NAMESPACE_READY !== 'true' ||
      process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED !== 'true') throw new GatewayLifecycleConflict('Gateway lifecycle unavailable');
  const secret=process.env.GATEWAY_LIFECYCLE_ATTESTATION_SECRET || '';
  const accountId=process.env.GATEWAY_LIFECYCLE_ACCOUNT_ID || '';
  let zones:Record<string,string>;
  try { zones=JSON.parse(process.env.GATEWAY_LIFECYCLE_ZONE_MAP || ''); } catch { throw new GatewayLifecycleConflict('Gateway lifecycle unavailable'); }
  if (!['activate','reconcile'].includes(proof.action) || !legacyDomainWriteBlocked(proof.domain) || !authenticateGatewayLifecycleProof(proof,signature,secret,now)) throw new GatewayLifecycleConflict('Observation unavailable');
  const session=await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const claim=await DomainClaim.findById(proof.domain).session(session).lean();
      const tenant=await Tenant.findById(proof.tenantId).select('_id slug status customDomain gatewayDomainRevision gatewayVerifiedEmailDomain gatewayEmailState gatewayEmailManaged').session(session).lean();
      if (!claim || claim.provider!=='cloudflare' || String(claim.tenantId)!==proof.tenantId || !tenant ||
          tenant.status!=='active' || tenant.gatewayDomainRevision!==proof.claimRevision ||
          (claim.kind==='alias' ? tenant.customDomain!==claim.primaryDomain : tenant.customDomain!==proof.domain)) {
        throw new GatewayLifecycleConflict('Ownership changed');
      }
      if((claim as {kind?:unknown}).kind!==undefined && (claim as {kind?:unknown}).kind!=='alias') throw new GatewayLifecycleConflict('Ownership changed');
      const expected={domain:String(claim._id),claimId:String(claim._id),claimGeneration:claim.claimGeneration || '',
        tenantId:String(tenant._id),tenantSlug:tenant.slug,claimRevision:tenant.gatewayDomainRevision!,accountId,zoneId:zones[proof.domain] || ''};
      if (!evaluateGatewayLifecycleProof(proof,expected).allowed) throw new GatewayLifecycleConflict('Observation unavailable');
      if (!authenticateGatewayLifecycleProof(proof,signature,secret,Date.now())) throw new GatewayLifecycleConflict('Observation expired');
      // An observation cannot choose the rollback target or expected provider
      // policy; those must be previously established by a trusted control plane.
      const receiptHash=validateGatewayRollbackReceipt(claim.gatewayRollbackReceipt || '',accountId,zones[proof.domain] || '',proof.domain);
      const expectedState=claim.gatewayState;
      if ((proof.action==='activate' ? expectedState!=='staged' : !['active','unverified'].includes(expectedState || '')) || !receiptHash || !claim.gatewayRollbackTarget || !claim.gatewayRoutePolicyFingerprint ||
          receiptHash!==claim.gatewayRollbackTarget || claim.gatewayRollbackTarget!==proof.previousTarget) {
        throw new GatewayLifecycleConflict('Provider baseline unavailable or changed');
      }
      const policyMatches=claim.gatewayRoutePolicyFingerprint===proof.routeFingerprint;
      if ((proof.policyMatch==='matched')!==policyMatches || (proof.action==='activate' && !policyMatches)) {
        throw new GatewayLifecycleConflict('Policy observation inconsistent');
      }
      if(proof.action==='reconcile' && claim.kind!=='alias' && (tenant.gatewayVerifiedEmailDomain!==proof.domain || tenant.gatewayEmailManaged!==true)) throw new GatewayLifecycleConflict('Verified email state changed');
      const state=proof.action==='reconcile' && classifyGatewayReconciliation(proof)==='mismatch' ? 'unverified' as const : 'active' as const;
      await GatewayLifecycleNonce.create([{_id:proof.nonce,expiresAt:new Date(proof.expiresAt+300_000)}],{session});
      await recordGatewayLifecycleOperation(proof,state,session);
      const previousPresent=tenant.gatewayVerifiedEmailDomain!==undefined;
      const previousStatePresent=tenant.gatewayEmailState!==undefined;
      const previousManagedPresent=tenant.gatewayEmailManaged!==undefined;
      const claimUpdate:Record<string,unknown>={gatewayState:state};
      if(state==='active') claimUpdate.gatewayVerifiedAt=new Date(proof.observedAt);
      if(proof.action==='activate') {
        claimUpdate.gatewayPreviousEmailDomainPresent=previousPresent;
        if(previousPresent) claimUpdate.gatewayPreviousEmailDomain=tenant.gatewayVerifiedEmailDomain;
        claimUpdate.gatewayPreviousEmailStatePresent=previousStatePresent;
        if(previousStatePresent) claimUpdate.gatewayPreviousEmailState=tenant.gatewayEmailState;
        claimUpdate.gatewayPreviousEmailManagedPresent=previousManagedPresent;
        if(previousManagedPresent) claimUpdate.gatewayPreviousEmailManaged=tenant.gatewayEmailManaged;
      }
      const savedClaim=await DomainClaim.findOneAndUpdate({_id:proof.domain,tenantId:tenant._id,provider:'cloudflare',claimGeneration:proof.claimGeneration,gatewayState:expectedState},
        {$set:claimUpdate},{session,new:true,runValidators:true}).lean();
      if(!savedClaim) throw new GatewayLifecycleConflict('Ownership changed');
      const update:Record<string,unknown>={$inc:{gatewayDomainRevision:1}};
      if(claim.kind!=='alias') update.$set=proof.action==='activate'
        ? {gatewayVerifiedEmailDomain:proof.domain,gatewayEmailState:'verified',gatewayEmailManaged:true}
        : {gatewayEmailState:state==='active'?'verified':'unverified'};
      const savedTenant=await Tenant.findOneAndUpdate({_id:tenant._id,slug:proof.tenantSlug,status:'active',customDomain:tenant.customDomain,gatewayDomainRevision:proof.claimRevision},
        update,{session,new:true,runValidators:true}).lean();
      if(!savedTenant) throw new GatewayLifecycleConflict('Ownership changed');
      return {domain:proof.domain,tenantId:proof.tenantId,revision:savedTenant.gatewayDomainRevision,state};
    },{readConcern:{level:'snapshot'}});
  } catch(error) {
    if((error as {code?:number})?.code===11000) throw new GatewayLifecycleConflict('Observation already used');
    throw error;
  } finally {await session.endSession();}
}
