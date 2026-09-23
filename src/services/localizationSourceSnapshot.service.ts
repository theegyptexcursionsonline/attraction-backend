import { isDeepStrictEqual } from 'util';
/** A versioned presentation-only snapshot. One specification drives both JavaScript
 * and MongoDB so list filtering and publication checks use identical source data.
 * Arrays intentionally preserve ordering and stable identifiers; price, stock,
 * ratings, sort order and other operational fields never enter this snapshot. */
type Field = string | { path: string; fields?: Field[] };
type Kind = 'tour' | 'destination';
const tourFields: Field[] = [
  'title','shortDescription','description','duration','cancellationPolicy',
  ...['highlights','inclusions','exclusions','participantRequirements','whatToBring','needToKnow','accessibility','images'].map(path => ({path})),
  {path:'pricingOptions',fields:['id','name','description',{path:'timeSlots',fields:['id','label']}]},
  {path:'addons',fields:['id','name','description']}, {path:'entryWindows',fields:['label']},
  {path:'itinerary',fields:['title','description','duration']}, {path:'gettingThere',fields:['mode','description']},
  'meetingPoint.instructions', {path:'imageAltTexts',fields:['url','alt']}, 'seo.metaTitle','seo.metaDescription',{path:'seo.keywords'},
];
const destinationFields: Field[] = ['name','country','description','shortDescription','bestTimeToVisit',{path:'highlights'},{path:'tags'}];
const fieldsFor = (kind: Kind) => kind === 'tour' ? tourFields : destinationFields;
const at = (source: any,path: string) => path.split('.').reduce((value,key)=>value?.[key],source);
function values(source: any,fields: Field[]): any[] { return fields.map(field => typeof field === 'string' ? (at(source,field) ?? '') : (at(source,field.path) ?? []).map((item: any)=>field.fields ? values(item,field.fields) : (item ?? ''))); }
function expressions(fields: Field[],prefix: string,depth = 0): any[] { return fields.map(field => typeof field === 'string' ? {$ifNull:[`${prefix}${field}`,'']} : {$map:{input:{$ifNull:[`${prefix}${field.path}`,[]]},as:`entry${depth}`,in:field.fields ? expressions(field.fields,`$$entry${depth}.`,depth+1) : {$ifNull:[`$$entry${depth}`,'']}}}); }
export function sourceSnapshot(kind: Kind,source: Record<string,any>) { return {version:1,values:values(source,fieldsFor(kind))}; }
export function sourceSnapshotExpression(kind: Kind) { return {version:{$literal:1},values:expressions(fieldsFor(kind),'$')}; }
export function sourceMatches(kind: Kind,source: Record<string,any>,translation: Record<string,any>) { return translation.sourceSnapshot ? isDeepStrictEqual(translation.sourceSnapshot,sourceSnapshot(kind,source)) : +new Date(translation.sourceUpdatedAt) === +new Date(source.updatedAt); }
export function currentSourceExpression(snapshotVariable: string,dateVariable: string) { return {$cond:[{$eq:[{$type:'$sourceSnapshot'},'object']},{$eq:['$sourceSnapshot',snapshotVariable]},{$eq:['$sourceUpdatedAt',dateVariable]}]}; }
/** Native and translated URLs have distinct language namespaces. A current
 * requested-language alias wins, then native URLs, then another language alias.
 * Equal-priority collisions remain ambiguous instead of selecting an arbitrary row. */
export function localizedSlugStages(slug: string,locale: string): any[] {
  const native = {$or:[{$eq:['$slug',slug]},{$eq:['$pathSlug',slug]},{$eq:[{$toString:'$_id'},slug]}]};
  const aliases = (language?: string) => ({$in:[slug,{$map:{input:language ? {$filter:{input:'$__translations',as:'translation',cond:{$eq:['$$translation.locale',language]}}} : '$__translations',as:'translation',in:'$$translation.slug'}}]});
  return [{$set:{__slugPriority:{$switch:{branches:locale==='en' ? [{case:native,then:0},{case:aliases(),then:1}] : [{case:aliases(locale),then:0},{case:native,then:1},{case:aliases(),then:2}],default:3}}}},{$match:{__slugPriority:{$lt:3}}},{$sort:{__slugPriority:1,_id:1}},{$limit:2},{$group:{_id:null,priority:{$first:'$__slugPriority'},rows:{$push:'$$ROOT'}}},{$project:{rows:{$filter:{input:'$rows',as:'row',cond:{$eq:['$$row.__slugPriority','$priority']}}}}},{$unwind:'$rows'},{$replaceRoot:{newRoot:'$rows'}},{$unset:'__slugPriority'}];
}
