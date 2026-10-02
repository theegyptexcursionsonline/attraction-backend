import { Types } from 'mongoose';
import { routeClosure,composePublicRoute } from '../services/publicRouteComposition.service';
import { publicRouteCompositionRequest, publicRoutePublicationReceipt } from '../services/publicRouteComposition.schema';
import { sourceSnapshot } from '../services/localizationSourceSnapshot.service';
import { translationSourceTemplate } from '../services/attractionLocalization.service';
const owner=new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
const tenant={_id:owner,slug:'grand-rock-safari',customDomain:'grandrocksafari.com',status:'active',designMode:'savanna',navigation:[],pageSeo:{},heroImages:[]};
const request={tenantSlug:'grand-rock-safari',domain:'grandrocksafari.com',route:'home',locale:'ar'} as const;
const presentation={_id:String(owner),slug:tenant.slug,publishedPresentationLocales:['ar','de','ru','fr'],paymentSettings:{allowPayAtLocation:false,stripe:{enabled:true,publishableKey:'pk_live_public'}}};
function tour(index:number,locales=['ar','de','ru','fr']){
 const source:any={_id:new Types.ObjectId(index.toString(16).padStart(24,'0')),tenantIds:[owner],status:'active',title:`Tour ${index}`,shortDescription:'Summary',description:'Description',duration:'2 hours',images:[],updatedAt:new Date('2026-10-01T00:00:00Z'),sortOrder:index,priceFrom:40,currency:'EUR',enquiryOnly:false,languages:['English'],category:'Quad',destination:{city:'Makadi Bay'},pricingOptions:[],addons:[]};
 source.__translations=locales.map(locale=>({tenantId:owner,attractionId:source._id,status:'published',locale,slug:`tour-${index}-${locale}`,sourceSnapshot:sourceSnapshot('tour',source),content:{...translationSourceTemplate(source),title:`Translated ${index}`}}));return source;
}
describe('complete scoped route composition closure',()=>{
 test('promotion-qualified v2 receipt rejects old server contracts and unknown versions',()=>{const result=routeClosure(request,tenant,presentation).finish();expect(result.receipt).toMatchObject({version:2,renderer:'savanna-public-composition-v2'});for(const patch of [{version:1},{renderer:'savanna-public-composition-v1'},{version:3},{renderer:'foreign-renderer'}])expect(publicRoutePublicationReceipt.safeParse({...result.receipt,...patch}).success).toBe(false);expect(publicRoutePublicationReceipt.safeParse(result.receipt).success).toBe(true);});
 test('rejects hostile, foreign, independent and filtered request identities',()=>{for(const input of [{...request,tenantSlug:'royal-cruise-hurghada'},{...request,domain:'foreign.example'},{...request,locale:'xx'},{...request,search:'anything'},{...request,cursor:'abc'}])expect(publicRouteCompositionRequest.safeParse(input).success).toBe(false);});
 test('a missing translation beyond the visible rail closes its locale',()=>{const c=routeClosure(request,tenant,presentation);for(let i=1;i<=55;i++)c.push('tour',tour(i,i===55?['de','ru','fr']:undefined));const result=c.finish();expect(result.seed.featured).toHaveLength(8);expect(result.receipt.counts.tours).toBe(55);expect(result.receipt.contentLocales).toEqual(['de','ru','fr']);});
 test('source edit and draft/foreign row cannot qualify the native variant',()=>{for(const mutate of [(r:any)=>{r.description='Edited';},(r:any)=>{r.__translations[0].status='draft';},(r:any)=>{r.__translations[0].tenantId=new Types.ObjectId();},(r:any)=>{r.__translations[0].attractionId=new Types.ObjectId();}]){const c=routeClosure(request,tenant,presentation);const row=tour(1);mutate(row);c.push('tour',row);expect(c.finish().receipt.contentLocales).not.toContain('ar');}});
 test('malformed complete content closes the locale without inventing replacement',()=>{const c=routeClosure(request,tenant,presentation);const row=tour(1);row.__translations[0].content.description='';c.push('tour',row);expect(c.finish().receipt.contentLocales).not.toContain('ar');});
 test('tenant prose proof required even for a wholly translated catalogue',()=>{const c=routeClosure(request,tenant,{...presentation,publishedPresentationLocales:[]});c.push('tour',tour(1));expect(c.finish().receipt.contentLocales).toEqual([]);});
 test('foreign and archived source records fail closed',()=>{for(const patch of [{tenantIds:[new Types.ObjectId()]},{status:'inactive'},{archivedAt:new Date()}]){const c=routeClosure(request,tenant,presentation);expect(()=>c.push('tour',{...tour(1),...patch})).toThrow();}});
 test('empty snapshot is distinct from failed read and has exact zero facts',()=>{expect(routeClosure(request,tenant,presentation).finish().receipt.counts).toEqual({tours:0,destinations:0});});
 test('all sources affect the digest; raw money, image order, input and payment authority stay unchanged',()=>{const rows=[tour(1),tour(2)];const before=JSON.stringify(rows);const compose=(data:any[])=>{const c=routeClosure(request,tenant,presentation);data.forEach(r=>c.push('tour',r));return c.finish();};const first=compose(rows);const changed=compose([{...rows[0],priceFrom:41},rows[1]]);expect(first.receipt.sourceDigest).not.toBe(changed.receipt.sourceDigest);expect(first.seed.featured[0]).toMatchObject({priceFrom:40,currency:'EUR'});expect(first.seed.tenant.paymentSettings).toEqual(presentation.paymentSettings);expect(JSON.stringify(rows)).toBe(before);expect(JSON.stringify(first.seed)).not.toContain('__translations');});
 test('invalid input does not open a session',async()=>{await expect(composePublicRoute({...request,tenantSlug:'foreign'})).rejects.toThrow();});
});

import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Destination } from '../models/Destination';
import { Review } from '../models/Review';
import { Booking } from '../models/Booking';
import { TenantPresentationTranslation } from '../models/TenantPresentationTranslation';
import { presentationSourceSnapshot,presentationSourceTemplate } from '../services/tenantPresentationLocalization.service';
describe('Mongo snapshot orchestration',()=>{
 afterEach(()=>jest.restoreAllMocks());
 function harness(options:{failTail?:boolean;retry?:boolean}={}){
  const endSession=jest.fn();let reads=0;const session:any={endSession,withTransaction:jest.fn(async(fn:any,config:any)=>{expect(config).toMatchObject({readConcern:{level:'snapshot'},readPreference:'primary'});await fn();if(options.retry)await fn();})};
  jest.spyOn(mongoose,'startSession').mockResolvedValue(session);
  const query=(result:any)=>({select:jest.fn().mockReturnThis(),session:jest.fn(function(this:any,value:any){expect(value).toBe(session);return this;}),lean:jest.fn(async()=>result)});
  jest.spyOn(Tenant,'findOne').mockImplementation((filter:any)=>{expect(filter).toMatchObject({slug:request.tenantSlug,customDomain:request.domain,status:'active'});return query(tenant) as any;});
  jest.spyOn(TenantPresentationTranslation,'find').mockReturnValue(query(['ar','de','ru','fr'].map(locale=>({tenantId:owner,sourceId:owner,kind:'tenant',status:'published',locale,sourceSnapshot:presentationSourceSnapshot('tenant',tenant),content:presentationSourceTemplate('tenant',tenant)}))) as any);
  jest.spyOn(Review,'aggregate').mockReturnValue({session:jest.fn(function(this:any,value:any){expect(value).toBe(session);return this;}),option:jest.fn(async()=>[])} as any);
  jest.spyOn(Booking,'countDocuments').mockReturnValue({session:jest.fn(async(value:any)=>{expect(value).toBe(session);return 0;})} as any);
  const cursors:any[]=[];
  const aggregate=(kind:'tour'|'destination')=>(stages:any[])=>{
   reads++;expect(stages[0]).toEqual({$match:kind==='tour'?{tenantIds:owner,status:'active',archivedAt:{$exists:false},trashedAt:{$exists:false}}:{isActive:true}});
   const close=jest.fn();const cursor={close,async *[Symbol.asyncIterator](){if(kind==='tour'){yield tour(1);if(options.failTail)throw Error('read interrupted');yield tour(55);}}};cursors.push(cursor);
   return {session:jest.fn(function(this:any,value:any){expect(value).toBe(session);return this;}),option:jest.fn().mockReturnThis(),cursor:jest.fn(()=>cursor)};
  };
  jest.spyOn(Attraction,'aggregate').mockImplementation(aggregate('tour') as any);jest.spyOn(Destination,'aggregate').mockImplementation(aggregate('destination') as any);
  return {session,cursors,get reads(){return reads;}};
 }
 test('all DB reads share one snapshot; session and cursors close',async()=>{const h=harness();const value=await composePublicRoute(request);expect(value.receipt.counts.tours).toBe(2);expect(value.receipt.contentLocales).toEqual(['ar','de','ru','fr']);expect(h.reads).toBe(2);expect(h.session.endSession).toHaveBeenCalledTimes(1);h.cursors.forEach(c=>expect(c.close).toHaveBeenCalledTimes(1));});
 test('tail outage never returns a partial publication receipt',async()=>{const h=harness({failTail:true});await expect(composePublicRoute(request)).rejects.toThrow('read interrupted');expect(h.session.endSession).toHaveBeenCalled();expect(h.cursors[0].close).toHaveBeenCalled();});
 test('transaction retry rebuilds closure instead of doubling counts',async()=>{const h=harness({retry:true});const result=await composePublicRoute(request);expect(result.receipt.counts.tours).toBe(2);expect(h.reads).toBe(4);});
});

import { publicCursorPlan } from '../utils/publicCursor';
test('collection cursor reaches record 55 and rejects different tenant/locale/route',()=>{
 const binding={tenantId:String(owner),domain:request.domain,route:'safaris',locale:'ar'};
 const fields=[{field:'sortOrder',direction:1 as const,kind:'number' as const},{field:'_id',direction:1 as const,kind:'id' as const}];
 const records=Array.from({length:55},(_,index)=>({...tour(index+1),_cursor0:index+1,_cursor1:new Types.ObjectId((index+1).toString(16).padStart(24,'0'))}));
 let cursor:string|undefined;const seen:number[]=[];
 do{const plan=publicCursorPlan(binding,fields,cursor);const lower=cursor?JSON.parse(Buffer.from(cursor,'base64url').toString()).values[0]:0;expect(cursor?plan.seek!==null:plan.seek===null).toBe(true);const result=plan.page(records.filter(row=>row.sortOrder>lower).slice(0,21),20,55);seen.push(...result.rows.map(row=>row.sortOrder));cursor=result.pagination.nextCursor||undefined;}while(cursor);
 expect(seen).toEqual(Array.from({length:55},(_,index)=>index+1));
 const first=publicCursorPlan(binding,fields).page(records.slice(0,21),20,55).pagination.nextCursor!;
 for(const different of [{...binding,tenantId:'b'.repeat(24)},{...binding,locale:'fr'},{...binding,route:'destinations'}])expect(()=>publicCursorPlan(different,fields,first)).toThrow();
});

test('pathological prose facts refuse instead of truncating completeness',()=>{const c=routeClosure(request,tenant,presentation);expect(()=>{for(let index=1;index<=101;index++)c.push('tour',{...tour(index),category:`Category ${index}`});}).toThrow();});

test('derived guide-language facts preserve existing case-insensitive uniqueness',()=>{const c=routeClosure(request,tenant,presentation);c.push('tour',{...tour(1),languages:['English',' english ','German']});expect(c.finish().seed.facts.guideLanguages).toEqual(['English','German']);});
