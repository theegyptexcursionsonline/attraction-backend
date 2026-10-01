import mongoose, { Types } from 'mongoose';
import { createHash } from 'crypto';
import { z } from 'zod';
import { Tenant } from '../models/Tenant';
import { TenantPresentationTranslation } from '../models/TenantPresentationTranslation';
import { PRESENTATION_LOCALES, ownedPresentationSource, presentationSourceSnapshot, cleanPresentationContent, PresentationTranslationError, type PresentationKind } from './tenantPresentationLocalization.service';
const id=z.string().regex(/^[a-f\d]{24}$/i);
export const tenantPresentationPayload=z.object({tenantId:id,tenantSlug:z.string().regex(/^[a-z0-9-]+$/),domain:z.string().min(1).max(250),sourceSha256:z.string().regex(/^[a-f\d]{64}$/),locales:z.array(z.enum(PRESENTATION_LOCALES)).length(4).refine(values=>new Set(values).size===4),rows:z.array(z.object({kind:z.enum(['tenant','page']),sourceId:id,locale:z.enum(PRESENTATION_LOCALES),content:z.record(z.unknown())}).strict()).min(4).max(4000)}).strict();
type RecordData=Record<string,any>;
export interface TenantPresentationPlan {version:1;tenantId:string;tenantSlug:string;domain:string;sourceSha256:string;rows:Array<{kind:PresentationKind;sourceId:string;filter:RecordData;sourceSnapshot:RecordData;before:RecordData|null;after:RecordData}>;digest:string}
const sort=(value:any):any=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value;
export function presentationDigest(value:unknown):string {return createHash('sha256').update(JSON.stringify(sort(JSON.parse(mongoose.mongo.BSON.EJSON.stringify(value,{relaxed:false}))))).digest('hex');}
function sources(tenant:RecordData) {return [{kind:'tenant' as const,id:String(tenant._id)},...(tenant.customPages||[]).filter((page:RecordData)=>page.isPublished!==false&&page.status!=='archived'&&!page.trashedAt).map((page:RecordData)=>({kind:'page' as const,id:String(page._id)}))];}
export function exportTenantPresentationSource(tenant:RecordData) {
 if(tenant.status!=='active'||!Types.ObjectId.isValid(tenant._id)||!tenant.slug||!tenant.customDomain)throw new PresentationTranslationError('Verified active tenant and domain required',409);
 return {version:1,tenantId:String(tenant._id),tenantSlug:tenant.slug,domain:tenant.customDomain,sources:sources(tenant).map(item=>({kind:item.kind,sourceId:item.id,snapshot:presentationSourceSnapshot(item.kind,ownedPresentationSource(tenant,item.kind,item.id))}))};
}
async function tenantFor(target:Pick<TenantPresentationPlan,'tenantId'|'tenantSlug'|'domain'>,session?:mongoose.ClientSession):Promise<RecordData> {
 const tenant=await Tenant.findOne({_id:target.tenantId,slug:target.tenantSlug,customDomain:target.domain,status:'active'}).session(session||null).lean();
 if(!tenant)throw new PresentationTranslationError('Tenant and domain ownership changed',409);return tenant;
}
export async function planTenantPresentation(sourceExport:ReturnType<typeof exportTenantPresentationSource>,rawPayload:unknown):Promise<TenantPresentationPlan> {
 const payload=tenantPresentationPayload.parse(rawPayload);
 if(payload.tenantId!==sourceExport.tenantId||payload.tenantSlug!==sourceExport.tenantSlug||payload.domain!==sourceExport.domain||payload.sourceSha256!==presentationDigest(sourceExport))throw new PresentationTranslationError('Payload does not match the reviewed source export',409);
 const tenant=await tenantFor(payload);
 if(presentationDigest(exportTenantPresentationSource(tenant))!==payload.sourceSha256)throw new PresentationTranslationError('Authored source changed after export',409);
 const expected=sourceExport.sources;
 if(payload.rows.length!==expected.length*4 || new Set(payload.rows.map(row=>`${row.kind}:${row.sourceId}:${row.locale}`)).size!==payload.rows.length || expected.some(source=>PRESENTATION_LOCALES.some(locale=>!payload.rows.some(row=>row.kind===source.kind&&row.sourceId===source.sourceId&&row.locale===locale))))throw new PresentationTranslationError('Every published source needs all four target languages without extra records',409);
 const rows:TenantPresentationPlan['rows']=[];const now=new Date();
 for(const item of payload.rows){
  const source=ownedPresentationSource(tenant,item.kind,item.sourceId);const content=cleanPresentationContent(item.kind,source,item.content);
  const filter={tenantId:new Types.ObjectId(payload.tenantId),kind:item.kind,sourceId:new Types.ObjectId(item.sourceId),locale:item.locale};
  const before=await TenantPresentationTranslation.collection.findOne(filter);
  if(before && (!Number.isSafeInteger(before.revision)||before.revision<0||before.revision>=Number.MAX_SAFE_INTEGER))throw new PresentationTranslationError('Invalid presentation revision',409);
  const sourceSnapshot=presentationSourceSnapshot(item.kind,source);
  const after={_id:before?._id||new Types.ObjectId(),...filter,status:'published',sourceSnapshot,content,revision:(before?.revision||0)+1,createdAt:before?.createdAt||now,updatedAt:new Date(Math.max(+now,before?.updatedAt?+new Date(before.updatedAt)+1:+now))};
  rows.push({kind:item.kind,sourceId:item.sourceId,filter,sourceSnapshot,before,after});
 }
 const plan:TenantPresentationPlan={version:1,tenantId:payload.tenantId,tenantSlug:payload.tenantSlug,domain:payload.domain,sourceSha256:payload.sourceSha256,rows,digest:''};plan.digest=presentationDigest({...plan,digest:undefined});return plan;
}


function verifyPlannedRows(plan:TenantPresentationPlan,tenant:RecordData) {
 const expected=sources(tenant);
 if(plan.rows.length!==expected.length*4||new Set(plan.rows.map(row=>`${row.kind}:${row.sourceId}:${row.filter.locale}`)).size!==plan.rows.length||expected.some(source=>PRESENTATION_LOCALES.some(locale=>!plan.rows.some(row=>row.kind===source.kind&&row.sourceId===source.id&&row.filter.locale===locale))))throw new PresentationTranslationError('Approved batch must cover every source and locale',409);
 const fields=new Set(['_id','tenantId','kind','sourceId','locale','status','sourceSnapshot','content','revision','createdAt','updatedAt']);
 for(const row of plan.rows) {
  if(Object.keys(row.filter).sort().join(',')!=='kind,locale,sourceId,tenantId')throw new PresentationTranslationError('Invalid identity filter',409);
  for(const record of [row.before,row.after])if(record){
   if(Object.keys(record).some(key=>!fields.has(key))||String(record.tenantId)!==plan.tenantId||String(record.sourceId)!==row.sourceId||record.kind!==row.kind||record.locale!==row.filter.locale||!Types.ObjectId.isValid(record._id)||!Number.isSafeInteger(record.revision)||record.revision<0||!['draft','published'].includes(record.status)||!(record.createdAt instanceof Date)||!Number.isFinite(+record.createdAt)||!(record.updatedAt instanceof Date)||!Number.isFinite(+record.updatedAt))throw new PresentationTranslationError('Invalid stored presentation identity',409);
  }
  if(row.after.revision!==(row.before?.revision||0)+1 || row.after.status!=='published'||presentationDigest(row.after.sourceSnapshot)!==presentationDigest(row.sourceSnapshot))throw new PresentationTranslationError('Invalid publication snapshot',409);
 }
}

/** Atomic publication is unavailable unless exact identity uniqueness and source fencing are qualified. */
export async function executeTenantPresentation(plan:TenantPresentationPlan,mode:'apply'|'rollback') {
 if(!['apply','rollback'].includes(mode)||plan.version!==1||plan.digest!==presentationDigest({...plan,digest:undefined}))throw new PresentationTranslationError('Approved plan changed',409);
 const indices=await TenantPresentationTranslation.collection.indexes();
 if(!indices.some(index=>index.unique===true&&!index.sparse&&!index.partialFilterExpression&&(!index.collation||index.collation.locale==='simple')&&JSON.stringify(index.key)===JSON.stringify({tenantId:1,kind:1,sourceId:1,locale:1})))throw new PresentationTranslationError('Presentation identity uniqueness index is not ready',409);
 const session=await mongoose.startSession();let changed=false;
 try{
  await session.withTransaction(async()=>{
   changed=false;const tenant=await tenantFor(plan,session);
   verifyPlannedRows(plan,tenant);
   if(presentationDigest(exportTenantPresentationSource(tenant))!==plan.sourceSha256)throw new PresentationTranslationError('Authored source changed; no presentation written',409);
   for(const row of plan.rows){
    const source=ownedPresentationSource(tenant,row.kind,row.sourceId);
    if(!Types.ObjectId.isValid(row.filter.tenantId)||String(row.filter.tenantId)!==plan.tenantId||row.filter.kind!==row.kind||String(row.filter.sourceId)!==row.sourceId||!PRESENTATION_LOCALES.includes(row.filter.locale))throw new PresentationTranslationError('Invalid row ownership',409);
    if(presentationDigest(presentationSourceSnapshot(row.kind,source))!==presentationDigest(row.sourceSnapshot))throw new PresentationTranslationError('Source snapshot differs',409);
    cleanPresentationContent(row.kind,source,row.after.content);
   }
   const current=[];for(const row of plan.rows)current.push(await TenantPresentationTranslation.collection.findOne(row.filter,{session}));
   const expected=mode==='apply'?'before':'after',desired=mode==='apply'?'after':'before';
   if(current.every((value,index)=>presentationDigest(value)===presentationDigest(plan.rows[index][desired])))return;
   if(!current.every((value,index)=>presentationDigest(value)===presentationDigest(plan.rows[index][expected])))throw new PresentationTranslationError('Presentation was edited since this plan; no writes performed',409);
   // A real, transaction-only source write acquires MongoDB's document lock. It is
   // removed before commit; final source/settings/timestamps are unchanged. Abort
   // restores it automatically. Existing markers are never overwritten.
   const marker=new Types.ObjectId().toHexString();
   const fence=await Tenant.updateOne({_id:tenant._id,updatedAt:tenant.updatedAt,__presentationPublicationFence:{$exists:false}},{$set:{__presentationPublicationFence:marker}},{session,strict:false,timestamps:false});
   if(fence.matchedCount!==1)throw new PresentationTranslationError('Source changed before publication',409);
   for(const row of plan.rows){const desiredRow=row[desired];if(desiredRow)await TenantPresentationTranslation.collection.replaceOne(row.filter,desiredRow as any,{session,upsert:true});else await TenantPresentationTranslation.collection.deleteOne({...row.filter,_id:row.after._id},{session});}
   const restored=await Tenant.updateOne({_id:tenant._id,__presentationPublicationFence:marker},{$unset:{__presentationPublicationFence:''}},{session,strict:false,timestamps:false});
   if(restored.matchedCount!==1)throw new PresentationTranslationError('Source fence was lost',409);
   changed=true;
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
  const desired=mode==='apply'?'after':'before';
  for(const row of plan.rows)if(presentationDigest(await TenantPresentationTranslation.collection.findOne(row.filter))!==presentationDigest(row[desired]))throw new PresentationTranslationError('Readback differs; inspect before retrying',409);
  if(presentationDigest(exportTenantPresentationSource(await tenantFor(plan)))!==plan.sourceSha256)throw new PresentationTranslationError('Source changed after publication; source fallback is required',409);
  return {mode,changed,verified:true,rows:plan.rows.length,digest:plan.digest};
 }finally{await session.endSession();}
}
