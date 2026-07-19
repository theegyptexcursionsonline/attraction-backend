import { Router, Request, Response } from 'express';
import { BlogPost } from '../models/BlogPost';
import { authenticateContentEngine } from '../middleware/contentEngineAuth';
import { sendError } from '../utils/response';
import { env } from '../config';
import { sanitizeRichText, sanitizeTranslations } from '../utils/sanitizeHtml';

const router = Router();

function liveUrl(slug: string): string {
  const base = (env.frontendUrl || 'https://foxes-network.netlify.app').replace(/\/$/, '');
  return `${base}/blog/${slug}`;
}

function asStringArray(v: unknown, max = 12): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .slice(0, max);
}

function sanitizeFaqs(v: unknown): { question: string; answer: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((f) => {
      const o = (f ?? {}) as { question?: unknown; answer?: unknown };
      return {
        question: typeof o.question === 'string' ? o.question.trim() : '',
        answer: typeof o.answer === 'string' ? o.answer.trim() : '',
      };
    })
    .filter((f) => f.question.length > 0 && f.answer.length > 0)
    .slice(0, 10);
}

type IncomingPayload = {
  title?: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  featuredImage?: string;
  category?: string;
  tags?: unknown;
  author?: string;
  metaTitle?: string;
  metaDescription?: string;
  readTime?: number;
  status?: string;
  featured?: boolean;
  faqs?: unknown;
};

type IncomingBody = {
  tenantId?: string;
  payload?: IncomingPayload;
  translations?: Record<string, Record<string, unknown>>;
};

/**
 * POST /api/admin/content/blog — create or update a blog post (by tenant+slug).
 * Bridge for foxes-content-engine. Idempotent upsert.
 */
router.post('/blog', authenticateContentEngine, async (req: Request, res: Response) => {
  const body = (req.body || {}) as IncomingBody;
  const p = body.payload;
  if (!p) {
    sendError(res, 'payload is required', 400);
    return;
  }
  if (!p.title || p.title.length < 5) {
    sendError(res, 'title must be >= 5 chars', 400);
    return;
  }
  if (!p.slug || !/^[a-z0-9-]+$/.test(p.slug)) {
    sendError(res, 'slug must contain only lowercase letters, numbers, and hyphens', 400);
    return;
  }
  if (!p.excerpt || p.excerpt.length < 10) {
    sendError(res, 'excerpt must be >= 10 chars', 400);
    return;
  }
  if (!p.content || p.content.length < 50) {
    sendError(res, 'content must be >= 50 chars', 400);
    return;
  }

  const tenantId = body.tenantId || 'default';
  try {
    const saved = await BlogPost.findOneAndUpdate(
      { tenantId, slug: p.slug },
      {
        $set: {
          tenantId,
          slug: p.slug,
          title: p.title,
          excerpt: p.excerpt,
          content: sanitizeRichText(p.content),
          featuredImage: p.featuredImage,
          category: p.category,
          tags: asStringArray(p.tags),
          author: p.author?.trim() || 'Editorial Team',
          metaTitle: p.metaTitle,
          metaDescription: p.metaDescription,
          readTime: p.readTime,
          status: p.status === 'draft' ? 'draft' : 'published',
          featured: p.featured === true,
          translations: sanitizeTranslations(body.translations),
          faqs: sanitizeFaqs(p.faqs),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    // Flat shape — the content-engine's publishToAdapter expects { id, slug,
    // liveUrl } at the top level (matches the other receivers), not a wrapped
    // { success, data } envelope.
    res.status(201).json({ id: String(saved._id), slug: saved.slug, liveUrl: liveUrl(saved.slug) });
  } catch (err) {
    sendError(res, err instanceof Error ? err.message : 'Insert failed', 500);
  }
});

/**
 * GET /api/admin/content/blog/:slug — slug-uniqueness preflight for the engine
 * (404 = available, 200 = exists).
 */
router.get('/blog/:slug', authenticateContentEngine, async (req: Request, res: Response) => {
  const tenantId = typeof req.query.tenantId === 'string' && req.query.tenantId.trim()
    ? req.query.tenantId.trim()
    : 'default';
  const doc = await BlogPost.findOne({ tenantId, slug: req.params.slug })
    .select('slug title status updatedAt')
    .lean();
  if (!doc) {
    sendError(res, 'Not found', 404);
    return;
  }
  res.json({
    id: String((doc as { _id: unknown })._id),
    slug: doc.slug,
    title: doc.title,
    isPublished: doc.status === 'published',
    updatedAt: doc.updatedAt,
  });
});

export default router;
