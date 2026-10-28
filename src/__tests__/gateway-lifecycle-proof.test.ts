import { createHmac } from 'crypto';
import { authenticateGatewayLifecycleProof, evaluateGatewayLifecycleProof, gatewayLifecycleProofBytes, GatewayLifecycleProof } from '../services/gatewayLifecycleProof';

const now = 1_800_000_000_000, secret = 'test-secret-that-is-at-least-32-bytes';
const identity = {domain:'site-one.com',claimId:'site-one.com',claimGeneration:'12345678-1234-4123-8123-123456789abc',tenantId:'6ad9180019cdb7353ebbd0f5',tenantSlug:'site-one',claimRevision:2,accountId:'a'.repeat(32),zoneId:'b'.repeat(32)};
const proof = ():GatewayLifecycleProof => ({...identity,action:'activate',routeFingerprint:'c'.repeat(64),previousTarget:'',
  observedAt:now-1000,expiresAt:now+1000,nonce:'d'.repeat(32),zoneState:'active',dns:'assigned',route:'gateway',tls:'valid',tenant:'matched',serviceParity:'complete',rollbackMatched:'unknown',gatewayAbsent:'unknown',policyMatch:'matched'});
const sign = (value:GatewayLifecycleProof) => createHmac('sha256',secret).update(gatewayLifecycleProofBytes(value)).digest('hex');

it('accepts a current authenticated proof bound to the exact claim', () => {
  const value=proof();
  expect(authenticateGatewayLifecycleProof(value,sign(value),secret,now)).toBe(true);
  expect(evaluateGatewayLifecycleProof(value,identity)).toEqual({allowed:true});
});
it('rejects altered, expired, future-dated and excessively long-lived signatures', () => {
  const value=proof(), signature=sign(value);
  expect(authenticateGatewayLifecycleProof({...value,tenantId:'0'.repeat(24)},signature,secret,now)).toBe(false);
  expect(authenticateGatewayLifecycleProof(value,signature,secret,now+2000)).toBe(false);
  const future={...value,observedAt:now+1};
  expect(authenticateGatewayLifecycleProof(future,sign(future),secret,now)).toBe(false);
  const long={...value,observedAt:now-31_000};
  expect(authenticateGatewayLifecycleProof(long,sign(long),secret,now)).toBe(false);
  expect(authenticateGatewayLifecycleProof(value,signature,'short',now)).toBe(false);
});
it.each(['domain','claimId','claimGeneration','tenantId','tenantSlug','claimRevision','accountId','zoneId'] as const)('rejects a different authoritative %s', field => {
  const changed={...identity,[field]:field==='claimRevision'?3:field==='claimGeneration'?'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa':'0'.repeat(field==='tenantId'?24:field==='domain'||field==='claimId'?1:32)};
  expect(evaluateGatewayLifecycleProof(proof(),changed).allowed).toBe(false);
});
it.each(['pending','unknown'] as const)('fails closed on zone %s', zoneState => {
  expect(evaluateGatewayLifecycleProof({...proof(),zoneState},identity)).toEqual({allowed:false,reason:'unverified'});
});
it.each(['dns','route','tls','tenant','serviceParity'] as const)('fails closed on unknown %s', field => {
  expect(evaluateGatewayLifecycleProof({...proof(),[field]:'unknown'},identity)).toEqual({allowed:false,reason:'unverified'});
});
it('never authorizes detach without provider orchestration', () => {
  expect(evaluateGatewayLifecycleProof({...proof(),action:'detach'},identity)).toEqual({allowed:false,reason:'unverified'});
});
it('accepts staged configuration only without claiming live TLS, identity or parity',()=>{
  const stage={...proof(),action:'stage' as const,previousTarget:'e'.repeat(64),zoneState:'pending' as const,
    dns:'other' as const,tls:'unknown' as const,tenant:'unknown' as const,serviceParity:'unknown' as const,policyMatch:'unknown' as const};
  expect(evaluateGatewayLifecycleProof(stage,identity)).toEqual({allowed:true});
  expect(evaluateGatewayLifecycleProof({...stage,tenant:'matched'},identity).allowed).toBe(false);
});
