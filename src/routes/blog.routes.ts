import { Router, Request, Response } from 'express';
import { BlogPost } from '../models/BlogPost';
import { sanitizeRichText, sanitizeTranslations } from '../utils/sanitizeHtml';

const router = Router();

/**
 * GET /api/blog?tenant=default&limit=24 — list published posts for a tenant.
 */
router.get('/', async (req: Request, res: Response) => {
  const tenant = (req.query.tenant as string) || 'default';
  const limit = Math.min(parseInt((req.query.limit as string) || '24', 10) || 24, 50);
  const posts = await BlogPost.find({ tenantId: tenant, status: 'published' })
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
  const post = await BlogPost.findOne({
    tenantId: tenant,
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
