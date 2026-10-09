import express from 'express';
import request from '../test/loopbackRequest';
import mongoose,{Types} from 'mongoose';
import {spawnSync} from 'child_process';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import routes from '../routes/attractions.routes';
import {Tenant} from '../models/Tenant';
import {Attraction} from '../models/Attraction';
import {publicTourCategoryFilter,publicDurationBandFilter,tourCategorySchema} from '../utils/publicTourFilters';
jest.mock('../middleware/auth.middleware',()=>({...jest.requireActual('../middleware/auth.middleware'),optionalAuth:(_req:any,_res:any,next:any)=>next()}));
jest.setTimeout(120000);
const owner=new Types.ObjectId(),other=new Types.ObjectId();
const app=express();app.use('/attractions',routes);app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode || 500).json({success:false,error:error.message}));
let mongo:MongoMemoryReplSet;
beforeAll(async()=>{const binary=spawnSync('which',['mongod'],{encoding:'utf8'}).stdout.trim();const version=binary?spawnSync(binary,['--version'],{encoding:'utf8'}).stdout.match(/db version v([\d.]+)/)?.[1]:undefined;mongo=await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:version || '7.0.14',...(binary?{systemBinary:binary}:{})}});await mongoose.connect(mongo.getUri('public_tour_filters'));});
afterAll(async()=>{await mongoose.disconnect();await mongo?.stop();});
beforeEach(async()=>{await Attraction.collection.deleteMany({});await Tenant.collection.deleteMany({});await Tenant.collection.insertMany([owner,other].map((_id,i)=>({_id,slug:`qa-filter-${i}`,domain:`qa-filter-${i}.invalid`,name:'QA filter',status:'active'})));});
afterEach(()=>jest.restoreAllMocks());
const get=(query:Record<string,unknown>={},site=owner)=>request(app).get('/attractions').query({tenantId:String(site),pagination:'cursor',limit:20,sort:'price-low',category:'tours',...query});
const tour=(slug:string,extra:Record<string,unknown>={})=>({_id:new Types.ObjectId(),slug,title:slug,tenantIds:[owner],status:'active',category:'tours',subcategory:'Walking tours',duration:'2 Hours',priceFrom:1,currency:'EUR',images:[],...extra});
it('filters the entire57-row catalogue, reaches tail, and changing/resetting filters rejects a stale cursor',async()=>{
 await Attraction.collection.insertMany(Array.from({length:57},(_,i)=>tour(`trip-${i}`,{priceFrom:i,subcategory:i===56?'Day-trips':'Walking tours',duration:i===56?'1 day':'2 hours'})));
 const first=(await get().expect(200)).body;
 for(const query of [{tourCategory:'day-trips'},{durationBand:'multi-day'},{tourCategory:'day-trips',durationBand:'multi-day',locale:'en'}]){const body=(await get(query).expect(200)).body;expect(body.pagination.total).toBe(1);expect(body.data.map((row:any)=>row.slug)).toEqual(['trip-56']);await get({...query,cursor:first.pagination.nextCursor}).expect(400);}
 const filtered=(await get({tourCategory:'walking-tours',durationBand:'short'}).expect(200)).body;expect(filtered.pagination.total).toBe(56);await get({cursor:filtered.pagination.nextCursor}).expect(400);
 let cursor:string|undefined;const slugs:string[]=[];do{const body=(await get({tourCategory:'walking-tours',durationBand:'short',cursor}).expect(200)).body;slugs.push(...body.data.map((row:any)=>row.slug));cursor=body.pagination.nextCursor || undefined;}while(cursor);expect(new Set(slugs).size).toBe(56);
});
it.each(tourCategorySchema.options)('matches literal source category/subcategory names (%s)',async category=>{
 await Attraction.collection.insertMany([tour('spaces',{subcategory:category.split('-').join(' ')}),tour('hyphens',{subcategory:category.toUpperCase()}),tour('other',{subcategory:'Unrelated'}),tour('category-field',{category:category.split('-').join(' '),subcategory:''})]);
 const response=(await get({category:undefined,tourCategory:category}).expect(200)).body;expect(response.pagination.total).toBe(3);expect(response.data.map((row:any)=>row.slug).sort()).toEqual(['category-field','hyphens','spaces']);
});
it('keeps adventure desert and private aliases without widening another tenant or hidden lifecycle',async()=>{
 await Attraction.collection.insertMany([tour('desert',{subcategory:'Desert safari'}),tour('private',{subcategory:'Private boat trip'}),tour('foreign',{subcategory:'Desert safari',tenantIds:[other]}),tour('archive',{subcategory:'Desert safari',archivedAt:new Date()}),tour('trash',{subcategory:'Desert safari',trashedAt:new Date()}),tour('draft',{subcategory:'Desert safari',status:'draft'})]);
 expect((await get({tourCategory:'adventure'}).expect(200)).body.data.map((row:any)=>row.slug)).toEqual(['desert']);expect((await get({tourCategory:'private'}).expect(200)).body.data.map((row:any)=>row.slug)).toEqual(['private']);
});
it('duration bands parse explicit hours/days/minutes and compounds, preserve overlaps, exclude unknown text',async()=>{
 const durations=['120 minutes','2h','4 hours','half-day','8 hr','Full day','9 Hours','1 day','1 hour 30 minutes','unknown','3','three hours','2-3 hours'];await Attraction.collection.insertMany(durations.map((duration,i)=>tour(`duration-${i}`,{duration,priceFrom:i})));
 const expected:{[key:string]:number[]}={short:[0,1,8],'half-day':[0,1,2,3],'full-day':[2,3,4,5],'multi-day':[6,7]};
 for(const [durationBand,indices] of Object.entries(expected)){const body=(await get({durationBand}).expect(200)).body;expect(body.data.map((row:any)=>row.slug)).toEqual(indices.map(i=>`duration-${i}`));expect(body.pagination.total).toBe(indices.length);}
 expect((await get().expect(200)).body.pagination.total).toBe(durations.length);
});
it('invalid shapes/enums cannot inject regex or broaden a cursor read',async()=>{
 await Attraction.collection.insertOne(tour('normal'));for(const query of [{tourCategory:'.*'},{tourCategory:'all'},{durationBand:'all'},{durationBand:'$gt'},{'tourCategory[]':'private'},{'durationBand[x]':'short'}])await get(query).expect(400);
 expect(()=>publicTourCategoryFilter('.*' as never)).toThrow();expect(()=>publicDurationBandFilter('__proto__' as never)).toThrow();
});
it('same source filters/count apply to legacy public reads and errors stay errors on retry',async()=>{
 await Attraction.collection.insertMany([tour('known',{duration:'4 hours'}),tour('unknown',{duration:'not published'})]);const legacy=await request(app).get('/attractions').query({tenantId:String(owner),category:'tours',durationBand:'half-day',page:1,limit:10}).expect(200);expect(legacy.body.pagination.total).toBe(1);expect(legacy.body.data.map((row:any)=>row.slug)).toEqual(['known']);const spy=jest.spyOn(Attraction,'aggregate').mockRejectedValueOnce(Error('Unavailable'));await get({durationBand:'half-day'}).expect(500);spy.mockRestore();expect((await get({durationBand:'half-day'}).expect(200)).body.pagination.total).toBe(1);
});
