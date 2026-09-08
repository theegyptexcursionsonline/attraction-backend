import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { sanitizeRichText, sanitizePageSections } from '../utils/sanitizeHtml';
import { navigationSchema, PageSection } from '../utils/siteContent';
import { Category } from '../models/Category';
import { escapeRegex } from '../utils/helpers';

const requirePageTenant = (req: AuthRequest, res: Response): Types.ObjectId | null => {
  if (!req.tenant?._id) {
    sendError(res, 'Select a site before managing pages', 400);
    return null;
  }
  if (!req.user || !['super-admin', 'brand-admin', 'manager'].includes(req.user.role)) { sendError(res, 'You cannot manage website content', 403); return null; }
  if (req.user?.role !== 'super-admin' && !req.user?.assignedTenants?.some((id) => id.toString() === req.tenant?._id.toString())) {
    sendError(res, 'You do not manage this site', 403);
    return null;
  }
  return req.tenant._id;
};

const preparePageContent = async (tenantId: Types.ObjectId, value: Record<string, any>): Promise<string | null> => {
  if (value.sections !== undefined) {
    value.sections = sanitizePageSections(value.sections);
    for (const section of value.sections as PageSection[]) {
      if (section.type === 'tours') {
        if (section.attractionIds?.length) {
          const ids = [...new Set(section.attractionIds)];
          const count = await Attraction.countDocuments({ _id: { $in: ids }, tenantIds: tenantId, status: 'active' });
          if (count !== ids.length) return 'One or more selected tours are unavailable on this site';
        }
        if (section.categoryIds?.length) {
          const values = [...new Set(section.categoryIds)];
          const categories = await Category.find({ isActive: true, $or: [{ slug: { $in: values } }, { _id: { $in: values.filter(id => /^[a-f0-9]{24}$/i.test(id)) } }] }).select('_id slug').lean();
          const slugs = values.map(value => categories.find(category => category.slug === value || String(category._id) === value)?.slug);
          if (slugs.some(slug => !slug)) return 'One or more categories are unavailable';
          section.categoryIds = slugs as string[];
        }
      }
      if (section.type === 'pages' && section.pageIds.length) {
        const linked = await Tenant.findById(tenantId).select('customPages').lean();
        const available = new Set((linked?.customPages || []).filter(page => page.status !== 'archived' && page.isPublished !== false).map(page => String((page as unknown as { _id: unknown })._id)));
        if (section.pageIds.some(id => !available.has(id))) return 'One or more selected pages are unpublished or unavailable on this site';
      }
    }
  }
  if (value.isPublished !== false) {
    const hasText = (html: unknown) => sanitizeRichText(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0 || /<img\s/i.test(sanitizeRichText(html));
    const meaningfulSections = (value.sections as PageSection[] | undefined)?.some(section => section.type === 'content' ? hasText(section.body) : section.type === 'tours' || section.pageIds.length > 0);
    if (!hasText(value.body) && !meaningfulSections) return 'Add content or a listing before publishing this page';
  }
  return null;
};

export const listAdminPages = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = requirePageTenant(req, res); if (!tenantId) return;
    if (req.query.page !== undefined || req.query.limit !== undefined || req.query.search !== undefined || req.query.lifecycle !== undefined || req.query.published !== undefined) {
      const page = Number(req.query.page || 1), limit = Number(req.query.limit || 20);
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const result = await Tenant.aggregate([
        { $match: { _id: tenantId } }, { $unwind: '$customPages' },
        ...(req.query.lifecycle === 'active' ? [{ $match: { 'customPages.status': { $ne: 'archived' } } }] : []),
        ...(req.query.lifecycle === 'archive' ? [{ $match: { 'customPages.status': 'archived', 'customPages.archivedAt': { $exists: true } } }] : []),
        ...(req.query.lifecycle === 'trash' ? [{ $match: { 'customPages.status': 'archived', 'customPages.archivedAt': { $exists: false } } }] : []),
        ...(req.query.published === 'true' ? [{ $match: { 'customPages.isPublished': { $ne: false } } }] : []),
        ...(req.query.published === 'false' ? [{ $match: { 'customPages.isPublished': false } }] : []),
        ...(search ? [{ $match: { $or: [{ 'customPages.title': { $regex: escapeRegex(search), $options: 'i' } }, { 'customPages.slug': { $regex: escapeRegex(search), $options: 'i' } }] } }] : []),
        { $sort: { 'customPages.sortOrder': 1, 'customPages._id': 1 } },
        { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $replaceRoot: { newRoot: '$customPages' } }], total: [{ $count: 'count' }] } },
      ]);
      sendPaginated(res, (result[0]?.items || []).map((p: Record<string, unknown>) => ({ ...p, revision: p.revision ?? 0 })), page, limit, result[0]?.total?.[0]?.count || 0); return;
    }
    const tenant = await Tenant.findById(tenantId).select('customPages').lean();
    sendSuccess(res, (tenant?.customPages || []).map(page => ({ ...page, revision: page.revision ?? 0 })));
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
    const page = {
      ...req.body,
      slug,
      body: sanitizeRichText(req.body.body),
      isPublished: req.body.isPublished ?? true,
      status: 'active',
      revision: 0,
      ...(req.body.sections !== undefined ? { sections: sanitizePageSections(req.body.sections) } : {}),
    };
    const contentError = await preparePageContent(tenantId, page);
    if (contentError) { sendError(res, contentError, 400); return; }
    const tenant = await Tenant.findOneAndUpdate({ _id: tenantId, 'customPages.slug': { $ne: slug } }, { $push: { customPages: page } }, { new: true, runValidators: true });
    if (!tenant) { sendError(res, 'This URL is already used on the selected site', 409); return; }
    sendSuccess(res, tenant?.customPages?.at(-1), 'Page created', 201);
  } catch (error) { next(error); }
};

export const updateAdminPage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = requirePageTenant(req, res); if (!tenantId) return;
    const pageId = req.params.id;
    const { expectedRevision, ...body } = req.body;
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) { sendError(res, 'Reload the page before saving changes', 400); return; }
    const updates = { ...body, ...(body.body !== undefined ? { body: sanitizeRichText(body.body) } : {}), ...(body.sections !== undefined ? { sections: sanitizePageSections(body.sections) } : {}) };
    if (req.body.slug !== undefined) {
      const slug = String(req.body.slug).toLowerCase();
      const collision = await Promise.all([
        Tenant.exists({
          _id: tenantId,
          customPages: { $elemMatch: { slug, _id: { $ne: pageId } } },
        }),
        Attraction.exists({ tenantIds: tenantId, $or: [{ pathSlug: slug }, { slug }] }),
      ]);
      if (collision.some(Boolean)) {
        sendError(res, 'This URL is already used on the selected site', 409);
        return;
      }
      updates.slug = slug;
    }
    if (updates.body !== undefined || updates.sections !== undefined || updates.isPublished === true) {
      const current = await Tenant.findOne({ _id: tenantId, 'customPages._id': pageId }).select('customPages').lean();
      const stored = current?.customPages?.find(page => String((page as unknown as { _id: unknown })._id) === pageId);
      if (!stored) { sendError(res, 'Page not found', 404); return; }
      const candidate = { ...stored, ...updates };
      const contentError = await preparePageContent(tenantId, candidate);
      if (contentError) { sendError(res, contentError, 400); return; }
      if (updates.sections !== undefined) updates.sections = candidate.sections;
    }
    const $set = Object.fromEntries(Object.entries(updates).map(([key, value]) => [`customPages.$.${key}`, value]));
    const pageMatch: Record<string, unknown> = { _id: pageId };
    if (expectedRevision !== undefined) {
      if (expectedRevision === 0) pageMatch.$or = [{ revision: 0 }, { revision: { $exists: false } }];
      else pageMatch.revision = expectedRevision;
    }
    const filter: Record<string, unknown> = { _id: tenantId, customPages: { $elemMatch: pageMatch } };
    if (updates.slug !== undefined) filter.$nor = [{ customPages: { $elemMatch: { slug: updates.slug, _id: { $ne: pageId } } } }];
    const tenant = await Tenant.findOneAndUpdate(filter, { $set, $inc: { 'customPages.$.revision': 1 } }, { new: true, runValidators: true });
    if (!tenant) {
      const exists = await Tenant.exists({ _id: tenantId, 'customPages._id': pageId });
      sendError(res, exists ? 'This page changed. Reload before saving again.' : 'Page not found', exists ? 409 : 404); return;
    }
    sendSuccess(res, tenant.customPages?.find((page) => String((page as unknown as { _id: Types.ObjectId })._id) === pageId), 'Page updated');
  } catch (error) { next(error); }
};

export const archiveAdminPage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = requirePageTenant(req, res); if (!tenantId) return;
    const tenant = await Tenant.findOneAndUpdate(
      { _id: tenantId, 'customPages._id': req.params.id },
      { $inc: { 'customPages.$.revision': 1 }, $set: { 'customPages.$.status': 'archived', 'customPages.$.archivedAt': new Date() }, $unset: { 'customPages.$.trashedAt': 1 } },
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
      { $inc: { 'customPages.$.revision': 1 }, $set: { 'customPages.$.status': 'archived', 'customPages.$.trashedAt': new Date() }, $unset: { 'customPages.$.archivedAt': 1 } },
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
      { $inc: { 'customPages.$.revision': 1 }, $set: { 'customPages.$.status': 'active' }, $unset: { 'customPages.$.trashedAt': 1 } },
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
      { $inc: { 'customPages.$.revision': 1 }, $set: { 'customPages.$.status': 'active' }, $unset: { 'customPages.$.archivedAt': 1 } },
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
    const page = tenant?.customPages?.find(
      (p) => p.slug === slug && p.status !== 'archived' && p.isPublished !== false
    );
    if (page) {
      sendSuccess(res, {
        type: 'page',
        page: { ...page, body: sanitizeRichText(page.body), ...(page.sections !== undefined ? { sections: sanitizePageSections(page.sections) } : {}) },
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
      .select('slug pathSlug updatedAt')
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
        loc: `${origin}/${flat ? (a.pathSlug || a.slug) : `attractions/${a.slug}`}`,
        lastmod: (a.updatedAt as Date | undefined)?.toISOString().slice(0, 10) || today,
        priority: 0.8,
      })),
      ...(tenant.customPages || [])
        .filter((p) => p.status !== 'archived' && p.isPublished !== false)
        .map((p) => ({
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


export const getAdminMenu = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = requirePageTenant(req, res); if (!tenantId) return;
    const tenant = await Tenant.findById(tenantId).select('navigation navigationRevision').lean();
    if (!tenant) { sendError(res, 'Site not found', 404); return; }
    sendSuccess(res, { navigation: tenant.navigation || [], revision: tenant.navigationRevision ?? 0 });
  } catch (error) { next(error); }
};

export const updateAdminMenu = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = requirePageTenant(req, res); if (!tenantId) return;
    const revision = req.body.expectedRevision;
    if (!Number.isInteger(revision) || revision < 0) { sendError(res, 'Reload the menu before saving changes', 400); return; }
    const filter = { _id: tenantId, ...(revision === 0 ? { $or: [{ navigationRevision: 0 }, { navigationRevision: { $exists: false } }] } : { navigationRevision: revision }) };
    const tenant = await Tenant.findOneAndUpdate(filter, { $set: { navigation: navigationSchema.parse(req.body.navigation) }, $inc: { navigationRevision: 1 } }, { new: true, runValidators: true });
    if (!tenant) { sendError(res, 'The menu changed. Reload before saving again.', 409); return; }
    sendSuccess(res, { navigation: tenant.navigation || [], revision: tenant.navigationRevision ?? 0 });
  } catch (error) { next(error); }
};

export const getPageSection = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.tenant || !Types.ObjectId.isValid(req.params.pageId)) { sendError(res, 'Section not found', 404); return; }
    const tenant = await Tenant.findOne({ _id: req.tenant._id, customPages: { $elemMatch: { _id: req.params.pageId, status: { $ne: 'archived' }, isPublished: { $ne: false } } } }).select('customPages').lean();
    const page = tenant?.customPages?.find(p => String((p as unknown as { _id: unknown })._id) === req.params.pageId);
    const section = page?.sections?.find(s => s.id === req.params.sectionId);
    if (!section || section.type === 'content') { sendError(res, 'Section not found', 404); return; }
    if (section.type === 'pages') {
      const pages = new Map((tenant?.customPages || []).filter(p => p.status !== 'archived' && p.isPublished !== false).map(p => [String((p as unknown as { _id: unknown })._id), p]));
      const items = section.pageIds.flatMap(id => { const p = pages.get(id); return p ? [{ _id: id, slug: p.slug, title: p.title, metaDescription: p.metaDescription }] : []; });
      sendSuccess(res, { type: 'pages', items, nextCursor: null }); return;
    }
    const limit = Number(req.query.limit || 12);
    const query: Record<string, unknown> = { tenantIds: req.tenant._id, status: 'active' };
    if (section.categoryIds?.length) query.category = { $in: section.categoryIds };
    const publicFields = {
      _id: 1, slug: 1, pathSlug: 1, title: 1, shortDescription: 1, images: 1,
      category: 1, destination: 1, duration: 1, rating: 1, reviewCount: 1,
      priceFrom: 1, currency: 1, badges: 1,
    } as const;
    let results: Array<Record<string, unknown>>;

    if (section.attractionIds?.length) {
      const orderedIds = section.attractionIds.map(id => new Types.ObjectId(id));
      let remainingIds = orderedIds;
      if (req.query.cursor) {
        const cursor = String(req.query.cursor);
        const cursorIndex = section.attractionIds.findIndex(id => id === cursor);
        if (cursorIndex < 0) { sendError(res, 'Cursor does not belong to this section', 400); return; }
        remainingIds = orderedIds.slice(cursorIndex + 1);
      }
      if (!remainingIds.length) { sendSuccess(res, { type: 'tours', items: [], nextCursor: null }); return; }

      // Explicit selections are curated by the editor. Keep that order in the
      // public response while still applying tenant/status/category filters and
      // pagination inside MongoDB. Sorting by ObjectId silently rearranged a
      // saved landing page and made its final selected item unreachable after a
      // cursor crossed an earlier ObjectId.
      results = await Attraction.aggregate([
        { $match: { ...query, _id: { $in: remainingIds } } },
        { $addFields: { __selectionOrder: { $indexOfArray: [orderedIds, '$_id'] } } },
        { $sort: { __selectionOrder: 1 } },
        { $limit: limit + 1 },
        { $project: publicFields },
      ]);
    } else {
      if (req.query.cursor) query._id = { $gt: String(req.query.cursor) };
      results = await Attraction.find(query)
        .select(Object.keys(publicFields).join(' '))
        .sort({ _id: 1 })
        .limit(limit + 1)
        .lean();
    }
    const more = results.length > limit;
    const items = results.slice(0, limit);
    sendSuccess(res, { type: 'tours', items, nextCursor: more ? String(items[items.length - 1]._id) : null });
  } catch (error) { next(error); }
};
