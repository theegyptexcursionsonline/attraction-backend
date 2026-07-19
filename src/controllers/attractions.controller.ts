import { Response, NextFunction } from 'express';
import { Attraction } from '../models/Attraction';
import { Booking } from '../models/Booking';
import { Review } from '../models/Review';
import { Availability } from '../models/Availability';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest, IAttraction } from '../types';
import { Types } from 'mongoose';
import { escapeRegex } from '../utils/helpers';
import { isSuperAdmin, callerTenantIds, attractionInCallerTenants } from '../utils/tenantScope';

const PUBLIC_ATTRACTION_FIELDS = [
  '_id',
  'slug',
  'pathSlug',
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

interface AttractionQuery {
  status?: string;
  category?: string;
  'destination.city'?: { $regex: RegExp };
  priceFrom?: { $gte?: number; $lte?: number };
  rating?: { $gte: number };
  badges?: { $in: string[] };
  $text?: { $search: string };
  tenantIds?: { $in: Types.ObjectId[] } | { $size: number };
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
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    // Build query
    const query: AttractionQuery = {};

    // Only show active attractions for public API
    if (!req.user || req.user.role === 'customer') {
      query.status = 'active';
    } else if (status) {
      query.status = status as string;
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

    const attractionsQuery = Attraction.find(query).select(PUBLIC_ATTRACTION_PROJECTION);

    // Execute query
    const [attractions, total] = await Promise.all([
      attractionsQuery
        .sort(sortOption)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Attraction.countDocuments(query),
    ]);

    // Cache for 2 minutes (dynamic based on search params)
    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=600');

    sendPaginated(
      res,
      attractions.map(toPublicAttractionDto),
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
      : { slug, status: 'active' };
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

    const attraction = await Attraction.findById(id);

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

export const createAttraction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Non-super-admins can only assign attractions to their own tenants
    if (req.user?.role !== 'super-admin' && req.body.tenantIds?.length) {
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

    const attractionData = {
      ...req.body,
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

    const attraction = await Attraction.findByIdAndUpdate(
      id,
      { $set: req.body },
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

    // Non-super-admins can only delete attractions in their assigned tenants
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
    }

    const attraction = await Attraction.findByIdAndUpdate(
      id,
      { status: 'archived' },
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

    // No tenant context and not a super-admin => nothing to offer.
    if (!currentTenantId && req.user?.role !== 'super-admin') {
      sendSuccess(res, []);
      return;
    }

    const query: Record<string, unknown> = {
      status: 'active',
      'reseller.enabled': true,
    };

    if (currentTenantId) {
      // Not my own tours. Items already on my site stay in the list (flagged
      // below) so the UI can filter "on my site" and still offer Remove.
      query.ownerTenantId = { $ne: currentTenantId };
      query.$or = [
        { 'reseller.allowedTenants': { $size: 0 } },
        { 'reseller.allowedTenants': currentTenantId },
      ];
    }

    const attractions = await Attraction.find(query)
      .select('title slug images priceFrom currency reseller ownerTenantId destination category tenantIds')
      .populate('ownerTenantId', 'name slug logo')
      .sort({ rating: -1, createdAt: -1 })
      .lean();

    // Flag the ones already on the current tenant's storefront, then strip the
    // full tenant list so we don't leak who else resells each item.
    const result = (attractions as Array<Record<string, any>>).map((a) => {
      const addedToMySite = currentTenantId
        ? (a.tenantIds || []).some((t: unknown) => String(t) === String(currentTenantId))
        : false;
      const { tenantIds: _tenantIds, ...rest } = a;
      return { ...rest, addedToMySite };
    });

    sendSuccess(res, result);
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
      .select('title images priceFrom currency reseller status')
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
      const reseller = (a as { reseller?: { enabled?: boolean; value?: number } }).reseller;
      return {
        id: a._id,
        title: a.title,
        image: a.images?.[0] || null,
        currency: a.currency,
        priceFrom: a.priceFrom,
        status: a.status,
        enabled: reseller?.enabled ?? false,
        commission: reseller?.value ?? 0,
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
    const { enabled, value } = req.body;

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

    await attraction.save();

    sendSuccess(
      res,
      { id: attraction._id, enabled: attraction.reseller.enabled, commission: attraction.reseller.value },
      'Reseller settings updated'
    );
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
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=1200');

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

    if (await rejectIfNotOwnedAttraction(req, res, id as string)) return;

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
