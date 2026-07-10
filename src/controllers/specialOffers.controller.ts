import { Response, NextFunction } from 'express';
import { SpecialOffer } from '../models/SpecialOffer';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import {
  isSuperAdmin,
  callerTenantIds,
  attractionIdsForTenants,
  attractionInCallerTenants,
} from '../utils/tenantScope';

export const getActiveOffers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const now = new Date();
    const offers = await SpecialOffer.find({
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      $expr: { $lt: ['$usageCount', '$usageLimit'] },
    })
      .populate('attractionId', 'title slug images priceFrom currency rating reviewCount destination category shortDescription badges')
      .sort({ discountValue: -1 })
      .lean();

    sendSuccess(res, offers);
  } catch (error) {
    next(error);
  }
};

export const getOfferForAttraction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { attractionId } = req.params;
    const now = new Date();

    const offer = await SpecialOffer.findOne({
      attractionId,
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      $expr: { $lt: ['$usageCount', '$usageLimit'] },
    })
      .sort({ discountValue: -1 })
      .lean();

    sendSuccess(res, offer);
  } catch (error) {
    next(error);
  }
};

export const getAllOffers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const query: Record<string, unknown> = {};
    const now = new Date();

    // Tenant scope: SpecialOffer has no tenant field, so a non-super admin only sees
    // offers for attractions in their own tenants.
    if (req.user && !isSuperAdmin(req.user)) {
      const attrIds = await attractionIdsForTenants(callerTenantIds(req.user));
      query.attractionId = { $in: attrIds };
    }

    if (status === 'active') {
      query.isActive = true;
      query.validFrom = { $lte: now };
      query.validUntil = { $gte: now };
    } else if (status === 'expired') {
      query.validUntil = { $lt: now };
    } else if (status === 'upcoming') {
      query.validFrom = { $gt: now };
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    if (search) {
      query.title = { $regex: new RegExp(search as string, 'i') };
    }

    const [offers, total] = await Promise.all([
      SpecialOffer.find(query)
        .populate('attractionId', 'title slug images')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      SpecialOffer.countDocuments(query),
    ]);

    sendPaginated(res, offers, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
};

export const getOfferStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const now = new Date();
    // Scope stats to the caller's own attractions for non-super admins.
    const scope: Record<string, unknown> = {};
    if (req.user && !isSuperAdmin(req.user)) {
      scope.attractionId = { $in: await attractionIdsForTenants(callerTenantIds(req.user)) };
    }
    const [total, active, totalRedemptions] = await Promise.all([
      SpecialOffer.countDocuments(scope),
      SpecialOffer.countDocuments({ ...scope, isActive: true, validFrom: { $lte: now }, validUntil: { $gte: now } }),
      SpecialOffer.aggregate([{ $match: scope }, { $group: { _id: null, total: { $sum: '$usageCount' } } }]),
    ]);

    sendSuccess(res, {
      total,
      active,
      totalRedemptions: totalRedemptions[0]?.total || 0,
    });
  } catch (error) {
    next(error);
  }
};

export const createOffer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // A non-super admin may only create an offer for an attraction they own.
    if (req.user && !isSuperAdmin(req.user)) {
      const attractionId = req.body?.attractionId;
      if (
        !attractionId ||
        !(await attractionInCallerTenants(attractionId, callerTenantIds(req.user)))
      ) {
        sendError(res, 'You can only create offers for your own attractions', 403);
        return;
      }
    }
    const offer = await SpecialOffer.create(req.body);
    sendSuccess(res, offer, 'Special offer created', 201);
  } catch (error) {
    next(error);
  }
};

export const updateOffer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Ownership: a non-super admin may only touch offers on their own attractions
    // (both the existing offer's attraction and any new one they try to point it at).
    if (req.user && !isSuperAdmin(req.user)) {
      const mine = callerTenantIds(req.user);
      const existing = await SpecialOffer.findById(req.params.id).select('attractionId');
      if (!existing || !(await attractionInCallerTenants(existing.attractionId, mine))) {
        sendError(res, 'Offer not found', 404);
        return;
      }
      if (
        req.body?.attractionId &&
        String(req.body.attractionId) !== String(existing.attractionId) &&
        !(await attractionInCallerTenants(req.body.attractionId, mine))
      ) {
        sendError(res, 'You can only assign your own attractions', 403);
        return;
      }
    }
    const offer = await SpecialOffer.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!offer) {
      sendError(res, 'Offer not found', 404);
      return;
    }
    sendSuccess(res, offer, 'Offer updated');
  } catch (error) {
    next(error);
  }
};

export const deleteOffer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const offer = await SpecialOffer.findByIdAndDelete(req.params.id);
    if (!offer) {
      sendError(res, 'Offer not found', 404);
      return;
    }
    sendSuccess(res, {}, 'Offer deleted');
  } catch (error) {
    next(error);
  }
};
