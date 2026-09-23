import { spawnSync } from 'child_process';
import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { BundleOrder } from '../models/BundleOrder';
import { BundleDefinition } from '../models/BundleDefinition';
import { BundleQuote } from '../models/BundleQuote';
import { User } from '../models/User';
import { generateAccessToken } from '../utils/jwt';
import { Tenant } from '../models/Tenant';
import { BundleStorefrontPurchase } from '../models/BundleStorefrontPurchase';
import { generateBundleAccessToken } from '../bundles/guestAccess';
import { bundleCommerceEvent } from '../services/bundleCommerce.service';
import commerceRoutes from '../routes/storefrontCommerce.routes';

jest.setTimeout(120_000);
let mongo: MongoMemoryReplSet;
const tenantId = new Types.ObjectId(), otherTenant = new Types.ObjectId(), orderId = new Types.ObjectId(), bundleId = new Types.ObjectId();
const reference = 'AN-COMMERCE';
const guestToken = generateBundleAccessToken(String(orderId), reference);
const app = express(); app.use(express.json()); app.use('/commerce', commerceRoutes);
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: err.message }));
const quoteId = new Types.ObjectId();
const paid = () => ({ _id: orderId, storefrontTenantId: tenantId, bundleDefinitionId: bundleId, reference,
 checkoutMode: 'live', status: 'confirmed', paymentStatus: 'succeeded', stripePaymentIntentId: 'pi_private', paymentCapturedAt: new Date(),
 currency: 'USD', totalMinor: 23200, refundedMinor: 0, refundPendingMinor: 0, refunds: [], recovery: { required: false },
 components: Array.from({length:3}, (_,i) => ({ componentId: String(i), bookingId: new Types.ObjectId(), status: 'confirmed', refundedMinor:0, refundStatus:'none' })),
 guestDetails: { email: 'private-sentinel@invalid.test', firstName: 'PRIVATE_SENTINEL' } });
const claim = (tenant = tenantId, token = guestToken) => request(app).post(`/commerce/bundle/purchase/${orderId}/claim`).set('X-Tenant-ID', String(tenant)).set('X-Bundle-Access-Token', token).send({ consent: true });
const ack = (token: string) => request(app).post(`/commerce/bundle/purchase/${orderId}/ack`).set('X-Tenant-ID', String(tenantId)).set('X-Bundle-Access-Token', guestToken).send({ claimToken: token });
beforeAll(async () => {
  const found = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = found.status === 0 ? found.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('commerce'));
  await Promise.all([BundleStorefrontPurchase.init(), BundleOrder.init(), Tenant.init(), BundleDefinition.init(), BundleQuote.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
 await Promise.all([BundleOrder, Tenant, BundleStorefrontPurchase, BundleDefinition, BundleQuote, User].map(model => model.collection.deleteMany({})));
 await Tenant.collection.insertMany([{ _id: tenantId, name:'One', slug:'one', domain:'one.invalid', status:'active', bundleSettings:{mode:'live'} }, { _id: otherTenant, name:'Two', slug:'two', domain:'two.invalid', status:'active' }]);
 await BundleOrder.collection.insertOne(paid());
 await BundleDefinition.collection.insertOne({_id:bundleId, storefrontTenantId:tenantId, status:'published', version:1, currency:'USD', customerPricesMinor:{adult:10000,child:5000,infant:0}});
 await BundleQuote.collection.insertOne({_id:quoteId, storefrontTenantId:tenantId, bundleDefinitionId:bundleId, bundleVersion:1, status:'active', checkoutMode:'live', expiresAt:new Date(Date.now()+60000), currency:'USD', totalMinor:23200});
});
it('measures the published adult price and a valid authoritative quote without creating an order', async () => {
 const item = await request(app).get(`/commerce/bundle/item/${bundleId}`).set('X-Tenant-ID', String(tenantId));
 expect(item.status).toBe(200); expect(item.body.data.value).toBe(100);
 const quote = await request(app).post('/commerce/bundle/checkout').set('X-Tenant-ID', String(tenantId)).send({quoteId});
 expect(quote.status).toBe(200); expect(quote.body.data.value).toBe(232); expect(quote.body.data.transaction_id).toBeUndefined();
 expect(await BundleOrder.countDocuments()).toBe(1);
});
it('isolates catalogue and quotes to the exact storefront and accepts no local amount or customer fields', async () => {
 expect((await request(app).get(`/commerce/bundle/item/${bundleId}`).set('X-Tenant-ID', String(otherTenant))).status).toBe(404);
 const quote = (body:object, tenant=tenantId) => request(app).post('/commerce/bundle/checkout').set('X-Tenant-ID', String(tenant)).send(body);
 expect((await quote({quoteId},otherTenant)).status).toBe(404);
 expect((await quote({quoteId,totalMinor:1})).status).toBe(400);
 expect((await quote({quoteId,email:'private'})).status).toBe(400);
});
it.each([{status:'consumed'},{checkoutMode:'test'},{expiresAt:new Date(0)}])('rejects unusable quote %j',async patch=>{
 await BundleQuote.collection.updateOne({_id:quoteId},{$set:patch});
 expect((await request(app).post('/commerce/bundle/checkout').set('X-Tenant-ID',String(tenantId)).send({quoteId})).status).toBe(404);
});
it('rejects a quote when the published definition version changes',async()=>{
 await BundleDefinition.collection.updateOne({_id:bundleId},{$set:{version:2}});
 expect((await request(app).post('/commerce/bundle/checkout').set('X-Tenant-ID',String(tenantId)).send({quoteId})).status).toBe(409);
});
it('claims exactly one order-level receipt across races, containing no component or customer data',async()=>{
 const results = await Promise.all(Array.from({length:6},()=>claim()));
 expect(results.every(r=>r.status===200)).toBe(true);
 const wins=results.filter(r=>r.body.data.event); expect(wins).toHaveLength(1);
 const receipt=wins[0].body.data;
 expect(Date.parse(receipt.leaseExpiresAt)).toBeGreaterThan(Date.now());
 expect(receipt.event.items).toEqual([{item_id:String(bundleId),price:232,quantity:1}]);
 expect(receipt.event.transaction_id).toMatch(/^[a-f0-9]{64}$/);
 expect(JSON.stringify(receipt.event)).not.toMatch(/PRIVATE|private|pi_private|AN-COMMERCE|component|guest|supplier/);
 expect(await BundleStorefrontPurchase.countDocuments()).toBe(1);
});
it('requires a valid capability and exact storefront even for receipts',async()=>{
 expect((await claim(tenantId,'')).status).toBe(404); expect((await claim(tenantId,'wrong')).status).toBe(404);
 expect((await claim(otherTenant)).status).toBe(404); expect(await BundleStorefrontPurchase.countDocuments()).toBe(0);
});
it.each([{checkoutMode:'test'},{checkoutMode:null},{paymentStatus:'processing'},{status:'paid_allocation_pending'}, {status:'cancel_pending'},
 {refundedMinor:1},{refundPendingMinor:1},{stripePaymentIntentId:''},{paymentCapturedAt:null},{'recovery.required':true},
 {'components.0.status':'failed'},{'components.0.refundedMinor':1},{'components.0.bookingId':null},
 {refunds:[{status:'provider_pending',amountMinor:10}]}])('rejects noneligible purchase %j',async patch=>{
 await BundleOrder.collection.updateOne({_id:orderId},{$set:patch}); expect((await claim()).status).toBe(404);
});
it('fences expired claims and acknowledges the same handoff idempotently',async()=>{
 const first=(await claim()).body.data;
 await BundleStorefrontPurchase.updateOne({orderId},{$set:{leaseUntil:new Date(0)}});
 const second=(await claim()).body.data;
 expect(first.event.transaction_id).toBe(second.event.transaction_id); expect(first.claimToken).not.toBe(second.claimToken);
 expect((await ack(first.claimToken)).status).toBe(409);
 expect((await ack(second.claimToken)).status).toBe(200); expect((await ack(second.claimToken)).status).toBe(200);
 expect((await claim()).body.data.event).toBeNull();
});
it('does not acknowledge a receipt after refund starts',async()=>{
 const receipt=(await claim()).body.data;
 await BundleOrder.collection.updateOne({_id:orderId},{$set:{refundPendingMinor:100}});
 expect((await ack(receipt.claimToken)).status).toBe(404);
});
it('rejects corrupt monetary values and keeps purchase identity stable',()=>{
 for (const totalMinor of [0,-1,1.1,Number.MAX_SAFE_INTEGER]) expect(()=>bundleCommerceEvent({...paid(),totalMinor},'purchase',String(orderId))).toThrow();
 expect(bundleCommerceEvent(paid(),'purchase',String(orderId)).transaction_id).toBe(bundleCommerceEvent(paid(),'purchase',String(orderId)).transaction_id);
 expect(bundleCommerceEvent({...paid(),storefrontTenantId:otherTenant},'purchase',String(orderId)).transaction_id).not.toBe(bundleCommerceEvent(paid(),'purchase',String(orderId)).transaction_id);
});

it('accepts the authenticated customer owner, denies another customer and admin inspection', async()=>{
 const ownerId=new Types.ObjectId(), strangerId=new Types.ObjectId();
 await User.collection.insertMany([{_id:ownerId,email:'owner@invalid.test',role:'customer',status:'active',tokenVersion:0},{_id:strangerId,email:'stranger@invalid.test',role:'customer',status:'active',tokenVersion:0}]);
 await BundleOrder.collection.updateOne({_id:orderId},{$set:{userId:ownerId}});
 const requestAs=async(id:Types.ObjectId)=> request(app).post(`/commerce/bundle/purchase/${orderId}/claim`).set('X-Tenant-ID',String(tenantId)).set('Authorization',`Bearer ${generateAccessToken((await User.findById(id))!)}`).send({consent:true});
 expect((await requestAs(strangerId)).status).toBe(404);
 await User.collection.updateOne({_id:ownerId},{$set:{role:'super-admin'}}); expect((await requestAs(ownerId)).status).toBe(404);
 await User.collection.updateOne({_id:ownerId},{$set:{role:'customer'}}); expect((await requestAs(ownerId)).body.data.event.value).toBe(232);
});
