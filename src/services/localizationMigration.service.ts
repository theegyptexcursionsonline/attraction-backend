import { createHash } from 'crypto';
import mongoose, { Types, type ClientSession } from 'mongoose';
import { z } from 'zod';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Destination } from '../models/Destination';
import { AttractionTranslation } from '../models/AttractionTranslation';
import { DestinationTranslation } from '../models/DestinationTranslation';
import { attractionTranslationContent,cleanTranslation,validateTranslationSource,TranslationError } from './attractionLocalization.service';
import { destinationTranslationContent,cleanDestinationTranslation,validateDestinationTranslation } from './destinationLocalization.service';
import { tenantPickupDestinationSlugs } from '../utils/pickupDestinations';
const entry = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i),locale: z.enum(['de','ru']),slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),sourceUpdatedAt: z.string().datetime(),content: z.record(z.unknown()) }).strict();
export const localizationPayload = z.object({ tenantId: z.string().regex(/^[a-f\d]{24}$/i),tenantSlug: z.string().min(1),domain: z.string().min(1),sourceSha256: z.string().regex(/^[a-f\d]{64}$/),tours: z.array(entry).max(10000),destinations: z.array(entry).max(10000) }).strict();
export type LocalizationPayload = z.infer<typeof localizationPayload>;
type Kind = 'tour'|'destination';
export interface LocalizationPlan { version: 1; tenantId: string; tenantSlug: string; domain: string; sourceSha256: string; payloadSha256: string; rows: Array<{ kind: Kind; sourceId: string; sourceUpdatedAt: string; filter: Record<string,any>; before: Record<string,any>|null; after: Record<string,any> }>; digest: string }
const sort = (value: any): any => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,sort(value[key])])) : value;
export function localizationDigest(value: unknown) { const json = JSON.parse(mongoose.mongo.BSON.EJSON.stringify(value,{ relaxed: false })); return createHash('sha256').update(JSON.stringify(sort(json))).digest('hex'); }
const translationModel = (kind: Kind) => kind === 'tour' ? AttractionTranslation : DestinationTranslation;
const sourceModel = (kind: Kind) => kind === 'tour' ? Attraction : Destination;
async function verifiedTenant(plan: Pick<LocalizationPlan,'tenantId'|'tenantSlug'|'domain'>,session?: ClientSession) { const tenant = await Tenant.findOne({ _id: plan.tenantId,slug: plan.tenantSlug,customDomain: plan.domain,status: 'active' }).session(session || null).lean(); if (!tenant) throw new TranslationError('Active tenant and domain ownership did not match',409); return tenant; }
async function sourceFor(kind: Kind,id: string,tenant: any,session?: ClientSession): Promise<any> { const query = kind === 'tour' ? { _id: id,tenantIds: tenant._id,status: 'active',archivedAt: { $exists: false },trashedAt: { $exists: false } } : { _id: id,isActive: true }; const source = await (sourceModel(kind) as any).findOne(query).session(session || null).lean(); if (!source?.updatedAt) throw new TranslationError('An active source record is missing or unversioned',409); if (kind === 'destination' && !tenantPickupDestinationSlugs(tenant).includes(source.slug) && !await Attraction.exists({ tenantIds: tenant._id,status: 'active','destination.city': source.name }).session(session || null)) throw new TranslationError('Destination does not belong to this site',409); return source; }
export async function planLocalization(sourceExport: { tenantId: string; tenantSlug: string; domain: string; tours: Array<{id:string;sourceUpdatedAt:string}>;destinations:Array<{id:string;sourceUpdatedAt:string}> },rawPayload: unknown,sourceSha256: string): Promise<LocalizationPlan> {
  const payload = localizationPayload.parse(rawPayload);
  if (payload.sourceSha256 !== sourceSha256 || payload.tenantId !== sourceExport.tenantId || payload.tenantSlug !== sourceExport.tenantSlug || payload.domain !== sourceExport.domain) throw new TranslationError('Payload and reviewed source identity/digest differ',409);
  const tenant = await verifiedTenant(payload); const rows: LocalizationPlan['rows'] = []; const now = new Date();
  for (const [kind,key] of [['tour','tours'],['destination','destinations']] as const) {
    const expected = new Map(sourceExport[key].map(row => [row.id,row.sourceUpdatedAt])); const entries = payload[key];
    if (entries.length !== expected.size*2 || new Set(entries.map(row => `${row.id}:${row.locale}`)).size !== entries.length || [...expected.keys()].some(id => !entries.some(row=>row.id===id&&row.locale==='de')||!entries.some(row=>row.id===id&&row.locale==='ru'))) throw new TranslationError('Both languages are required for every reviewed source, without extra records',409);
    const aliases = new Map<string,string>();
    for (const item of entries) {
      if (expected.get(item.id) !== item.sourceUpdatedAt) throw new TranslationError('Source version changed in the payload',409);
      const previousAlias = aliases.get(item.slug); if (previousAlias && (kind === 'tour' || previousAlias !== item.id)) throw new TranslationError('Duplicate translated URL in payload',409); aliases.set(item.slug,item.id);
      const source = await sourceFor(kind,item.id,tenant); if (source.updatedAt.toISOString() !== item.sourceUpdatedAt) throw new TranslationError('Live source changed after export. Translate a fresh export.',409);
      const content = kind === 'tour' ? cleanTranslation(attractionTranslationContent.parse(item.content)) : cleanDestinationTranslation(destinationTranslationContent.parse(item.content));
      if (kind === 'tour') validateTranslationSource(source,content as any); else validateDestinationTranslation(source,content as any);
      const canonicalCollision = await (sourceModel(kind) as any).exists({ _id: { $ne: source._id },...(kind === 'tour' ? { tenantIds: tenant._id,$or: [{ slug: item.slug },{ pathSlug: item.slug }] } : { slug: item.slug }) });
      const field = kind === 'tour' ? 'attractionId' : 'destinationId'; const model = translationModel(kind);
      const aliasCollision = await model.collection.findOne({ tenantId: tenant._id,[field]: { $ne: source._id },slug: item.slug });
      if (canonicalCollision || aliasCollision) throw new TranslationError('A translated URL collides with another record',409);
      const filter = { tenantId: tenant._id,[field]: source._id,locale: item.locale }; const before = await model.collection.findOne(filter);
      const after = { ...(before || {}),_id: before?._id || new Types.ObjectId(),...filter,slug: item.slug,content,status: 'published',sourceUpdatedAt: source.updatedAt,createdAt: before?.createdAt || now,updatedAt: new Date(Math.max(+now,before?.updatedAt ? +new Date(before.updatedAt)+1 : +now)) };
      rows.push({ kind,sourceId:item.id,sourceUpdatedAt:item.sourceUpdatedAt,filter,before,after });
    }
  }
  const plan = { version: 1 as const,tenantId:payload.tenantId,tenantSlug:payload.tenantSlug,domain:payload.domain,sourceSha256,payloadSha256:localizationDigest(payload),rows };
  return { ...plan,digest:localizationDigest(plan) };
}
export function verifyLocalizationPlan(plan: LocalizationPlan,approvedDigest: string) { const { digest,...content } = plan; if (plan.version!==1 || digest !== localizationDigest(content) || digest!==approvedDigest || !plan.rows.length || plan.rows.some(row => String(row.filter.tenantId)!==plan.tenantId || String(row.after.tenantId)!==plan.tenantId || (row.before && String(row.before.tenantId)!==plan.tenantId))) throw new TranslationError('Plan digest or tenant boundary verification failed',409); }
export async function executeLocalizationPlan(plan: LocalizationPlan,approvedDigest: string,mode: 'apply'|'rollback') {
  verifyLocalizationPlan(plan,approvedDigest);
  // Do not let a CLI accidentally create collections/indexes in an unprepared release.
  for (const kind of new Set(plan.rows.map(row=>row.kind))) { const indexes=await translationModel(kind).collection.indexes(); const field=kind==='tour'?'attractionId':'destinationId'; if (!indexes.some(index=>index.unique && index.key.tenantId===1 && index.key[field]===1 && index.key.locale===1)) throw new TranslationError('Translation uniqueness index is not ready',409); }
  const session=await mongoose.startSession(); let changed=false;
  try { await session.withTransaction(async()=>{
    changed=false; const tenant=await verifiedTenant(plan,session); const currents=[];
    for(const row of plan.rows) { if(mode==='apply') { const source=await sourceFor(row.kind,row.sourceId,tenant,session); if(source.updatedAt.toISOString()!==row.sourceUpdatedAt) throw new TranslationError('Source changed since dry-run; no translations written',409); const collision=await (sourceModel(row.kind) as any).exists({ _id:{$ne:source._id},...(row.kind==='tour'?{tenantIds:tenant._id,$or:[{slug:row.after.slug},{pathSlug:row.after.slug}]}:{slug:row.after.slug}) }).session(session); if(collision) throw new TranslationError('A translated URL was claimed after dry-run; no writes performed',409); } currents.push(await translationModel(row.kind).collection.findOne(row.filter,{session})); }
    const expected=mode==='apply'?'before':'after'; const desired=mode==='apply'?'after':'before';
    if(currents.every((value,index)=>localizationDigest(value)===localizationDigest(plan.rows[index][desired]))) return;
    if(!currents.every((value,index)=>localizationDigest(value)===localizationDigest(plan.rows[index][expected]))) throw new TranslationError('Translation rows changed since the approved snapshot; no writes performed',409);
    for(const row of plan.rows) { const model=translationModel(row.kind); const replacement=row[desired]; if(replacement) await model.collection.replaceOne(row.filter,replacement as any,{session,upsert: true}); else await model.collection.deleteOne({ ...row.filter,_id:row.after._id },{session}); }
    changed=true;
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
  const desired=mode==='apply'?'after':'before'; const verified=[]; for(const row of plan.rows) verified.push(localizationDigest(await translationModel(row.kind).collection.findOne(row.filter))===localizationDigest(row[desired]));
  if(verified.some(value=>!value)) throw new TranslationError('Post-operation readback differs from the expected snapshot; inspect before retrying',409);
  return { mode,changed,verified:true,rows:plan.rows.length,digest:plan.digest };
  } finally { await session.endSession(); }
}
