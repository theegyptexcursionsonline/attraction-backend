import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types';
import { sanitizeRichText } from '../utils/sanitizeHtml';

/**
 * GET /api/page/resolve?slug=<slug>
 *
 * For flat-URL tenants (Safari Sahara et al.), the frontend's root catch-all
 * route hits this to resolve a slug. Returns the first match in this order:
 *   1. An active attraction owned by the active tenant whose slug == <slug>
 *   2. A custom page configured on the tenant (about-us, contact-us, terms, etc.)
 *   3. null (frontend then renders 404)
 *
 * Tenant context resolves through the standard X-Tenant-ID middleware. If no
 * tenant is in scope we return null — the catch-all only applies for tenants
 * that opt in via flatUrls=true, which the frontend already checks.
 */
export const resolvePage = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const slug = String(req.query.slug || '').toLowerCase().trim();
    if (!slug) {
      sendError(res, 'slug query param required', 400);
      return;
    }

    if (!req.tenant) {
      sendSuccess(res, { type: 'none' });
      return;
    }

    // 1. Try matching an attraction. flatUrls tenants use pathSlug for URLs
    // (so multiple tenants can own the same path without colliding on the
    // globally-unique slug index). Fall back to slug for compatibility.
    const attraction = await Attraction.findOne({
      $or: [{ pathSlug: slug }, { slug }],
      status: 'active',
      tenantIds: { $in: [req.tenant._id] },
    }).lean();

    if (attraction) {
      sendSuccess(res, { type: 'attraction', attraction });
      return;
    }

    // 2. Try matching a custom page on the tenant
    const tenant = await Tenant.findById(req.tenant._id).select('customPages name').lean();
    const page = tenant?.customPages?.find((p) => p.slug === slug);
    if (page) {
      sendSuccess(res, {
        type: 'page',
        page: { ...page, body: sanitizeRichText(page.body) },
      });
      return;
    }

    sendSuccess(res, { type: 'none' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/page/sitemap.xml
 *
 * Returns a tenant-scoped sitemap.xml. Includes the homepage, every active
 * attraction's URL (using the tenant's flat-URL convention if enabled), and
 * any custom pages. Cached at the CDN by URL, so each tenant gets its own
 * sitemap.xml when fetched via that tenant's domain or X-Tenant-ID header.
 */
export const tenantSitemap = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.tenant) {
      res.status(404).type('text/plain').send('Tenant context required for sitemap');
      return;
    }

    const tenant = await Tenant.findById(req.tenant._id)
      .select('customPages flatUrls customDomain domain slug')
      .lean();
    if (!tenant) {
      res.status(404).type('text/plain').send('Tenant not found');
      return;
    }

    const attractions = await Attraction.find({
      status: 'active',
      tenantIds: { $in: [tenant._id] },
    })
      .select('slug updatedAt')
      .lean();

    // Origin priority: customDomain > domain > host header > localhost.
    // The trailing slash is intentional — clients that compose URLs
    // sometimes double-slash otherwise.
    const origin =
      (tenant.customDomain && `https://${tenant.customDomain}`) ||
      (tenant.domain && `https://${tenant.domain}`) ||
      (req.headers.host ? `https://${req.headers.host}` : 'https://example.com');

    const flat = !!tenant.flatUrls;
    const today = new Date().toISOString().slice(0, 10);

    const urls: Array<{ loc: string; lastmod: string; priority: number }> = [
      { loc: `${origin}/`, lastmod: today, priority: 1.0 },
      ...attractions.map((a) => ({
        loc: `${origin}/${flat ? a.slug : `attractions/${a.slug}`}`,
        lastmod: (a.updatedAt as Date | undefined)?.toISOString().slice(0, 10) || today,
        priority: 0.8,
      })),
      ...(tenant.customPages || []).map((p) => ({
        loc: `${origin}/${p.slug}`,
        lastmod: today,
        priority: 0.5,
      })),
    ];

    const body =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls
        .map(
          (u) =>
            `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${u.priority.toFixed(1)}</priority>\n  </url>`
        )
        .join('\n') +
      '\n</urlset>\n';

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(body);
  } catch (error) {
    next(error);
  }
};
