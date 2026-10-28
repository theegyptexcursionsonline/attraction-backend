import { createHash } from 'crypto';
import { ClientSession } from 'mongoose';
import { GatewayLifecycleOperation } from '../models/GatewayLifecycleOperation';
import { gatewayLifecycleProofBytes, GatewayLifecycleProof } from './gatewayLifecycleProof';

/** Call inside the same transaction that consumes the nonce and changes state. */
export async function recordGatewayLifecycleOperation(proof:GatewayLifecycleProof,state:'staged'|'active'|'unverified'|'rolled_back'|'detached',session:ClientSession) {
  const now=new Date();
  await GatewayLifecycleOperation.create([{_id:proof.nonce,domain:proof.domain,tenantId:proof.tenantId,
    claimGeneration:proof.claimGeneration,action:proof.action,proofHash:createHash('sha256').update(gatewayLifecycleProofBytes(proof)).digest('hex'),
    resultState:state,resultRevision:proof.claimRevision+1,createdAt:now,expiresAt:new Date(now.getTime()+30*24*60*60*1000)}],{session});
}
