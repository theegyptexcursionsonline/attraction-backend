import { Response, NextFunction } from 'express';
import { Attraction } from '../models/Attraction';
import { Booking } from '../models/Booking';
import { Review } from '../models/Review';
import { Availability } from '../models/Availability';
import { Tenant } from '../models/Tenant';
import { Category } from '../models/Category';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest, IAttraction } from '../types';
import { Types } from 'mongoose';
import { escapeRegex } from '../utils/helpers';
import {
  isSuperAdmin,
  callerTenantIds,
  attractionInCallerTenants,
  attractionOwnedByCallerTenants,
} from '../utils/tenantScope';
import { minimumTourPrice } from '../utils/attractionPricing';
import { BundleOrder } from '../models/BundleOrder';
import { runBundleTransaction } from '../services/bundleInventory.service';

const PUBLIC_ATTRACTION_FIELDS = [
  '_id',
  'slug',
  'pathSlug',
  'parentPage',
  'title',
  'shortDescription',
  'description',
  'images',
  'category',
  'subcategory',
  'destination',
  'duration',
  'languages',
  'rating',
  'reviewCount',
  'priceFrom',
  'currency',
  'pricingOptions',
  'addons',
  'entryWindows',
  'itinerary',
  'whatToBring',
  'accessibility',
  'gettingThere',
  'highlights',
  'inclusions',
  'exclusions',
  'meetingPoint',
  'cancellationPolicy',
  'instantConfirmation',
  'mobileTicket',
  'hasHotelPickup',
  'badges',
  'availability',
  'seo',
  'status',
  'featured',
  'sortOrder',
] as const;

export const PUBLIC_ATTRACTION_PROJECTION = PUBLIC_ATTRACTION_FIELDS.join(' ');

export const toPublicAttractionDto = (source: unknown): Record<string, unknown> => {
  if (!source || typeof source !== 'object') return {};
  const record = source as Record<string, unknown>;
  return Object.fromEntries(
    PUBLIC_ATTRACTION_FIELDS
      .filter((field) => record[field] !== undefined)
      .map((field) => [field, record[field]])
  );
};

export const toAdminAttractionDto = (
  source: unknown,
  allowedTenantIds?: string[]
): Record<string, unknown> => {
  const dto = toPublicAttractionDto(source);
  if (!source || typeof source !== 'object') return dto;
  const tenantIds = Array.isArray((source as Record<string, unknown>).tenantIds)
    ? ((source as Record<string, unknown>).tenantIds as unknown[]).map(String)
    : [];
  const allowed = allowedTenantIds ? new Set(allowedTenantIds) : null;
  return {
    ...dto,
    tenantIds: allowed ? tenantIds.filter((id) => allowed.has(id)) : tenantIds,
  };
};

/**
 * Guard for the stop-sale (blocked-date) handlers: a non-super admin may only
 * read/change availability for an attraction in one of their own tenants. Returns
 * true when the request should be rejected (and has already sent a 404).
 */
const rejectIfNotOwnedAttraction = async (
  req: AuthRequest,
  res: Response,
  attractionId: string
): Promise<boolean> => {
  if (!req.user || isSuperAdmin(req.user)) return false;
  const ok = await attractionInCallerTenants(attractionId, callerTenantIds(req.user));
  if (!ok) {
    sendError(res, 'Attraction not found', 404);
    return true;
  }
  return false;
};

const rejectIfNotCommercialOwner = async (
  req: AuthRequest,
  res: Response,
  attractionId: string
): Promise<boolean> => {
  if (!req.user || isSuperAdmin(req.user)) return false;
  const ok = await attractionOwnedByCallerTenants(
    attractionId,
    callerTenantIds(req.user)
  );
  if (!ok) {
    // Do not reveal whether a supplier-owned catalogue item exists to a reseller
    // that merely distributes it.
    sendError(res, 'Attraction not found', 404);
    return true;
  }
  return false;
};

const commercialOwnerMutationScope = (req: AuthRequest): Record<string, unknown> => {
  if (!req.user || isSuperAdmin(req.user)) return {};
  const tenantIds = callerTenantIds(req.user);
  return {
    $or: [
      { ownerTenantId: { $in: tenantIds } },
      { ownerTenantId: { $exists: false }, tenantIds: { $in: tenantIds } },
      { ownerTenantId: null, tenantIds: { $in: tenantIds } },
    ],
  };
};

interface AttractionQuery {
  status?: string;
  category?: string;
  'destination.city'?: { $regex: RegExp };
  priceFrom?: { $gte?: number; $lte?: number };
  rating?: { $gte: number };
  badges?: { $in: string[] };
  $text?: { $search: string };
  tenantIds?: { $in: Types.ObjectId[] } | { $size: number };
  archivedAt?: { $exists: boolean };
  trashedAt?: { $exists: boolean };
  $or?: Array<Record<string, unknown>>;
}

export const getAttractions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 20,
      sort = '-createdAt',
      category,
      destination,
      minPrice,
      maxPrice,
      rating,
      badges,
      search,
      status = 'active',
      lifecycle,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    // Build query
    const query: AttractionQuery = {};

    // Only show active attractions for public API
    if (!req.user || req.user.role === 'customer') {
      query.status = 'active';
      query.archivedAt = { $exists: false };
      query.trashedAt = { $exists: false };
    } else if (lifecycle === 'archive') {
      query.status = 'archived';
      query.archivedAt = { $exists: true };
      query.trashedAt = { $exists: false };
    } else if (lifecycle === 'trash') {
      query.status = 'archived';
      query.archivedAt = { $exists: false };
    } else if (status) {
      query.status = status as string;
      query.trashedAt = { $exists: false };
    }

    // Filter by tenant context
    if (req.tenant) {
      query.tenantIds = { $in: [req.tenant._id] };
    } else if (req.user && req.user.role !== 'super-admin') {
      // Non-super-admin without explicit tenant context: scope to assigned tenants
      const adminRoles = ['brand-admin', 'manager', 'editor', 'viewer'];
      if (adminRoles.includes(req.user.role) && req.user.assignedTenants?.length > 0) {
        query.tenantIds = { $in: req.user.assignedTenants };
      } else if (adminRoles.includes(req.user.role)) {
        // Admin with no assigned tenants sees nothing
        sendPaginated(res, [], pageNum, limitNum, 0);
        return;
      }
    }

    if (category) {
      query.category = category as string;
    }

    if (destination) {
      query['destination.city'] = { $regex: new RegExp(escapeRegex(destination as string), 'i') };
    }

    if (minPrice || maxPrice) {
      query.priceFrom = {};
      if (minPrice) query.priceFrom.$gte = parseFloat(minPrice as string);
      if (maxPrice) query.priceFrom.$lte = parseFloat(maxPrice as string);
    }

    if (rating) {
      query.rating = { $gte: parseFloat(rating as string) };
    }

    if (badges) {
      query.badges = { $in: (badges as string).split(',') };
    }

    if (search) {
      query.$text = { $search: search as string };
    }

    // Build sort
    let sortOption: Record<string, 1 | -1> = { createdAt: -1 };
    if (sort === 'price-low') sortOption = { priceFrom: 1 };
    else if (sort === 'price-high') sortOption = { priceFrom: -1 };
    else if (sort === 'rating') sortOption = { rating: -1 };
    else if (sort === 'popularity') sortOption = { reviewCount: -1 };
    else if (sort === 'recommended') sortOption = { featured: -1, rating: -1 };

    const isAdminRequest = !!req.user && req.user.role !== 'customer';
    const attractionsQuery = Attraction.find(query).select(
      isAdminRequest ? `${PUBLIC_ATTRACTION_PROJECTION} tenantIds` : PUBLIC_ATTRACTION_PROJECTION
    );

    // Execute query
    const [attractions, total] = await Promise.all([
      attractionsQuery
        .sort(sortOption)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Attraction.countDocuments(query),
    ]);

    // Private cache only: tenant-scoped payload — a shared/CDN cache serves one
    // tenant's catalog to another (2026-07-21 Netlify edge poisoning incident).
    res.setHeader('Cache-Control', 'private, max-age=60');

    sendPaginated(
      res,
      attractions.map((attraction) => {
        if (!isAdminRequest) return toPublicAttractionDto(attraction);
        const allowedTenantIds = req.user?.role === 'super-admin'
          ? undefined
          : (req.user?.assignedTenants || []).map(String);
        return toAdminAttractionDto(attraction, allowedTenantIds);
      }),
      pageNum,
      limitNum,
      total
    );
  } catch (error) {
    next(error);
  }
};

export const getAttractionBySlug = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { slug } = req.params;

    // Public single-attraction lookup. Accept an ObjectId as well as a slug so
    // callers that only hold the id (e.g. the booking-confirmation meeting-point
    // map, where the booking stores attractionId) can resolve it without the
    // authenticated admin endpoint. A 24-hex id is never a real slug, so this is
    // unambiguous.
    const query: Record<string, unknown> = Types.ObjectId.isValid(slug)
      ? { _id: slug, status: 'active' }
      : { $or: [{ pathSlug: slug }, { slug }], status: 'active' };
    if (req.tenant) query.tenantIds = { $in: [req.tenant._id] };

    const attraction = await Attraction.findOne(query)
      .select(PUBLIC_ATTRACTION_PROJECTION)
      .lean();

    if (!attraction) {
      sendError(res, 'Attraction not found', 404);
      return;
    }

    sendSuccess(res, toPublicAttractionDto(attraction));
  } catch (error) {
    next(error);
  }
};

export const getAttractionById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const attraction = await Attraction.findById(id);

    if (!attraction) {
      sendError(res, 'Attraction not found', 404);
      return;
    }

    // For non-super-admin users, verify they have access to this attraction's tenants
    if (req.user && req.user.role !== 'super-admin') {
      const userTenantIds = (req.user.assignedTenants || []).map((t) => t.toString());
      const attractionTenantIds = (attraction.tenantIds || []).map((t) => t.toString());
      const hasAccess = attractionTenantIds.some((tid) => userTenantIds.includes(tid));
      if (!hasAccess) {
        sendError(res, 'Access denied to this attraction', 403);
        return;
      }
    }

    sendSuccess(res, attraction);
  } catch (error) {
    next(error);
  }
};

export const getAttractionReviews = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    if (
      req.tenant &&
      !(await Attraction.exists({ _id: id, tenantIds: { $in: [req.tenant._id] }, status: 'active' }))
    ) {
      sendError(res, 'Attraction not found', 404);
      return;
    }

    const [reviews, total] = await Promise.all([
      Review.find({ attractionId: id, status: 'approved' })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Review.countDocuments({ attractionId: id, status: 'approved' }),
    ]);

    // Calculate rating breakdown
    const ratingBreakdown = await Review.aggregate([
      { $match: { attractionId: new Types.ObjectId(id), status: 'approved' } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]);

    const breakdown: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    ratingBreakdown.forEach((r) => {
      breakdown[r._id as number] = r.count;
    });

    sendSuccess(res, { reviews, ratingBreakdown: breakdown, pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
};

export const getAttractionAvailability = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { date, month } = req.query;

    const attractionQuery: Record<string, unknown> = { _id: id, status: 'active' };
    if (req.tenant) attractionQuery.tenantIds = { $in: [req.tenant._id] };

    const attraction = await Attraction.findOne(attractionQuery);

    if (!attraction) {
      sendError(res, 'Attraction not found', 404);
      return;
    }

    // Calculate date range
    const startDate = date ? new Date(date as string) : new Date();
    startDate.setHours(0, 0, 0, 0);

    let endDate: Date;
    if (month) {
      const monthDate = new Date(month as string);
      endDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    } else {
      endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
    endDate.setHours(23, 59, 59, 999);

    // Query real availability from database (include blocked dates)
    const availabilityRecords = await Availability.find({
      attractionId: id,
      date: { $gte: startDate, $lte: endDate },
    }).sort({ date: 1 }).lean();

    // Build a map of existing availability
    const availMap = new Map<string, typeof availabilityRecords[0]>();
    for (const record of availabilityRecords) {
      const dateStr = new Date(record.date).toISOString().split('T')[0];
      availMap.set(dateStr, record);
    }

    // Generate response for each day in range
    const availability: Array<{
      date: string;
      available: boolean;
      timeSlots?: Array<{ time: string; available: boolean; spotsLeft: number }>;
    }> = [];

    const defaultCapacity = 25; // Default capacity when no availability record exists
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const record = availMap.get(dateStr);

      if (record) {
        // Blocked date — return as unavailable
        if (record.isBlocked) {
          availability.push({ date: dateStr, available: false, blocked: true } as { date: string; available: boolean; blocked?: boolean });
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // Use real data from database
        if (record.timeSlots && record.timeSlots.length > 0) {
          availability.push({
            date: dateStr,
            available: record.timeSlots.some((s) => s.capacity - s.booked > 0),
            timeSlots: record.timeSlots.map((s) => ({
              time: s.time,
              available: s.capacity - s.booked > 0,
              spotsLeft: Math.max(0, s.capacity - s.booked),
            })),
          });
        } else {
          const spotsLeft = (record.allDayCapacity || defaultCapacity) - (record.allDayBooked || 0);
          availability.push({
            date: dateStr,
            available: spotsLeft > 0,
          });
        }
      } else {
        // No record — generate default availability
        if (attraction.availability?.type === 'time-slots') {
          availability.push({
            date: dateStr,
            available: true,
            timeSlots: [
              { time: '09:00', available: true, spotsLeft: defaultCapacity },
              { time: '10:00', available: true, spotsLeft: defaultCapacity },
              { time: '11:00', available: true, spotsLeft: defaultCapacity },
              { time: '14:00', available: true, spotsLeft: defaultCapacity },
              { time: '15:00', available: true, spotsLeft: defaultCapacity },
              { time: '16:00', available: true, spotsLeft: defaultCapacity },
            ],
          });
        } else {
          availability.push({
            date: dateStr,
            available: true,
          });
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    sendSuccess(res, { availability });
  } catch (error) {
    next(error);
  }
};

// Admin endpoints
// Validates that every pricing option's residentPrice, when present, does not exceed its price.
// Resident pricing is meant to be a discount, not a surcharge.
const validatePricingOptions = (pricingOptions: unknown): string | null => {
  if (!Array.isArray(pricingOptions)) return null;
  for (const option of pricingOptions) {
    const opt = option as { id?: string; name?: string; price?: number; residentPrice?: number };
    if (typeof opt.residentPrice === 'number' && typeof opt.price === 'number' && opt.residentPrice > opt.price) {
      return `Resident price (${opt.residentPrice}) cannot exceed regular price (${opt.price}) for option "${opt.name || opt.id}"`;
    }
  }
  return null;
};

const validateReseller = (reseller: unknown): string | null => {
  if (!reseller || typeof reseller !== 'object') return null;
  const r = reseller as { enabled?: boolean; value?: number };
  if (!r.enabled) return null;
  // Commission-only model: the value is a % of the total the customer pays.
  if (typeof r.value !== 'number' || Number.isNaN(r.value) || r.value < 0) {
    return 'Commission must be a positive number';
  }
  if (r.value > 100) {
    return 'Commission cannot exceed 100%';
  }
  return null;
};

const normalizeCategoryValue = async (value: string): Promise<string | null> => {
  if (!Types.ObjectId.isValid(value)) return value;
  const category = await Category.findById(value).select('slug isActive').lean();
  return category?.isActive ? category.slug : null;
};

export const createAttraction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Delegated admins must always create inside at least one explicitly assigned
    // tenant. An empty tenant list would create a globally visible orphan record.
    if (req.user?.role !== 'super-admin' && !req.body.tenantIds?.length) {
      sendError(res, 'Select at least one assigned site for this attraction', 400);
      return;
    }

    // Non-super-admins can only assign attractions to their own tenants.
    if (req.user?.role !== 'super-admin') {
      const assignedSet = new Set((req.user?.assignedTenants || []).map((t: Types.ObjectId) => t.toString()));
      const unauthorized = req.body.tenantIds.filter((id: string) => !assignedSet.has(id));
      if (unauthorized.length > 0) {
        sendError(res, 'Cannot assign attraction to a tenant you do not manage', 403);
        return;
      }
    }

    const pricingError = validatePricingOptions(req.body.pricingOptions);
    if (pricingError) {
      sendError(res, pricingError, 400);
      return;
    }

    const resellerError = validateReseller(req.body.reseller);
    if (resellerError) {
      sendError(res, resellerError, 400);
      return;
    }

    const normalizedCategory = await normalizeCategoryValue(req.body.category);
    if (!normalizedCategory) {
      sendError(res, 'Select a valid active category', 400);
      return;
    }

    if (req.body.pathSlug && await Attraction.exists({
      pathSlug: req.body.pathSlug,
      tenantIds: { $in: req.body.tenantIds },
    })) {
      sendError(res, 'This public URL is already used on one of the selected sites', 409);
      return;
    }

    const attractionData = {
      ...req.body,
      category: normalizedCategory,
      priceFrom: Array.isArray(req.body.pricingOptions) && req.body.pricingOptions.length > 0
        ? minimumTourPrice(req.body.pricingOptions)
        : req.body.priceFrom,
      // Default the supplier (owner) to the first assigned tenant.
      ownerTenantId: req.body.ownerTenantId || req.body.tenantIds?.[0],
      createdBy: req.user?._id,
    };

    const attraction = await Attraction.create(attractionData);

    sendSuccess(res, attraction, 'Attraction created successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const updateAttraction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Non-super-admins can only update attractions in their assigned tenants
    if (req.user?.role !== 'super-admin') {
      const existing = await Attraction.findById(id);
      if (!existing) {
        sendError(res, 'Attraction not found', 404);
        return;
      }
      const assignedSet = new Set((req.user?.assignedTenants || []).map((t: Types.ObjectId) => t.toString()));
      const hasAccess = existing.tenantIds?.some((tid: Types.ObjectId) => assignedSet.has(tid.toString()));
      if (!hasAccess) {
        sendError(res, 'Access denied to this attraction', 403);
        return;
      }

      if (Array.isArray(req.body.tenantIds)) {
        const unauthorizedTenant = req.body.tenantIds.some(
          (tenantId: string) => !assignedSet.has(tenantId)
        );
        if (unauthorizedTenant) {
          sendError(res, 'Cannot assign attraction to a tenant you do not manage', 403);
          return;
        }
      }
    }

    const pricingError = validatePricingOptions(req.body.pricingOptions);
    if (pricingError) {
      sendError(res, pricingError, 400);
      return;
    }

    const resellerError = validateReseller(req.body.reseller);
    if (resellerError) {
      sendError(res, resellerError, 400);
      return;
    }

    if (req.body.category) {
      const normalizedCategory = await normalizeCategoryValue(req.body.category);
      if (!normalizedCategory) {
        sendError(res, 'Select a valid active category', 400);
        return;
      }
      req.body.category = normalizedCategory;
    }

    const targetTenantIds = Array.isArray(req.body.tenantIds)
      ? req.body.tenantIds
      : (await Attraction.findById(id).select('tenantIds').lean())?.tenantIds || [];
    if (req.body.pathSlug && await Attraction.exists({
      _id: { $ne: id },
      pathSlug: req.body.pathSlug,
      tenantIds: { $in: targetTenantIds },
    })) {
      sendError(res, 'This public URL is already used on one of the selected sites', 409);
      return;
    }

    const attraction = await Attraction.findByIdAndUpdate(
      id,
      {
        $set: {
          ...req.body,
          ...(Array.isArray(req.body.pricingOptions) && req.body.pricingOptions.length > 0
            ? { priceFrom: minimumTourPrice(req.body.pricingOptions) }
            : {}),
        },
      },
      { new: true, runValidators: true }
    );

    if (!attraction) {
      sendError(res, 'Attraction not found', 404);
      return;
    }

    sendSuccess(res, attraction, 'Attraction updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deleteAttraction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (await rejectIfNotCommercialOwner(req, res, id as string)) return;

    const attraction = await Attraction.findOneAndUpdate(
      { _id: id, ...commercialOwnerMutationScope(req) },
      { $set: { status: 'archived', trashedAt: new Date() }, $unset: { archivedAt: 1, statusBeforeArchive: 1 } },
      { new: true }
    );

    if (!attraction) {
      sendError(res, 'Attraction not found', 404);
      return;
    }

    sendSuccess(res, null, 'Attraction archived successfully');
  } catch (error) {
    next(error);
  }
};

export const archiveAttraction = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    if (await rejectIfNotCommercialOwner(req, res, id as string)) return;
    const existing = await Attraction.findOne({
      _id: id,
      status: { $in: ['active', 'draft'] },
      ...commercialOwnerMutationScope(req),
    });
    if (!existing) { sendError(res, 'Active or draft attraction not found', 404); return; }
    const attraction = await Attraction.findOneAndUpdate(
      {
        _id: id,
        status: existing.status,
        ...commercialOwnerMutationScope(req),
      },
      {
        $set: {
          statusBeforeArchive: existing.status,
          status: 'archived',
          archivedAt: new Date(),
        },
        $unset: { trashedAt: 1 },
      },
      { new: true }
    );
    if (!attraction) { sendError(res, 'Active or draft attraction not found', 404); return; }
    sendSuccess(res, attraction, 'Attraction archived');
  } catch (error) { next(error); }
};

export const unarchiveAttraction = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    if (await rejectIfNotCommercialOwner(req, res, id as string)) return;
    const attraction = await Attraction.findOneAndUpdate(
      {
        _id: id,
        status: 'archived',
        archivedAt: { $exists: true },
        trashedAt: { $exists: false },
        ...commercialOwnerMutationScope(req),
      },
      { $set: { status: 'draft' }, $unset: { archivedAt: 1, statusBeforeArchive: 1 } },
      { new: true }
    );
    if (!attraction) { sendError(res, 'Archived attraction not found', 404); return; }
    sendSuccess(res, attraction, 'Attraction returned to drafts');
  } catch (error) { next(error); }
};

export const restoreAttraction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    if (await rejectIfNotCommercialOwner(req, res, id as string)) return;
    const attraction = await Attraction.findOneAndUpdate(
      {
        _id: id,
        status: 'archived',
        archivedAt: { $exists: false },
        ...commercialOwnerMutationScope(req),
      },
      { $set: { status: 'draft' }, $unset: { trashedAt: 1 } },
      { new: true }
    );
    if (!attraction) {
      sendError(res, 'Archived attraction not found', 404);
      return;
    }
    sendSuccess(res, attraction, 'Attraction restored to drafts');
  } catch (error) {
    next(error);
  }
};

export const permanentlyDeleteAttraction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    if (await rejectIfNotCommercialOwner(req, res, id as string)) return;

    const outcome = await runBundleTransaction(async (session) => {
      // Booking's generic query middleware intentionally hides Bundle children.
      // Scope both sides explicitly so the permanent-delete integrity check sees
      // legacy bookings and Bundle projections. The master-order check also
      // protects reserved capacity before/without a child projection.
      const [hasLegacyBooking, hasBundleChild, hasBundleOrder] = await Promise.all([
        Booking.exists({
          attractionId: id,
          bundleOrderId: { $exists: false },
        }).session(session),
        Booking.exists({
          attractionId: id,
          bundleOrderId: { $exists: true },
        }).session(session),
        BundleOrder.exists({ 'components.attractionId': id }).session(session),
      ]);
      if (hasLegacyBooking || hasBundleChild || hasBundleOrder) {
        return { state: 'blocked' as const };
      }

      const attraction = await Attraction.findOneAndDelete({
        _id: id,
        status: 'archived',
        archivedAt: { $exists: false },
        ...commercialOwnerMutationScope(req),
      }).session(session);
      if (!attraction) return { state: 'not_found' as const };
      await Availability.deleteMany({ attractionId: id }, { session });
      return { state: 'deleted' as const };
    });

    if (outcome.state === 'blocked') {
      sendError(res, 'This tour has booking history and cannot be permanently deleted', 409);
      return;
    }
    if (outcome.state === 'not_found') {
      sendError(res, 'Archived attraction not found', 404);
      return;
    }
    sendSuccess(res, null, 'Attraction permanently deleted');
  } catch (error) {
    next(error);
  }
};

// ---- Reseller marketplace (Phase 2) ----

// Resolve the tenant the current request is acting on behalf of.
// Prefer explicit tenant context (host/header), fall back to the user's first
// assigned tenant. Super-admins without a tenant context act globally (null).
const resolveResellerTenantId = (req: AuthRequest): Types.ObjectId | null => {
  if (req.tenant?._id) return req.tenant._id;
  const assigned = req.user?.assignedTenants;
  if (assigned && assigned.length > 0) return assigned[0];
  return null;
};

// GET /attractions/resellable
// Attractions OTHER tenants have opened for resale that the current tenant
// can pick up: enabled, not owned by us, not already in our catalog, and
// either open to everyone or explicitly allow-listed for us.
export const getResellableAttractions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentTenantId = resolveResellerTenantId(req);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 100);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
    const ownerTenantIds = typeof req.query.ownerTenantIds === 'string'
      ? [...new Set(req.query.ownerTenantIds.split(',').map((id) => id.trim()).filter((id) => Types.ObjectId.isValid(id)))].slice(0, 100)
      : [];
    const addedOnly = (req.query as Record<string, unknown>).addedOnly === true;

    // No tenant context and not a super-admin => nothing to offer.
    if (!currentTenantId && req.user?.role !== 'super-admin') {
      sendSuccess(res, []);
      return;
    }

    const query: Record<string, unknown> & { $and?: Array<Record<string, unknown>> } = {
      status: 'active',
      'reseller.enabled': true,
    };
    const conditions: Array<Record<string, unknown>> = [];

    if (currentTenantId) {
      // Not my own tours. Items already on my site stay in the list (flagged
      // below) so the UI can filter "on my site" and still offer Remove.
      query.ownerTenantId = { $ne: currentTenantId };
      conditions.push({ $or: [
        { 'reseller.allowedTenants': { $size: 0 } },
        { 'reseller.allowedTenants': currentTenantId },
      ] });
      if (addedOnly) conditions.push({ tenantIds: currentTenantId });
    } else if (addedOnly) {
      sendError(res, 'Choose a site before filtering marketplace listings', 400);
      return;
    }

    if (ownerTenantIds.length > 0) {
      query.ownerTenantId = {
        ...(typeof query.ownerTenantId === 'object' ? query.ownerTenantId as Record<string, unknown> : {}),
        $in: ownerTenantIds.map((id) => new Types.ObjectId(id)),
      };
    }

    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), 'i');
      const matchingOwners = await Tenant.find({
        status: 'active',
        $or: [{ name: searchRegex }, { slug: searchRegex }],
      }).select('_id').lean();
      conditions.push({
        $or: [
          { title: searchRegex },
          { ownerTenantId: { $in: matchingOwners.map((tenant) => tenant._id) } },
        ],
      });
    }

    if (conditions.length > 0) query.$and = conditions;

    const [attractions, total] = await Promise.all([
      Attraction.find(query)
        .select('title slug images priceFrom currency reseller ownerTenantId destination category tenantIds shortDescription duration rating reviewCount')
        .populate('ownerTenantId', 'name slug logo')
        .sort({ rating: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Attraction.countDocuments(query),
    ]);

    // Flag the ones already on the current tenant's storefront, then strip the
    // full tenant list so we don't leak who else resells each item.
    const result = (attractions as Array<Record<string, any>>).map((a) => {
      const addedToMySite = currentTenantId
        ? (a.tenantIds || []).some((t: unknown) => String(t) === String(currentTenantId))
        : false;
      const owner = a.ownerTenantId && typeof a.ownerTenantId === 'object' ? a.ownerTenantId : null;
      return {
        id: String(a._id),
        _id: String(a._id),
        title: a.title,
        slug: a.slug,
        images: a.images,
        priceFrom: a.priceFrom,
        currency: a.currency,
        destination: a.destination,
        category: a.category,
        shortDescription: a.shortDescription,
        duration: a.duration,
        rating: a.rating,
        reviewCount: a.reviewCount,
        ownerTenant: owner ? { id: String(owner._id), name: owner.name, slug: owner.slug, logo: owner.logo } : null,
        resellTerms: {
          type: a.reseller?.type || 'commission',
          commission: a.reseller?.value || 0,
          currency: a.currency,
        },
        addedToMySite,
      };
    });

    sendPaginated(res, result, page, limit, total);
  } catch (error) {
    next(error);
  }
};

export const getResellableAttractionDetails = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const currentTenantId = resolveResellerTenantId(req);
    if (!currentTenantId && req.user?.role !== 'super-admin') {
      sendError(res, 'Choose a site before viewing marketplace details', 400);
      return;
    }
    const query: Record<string, unknown> & { $and?: Array<Record<string, unknown>> } = {
      _id: req.params.id,
      status: 'active',
      'reseller.enabled': true,
    };
    if (currentTenantId) {
      query.ownerTenantId = { $ne: currentTenantId };
      query.$and = [{
        $or: [
          { 'reseller.allowedTenants': { $size: 0 } },
          { 'reseller.allowedTenants': currentTenantId },
        ],
      }];
    }
    const attraction = await Attraction.findOne(query)
      .select('title slug images priceFrom currency reseller ownerTenantId destination category tenantIds shortDescription description duration languages highlights inclusions exclusions cancellationPolicy instantConfirmation mobileTicket entryWindows pricingOptions rating reviewCount')
      .populate('ownerTenantId', 'name slug logo')
      .lean() as Record<string, any> | null;
    if (!attraction) {
      sendError(res, 'Marketplace listing not found', 404);
      return;
    }
    const owner = attraction.ownerTenantId && typeof attraction.ownerTenantId === 'object'
      ? attraction.ownerTenantId
      : null;
    sendSuccess(res, {
      id: String(attraction._id),
      _id: String(attraction._id),
      title: attraction.title,
      slug: attraction.slug,
      images: attraction.images,
      priceFrom: attraction.priceFrom,
      currency: attraction.currency,
      destination: attraction.destination,
      category: attraction.category,
      shortDescription: attraction.shortDescription,
      description: attraction.description,
      duration: attraction.duration,
      languages: attraction.languages,
      highlights: attraction.highlights,
      inclusions: attraction.inclusions,
      exclusions: attraction.exclusions,
      cancellationPolicy: attraction.cancellationPolicy,
      instantConfirmation: attraction.instantConfirmation,
      mobileTicket: attraction.mobileTicket,
      entryWindows: attraction.entryWindows,
      pricingOptions: attraction.pricingOptions,
      rating: attraction.rating,
      reviewCount: attraction.reviewCount,
      ownerTenant: owner ? { id: String(owner._id), name: owner.name, slug: owner.slug, logo: owner.logo } : null,
      resellTerms: {
        type: attraction.reseller?.type || 'commission',
        commission: attraction.reseller?.value || 0,
        currency: attraction.currency,
      },
      addedToMySite: currentTenantId
        ? (attraction.tenantIds || []).some((tenantId: unknown) => String(tenantId) === String(currentTenantId))
        : false,
    });
  } catch (error) {
    next(error);
  }
};

// POST /attractions/:id/resell
// Current tenant opts in to reselling the attraction.
export const addReseller = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const currentTenantId = resolveResellerTenantId(req);

    if (!currentTenantId) {
      sendError(res, 'No tenant context to resell on behalf of', 400);
      return;
    }

    const attraction = await Attraction.findById(id);
    if (!attraction) {
      sendError(res, 'Attraction not found', 404);
      return;
    }

    if (!attraction.reseller?.enabled) {
      sendError(res, 'This attraction is not available for resale', 400);
      return;
    }

    if (attraction.ownerTenantId && attraction.ownerTenantId.toString() === currentTenantId.toString()) {
      sendError(res, 'You already own this attraction', 400);
      return;
    }

    const allowed = attraction.reseller.allowedTenants || [];
    if (allowed.length > 0 && !allowed.some((t: Types.ObjectId) => t.toString() === currentTenantId.toString())) {
      sendError(res, 'Your tenant is not allowed to resell this attraction', 403);
      return;
    }

    const updated = await Attraction.findByIdAndUpdate(
      id,
      { $addToSet: { tenantIds: currentTenantId } },
      { new: true }
    );

    sendSuccess(res, updated, 'Attraction added to your catalog');
  } catch (error) {
    next(error);
  }
};

// DELETE /attractions/:id/resell
// Current tenant drops the attraction from its catalog. The owner can never
// remove itself this way (it would orphan the supply listing).
export const removeReseller = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const currentTenantId = resolveResellerTenantId(req);

    if (!currentTenantId) {
      sendError(res, 'No tenant context to resell on behalf of', 400);
      return;
    }

    const attraction = await Attraction.findById(id);
    if (!attraction) {
      sendError(res, 'Attraction not found', 404);
      return;
    }

    if (attraction.ownerTenantId && attraction.ownerTenantId.toString() === currentTenantId.toString()) {
      sendError(res, 'The owner tenant cannot stop reselling its own attraction', 400);
      return;
    }

    const updated = await Attraction.findByIdAndUpdate(
      id,
      { $pull: { tenantIds: currentTenantId } },
      { new: true }
    );

    sendSuccess(res, updated, 'Attraction removed from your catalog');
  } catch (error) {
    next(error);
  }
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Which tenants does this admin manage? Site picker (req.tenant) wins,
// otherwise their assigned tenants. Empty for a super-admin with no picker
// (treated as "all" downstream).
const resolveOwnerScope = (req: AuthRequest): Types.ObjectId[] => {
  if (req.tenant?._id) return [req.tenant._id];
  return req.user?.assignedTenants || [];
};

// GET /attractions/admin/reseller-config
// Supplier-side "Resellers" hub: every tour the operator owns, the commission
// it charges resellers, and how much it has earned via resale (so best-sellers
// surface naturally). One place to set commission + read the reselling report.
export const getResellerConfig = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const scope = resolveOwnerScope(req);
    const isSuper = req.user?.role === 'super-admin';

    if (scope.length === 0 && !isSuper) {
      sendSuccess(res, { tours: [], summary: { totalEarned: 0, totalCommission: 0, toursListed: 0 } });
      return;
    }

    const attractionQuery: Record<string, unknown> = {};
    if (scope.length > 0) attractionQuery.ownerTenantId = { $in: scope };

    const attractions = await Attraction.find(attractionQuery)
      .select('title images priceFrom currency reseller status ownerTenantId')
      .sort({ createdAt: -1 })
      .lean();

    const ids = attractions.map((a) => a._id);

    // Resale earnings for these tours, from the supplier's side.
    const statMatch: Record<string, unknown> = { isResale: true, attractionId: { $in: ids } };
    if (scope.length > 0) statMatch.supplierTenantId = { $in: scope };

    const stats = await Booking.aggregate([
      { $match: statMatch },
      {
        $group: {
          _id: '$attractionId',
          totalEarned: { $sum: '$revenueBreakdown.supplierEarnings' },
          unitsSold: { $sum: 1 },
        },
      },
    ]);
    const statById = new Map<string, { totalEarned: number; unitsSold: number }>(
      stats.map((s: { _id: Types.ObjectId; totalEarned: number; unitsSold: number }) => [String(s._id), s])
    );

    const tours = attractions.map((a) => {
      const s = statById.get(String(a._id));
      const reseller = (a as { reseller?: { enabled?: boolean; value?: number; allowedTenants?: Types.ObjectId[] } }).reseller;
      return {
        id: a._id,
        title: a.title,
        image: a.images?.[0] || null,
        currency: a.currency,
        priceFrom: a.priceFrom,
        status: a.status,
        enabled: reseller?.enabled ?? false,
        commission: reseller?.value ?? 0,
        ownerTenantId: a.ownerTenantId,
        allowedTenants: (reseller?.allowedTenants || []).map(String),
        totalEarned: round2(s?.totalEarned || 0),
        unitsSold: s?.unitsSold || 0,
      };
    });

    // Commission earned reselling OTHER operators' tours (the seller side).
    const sellerMatch: Record<string, unknown> = { isResale: true };
    if (scope.length > 0) sellerMatch.sellerTenantId = { $in: scope };
    const sellerAgg = await Booking.aggregate([
      { $match: sellerMatch },
      { $group: { _id: null, total: { $sum: '$revenueBreakdown.sellerEarnings' } } },
    ]);

    const totalEarned = tours.reduce((sum, t) => sum + t.totalEarned, 0);

    sendSuccess(res, {
      tours,
      summary: {
        totalEarned: round2(totalEarned),
        totalCommission: round2(sellerAgg[0]?.total || 0),
        toursListed: tours.filter((t) => t.enabled).length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /attractions/:id/reseller-config
// Owner sets the commission % (and on/off) for one of their tours straight
// from the Resellers hub — no need to open the full tour editor.
export const updateResellerConfig = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { enabled, value, allowedTenants } = req.body;

    const attraction = await Attraction.findById(id);
    if (!attraction) {
      sendError(res, 'Attraction not found', 404);
      return;
    }

    // Only the owning tenant (or a super-admin) may change these settings.
    if (req.user?.role !== 'super-admin') {
      const scope = new Set((req.user?.assignedTenants || []).map((t: Types.ObjectId) => t.toString()));
      const owner = attraction.ownerTenantId?.toString();
      if (!owner || !scope.has(owner)) {
        sendError(res, 'You can only manage reseller settings for your own tours', 403);
        return;
      }
    }

    if (!attraction.reseller) {
      attraction.reseller = { enabled: false, value: 0, allowedTenants: [] } as IAttraction['reseller'];
    }

    if (typeof enabled === 'boolean') attraction.reseller.enabled = enabled;
    if (value !== undefined) {
      const v = Number(value);
      if (Number.isNaN(v) || v < 0) {
        sendError(res, 'Commission must be a positive number', 400);
        return;
      }
      if (v > 100) {
        sendError(res, 'Commission cannot exceed 100%', 400);
        return;
      }
      attraction.reseller.value = v;
    }
    if (allowedTenants !== undefined) {
      if (!Array.isArray(allowedTenants) || allowedTenants.length > 500) {
        sendError(res, 'Allowed brands must be an array of at most 500 tenant IDs', 400);
        return;
      }
      const uniqueIds = [...new Set(allowedTenants.map(String))];
      if (uniqueIds.some((tenantId) => !Types.ObjectId.isValid(tenantId))) {
        sendError(res, 'Allowed brands contains an invalid tenant ID', 400);
        return;
      }
      const ownerId = attraction.ownerTenantId?.toString();
      const resellerIds = uniqueIds.filter((tenantId) => tenantId !== ownerId);
      const activeCount = await Tenant.countDocuments({ _id: { $in: resellerIds }, status: 'active' });
      if (activeCount !== resellerIds.length) {
        sendError(res, 'Every allowed brand must be active', 400);
        return;
      }
      attraction.reseller.allowedTenants = resellerIds.map((tenantId) => new Types.ObjectId(tenantId));
      if (resellerIds.length > 0) {
        const permitted = new Set([ownerId, ...resellerIds].filter(Boolean));
        attraction.tenantIds = attraction.tenantIds.filter((tenantId) => permitted.has(tenantId.toString()));
      }
    }

    await attraction.save();

    sendSuccess(
      res,
      { id: attraction._id, enabled: attraction.reseller.enabled, commission: attraction.reseller.value, allowedTenants: attraction.reseller.allowedTenants.map(String) },
      'Reseller settings updated'
    );
  } catch (error) {
    next(error);
  }
};

// PATCH /attractions/admin/reseller-config/bulk
// Applies one marketplace visibility rule to a verified set of tours. All
// tours and brands are validated before the first write, so partial updates
// cannot occur when one selection is invalid or outside the caller's scope.
export const updateResellerVisibilityBulk = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const attractionIds: string[] = Array.isArray(req.body.attractionIds)
      ? [...new Set<string>((req.body.attractionIds as unknown[]).map(String))]
      : [];
    const allowedTenants: string[] | null = Array.isArray(req.body.allowedTenants)
      ? [...new Set<string>((req.body.allowedTenants as unknown[]).map(String))]
      : null;
    if (attractionIds.length === 0 || attractionIds.length > 500 || attractionIds.some((id) => !Types.ObjectId.isValid(id))) {
      sendError(res, 'Select between 1 and 500 valid tours', 400);
      return;
    }
    if (!allowedTenants || allowedTenants.length > 500 || allowedTenants.some((id) => !Types.ObjectId.isValid(id))) {
      sendError(res, 'Allowed brands must be an array of at most 500 valid tenant IDs', 400);
      return;
    }

    const attractions = await Attraction.find({ _id: { $in: attractionIds } }).select('ownerTenantId tenantIds');
    if (attractions.length !== attractionIds.length) {
      sendError(res, 'One or more selected tours were not found', 404);
      return;
    }
    if (req.user?.role !== 'super-admin') {
      const scope = new Set((req.user?.assignedTenants || []).map(String));
      if (attractions.some((attraction) => !attraction.ownerTenantId || !scope.has(attraction.ownerTenantId.toString()))) {
        sendError(res, 'You can only manage reseller settings for your own tours', 403);
        return;
      }
    }

    const ownerIds = new Set<string>(attractions.map((attraction) => attraction.ownerTenantId?.toString()).filter((id): id is string => Boolean(id)));
    const resellerIds = allowedTenants.filter((tenantId) => !ownerIds.has(tenantId));
    const activeCount = await Tenant.countDocuments({ _id: { $in: resellerIds }, status: 'active' });
    if (activeCount !== resellerIds.length) {
      sendError(res, 'Every allowed brand must be active', 400);
      return;
    }

    await Attraction.bulkWrite(attractions.map((attraction) => {
      const ownerId = attraction.ownerTenantId?.toString();
      const permitted = new Set<string>([ownerId, ...resellerIds].filter((id): id is string => Boolean(id)));
      const tenantIds = resellerIds.length === 0
        ? attraction.tenantIds
        : attraction.tenantIds.filter((tenantId) => permitted.has(tenantId.toString()));
      return {
        updateOne: {
          filter: { _id: attraction._id },
          update: { $set: { 'reseller.allowedTenants': resellerIds.map((id) => new Types.ObjectId(id)), tenantIds } },
        },
      };
    }), { ordered: true });

    sendSuccess(res, { updatedCount: attractions.length, allowedTenants: resellerIds }, 'Reseller visibility updated');
  } catch (error) {
    next(error);
  }
};

// Featured attractions
export const getFeaturedAttractions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { limit = 6 } = req.query;

    const query: Record<string, unknown> = {
      status: 'active',
      featured: true,
    };

    // Scope to tenant context or user's assigned tenants
    if (req.tenant) {
      query.tenantIds = { $in: [req.tenant._id] };
    } else if (req.user && req.user.role !== 'super-admin') {
      const adminRoles = ['brand-admin', 'manager', 'editor', 'viewer'];
      if (adminRoles.includes(req.user.role) && req.user.assignedTenants?.length > 0) {
        query.tenantIds = { $in: req.user.assignedTenants };
      }
    }

    const attractions = await Attraction.find(query)
      .select(PUBLIC_ATTRACTION_PROJECTION)
      .sort({ sortOrder: 1, rating: -1 })
      .limit(parseInt(limit as string, 10))
      .lean();

    // Cache for 10 minutes (featured attractions change less frequently)
    res.setHeader('Cache-Control', 'private, max-age=300');

    sendSuccess(res, attractions.map(toPublicAttractionDto));
  } catch (error) {
    next(error);
  }
};

// ---- Stop Sale ----

export const getBlockedDates = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    if (!Types.ObjectId.isValid(id as string)) {
      sendError(res, 'Attraction not found', 404);
      return;
    }

    const adminRoles = ['super-admin', 'brand-admin', 'manager', 'editor', 'viewer'];
    const isAdminCaller = Boolean(req.user && adminRoles.includes(req.user.role as string));

    if (isAdminCaller) {
      if (await rejectIfNotOwnedAttraction(req, res, id as string)) return;
    } else {
      // Public caller: serve stop-sale days only for a publicly visible
      // attraction, tenant filter ANDed into the query (B1) so a cross-tenant
      // id is indistinguishable from a missing one.
      const attractionQuery: Record<string, unknown> = { _id: id, status: 'active' };
      if (req.tenant) attractionQuery.tenantIds = { $in: [req.tenant._id] };
      if (!(await Attraction.exists(attractionQuery))) {
        sendError(res, 'Attraction not found', 404);
        return;
      }
    }

    const query: Record<string, unknown> = {
      attractionId: new Types.ObjectId(id as string),
      isBlocked: true,
    };

    if (from || to) {
      query.date = {};
      if (from) (query.date as Record<string, unknown>).$gte = new Date(from as string);
      if (to) (query.date as Record<string, unknown>).$lte = new Date(to as string);
    }

    const blocked = await Availability.find(query).sort({ date: 1 }).lean();

    // Guests get dates only — never the operator's blocking reason, capacity
    // or internal notes.
    if (!isAdminCaller) {
      sendSuccess(res, blocked.map((entry) => ({ date: entry.date })));
      return;
    }

    sendSuccess(res, blocked);
  } catch (error) {
    next(error);
  }
};

export const blockDates = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { startDate, endDate, reason } = req.body;

    if (await rejectIfNotOwnedAttraction(req, res, id as string)) return;

    if (!startDate || !endDate) {
      sendError(res, 'startDate and endDate are required', 400);
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    let count = 0;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateOnly = new Date(d);
      dateOnly.setHours(0, 0, 0, 0);

      await Availability.findOneAndUpdate(
        { attractionId: new Types.ObjectId(id as string), date: dateOnly },
        { $set: { isBlocked: true, blockReason: reason || 'other' } },
        { upsert: true }
      );
      count++;
    }

    sendSuccess(res, { blockedCount: count }, `${count} dates blocked`);
  } catch (error) {
    next(error);
  }
};

export const updateStopSaleBatch = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { attractionIds, startDate, endDate, action, reason } = req.body as {
      attractionIds?: string[]; startDate?: string; endDate?: string;
      action?: 'block' | 'unblock'; reason?: string;
    };
    if (!Array.isArray(attractionIds) || attractionIds.length === 0 || attractionIds.length > 100) {
      sendError(res, 'Select between 1 and 100 tours', 400);
      return;
    }
    if (!attractionIds.every(Types.ObjectId.isValid) || !startDate || !endDate || !['block', 'unblock'].includes(action || '')) {
      sendError(res, 'Valid tours, dates, and action are required', 400);
      return;
    }
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      sendError(res, 'Invalid date range', 400);
      return;
    }
    const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    if (dayCount > 366) {
      sendError(res, 'Date range cannot exceed 366 days', 400);
      return;
    }
    const attractionQuery: Record<string, unknown> = { _id: { $in: attractionIds } };
    if (!isSuperAdmin(req.user)) attractionQuery.tenantIds = { $in: callerTenantIds(req.user) };
    const authorizedIds = (await Attraction.find(attractionQuery).distinct('_id')).map(String);
    if (authorizedIds.length !== new Set(attractionIds).size) {
      sendError(res, 'One or more selected tours are unavailable or not assigned to you', 403);
      return;
    }
    const operations = authorizedIds.flatMap((attractionId) =>
      Array.from({ length: dayCount }, (_, index) => {
        const date = new Date(start.getTime() + index * 86400000);
        return {
          updateOne: {
            filter: { attractionId: new Types.ObjectId(attractionId), date },
            update: action === 'block'
              ? { $set: { isBlocked: true, blockReason: reason || 'other' } }
              : { $set: { isBlocked: false }, $unset: { blockReason: 1 } },
            upsert: action === 'block',
          },
        };
      })
    );
    if (operations.length) await Availability.bulkWrite(operations, { ordered: true });
    sendSuccess(res, { tourCount: authorizedIds.length, dateCount: dayCount, updatedCount: operations.length }, `Stop Sale ${action} completed`);
  } catch (error) {
    next(error);
  }
};

export const unblockDate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id, date } = req.params;

    if (await rejectIfNotOwnedAttraction(req, res, id as string)) return;

    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    await Availability.findOneAndUpdate(
      { attractionId: new Types.ObjectId(id as string), date: dateObj },
      { $set: { isBlocked: false, blockReason: null } }
    );

    sendSuccess(res, {}, 'Date unblocked');
  } catch (error) {
    next(error);
  }
};
