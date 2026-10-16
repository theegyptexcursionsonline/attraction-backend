import { z } from 'zod';
import { publicCursorPlan } from '../utils/publicCursor';
import { escapeRegex } from '../utils/helpers';
import { Router, Request, Response } from 'express';
import { BlogPost } from '../models/BlogPost';
import { Tenant } from '../models/Tenant';
import { sanitizeRichText, sanitizeTranslations } from '../utils/sanitizeHtml';
import { ContentLocaleSchema } from '../utils/contentReceiverContract';
import { BLOG_LIST_TRANSLATIONS, blogSearchFields, localizeBlogListRow, localizeBlogPost } from '../utils/blogLocale';

const router = Router();

async function tenantBlogFilter(tenantSlug: string): Promise<Record<string, unknown> | null> {
  // Preserve the legacy shared-site namespace while joining every real tenant
  // slug to an active storefront before reading its content.
  if (tenantSlug === 'default') {
    return {
      tenantId: 'default',
      $or: [{ tenantRef: { $exists: false } }, { tenantRef: null }],
    };
  }
  const tenant = await Tenant.findOne({
    slug: tenantSlug,
    status: { $in: ['active', 'coming_soon'] },
  })
    .select('_id slug')
    .lean();
  if (!tenant) return null;
  return {
    tenantId: tenant.slug,
    $or: [{ tenantRef: tenant._id }, { tenantRef: { $exists: false } }],
  };
}

/**
 * GET /api/blog?tenant=default&limit=24[&locale=de] — list published posts for a tenant.
 * With a locale, each card is read in that language where the article has a complete
 * translation, and says which language it is in (`contentLocale`).
 */
router.get('/', async (req: Request, res: Response, next) => {
  try {
    const parsed = z.object({
      tenant: z.string().trim().min(1).max(160).default('default'),
      limit: z.coerce.number().int().min(1).max(50).default(24),
      pagination: z.literal('cursor').optional(),
      cursor: z.string().regex(/^[A-Za-z0-9_-]{1,2048}$/).optional(),
      search: z.string().trim().max(128).optional(),
      sort: z.enum(['newest', 'oldest']).default('newest'),
      locale: ContentLocaleSchema.optional(),
    }).safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ success: false, error: 'Invalid journal filters' }); return; }
    const { tenant, limit, pagination, cursor, search, sort, locale } = parsed.data;
    const tenantFilter = await tenantBlogFilter(tenant);
    if (!tenantFilter) {
      if (pagination === 'cursor') { res.status(404).json({ success: false, error: 'Tenant not found' }); return; }
      res.json({ success: true, data: [] }); return;
    }
    const query = { $and: [tenantFilter, { status: 'published' }, ...(search ? [{ $or: blogSearchFields(locale).map(field => ({ [field]: new RegExp(escapeRegex(search), 'i') })) }] : [])] };
    const projection = 'slug title excerpt featuredImage featuredImageAlt category tags author readTime publishedAt updatedAt tenantId status featured defaultLocale';
    const fields = { ...Object.fromEntries(projection.split(' ').map(field => [field, 1])), translations: BLOG_LIST_TRANSLATIONS };
    if (pagination === 'cursor') {
      const plan = publicCursorPlan(query, [{ field: 'publishedAt', direction: sort === 'oldest' ? 1 : -1, kind: 'date' }, { field: '_id', direction: sort === 'oldest' ? 1 : -1, kind: 'id' }], cursor);
      const [rows, total] = await Promise.all([
        BlogPost.aggregate([{ $match: query }, { $set: plan.normalized }, ...(plan.seek ? [{ $match: plan.seek }] : []), { $sort: plan.sort }, { $limit: limit + 1 }, { $project: { ...fields, _cursor0: 1, _cursor1: 1 } }]),
        BlogPost.countDocuments(query),
      ]);
      const result = plan.page(rows, limit, total);
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ success: true, data: result.rows.map(row => localizeBlogListRow(row, locale)), pagination: result.pagination }); return;
    }
    const posts = await BlogPost.aggregate([{ $match: query }, { $sort: { publishedAt: sort === 'oldest' ? 1 : -1, _id: -1 } }, { $limit: limit }, { $project: fields }]);
    res.json({ success: true, data: posts.map(row => localizeBlogListRow(row, locale)) });
  } catch (error) { next(error); }
});

/**
 * GET /api/blog/:slug?tenant=default[&locale=de] — single published post, in the requested
 * language when it has a complete translation (see `localizeBlogPost`).
 */
router.get('/:slug', async (req: Request, res: Response, next) => {
  try {
  const parsed = z.object({ tenant: z.string().trim().min(1).max(160).default('default'), locale: ContentLocaleSchema.optional() }).safeParse(req.query);
  if (!parsed.success || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(req.params.slug)) { res.status(400).json({ success: false, error: 'Invalid article address' }); return; }
  const tenant = parsed.data.tenant;
  const tenantFilter = await tenantBlogFilter(tenant);
  if (!tenantFilter) {
    res.status(404).json({ success: false, error: 'Not found' });
    return;
  }
  const post = await BlogPost.findOne({
    ...tenantFilter,
    slug: req.params.slug,
    status: 'published',
  }).lean();
  if (!post) {
    res.status(404).json({ success: false, error: 'Not found' });
    return;
  }
  const localized = localizeBlogPost(post as unknown as Record<string, unknown>, parsed.data.locale);
  res.json({
    success: true,
    data: {
      ...localized,
      content: sanitizeRichText(localized.content),
      translations: sanitizeTranslations(post.translations),
    },
  });
  } catch (error) { next(error); }
});

export default router;
