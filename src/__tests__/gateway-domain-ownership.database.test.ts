import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Tenant } from '../models/Tenant';
import { DomainClaim } from '../models/DomainClaim';
import { createGatewayDomainOwnership } from '../services/gatewayDomainOwnership.service';
import express from 'express';
import request from '../test/loopbackRequest';
import tenantRoutes from '../routes/tenants.routes';
import { User } from '../models/User';
import { generateAccessToken } from '../utils/jwt';
import { gatewaySafeSeedFilter, guardGatewaySeedDocument } from '../services/gatewayDomainScope';

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
  await Promise.all([Tenant.init(),DomainClaim.init()]);
},30000);
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  process.env.GATEWAY_DOMAIN_OWNERSHIP_ENABLED='true';
  process.env.GATEWAY_DOMAIN_NAMESPACE_READY='true';
  process.env.GATEWAY_DOMAIN_WRITER_FENCE_ENABLED='true';
  process.env.GATEWAY_DOMAIN_SCOPE='site-one.com';
  await Tenant.deleteMany({}); await DomainClaim.deleteMany({}); await User.deleteMany({});
});
afterEach(() => {
  for (const key of ['GATEWAY_DOMAIN_OWNERSHIP_ENABLED','GATEWAY_DOMAIN_NAMESPACE_READY','GATEWAY_DOMAIN_WRITER_FENCE_ENABLED','GATEWAY_DOMAIN_SCOPE']) Reflect.deleteProperty(process.env,key);
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
