import express from 'express';
import request from '../test/loopbackRequest';
import mongoose,{Types} from 'mongoose';
import {spawnSync} from 'child_process';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import bookingRoutes from '../routes/bookings.routes';
import userRoutes from '../routes/users.routes';
import {Tenant} from '../models/Tenant';
import {Attraction} from '../models/Attraction';
import {Booking} from '../models/Booking';
import {User} from '../models/User';
jest.mock('../middleware/auth.middleware',()=>({ ...jest.requireActual('../middleware/auth.middleware'),authenticate:(req:any,res:any,next:any)=>{const id=req.header('x-customer');if(!id)return res.status(401).json({success:false});req.user={_id:new Types.ObjectId(id),role:'customer'};next();} }));
jest.setTimeout(120000);
const owner=new Types.ObjectId(),other=new Types.ObjectId(),customer=new Types.ObjectId(),foreignCustomer=new Types.ObjectId();
const app=express();app.use(express.json());app.use('/bookings',bookingRoutes);app.use('/users',userRoutes);app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode || 500).json({success:false,error:error.message}));
let mongo:MongoMemoryReplSet;
beforeAll(async()=>{const binary=spawnSync('which',['mongod'],{encoding:'utf8'}).stdout.trim();const version=binary?spawnSync(binary,['--version'],{encoding:'utf8'}).stdout.match(/db version v([\d.]+)/)?.[1]:undefined;mongo=await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:version || '7.0.14',...(binary?{systemBinary:binary}:{})}});await mongoose.connect(mongo.getUri('customer_lists'));});
afterAll(async()=>{await mongoose.disconnect();await mongo?.stop();});
beforeEach(async()=>{await Promise.all([Tenant.collection.deleteMany({}),Attraction.collection.deleteMany({}),Booking.collection.deleteMany({}),User.collection.deleteMany({})]);await Tenant.collection.insertMany([owner,other].map((_id,i)=>({_id,slug:`qa-site-${i}`,status:'active',name:'QA site',domain:`qa-site-${i}.invalid`})));});
afterEach(()=>jest.restoreAllMocks());
const getBookings=(query:Record<string,unknown>={},user=customer,site=owner)=>request(app).get('/bookings/my').set('x-customer',String(user)).query({tenantId:String(site),pagination:'cursor',limit:20,...query});
const getSaved=(query:Record<string,unknown>={},user=customer,site=owner)=>request(app).get('/users/wishlist').set('x-customer',String(user)).query({tenantId:String(site),pagination:'cursor',limit:20,...query});
async function seed(count=103){const tours=Array.from({length:count},(_,i)=>({_id:new Types.ObjectId(),slug:`trip-${i}`,title:i===count-1?'Unique tail trip':`Trip ${i}`,tenantIds:[owner],status:'active',images:[],priceFrom:40,currency:'EUR',createdAt:new Date('2026-01-01')}));await Attraction.collection.insertMany(tours);await User.collection.insertMany([{_id:customer,email:'qa-one@example.invalid',wishlist:tours.map(row=>row._id)},{_id:foreignCustomer,email:'qa-two@example.invalid',wishlist:[]}]);await Booking.collection.insertMany(tours.map((tour,i)=>({_id:new Types.ObjectId(),reference:`REF-${i}`,userId:customer,tenantId:owner,attractionId:tour._id,status:i%2?'confirmed':'completed',total:40,currency:'EUR',createdAt:new Date('2026-01-01')})));return tours;}
it('reaches every booking beyond51 and saved item beyond101, with stable backward cursors',async()=>{await seed();for(const get of [getBookings,getSaved]){let cursor:string|undefined;const pages:any[]=[];do{const body=(await get({cursor}).expect(200)).body;pages.push(body);cursor=body.pagination.nextCursor || undefined;}while(cursor);const rows=pages.flatMap(page=>page.data);expect(rows).toHaveLength(103);expect(new Set(rows.map(row=>row._id)).size).toBe(103);expect(pages[0].pagination.total).toBe(103);expect(pages.at(-1).pagination.nextCursor).toBeNull();const previous=(await get({cursor:pages[2].pagination.previousCursor}).expect(200)).body;expect(previous.data.map((row:any)=>row._id)).toEqual(pages[1].data.map((row:any)=>row._id));}});
it('server search reaches tail and status/counts cover all bookings rather than a page',async()=>{await seed();const searched=(await getBookings({search:'Unique tail'}).expect(200)).body;expect(searched.data).toHaveLength(1);expect(searched.data[0].reference).toBe('REF-102');const confirmed=(await getBookings({status:'confirmed'}).expect(200)).body;expect(confirmed.pagination.total).toBe(51);expect(confirmed.counts).toMatchObject({all:103,confirmed:51,completed:52});expect(confirmed.data.every((row:any)=>row.status==='confirmed')).toBe(true);expect((await getSaved({search:'Unique tail'}).expect(200)).body.data.map((row:any)=>row.slug)).toEqual(['trip-102']);});
it('binds cursors to owner, site and filters, rejects malformed scope/limits and requires authentication',async()=>{await seed();const first=(await getBookings().expect(200)).body;for(const next of [getBookings({cursor:first.pagination.nextCursor},foreignCustomer),getBookings({cursor:first.pagination.nextCursor},customer,other),getBookings({cursor:first.pagination.nextCursor,search:'Trip'}),getBookings({cursor:first.pagination.nextCursor,status:'confirmed'}),getBookings({cursor:'bad'}),getBookings({limit:101}),getBookings({status:'hostile'})])await next.expect(400);await request(app).get('/bookings/my').expect(401);await request(app).get('/users/wishlist').expect(401);expect((await getBookings({},foreignCustomer).expect(200)).body.data).toEqual([]);expect((await getBookings({},customer,other).expect(200)).body.data).toEqual([]);await getSaved({},customer,new Types.ObjectId()).expect(404);});
it('concurrent insertion before the first cursor does not repeat or drop the original tail',async()=>{const tours=await seed(57);const first=(await getBookings().expect(200)).body;await Booking.collection.insertOne({_id:new Types.ObjectId(),reference:'NEW',userId:customer,tenantId:owner,attractionId:tours[0]._id,status:'confirmed',createdAt:new Date('2026-02-01')});let cursor=first.pagination.nextCursor;const rows=[...first.data];while(cursor){const body=(await getBookings({cursor}).expect(200)).body;rows.push(...body.data);cursor=body.pagination.nextCursor;}expect(rows).toHaveLength(57);expect(new Set(rows.map(row=>row._id)).size).toBe(57);expect(rows.some(row=>row.reference==='NEW')).toBe(false);});
it('fails closed on a malformed booking attraction join and wishlist never emits foreign/archive/trash records',async()=>{const tours=await seed();await Attraction.collection.updateOne({_id:tours[0]._id},{$set:{tenantIds:[other]}});await getBookings().expect(409);await Attraction.collection.updateOne({_id:tours[1]._id},{$set:{archivedAt:new Date()}});await Attraction.collection.updateOne({_id:tours[2]._id},{$set:{trashedAt:new Date()}});const saved=(await getSaved().expect(200)).body;expect(saved.pagination.total).toBe(100);expect(saved.data.every((row:any)=>!['trip-0','trip-1','trip-2'].includes(row.slug))).toBe(true);});
it('bounded page removal is atomic, owner/site scoped and preserves the tail and other-site entries',async()=>{const tours=await seed();const foreign=new Types.ObjectId();await Attraction.collection.insertOne({_id:foreign,slug:'foreign',status:'active',tenantIds:[other]});await User.updateOne({_id:customer},{$push:{wishlist:foreign}});const remove=(ids:string[],user=customer)=>request(app).delete('/users/wishlist/page').set('x-customer',String(user)).query({tenantId:String(owner)}).send({ids});await remove([String(tours[0]._id),String(foreign)]).expect(409);expect((await User.findById(customer).lean())?.wishlist).toHaveLength(104);await remove(Array.from({length:101},()=>String(tours[0]._id))).expect(400);await remove(['bad']).expect(400);await remove([String(tours[0]._id)],foreignCustomer).expect(409);await remove(tours.slice(0,20).map(row=>String(row._id))).expect(200);const user=await User.findById(customer).lean();expect(user?.wishlist).toHaveLength(84);expect(user?.wishlist.map(String)).toContain(String(foreign));expect((await getSaved().expect(200)).body.pagination.total).toBe(83);});
it('legacy page clients retain shape and validated status is no longer stripped',async()=>{await seed(57);const response=await request(app).get('/bookings/my').set('x-customer',String(customer)).query({page:2,limit:10,status:'confirmed'}).expect(200);expect(response.body.pagination).toMatchObject({page:2,limit:10,total:28,totalPages:3});expect(response.body.data.every((row:any)=>row.status==='confirmed')).toBe(true);const saved=await request(app).get('/users/wishlist').set('x-customer',String(customer)).expect(200);expect(Array.isArray(saved.body.data)).toBe(true);expect(saved.body.pagination).toBeUndefined();});
it('database failure is an error, and repeat read succeeds without mutation',async()=>{await seed(3);const spy=jest.spyOn(Booking,'aggregate').mockRejectedValueOnce(new Error('Unavailable'));await getBookings().expect(500);spy.mockRestore();expect((await getBookings().expect(200)).body.pagination.total).toBe(3);});

it('preserves a customer’s verified reseller booking while denying a fabricated supplier join',async()=>{const tours=await seed(1);await Attraction.collection.updateOne({_id:tours[0]._id},{$set:{tenantIds:[other],ownerTenantId:other}});await Booking.collection.updateOne({userId:customer},{$set:{isResale:true,supplierTenantId:other,sellerTenantId:owner}});expect((await getBookings().expect(200)).body.data).toHaveLength(1);await Booking.collection.updateOne({userId:customer},{$set:{supplierTenantId:owner}});await getBookings().expect(409);});

it('search is literal and bounded, never a regex widening or pathological expression',async()=>{await seed(3);expect((await getBookings({search:'.*'}).expect(200)).body.pagination.total).toBe(0);expect((await getSaved({search:'.*'}).expect(200)).body.pagination.total).toBe(0);await getBookings({search:'a'.repeat(500)}).expect(400);});

it('profile wishlist join preserves own profile fields while excluding foreign/inactive/archive/trash sources',async()=>{const tours=await seed(5);await User.updateOne({_id:customer},{$set:{firstName:'QA',lastName:'Customer',interfaceLocale:'ar',phone:'',currency:'EUR'}});await Attraction.collection.updateOne({_id:tours[1]._id},{$set:{tenantIds:[other]}});await Attraction.collection.updateOne({_id:tours[2]._id},{$set:{status:'draft'}});await Attraction.collection.updateOne({_id:tours[3]._id},{$set:{archivedAt:new Date()}});await Attraction.collection.updateOne({_id:tours[4]._id},{$set:{trashedAt:new Date()}});const scoped=await request(app).get('/users/profile').set('x-customer',String(customer)).query({tenantId:String(owner)}).expect(200);expect(scoped.body.data).toMatchObject({_id:String(customer),firstName:'QA',lastName:'Customer',interfaceLocale:'ar',currency:'EUR'});expect(scoped.body.data.wishlist.map((row:any)=>row.slug)).toEqual(['trip-0']);expect(scoped.headers['cache-control']).toBe('private, no-store');expect(scoped.body.data.password).toBeUndefined();const legacy=await request(app).get('/users/profile').set('x-customer',String(customer)).expect(200);expect(legacy.body.data.wishlist.map((row:any)=>row.slug)).toEqual(['trip-0','trip-1']);const another=await request(app).get('/users/profile').set('x-customer',String(foreignCustomer)).query({tenantId:String(owner)}).expect(200);expect(another.body.data._id).toBe(String(foreignCustomer));expect(another.body.data.wishlist).toEqual([]);});
it('profile explicit scope is fail-closed; existing verified header wins a conflicting query',async()=>{const tours=await seed(2);await Attraction.collection.updateOne({_id:tours[1]._id},{$set:{tenantIds:[other]}});const profile=()=>request(app).get('/users/profile').set('x-customer',String(customer));await profile().query({tenantId:'unknown-site'}).expect(404);await profile().set('x-tenant-id','unknown-site').query({tenantId:String(owner)}).expect(404);await profile().query({'tenantId[]':String(owner)}).expect(400);await profile().query({tenantId:''}).expect(400);const response=await profile().set('x-tenant-id',String(owner)).query({tenantId:String(other)}).expect(200);expect(response.body.data.wishlist.map((row:any)=>row.slug)).toEqual(['trip-0']);await request(app).get('/users/profile').expect(401);});

it('malformed explicit site hints cannot widen legacy customer lists or mutate saved records',async()=>{const tours=await seed(2);const auth=(test:request.Test)=>test.set('x-customer',String(customer));await auth(request(app).get('/users/wishlist')).query({'tenantId[]':String(owner)}).expect(400);await auth(request(app).get('/bookings/my')).query({'tenantId[]':String(owner)}).expect(400);await auth(request(app).get('/users/wishlist')).query({tenantId:''}).expect(400);await auth(request(app).delete(`/users/wishlist/${tours[0]._id}`)).query({'tenantId[]':String(owner)}).expect(400);await auth(request(app).post(`/users/wishlist/${tours[0]._id}`)).query({'tenantId[]':String(owner)}).expect(400);await auth(request(app).delete('/users/wishlist/page')).query({'tenantId[]':String(owner)}).send({ids:[String(tours[0]._id)]}).expect(400);expect((await User.findById(customer).lean())?.wishlist.map(String)).toEqual(tours.map(row=>String(row._id)));});
it('legacy joins fail closed for foreign or missing sources, including own network-context reads',async()=>{
 const tours=await seed(3);const legacy=(site?:Types.ObjectId,user=customer)=>request(app).get('/bookings/my').set('x-customer',String(user)).query({page:1,limit:1,...(site?{tenantId:String(site)}:{})});
 const normal=(await legacy(owner).expect(200)).body;expect(normal.pagination).toMatchObject({page:1,limit:1,total:3});expect(normal.data[0].attractionId.title).toBeTruthy();expect(normal.data[0].total).toBe(40);expect(normal.data[0].currency).toBe('EUR');expect(normal.data[0].__tour).toBeUndefined();
 await Attraction.collection.updateOne({_id:tours[0]._id},{$set:{tenantIds:[other]}});
 for(const site of [owner,undefined]){const denied=await legacy(site).expect(409);expect(denied.body.data).toBeUndefined();}
 expect((await legacy(undefined,foreignCustomer).expect(200)).body.data).toEqual([]);
 await Attraction.collection.updateOne({_id:tours[0]._id},{$set:{tenantIds:[owner]}});await Attraction.collection.deleteOne({_id:tours[1]._id});await legacy(owner).expect(409);await legacy().expect(409);
});
it('legacy network and scoped reads preserve verified resale while rejecting fabricated supplier or seller',async()=>{
 const tours=await seed(1);const legacy=(site?:Types.ObjectId)=>request(app).get('/bookings/my').set('x-customer',String(customer)).query(site?{tenantId:String(site)}:{});
 await Attraction.collection.updateOne({_id:tours[0]._id},{$set:{tenantIds:[other],ownerTenantId:other}});await Booking.collection.updateOne({userId:customer},{$set:{isResale:true,supplierTenantId:other,sellerTenantId:owner}});
 for(const site of [owner,undefined])expect((await legacy(site).expect(200)).body.data[0].attractionId.slug).toBe('trip-0');
 await Booking.collection.updateOne({userId:customer},{$set:{supplierTenantId:owner}});await legacy(owner).expect(409);await legacy().expect(409);
 await Booking.collection.updateOne({userId:customer},{$set:{supplierTenantId:other,sellerTenantId:other}});await legacy().expect(409);
});
it('legacy network reads bind each join to its own booking site and reject a missing booking tenant',async()=>{
 const tours=await seed(2);await Booking.collection.updateOne({attractionId:tours[1]._id},{$set:{tenantId:other}});await Attraction.collection.updateOne({_id:tours[1]._id},{$set:{tenantIds:[other]}});
 const legacy=()=>request(app).get('/bookings/my').set('x-customer',String(customer));expect((await legacy().expect(200)).body.data).toHaveLength(2);
 await Booking.collection.updateOne({attractionId:tours[1]._id},{$unset:{tenantId:1}});await legacy().expect(409);
});
it('legacy database failure remains an error and retry preserves customer page data',async()=>{
 await seed(2);const legacy=()=>request(app).get('/bookings/my').set('x-customer',String(customer)).query({tenantId:String(owner),page:1,limit:1});const spy=jest.spyOn(Booking,'aggregate').mockRejectedValueOnce(Error('Unavailable'));await legacy().expect(500);spy.mockRestore();const response=await legacy().expect(200);expect(response.body.pagination.total).toBe(2);expect(response.body.data).toHaveLength(1);expect(response.body.data[0].userId).toBe(String(customer));
});

it('saved cursor summaries expose own and partner operators with public routes, never booking or private data', async () => {
 const tours=await seed(5);
 await Tenant.collection.updateOne({_id:owner},{$set:{name:'QA own operator',contactInfo:{email:'private@qa.invalid'},paymentSettings:{internal:'private'}}});
 await Tenant.collection.updateOne({_id:other},{$set:{name:'QA partner operator',contactInfo:{phone:'private'},notificationSettings:{internal:'private'}}});
 await Attraction.collection.updateMany({},{$set:{
  ownerTenantId:owner,languages:['English','Arabic'],listingType:'tour',pathSlug:'public-path',
  parentPage:{path:'/journeys',label:'Unused summary label',internal:'private'},
  pricingOptions:[{id:'published-option',name:'Private option',price:40}],
  addons:[{id:'extra',price:10}],availability:{internal:'private'},reseller:{value:15},internalNotes:'private',
 }});
 await Attraction.collection.updateOne({_id:tours[0]._id},{$set:{enquiryOnly:false}});
 await Attraction.collection.updateOne({_id:tours[1]._id},{$set:{tenantIds:[owner,other],ownerTenantId:other,enquiryOnly:true}});
 await Attraction.collection.updateOne({_id:tours[2]._id},{$set:{listingType:'package',packageDetails:{rateMatrix:[{privateRate:99}]}}});
 await Attraction.collection.updateOne({_id:tours[3]._id},{$set:{tenantIds:[other],ownerTenantId:other}});
 await Attraction.collection.updateOne({_id:tours[4]._id},{$set:{status:'draft'}});
 const response=await getSaved().expect(200);
 expect(response.headers['cache-control']).toBe('private, no-store');
 expect(response.body.pagination.total).toBe(3);
 const rows=response.body.data;
 expect(rows.map((row:any)=>row.slug).sort()).toEqual(['trip-0','trip-1','trip-2']);
 expect(rows.find((row:any)=>row.slug==='trip-0')).toMatchObject({priceFrom:40,currency:'EUR',enquiryOnly:false,operator:{name:'QA own operator',relationship:'own'}});
 expect(rows.find((row:any)=>row.slug==='trip-1')).toMatchObject({enquiryOnly:true,operator:{name:'QA partner operator',relationship:'partner'}});
 expect(rows.find((row:any)=>row.slug==='trip-2').listingType).toBe('package');
 for(const row of rows){
  expect(row.languages).toEqual(['English','Arabic']);
  expect(row.pathSlug).toBe('public-path');
  expect(row.parentPage).toEqual({path:'/journeys'});
  expect(Object.keys(row.operator).sort()).toEqual(['name','relationship']);
  for(const field of ['tenantIds','ownerTenantId','pricingOptions','addons','availability','packageDetails','reseller','internalNotes','contactInfo','paymentSettings','notificationSettings','_cursor0','_cursor1'])expect(row).not.toHaveProperty(field);
 }
 expect((await getSaved({},foreignCustomer).expect(200)).body.data).toEqual([]);
});

it('saved operator identity remains absent for missing, inactive or ambiguous ownership', async () => {
 const tours=await seed(4);
 await Tenant.collection.updateOne({_id:other},{$set:{status:'inactive'}});
 await Attraction.collection.updateOne({_id:tours[0]._id},{$set:{ownerTenantId:new Types.ObjectId()}});
 await Attraction.collection.updateOne({_id:tours[1]._id},{$set:{ownerTenantId:other}});
 await Attraction.collection.updateOne({_id:tours[2]._id},{$set:{tenantIds:[owner,other]}});
 await Attraction.collection.updateOne({_id:tours[3]._id},{$set:{ownerTenantId:'invalid-owner'}});
 const rows=(await getSaved().expect(200)).body.data;
 expect(rows).toHaveLength(4);
 for(const row of rows){expect(row).not.toHaveProperty('operator');expect(row).not.toHaveProperty('ownerTenantId');expect(row).not.toHaveProperty('tenantIds');}
});

it('saved operator lookup includes only the returned page while cursor and search bindings stay scoped', async () => {
 const tours=await seed(3);
 await Attraction.collection.updateOne({_id:tours[0]._id},{$set:{ownerTenantId:owner,createdAt:new Date('2026-03-01')}});
 await Attraction.collection.updateOne({_id:tours[1]._id},{$set:{ownerTenantId:other,tenantIds:[owner,other],createdAt:new Date('2026-02-01')}});
 const lookup=jest.spyOn(Tenant,'find');
 const first=(await getSaved({limit:1}).expect(200)).body;
 expect(first.data[0].slug).toBe('trip-0');
 expect(lookup).toHaveBeenCalledTimes(1);
 expect(lookup).toHaveBeenCalledWith({_id:{$in:[owner]},status:'active'});
 const cursor=first.pagination.nextCursor;
 for(const pending of [getSaved({limit:1,cursor},foreignCustomer),getSaved({limit:1,cursor},customer,other),getSaved({limit:1,cursor,search:'Trip'})])await pending.expect(400);
 const second=(await getSaved({limit:1,cursor}).expect(200)).body;
 expect(second.data[0]).toMatchObject({slug:'trip-1',operator:{relationship:'partner'}});
 expect((await getSaved({limit:1,cursor:second.pagination.previousCursor}).expect(200)).body.data[0].slug).toBe('trip-0');
 const searched=(await getSaved({search:'Unique tail'}).expect(200)).body;
 expect(searched.data.map((row:any)=>row.slug)).toEqual(['trip-2']);
 expect(searched.data[0].operator.relationship).toBe('own'); // Single-assignment legacy owner.
});

it('saved operator lookup failure returns an error and a repeat read safely recovers', async () => {
 await seed(1);
 const lookup=jest.spyOn(Tenant,'find').mockImplementationOnce(()=>{throw new Error('Operator lookup unavailable');});
 const failed=await getSaved().expect(500);
 expect(failed.body.data).toBeUndefined();
 lookup.mockRestore();
 const recovered=await getSaved().expect(200);
 expect(recovered.body.data).toHaveLength(1);
 expect(recovered.body.data[0].operator).toEqual({name:'QA site',relationship:'own'});
 expect((await User.findById(customer).lean())?.wishlist).toHaveLength(1);
});
