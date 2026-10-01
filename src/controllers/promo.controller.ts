import { Response, NextFunction } from 'express';
import { PromoCode } from '../models/PromoCode';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { searchRegexValue } from '../utils/helpers';
import { isSuperAdmin, callerTenantIds } from '../utils/tenantScope';
import {
  evaluatePromo,
  normalizeCurrencyCode,
  platformSaleCurrencies,
  promoCurrencyMessage,
  saleCurrenciesBySite,
  siteSaleCurrencies,
} from '../utils/discountCurrency';

const adminTenantScope = (req: AuthRequest): string[] | undefined => {
  if (req.tenant) return [req.tenant._id.toString()];
  return req.user && !isSuperAdmin(req.user) ? callerTenantIds(req.user) : undefined;
};

/**
 * The site a new code belongs to. A non-super admin's code is always owned by
 * one of their sites — never global, and never a site they don't manage; the
 * selected site wins, otherwise their first site. A super-admin's code belongs
 * to the selected site, else the requested one, else every site (global).
 */
type PromoSiteResolution = { tenantId: string | null } | { error: string; status: number };
const resolvePromoSite = (req: AuthRequest, requestedTenantId?: unknown): PromoSiteResolution => {
  if (req.user && !isSuperAdmin(req.user)) {
    const mine = callerTenantIds(req.user);
    if (!mine.length) return { error: 'You are not assigned to any tenant', status: 403 };
    const requested = req.tenant?._id?.toString() || (requestedTenantId ? String(requestedTenantId) : '');
    if (requested && !mine.includes(requested)) return { error: 'You can only assign your own tenants', status: 403 };
    return { tenantId: requested || mine[0] };
  }
  if (req.tenant) return { tenantId: req.tenant._id.toString() };
  return { tenantId: requestedTenantId ? String(requestedTenantId) : null };
};

const saleCurrenciesFor = (tenantId: string | null): Promise<string[]> =>
  tenantId ? siteSaleCurrencies(tenantId) : platformSaleCurrencies();

const currencyMismatchMessage = (allowed: string[], global: boolean): string => {
  if (!allowed.length) return 'This site has no currency to sell in yet. Set its currency before creating a code.';
  const list = allowed.join(', ');
  return global
    ? `Choose a currency the sites sell in (${list}).`
    : allowed.length === 1
      ? `This site sells in ${list}. Enter the code's amounts in ${list}.`
      : `This site sells in ${list}. Choose one of them for the code's amounts.`;
};

// POST /promo-codes/validate (public)
// A preview for the cart and checkout. The booking service applies the same
// rule (`evaluatePromo`) when the booking is made.
export const validatePromoCode = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, subtotal, attractionId } = req.body;
    if (
      typeof code !== 'string' || !code.trim() || code.trim().length > 80 ||
      typeof subtotal !== 'number' || !Number.isFinite(subtotal) || subtotal < 0 ||
      (attractionId !== undefined && (typeof attractionId !== 'string' || !/^[a-f0-9]{24}$/i.test(attractionId))) ||
      !req.tenant
    ) {
      sendError(res, 'Invalid promo validation request', 400);
      return;
    }

    // The tour being booked sets the currency. Callers that predate per-tour
    // checks are judged in the site's currency only when the site sells in just
    // one; otherwise the answer would be a guess, so they must name the tour.
    let tourCurrency: string | null;
    if (attractionId !== undefined) {
      const tour = await Attraction.findOne({
        _id: attractionId,
        tenantIds: req.tenant._id,
        status: 'active',
        enquiryOnly: { $ne: true },
      }).select('currency').lean();
      if (!tour) {
        sendError(res, 'This tour is not available on this site', 404);
        return;
      }
      tourCurrency = normalizeCurrencyCode(tour.currency);
    } else {
      const currencies = await siteSaleCurrencies(req.tenant._id);
      if (currencies.length !== 1) {
        sendError(res, 'Choose the tour this promo code is for', 400);
        return;
      }
      tourCurrency = currencies[0];
    }

    const promo = await PromoCode.findOne({
      code: code.trim().toUpperCase(),
      $or: [
        { tenantId: req.tenant._id },
        { tenantId: null },
        { tenantId: { $exists: false } },
      ],
      isActive: true,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() },
    });

    if (!promo) {
      sendError(res, 'Invalid or expired promo code', 404);
      return;
    }

    if (promo.usageCount >= promo.usageLimit) {
      sendError(res, 'Promo code usage limit reached', 400);
      return;
    }

    const evaluation = evaluatePromo(promo, { tourCurrency, subtotal });
    if (!evaluation.ok) {
      sendError(
        res,
        evaluation.reason === 'currency'
          ? promoCurrencyMessage(evaluation.promoCurrency)
          : `Minimum order amount is ${evaluation.currency} ${evaluation.minimum}`,
        400
      );
      return;
    }

    sendSuccess(res, {
      valid: true,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      currency: evaluation.currency,
      discount: evaluation.discount,
      maxDiscount: evaluation.maxDiscount,
      minOrderAmount: promo.minOrderAmount || 0,
      description: promo.description,
    }, 'Promo code is valid');
  } catch (error) {
    next(error);
  }
};

// GET /promo-codes (admin)
export const getPromoCodes = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: Record<string, any> = {};

    // Tenant scope: a non-super admin only sees promo codes owned by their tenants.
    const tenantScope = adminTenantScope(req);
    if (tenantScope) {
      query.tenantId = { $in: tenantScope };
    }

    if (status === 'active') query.isActive = true;
    else if (status === 'inactive') query.isActive = false;

    const safeSearch = searchRegexValue(search);
    if (safeSearch) {
      query.code = { $regex: safeSearch, $options: 'i' };
    }

    const [promoCodes, total] = await Promise.all([
      PromoCode.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      PromoCode.countDocuments(query),
    ]);

    // Each row says which currencies its site sells in, so the list can flag a
    // code written in a currency it can never be used in.
    const bySite = await saleCurrenciesBySite(promoCodes.map((promo) => promo.tenantId).filter(Boolean));
    const global = promoCodes.some((promo) => !promo.tenantId) ? await platformSaleCurrencies() : [];
    const rows = promoCodes.map((promo) => ({
      ...promo,
      siteCurrencies: promo.tenantId ? bySite.get(String(promo.tenantId)) || [] : global,
    }));

    sendPaginated(res, rows, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
};

// GET /promo-codes/currency-options (admin)
// Which site a new code will belong to and the currencies it may be written in.
export const getPromoCurrencyOptions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const site = resolvePromoSite(req);
    if ('error' in site) {
      sendError(res, site.error, site.status);
      return;
    }
    const tenant = site.tenantId
      ? await Tenant.findById(site.tenantId).select('name slug defaultCurrency').lean()
      : null;
    if (site.tenantId && !tenant) {
      sendError(res, 'Site not found', 404);
      return;
    }
    const currencies = await saleCurrenciesFor(site.tenantId);
    const preferred = tenant ? normalizeCurrencyCode(tenant.defaultCurrency) : 'USD';
    sendSuccess(res, {
      site: tenant ? { id: String(tenant._id), name: tenant.name, slug: tenant.slug } : null,
      currencies,
      defaultCurrency: preferred && currencies.includes(preferred) ? preferred : currencies[0] ?? null,
    });
  } catch (error) {
    next(error);
  }
};

// GET /promo-codes/stats (admin)
export const getPromoCodeStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scope: Record<string, any> = {};
    const tenantScope = adminTenantScope(req);
    if (tenantScope) {
      scope.tenantId = { $in: tenantScope };
    }
    const [total, active, usageAgg] = await Promise.all([
      PromoCode.countDocuments(scope),
      PromoCode.countDocuments({ ...scope, isActive: true }),
      PromoCode.aggregate([
        { $match: scope },
        { $group: { _id: null, totalUsage: { $sum: '$usageCount' } } },
      ]),
    ]);

    sendSuccess(res, {
      totalCodes: total,
      activeCodes: active,
      totalUsage: usageAgg[0]?.totalUsage || 0,
    });
  } catch (error) {
    next(error);
  }
};

// GET /promo-codes/:id (admin)
export const getPromoCodeById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const promo = await PromoCode.findById(req.params.id);
    if (!promo) {
      sendError(res, 'Promo code not found', 404);
      return;
    }
    const tenantScope = adminTenantScope(req);
    if (tenantScope && (!promo.tenantId || !tenantScope.includes(String(promo.tenantId)))) {
      sendError(res, 'Promo code not found', 404);
      return;
    }
    sendSuccess(res, promo);
  } catch (error) {
    next(error);
  }
};

const isDuplicateCode = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 11000);

// POST /promo-codes (admin) — body validated by createPromoCodeSchema
export const createPromoCode = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = { ...req.body };
    const site = resolvePromoSite(req, body.tenantId);
    if ('error' in site) {
      sendError(res, site.error, site.status);
      return;
    }
    if (site.tenantId && !(await Tenant.exists({ _id: site.tenantId }))) {
      sendError(res, 'Site not found', 404);
      return;
    }
    if (site.tenantId) body.tenantId = site.tenantId;
    else delete body.tenantId;

    // The code's amounts are written in its currency; it must be one the site
    // (or, for a code valid everywhere, some site) actually sells in.
    const allowed = await saleCurrenciesFor(site.tenantId);
    if (!allowed.includes(body.currency)) {
      sendError(res, currencyMismatchMessage(allowed, !site.tenantId), 400);
      return;
    }

    const promo = await PromoCode.create(body);
    sendSuccess(res, promo, 'Promo code created', 201);
  } catch (error) {
    if (isDuplicateCode(error)) {
      sendError(res, 'A promo code with this name already exists', 409);
      return;
    }
    next(error);
  }
};

// Fields whose meaning depends on the code's currency (or its site's).
const PROMO_MONEY_FIELDS = ['discountType', 'discountValue', 'minOrderAmount', 'maxDiscount', 'currency', 'tenantId'] as const;

// PATCH /promo-codes/:id (admin) — body validated by updatePromoCodeSchema
export const updatePromoCode = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const patch: Record<string, unknown> = { ...req.body };
    const tenantScope = adminTenantScope(req);
    const existing = await PromoCode.findById(req.params.id).lean();
    if (!existing || (tenantScope && (!existing.tenantId || !tenantScope.includes(String(existing.tenantId))))) {
      sendError(res, 'Promo code not found', 404);
      return;
    }
    if (tenantScope && patch.tenantId !== undefined && !tenantScope.includes(String(patch.tenantId))) {
      sendError(res, 'You can only assign your own tenants', 403);
      return;
    }
    if (patch.tenantId !== undefined && !(await Tenant.exists({ _id: patch.tenantId }))) {
      sendError(res, 'Site not found', 404);
      return;
    }

    // Judge the code as it will be saved, not only the fields in this edit.
    const merged = { ...existing, ...patch } as typeof existing & Record<string, unknown>;
    if (merged.validUntil <= merged.validFrom) {
      sendError(res, 'Valid until must be after valid from', 400);
      return;
    }
    if (merged.discountType === 'percentage' && merged.discountValue > 100) {
      sendError(res, 'Percentage discount cannot exceed 100', 400);
      return;
    }

    // An edit that changes an amount, the discount type, the currency or the
    // site must state the currency it was written in. Pausing, renaming or
    // re-dating a code never needs (or stamps) one.
    if (PROMO_MONEY_FIELDS.some((field) => patch[field] !== undefined)) {
      if (typeof patch.currency !== 'string') {
        sendError(res, "Confirm the currency of this code's amounts", 400);
        return;
      }
      const siteId = merged.tenantId ? String(merged.tenantId) : null;
      const allowed = await saleCurrenciesFor(siteId);
      if (!allowed.includes(patch.currency)) {
        sendError(res, currencyMismatchMessage(allowed, !siteId), 400);
        return;
      }
    }

    // A cap belongs to percentage codes only; `null` clears it.
    const unset: Record<string, 1> = {};
    if (patch.maxDiscount === null || merged.discountType === 'fixed') {
      delete patch.maxDiscount;
      if (existing.maxDiscount !== undefined && existing.maxDiscount !== null) unset.maxDiscount = 1;
    }

    const promo = await PromoCode.findOneAndUpdate(
      { _id: existing._id, ...(tenantScope ? { tenantId: { $in: tenantScope } } : {}) },
      { $set: patch, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { new: true, runValidators: true }
    );
    if (!promo) {
      sendError(res, 'Promo code not found', 404);
      return;
    }
    sendSuccess(res, promo, 'Promo code updated');
  } catch (error) {
    if (isDuplicateCode(error)) {
      sendError(res, 'A promo code with this name already exists', 409);
      return;
    }
    next(error);
  }
};

// DELETE /promo-codes/:id (admin)
export const deletePromoCode = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenantScope = adminTenantScope(req);
    if (tenantScope) {
      const existing = await PromoCode.findById(req.params.id).select('tenantId');
      if (!existing || !existing.tenantId || !tenantScope.includes(String(existing.tenantId))) {
        sendError(res, 'Promo code not found', 404);
        return;
      }
    }
    const promo = await PromoCode.findByIdAndDelete(req.params.id);
    if (!promo) {
      sendError(res, 'Promo code not found', 404);
      return;
    }
    sendSuccess(res, null, 'Promo code deleted');
  } catch (error) {
    next(error);
  }
};
