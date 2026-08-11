import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types';
import { sanitizeRichText } from '../utils/sanitizeHtml';

const requirePageTenant = (req: AuthRequest, res: Response): Types.ObjectId | null => {
  if (!req.tenant?._id) {
    sendError(res, 'Select a site before managing pages', 400);
    return null;
  }
  if (req.user?.role !== 'super-admin' && !req.user?.assignedTenants?.some((id) => id.toString() === req.tenant?._id.toString())) {
    sendError(res, 'You do not manage this site', 403);
    return null;
  }
  return req.tenant._id;
};

export const listAdminPages = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = requirePageTenant(req, res); if (!tenantId) return;
    const tenant = await Tenant.findById(tenantId).select('customPages').lean();
    sendSuccess(res, tenant?.customPages || []);
  } catch (error) { next(error); }
};

export const createAdminPage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = requirePageTenant(req, res); if (!tenantId) return;
    const slug = String(req.body.slug).toLowerCase();
    const collision = await Promise.all([
      Tenant.exists({ _id: tenantId, 'customPages.slug': slug }),
      Attraction.exists({ tenantIds: tenantId, $or: [{ pathSlug: slug }, { slug }] }),
    ]);
    if (collision.some(Boolean)) { sendError(res, 'This URL is already used on the selected site', 409); return; }
    const page = { ...req.body, slug, body: sanitizeRichText(req.body.body), status: 'active' };
    const tenant = await Tenant.findByIdAndUpdate(tenantId, { $push: { customPages: page } }, { new: true, runValidators: true });
    sendSuccess(res, tenant?.customPages?.at(-1), 'Page created', 201);
  } catch (error) { next(error); }
};

export const updateAdminPage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = requirePageTenant(req, res); if (!tenantId) return;
    const pageId = req.params.id;
    const updates = { ...req.body, ...(req.body.body !== undefined ? { body: sanitizeRichText(req.body.body) } : {}) };
    const $set = Object.fromEntries(Object.entries(updates).map(([key, value]) => [`customPages.$.${key}`, value]));
    const tenant = await Tenant.findOneAndUpdate({ _id: tenantId, 'customPages._id': pageId }, { $set }, { new: true, runValidators: true });
    if (!tenant) { sendError(res, 'Page not found', 404); return; }
    sendSuccess(res, tenant.customPages?.find((page) => String((page as unknown as { _id: Types.ObjectId })._id) === pageId), 'Page updated');
  } catch (error) { next(error); }
};

export const archiveAdminPage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = requirePageTenant(req, res); if (!tenantId) return;
    const tenant = await Tenant.findOneAndUpdate(
      { _id: tenantId, 'customPages._id': req.params.id },
      { $set: { 'customPages.$.status': 'archived', 'customPages.$.archivedAt': new Date() }, $unset: { 'customPages.$.trashedAt': 1 } },
      { new: true }
    );
    if (!tenant) { sendError(res, 'Page not found', 404); return; }
    sendSuccess(res, null, 'Page archived');
  } catch (error) { next(error); }
};

export const trashAdminPage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = requirePageTenant(req, res); if (!tenantId) return;
    const tenant = await Tenant.findOneAndUpdate(
      { _id: tenantId, 'customPages._id': req.params.id },
      { $set: { 'customPages.$.status': 'archived', 'customPages.$.trashedAt': new Date() }, $unset: { 'customPages.$.archivedAt': 1 } },
      { new: true }
    );
    if (!tenant) { sendError(res, 'Page not found', 404); return; }
    sendSuccess(res, null, 'Page moved to trash');
  } catch (error) { next(error); }
};

export const restoreAdminPage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = requirePageTenant(req, res); if (!tenantId) return;
    const tenant = await Tenant.findOneAndUpdate(
      { _id: tenantId, customPages: { $elemMatch: { _id: req.params.id, status: 'archived', archivedAt: { $exists: false } } } },
      { $set: { 'customPages.$.status': 'active' }, $unset: { 'customPages.$.trashedAt': 1 } },
      { new: true }
    );
    if (!tenant) { sendError(res, 'Trashed page not found', 404); return; }
    sendSuccess(res, null, 'Page restored');
  } catch (error) { next(error); }
};

export const unarchiveAdminPage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = requirePageTenant(req, res); if (!tenantId) return;
    const tenant = await Tenant.findOneAndUpdate(
      { _id: tenantId, customPages: { $elemMatch: { _id: req.params.id, status: 'archived', archivedAt: { $exists: true } } } },
      { $set: { 'customPages.$.status': 'active' }, $unset: { 'customPages.$.archivedAt': 1 } },
      { new: true }
    );
    if (!tenant) { sendError(res, 'Archived page not found', 404); return; }
    sendSuccess(res, null, 'Page unarchived');
  } catch (error) { next(error); }
};

export const permanentlyDeleteAdminPage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = requirePageTenant(req, res); if (!tenantId) return;
    const tenant = await Tenant.findOneAndUpdate({ _id: tenantId, customPages: { $elemMatch: { _id: req.params.id, status: 'archived', archivedAt: { $exists: false } } } }, { $pull: { customPages: { _id: req.params.id } } }, { new: true });
    if (!tenant) { sendError(res, 'Archived page not found', 404); return; }
    sendSuccess(res, null, 'Page permanently deleted');
  } catch (error) { next(error); }
};

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
    const page = tenant?.customPages?.find((p) => p.slug === slug && p.status !== 'archived');
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
      ...(tenant.customPages || []).filter((p) => p.status !== 'archived').map((p) => ({
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
