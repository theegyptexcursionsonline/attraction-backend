import { isDeepStrictEqual } from 'util';
import { z } from 'zod';
import { Types } from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import { sanitizeRichText } from '../utils/sanitizeHtml';
import { FIXED_PAGE_KEYS, publicPageSeo } from '../utils/pageSeo';
import { navigationSchema } from '../utils/siteContent';
export const PRESENTATION_LOCALES = ['ar','de','ru','fr'] as const;
const plain = (max:number) => z.string().max(max).refine(v=>!/[<>\u0000-\u001f\u007f]/.test(v),'Use plain text');
const title=plain(250), prose=plain(10000), rich=z.string().max(100000);
const meta=z.object({metaTitle:plain(200),metaDescription:plain(500),keywords:z.array(title).max(30)}).strict();
const link=z.object({label:title}).strict();
export const tenantPresentationContent = z.object({
 tagline:prose,description:prose,seoSettings:meta,
 pageSeo:z.array(z.object({key:z.enum(FIXED_PAGE_KEYS),title,description:plain(500),heading:title}).strict()).max(FIXED_PAGE_KEYS.length),
 navigation:z.array(z.object({label:title,columns:z.array(z.object({label:title,links:z.array(link).max(20)}).strict()).max(8)}).strict()).max(12),
}).strict();
export const pagePresentationContent = z.object({
 title:title.refine(value=>value.trim().length>0,'Title is required'),body:rich,metaTitle:plain(200),metaDescription:plain(500),heroDescription:plain(1000),heroImageAlt:plain(250),
 sections:z.array(z.object({id:z.string().min(1).max(80),type:z.enum(['content','tours','pages']),title,body:rich}).strict()).max(40),
}).strict();
export type PresentationKind='tenant'|'page';
type Source=Record<string,any>;
const value=(input:unknown)=>typeof input==='string'?input:'';
const publicNavigation=(input:unknown)=>{const parsed=navigationSchema.safeParse(input||[]);return parsed.success?parsed.data:[];};
const publicSections=(input:Source[]) => (input||[]).map(section=>Object.fromEntries(['id','type','title','body','layout','attractionIds','categoryIds','pageIds'].filter(key=>section[key]!==undefined).map(key=>[key,key==='body'?sanitizeRichText(section[key]):section[key]])));
const identity=(input:unknown)=>input instanceof Types.ObjectId?input.toHexString():typeof input==='string'&&Types.ObjectId.isValid(input)?new Types.ObjectId(input).toHexString():null;
export class PresentationTranslationError extends Error {constructor(message:string, public statusCode=400){super(message);}}
function requireSource(kind:PresentationKind,source:Source) {
 if (!identity(source._id)) throw new PresentationTranslationError('Source identity is missing');
 if (kind==='page' && (source.isPublished===false || source.status==='archived' || source.trashedAt)) throw new PresentationTranslationError('Page is not published',409);
}
/** Export only text and immutable positions; operational and commercial fields never enter content. */
export function presentationSourceTemplate(kind:PresentationKind,source:Source):Record<string,any> {
 requireSource(kind,source);
 if(kind==='tenant') {const seo=publicPageSeo(source.pageSeo);return {
  tagline:value(source.tagline),description:value(source.description),seoSettings:{metaTitle:value(source.seoSettings?.metaTitle),metaDescription:value(source.seoSettings?.metaDescription),keywords:source.seoSettings?.keywords||[]},
  pageSeo:FIXED_PAGE_KEYS.filter(key=>seo.pages[key]).map(key=>({key,title:value(seo.pages[key]?.title),description:value(seo.pages[key]?.description),heading:value(seo.pages[key]?.heading)})),
  navigation:publicNavigation(source.navigation).map((item:Source)=>({label:value(item.label),columns:(item.columns||[]).map((column:Source)=>({label:value(column.label),links:(column.links||[]).map((entry:Source)=>({label:value(entry.label)}))}))})),
 };}
 return {title:value(source.title),body:sanitizeRichText(source.body),metaTitle:value(source.metaTitle),metaDescription:value(source.metaDescription),heroDescription:value(source.heroDescription),heroImageAlt:value(source.heroImageAlt),sections:(source.sections||[]).map((section:Source)=>({id:section.id,type:section.type,title:value(section.title),body:section.type==='content'?sanitizeRichText(section.body):''}))};
}
function htmlResources(html:string):string[] {
 const resources:string[]=[];
 sanitizeHtml(sanitizeRichText(html),{allowedTags:['a','img','table','th','td'],allowedAttributes:{'*':['href','src','width','height','loading','target','rel','scope','colspan','rowspan']},transformTags:{'*':(tag,attributes)=>{const locked=Object.fromEntries(Object.entries(attributes).filter(([key])=>!['title','alt'].includes(key)).sort(([a],[b])=>a.localeCompare(b)));if(Object.keys(locked).length)resources.push(`${tag}:${JSON.stringify(locked)}`);return {tagName:tag,attribs:attributes};}}});
 return resources;
}
/** Source topology and image/link identities are part of freshness, not translatable data. */
export function presentationSourceSnapshot(kind:PresentationKind,source:Source):Record<string,unknown> {
 const template=presentationSourceTemplate(kind,source);
 return {version:1,kind,sourceId:identity(source._id),content:template,topology:kind==='tenant'?{slug:source.slug,heroImages:source.heroImages||[],navigation:publicNavigation(source.navigation),pageSeo:publicPageSeo(source.pageSeo)}: {slug:source.slug,layoutMode:source.layoutMode||'website',heroImage:value(source.heroImage),ogImage:value(source.ogImage),pageType:value(source.pageType),parentPath:value(source.parentPath)||'/',categoryIds:source.categoryIds||[],sections:publicSections(source.sections),revision:source.revision||0,isPublished:source.isPublished!==false,status:source.status||'active'}};
}
function validateComplete(original:any,translated:any,path='content'):void {
 if(typeof original==='string') {if(original.trim()&&!translated.trim())throw new PresentationTranslationError(`Translate ${path} without removing information`);if(!original.trim()&&translated.trim())throw new PresentationTranslationError(`Do not invent ${path}`);return;}
 if(Array.isArray(original)){if(original.length!==translated.length)throw new PresentationTranslationError(`Translate every ${path}`);original.forEach((item,index)=>validateComplete(item,translated[index],`${path}.${index}`));return;}
 for(const key of Object.keys(original)) {
  if(['id','type','key'].includes(key)){if(original[key]!==translated[key])throw new PresentationTranslationError(`Preserve ${path}.${key}`);}
  else validateComplete(original[key],translated[key],`${path}.${key}`);
 }
}
export function cleanPresentationContent(kind:PresentationKind,source:Source,input:unknown):Record<string,any> {
 const parsed=(kind==='tenant'?tenantPresentationContent:pagePresentationContent).safeParse(input);
 if(!parsed.success)throw new PresentationTranslationError('Invalid presentation translation');
 const content=parsed.data as Record<string,any>;
 const template=presentationSourceTemplate(kind,source);
 validateComplete(template,content);
 if(kind==='page') {
  for(const key of ['body']){if(!isDeepStrictEqual(htmlResources(template[key]),htmlResources(content[key])))throw new PresentationTranslationError('Preserve every authored link and image');content[key]=sanitizeRichText(content[key]);}
  content.sections=content.sections.map((section:Source,index:number)=>{if(!isDeepStrictEqual(htmlResources(template.sections[index].body),htmlResources(section.body)))throw new PresentationTranslationError('Preserve section links and images');return {...section,body:sanitizeRichText(section.body)};});
  validateComplete(template,content);
 }
 return content;
}
export interface PresentationRow {tenantId:unknown;kind:PresentationKind;sourceId:unknown;locale:string;status:string;sourceSnapshot:unknown;content:unknown}
export function currentPresentationRows(tenantId:unknown,kind:PresentationKind,source:Source,rows:PresentationRow[]):PresentationRow[] {
 const owner=identity(tenantId);if(!owner || (kind==='tenant' ? identity(source._id)!==owner : identity(source.tenantId)!==owner))return [];
 let snapshot:unknown;try{snapshot=presentationSourceSnapshot(kind,source);}catch{return [];}
 const accepted=rows.filter(row=>identity(row.tenantId)===owner && row.kind===kind && identity(row.sourceId)===identity(source._id) && PRESENTATION_LOCALES.includes(row.locale as any) && row.status==='published' && isDeepStrictEqual(row.sourceSnapshot,snapshot)).filter(row=>{try{cleanPresentationContent(kind,source,row.content);return true;}catch{return false;}});
 return accepted.filter(row=>accepted.filter(other=>other.locale===row.locale).length===1);
}
/** Public presentation is copied onto the pre-existing safe DTO only. No arbitrary translation keys spread. */
export function localizedTenantPresentation(dto:Source,source:Source,tenantId:unknown,locale:string,rows:PresentationRow[],kind:PresentationKind='tenant'):Source {
 const dtoIds=[dto._id,dto.id].filter(value=>value!==undefined);
 const ownsDto=dtoIds.length>0 && dtoIds.every(value=>identity(value)===identity(source._id)) && dto.slug===source.slug;
 const accepted=ownsDto?currentPresentationRows(tenantId,kind,source,rows):[];
 const base={...dto,locale,resolvedLocale:'en',translationStatus:locale==='en'?'source':'missing',publishedPresentationLocales:PRESENTATION_LOCALES.filter(language=>accepted.some(row=>row.locale===language))};
 const row=accepted.find(item=>item.locale===locale);if(locale==='en'||!row)return base;
 const content=cleanPresentationContent(kind,source,row.content);
 const out:Source={...base,resolvedLocale:locale,translationStatus:'translated'};
 if(kind==='tenant') {
  for(const key of ['tagline','description'])if(key in dto)out[key]=content[key];
  if(dto.seoSettings)out.seoSettings={...dto.seoSettings,...content.seoSettings};
  if(dto.pageSeo)out.pageSeo={...dto.pageSeo,pages:Object.fromEntries(Object.entries(dto.pageSeo.pages||{}).map(([key,entry])=>{const label=content.pageSeo.find((item:Source)=>item.key===key);return [key,{...(entry as object),...(label?{title:label.title,description:label.description,heading:label.heading}:{})}];}))};
  if(dto.navigation)out.navigation=dto.navigation.map((item:Source,index:number)=>({...item,label:content.navigation[index].label,...(item.columns?{columns:item.columns.map((column:Source,columnIndex:number)=>({...column,label:content.navigation[index].columns[columnIndex].label,links:column.links.map((entry:Source,linkIndex:number)=>({...entry,label:content.navigation[index].columns[columnIndex].links[linkIndex].label}))}))}:{})}));
 }else{
  for(const key of ['title','body','metaTitle','metaDescription','heroDescription','heroImageAlt'])if(key in dto)out[key]=content[key];
  if(dto.sections)out.sections=dto.sections.map((section:Source,index:number)=>({...section,title:content.sections[index].title,...(section.type==='content'?{body:content.sections[index].body}:{})}));
 }
 return out;
}

/** Controller/migration callers use a verified owning Tenant, never a standalone page from another site. */
export function ownedPresentationSource(tenant:Source,kind:PresentationKind,sourceId:unknown):Source {
 if(!identity(tenant._id))throw new PresentationTranslationError('Tenant identity is missing');
 if(kind==='tenant'){if(identity(sourceId)!==identity(tenant._id))throw new PresentationTranslationError('Foreign source',409);return tenant;}
 const page=(tenant.customPages||[]).find((item:Source)=>identity(item._id)===identity(sourceId));
 if(!page)throw new PresentationTranslationError('Foreign source',409);
 const source={...page,tenantId:tenant._id};requireSource(kind,source);return source;
}
/** Integrators pass the established safe public Tenant DTO and its owning source.
 * Page bodies receive their own publication identity; site-wide qualification is
 * the intersection of tenant and every currently published page, never UI settings. */
export function localizedPublicSitePresentation(dto:Source,tenant:Source,locale:string,rows:PresentationRow[]):Source {
 const output=localizedTenantPresentation(dto,tenant,tenant._id,locale,rows);
 const dtoIds=[dto._id,dto.id].filter(value=>value!==undefined);
 if(dto.slug!==tenant.slug||!dtoIds.length||dtoIds.some(value=>identity(value)!==identity(tenant._id))){output.publishedSiteLocales=[];return output;}
 const activePages=(tenant.customPages||[]).filter((page:Source)=>page.isPublished!==false&&page.status!=='archived'&&!page.trashedAt);
 const publishedSets=[currentPresentationRows(tenant._id,'tenant',tenant,rows).map(row=>row.locale),...activePages.map((page:Source)=>currentPresentationRows(tenant._id,'page',{...page,tenantId:tenant._id},rows).map(row=>row.locale))];
 output.publishedSiteLocales=PRESENTATION_LOCALES.filter(language=>publishedSets.every(set=>set.includes(language)));
 if(Array.isArray(dto.customPages))output.customPages=dto.customPages.map((page:Source)=>{const source=activePages.find((candidate:Source)=>identity(candidate._id)===identity(page._id||page.id));return source?localizedTenantPresentation(page,{...source,tenantId:tenant._id},tenant._id,locale,rows,'page'):{...page,locale,resolvedLocale:'en',translationStatus:locale==='en'?'source':'missing',publishedPresentationLocales:[]};});
 return output;
}
/** Bound the DB read to this owner's existing current public entities, excluding
 * historical/removed page translations rather than reading a growing collection. */
export function presentationReadScope(tenant:Source):Record<string,unknown> {
 if(!identity(tenant._id))throw new PresentationTranslationError('Tenant identity is missing');
 const pageIds=(tenant.customPages||[]).filter((page:Source)=>page.isPublished!==false&&page.status!=='archived'&&!page.trashedAt).map((page:Source)=>{if(!identity(page._id))throw new PresentationTranslationError('Page identity is missing');return new Types.ObjectId(identity(page._id)!);});
 return {tenantId:new Types.ObjectId(identity(tenant._id)!),status:'published',locale:{$in:[...PRESENTATION_LOCALES]},$or:[{kind:'tenant',sourceId:new Types.ObjectId(identity(tenant._id)!)},...(pageIds.length?[{kind:'page',sourceId:{$in:pageIds}}]:[])]};
}
