import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { AuthRequest } from '../types';
import { sendError, sendSuccess } from '../utils/response';
import { adminSiteSeo, seoRevisionOf, seoSettingsUpdateSchema, storedSiteSeo } from '../utils/seoSettings';

const SITE_ADMINS = ['super-admin', 'brand-admin'];
const SITE_FIELDS = 'slug name status customDomain flatUrls defaultLanguage supportedLanguages seoSettings seoSettingsRevision';

type SiteRecord = {
  slug?: string; name?: string; status?: string; customDomain?: string; flatUrls?: boolean;
  defaultLanguage?: string; supportedLanguages?: string[]; seoSettings?: unknown; seoSettingsRevision?: unknown;
};

/** Super admins reach any site; a brand admin only the sites assigned to them (in the query). */
function siteFilter(req: AuthRequest, id: string) {
  return req.user!.role === 'super-admin'
    ? { _id: id }
    : { _id: { $eq: id, $in: req.user!.assignedTenants || [] } };
}

/** What the SEO tab shows: the editable snapshot, its revision, and the site facts it needs. */
function editorView(site: SiteRecord) {
  return {
    seoSettings: adminSiteSeo(site.seoSettings),
    seoSettingsRevision: seoRevisionOf(site.seoSettingsRevision),
    site: {
      slug: site.slug || '',
      name: site.name || '',
      status: site.status || '',
      customDomain: site.customDomain || null,
      flatUrls: site.flatUrls === true,
      defaultLanguage: site.defaultLanguage || 'en',
      supportedLanguages: Array.isArray(site.supportedLanguages) ? site.supportedLanguages : [],
    },
  };
}

function guard(req: AuthRequest, res: Response): string | null {
  if (!req.user || !SITE_ADMINS.includes(req.user.role)) {
    sendError(res, 'Site administrator access required', req.user ? 403 : 401);
    return null;
  }
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) { sendError(res, 'Tenant not found', 404); return null; }
  return id;
}

/** GET /tenants/:id/seo-settings */
export const getTenantSeoSettings = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = guard(req, res);
    if (!id) return;
    const site = await Tenant.findOne(siteFilter(req, id)).select(SITE_FIELDS).lean<SiteRecord>();
    if (!site) { sendError(res, 'Tenant not found', 404); return; }
    sendSuccess(res, editorView(site));
  } catch (error) { next(error); }
};

/** PATCH /tenants/:id/seo-settings — replaces the whole snapshot when the revision still matches. */
export const updateTenantSeoSettings = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = guard(req, res);
    if (!id) return;
    const parsed = seoSettingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      sendError(res, `Invalid SEO settings: ${issue.path.join('.') || 'body'} — ${issue.message}`, 400);
      return;
    }
    const { expectedRevision, seoSettings } = parsed.data;
    const filter = siteFilter(req, id);
    const previous = await Tenant.findOne(filter).select('seoSettings.searchVisibility').lean<SiteRecord>();
    const site = await Tenant.findOneAndUpdate({
      ...filter,
      // Older sites carry no revision; that is the initial snapshot.
      seoSettingsRevision: expectedRevision === 0 ? { $in: [0, null] } : expectedRevision,
    }, {
      $set: { seoSettings: storedSiteSeo(seoSettings), seoSettingsRevision: expectedRevision + 1 },
    }, { new: true, runValidators: true, lean: true }).select(SITE_FIELDS);
    if (!site) {
      if (!previous) { sendError(res, 'Tenant not found', 404); return; }
      sendError(res, 'These SEO settings changed since you opened them. Reload and try again.', 409);
      return;
    }
    const before = adminSiteSeo(previous?.seoSettings).searchVisibility;
    console.info('[tenants] site SEO updated', {
      tenantId: String(site._id), actorId: String(req.user!._id), revision: expectedRevision + 1,
      searchVisibility: seoSettings.searchVisibility, visibilityChanged: before !== seoSettings.searchVisibility,
    });
    sendSuccess(res, editorView(site as SiteRecord), 'SEO settings saved');
  } catch (error) { next(error); }
};
