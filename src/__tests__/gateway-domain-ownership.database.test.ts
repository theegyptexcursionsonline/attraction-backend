import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Tenant } from '../models/Tenant';
import { DomainClaim } from '../models/DomainClaim';
import { createGatewayDomainOwnership } from '../services/gatewayDomainOwnership.service';
import { createGatewayAlias } from '../services/gatewayAliasOwnership.service';
import express from 'express';
import request from '../test/loopbackRequest';
import tenantRoutes from '../routes/tenants.routes';
import { User } from '../models/User';
import { generateAccessToken } from '../utils/jwt';
import { gatewaySafeSeedFilter, guardGatewaySeedDocument } from '../services/gatewayDomainScope';
import { GatewayLifecycleNonce } from '../models/GatewayLifecycleNonce';
import { GatewayLifecycleArchive } from '../models/GatewayLifecycleArchive';
import { GatewayLifecycleOperation } from '../models/GatewayLifecycleOperation';
import { activateGatewayDomain } from '../services/gatewayLifecycleActivation.service';
import { gatewayLifecycleProofBytes, GatewayLifecycleProof } from '../services/gatewayLifecycleProof';
import { createHash, createHmac } from 'crypto';
import { getEmailBrand } from '../services/email.service';
import { stageGatewayDomain } from '../services/gatewayLifecycleStage.service';
import { rollbackGatewayDomain } from '../services/gatewayLifecycleRollback.service';
import { detachGatewayDomain } from '../services/gatewayLifecycleDetach.service';

let mongo: MongoMemoryReplSet;
const actor = new Types.ObjectId();
const app = express();
app.use(express.json()); app.use('/tenants',tenantRoutes);
app.use((_error: Error,_req:express.Request,res:express.Response,_next:express.NextFunction) => res.status(500).json({error:'unavailable'}));
beforeAll(async () => {
  const binary = spawnSync('which',['mongod'],{encoding:'utf8'}).stdout.trim();
  const version = binary ? spawnSync(binary,['--version'],{encoding:'utf8'}).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:version || '7.0.14',...(binary ? {systemBinary:binary} : {})}});
  await mongoose.connect(mongo.getUri('gateway_domain_ownership'));
  await Promise.all([Tenant.init(),DomainClaim.init(),GatewayLifecycleNonce.init(),GatewayLifecycleArchive.init(),GatewayLifecycleOperation.init()]);
},30000);
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  process.env.GATEWAY_DOMAIN_OWNERSHIP_ENABLED='true';
  process.env.GATEWAY_DOMAIN_NAMESPACE_READY='true';
  process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED='true';
  process.env.GATEWAY_DOMAIN_SCOPE='site-one.com';
  process.env.GATEWAY_ALIAS_PRIMARY_SCOPE='primary-site.com,first-primary.com,second-primary.com,other-site.com';
  await Tenant.deleteMany({}); await DomainClaim.deleteMany({}); await GatewayLifecycleNonce.deleteMany({}); await GatewayLifecycleArchive.deleteMany({}); await GatewayLifecycleOperation.deleteMany({}); await User.deleteMany({});
});
afterEach(() => {
  for (const key of ['GATEWAY_DOMAIN_OWNERSHIP_ENABLED','GATEWAY_DOMAIN_NAMESPACE_READY','GATEWAY_DOMAIN_WRITER_FENCE_ENABLED','GATEWAY_DOMAIN_SCOPE','GATEWAY_ALIAS_ENABLED','GATEWAY_ALIAS_PRIMARY_SCOPE','GATEWAY_DOMAIN_RESOLVER_ENABLED','GATEWAY_LIFECYCLE_ENABLED','GATEWAY_LIFECYCLE_ATTESTATION_SECRET','GATEWAY_LIFECYCLE_ACCOUNT_ID','GATEWAY_LIFECYCLE_ZONE_MAP','GATEWAY_LIFECYCLE_STATUS_ENABLED','GATEWAY_LIFECYCLE_STATUS_SCOPE']) Reflect.deleteProperty(process.env,key);
  jest.restoreAllMocks();
});

async function seed(slug:string, customDomain?:string) {
  const id = new Types.ObjectId();
  await Tenant.collection.insertOne({_id:id,slug,name:slug,domain:`${slug}.invalid`,status:'active',...(customDomain ? {customDomain}: {})} as never);
  return String(id);
}

async function bearer(role:string, assignedTenants:Types.ObjectId[] = [], status='active') {
  const user = {_id:new Types.ObjectId(),email:`${role}@example.invalid`,role,status,tokenVersion:0,assignedTenants};
  await User.collection.insertOne(user as never);
  return `Bearer ${generateAccessToken(user as never)}`;
}

it('persists the provider tag and tenant revision and retains an existing claim on adoption', async () => {
  const id = await seed('site-one','site-one.com');
  await DomainClaim.create({_id:'site-one.com',tenantId:id});
  await createGatewayDomainOwnership('site-one.com',id,String(actor),{adoptExisting:true,expectedCurrentDomain:'site-one.com'});
  expect(await DomainClaim.findById('site-one.com').lean()).toMatchObject({provider:'cloudflare'});
  expect(await Tenant.findById(id).lean()).toMatchObject({customDomain:'site-one.com',gatewayDomainRevision:1});
});

it('rolls back the new claim when the tenant compare-and-set fails', async () => {
  const id = await seed('site-one');
  jest.spyOn(Tenant,'findOneAndUpdate').mockReturnValue({lean:async () => null} as never);
  await expect(createGatewayDomainOwnership('site-one.com',id,String(actor))).rejects.toThrow('Tenant changed');
  expect(await DomainClaim.findById('site-one.com').lean()).toBeNull();
  expect((await Tenant.findById(id).lean())?.customDomain).toBeUndefined();
});

it('allows only one tenant to claim a domain during concurrent attempts', async () => {
  const first = await seed('site-one');
  const second = await seed('site-two');
  const outcomes = await Promise.allSettled([
    createGatewayDomainOwnership('site-one.com',first,String(actor)),
    createGatewayDomainOwnership('site-one.com',second,String(actor)),
  ]);
  expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(await DomainClaim.countDocuments({_id:'site-one.com'})).toBe(1);
  expect(await Tenant.countDocuments({customDomain:'site-one.com'})).toBe(1);
});

it('prevents a stale seed from clearing a domain concurrently adopted by the gateway', async () => {
  const id = await seed('site-one','site-one.com');
  const outcomes = await Promise.allSettled([
    createGatewayDomainOwnership('site-one.com',id,String(actor),{adoptExisting:true,expectedCurrentDomain:'site-one.com'}),
    Tenant.findOneAndUpdate(gatewaySafeSeedFilter('site-one'),{$unset:{customDomain:1}}, {new:true,upsert:true}).lean().exec(),
  ]);
  expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const claim = await DomainClaim.findById('site-one.com').lean();
  const tenant = await Tenant.findById(id).lean();
  if (claim) expect(tenant).toMatchObject({customDomain:'site-one.com',gatewayDomainRevision:1});
  else expect(tenant?.customDomain).toBeUndefined();
});

it('rejects a stale Mongoose document save after an ownership claim', async () => {
  const id = await seed('site-one','site-one.com');
  const stale = (await Tenant.findById(id))!;
  guardGatewaySeedDocument(stale,'unrelated.invalid');
  await createGatewayDomainOwnership('site-one.com',id,String(actor),{adoptExisting:true,expectedCurrentDomain:'site-one.com'});
  stale.customDomain = 'unrelated.invalid';
  await expect(stale.save()).rejects.toThrow();
  expect(await Tenant.findById(id).lean()).toMatchObject({customDomain:'site-one.com',gatewayDomainRevision:1});
});

it('rejects a legacy Unicode domain that normalizes to the requested host', async () => {
  const id = await seed('site-one');
  await Tenant.collection.insertOne({ _id:new Types.ObjectId(), slug:'conflict', name:'conflict',
    domain:'ｓｉｔｅ-one.com', status:'active' } as never);
  await expect(createGatewayDomainOwnership('site-one.com',id,String(actor))).rejects.toThrow();
  expect(await DomainClaim.findById('site-one.com').lean()).toBeNull();
});

it('enforces actual authentication and role middleware for ownership mutations', async () => {
  const id = await seed('site-one');
  const url = `/tenants/${id}/gateway-domain`;
  await request(app).post(url).send({domain:'site-one.com'}).expect(401);
  for (const role of ['customer','manager','brand-admin']) {
    await request(app).post(url).set('Authorization',await bearer(role,[new Types.ObjectId(id)])).send({domain:'site-one.com'}).expect(403);
  }
  await request(app).post(url).set('Authorization',await bearer('super-admin')).send({domain:'site-one.com'}).expect(200);
  expect(await DomainClaim.findById('site-one.com').lean()).toMatchObject({provider:'cloudflare',tenantId:new Types.ObjectId(id)});
});

it('rejects inactive sessions and prevents cross-tenant staff from claiming a site', async () => {
  const id = await seed('site-one'), other = new Types.ObjectId();
  await request(app).post(`/tenants/${id}/gateway-domain`).set('Authorization',await bearer('super-admin',[],'inactive')).send({domain:'site-one.com'}).expect(403);
  await request(app).post(`/tenants/${id}/gateway-domain`).set('Authorization',await bearer('brand-admin',[other])).send({domain:'site-one.com'}).expect(403);
  expect(await DomainClaim.findById('site-one.com').lean()).toBeNull();
});

it('honors disabled flags and serves only active explicitly adopted tenants through public lookup', async () => {
  const id = await seed('site-one');
  const auth = await bearer('super-admin');
  Reflect.deleteProperty(process.env,'GATEWAY_DOMAIN_OWNERSHIP_ENABLED');
  await request(app).post(`/tenants/${id}/gateway-domain`).set('Authorization',auth).send({domain:'site-one.com'}).expect(409);
  await request(app).get('/tenants/gateway-domain/site-one.com').expect(503);
  process.env.GATEWAY_DOMAIN_OWNERSHIP_ENABLED='true'; process.env.GATEWAY_DOMAIN_RESOLVER_ENABLED='true';
  await request(app).post(`/tenants/${id}/gateway-domain`).set('Authorization',auth).send({domain:'site-one.com'}).expect(200);
  const resolved = await request(app).get('/tenants/gateway-domain/www.site-one.com').expect(200);
  expect(resolved.body.data).toMatchObject({id,customDomain:'site-one.com',status:'active'});
  expect(resolved.headers['cache-control']).toContain('no-store');
  Reflect.deleteProperty(process.env,'GATEWAY_DOMAIN_WRITER_FENCE_ENABLED');
  await request(app).get('/tenants/gateway-domain/site-one.com').expect(503);
  process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED='true';
  await Tenant.updateOne({_id:id},{$set:{status:'inactive'}});
  await request(app).get('/tenants/gateway-domain/site-one.com').expect(404);
  Reflect.deleteProperty(process.env,'GATEWAY_DOMAIN_RESOLVER_ENABLED');
});

it('reserves an alias without changing the primary and resolves both apex and www to that tenant', async () => {
  const id=await seed('site-one','primary-site.com');
  process.env.GATEWAY_ALIAS_ENABLED='true'; process.env.GATEWAY_DOMAIN_RESOLVER_ENABLED='true';
  const auth=await bearer('super-admin');
  // Fence the primary even before the alias exists; deploy must drain older instances first.
  await request(app).delete(`/tenants/${id}/custom-domain`).set('Authorization',auth).expect(409);
  await request(app).post(`/tenants/${id}/custom-domain/verify`).set('Authorization',auth).expect(409);
  await request(app).post(`/tenants/${id}/gateway-alias`).set('Authorization',auth)
    .send({domain:'site-one.com',expectedPrimaryDomain:'primary-site.com'}).expect(200);
  expect(await Tenant.findById(id).lean()).toMatchObject({customDomain:'primary-site.com',gatewayDomainRevision:1});
  expect(await DomainClaim.findById('site-one.com').lean()).toMatchObject({provider:'cloudflare',kind:'alias',primaryDomain:'primary-site.com'});
  for(const host of ['site-one.com','www.site-one.com']) {
    const result=await request(app).get(`/tenants/gateway-domain/${host}`).expect(200);
    expect(result.body.data).toMatchObject({id,visitorHost:host,aliasApex:'site-one.com',primaryCanonical:'primary-site.com',canonicalReady:false});
  }
  await Tenant.updateOne({_id:id},{$set:{customDomain:'changed-primary.com'}});
  await request(app).get('/tenants/gateway-domain/site-one.com').expect(404);
});

it('rejects alias requests by staff and rejects a mismatched primary before writing', async () => {
  const id=await seed('site-one','primary-site.com'); process.env.GATEWAY_ALIAS_ENABLED='true';
  const body={domain:'site-one.com',expectedPrimaryDomain:'primary-site.com'};
  await request(app).post(`/tenants/${id}/gateway-alias`).send(body).expect(401);
  await request(app).post(`/tenants/${id}/gateway-alias`).set('Authorization',await bearer('brand-admin')).send(body).expect(403);
  await request(app).post(`/tenants/${id}/gateway-alias`).set('Authorization',await bearer('super-admin'))
    .send({...body,expectedPrimaryDomain:'other-site.com'}).expect(409);
  expect(await DomainClaim.findById('site-one.com').lean()).toBeNull();
});

it('rejects aliases already owned by another tenant and legacy Unicode collisions', async () => {
  const id=await seed('site-one','primary-site.com'), foreign=new Types.ObjectId(); process.env.GATEWAY_ALIAS_ENABLED='true';
  await DomainClaim.create({_id:'site-one.com',tenantId:foreign});
  await expect(createGatewayAlias('site-one.com',id,String(actor),'primary-site.com')).rejects.toThrow('Alias already claimed');
  await DomainClaim.deleteMany({});
  await Tenant.collection.insertOne({_id:foreign,slug:'conflict',name:'conflict',domain:'ｓｉｔｅ-one.com',status:'active'} as never);
  await expect(createGatewayAlias('site-one.com',id,String(actor),'primary-site.com')).rejects.toThrow('already assigned');
});

it('is idempotent for the same alias tuple and refuses a changed tuple', async () => {
  const id=await seed('site-one','primary-site.com'); process.env.GATEWAY_ALIAS_ENABLED='true';
  const first=await createGatewayAlias('site-one.com',id,String(actor),'primary-site.com');
  const second=await createGatewayAlias('www.site-one.com',id,String(actor),'primary-site.com');
  expect(second).toEqual(first);
  expect((await Tenant.findById(id).lean())?.gatewayDomainRevision).toBe(1);
  await expect(createGatewayAlias('site-one.com',id,String(actor),'other-site.com')).rejects.toThrow('Primary domain changed');
});

it('allows only one competing alias owner', async () => {
  const first=await seed('site-one','first-primary.com');
  const second=await seed('site-two','second-primary.com'); process.env.GATEWAY_ALIAS_ENABLED='true';
  const results=await Promise.allSettled([
    createGatewayAlias('site-one.com',first,String(actor),'first-primary.com'),
    createGatewayAlias('site-one.com',second,String(actor),'second-primary.com'),
  ]);
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  expect(await DomainClaim.countDocuments({_id:'site-one.com'})).toBe(1);
});

it('keeps alias resolution disabled by default and rejects inactive tenants', async () => {
  const id=await seed('site-one','primary-site.com'); process.env.GATEWAY_ALIAS_ENABLED='true';
  await createGatewayAlias('site-one.com',id,String(actor),'primary-site.com');
  process.env.GATEWAY_DOMAIN_RESOLVER_ENABLED='true'; Reflect.deleteProperty(process.env,'GATEWAY_ALIAS_ENABLED');
  await request(app).get('/tenants/gateway-domain/site-one.com').expect(404);
  process.env.GATEWAY_ALIAS_ENABLED='true'; await Tenant.updateOne({_id:id},{$set:{status:'inactive'}});
  await request(app).get('/tenants/gateway-domain/site-one.com').expect(404);
});

it('marks alias canonical ready only with an active verified same-tenant primary claim', async () => {
  const id=await seed('site-one','primary-site.com');process.env.GATEWAY_ALIAS_ENABLED='true';process.env.GATEWAY_DOMAIN_RESOLVER_ENABLED='true';
  await createGatewayAlias('site-one.com',id,String(actor),'primary-site.com');
  const get=async () => (await request(app).get('/tenants/gateway-domain/site-one.com').expect(200)).body.data.canonicalReady;
  expect(await get()).toBe(false);
  await DomainClaim.create({_id:'primary-site.com',tenantId:id,provider:'cloudflare',claimGeneration:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gatewayState:'active',gatewayVerifiedAt:new Date()});
  await Tenant.updateOne({_id:id},{$set:{gatewayVerifiedEmailDomain:'primary-site.com',gatewayEmailState:'verified',gatewayEmailManaged:true},$inc:{gatewayOwnedCount:1}});
  expect(await get()).toBe(false);
  await DomainClaim.updateOne({_id:'site-one.com'},{$set:{gatewayState:'active',gatewayVerifiedAt:new Date()}});
  expect(await get()).toBe(true);
  await DomainClaim.updateOne({_id:'primary-site.com'},{$set:{gatewayVerifiedAt:new Date(Date.now()-301_000)}});
  expect(await get()).toBe(true);
  await DomainClaim.updateOne({_id:'primary-site.com'},{$set:{gatewayVerifiedAt:new Date(Date.now()+301_000)}});
  expect(await get()).toBe(false);
  await DomainClaim.updateOne({_id:'primary-site.com'},{$set:{gatewayVerifiedAt:new Date(),gatewayState:'rolled_back'}});
  expect(await get()).toBe(false);
  await DomainClaim.deleteOne({_id:'primary-site.com'});expect(await get()).toBe(false);
});

it('rejects alias creation if primary scope is missing and fails closed on a foreign primary claim', async () => {
  const id=await seed('site-one','primary-site.com'); process.env.GATEWAY_ALIAS_ENABLED='true';
  Reflect.deleteProperty(process.env,'GATEWAY_ALIAS_PRIMARY_SCOPE');
  await expect(createGatewayAlias('site-one.com',id,String(actor),'primary-site.com')).rejects.toThrow('primary scope unavailable');
  expect(await DomainClaim.findById('site-one.com').lean()).toBeNull();
  process.env.GATEWAY_ALIAS_PRIMARY_SCOPE='primary-site.com';
  await DomainClaim.create({_id:'primary-site.com',tenantId:new Types.ObjectId()});
  await expect(createGatewayAlias('site-one.com',id,String(actor),'primary-site.com')).rejects.toThrow('Primary claim conflicts');
  expect(await DomainClaim.findById('site-one.com').lean()).toBeNull();
});

let lifecycleGeneration='';
const lifecycleReceipt=JSON.stringify(['foxes-cf-rollback-v3','a'.repeat(32),'b'.repeat(32),'site-one.com',
  ['ns1.example.net','ns2.example.net'],[['site-one.com','A','203.0.113.4',300]],[],[],'external']);
const lifecycleRollbackHash=createHash('sha256').update(lifecycleReceipt).digest('hex');
function lifecycleProof(id:string, revision:number, nonce:string):GatewayLifecycleProof {
  const now=Date.now();
  return {action:'activate',domain:'site-one.com',claimId:'site-one.com',claimGeneration:lifecycleGeneration,tenantId:id,tenantSlug:'site-one',claimRevision:revision,accountId:'a'.repeat(32),zoneId:'b'.repeat(32),
    routeFingerprint:'c'.repeat(64),previousTarget:lifecycleRollbackHash,observedAt:now-1000,expiresAt:now+10000,nonce,
    zoneState:'active',dns:'assigned',route:'gateway',tls:'valid',tenant:'matched',serviceParity:'complete',rollbackMatched:'unknown',gatewayAbsent:'unknown',policyMatch:'matched'};
}
function lifecycleSetup() {
  process.env.GATEWAY_LIFECYCLE_ENABLED='true';
  process.env.GATEWAY_LIFECYCLE_ATTESTATION_SECRET='synthetic-lifecycle-key-at-least-32-bytes';
  process.env.GATEWAY_LIFECYCLE_ACCOUNT_ID='a'.repeat(32);
  process.env.GATEWAY_LIFECYCLE_ZONE_MAP=JSON.stringify({'site-one.com':'b'.repeat(32)});
}
function signature(proof:GatewayLifecycleProof) {
  return createHmac('sha256',process.env.GATEWAY_LIFECYCLE_ATTESTATION_SECRET!).update(gatewayLifecycleProofBytes(proof)).digest('hex');
}
async function setLifecycleBaseline() {
  await DomainClaim.updateOne({_id:'site-one.com'},{$set:{gatewayState:'staged',gatewayRollbackTarget:lifecycleRollbackHash,gatewayRollbackReceipt:lifecycleReceipt,gatewayRoutePolicyFingerprint:'c'.repeat(64)}});
  lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
}

it('consumes verified activation and nonce in the same local transaction; replay cannot repeat it', async () => {
  const id=await seed('site-one'); await createGatewayDomainOwnership('site-one.com',id,String(actor)); await setLifecycleBaseline(); lifecycleSetup();
  const proof=lifecycleProof(id,1,'d'.repeat(32));
  const result=await activateGatewayDomain(proof,signature(proof));
  expect(result).toMatchObject({domain:'site-one.com',tenantId:id,revision:2,state:'active'});
  expect(await GatewayLifecycleNonce.findById(proof.nonce).lean()).not.toBeNull();
  expect(await DomainClaim.findById('site-one.com').lean()).toMatchObject({gatewayState:'active',gatewayPreviousEmailDomainPresent:false});
  expect(await Tenant.findById(id).lean()).toMatchObject({gatewayVerifiedEmailDomain:'site-one.com',gatewayDomainRevision:2});
  await expect(activateGatewayDomain(proof,signature(proof))).rejects.toThrow();
});

it('stages an immutable web-only rollback receipt without marking live, then activates with a fresh proof', async () => {
  const id=await seed('site-one'); await createGatewayDomainOwnership('site-one.com',id,String(actor)); lifecycleSetup();
  lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
  const stage={...lifecycleProof(id,1,'5'.repeat(32)),action:'stage' as const,zoneState:'pending' as const,
    dns:'other' as const,tls:'unknown' as const,tenant:'unknown' as const,serviceParity:'unknown' as const,policyMatch:'unknown' as const};
  await expect(stageGatewayDomain(stage,signature(stage),lifecycleReceipt)).resolves.toMatchObject({state:'staged',revision:2});
  expect(await DomainClaim.findById('site-one.com').lean()).toMatchObject({gatewayState:'staged',gatewayRollbackReceipt:lifecycleReceipt,gatewayRollbackTarget:lifecycleRollbackHash});
  expect(await Tenant.findById(id).lean()).toMatchObject({domainMigrated:false,gatewayDomainRevision:2});
  expect((await Tenant.findById(id).lean())?.gatewayVerifiedEmailDomain).toBeUndefined();
  const activate=lifecycleProof(id,2,'6'.repeat(32));
  await expect(activateGatewayDomain(activate,signature(activate))).resolves.toMatchObject({state:'active',revision:3});
});

it('rejects stage with missing or tampered rollback receipt without consuming nonce', async () => {
  const id=await seed('site-one'); await createGatewayDomainOwnership('site-one.com',id,String(actor)); lifecycleSetup();
  lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
  const stage={...lifecycleProof(id,1,'7'.repeat(32)),action:'stage' as const,zoneState:'pending' as const,
    dns:'other' as const,tls:'unknown' as const,tenant:'unknown' as const,serviceParity:'unknown' as const,policyMatch:'unknown' as const};
  await expect(stageGatewayDomain(stage,signature(stage),'')).rejects.toThrow('Rollback receipt unavailable');
  await expect(stageGatewayDomain(stage,signature(stage),lifecycleReceipt.replace('203.0.113.4','203.0.113.5'))).rejects.toThrow('Rollback receipt unavailable');
  expect(await GatewayLifecycleNonce.countDocuments()).toBe(0);
});

it('requires real super-admin authentication and matching tenant at the lifecycle route', async () => {
  const id=await seed('site-one'); await createGatewayDomainOwnership('site-one.com',id,String(actor)); lifecycleSetup();
  lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
  const stage={...lifecycleProof(id,1,'9'.repeat(32)),action:'stage' as const,zoneState:'pending' as const,
    dns:'other' as const,tls:'unknown' as const,tenant:'unknown' as const,serviceParity:'unknown' as const,policyMatch:'unknown' as const};
  const body={proof:stage,signature:signature(stage),receipt:lifecycleReceipt}, url=`/tenants/${id}/gateway-lifecycle`;
  await request(app).post(url).send(body).expect(401);
  await request(app).post(url).set('Authorization',await bearer('brand-admin')).send(body).expect(403);
  const auth=await bearer('super-admin');
  await request(app).post(`/tenants/${new Types.ObjectId()}/gateway-lifecycle`).set('Authorization',auth).send(body).expect(409);
  const staged=await request(app).post(url).set('Authorization',auth).send(body).expect(200);
  expect(staged.body.data).toMatchObject({state:'staged',revision:2});
  const activate=lifecycleProof(id,2,'a'.repeat(32));
  const result=await request(app).post(url).set('Authorization',auth).send({proof:activate,signature:signature(activate)}).expect(200);
  expect(result.body.data).toMatchObject({state:'active',revision:3});
  await request(app).post(url).set('Authorization',auth).send({proof:activate,signature:signature(activate)}).expect(409);
});

it('rolls back only a freshly verified saved baseline, restoring email state while retaining claim', async () => {
  const id=await seed('site-one'); await createGatewayDomainOwnership('site-one.com',id,String(actor)); lifecycleSetup();
  lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
  const stage={...lifecycleProof(id,1,'b'.repeat(32)),action:'stage' as const,zoneState:'pending' as const,
    dns:'other' as const,tls:'unknown' as const,tenant:'unknown' as const,serviceParity:'unknown' as const,policyMatch:'unknown' as const};
  await stageGatewayDomain(stage,signature(stage),lifecycleReceipt);
  const activate=lifecycleProof(id,2,'c'.repeat(32)); await activateGatewayDomain(activate,signature(activate));
  const rollback={...lifecycleProof(id,3,'d'.repeat(32)),action:'rollback' as const,route:'rollback' as const,
    dns:'other' as const,tenant:'unknown' as const,rollbackMatched:'matched' as const,policyMatch:'unknown' as const};
  const invalid={...rollback,rollbackMatched:'unknown' as const};
  await expect(rollbackGatewayDomain(invalid,signature(invalid))).rejects.toThrow('Observation unavailable');
  expect((await DomainClaim.findById('site-one.com').lean())?.gatewayState).toBe('active');
  await expect(rollbackGatewayDomain(rollback,signature(rollback))).resolves.toMatchObject({state:'rolled_back',revision:4});
  expect(await DomainClaim.findById('site-one.com').lean()).toMatchObject({gatewayState:'rolled_back',provider:'cloudflare'});
  const site=await Tenant.findById(id).lean();
  expect(site?.customDomain).toBe('site-one.com'); expect(site?.gatewayVerifiedEmailDomain).toBeUndefined();
  await expect(rollbackGatewayDomain(rollback,signature(rollback))).rejects.toThrow();
});

it('requires same-tenant proof when the recorded rollback origin is a network site', async () => {
  const id=await seed('site-one'); await createGatewayDomainOwnership('site-one.com',id,String(actor)); lifecycleSetup();
  lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
  const parts=JSON.parse(lifecycleReceipt);parts[8]='network';const receipt=JSON.stringify(parts);
  const hash=createHash('sha256').update(receipt).digest('hex');
  const stage={...lifecycleProof(id,1,'a'.repeat(32)),previousTarget:hash,action:'stage' as const,zoneState:'pending' as const,
    dns:'other' as const,tls:'unknown' as const,tenant:'unknown' as const,serviceParity:'unknown' as const,policyMatch:'unknown' as const};
  await stageGatewayDomain(stage,signature(stage),receipt);
  const activate={...lifecycleProof(id,2,'b'.repeat(32)),previousTarget:hash}; await activateGatewayDomain(activate,signature(activate));
  const rollback={...lifecycleProof(id,3,'c'.repeat(32)),previousTarget:hash,action:'rollback' as const,route:'rollback' as const,
    dns:'other' as const,tenant:'unknown' as const,rollbackMatched:'matched' as const,policyMatch:'unknown' as const};
  await expect(rollbackGatewayDomain(rollback,signature(rollback))).rejects.toThrow('tenant verification unavailable');
  const matched={...rollback,tenant:'matched' as const};
  await expect(rollbackGatewayDomain(matched,signature(matched))).resolves.toMatchObject({state:'rolled_back'});
});

it('renews primary verification with fresh signed reconciliation without changing rollback provenance', async () => {
  const id=await seed('site-one');await createGatewayDomainOwnership('site-one.com',id,String(actor));lifecycleSetup();
  lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
  const stage={...lifecycleProof(id,1,'1'.repeat(32)),action:'stage' as const,zoneState:'pending' as const,
    dns:'other' as const,tls:'unknown' as const,tenant:'unknown' as const,serviceParity:'unknown' as const,policyMatch:'unknown' as const};
  await stageGatewayDomain(stage,signature(stage),lifecycleReceipt);
  const activate=lifecycleProof(id,2,'2'.repeat(32));await activateGatewayDomain(activate,signature(activate));
  process.env.GATEWAY_ALIAS_ENABLED='true';process.env.GATEWAY_DOMAIN_RESOLVER_ENABLED='true';
  process.env.GATEWAY_DOMAIN_SCOPE='site-one.com,alias-one.com';process.env.GATEWAY_ALIAS_PRIMARY_SCOPE='site-one.com';
  await createGatewayAlias('alias-one.com',id,String(actor),'site-one.com');
  await DomainClaim.updateOne({_id:'alias-one.com'},{$set:{gatewayState:'active',gatewayVerifiedAt:new Date()}});
  await DomainClaim.updateOne({_id:'site-one.com'},{$set:{gatewayVerifiedAt:new Date(Date.now()-301_000)}});
  expect((await request(app).get('/tenants/gateway-domain/alias-one.com').expect(200)).body.data.canonicalReady).toBe(true);
  const before=await DomainClaim.findById('site-one.com').lean();
  const renew={...lifecycleProof(id,4,'3'.repeat(32)),action:'reconcile' as const};
  await expect(activateGatewayDomain(renew,signature(renew))).resolves.toMatchObject({state:'active',revision:5});
  process.env.GATEWAY_LIFECYCLE_STATUS_ENABLED='true';process.env.GATEWAY_LIFECYCLE_STATUS_SCOPE='site-one.com';
  const operation=await request(app).get(`/tenants/${id}/gateway-lifecycle-operation/site-one.com/${renew.nonce}`).set('Authorization',await bearer('super-admin')).expect(200);
  expect(operation.body.data).toMatchObject({historical:{action:'reconcile',state:'active',revision:5},routing:'not-checked'});
  const after=await DomainClaim.findById('site-one.com').lean();
  expect(after?.gatewayRollbackReceipt).toBe(before?.gatewayRollbackReceipt);
  expect(after?.gatewayPreviousEmailDomainPresent).toBe(before?.gatewayPreviousEmailDomainPresent);
  expect((await Tenant.findById(id).lean())?.gatewayVerifiedEmailDomain).toBe('site-one.com');
  expect((await request(app).get('/tenants/gateway-domain/alias-one.com').expect(200)).body.data.canonicalReady).toBe(true);
  await expect(activateGatewayDomain(renew,signature(renew))).rejects.toThrow();
  const rollback={...lifecycleProof(id,5,'4'.repeat(32)),action:'rollback' as const,route:'rollback' as const,
    dns:'other' as const,tenant:'unknown' as const,rollbackMatched:'matched' as const,policyMatch:'unknown' as const};
  await rollbackGatewayDomain(rollback,signature(rollback));
  const afterRollback={...lifecycleProof(id,6,'5'.repeat(32)),action:'reconcile' as const};
  await expect(activateGatewayDomain(afterRollback,signature(afterRollback))).rejects.toThrow();
  expect((await request(app).get('/tenants/gateway-domain/alias-one.com').expect(200)).body.data.canonicalReady).toBe(false);
});

it('distinguishes confirmed reconciliation mismatch from an outage and protects email links', async () => {
  const id=await seed('site-one');await createGatewayDomainOwnership('site-one.com',id,String(actor));lifecycleSetup();
  lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
  const stage={...lifecycleProof(id,1,'1'.repeat(32)),action:'stage' as const,zoneState:'pending' as const,
    dns:'other' as const,tls:'unknown' as const,tenant:'unknown' as const,serviceParity:'unknown' as const,policyMatch:'unknown' as const};
  await stageGatewayDomain(stage,signature(stage),lifecycleReceipt);
  const activate=lifecycleProof(id,2,'2'.repeat(32));await activateGatewayDomain(activate,signature(activate));
  const unknown={...lifecycleProof(id,3,'3'.repeat(32)),action:'reconcile' as const,tls:'unknown' as const};
  await expect(activateGatewayDomain(unknown,signature(unknown))).rejects.toThrow('Observation unavailable');
  expect(await GatewayLifecycleNonce.findById(unknown.nonce).lean()).toBeNull();
  let site=(await Tenant.findById(id).lean())!;expect(getEmailBrand(site).origin).toBe('https://site-one.com');
  const mismatch={...lifecycleProof(id,3,'4'.repeat(32)),action:'reconcile' as const,tenant:'mismatch' as const};
  await expect(activateGatewayDomain(mismatch,'0'.repeat(64))).rejects.toThrow('Observation unavailable');
  expect((await DomainClaim.findById('site-one.com').lean())?.gatewayState).toBe('active');
  await expect(activateGatewayDomain(mismatch,signature(mismatch))).resolves.toMatchObject({state:'unverified',revision:4});
  site=(await Tenant.findById(id).lean())!;expect(site.gatewayEmailState).toBe('unverified');
  expect(getEmailBrand(site).origin).not.toBe('https://site-one.com');
  const recovery={...lifecycleProof(id,4,'5'.repeat(32)),action:'reconcile' as const};
  await expect(activateGatewayDomain(recovery,signature(recovery))).resolves.toMatchObject({state:'active',revision:5});
  site=(await Tenant.findById(id).lean())!;expect(getEmailBrand(site).origin).toBe('https://site-one.com');
});

it('keeps an alias noindex until both claims are verified and tracks mismatch, recovery and primary rollback', async () => {
  const id=await seed('site-one','primary-site.com');process.env.GATEWAY_ALIAS_ENABLED='true';process.env.GATEWAY_DOMAIN_RESOLVER_ENABLED='true';
  await createGatewayAlias('site-one.com',id,String(actor),'primary-site.com');lifecycleSetup();
  await DomainClaim.create({_id:'primary-site.com',tenantId:id,provider:'cloudflare',claimGeneration:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gatewayState:'active',gatewayVerifiedAt:new Date()});
  await Tenant.updateOne({_id:id},{$set:{gatewayVerifiedEmailDomain:'primary-site.com',gatewayEmailState:'verified',gatewayEmailManaged:true},$inc:{gatewayOwnedCount:1,gatewayDomainRevision:1}});
  lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
  const get=async () => (await request(app).get('/tenants/gateway-domain/www.site-one.com').expect(200)).body.data;
  expect(await get()).toMatchObject({visitorHost:'www.site-one.com',canonicalReady:false});
  const stage={...lifecycleProof(id,2,'1'.repeat(32)),action:'stage' as const,zoneState:'pending' as const,
    dns:'other' as const,tls:'unknown' as const,tenant:'unknown' as const,serviceParity:'unknown' as const,policyMatch:'unknown' as const};
  await stageGatewayDomain(stage,signature(stage),lifecycleReceipt);expect((await get()).canonicalReady).toBe(false);
  const activate=lifecycleProof(id,3,'2'.repeat(32));await activateGatewayDomain(activate,signature(activate));
  expect((await get()).canonicalReady).toBe(true);
  const mismatch={...lifecycleProof(id,4,'3'.repeat(32)),action:'reconcile' as const,tenant:'mismatch' as const};
  await activateGatewayDomain(mismatch,signature(mismatch));expect((await get()).canonicalReady).toBe(false);
  const recovery={...lifecycleProof(id,5,'4'.repeat(32)),action:'reconcile' as const};
  await activateGatewayDomain(recovery,signature(recovery));expect((await get()).canonicalReady).toBe(true);
  await DomainClaim.updateOne({_id:'primary-site.com'},{$set:{gatewayState:'rolled_back'}});
  expect((await get()).canonicalReady).toBe(false);
  expect((await Tenant.findById(id).lean())?.customDomain).toBe('primary-site.com');
});

it('accepts a signed changed policy as mismatch but rejects contradictory or unknown policy reports', async () => {
  const id=await seed('site-one');await createGatewayDomainOwnership('site-one.com',id,String(actor));lifecycleSetup();
  lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
  const stage={...lifecycleProof(id,1,'1'.repeat(32)),action:'stage' as const,zoneState:'pending' as const,
    dns:'other' as const,tls:'unknown' as const,tenant:'unknown' as const,serviceParity:'unknown' as const,policyMatch:'unknown' as const};
  await stageGatewayDomain(stage,signature(stage),lifecycleReceipt);
  const activate=lifecycleProof(id,2,'2'.repeat(32));await activateGatewayDomain(activate,signature(activate));
  const unknown={...lifecycleProof(id,3,'3'.repeat(32)),action:'reconcile' as const,routeFingerprint:'f'.repeat(64),policyMatch:'unknown' as const};
  await expect(activateGatewayDomain(unknown,signature(unknown))).rejects.toThrow('Observation unavailable');
  expect(await GatewayLifecycleNonce.findById(unknown.nonce).lean()).toBeNull();
  const contradictory={...lifecycleProof(id,3,'4'.repeat(32)),action:'reconcile' as const,policyMatch:'mismatch' as const};
  await expect(activateGatewayDomain(contradictory,signature(contradictory))).rejects.toThrow('Policy observation inconsistent');
  expect(await GatewayLifecycleNonce.findById(contradictory.nonce).lean()).toBeNull();
  const changed={...lifecycleProof(id,3,'5'.repeat(32)),action:'reconcile' as const,routeFingerprint:'f'.repeat(64),policyMatch:'mismatch' as const};
  await expect(activateGatewayDomain(changed,'0'.repeat(64))).rejects.toThrow('Observation unavailable');
  await expect(activateGatewayDomain(changed,signature(changed))).resolves.toMatchObject({state:'unverified',revision:4});
  const site=(await Tenant.findById(id).lean())!;expect(getEmailBrand(site).origin).not.toBe('https://site-one.com');
  await expect(activateGatewayDomain(changed,signature(changed))).rejects.toThrow();
});

it('marks the same policy unverified when a signed observation confirms invalid TLS', async () => {
  const id=await seed('site-one');await createGatewayDomainOwnership('site-one.com',id,String(actor));await setLifecycleBaseline();lifecycleSetup();
  const activate=lifecycleProof(id,1,'6'.repeat(32));await activateGatewayDomain(activate,signature(activate));
  const invalidTls={...lifecycleProof(id,2,'7'.repeat(32)),action:'reconcile' as const,tls:'invalid' as const};
  await expect(activateGatewayDomain(invalidTls,signature(invalidTls))).resolves.toMatchObject({state:'unverified',revision:3});
  expect((await Tenant.findById(id).lean())?.gatewayEmailState).toBe('unverified');
});

async function throughRollback(id:string) {
  lifecycleSetup(); lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
  const stage={...lifecycleProof(id,1,'1'.repeat(32)),action:'stage' as const,zoneState:'pending' as const,
    dns:'other' as const,tls:'unknown' as const,tenant:'unknown' as const,serviceParity:'unknown' as const,policyMatch:'unknown' as const};
  await stageGatewayDomain(stage,signature(stage),lifecycleReceipt);
  const activate=lifecycleProof(id,2,'2'.repeat(32));await activateGatewayDomain(activate,signature(activate));
  const rollback={...lifecycleProof(id,3,'3'.repeat(32)),action:'rollback' as const,route:'rollback' as const,
    dns:'other' as const,tenant:'unknown' as const,rollbackMatched:'matched' as const,policyMatch:'unknown' as const};
  await rollbackGatewayDomain(rollback,signature(rollback));
  return {...lifecycleProof(id,4,'4'.repeat(32)),action:'detach' as const,route:'rollback' as const,
    dns:'other' as const,tenant:'unknown' as const,rollbackMatched:'matched' as const,gatewayAbsent:'yes' as const,policyMatch:'unknown' as const};
}

it('conditionally detaches a new claim, restores absent fields, and allows exact idempotent retry', async () => {
  const id=await seed('site-one');const stale=(await Tenant.findById(id))!;
  await createGatewayDomainOwnership('site-one.com',id,String(actor));const detach=await throughRollback(id);
  const notAbsent={...detach,gatewayAbsent:'unknown' as const};
  await expect(detachGatewayDomain(notAbsent,signature(notAbsent))).rejects.toThrow('Observation unavailable');
  expect(await DomainClaim.findById('site-one.com').lean()).not.toBeNull();
  const result=await detachGatewayDomain(detach,signature(detach));
  expect(result).toMatchObject({state:'detached',revision:5});
  expect(await detachGatewayDomain(detach,signature(detach))).toEqual(result);
  await Tenant.updateOne({_id:id},{$set:{slug:'changed-site'}});
  await expect(detachGatewayDomain(detach,signature(detach))).rejects.toThrow('Observation already used');
  await Tenant.updateOne({_id:id},{$set:{slug:'site-one'}});
  expect(await DomainClaim.findById('site-one.com').lean()).toBeNull();
  expect(await GatewayLifecycleArchive.findOne({domain:'site-one.com'}).lean()).toMatchObject({rollbackReceipt:lifecycleReceipt,rollbackHash:lifecycleRollbackHash});
  const raw=await Tenant.collection.findOne({_id:new Types.ObjectId(id)});
  expect(raw).not.toHaveProperty('customDomain'); expect(raw).not.toHaveProperty('domainMigrated');
  expect(raw).not.toHaveProperty('customDomainStatus'); expect(raw).toMatchObject({gatewayDomainRevision:5,gatewayOwnedCount:0});
  guardGatewaySeedDocument(stale,'unrelated.invalid');stale.name='stale';
  await expect(stale.save({validateBeforeSave:false})).rejects.toThrow();
  const fresh=(await Tenant.findById(id))!;guardGatewaySeedDocument(fresh,'unrelated.invalid');fresh.name='fresh';
  await expect(fresh.save({validateBeforeSave:false})).resolves.toBeTruthy();
  await DomainClaim.create({_id:'site-one.com',tenantId:new Types.ObjectId(),provider:'cloudflare',claimGeneration:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
  await expect(detachGatewayDomain(detach,signature(detach))).rejects.toThrow('already used');
});

it('requires authenticated super-admin for detach and permits only the exact signed retry', async () => {
  const id=await seed('site-one');await createGatewayDomainOwnership('site-one.com',id,String(actor));
  const detach=await throughRollback(id);const body={proof:detach,signature:signature(detach)};
  const url=`/tenants/${id}/gateway-lifecycle`;
  await request(app).post(url).send(body).expect(401);
  await request(app).post(url).set('Authorization',await bearer('brand-admin')).send(body).expect(403);
  expect(await DomainClaim.findById('site-one.com').lean()).not.toBeNull();
  const auth=await bearer('super-admin');
  const first=await request(app).post(url).set('Authorization',auth).send(body).expect(200);
  const retry=await request(app).post(url).set('Authorization',auth).send(body).expect(200);
  expect(retry.body.data).toEqual(first.body.data);
});

it('exposes detached history to scoped super-admin after proof expiry and nonce cleanup without claiming current routing', async () => {
  const id=await seed('site-one');await createGatewayDomainOwnership('site-one.com',id,String(actor));
  const detach=await throughRollback(id);await detachGatewayDomain(detach,signature(detach));
  await GatewayLifecycleNonce.deleteOne({_id:detach.nonce});
  await expect(detachGatewayDomain(detach,signature(detach),Date.now()+60_000)).rejects.toThrow('Observation unavailable');
  const url=`/tenants/${id}/gateway-lifecycle-status/site-one.com/${detach.claimGeneration}`;
  const auth=await bearer('super-admin');
  await request(app).get(url).set('Authorization',auth).expect(503);
  process.env.GATEWAY_LIFECYCLE_STATUS_ENABLED='true';process.env.GATEWAY_LIFECYCLE_STATUS_SCOPE='site-one.com';
  await request(app).get(url).expect(401);
  await request(app).get(url).set('Authorization',await bearer('brand-admin')).expect(403);
  const first=await request(app).get(url).set('Authorization',auth).expect(200);
  expect(first.body.data).toMatchObject({historical:{outcome:'detached'},current:{claim:'absent',revision:5,ownedCount:0},routing:'not-checked'});
  const wrongTenant=new Types.ObjectId();
  await request(app).get(`/tenants/${wrongTenant}/gateway-lifecycle-status/site-one.com/${detach.claimGeneration}`).set('Authorization',auth).expect(404);
  await DomainClaim.create({_id:'site-one.com',tenantId:new Types.ObjectId(),provider:'cloudflare',claimGeneration:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
  await Tenant.updateOne({_id:id},{$inc:{gatewayDomainRevision:1}});
  const current=await request(app).get(url).set('Authorization',auth).expect(200);
  expect(current.body.data).toMatchObject({historical:{outcome:'detached'},current:{claim:'another-owner',revision:6},routing:'not-checked'});
});

it('recovers every lifecycle operation after nonce expiry while distinguishing a later claim', async () => {
  const id=await seed('site-one');await createGatewayDomainOwnership('site-one.com',id,String(actor));
  const detach=await throughRollback(id);await detachGatewayDomain(detach,signature(detach));
  await GatewayLifecycleNonce.deleteMany({});
  process.env.GATEWAY_LIFECYCLE_STATUS_ENABLED='true';process.env.GATEWAY_LIFECYCLE_STATUS_SCOPE='site-one.com';
  const auth=await bearer('super-admin'), customer=await bearer('customer');
  for(const [nonce,action,state,revision] of [['1','stage','staged',2],['2','activate','active',3],['3','rollback','rolled_back',4],['4','detach','detached',5]] as const) {
    const url=`/tenants/${id}/gateway-lifecycle-operation/site-one.com/${nonce.repeat(32)}`;
    await request(app).get(url).expect(401);
    await request(app).get(url).set('Authorization',customer).expect(403);
    const result=await request(app).get(url).set('Authorization',auth).expect(200);
    expect(result.body.data).toMatchObject({historical:{action,state,revision,claimGeneration:detach.claimGeneration},current:{claim:'absent',revision:5},routing:'not-checked'});
  }
  const stageUrl=`/tenants/${id}/gateway-lifecycle-operation/site-one.com/${'1'.repeat(32)}`;
  await request(app).get(`/tenants/${new Types.ObjectId()}/gateway-lifecycle-operation/site-one.com/${'1'.repeat(32)}`).set('Authorization',auth).expect(404);
  await DomainClaim.create({_id:'site-one.com',tenantId:id,provider:'cloudflare',claimGeneration:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
  await Tenant.updateOne({_id:id},{$inc:{gatewayDomainRevision:1}});
  const changed=await request(app).get(stageUrl).set('Authorization',auth).expect(200);
  expect(changed.body.data).toMatchObject({historical:{action:'stage',state:'staged'},current:{claim:'gateway-claim',state:'reserved',sameGeneration:false,revision:6},routing:'not-checked'});
});

it('restores a pre-existing legacy claim and original tenant fields on detach', async () => {
  const id=await seed('site-one','site-one.com');
  await Tenant.collection.updateOne({_id:new Types.ObjectId(id)},{$set:{domainMigrated:true,customDomainStatus:'ready'}});
  await DomainClaim.create({_id:'site-one.com',tenantId:id});
  await createGatewayDomainOwnership('site-one.com',id,String(actor),{adoptExisting:true,expectedCurrentDomain:'site-one.com'});
  const detach=await throughRollback(id);await detachGatewayDomain(detach,signature(detach));
  const claim=await DomainClaim.findById('site-one.com').lean();expect(claim).toBeTruthy();
  expect(claim?.provider).toBeUndefined();expect(claim?.claimGeneration).toBeUndefined();
  expect(await Tenant.findById(id).lean()).toMatchObject({customDomain:'site-one.com',domainMigrated:true,customDomainStatus:'ready',gatewayOwnedCount:0,gatewayDomainRevision:5});
});

it('restores explicitly null pre-reservation fields rather than deleting them', async () => {
  const id=await seed('site-one');
  const priorActor=new Types.ObjectId();
  await Tenant.collection.updateOne({_id:new Types.ObjectId(id)},{$set:{customDomain:null,customDomainStatus:null,domainMigrated:null,customDomainLastChangedBy:priorActor,gatewayVerifiedEmailDomain:null,gatewayEmailState:null}});
  await createGatewayDomainOwnership('site-one.com',id,String(actor));
  const detach=await throughRollback(id);await detachGatewayDomain(detach,signature(detach));
  const raw=await Tenant.collection.findOne({_id:new Types.ObjectId(id)});
  expect(raw).toMatchObject({customDomain:null,customDomainStatus:null,domainMigrated:null,customDomainLastChangedBy:priorActor,gatewayVerifiedEmailDomain:null,gatewayEmailState:null,gatewayOwnedCount:0,gatewayDomainRevision:5});
});

it('refuses to detach a primary while a dependent alias remains', async () => {
  const id=await seed('site-one');await createGatewayDomainOwnership('site-one.com',id,String(actor));
  process.env.GATEWAY_ALIAS_ENABLED='true';process.env.GATEWAY_DOMAIN_SCOPE='site-one.com,alias-one.com';
  process.env.GATEWAY_ALIAS_PRIMARY_SCOPE='site-one.com';
  await createGatewayAlias('alias-one.com',id,String(actor),'site-one.com');lifecycleSetup();
  lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
  const stage={...lifecycleProof(id,2,'1'.repeat(32)),action:'stage' as const,zoneState:'pending' as const,
    dns:'other' as const,tls:'unknown' as const,tenant:'unknown' as const,serviceParity:'unknown' as const,policyMatch:'unknown' as const};
  await stageGatewayDomain(stage,signature(stage),lifecycleReceipt);
  const activate=lifecycleProof(id,3,'2'.repeat(32));await activateGatewayDomain(activate,signature(activate));
  const rollback={...lifecycleProof(id,4,'3'.repeat(32)),action:'rollback' as const,route:'rollback' as const,
    dns:'other' as const,tenant:'unknown' as const,rollbackMatched:'matched' as const,policyMatch:'unknown' as const};
  await rollbackGatewayDomain(rollback,signature(rollback));
  const detach={...lifecycleProof(id,5,'4'.repeat(32)),action:'detach' as const,route:'rollback' as const,
    dns:'other' as const,tenant:'unknown' as const,rollbackMatched:'matched' as const,gatewayAbsent:'yes' as const,policyMatch:'unknown' as const};
  await expect(detachGatewayDomain(detach,signature(detach))).rejects.toThrow('dependent aliases');
  expect(await DomainClaim.countDocuments({tenantId:new Types.ObjectId(id),provider:'cloudflare'})).toBe(2);
  expect((await Tenant.findById(id).lean())?.gatewayOwnedCount).toBe(2);
});

it('releases an alias without changing its existing primary or primary email state', async () => {
  const id=await seed('site-one','primary-site.com');process.env.GATEWAY_ALIAS_ENABLED='true';
  await Tenant.collection.updateOne({_id:new Types.ObjectId(id)},{$set:{gatewayVerifiedEmailDomain:'primary-site.com'}});
  await createGatewayAlias('site-one.com',id,String(actor),'primary-site.com'); lifecycleSetup();
  lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
  const stage={...lifecycleProof(id,1,'1'.repeat(32)),action:'stage' as const,zoneState:'pending' as const,
    dns:'other' as const,tls:'unknown' as const,tenant:'unknown' as const,serviceParity:'unknown' as const,policyMatch:'unknown' as const};
  await stageGatewayDomain(stage,signature(stage),lifecycleReceipt);
  const activate=lifecycleProof(id,2,'2'.repeat(32));await activateGatewayDomain(activate,signature(activate));
  const rollback={...lifecycleProof(id,3,'3'.repeat(32)),action:'rollback' as const,route:'rollback' as const,
    dns:'other' as const,tenant:'unknown' as const,rollbackMatched:'matched' as const,policyMatch:'unknown' as const};
  await rollbackGatewayDomain(rollback,signature(rollback));
  const detach={...lifecycleProof(id,4,'4'.repeat(32)),action:'detach' as const,route:'rollback' as const,
    dns:'other' as const,tenant:'unknown' as const,rollbackMatched:'matched' as const,gatewayAbsent:'yes' as const,policyMatch:'unknown' as const};
  await detachGatewayDomain(detach,signature(detach));
  expect(await DomainClaim.findById('site-one.com').lean()).toBeNull();
  expect(await Tenant.findById(id).lean()).toMatchObject({customDomain:'primary-site.com',gatewayVerifiedEmailDomain:'primary-site.com',gatewayOwnedCount:0,gatewayDomainRevision:5});
});

it('rejects expired, unverified and foreign-account observation without consuming a nonce', async () => {
  const id=await seed('site-one'); await createGatewayDomainOwnership('site-one.com',id,String(actor)); await setLifecycleBaseline(); lifecycleSetup();
  const expired={...lifecycleProof(id,1,'e'.repeat(32)),observedAt:Date.now()-20000,expiresAt:Date.now()-1000};
  await expect(activateGatewayDomain(expired,signature(expired))).rejects.toThrow();
  const unknown={...lifecycleProof(id,1,'f'.repeat(32)),tls:'unknown' as const};
  await expect(activateGatewayDomain(unknown,signature(unknown))).rejects.toThrow();
  const foreign={...lifecycleProof(id,1,'1'.repeat(32)),accountId:'f'.repeat(32)};
  await expect(activateGatewayDomain(foreign,signature(foreign))).rejects.toThrow();
  expect(await GatewayLifecycleNonce.countDocuments()).toBe(0);
  expect((await DomainClaim.findById('site-one.com').lean())?.gatewayState).toBe('staged');
});

it('serializes concurrent activation attempts and rejects nonce reuse even after a fresh revision', async () => {
  const id=await seed('site-one'); await createGatewayDomainOwnership('site-one.com',id,String(actor)); await setLifecycleBaseline(); lifecycleSetup();
  const proof=lifecycleProof(id,1,'2'.repeat(32));
  const outcomes=await Promise.allSettled([activateGatewayDomain(proof,signature(proof)),activateGatewayDomain(proof,signature(proof))]);
  expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  expect(await GatewayLifecycleNonce.countDocuments()).toBe(1);
  const reused=lifecycleProof(id,2,proof.nonce);
  await expect(activateGatewayDomain(reused,signature(reused))).rejects.toThrow();
  expect((await Tenant.findById(id).lean())?.gatewayDomainRevision).toBe(2);
});

it('rejects a fresh activation that reuses the nonce consumed during staging', async () => {
  const id=await seed('site-one'); await createGatewayDomainOwnership('site-one.com',id,String(actor)); lifecycleSetup();
  lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
  const stage={...lifecycleProof(id,1,'8'.repeat(32)),action:'stage' as const,zoneState:'pending' as const,
    dns:'other' as const,tls:'unknown' as const,tenant:'unknown' as const,serviceParity:'unknown' as const,policyMatch:'unknown' as const};
  await stageGatewayDomain(stage,signature(stage),lifecycleReceipt);
  const reused=lifecycleProof(id,2,stage.nonce);
  await expect(activateGatewayDomain(reused,signature(reused))).rejects.toThrow('Observation already used');
  expect((await DomainClaim.findById('site-one.com').lean())?.gatewayState).toBe('staged');
});

it('requires the signed observation to match the stored rollback target and routing policy', async () => {
  const id=await seed('site-one'); await createGatewayDomainOwnership('site-one.com',id,String(actor)); lifecycleSetup();
  lifecycleGeneration=(await DomainClaim.findById('site-one.com').lean())!.claimGeneration!;
  const proof=lifecycleProof(id,1,'3'.repeat(32));
  await expect(activateGatewayDomain(proof,signature(proof))).rejects.toThrow('baseline unavailable');
  await setLifecycleBaseline();
  const wrongTarget={...proof,previousTarget:'0'.repeat(64)};
  await expect(activateGatewayDomain(wrongTarget,signature(wrongTarget))).rejects.toThrow('baseline unavailable');
  const wrongPolicy={...proof,routeFingerprint:'f'.repeat(64)};
  await expect(activateGatewayDomain(wrongPolicy,signature(wrongPolicy))).rejects.toThrow('Policy observation inconsistent');
  expect(await GatewayLifecycleNonce.countDocuments()).toBe(0);
});

it('rejects a signed stale-slug activation without consuming its nonce', async () => {
  const id=await seed('site-one');await createGatewayDomainOwnership('site-one.com',id,String(actor));await setLifecycleBaseline();lifecycleSetup();
  const proof=lifecycleProof(id,1,'c'.repeat(32));const signed=signature(proof);
  await Tenant.updateOne({_id:id},{$set:{slug:'changed-site'}});
  await expect(activateGatewayDomain(proof,signed)).rejects.toThrow('Observation unavailable');
  expect(await GatewayLifecycleNonce.findById(proof.nonce).lean()).toBeNull();
  await Tenant.updateOne({_id:id},{$set:{slug:'site-one'}});
  await expect(activateGatewayDomain(proof,signed)).resolves.toMatchObject({state:'active'});
});

it('aborts an in-flight activation when the tenant slug changes before its CAS', async () => {
  const id=await seed('site-one');await createGatewayDomainOwnership('site-one.com',id,String(actor));await setLifecycleBaseline();lifecycleSetup();
  const proof=lifecycleProof(id,1,'c'.repeat(32));const signed=signature(proof);
  const original=Tenant.findOneAndUpdate.bind(Tenant);
  jest.spyOn(Tenant,'findOneAndUpdate').mockImplementationOnce(((...args:unknown[]) => ({
    lean:async()=>{
      await Tenant.collection.updateOne({_id:new Types.ObjectId(id)},{$set:{slug:'changed-site'}});
      return (original as (...args:unknown[])=>any)(...args).lean();
    },
  })) as never);
  await expect(activateGatewayDomain(proof,signed)).rejects.toThrow();
  expect(await GatewayLifecycleNonce.findById(proof.nonce).lean()).toBeNull();
  expect((await DomainClaim.findById('site-one.com').lean())?.gatewayState).toBe('staged');
});

it('rejects a proof issued for a deleted and recreated claim with the same domain and tenant', async () => {
  const id=await seed('site-one'); await createGatewayDomainOwnership('site-one.com',id,String(actor)); await setLifecycleBaseline(); lifecycleSetup();
  const proof=lifecycleProof(id,1,'4'.repeat(32));
  await DomainClaim.deleteOne({_id:'site-one.com'});
  await DomainClaim.create({_id:'site-one.com',tenantId:id,provider:'cloudflare',
    claimGeneration:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gatewayState:'staged',gatewayRollbackTarget:lifecycleRollbackHash,gatewayRollbackReceipt:lifecycleReceipt,gatewayRoutePolicyFingerprint:'c'.repeat(64)});
  await expect(activateGatewayDomain(proof,signature(proof))).rejects.toThrow('Observation unavailable');
  expect(await GatewayLifecycleNonce.countDocuments()).toBe(0);
});
