import { Response, NextFunction } from 'express';
import { PromoCode } from '../models/PromoCode';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { escapeRegex } from '../utils/helpers';
import { isSuperAdmin, callerTenantIds } from '../utils/tenantScope';

// POST /promo-codes/validate (public)
export const validatePromoCode = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, subtotal } = req.body;

    const promo = await PromoCode.findOne({
      code: code.toUpperCase(),
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

    if (subtotal < promo.minOrderAmount) {
      sendError(res, `Minimum order amount is ${promo.minOrderAmount}`, 400);
      return;
    }

    let discount = 0;
    if (promo.discountType === 'percentage') {
      discount = Math.round(subtotal * (promo.discountValue / 100) * 100) / 100;
      if (promo.maxDiscount) {
        discount = Math.min(discount, promo.maxDiscount);
      }
    } else {
      discount = promo.discountValue;
    }

    sendSuccess(res, {
      valid: true,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      discount,
      maxDiscount: promo.maxDiscount,
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
    if (req.user && !isSuperAdmin(req.user)) {
      query.tenantId = { $in: callerTenantIds(req.user) };
    }

    if (status === 'active') query.isActive = true;
    else if (status === 'inactive') query.isActive = false;

    if (search) {
      query.code = { $regex: escapeRegex(search as string), $options: 'i' };
    }

    const [promoCodes, total] = await Promise.all([
      PromoCode.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      PromoCode.countDocuments(query),
    ]);

    sendPaginated(res, promoCodes, pageNum, limitNum, total);
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
    if (req.user && !isSuperAdmin(req.user)) {
      scope.tenantId = { $in: callerTenantIds(req.user) };
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
    if (req.user && !isSuperAdmin(req.user)) {
      const mine = callerTenantIds(req.user);
      if (!promo.tenantId || !mine.includes(String(promo.tenantId))) {
        sendError(res, 'Promo code not found', 404);
        return;
      }
    }
    sendSuccess(res, promo);
  } catch (error) {
    next(error);
  }
};

// POST /promo-codes (admin)
export const createPromoCode = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = { ...req.body, code: req.body.code.toUpperCase() };
    // A non-super admin's code is always owned by one of their tenants — never left
    // global, and never assignable to a tenant they don't manage.
    if (req.user && !isSuperAdmin(req.user)) {
      const mine = callerTenantIds(req.user);
      if (!mine.length) {
        sendError(res, 'You are not assigned to any tenant', 403);
        return;
      }
      const requested = body.tenantId ? String(body.tenantId) : '';
      body.tenantId = requested && mine.includes(requested) ? requested : mine[0];
    }
    const promo = await PromoCode.create(body);
    sendSuccess(res, promo, 'Promo code created', 201);
  } catch (error) {
    next(error);
  }
};

// PATCH /promo-codes/:id (admin)
export const updatePromoCode = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.body.code) {
      req.body.code = req.body.code.toUpperCase();
    }
    if (req.user && !isSuperAdmin(req.user)) {
      const mine = callerTenantIds(req.user);
      const existing = await PromoCode.findById(req.params.id).select('tenantId');
      if (!existing || !existing.tenantId || !mine.includes(String(existing.tenantId))) {
        sendError(res, 'Promo code not found', 404);
        return;
      }
      if (req.body.tenantId !== undefined && !mine.includes(String(req.body.tenantId))) {
        sendError(res, 'You can only assign your own tenants', 403);
        return;
      }
    }
    const promo = await PromoCode.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!promo) {
      sendError(res, 'Promo code not found', 404);
      return;
    }
    sendSuccess(res, promo, 'Promo code updated');
  } catch (error) {
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
    if (req.user && !isSuperAdmin(req.user)) {
      const mine = callerTenantIds(req.user);
      const existing = await PromoCode.findById(req.params.id).select('tenantId');
      if (!existing || !existing.tenantId || !mine.includes(String(existing.tenantId))) {
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
