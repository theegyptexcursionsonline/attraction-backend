import mongoose, { Types } from 'mongoose';
import { createHash } from 'crypto';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Destination } from '../models/Destination';
import { Review } from '../models/Review';
import { Booking } from '../models/Booking';
import { TenantPresentationTranslation } from '../models/TenantPresentationTranslation';
import { PUBLIC_TENANT_PROJECTION,toPublicTenantDto } from '../controllers/tenants.controller';
import { PUBLIC_ATTRACTION_PROJECTION,toPublicAttractionDto } from '../controllers/attractions.controller';
import { localizedPublicSitePresentation,presentationReadScope,presentationSourceSnapshot } from './tenantPresentationLocalization.service';
import { localizationStages,localizationIdentity,localizedPresentation } from './attractionLocalization.service';
import { destinationLocalizationStages,localizedDestination } from './destinationLocalization.service';
import { sourceMatches,sourceSnapshot } from './localizationSourceSnapshot.service';
import { publicCursorPlan } from '../utils/publicCursor';
import { publicRouteCompositionRequest,publicRoutePublicationReceipt,ROUTE_RENDERER,type RouteRequest } from './publicRouteComposition.schema';
const LANGUAGES = ['ar','de','ru','fr'] as const;
type Row = Record<string,any>;
const id=(value:unknown)=>String(value||'');
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class RouteCompositionUnavailable extends Error { statusCode=503; constructor(){super('This page could not be loaded. Please retry.');} }
/** Defense in depth in addition to the DB current-source join. */
function currentRows(kind:'tour'|'destination',source:Row,tenantId:string):Row {
 return {...source,__translations:(source.__translations||[]).filter((row:Row)=>id(row.tenantId)===tenantId&&id(row[kind==='tour'?'attractionId':'destinationId'])===id(source._id)&&row.status==='published'&&sourceMatches(kind,source,row))};
}
/** Streaming closure, not a first-page count. Retains bounded rails only; every
 * source row participates in the proof/digest and derived facts. */
export function routeClosure(request:RouteRequest,tenant:Row,localizedTenant:Row) {
 const tenantId=id(tenant._id);if(!/^[a-f0-9]{24}$/.test(tenantId)||tenant.slug!==request.tenantSlug||tenant.customDomain!==request.domain||tenant.status!=='active'||tenant.designMode!=='savanna')throw new RouteCompositionUnavailable();
 const digest=createHash('sha256').update(JSON.stringify(presentationSourceSnapshot('tenant',tenant)));
 if(localizedTenant.slug!==request.tenantSlug||id(localizedTenant._id||localizedTenant.id)!==tenantId||(localizedTenant._id&&localizedTenant.id&&id(localizedTenant._id)!==id(localizedTenant.id)))throw new RouteCompositionUnavailable();
 const proof=localizedTenant.publishedPresentationLocales;
 const languages=new Set<string>(Array.isArray(proof)&&proof.every((locale:unknown)=>typeof locale==='string'&&LANGUAGES.some(value=>value===locale))&&new Set(proof).size===proof.length?proof:[]);
 const totals={tours:0,destinations:0};const featured:Row[]=[];const destinations:Row[]=[];
 const guideLanguages=new Set<string>();const durations=new Set<string>();const categories=new Set<string>();let hotelPickup=false,enquiries=0;
 function push(kind:'tour'|'destination',raw:Row){
  if(!/^[a-f0-9]{24}$/.test(id(raw._id)))throw new RouteCompositionUnavailable();
  if(kind==='tour'&&(!(raw.tenantIds||[]).some((owner:unknown)=>id(owner)===tenantId)||raw.status!=='active'||raw.archivedAt||raw.trashedAt))throw new RouteCompositionUnavailable();
  if(kind==='destination'&&raw.isActive!==true)throw new RouteCompositionUnavailable();
  const row=currentRows(kind,raw,tenantId);const identity=kind==='tour'?localizationIdentity(row,request.locale):localizedDestination(row,request.locale);
  for(const locale of [...languages])if(!identity.localizedSlugs?.[locale])languages.delete(locale);
  digest.update(JSON.stringify([kind,id(row._id),sourceSnapshot(kind,row),row.updatedAt,kind==='tour'?toPublicAttractionDto(row):publicDestination(row),row.__translations.map((item:Row)=>[item.locale,item.slug,item.content])]));
  if(kind==='tour'){
   totals.tours++;const dto=localizedPresentation(toPublicAttractionDto(row),row,request.locale);if(featured.length<8)featured.push(dto);
   for(const language of row.languages||[])if(typeof language==='string'&&language.trim())guideLanguages.add(language.trim());
   if(dto.duration)durations.add(dto.duration);if(row.category)categories.add(row.category);hotelPickup ||= row.hasHotelPickup===true;
   // These are prose facts, not a growing entity list. Refuse pathological
   // taxonomy cardinality rather than silently truncating its language proof.
   if(guideLanguages.size>64||durations.size>100||categories.size>100)throw new RouteCompositionUnavailable();
   if(dto.enquiryOnly===true||!(Array.isArray(dto.pricingOptions)&&dto.pricingOptions.some((option:Row)=>Number.isFinite(option.price)&&option.price>0)))enquiries++;
  }else{totals.destinations++;if(destinations.length<6)destinations.push(publicDestination(identity));}
 }
 function finish(collection:Row[] = [],pagination:unknown=null,stats:Row|null=null){
  const facts={...totals,guideLanguages:[...guideLanguages].sort(),durations:[...durations],categories:[...categories],hotelPickup,enquiries};
  const seed={tenant:localizedTenant,featured:featured.map(row=>({...row,bookingTenantSlug:request.tenantSlug})),destinations,facts,collection,pagination,stats};digest.update(JSON.stringify(stats));
  const receipt=publicRoutePublicationReceipt.parse({version:1,renderer:ROUTE_RENDERER,tenantId,tenantSlug:request.tenantSlug,domain:request.domain,route:request.route,locale:request.locale,sourceDigest:digest.digest('hex'),seedDigest:hash(seed),contentLocales:LANGUAGES.filter(locale=>languages.has(locale)),counts:totals});
  return {seed,receipt};
 }
 return {push,finish,totals};
}
const DESTINATION_FIELDS=['_id','slug','name','country','continent','description','shortDescription','images','heroImage','highlights','bestTimeToVisit','tags','sortOrder','isActive','attractionCount','servedByPickup','localizedName','localizedCountry','locale','resolvedLocale','translationStatus','localizedSlugs','localizedSlug'];
function publicDestination(row:Row){return Object.fromEntries(DESTINATION_FIELDS.filter(key=>row[key]!==undefined).map(key=>[key,row[key]]));}
export async function composePublicRoute(input:unknown){
 const request=publicRouteCompositionRequest.parse(input);const session=await mongoose.startSession();
 try{
  let output:ReturnType<ReturnType<typeof routeClosure>['finish']>|undefined;
  await session.withTransaction(async()=>{
   const tenant=await Tenant.findOne({slug:request.tenantSlug,customDomain:request.domain,status:'active',designMode:'savanna'}).select(`${PUBLIC_TENANT_PROJECTION} customPages`).session(session).lean();if(!tenant)throw new RouteCompositionUnavailable();
   const rows=await TenantPresentationTranslation.find(presentationReadScope(tenant)).session(session).lean();
   const presentation=localizedPublicSitePresentation(toPublicTenantDto(tenant),tenant,request.locale,rows as any);
   const closure=routeClosure(request,tenant,presentation);const owner=tenant._id as Types.ObjectId;
   const scope={tenantIds:owner,status:'active',archivedAt:{$exists:false},trashedAt:{$exists:false}};
   const tours=[{$match:scope},...localizationStages(owner,request.locale,undefined,false),{$sort:{sortOrder:1,_id:1}},{$project:{...Object.fromEntries(PUBLIC_ATTRACTION_PROJECTION.split(' ').map(key=>[key,1])),tenantIds:1,updatedAt:1,__translations:1}}];
   const tourCursor=Attraction.aggregate(tours as any).session(session).option({maxTimeMS:15000}).cursor({batchSize:50});
   try{for await(const row of tourCursor)closure.push('tour',row);}finally{await tourCursor.close();}
   const destinationStages=[{$match:{isActive:true}},{$lookup:{from:Attraction.collection.name,let:{city:'$name'},pipeline:[{$match:{...scope,$expr:{$eq:['$destination.city','$$city']}}},{$count:'total'}],as:'__counts'}},{$set:{attractionCount:{$ifNull:[{$arrayElemAt:['$__counts.total',0]},0]}}},{$match:{attractionCount:{$gt:0}}},...destinationLocalizationStages(owner,request.locale,undefined,false),{$sort:{sortOrder:1,_id:1}}];
   const destinationCursor=Destination.aggregate(destinationStages as any).session(session).option({maxTimeMS:15000}).cursor({batchSize:50});
   try{for await(const row of destinationCursor)closure.push('destination',row);}finally{await destinationCursor.close();}
   let collection:Row[]=[];let pagination:unknown=null;
   if(request.route==='safaris'||request.route==='destinations'){
    const plan=publicCursorPlan({tenantId:String(owner),domain:request.domain,route:request.route,locale:request.locale},[{field:'sortOrder',direction:1,kind:'number'},{field:'_id',direction:1,kind:'id'}],request.cursor);
    const stages=request.route==='safaris'?tours:destinationStages;const model=request.route==='safaris'?Attraction:Destination;
    const page=await model.aggregate([...stages,{$set:plan.normalized},...(plan.seek?[{$match:plan.seek}]:[]),{$sort:plan.sort},{$limit:21}] as any).session(session).option({maxTimeMS:15000});
    const result=plan.page(page,20,request.route==='safaris'?closure.totals.tours:closure.totals.destinations);pagination=result.pagination;
    collection=result.rows.map(row=>request.route==='safaris'?localizedPresentation(toPublicAttractionDto(row),currentRows('tour',row,String(owner)),request.locale):publicDestination(localizedDestination(currentRows('destination',row,String(owner)),request.locale)));
   }
   let stats:Row|null=null;
   if(request.route==='home'){
    const reviews=await Review.aggregate([{$match:{status:'approved'}},{$lookup:{from:Attraction.collection.name,let:{tour:'$attractionId'},pipeline:[{$match:{...scope,$expr:{$eq:['$_id','$$tour']}}},{$project:{_id:1}}],as:'__owner'}},{$match:{'__owner.0':{$exists:true}}},{$group:{_id:null,totalReviews:{$sum:1},averageRating:{$avg:'$rating'}}}]).session(session).option({maxTimeMS:15000});
    const totalBookings=await Booking.countDocuments({tenantId:owner,status:{$in:['confirmed','completed']}}).session(session);
    stats={totalAttractions:closure.totals.tours,totalDestinations:closure.totals.destinations,totalReviews:reviews[0]?.totalReviews||0,averageRating:reviews[0]?.averageRating?Math.round(reviews[0].averageRating*10)/10:0,totalBookings};
   }
   output=closure.finish(collection,pagination,stats);
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary',maxCommitTimeMS:15000});
  if(!output)throw new RouteCompositionUnavailable();return output;
 }finally{await session.endSession();}
}
