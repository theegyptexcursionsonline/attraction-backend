import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { AuthRequest } from '../types';
import { sendError } from '../utils/response';
import { normalizeListingTypeInput } from '../services/listingType.service';
import {
  AdminSection,
  SECTION_LABELS,
  effectiveSections,
  sectionForListingType,
} from '../utils/sectionAccess';

type SectionBrand = { _id: Types.ObjectId; enabledSections?: unknown };

/**
 * The brands whose switches decide the request: the brand the admin is working in when the
 * request names one of theirs (X-Tenant-ID or ?tenantId), otherwise every brand they are assigned.
 */
const brandsForRequest = async (req: AuthRequest): Promise<SectionBrand[]> => {
  const assigned = (req.user?.assignedTenants || []).map(String);
  if (assigned.length === 0) return [];
  const brands = await Tenant.find({ _id: { $in: assigned } }).select('slug enabledSections').lean<Array<SectionBrand & { slug?: string }>>();
  const header = req.headers['x-tenant-id'];
  const query = req.query?.tenantId;
  const named = req.tenant ? String(req.tenant._id) : typeof header === 'string' ? header.trim() : typeof query === 'string' ? query.trim() : '';
  if (named) {
    const current = brands.find((brand) => String(brand._id) === named || brand.slug === named);
    if (current) return [current];
  }
  return brands;
};

/** Sections an account may use across all of its assigned brands. */
export const accountSections = async (user: { role?: string; sectionAccess?: unknown; assignedTenants?: unknown[] }): Promise<AdminSection[]> => {
  if (user.role === 'super-admin') return effectiveSections(user, []);
  const brandIds = (user.assignedTenants || []).map((tenant) =>
    String(tenant && typeof tenant === 'object' && '_id' in tenant ? (tenant as { _id: unknown })._id : tenant));
  const brands = brandIds.length ? await Tenant.find({ _id: { $in: brandIds } }).select('enabledSections').lean() : [];
  return effectiveSections(user, brands);
};

/** Sections the signed-in admin may use in this request's brand context. */
export const requestSections = async (req: AuthRequest): Promise<AdminSection[]> => {
  if (!req.user) return [];
  if (req.user.role === 'super-admin') return effectiveSections(req.user, []);
  return effectiveSections(req.user, await brandsForRequest(req));
};

const refuse = (res: Response, missing: AdminSection): void => {
  sendError(res, `Your access does not include ${SECTION_LABELS[missing]}. Ask a super admin to switch it on.`, 403);
};

/**
 * Refuses the request unless the admin may use every section the resolver names. Super admins
 * always pass. Runs after `authenticate` and the role check.
 */
export const requireSections = (resolve: (req: AuthRequest) => Promise<AdminSection[]> | AdminSection[]) =>
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) { sendError(res, 'Authentication required', 401); return; }
      if (req.user.role === 'super-admin') { next(); return; }
      const needed = await resolve(req);
      if (needed.length === 0) { next(); return; }
      const allowed = await requestSections(req);
      const missing = needed.find((section) => !allowed.includes(section));
      if (missing) { refuse(res, missing); return; }
      next();
    } catch (error) {
      next(error);
    }
  };

export const requireSection = (section: AdminSection) => requireSections(() => [section]);

/**
 * Catalogue listings: the section follows the listing type. A create uses the requested type
 * (tour by default); a change to an existing listing needs the stored type's section, and the
 * requested type's section when the body names one. An unknown id passes through so the handler
 * answers 404 as before.
 */
export const requireListingSection = requireSections(async (req) => {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const requested = body.listingType !== undefined || body.productType !== undefined
    ? (() => { const copy = { ...body }; normalizeListingTypeInput(copy); return copy.listingType; })()
    : undefined;
  const id = req.params?.id;
  if (!id) return [sectionForListingType(requested)];
  if (!Types.ObjectId.isValid(id)) return requested !== undefined ? [sectionForListingType(requested)] : [];
  const stored = await Attraction.findById(id).select('listingType').lean<{ listingType?: string } | null>();
  const sections = new Set<AdminSection>();
  if (stored) sections.add(sectionForListingType(stored.listingType));
  if (requested !== undefined) sections.add(sectionForListingType(requested));
  return [...sections];
});
