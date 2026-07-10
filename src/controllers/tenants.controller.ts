import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Booking } from '../models/Booking';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { escapeRegex } from '../utils/helpers';

export const getTenants = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const query: Record<string, unknown> = {};

    // Non-super-admins can only see their assigned tenants
    if (req.user?.role !== 'super-admin') {
      query._id = { $in: req.user?.assignedTenants ?? [] };
    }

    if (status) {
      query.status = status;
    }

    if (search) {
      const safeSearch = escapeRegex(search as string);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { slug: { $regex: safeSearch, $options: 'i' } },
        { domain: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const [tenants, total] = await Promise.all([
      Tenant.find(query)
        .sort({ name: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Tenant.countDocuments(query),
    ]);

    sendPaginated(res, tenants, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
};

export const getTenantById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const tenant = await Tenant.findById(id).lean();

    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    // Get stats
    const [attractionCount, bookingStats, revenueAgg] = await Promise.all([
      Attraction.countDocuments({ tenantIds: tenant._id, status: 'active' }),
      Booking.countDocuments({ tenantId: tenant._id }),
      Booking.aggregate([
        { $match: { tenantId: tenant._id } },
        {
          $group: {
            _id: null,
            // Booked = confirmed/completed commitments (includes pay-later).
            // Collected = payments actually cleared (paymentStatus succeeded).
            bookedRevenue: { $sum: { $cond: [{ $in: ['$status', ['confirmed', 'completed']] }, '$total', 0] } },
            collectedRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'succeeded'] }, '$total', 0] } },
          },
        },
      ]),
    ]);

    const rev = revenueAgg[0] || { bookedRevenue: 0, collectedRevenue: 0 };
    sendSuccess(res, {
      ...tenant,
      stats: {
        totalAttractions: attractionCount,
        totalBookings: bookingStats,
        totalRevenue: rev.bookedRevenue,
        bookedRevenue: rev.bookedRevenue,
        collectedRevenue: rev.collectedRevenue,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Public endpoint – returns all active + coming_soon tenants (no auth required).
 * Used by the frontend LayoutWrapper for tenant resolution.
 */
export const getPublicTenants = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenants = await Tenant.find({ status: { $in: ['active', 'coming_soon'] } })
      .select('slug name domain customDomain logo logoDark favicon heroImages tagline description theme fonts designMode defaultCurrency defaultLanguage supportedLanguages timezone status seoSettings contactInfo socialLinks aiSettings navigation pricingSettings flatUrls customPages paymentSettings.stripe.enabled paymentSettings.stripe.publishableKey')
      .sort({ name: 1 })
      .lean();

    sendSuccess(res, tenants);
  } catch (error) {
    next(error);
  }
};

/**
 * Public endpoint – returns a single tenant by ID (no auth required).
 * Includes all fields for the admin detail page fallback.
 */
export const getPublicTenantById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const tenant = await Tenant.findById(id).lean();

    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    sendSuccess(res, tenant);
  } catch (error) {
    next(error);
  }
};

export const getTenantBySlug = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { slug } = req.params;

    const tenant = await Tenant.findOne({ slug, status: { $in: ['active', 'coming_soon'] } }).lean();

    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    sendSuccess(res, tenant);
  } catch (error) {
    next(error);
  }
};

export const createTenant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenant = await Tenant.create(req.body);
    sendSuccess(res, tenant, 'Tenant created successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const updateTenant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const tenant = await Tenant.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    sendSuccess(res, tenant, 'Tenant updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deleteTenant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const tenant = await Tenant.findByIdAndUpdate(
      id,
      { status: 'inactive' },
      { new: true }
    );

    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    sendSuccess(res, null, 'Tenant deactivated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Brand-admin safe endpoint – only allows updating a restricted set of fields.
 * Full tenant update (name, status, slug, domain, etc.) stays super-admin only.
 */
export const updateTenantSettings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Allow-list of fields brand-admins may change on their own sites
    const allowedFields = [
      'contactInfo',
      'socialLinks',
      // NOTE: paymentSettings is intentionally NOT here — the Stripe keys live in an
      // encrypted subdoc and are managed only via PUT /payments/gateway/:tenantId, so
      // a wholesale settings write can't overwrite/wipe or expose them.
      'seoSettings',
      'aiSettings',
      'theme',
      'fonts',
      'designMode',
      'tagline',
      'description',
      'logo',
      'logoDark',
      'favicon',
      'heroImages',
      'defaultCurrency',
      'defaultLanguage',
      'supportedLanguages',
      'timezone',
      'pricingSettings',
      'navigation', // custom nav menu links per tenant
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      sendError(res, 'No valid fields to update', 400);
      return;
    }

    const tenant = await Tenant.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    sendSuccess(res, tenant, 'Site settings updated successfully');
  } catch (error) {
    next(error);
  }
};

// Portfolio-wide totals for the admin Sites list page. Super-admin sees the
// full network; brand-admin sees only the sites they're assigned to.
//
// We aggregate live from the bookings collection because the legacy
// `Tenant.stats` field was only ever populated on mock data and is
// `undefined` on every real tenant — which is why the Sites list tiles
// were showing 0 bookings / $0 revenue despite ~110 real bookings.
export const getPortfolioStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const adminRoles = ['super-admin', 'brand-admin', 'manager'];
    if (!req.user || !adminRoles.includes(req.user.role)) {
      sendError(res, 'Forbidden', 403);
      return;
    }

    const match: Record<string, unknown> = {};
    if (req.user.role !== 'super-admin') {
      const assigned = (req.user.assignedTenants || []) as Types.ObjectId[];
      if (assigned.length === 0) {
        sendSuccess(res, {
          totalBookings: 0,
          totalRevenue: 0,
          bookedRevenue: 0,
          collectedRevenue: 0,
        });
        return;
      }
      match.tenantId = { $in: assigned };
    }

    const agg = await Booking.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          // Booked revenue = anything that's a real, non-cancelled commitment.
          // We treat 'confirmed' and 'completed' as locked-in bookings (this
          // includes pay-later, where the booking is sealed even though the
          // money hasn't cleared yet).
          bookedRevenue: {
            $sum: {
              $cond: [{ $in: ['$status', ['confirmed', 'completed']] }, '$total', 0],
            },
          },
          // Collected = money that actually cleared.
          collectedRevenue: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'succeeded'] }, '$total', 0] },
          },
        },
      },
    ]);

    const row = agg[0] || { totalBookings: 0, bookedRevenue: 0, collectedRevenue: 0 };
    sendSuccess(res, {
      totalBookings: row.totalBookings,
      // Default totalRevenue to bookedRevenue so the Sites list tile reflects
      // what the operator intuitively thinks of as revenue (every confirmed
      // pay-later booking still counts).
      totalRevenue: row.bookedRevenue,
      bookedRevenue: row.bookedRevenue,
      collectedRevenue: row.collectedRevenue,
    });
  } catch (error) {
    next(error);
  }
};

// Dashboard stats for tenant
export const getTenantStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { period = '30d' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [
      totalAttractions,
      totalBookings,
      confirmedBookings,
      revenue,
      dailyBookings,
    ] = await Promise.all([
      Attraction.countDocuments({ tenantIds: id, status: 'active' }),
      Booking.countDocuments({ tenantId: id, createdAt: { $gte: startDate } }),
      Booking.countDocuments({
        tenantId: id,
        status: 'confirmed',
        createdAt: { $gte: startDate },
      }),
      Booking.aggregate([
        {
          $match: {
            tenantId: new Types.ObjectId(id as string),
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: null,
            // Booked = confirmed/completed commitments (includes pay-later, which
            // never reaches paymentStatus 'succeeded'). Collected = money cleared.
            bookedRevenue: { $sum: { $cond: [{ $in: ['$status', ['confirmed', 'completed']] }, '$total', 0] } },
            collectedRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'succeeded'] }, '$total', 0] } },
          },
        },
      ]),
      Booking.aggregate([
        {
          $match: {
            tenantId: new Types.ObjectId(id as string),
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            bookings: { $sum: 1 },
            // Daily revenue tracks booked revenue so the chart matches the headline.
            revenue: { $sum: { $cond: [{ $in: ['$status', ['confirmed', 'completed']] }, '$total', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    sendSuccess(res, {
      overview: {
        totalAttractions,
        totalBookings,
        confirmedBookings,
        totalRevenue: revenue[0]?.bookedRevenue || 0,
        bookedRevenue: revenue[0]?.bookedRevenue || 0,
        collectedRevenue: revenue[0]?.collectedRevenue || 0,
        conversionRate: totalBookings > 0
          ? ((confirmedBookings / totalBookings) * 100).toFixed(2) 
          : 0,
      },
      dailyData: dailyBookings.map((d) => ({
        date: d._id,
        bookings: d.bookings,
        revenue: d.revenue,
      })),
    });
  } catch (error) {
    next(error);
  }
};
