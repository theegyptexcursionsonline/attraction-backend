import { localizedSlugStages } from '../services/localizationSourceSnapshot.service';
import { requestedLocale, localizationStages, TranslationError, type StorefrontLocale } from '../services/attractionLocalization.service';
import { destinationLocalizationStages, localizedDestination, destinationAliasFilters } from '../services/destinationLocalization.service';
import { Types } from 'mongoose';
import { Response, NextFunction } from 'express';
import { Destination } from '../models/Destination';
import { Attraction } from '../models/Attraction';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { searchRegexValue } from '../utils/helpers';
import { tenantPickupDestinationSlugs } from '../utils/pickupDestinations';

type DestinationRow = { name: string; slug: string } & Record<string, unknown>;

const isStaffRequest = (req: AuthRequest): boolean => !!req.user && req.user.role !== 'customer';

/**
 * Attach tour counts for a site. Destinations with departures count their tours; a
 * destination the site only serves by hotel pickup counts its hotel-pickup tours and
 * is flagged so the storefront can say "Hotel pickup available" instead.
 */
async function withSiteCounts(
  destinations: DestinationRow[],
  attractionFilter: Record<string, unknown>,
  pickupSlugs: string[],
  localeContext?: { tenantId: Types.ObjectId; locale: StorefrontLocale },
): Promise<DestinationRow[]> {
  const counts = await Attraction.aggregate([
    { $match: attractionFilter },
    ...(localeContext ? localizationStages(localeContext.tenantId, localeContext.locale) : []),
    { $group: { _id: '$destination.city', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id, c.count]));
  const needsPickupCount = destinations.some((dest) => !countMap.get(dest.name) && pickupSlugs.includes(dest.slug));
  const pickupCount = needsPickupCount
    ? localeContext ? ((await Attraction.aggregate([{ $match: { ...attractionFilter, hasHotelPickup: true } }, ...localizationStages(localeContext.tenantId, localeContext.locale), { $count: 'total' }]))[0]?.total || 0) : await Attraction.countDocuments({ ...attractionFilter, hasHotelPickup: true })
    : 0;
  return destinations.map((dest) => {
    const ownCount = countMap.get(dest.name) || 0;
    if (!ownCount && pickupSlugs.includes(dest.slug)) {
      return { ...dest, attractionCount: pickupCount, servedByPickup: true };
    }
    return { ...dest, attractionCount: ownCount };
  });
}

export const getDestinations = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const locale = requestedLocale(req.query?.locale);
    const forEditor = req.query.forEditor === 'true';
    if (locale && (!req.tenant || forEditor || req.query.scope === 'admin')) throw new TranslationError('Select one public site for translated destinations');
    if (forEditor && (!req.user || !['super-admin', 'brand-admin', 'manager', 'editor', 'viewer'].includes(req.user.role))) {
      sendError(res, 'Staff access is required for editor options', req.user ? 403 : 401);
      return;
    }
    const { page = 1, limit = 20, continent, search, includeCount = 'true' } = req.query;
    const staffRequest = !locale && isStaffRequest(req);
    // Admin screens send scope=admin so an expired session is refused (and refreshed)
    // instead of quietly receiving the shorter public list.
    if (req.query.scope === 'admin' && !staffRequest) {
      sendError(res, 'Authentication required', 401);
      return;
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    // Build attraction filter for tenant scoping
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attractionFilter: Record<string, any> = { status: 'active' };
    let scopedToTenant = false;

    if (req.tenant) {
      attractionFilter.tenantIds = { $in: [req.tenant._id] };
      scopedToTenant = true;
    } else if (req.user && req.user.role !== 'super-admin') {
      const adminRoles = ['brand-admin', 'manager', 'editor', 'viewer'];
      if (adminRoles.includes(req.user.role) && req.user.assignedTenants?.length > 0) {
        attractionFilter.tenantIds = { $in: req.user.assignedTenants };
        scopedToTenant = true;
      } else if (adminRoles.includes(req.user.role)) {
        sendPaginated(res, [], pageNum, limitNum, 0);
        return;
      }
    }

    const query: Record<string, unknown> = { isActive: true };

    if (continent) {
      query.continent = continent;
    }

    const safeSearch = searchRegexValue(search);
    if (safeSearch && (!locale || locale === 'en')) {
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { country: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    // If scoped to tenant, only return destinations that have matching attractions
    // or that the site serves by hotel pickup. The public network-wide list likewise
    // shows only destinations with at least one active tour; staff lists stay complete.
    const pickupSlugs = req.tenant ? tenantPickupDestinationSlugs(req.tenant) : [];
    if (!scopedToTenant && !forEditor && !staffRequest) {
      query.name = { $in: await Attraction.distinct('destination.city', attractionFilter) };
    } else if (scopedToTenant && !forEditor) {
      const destinationCities = await Attraction.distinct('destination.city', attractionFilter);
      if (pickupSlugs.length > 0) {
        // $and keeps this apart from the search $or above.
        query.$and = [{ $or: [{ name: { $in: destinationCities } }, { slug: { $in: pickupSlugs } }] }];
      } else {
        query.name = { $in: destinationCities };
      }
    }

    if (locale && req.tenant) {
      const pipeline = [{ $match: query }, ...destinationLocalizationStages(req.tenant._id, locale, safeSearch || undefined)];
      const [rows, counts] = await Promise.all([Destination.aggregate([...pipeline, { $sort: { sortOrder: 1, name: 1, _id: 1 } }, { $skip: (pageNum - 1) * limitNum }, { $limit: limitNum }]), Destination.aggregate([...pipeline, { $count: 'total' }])]);
      const translated = rows.map(row => localizedDestination(row, locale)) as DestinationRow[];
      const result = includeCount === 'true' ? await withSiteCounts(translated, attractionFilter, pickupSlugs, { tenantId: req.tenant._id, locale }) : translated;
      res.setHeader('Cache-Control', 'private, no-store'); sendPaginated(res, result, pageNum, limitNum, counts[0]?.total || 0); return;
    }
    const [destinations, total] = await Promise.all([
      Destination.find(query)
        .sort({ sortOrder: 1, name: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Destination.countDocuments(query),
    ]);

    if (includeCount === 'true' && !forEditor) {
      const destinationsWithCount = await withSiteCounts(destinations as unknown as DestinationRow[], attractionFilter, pickupSlugs);
      sendPaginated(res, destinationsWithCount, pageNum, limitNum, total);
    } else {
      sendPaginated(res, destinations, pageNum, limitNum, total);
    }
  } catch (error) {
    next(error);
  }
};

export const getDestinationBySlug = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { slug } = req.params;
    const locale = requestedLocale(req.query?.locale);
    if (locale && !req.tenant) throw new TranslationError('Select one public site for translated destinations');
    const aliases = locale && req.tenant ? await destinationAliasFilters(slug, req.tenant._id) : [];
    const translatedRows = locale && req.tenant ? await Destination.aggregate([{ $match: { $or: [{ slug }, ...aliases], isActive: true } }, ...destinationLocalizationStages(req.tenant._id, locale, undefined, false), ...localizedSlugStages(slug,locale)]) : null;
    const destination = translatedRows ? translatedRows.length === 1 ? translatedRows[0] : null : await Destination.findOne({ slug, isActive: true }).lean();

    if (!destination) {
      sendError(res, 'Destination not found', 404);
      return;
    }

    let attractionScope: Record<string, unknown> = {
      'destination.city': destination.name,
      status: 'active',
    };
    if (req.tenant) attractionScope.tenantIds = { $in: [req.tenant._id] };

    // With no departures here but hotel pickup from here, the site's pickup tours stand in.
    let servedByPickup = false;
    if (req.tenant && tenantPickupDestinationSlugs(req.tenant).includes(destination.slug)) {
      const ownDepartures = await Attraction.countDocuments(attractionScope);
      if (ownDepartures === 0) {
        attractionScope = { status: 'active', tenantIds: { $in: [req.tenant._id] }, hasHotelPickup: true };
        servedByPickup = true;
      }
    }

    const ownedCount = locale ? await Attraction.countDocuments(attractionScope) : undefined;
    const localizedTourStages = locale && req.tenant ? localizationStages(req.tenant._id, locale) : [];
    // Get attraction count and stats
    const [attractionCount, ratingStats, priceStats] = await Promise.all([
      locale ? Attraction.aggregate([{ $match: attractionScope }, ...localizedTourStages, { $count: 'total' }]).then(rows => rows[0]?.total || 0) : Attraction.countDocuments(attractionScope),
      Attraction.aggregate([
        { $match: attractionScope },
        ...localizedTourStages,
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating' },
            totalReviews: { $sum: '$reviewCount' },
          },
        },
      ]),
      Attraction.aggregate([
        { $match: attractionScope },
        ...localizedTourStages,
        {
          $group: {
            _id: null,
            minPrice: { $min: '$priceFrom' },
          },
        },
      ]),
    ]);

    // Get popular attractions
    if (req.tenant && (ownedCount ?? attractionCount) === 0) {
      sendError(res, 'Destination not found', 404);
      return;
    }

    const popularAttractions = locale && req.tenant ? await Attraction.aggregate([{ $match: attractionScope }, ...localizedTourStages, { $sort: { reviewCount: -1, _id: 1 } }, { $limit: 5 }, { $project: { title: 1, __translations: 1 } }]) : await Attraction.find(attractionScope)
      .sort({ reviewCount: -1 })
      .limit(5)
      .select('title slug')
      .lean();

    sendSuccess(res, {
      ...(locale ? localizedDestination(destination, locale) : destination),
      ...(servedByPickup ? { servedByPickup: true } : {}),
      attractionCount,
      averageRating: ratingStats[0]?.averageRating || 0,
      reviewCount: ratingStats[0]?.totalReviews || 0,
      priceFrom: priceStats[0]?.minPrice || 0,
      popularAttractions: popularAttractions.map((a: any) => locale && locale !== 'en' ? a.__translations?.find((row: any) => row.locale === locale)?.content?.title || a.title : a.title),
    });
  } catch (error) {
    next(error);
  }
};

export const getFeaturedDestinations = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { limit = 6 } = req.query;
    const locale = requestedLocale(req.query?.locale);
    if (locale && !req.tenant) throw new TranslationError('Select one public site for translated destinations');

    const attractionScope: Record<string, unknown> = { status: 'active' };
    if (req.tenant) attractionScope.tenantIds = { $in: [req.tenant._id] };
    const pickupSlugs = req.tenant ? tenantPickupDestinationSlugs(req.tenant) : [];
    // A site's featured list, and the public network-wide list, only carry destinations
    // with active tours (plus the site's pickup areas); staff see every active destination.
    const destinationNames = req.tenant || !isStaffRequest(req)
      ? await Attraction.distinct('destination.city', attractionScope)
      : undefined;
    const destinationQuery: Record<string, unknown> = { isActive: true };
    if (destinationNames) {
      Object.assign(destinationQuery, pickupSlugs.length > 0
        ? { $or: [{ name: { $in: destinationNames } }, { slug: { $in: pickupSlugs } }] }
        : { name: { $in: destinationNames } });
    }

    if (locale && req.tenant) {
      const amount = Number(limit); if (!Number.isInteger(amount) || amount < 1 || amount > 50) throw new TranslationError('Select between 1 and 50 featured destinations');
      const rows = await Destination.aggregate([{ $match: destinationQuery }, ...destinationLocalizationStages(req.tenant._id, locale), { $sort: { sortOrder: 1, _id: 1 } }, { $limit: amount }]);
      const destinations = rows.map(row => localizedDestination(row, locale)) as DestinationRow[];
      res.setHeader('Cache-Control', 'private, no-store'); sendSuccess(res, await withSiteCounts(destinations, attractionScope, pickupSlugs, { tenantId: req.tenant._id, locale })); return;
    }
    const destinations = await Destination.find(destinationQuery)
      .sort({ sortOrder: 1 })
      .limit(parseInt(limit as string, 10))
      .lean();

    const destinationsWithCount = await withSiteCounts(destinations as unknown as DestinationRow[], attractionScope, pickupSlugs);

    sendSuccess(res, destinationsWithCount);
  } catch (error) {
    next(error);
  }
};

// Admin endpoints
export const createDestination = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const destination = await Destination.create(req.body);
    sendSuccess(res, destination, 'Destination created successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const updateDestination = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const destination = await Destination.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!destination) {
      sendError(res, 'Destination not found', 404);
      return;
    }

    sendSuccess(res, destination, 'Destination updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deleteDestination = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const destination = await Destination.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!destination) {
      sendError(res, 'Destination not found', 404);
      return;
    }

    sendSuccess(res, null, 'Destination deleted successfully');
  } catch (error) {
    next(error);
  }
};
