import { Router, Request, Response } from 'express';
import { BlogPost } from '../models/BlogPost';
import { Tenant } from '../models/Tenant';
import { sanitizeRichText, sanitizeTranslations } from '../utils/sanitizeHtml';

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
 * GET /api/blog?tenant=default&limit=24 — list published posts for a tenant.
 */
router.get('/', async (req: Request, res: Response) => {
  const tenant = (req.query.tenant as string) || 'default';
  const limit = Math.min(parseInt((req.query.limit as string) || '24', 10) || 24, 50);
  const tenantFilter = await tenantBlogFilter(tenant);
  if (!tenantFilter) {
    res.json({ success: true, data: [] });
    return;
  }
  const posts = await BlogPost.find({ ...tenantFilter, status: 'published' })
    .select('slug title excerpt featuredImage category tags author readTime publishedAt featured')
    .sort({ publishedAt: -1 })
    .limit(limit)
    .lean();
  res.json({ success: true, data: posts });
});

/**
 * GET /api/blog/:slug?tenant=default — single published post.
 */
router.get('/:slug', async (req: Request, res: Response) => {
  const tenant = (req.query.tenant as string) || 'default';
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
  res.json({
    success: true,
    data: {
      ...post,
      content: sanitizeRichText(post.content),
      translations: sanitizeTranslations(post.translations),
    },
  });
});

export default router;
