import mongoose from 'mongoose';
import { createHash } from 'crypto';
import { DomainClaim } from '../models/DomainClaim';
import { Tenant } from '../models/Tenant';
import { GatewayLifecycleNonce } from '../models/GatewayLifecycleNonce';
import { GatewayLifecycleArchive } from '../models/GatewayLifecycleArchive';
import { authenticateGatewayLifecycleProof, evaluateGatewayLifecycleProof, gatewayLifecycleProofBytes, GatewayLifecycleProof } from './gatewayLifecycleProof';
import { gatewayRollbackOriginKind, validateGatewayRollbackReceipt } from './gatewayRollbackReceipt';
import { legacyDomainWriteBlocked } from './gatewayDomainScope';
import { GatewayLifecycleConflict } from './gatewayLifecycleActivation.service';
import { recordGatewayLifecycleOperation } from './gatewayLifecycleOperation.service';

/** Release only after a fresh signed observation of the restored provider baseline. */
export async function detachGatewayDomain(proof:GatewayLifecycleProof, signature:string, now=Date.now()) {
  if(process.env.GATEWAY_LIFECYCLE_ENABLED!=='true' || process.env.GATEWAY_DOMAIN_NAMESPACE_READY!=='true' ||
     process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED!=='true') throw new GatewayLifecycleConflict('Gateway lifecycle unavailable');
  const secret=process.env.GATEWAY_LIFECYCLE_ATTESTATION_SECRET || '', accountId=process.env.GATEWAY_LIFECYCLE_ACCOUNT_ID || '';
  let zones:Record<string,string>;
  try {zones=JSON.parse(process.env.GATEWAY_LIFECYCLE_ZONE_MAP || '');} catch {throw new GatewayLifecycleConflict('Gateway lifecycle unavailable');}
  if(proof.action!=='detach' || !legacyDomainWriteBlocked(proof.domain) || !authenticateGatewayLifecycleProof(proof,signature,secret,now) ||
     !Number.isSafeInteger(proof.claimRevision+1)) throw new GatewayLifecycleConflict('Observation unavailable');
  const zoneId=zones[proof.domain] || '', hashProof=createHash('sha256').update(gatewayLifecycleProofBytes(proof)).digest('hex');
  const envelopeExpected={domain:proof.domain,claimId:proof.domain,claimGeneration:proof.claimGeneration,tenantId:proof.tenantId,
    tenantSlug:proof.tenantSlug,claimRevision:proof.claimRevision,accountId,zoneId};
  if(!evaluateGatewayLifecycleProof(proof,envelopeExpected).allowed) throw new GatewayLifecycleConflict('Observation unavailable');
  const session=await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      if(!authenticateGatewayLifecycleProof(proof,signature,secret,Date.now())) throw new GatewayLifecycleConflict('Observation expired');
      const replay=await GatewayLifecycleNonce.findById(proof.nonce).session(session).lean();
      if(replay) {
        const currentClaim=await DomainClaim.findById(proof.domain).session(session).lean();
        const currentTenant=await Tenant.findById(proof.tenantId).select('slug gatewayDomainRevision').session(session).lean();
        if(replay.action==='detach' && replay.proofHash===hashProof && replay.domain===proof.domain && replay.tenantId===proof.tenantId &&
           replay.resultRevision===proof.claimRevision+1 && currentTenant?.gatewayDomainRevision===replay.resultRevision && currentTenant.slug===proof.tenantSlug &&
           (replay.restoredLegacyClaim ? !!currentClaim && currentClaim.provider!=='cloudflare' && String(currentClaim.tenantId)===proof.tenantId : !currentClaim))
          return {domain:proof.domain,tenantId:proof.tenantId,revision:replay.resultRevision,state:'detached' as const};
        throw new GatewayLifecycleConflict('Observation already used');
      }
      const claim=await DomainClaim.findById(proof.domain).session(session).lean();
      const tenant=await Tenant.findById(proof.tenantId).select('_id slug status customDomain gatewayDomainRevision gatewayOwnedCount').session(session).lean();
      if(!claim || claim.provider!=='cloudflare' || claim.gatewayState!=='rolled_back' || String(claim.tenantId)!==proof.tenantId || !tenant ||
         tenant.status!=='active' || tenant.gatewayDomainRevision!==proof.claimRevision ||
         (claim.kind==='alias'?tenant.customDomain!==claim.primaryDomain:tenant.customDomain!==proof.domain)) throw new GatewayLifecycleConflict('Ownership changed');
      if((claim as {kind?:unknown}).kind!==undefined && (claim as {kind?:unknown}).kind!=='alias') throw new GatewayLifecycleConflict('Ownership changed');
      const expected={domain:String(claim._id),claimId:String(claim._id),claimGeneration:claim.claimGeneration || '',tenantId:String(tenant._id),tenantSlug:tenant.slug,
        claimRevision:tenant.gatewayDomainRevision!,accountId,zoneId};
      if(!evaluateGatewayLifecycleProof(proof,expected).allowed) throw new GatewayLifecycleConflict('Observation unavailable');
      const receipt=claim.gatewayRollbackReceipt || '', receiptHash=validateGatewayRollbackReceipt(receipt,accountId,zoneId,proof.domain);
      const originKind=gatewayRollbackOriginKind(receipt,accountId,zoneId,proof.domain);
      if(!receiptHash || receiptHash!==claim.gatewayRollbackTarget || receiptHash!==proof.previousTarget || !originKind ||
         (originKind==='network' && proof.tenant!=='matched')) throw new GatewayLifecycleConflict('Rollback baseline unavailable');
      const owned=await DomainClaim.countDocuments({tenantId:tenant._id,provider:'cloudflare'}).session(session);
      if(!Number.isSafeInteger(tenant.gatewayOwnedCount) || tenant.gatewayOwnedCount!==owned || owned<1 || (claim.kind!=='alias' && owned!==1))
        throw new GatewayLifecycleConflict('Gateway ownership count or dependent aliases require reconciliation');
      const original=claim.gatewayOriginal;
      if(!original || typeof original.claimWasExisting!=='boolean' || typeof original.providerPresent!=='boolean' ||
         typeof original.generationPresent!=='boolean' || typeof original.customDomainPresent!=='boolean' ||
         typeof original.statusPresent!=='boolean' || typeof original.migratedPresent!=='boolean' || typeof original.lastChangedByPresent!=='boolean') throw new GatewayLifecycleConflict('Ownership provenance unavailable');
      if(original.claimWasExisting && (claim.kind==='alias' || original.providerValue==='cloudflare')) throw new GatewayLifecycleConflict('Ownership provenance unavailable');
      if(!claim.gatewayRoutePolicyFingerprint || !/^[a-f0-9]{64}$/.test(claim.gatewayRoutePolicyFingerprint)) throw new GatewayLifecycleConflict('Provider baseline unavailable');
      await GatewayLifecycleNonce.create([{_id:proof.nonce,expiresAt:new Date(proof.expiresAt+300_000),action:'detach',proofHash:hashProof,
        domain:proof.domain,tenantId:proof.tenantId,resultRevision:proof.claimRevision+1,restoredLegacyClaim:original.claimWasExisting}],{session});
      await recordGatewayLifecycleOperation(proof,'detached',session);
      await GatewayLifecycleArchive.create([{_id:`${proof.domain}:${proof.claimGeneration}`,domain:proof.domain,tenantId:tenant._id,
        claimGeneration:proof.claimGeneration,rollbackReceipt:receipt,rollbackHash:receiptHash,routePolicyFingerprint:claim.gatewayRoutePolicyFingerprint,
        original,detachedAt:new Date()}],{session});
      const filter={_id:proof.domain,tenantId:tenant._id,provider:'cloudflare',claimGeneration:proof.claimGeneration,gatewayState:'rolled_back'};
      if(original.claimWasExisting) {
        const set:Record<string,unknown>={}, unset:Record<string,number>={gatewayOriginal:1,gatewayState:1,gatewayRollbackTarget:1,
          gatewayRollbackReceipt:1,gatewayRoutePolicyFingerprint:1,gatewayPreviousEmailDomain:1,gatewayPreviousEmailDomainPresent:1,
          gatewayPreviousEmailState:1,gatewayPreviousEmailStatePresent:1,gatewayPreviousEmailManaged:1,gatewayPreviousEmailManagedPresent:1,gatewayVerifiedAt:1};
        if(original.providerPresent) set.provider=original.providerValue ?? null; else unset.provider=1;
        if(original.generationPresent) set.claimGeneration=original.generationValue ?? null; else unset.claimGeneration=1;
        const update:Record<string,unknown>={$unset:unset}; if(Object.keys(set).length) update.$set=set;
        const restored=await DomainClaim.updateOne(filter,update,{session,runValidators:true,timestamps:false});
        if(restored.modifiedCount!==1) throw new GatewayLifecycleConflict('Ownership changed');
      } else {
        const removed=await DomainClaim.deleteOne(filter,{session});
        if(removed.deletedCount!==1) throw new GatewayLifecycleConflict('Ownership changed');
      }
      const update:Record<string,unknown>={$inc:{gatewayDomainRevision:1,gatewayOwnedCount:-1}};
      if(claim.kind!=='alias') {
        const set:Record<string,unknown>={}, unset:Record<string,number>={};
        for(const [field,present,value] of [
          ['customDomain',original.customDomainPresent,original.customDomainValue],
          ['customDomainStatus',original.statusPresent,original.statusValue],
          ['domainMigrated',original.migratedPresent,original.migratedValue],
          ['customDomainLastChangedBy',original.lastChangedByPresent,original.lastChangedByValue],
        ] as const) { if(present) set[field]=value ?? null; else unset[field]=1; }
        if(Object.keys(set).length) update.$set=set;
        if(Object.keys(unset).length) update.$unset=unset;
      }
      const saved=await Tenant.findOneAndUpdate({_id:tenant._id,slug:proof.tenantSlug,status:'active',customDomain:tenant.customDomain,
        gatewayDomainRevision:proof.claimRevision,gatewayOwnedCount:owned},update,{session,new:true,runValidators:true}).lean();
      if(!saved) throw new GatewayLifecycleConflict('Ownership changed');
      return {domain:proof.domain,tenantId:proof.tenantId,revision:saved.gatewayDomainRevision,state:'detached' as const};
    },{readConcern:{level:'snapshot'}});
  } catch(error) {
    if((error as {code?:number})?.code===11000) throw new GatewayLifecycleConflict('Observation already used');
    throw error;
  } finally {await session.endSession();}
}
