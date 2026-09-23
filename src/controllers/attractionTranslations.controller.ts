import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Attraction } from '../models/Attraction';
import { AttractionTranslation } from '../models/AttractionTranslation';
import { Tenant } from '../models/Tenant';
import { AuthRequest } from '../types';
import { attractionTranslationContent, cleanTranslation, validateTranslationSource, translationSourceTemplate, TranslationError } from '../services/attractionLocalization.service';
const params = z.object({ tenantId: z.string().regex(/^[a-f\d]{24}$/i), attractionId: z.string().regex(/^[a-f\d]{24}$/i), locale: z.enum(['de', 'ru']) });
const input = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(1).max(180), content: attractionTranslationContent, sourceUpdatedAt: z.string().datetime(), expectedUpdatedAt: z.string().datetime().optional() }).strict();
async function scope(req: AuthRequest) {
  const parsed = params.safeParse(req.params); if (!parsed.success) throw new TranslationError('Invalid translation address');
  const { tenantId, attractionId, locale } = parsed.data;
  if (!req.user || (req.user.role !== 'super-admin' && !req.user.assignedTenants.some(id => String(id) === tenantId))) throw new TranslationError('Access denied to this site', 403);
  if ((req.query.tenantId && req.query.tenantId !== tenantId) || req.body?.tenantId || req.body?.attractionId || req.body?.locale) throw new TranslationError('Conflicting translation context');
  const tenant = await Tenant.exists({ _id: tenantId }); if (!tenant) throw new TranslationError('Site not found', 404);
  const source = await Attraction.findOne({ _id: attractionId, tenantIds: new Types.ObjectId(tenantId), archivedAt: { $exists: false }, trashedAt: { $exists: false } }).lean();
  if (!source) throw new TranslationError('Tour not found in this site', 404);
  if (!source.updatedAt) throw new TranslationError('The source tour has no publication version. Save it before translating.', 409);
  return { source, filter: { tenantId: new Types.ObjectId(tenantId), attractionId: new Types.ObjectId(attractionId), locale } };
}
function fail(error: any, next: NextFunction) { if (error?.code === 11000) next(new TranslationError('This translation or URL already exists. Reload before saving.', 409)); else next(error); }
export async function getAttractionTranslation(req: AuthRequest, res: Response, next: NextFunction) { try { const { source, filter } = await scope(req); const translation = await AttractionTranslation.findOne(filter).lean(); res.setHeader('Cache-Control', 'private, no-store'); res.json({ success: true, data: { source: { id: String(source._id), slug: source.slug, updatedAt: source.updatedAt, content: translationSourceTemplate(source) }, translation, stale: !!translation && translation.sourceUpdatedAt.getTime() !== source.updatedAt.getTime() } }); } catch(error) { fail(error, next); } }
export async function saveAttractionTranslation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { source, filter } = await scope(req); const parsed = input.safeParse(req.body); if (!parsed.success) throw new TranslationError(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).slice(0, 5).join('; '));
    const { expectedUpdatedAt, sourceUpdatedAt, slug } = parsed.data;
    if (source.updatedAt.toISOString() !== sourceUpdatedAt) throw new TranslationError('The source tour changed. Reload and translate the current text.', 409);
    const content = cleanTranslation(parsed.data.content); validateTranslationSource(source, content);
    const collision = await Attraction.exists({ tenantIds: filter.tenantId, _id: { $ne: filter.attractionId }, $or: [{ slug }, { pathSlug: slug }] });
    if (collision) throw new TranslationError('Another tour already uses this URL.', 409);
    let translation;
    if (expectedUpdatedAt) {
      translation = await AttractionTranslation.findOneAndUpdate({ ...filter, status: 'draft', updatedAt: new Date(expectedUpdatedAt) }, { $set: { slug, content, sourceUpdatedAt: new Date(sourceUpdatedAt), updatedAt: new Date(Math.max(Date.now(), Date.parse(expectedUpdatedAt) + 1)) } }, { new: true, runValidators: true, timestamps: false }).lean();
      if (!translation) throw new TranslationError('The translation changed or is published. Reload and unpublish before editing.', 409);
    } else translation = (await AttractionTranslation.create({ ...filter, slug, content, sourceUpdatedAt: new Date(sourceUpdatedAt), status: 'draft' })).toObject();
    res.status(expectedUpdatedAt ? 200 : 201).json({ success: true, data: translation });
  } catch(error) { fail(error, next); }
}
export async function transitionAttractionTranslation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { source, filter } = await scope(req); const parsed = z.object({ expectedUpdatedAt: z.string().datetime(), action: z.enum(['publish', 'unpublish']) }).strict().safeParse(req.body); if (!parsed.success) throw new TranslationError('Invalid publication request');
    const { expectedUpdatedAt, action } = parsed.data;
    const match = { ...filter, updatedAt: new Date(expectedUpdatedAt), status: action === 'publish' ? 'draft' : 'published' };
    const current = await AttractionTranslation.findOne(match).lean(); if (!current) throw new TranslationError('The translation changed. Reload before publishing.', 409);
    if (action === 'publish') { if (source.status !== 'active' || source.updatedAt.getTime() !== current.sourceUpdatedAt.getTime()) throw new TranslationError('The source tour changed or is not published. Refresh the translation first.', 409); const content = attractionTranslationContent.parse(current.content); validateTranslationSource(source, content); if (await Attraction.exists({ tenantIds: filter.tenantId, _id: { $ne: filter.attractionId }, $or: [{ slug: current.slug }, { pathSlug: current.slug }] })) throw new TranslationError('Another tour already uses this URL.', 409); }
    const translation = await AttractionTranslation.findOneAndUpdate(match, { $set: { status: action === 'publish' ? 'published' : 'draft', updatedAt: new Date(Math.max(Date.now(), Date.parse(expectedUpdatedAt) + 1)) } }, { new: true, timestamps: false }).lean();
    if (!translation) throw new TranslationError('The translation changed. Reload before publishing.', 409);
    res.json({ success: true, data: translation });
  } catch(error) { fail(error, next); }
}
