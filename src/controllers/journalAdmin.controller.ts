import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../types';
import { BlogPost } from '../models/BlogPost';
import { Tenant } from '../models/Tenant';
import { sanitizeRichText } from '../utils/sanitizeHtml';
import { publicCursorPlan } from '../utils/publicCursor';
import { escapeRegex } from '../utils/helpers';

const id = /^[a-f\d]{24}$/i;
const fields = z.object({
  title: z.string().trim().min(1).max(200), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  excerpt: z.string().trim().max(600).default(''), content: z.string().max(100000).default(''),
  featuredImage: z.union([z.literal(''), z.string().url().refine(value => new URL(value).protocol === 'https:', 'Use an HTTPS image')]).default(''),
  featuredImageAlt: z.string().trim().max(250).default(''), author: z.string().trim().max(100).default('Editorial Team'),
  category: z.string().trim().max(80).default(''), tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  metaTitle: z.string().trim().max(70).default(''), metaDescription: z.string().trim().max(180).default(''),
  featured: z.boolean().default(false),
}).strict();
const update = fields.extend({ expectedUpdatedAt: z.string().datetime() });
const transition = z.object({ action: z.enum(['publish', 'unpublish', 'archive', 'restore']), expectedUpdatedAt: z.string().datetime(), publishedAt: z.string().datetime().optional() }).strict();
const fail = (res: Response, status: number, error: string) => { res.status(status).json({ success: false, error }); };
const scope = (req: AuthRequest) => ({ tenantId: req.tenant!.slug, $or: [{ tenantRef: req.tenant!._id }, { tenantRef: { $exists: false } }] });
const visible = (post: any) => ({ ...post, content: sanitizeRichText(post.content) });
const clean = (value: z.infer<typeof fields>) => ({ ...value, content: sanitizeRichText(value.content), readTime: Math.max(1, Math.ceil(sanitizeRichText(value.content).replace(/<[^>]*>/g, ' ').trim().split(/\s+/).length / 200)) });
function writeError(error: any, res: Response, next: NextFunction) { if (error?.code === 11000) fail(res, 409, 'Another article already uses this URL.'); else next(error); }

export async function journalScope(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const tenantId = req.params.tenantId;
    if (!id.test(tenantId) || (req.params.postId && !id.test(req.params.postId))) { fail(res, 400, 'Invalid journal address'); return; }
    if (!req.user || (req.user.role !== 'super-admin' && !req.user.assignedTenants.some(value => String(value) === tenantId))) { fail(res, 403, 'Access denied to this site'); return; }
    if ((req.query.tenantId && req.query.tenantId !== tenantId) || req.body?.tenantId || req.body?.tenantRef) { fail(res, 400, 'Conflicting site selection'); return; }
    const tenant = await Tenant.findById(tenantId).select('_id slug').lean();
    if (!tenant) { fail(res, 404, 'Site not found'); return; }
    req.tenant = tenant as unknown as AuthRequest['tenant']; res.setHeader('Cache-Control', 'private, no-store'); next();
  } catch (error) { next(error); }
}
export async function listJournal(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const parsed = z.object({ status: z.enum(['draft', 'published', 'archived']).default('draft'), search: z.string().trim().max(128).default(''), limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().max(2048).optional(), tenantId: z.string().optional() }).strict().safeParse(req.query);
    if (!parsed.success) { fail(res, 400, 'Invalid journal filters'); return; }
    const { status, search, limit, cursor } = parsed.data;
    const query = { ...scope(req), status, ...(search ? { title: new RegExp(escapeRegex(search), 'i') } : {}) };
    const plan = publicCursorPlan(query, [{ field: '_id', direction: -1, kind: 'id' }], cursor);
    const [rows, total] = await Promise.all([BlogPost.aggregate([{ $match: query }, { $set: plan.normalized }, ...(plan.seek ? [{ $match: plan.seek }] : []), { $sort: plan.sort }, { $limit: limit + 1 }, { $project: { title: 1, slug: 1, status: 1, updatedAt: 1, publishedAt: 1, _cursor0: 1 } }]), BlogPost.countDocuments(query)]);
    const page = plan.page(rows, limit, total); res.json({ success: true, data: { posts: page.rows, pagination: page.pagination } });
  } catch (error) { next(error); }
}
export async function getJournal(req: AuthRequest, res: Response, next: NextFunction) {
  try { const post = await BlogPost.findOne({ ...scope(req), _id: req.params.postId }).lean(); if (!post) { fail(res, 404, 'Article not found'); return; } res.json({ success: true, data: visible(post) }); } catch (error) { next(error); }
}
export async function createJournal(req: AuthRequest, res: Response, next: NextFunction) {
  const parsed = fields.safeParse(req.body); if (!parsed.success) { fail(res, 400, parsed.error.issues[0]?.message || 'Invalid article'); return; }
  try { const post = await BlogPost.create({ ...clean(parsed.data), tenantId: req.tenant!.slug, tenantRef: req.tenant!._id, status: 'draft' }); res.status(201).json({ success: true, data: visible(post.toObject()) }); } catch (error) { writeError(error, res, next); }
}
export async function updateJournal(req: AuthRequest, res: Response, next: NextFunction) {
  const parsed = update.safeParse(req.body); if (!parsed.success) { fail(res, 400, parsed.error.issues[0]?.message || 'Invalid article'); return; }
  const { expectedUpdatedAt, ...input } = parsed.data;
  try { const post = await BlogPost.findOneAndUpdate({ ...scope(req), _id: req.params.postId, status: 'draft', updatedAt: new Date(expectedUpdatedAt) }, { $set: { ...clean(input), updatedAt: new Date(Math.max(Date.now(), new Date(expectedUpdatedAt).getTime() + 1)) } }, { new: true, runValidators: true, timestamps: false }).lean(); if (!post) { fail(res, 409, 'The article changed or is not a draft. Reload before editing.'); return; } res.json({ success: true, data: visible(post) }); } catch (error) { writeError(error, res, next); }
}
export async function transitionJournal(req: AuthRequest, res: Response, next: NextFunction) {
  const parsed = transition.safeParse(req.body); if (!parsed.success) { fail(res, 400, 'Invalid publication request'); return; }
  try {
    const { action, expectedUpdatedAt, publishedAt } = parsed.data;
    const from = action === 'publish' ? 'draft' : action === 'unpublish' ? 'published' : action === 'restore' ? 'archived' : { $in: ['draft', 'published'] };
    const filter = { ...scope(req), _id: req.params.postId, status: from, updatedAt: new Date(expectedUpdatedAt) };
    const current = await BlogPost.findOne(filter).lean(); if (!current) { fail(res, 409, 'The article changed. Reload before changing its status.'); return; }
    const set: Record<string, unknown> = { updatedAt: new Date(Math.max(Date.now(), new Date(expectedUpdatedAt).getTime() + 1)), status: action === 'publish' ? 'published' : action === 'archive' ? 'archived' : 'draft' };
    if (action === 'publish') {
      if (!current.excerpt?.trim() || !sanitizeRichText(current.content).replace(/<[^>]*>/g, '').trim() || (current.featuredImage && !current.featuredImageAlt?.trim())) { fail(res, 400, 'Add an excerpt, article content and image description before publishing.'); return; }
      const date = publishedAt ? new Date(publishedAt) : current.publishedAt || new Date();
      if (date.getTime() > Date.now()) { fail(res, 400, 'Publication date cannot be in the future.'); return; }
      set.publishedAt = date;
    }
    const post = await BlogPost.findOneAndUpdate(filter, { $set: set }, { new: true, runValidators: true, timestamps: false }).lean();
    if (!post) { fail(res, 409, 'The article changed. Reload before changing its status.'); return; }
    res.json({ success: true, data: visible(post) });
  } catch (error) { next(error); }
}
