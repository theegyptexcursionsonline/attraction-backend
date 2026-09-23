import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import tenantRoutes from '../routes/tenants.routes';
import { Tenant } from '../models/Tenant';
import { PUBLIC_TENANT_PROJECTION, toPublicTenantDto } from '../controllers/tenants.controller';
import { externalRatingSchema, externalRatingsSchema, publicExternalRatings } from '../utils/externalRatings';

jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
  authenticate: (req: any, res: any, next: any) => {
    if (!req.header('x-test-role')) return res.status(401).json({success:false});
    req.user={role:req.header('x-test-role'),assignedTenants:[req.header('x-test-assigned')]}; next();
  },
}));
const snapshot={source:'getyourguide',activitySlug:'orange-bay-cruise',activityTitle:'Orange Bay Cruise',activityUrl:'https://www.getyourguide.com/hurghada-l403/orange-bay-cruise-t387390/',score:4.9,count:6759,checkedAt:'2026-09-23'};
const owner=new Types.ObjectId(),other=new Types.ObjectId();
const app=express(); app.use(express.json()); app.use('/tenants',tenantRoutes); app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode||500).json({error:error.message}));
let mongo:MongoMemoryReplSet;
jest.setTimeout(120000);
beforeAll(async()=>{const located=spawnSync('which',['mongod'],{encoding:'utf8'});const systemBinary=located.status===0?located.stdout.trim():undefined;const version=systemBinary?spawnSync(systemBinary,['--version'],{encoding:'utf8'}).stdout.match(/db version v([\d.]+)/)?.[1]:undefined;mongo=await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:version||'7.0.14',...(systemBinary?{systemBinary}:{})}});await mongoose.connect(mongo.getUri('external_ratings'));await Tenant.init();});
afterAll(async()=>{await mongoose.disconnect();await mongo?.stop();});
beforeEach(async()=>{await Tenant.collection.deleteMany({});await Tenant.collection.insertMany([owner,other].map((_id,index)=>({_id,name:`Rating site ${index}`,slug:`rating-site-${index}`,domain:`rating-site-${index}.invalid`,customDomain:`rating-site-${index}.invalid`,status:'active',...(index===0?{externalRatings:[snapshot]}:{})})));});

it('accepts an attributed activity snapshot and ISO date or timestamp without changing review fields',()=>{
  expect(externalRatingSchema.parse(snapshot)).toEqual(snapshot);
  expect(externalRatingSchema.parse({...snapshot,checkedAt:'2026-09-23T10:00:00+02:00'}).checkedAt).toBe('2026-09-23T10:00:00+02:00');
  expect(PUBLIC_TENANT_PROJECTION.split(' ')).toContain('externalRatings');
  expect(toPublicTenantDto({externalRatings:[snapshot],rating:1,reviewCount:1,paymentSettings:{stripe:{secretKey:'private'}}})).toEqual({externalRatings:[snapshot]});
});
it.each([
  {source:'tripadvisor'},{score:5.1},{score:-1},{score:'4.9'},{score:Infinity},{count:0},{count:1.5},{count:Number.MAX_SAFE_INTEGER+1},{count:'6759'},
  {checkedAt:'2026-02-30'},{checkedAt:'yesterday'},{activitySlug:'../other'},{activityTitle:'<script>bad</script>'},{activityTitle:''},{unknownField:true},
  {activityUrl:'http://www.getyourguide.com/hurghada-l403/cruise-t387390/'},
  {activityUrl:'https://www.getyourguide.com.evil.invalid/hurghada-l403/cruise-t387390/'},
  {activityUrl:'https://user:secret@www.getyourguide.com/hurghada-l403/cruise-t387390/'},
  {activityUrl:'https://www.getyourguide.com:443/hurghada-l403/cruise-t387390/'},
  {activityUrl:'https://www.getyourguide.com/hurghada-l403/cruise-t387390/?rating=5'},
  {activityUrl:'https://www.getyourguide.com/hurghada-l403/cruise-t387390/#reviews'},
  {activityUrl:'https://www.getyourguide.com/supplier/some-supplier/'},
  {activityUrl:'https://www.getyourguide.com/hurghada-l403/cruise-t0/'},
])('rejects invalid or untrusted snapshot data %j',change=>{expect(externalRatingSchema.safeParse({...snapshot,...change}).success).toBe(false);expect(publicExternalRatings([{...snapshot,...change}])).toEqual([]);});
it('bounds snapshots and rejects duplicate source IDs or canonical tour slugs',()=>{
  const duplicateId={...snapshot,activitySlug:'different-tour',activityUrl:'https://getyourguide.com/another-city-l400/another-title-t387390/'};
  const duplicateSlug={...snapshot,activityUrl:'https://www.getyourguide.com/hurghada-l403/other-tour-t123/'};
  for(const rows of [[snapshot,duplicateId],[snapshot,duplicateSlug],Array(11).fill(snapshot)]) {expect(externalRatingsSchema.safeParse(rows).success).toBe(false);expect(publicExternalRatings(rows)).toEqual([]);}
  expect(publicExternalRatings({})).toEqual([]);
  expect(publicExternalRatings([snapshot,{...snapshot,activitySlug:'invalid',count:-1}])).toEqual([snapshot]);
});
it('reads only the selected active tenant snapshots on every public tenant lookup',async()=>{
  for(const path of [`/tenants/public/${owner}`,'/tenants/by-slug/rating-site-0']) expect((await request(app).get(path).expect(200)).body.data.externalRatings).toEqual([snapshot]);
  for(const path of [`/tenants/public/${other}`,'/tenants/by-slug/rating-site-1','/tenants/by-domain/rating-site-1.invalid']) expect((await request(app).get(path).expect(200)).body.data.externalRatings).toBeUndefined();
  expect((await request(app).get('/tenants/by-domain/rating-site-0.invalid').expect(200)).body.data.externalRatings).toBeUndefined();
  const listing=(await request(app).get('/tenants/public').expect(200)).body.data;
  expect(listing.find((row:any)=>row.slug==='rating-site-0').externalRatings).toEqual([snapshot]);
  expect(listing.find((row:any)=>row.slug==='rating-site-1').externalRatings).toBeUndefined();
  await Tenant.collection.updateOne({_id:owner},{$set:{status:'inactive'}});
  for(const path of [`/tenants/public/${owner}`,'/tenants/by-slug/rating-site-0','/tenants/by-domain/rating-site-0.invalid']) await request(app).get(path).expect(404);
});
it('omits malformed raw configuration records and never substitutes ratings from another tenant',async()=>{
  await Tenant.collection.updateOne({_id:owner},{$set:{externalRatings:[{...snapshot,score:99},{...snapshot,activitySlug:'safe-tour',activityUrl:'https://www.getyourguide.com/hurghada-l403/safe-tour-t123/'}]}});
  const rows=(await request(app).get(`/tenants/public/${owner}`).expect(200)).body.data.externalRatings;
  expect(rows).toHaveLength(1);expect(rows[0].activitySlug).toBe('safe-tour');
  expect((await request(app).get(`/tenants/public/${other}`).expect(200)).body.data.externalRatings).toBeUndefined();
});
it('supports only validated whole model snapshots and preserves configuration through ordinary settings saves',async()=>{
  await Tenant.updateOne({_id:owner},{$set:{externalRatings:[{...snapshot,count:6760}]}},{runValidators:true});
  expect((await Tenant.findById(owner).lean())?.externalRatings?.[0].count).toBe(6760);
  for(const update of [{$set:{externalRatings:[{...snapshot,count:'12'}]}},{$set:{'externalRatings.0.score':5}},{$push:{externalRatings:snapshot}},{$rename:{name:'externalRatings'}}]) await expect(Tenant.updateOne({_id:owner},update as any)).rejects.toThrow();
  const result=await request(app).patch(`/tenants/${owner}/settings`).set('x-test-role','brand-admin').set('x-test-assigned',String(owner)).send({tagline:'Updated tagline',externalRatings:[{...snapshot,score:1}]}).expect(200);
  expect(result.body.success).toBe(true);expect((await Tenant.findById(owner).lean())?.externalRatings?.[0]).toMatchObject({score:4.9,count:6760});
  await request(app).patch(`/tenants/${owner}/settings`).set('x-test-role','brand-admin').set('x-test-assigned',String(owner)).send({externalRatings:[snapshot]}).expect(400);
});

it('validates configuration on document assignment before Mongoose can coerce numbers',()=>{
  const valid=new Tenant({externalRatings:[snapshot]});expect(valid.externalRatings).toEqual([snapshot]);
  for(const externalRatings of [[{...snapshot,score:'4.9'}],[{...snapshot,count:'6759'}],{...snapshot},Array(11).fill(snapshot)]) {
    const record=new Tenant({externalRatings});expect(record.validateSync()?.errors.externalRatings).toBeDefined();
  }
});
