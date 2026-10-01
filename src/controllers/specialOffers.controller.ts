import { Response, NextFunction } from 'express';
import { SpecialOffer } from '../models/SpecialOffer';
import { Attraction } from '../models/Attraction';
import mongoose from 'mongoose';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { searchRegexValue } from '../utils/helpers';
import {
  isSuperAdmin,
  callerTenantIds,
  attractionIdsForTenants,
  ownedAttractionIdsForTenants,
  attractionOwnedByCallerTenants,
  isAttractionOwnedByTenants,
} from '../utils/tenantScope';
import {
  applicableOfferClause,
  normalizeCurrencyCode,
  offerAppliesToCurrency,
  OFFER_PRIORITY_SORT,
} from '../utils/discountCurrency';

const OFFER_MUTATION_ROLES = ['super-admin', 'brand-admin', 'manager'];

const canMutateOffers = (req: AuthRequest): boolean =>
  !!req.user && OFFER_MUTATION_ROLES.includes(req.user.role);

/**
 * A fixed amount is money in its tour's currency: the admin must state that
 * currency and the offer stores it. Percentage offers carry no currency.
 * Never converts (PLATFORM #1046).
 */
const fixedOfferCurrency = (
  requestedCurrency: unknown,
  tourCurrency: unknown
): { currency: string } | { error: string } => {
  const tour = normalizeCurrencyCode(tourCurrency);
  if (!tour) return { error: 'This tour has no valid currency, so it cannot take a fixed-amount offer. Use a percentage instead.' };
  const requested = normalizeCurrencyCode(requestedCurrency);
  if (!requested) return { error: `This tour is priced in ${tour}. Confirm the fixed amount is in ${tour}.` };
  if (requested !== tour) return { error: `This tour is priced in ${tour}, not ${requested}. Enter the fixed amount in ${tour}.` };
  return { currency: tour };
};

export const getActiveOffers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const now = new Date();
    const query: Record<string, unknown> = {
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      $expr: { $lt: ['$usageCount', '$usageLimit'] },
    };
    if (req.tenant) {
      query.attractionId = { $in: await attractionIdsForTenants([req.tenant._id.toString()]) };
    }
    const offers = await SpecialOffer.find(query)
      .populate('attractionId', 'title slug images priceFrom currency rating reviewCount destination category shortDescription badges')
      .sort(OFFER_PRIORITY_SORT)
      .lean();

    // Only offers checkout would apply: a fixed amount must be in its tour's
    // current currency, and an offer whose tour no longer exists is dropped.
    const applicable = offers.filter((offer) => {
      const tour = offer.attractionId as unknown as { currency?: string } | null;
      return !!tour && typeof tour === 'object' && offerAppliesToCurrency(offer, tour.currency);
    });

    sendSuccess(res, applicable);
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
    if (!/^[a-f0-9]{24}$/i.test(attractionId)) {
      sendError(res, 'Offer not found', 404);
      return;
    }

    const tour = await Attraction.findOne({
      _id: attractionId,
      ...(req.tenant ? { tenantIds: req.tenant._id } : {}),
    }).select('currency').lean();
    if (!tour) {
      if (req.tenant) {
        sendError(res, 'Offer not found', 404);
      } else {
        sendSuccess(res, null);
      }
      return;
    }

    // The same offer checkout applies (see bookingPricing.service).
    const offer = await SpecialOffer.findOne({
      attractionId,
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      $expr: { $lt: ['$usageCount', '$usageLimit'] },
      ...applicableOfferClause(tour.currency),
    })
      .sort(OFFER_PRIORITY_SORT)
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
      const attrIds = await ownedAttractionIdsForTenants(callerTenantIds(req.user));
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

    const safeSearch = searchRegexValue(search);
    if (safeSearch) {
      query.title = { $regex: new RegExp(safeSearch, 'i') };
    }

    const [offers, total] = await Promise.all([
      SpecialOffer.find(query)
        .populate('attractionId', 'title slug images currency')
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
      scope.attractionId = { $in: await ownedAttractionIdsForTenants(callerTenantIds(req.user)) };
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
    if (!canMutateOffers(req)) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }

    // A non-super admin may only create an offer for an attraction they own.
    if (req.user && !isSuperAdmin(req.user)) {
      const attractionId = req.body?.attractionId;
      if (
        !attractionId ||
        !(await attractionOwnedByCallerTenants(attractionId, callerTenantIds(req.user)))
      ) {
        sendError(res, 'You can only create offers for your own attractions', 403);
        return;
      }
    }
    const tour = await Attraction.findById(req.body.attractionId).select('currency').lean();
    if (!tour) {
      sendError(res, 'Tour not found', 404);
      return;
    }
    const { currency: requestedCurrency, ...fields } = req.body;
    let currency: string | undefined;
    if (fields.discountType === 'fixed') {
      const priced = fixedOfferCurrency(requestedCurrency, tour.currency);
      if ('error' in priced) {
        sendError(res, priced.error, 400);
        return;
      }
      currency = priced.currency;
    }
    const offer = await SpecialOffer.create({ ...fields, ...(currency ? { currency } : {}) });
    sendSuccess(res, offer, 'Special offer created', 201);
  } catch (error) {
    next(error);
  }
};

export const createOffersBulk = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!canMutateOffers(req)) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }
    const attractionIds = [...new Set<string>((req.body.attractionIds as string[]).map(String))];
    const attractions = await Attraction.find({ _id: { $in: attractionIds } })
      .select('_id ownerTenantId tenantIds currency')
      .lean();
    if (attractions.length !== attractionIds.length) {
      sendError(res, 'One or more selected tours were not found', 404);
      return;
    }
    if (req.user && !isSuperAdmin(req.user)) {
      const tenantIds = callerTenantIds(req.user);
      if (attractions.some((attraction) => !isAttractionOwnedByTenants(attraction, tenantIds))) {
        sendError(res, 'You can only create offers for tours owned by your sites', 403);
        return;
      }
    }

    const { attractionIds: _attractionIds, currency: requestedCurrency, ...offerFields } = req.body;
    // One fixed amount means one currency: every selected tour must be priced in it.
    let currency: string | undefined;
    if (offerFields.discountType === 'fixed') {
      const requested = normalizeCurrencyCode(requestedCurrency);
      const tourCurrencies = [...new Set(attractions.map((attraction) => normalizeCurrencyCode(attraction.currency) ?? 'no currency'))].sort();
      const outside = attractions.filter((attraction) => normalizeCurrencyCode(attraction.currency) !== requested).length;
      if (!requested || outside > 0) {
        sendError(
          res,
          tourCurrencies.length > 1
            ? `The selected tours are priced in ${tourCurrencies.join(', ')}. A fixed amount needs tours priced in one currency; select tours in one currency or use a percentage.`
            : `The selected tours are priced in ${tourCurrencies[0]}. Enter the fixed amount in ${tourCurrencies[0]}.`,
          400
        );
        return;
      }
      currency = requested;
    }
    const session = await mongoose.startSession();
    let created: unknown[] = [];
    try {
      await session.withTransaction(async () => {
        created = await SpecialOffer.insertMany(
          attractionIds.map((attractionId) => ({ ...offerFields, attractionId, ...(currency ? { currency } : {}) })),
          { session, ordered: true }
        );
      });
    } finally {
      await session.endSession();
    }
    sendSuccess(res, { createdCount: created.length, offers: created }, 'Special offer applied to selected tours', 201);
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
    if (!canMutateOffers(req)) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }

    const existing = await SpecialOffer.findById(req.params.id)
      .select('attractionId discountType discountValue currency validFrom validUntil')
      .lean();
    if (!existing) {
      sendError(res, 'Offer not found', 404);
      return;
    }

    // Ownership: a non-super admin may only touch offers on their own attractions
    // (both the existing offer's attraction and any new one they try to point it at).
    if (req.user && !isSuperAdmin(req.user)) {
      const mine = callerTenantIds(req.user);
      if (!(await attractionOwnedByCallerTenants(existing.attractionId, mine))) {
        sendError(res, 'Offer not found', 404);
        return;
      }
      if (
        req.body?.attractionId &&
        String(req.body.attractionId) !== String(existing.attractionId) &&
        !(await attractionOwnedByCallerTenants(req.body.attractionId, mine))
      ) {
        sendError(res, 'You can only assign your own attractions', 403);
        return;
      }
    }

    // Judge the offer as it will be saved; editors may send only changed fields.
    const { currency: requestedCurrency, ...set } = req.body as Record<string, unknown>;
    const merged = {
      attractionId: set.attractionId ?? existing.attractionId,
      discountType: (set.discountType ?? existing.discountType) as 'percentage' | 'fixed',
      discountValue: Number(set.discountValue ?? existing.discountValue),
      validFrom: (set.validFrom ?? existing.validFrom) as Date,
      validUntil: (set.validUntil ?? existing.validUntil) as Date,
    };
    if (merged.validUntil <= merged.validFrom) {
      sendError(res, 'Valid until must be after valid from', 400);
      return;
    }
    if (merged.discountType === 'percentage' && merged.discountValue > 100) {
      sendError(res, 'Percentage discount cannot exceed 100', 400);
      return;
    }

    const unset: Record<string, 1> = {};
    const touchesAmount = ['attractionId', 'discountType', 'discountValue'].some((field) => set[field] !== undefined)
      || requestedCurrency !== undefined;
    if (merged.discountType === 'fixed') {
      // Changing the amount, type or tour restates the currency. Pausing,
      // renaming or re-dating leaves it as it is (or absent on old offers,
      // which then stay unapplied until confirmed).
      if (touchesAmount) {
        const tour = await Attraction.findById(merged.attractionId).select('currency').lean();
        if (!tour) {
          sendError(res, 'Tour not found', 404);
          return;
        }
        const priced = fixedOfferCurrency(requestedCurrency, tour.currency);
        if ('error' in priced) {
          sendError(res, priced.error, 400);
          return;
        }
        set.currency = priced.currency;
      }
    } else if (existing.currency !== undefined && existing.currency !== null) {
      unset.currency = 1;
    }

    // Pinned to the tour whose ownership was checked above.
    const offer = await SpecialOffer.findOneAndUpdate(
      { _id: existing._id, attractionId: existing.attractionId },
      { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
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
    if (!canMutateOffers(req)) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }

    if (req.user && !isSuperAdmin(req.user)) {
      const existing = await SpecialOffer.findById(req.params.id).select('attractionId');
      if (
        !existing ||
        !(await attractionOwnedByCallerTenants(existing.attractionId, callerTenantIds(req.user)))
      ) {
        sendError(res, 'Offer not found', 404);
        return;
      }
    }

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
