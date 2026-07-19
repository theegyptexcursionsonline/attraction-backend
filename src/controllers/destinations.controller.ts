import { Response, NextFunction } from 'express';
import { Destination } from '../models/Destination';
import { Attraction } from '../models/Attraction';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { escapeRegex } from '../utils/helpers';

export const getDestinations = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page = 1, limit = 20, continent, search, includeCount = 'true' } = req.query;

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

    if (search) {
      const safeSearch = escapeRegex(search as string);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { country: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    // If scoped to tenant, only return destinations that have matching attractions
    if (scopedToTenant) {
      const destinationCities = await Attraction.distinct('destination.city', attractionFilter);
      query.name = { $in: destinationCities };
    }

    const [destinations, total] = await Promise.all([
      Destination.find(query)
        .sort({ sortOrder: 1, name: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Destination.countDocuments(query),
    ]);

    if (includeCount === 'true') {
      // Get attraction counts scoped to tenant
      const counts = await Attraction.aggregate([
        { $match: attractionFilter },
        { $group: { _id: '$destination.city', count: { $sum: 1 } } },
      ]);

      const countMap = new Map(counts.map((c) => [c._id, c.count]));

      const destinationsWithCount = destinations.map((dest) => ({
        ...dest,
        attractionCount: countMap.get(dest.name) || 0,
      }));

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

    const destination = await Destination.findOne({ slug, isActive: true }).lean();

    if (!destination) {
      sendError(res, 'Destination not found', 404);
      return;
    }

    const attractionScope: Record<string, unknown> = {
      'destination.city': destination.name,
      status: 'active',
    };
    if (req.tenant) attractionScope.tenantIds = { $in: [req.tenant._id] };

    // Get attraction count and stats
    const [attractionCount, ratingStats, priceStats] = await Promise.all([
      Attraction.countDocuments(attractionScope),
      Attraction.aggregate([
        { $match: attractionScope },
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
        {
          $group: {
            _id: null,
            minPrice: { $min: '$priceFrom' },
          },
        },
      ]),
    ]);

    // Get popular attractions
    if (req.tenant && attractionCount === 0) {
      sendError(res, 'Destination not found', 404);
      return;
    }

    const popularAttractions = await Attraction.find(attractionScope)
      .sort({ reviewCount: -1 })
      .limit(5)
      .select('title slug')
      .lean();

    sendSuccess(res, {
      ...destination,
      attractionCount,
      averageRating: ratingStats[0]?.averageRating || 0,
      reviewCount: ratingStats[0]?.totalReviews || 0,
      priceFrom: priceStats[0]?.minPrice || 0,
      popularAttractions: popularAttractions.map((a) => a.title),
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

    const attractionScope: Record<string, unknown> = { status: 'active' };
    if (req.tenant) attractionScope.tenantIds = { $in: [req.tenant._id] };
    const destinationNames = req.tenant
      ? await Attraction.distinct('destination.city', attractionScope)
      : undefined;
    const destinationQuery: Record<string, unknown> = { isActive: true };
    if (destinationNames) destinationQuery.name = { $in: destinationNames };

    const destinations = await Destination.find(destinationQuery)
      .sort({ sortOrder: 1 })
      .limit(parseInt(limit as string, 10))
      .lean();

    // Get attraction counts
    const counts = await Attraction.aggregate([
      { $match: attractionScope },
      { $group: { _id: '$destination.city', count: { $sum: 1 } } },
    ]);

    const countMap = new Map(counts.map((c) => [c._id, c.count]));

    const destinationsWithCount = destinations.map((dest) => ({
      ...dest,
      attractionCount: countMap.get(dest.name) || 0,
    }));

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
