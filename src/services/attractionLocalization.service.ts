import { Types } from 'mongoose';
import { z } from 'zod';
import { AttractionTranslation } from '../models/AttractionTranslation';
import { sanitizeRichText } from '../utils/sanitizeHtml';
import { escapeRegex } from '../utils/helpers';
export type StorefrontLocale = 'en' | 'de' | 'ru';
const text = z.string().trim().max(2000); const short = z.string().trim().max(250); const items = z.array(text).max(100);
const byId = z.object({ id: z.string().min(1).max(100), name: short, description: text.optional(), timeSlots: z.array(z.object({ id: z.string().min(1).max(100), label: short }).strict()).max(100).optional() }).strict();
export const attractionTranslationContent = z.object({
  title: short.min(1), shortDescription: text.min(1), description: z.string().trim().min(1).max(100000), duration: short,
  highlights: items, inclusions: items, exclusions: items, participantRequirements: items, whatToBring: items, needToKnow: items, accessibility: items,
  cancellationPolicy: z.string().trim().max(10000),
  pricingOptions: z.array(byId).max(100), addons: z.array(byId.omit({ timeSlots: true })).max(100),
  entryWindows: z.array(z.object({ index: z.number().int().min(0).max(100), label: short }).strict()).max(100),
  itinerary: z.array(z.object({ index: z.number().int().min(0).max(100), title: short, description: text, duration: short.optional() }).strict()).max(100),
  gettingThere: z.array(z.object({ index: z.number().int().min(0).max(100), mode: short, description: text }).strict()).max(100),
  meetingPoint: z.object({ instructions: text }).strict(),
  imageAltTexts: z.array(z.object({ url: z.string().url().max(2048), alt: short }).strict()).max(100),
  seo: z.object({ metaTitle: z.string().trim().max(200), metaDescription: z.string().trim().max(500), keywords: z.array(short).max(30).optional() }).strict(),
}).strict();
export type TranslationContent = z.infer<typeof attractionTranslationContent>;
export class TranslationError extends Error { constructor(message: string, public statusCode = 400) { super(message); } }
export function requestedLocale(value: unknown): StorefrontLocale | undefined { if (value === undefined) return undefined; if (value === 'en' || value === 'de' || value === 'ru') return value; throw new TranslationError('Unsupported language'); }

/** Join only this site's current published presentation, before pagination/search. */
export function localizationStages(tenantId: Types.ObjectId, locale: StorefrontLocale, search?: string, filterMissing = true): any[] {
  return [{ $lookup: { from: AttractionTranslation.collection.name, let: { attraction: '$_id', sourceDate: '$updatedAt' }, pipeline: [{ $match: { tenantId, status: 'published', $expr: { $and: [{ $eq: ['$attractionId', '$$attraction'] }, { $eq: ['$sourceUpdatedAt', '$$sourceDate'] }] } } }], as: '__translations' } }, ...(locale !== 'en' && filterMissing ? [{ $match: { __translations: { $elemMatch: { locale, ...(search ? { $or: [{ 'content.title': new RegExp(escapeRegex(search), 'i') }, { 'content.shortDescription': new RegExp(escapeRegex(search), 'i') }, { 'content.description': new RegExp(escapeRegex(search), 'i') }] } : {}) } } } }] : [])];
}
const mappedIds = (source: any[], labels: any[], field: string) => {
  const ids = new Set(source.map(item => String(item.id)));
  if (labels.length !== source.length || new Set(labels.map(item => item.id)).size !== labels.length || labels.some(item => !ids.has(item.id))) throw new TranslationError(`Translate every ${field} using its original ID`);
};
export function validateTranslationSource(source: Record<string, any>, content: TranslationContent): void {
  const requireText = (original: unknown, translated: unknown, field: string) => { if (typeof original === 'string' && original.trim() && (typeof translated !== 'string' || !translated.trim())) throw new TranslationError(`Translate ${field} without removing its information`); };
  for (const field of ['title', 'shortDescription', 'description', 'duration', 'cancellationPolicy'] as const) requireText(source[field], content[field], field);
  requireText(source.meetingPoint?.instructions, content.meetingPoint.instructions, 'meeting instructions');
  requireText(source.seo?.metaTitle || source.title, content.seo.metaTitle, 'search title');
  requireText(source.seo?.metaDescription || source.shortDescription, content.seo.metaDescription, 'search description');
  for (const field of ['pricingOptions', 'addons'] as const) { mappedIds(source[field] || [], content[field], field); for (const label of content[field]) { const original = (source[field] || []).find((item: any) => String(item.id) === label.id); requireText(original?.name, label.name, `${field} name`); requireText(original?.description, label.description, `${field} description`); } }
  for (const option of content.pricingOptions) { const original = (source.pricingOptions || []).find((item: any) => String(item.id) === option.id); const labels = option.timeSlots || []; mappedIds(original?.timeSlots || [], labels, 'departure label'); for (const label of labels) requireText(original?.timeSlots?.find((slot: any) => String(slot.id) === label.id)?.label, label.label, 'departure label'); }
  for (const field of ['entryWindows', 'itinerary', 'gettingThere'] as const) { const originals = source[field] || []; const labels = content[field]; if (labels.length !== originals.length || new Set(labels.map(item => item.index)).size !== labels.length || labels.some(item => item.index >= originals.length)) throw new TranslationError(`Translate every ${field} item using its original index`); for (const label of labels) for (const [key, original] of Object.entries(originals[label.index] || {})) if (['label', 'title', 'description', 'duration', 'mode'].includes(key)) requireText(original, (label as Record<string, unknown>)[key], `${field} ${key}`); }
  const images = new Set(source.images || []); if (content.imageAltTexts.length !== images.size || content.imageAltTexts.some(image => !images.has(image.url)) || new Set(content.imageAltTexts.map(image => image.url)).size !== content.imageAltTexts.length) throw new TranslationError('Image descriptions must reference every image in this tour');
  for (const image of content.imageAltTexts) if (!image.alt.trim()) throw new TranslationError('Add a translated description for each image');
  for (const field of ['highlights', 'inclusions', 'exclusions', 'participantRequirements', 'whatToBring', 'needToKnow', 'accessibility'] as const) { if ((source[field] || []).length !== content[field].length) throw new TranslationError(`Translate every ${field} item without removing information`); (source[field] || []).forEach((item: unknown, index: number) => requireText(item, content[field][index], field)); }
  if (source.cancellationPolicy?.trim() && !content.cancellationPolicy.trim()) throw new TranslationError('Translate the existing cancellation policy');
}
export function cleanTranslation(content: TranslationContent): TranslationContent { return { ...content, description: sanitizeRichText(content.description), cancellationPolicy: sanitizeRichText(content.cancellationPolicy) }; }
export function localizedPresentation(dto: Record<string, any>, source: Record<string, any>, locale: StorefrontLocale): Record<string, any> {
  const translations = Array.isArray(source.__translations) ? source.__translations : [];
  const localizedSlugs = Object.fromEntries(translations.filter((row: any) => ['de', 'ru'].includes(row.locale)).map((row: any) => [row.locale, row.slug]));
  const base = { ...dto, locale, resolvedLocale: 'en', translationStatus: locale === 'en' ? 'source' : 'missing', localizedSlugs };
  const selected = translations.find((row: any) => row.locale === locale);
  if (locale === 'en' || !selected) return base;
  const parsed = attractionTranslationContent.safeParse(selected.content); if (!parsed.success) return base;
  const content = cleanTranslation(parsed.data);
  try { validateTranslationSource(source, content); } catch { return base; }
  const output: Record<string, any> = { ...base, resolvedLocale: locale, translationStatus: 'translated', localizedSlug: selected.slug };
  for (const field of ['title', 'shortDescription', 'description', 'duration', 'highlights', 'inclusions', 'exclusions', 'participantRequirements', 'whatToBring', 'needToKnow', 'accessibility', 'cancellationPolicy', 'imageAltTexts'] as const) if (field in dto) output[field] = content[field];
  for (const field of ['pricingOptions', 'addons'] as const) if (Array.isArray(dto[field])) output[field] = dto[field].map((item: any) => { const translated = content[field].find(row => row.id === String(item.id)); return { ...item, ...(translated ? { name: translated.name, ...(translated.description === undefined ? {} : { description: translated.description }) } : {}), ...(field === 'pricingOptions' && item.timeSlots ? { timeSlots: item.timeSlots.map((slot: any) => ({ ...slot, label: content.pricingOptions.find(row => row.id === String(item.id))?.timeSlots?.find(row => row.id === String(slot.id))?.label || slot.label })) } : {}) }; });
  for (const field of ['entryWindows', 'itinerary', 'gettingThere'] as const) if (Array.isArray(dto[field])) output[field] = dto[field].map((item: any, index: number) => { const translated = content[field].find(row => row.index === index); if (!translated) return item; const { index: _index, ...labels } = translated; return { ...item, ...labels }; });
  if (dto.meetingPoint) output.meetingPoint = { ...dto.meetingPoint, instructions: content.meetingPoint.instructions };
  if (dto.seo) output.seo = { ...dto.seo, ...content.seo };
  return output;
}

export async function translatedSlugFilter(slug: string, tenantId: Types.ObjectId): Promise<Record<string, unknown> | null> {
  const translation = await AttractionTranslation.findOne({ tenantId, slug, status: 'published' }).select('attractionId sourceUpdatedAt').lean();
  return translation ? { _id: translation.attractionId, updatedAt: translation.sourceUpdatedAt } : null;
}
/** Compact identity for route decisions: all content was validated on publication,
 * and the join requires the current source version. No pricing data leaves here. */
export function localizationIdentity(source: Record<string, any>, locale: StorefrontLocale): Record<string, unknown> {
  const rows = (Array.isArray(source.__translations) ? source.__translations : []).filter((row: any) => attractionTranslationContent.safeParse(row.content).success);
  const selected = rows.find((row: any) => row.locale === locale);
  return { locale, resolvedLocale: selected && locale !== 'en' ? locale : 'en', translationStatus: locale === 'en' ? 'source' : selected ? 'translated' : 'missing', localizedSlugs: Object.fromEntries(rows.map((row: any) => [row.locale, row.slug])), ...(selected ? { localizedSlug: selected.slug } : {}) };
}
export function translationSourceTemplate(source: Record<string, any>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of ['title', 'shortDescription', 'description', 'duration', 'cancellationPolicy']) result[field] = source[field] || '';
  for (const field of ['highlights', 'inclusions', 'exclusions', 'participantRequirements', 'whatToBring', 'needToKnow', 'accessibility']) result[field] = source[field] || [];
  result.pricingOptions = (source.pricingOptions || []).map((item: any) => ({ id: String(item.id), name: item.name, description: item.description || '', timeSlots: (item.timeSlots || []).map((slot: any) => ({ id: String(slot.id), label: slot.label || '' })) }));
  result.addons = (source.addons || []).map((item: any) => ({ id: String(item.id), name: item.name, description: item.description || '' }));
  result.entryWindows = (source.entryWindows || []).map((item: any, index: number) => ({ index, label: item.label || '' }));
  result.itinerary = (source.itinerary || []).map((item: any, index: number) => ({ index, title: item.title || '', description: item.description || '', duration: item.duration || '' }));
  result.gettingThere = (source.gettingThere || []).map((item: any, index: number) => ({ index, mode: item.mode || '', description: item.description || '' }));
  result.meetingPoint = { instructions: source.meetingPoint?.instructions || '' };
  result.imageAltTexts = (source.images || []).map((url: string) => ({ url, alt: (source.imageAltTexts || []).find((item: any) => item.url === url)?.alt || source.title || '' }));
  result.seo = { metaTitle: source.seo?.metaTitle || source.title || '', metaDescription: source.seo?.metaDescription || source.shortDescription || '', keywords: source.seo?.keywords || [] };
  return result;
}
