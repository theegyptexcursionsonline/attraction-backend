import { createHmac, timingSafeEqual } from 'crypto';
import { normalizeCustomDomain } from '../utils/customDomain';

/** Internal control-plane envelope. It is never an authorization credential. */
export type GatewayLifecycleProof = {
  action:'stage'|'activate'|'reconcile'|'rollback'|'detach'; domain:string; claimId:string; claimGeneration:string; tenantId:string; tenantSlug:string; claimRevision:number;
  accountId:string; zoneId:string; routeFingerprint:string; previousTarget:string;
  observedAt:number; expiresAt:number; nonce:string;
  zoneState:'active'|'pending'|'unknown'; dns:'assigned'|'other'|'unknown';
  route:'gateway'|'rollback'|'unknown'; tls:'valid'|'invalid'|'unknown';
  tenant:'matched'|'mismatch'|'unknown';
  serviceParity:'complete'|'incomplete'|'unknown';
  rollbackMatched:'matched'|'mismatch'|'unknown';
  gatewayAbsent:'yes'|'no'|'unknown';
  policyMatch:'matched'|'mismatch'|'unknown';
};

const fields = ['action','domain','claimId','claimGeneration','tenantId','tenantSlug','claimRevision','accountId','zoneId','routeFingerprint',
  'previousTarget','observedAt','expiresAt','nonce','zoneState','dns','route','tls','tenant','serviceParity','rollbackMatched','gatewayAbsent','policyMatch'] as const;

/** Canonical fixed-order serialization prevents client-chosen field omissions. */
export function gatewayLifecycleProofBytes(proof:GatewayLifecycleProof):string {
  return JSON.stringify(['foxes-gateway-lifecycle-v6',...fields.map(key=>proof[key])]);
}

/** Authentication precedes policy. Replay consumption must be atomic with the DB transition. */
export function authenticateGatewayLifecycleProof(proof:GatewayLifecycleProof, signature:string, secret:string, now=Date.now()):boolean {
  if (secret.length < 32 || !/^[a-f0-9]{64}$/.test(signature) || !/^[a-f0-9]{32}$/.test(proof.nonce)) return false;
  if (!Number.isSafeInteger(proof.observedAt) || !Number.isSafeInteger(proof.expiresAt) ||
      proof.observedAt > now || proof.expiresAt < now || proof.expiresAt - proof.observedAt > 30_000) return false;
  const expected = createHmac('sha256',secret).update(gatewayLifecycleProofBytes(proof)).digest();
  return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}

export type GatewayLifecycleExpected = {domain:string; claimId:string; claimGeneration:string; tenantId:string; tenantSlug:string; claimRevision:number; accountId:string; zoneId:string};
export type GatewayLifecycleDecision = {allowed:true} | {allowed:false; reason:string};

/** Only signed observations can change state; uncertainty is not a mismatch. */
export function classifyGatewayReconciliation(proof:GatewayLifecycleProof):'positive'|'mismatch'|'unknown' {
  if(proof.policyMatch!=='matched' && proof.policyMatch!=='mismatch') return 'unknown';
  if(proof.policyMatch==='mismatch') return 'mismatch';
  if(proof.zoneState==='pending' || proof.dns==='other' || proof.route==='rollback' || proof.tls==='invalid' ||
     proof.tenant==='mismatch' || proof.serviceParity==='incomplete' || proof.gatewayAbsent==='yes') return 'mismatch';
  if(proof.zoneState==='active' && proof.dns==='assigned' && proof.route==='gateway' && proof.tls==='valid' &&
     proof.tenant==='matched' && proof.serviceParity==='complete' && ['unknown','no'].includes(proof.gatewayAbsent)) return 'positive';
  return 'unknown';
}

/** Only call after authentication, with identity read from the authoritative claim. */
export function evaluateGatewayLifecycleProof(proof:GatewayLifecycleProof, expected:GatewayLifecycleExpected):GatewayLifecycleDecision {
  try { if (normalizeCustomDomain(proof.domain) !== proof.domain) return {allowed:false,reason:'domain'}; }
  catch { return {allowed:false,reason:'domain'}; }
  if (proof.domain !== expected.domain || proof.claimId !== expected.claimId || proof.claimId !== proof.domain ||
      proof.claimGeneration !== expected.claimGeneration || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(proof.claimGeneration) || proof.tenantId !== expected.tenantId ||
      proof.tenantSlug !== expected.tenantSlug || !/^[a-z0-9][a-z0-9-]{0,159}$/.test(proof.tenantSlug) ||
      proof.claimRevision !== expected.claimRevision || proof.accountId !== expected.accountId || proof.zoneId !== expected.zoneId ||
      !/^[a-f0-9]{24}$/.test(proof.tenantId) || !/^[a-f0-9]{32}$/.test(proof.accountId) || !/^[a-f0-9]{32}$/.test(proof.zoneId) ||
      !Number.isSafeInteger(proof.claimRevision) || proof.claimRevision < 1 || !Number.isSafeInteger(proof.claimRevision+1) || !/^[a-f0-9]{64}$/.test(proof.routeFingerprint)) {
    return {allowed:false,reason:'identity'};
  }
  if (proof.action === 'stage') {
    if (!/^[a-f0-9]{64}$/.test(proof.previousTarget) || !['active','pending'].includes(proof.zoneState) ||
        !['assigned','other'].includes(proof.dns) || proof.route!=='gateway' || proof.tls!=='unknown' || proof.tenant!=='unknown' || proof.serviceParity!=='unknown' || proof.rollbackMatched!=='unknown' || proof.gatewayAbsent!=='unknown' || proof.policyMatch!=='unknown') {
      return {allowed:false,reason:'unverified'};
    }
    return {allowed:true};
  }
  if (proof.action === 'rollback') {
    if(!['active','pending'].includes(proof.zoneState) || !['assigned','other'].includes(proof.dns) || proof.route!=='rollback' ||
       proof.tls!=='valid' || proof.serviceParity!=='complete' || proof.rollbackMatched!=='matched' || proof.policyMatch!=='unknown') return {allowed:false,reason:'unverified'};
    return {allowed:true};
  }
  if (proof.action === 'detach') {
    if(!['active','pending'].includes(proof.zoneState) || !['assigned','other'].includes(proof.dns) || proof.route!=='rollback' ||
       proof.tls!=='valid' || proof.serviceParity!=='complete' || proof.rollbackMatched!=='matched' || proof.gatewayAbsent!=='yes' || proof.policyMatch!=='unknown') return {allowed:false,reason:'unverified'};
    return {allowed:true};
  }
  if(proof.action==='reconcile') {
    if(proof.rollbackMatched!=='unknown' || classifyGatewayReconciliation(proof)==='unknown') return {allowed:false,reason:'unverified'};
    return {allowed:true};
  }
  if (proof.action !== 'activate') {
    // DNS/provider observations cannot establish a cross-system lock. Retain
    // ownership until a reviewed control plane can fence concurrent route changes.
    return {allowed:false,reason:'orchestration-required'};
  }
  if (proof.zoneState !== 'active' || proof.dns !== 'assigned' || proof.route !== 'gateway' || proof.tls !== 'valid' || proof.tenant !== 'matched' || proof.serviceParity!=='complete' || proof.rollbackMatched!=='unknown' || proof.gatewayAbsent!=='unknown' || proof.policyMatch!=='matched') {
    return {allowed:false,reason:'unverified'};
  }
  return {allowed:true};
}
