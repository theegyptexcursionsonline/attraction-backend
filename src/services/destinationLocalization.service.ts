import { sourceSnapshotExpression, currentSourceExpression } from './localizationSourceSnapshot.service';
import { Types } from 'mongoose';
import { z } from 'zod';
import { DestinationTranslation } from '../models/DestinationTranslation';
import { escapeRegex } from '../utils/helpers';
import { sanitizeRichText } from '../utils/sanitizeHtml';
import { type StorefrontLocale, TranslationError } from './attractionLocalization.service';
const line = z.string().trim().max(2000);
export const destinationTranslationContent = z.object({ name: line.min(1), country: line.min(1), description: z.string().trim().max(50000), shortDescription: line, highlights: z.array(line).max(100), bestTimeToVisit: line.default(''), tags: z.array(line).max(100).default([]) }).strict();
export function cleanDestinationTranslation(input: z.infer<typeof destinationTranslationContent>) { return { ...input, description: sanitizeRichText(input.description) }; }
export function validateDestinationTranslation(source: Record<string, any>, content: z.infer<typeof destinationTranslationContent>) { for (const field of ['name','country','description','shortDescription','bestTimeToVisit'] as const) if (source[field]?.trim() && !content[field]?.trim()) throw new TranslationError(`Translate the existing ${field}`); for (const field of ['highlights','tags'] as const) { if ((source[field] || []).length !== content[field].length || (source[field] || []).some((text: string, index: number) => text.trim() && !content[field][index].trim())) throw new TranslationError(`Translate all ${field} without removing information`); } }
export function destinationLocalizationStages(tenantId: Types.ObjectId, locale: StorefrontLocale, search?: string, filterMissing = true): any[] { return [{ $lookup: { from: DestinationTranslation.collection.name, let: { source: '$_id', version: '$updatedAt', snapshot: sourceSnapshotExpression('destination') }, pipeline: [{ $match: { tenantId, status: 'published', $expr: { $and: [{ $eq: ['$destinationId','$$source'] }, currentSourceExpression('$$snapshot','$$version')] } } }], as: '__translations' } }, ...(locale !== 'en' && filterMissing ? [{ $match: { __translations: { $elemMatch: { locale, ...(search ? { $or: ['content.name','content.country','content.shortDescription'].map(field => ({ [field]: new RegExp(escapeRegex(search),'i') })) } : {}) } } } }] : !filterMissing && locale !== 'en' && search ? [{ $match: { $or: [{ __translations: { $elemMatch: { locale, $or: ['content.name','content.country','content.shortDescription'].map(field => ({ [field]: new RegExp(escapeRegex(search),'i') })) } } }, { $and: [{ __translations: { $not: { $elemMatch: { locale } } } }, { $or: ['name','country','shortDescription'].map(field => ({ [field]: new RegExp(escapeRegex(search),'i') })) }] }] } }] : [])]; }
export function localizedDestination(source: Record<string, any>, locale: StorefrontLocale): Record<string, any> {
  const { __translations = [], ...base } = source;
  const rows = (Array.isArray(__translations) ? __translations : []).filter((row: any) => {
    const parsed = destinationTranslationContent.safeParse(row.content);
    if (!parsed.success || !['ar', 'de', 'ru', 'fr'].includes(row.locale) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug || '')) return false;
    try { validateDestinationTranslation(source, cleanDestinationTranslation(parsed.data)); return true; } catch { return false; }
  });
  const translation = rows.find((row: any) => row.locale === locale);
  const result = { ...base, locale, resolvedLocale: 'en', translationStatus: locale === 'en' ? 'source' : 'missing', localizedSlugs: Object.fromEntries(rows.map((row: any) => [row.locale,row.slug])) };
  if (locale === 'en' || !translation) return result;
  const content = cleanDestinationTranslation(destinationTranslationContent.parse(translation.content));
  return { ...result, description: content.description, shortDescription: content.shortDescription, highlights: content.highlights, bestTimeToVisit: content.bestTimeToVisit, tags: content.tags, localizedName: content.name, localizedCountry: content.country, resolvedLocale: locale, translationStatus: 'translated', localizedSlug: translation.slug };
}
export async function destinationAliasFilters(slug: string, tenantId: Types.ObjectId): Promise<Record<string,unknown>[]> { const rows = await DestinationTranslation.aggregate([{ $match: { tenantId, slug, status: 'published' } }, { $group: { _id: '$destinationId', sourceUpdatedAt: { $first: '$sourceUpdatedAt' } } }, { $limit: 2 }]); return rows.map(row => ({ _id: row._id })); }
