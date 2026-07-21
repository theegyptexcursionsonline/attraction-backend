import { Request, Response, NextFunction } from 'express';
import { Attraction } from '../models/Attraction';
import { Review } from '../models/Review';
import { Booking } from '../models/Booking';
import { sendSuccess } from '../utils/response';
import { AuthRequest } from '../types';

export const getHomepageStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const [
      totalAttractions,
      destinationsAgg,
      reviewsAgg,
      totalBookings,
    ] = await Promise.all([
      Attraction.countDocuments({ status: 'active' }),
      Attraction.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$destination.city' } },
        { $count: 'count' },
      ]),
      Review.aggregate([
        { $match: { status: 'approved' } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avgRating: { $avg: '$rating' },
          },
        },
      ]),
      Booking.countDocuments({ status: { $in: ['confirmed', 'completed'] } }),
    ]);

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 'private, max-age=120');

    sendSuccess(res, {
      totalAttractions,
      totalDestinations: destinationsAgg[0]?.count || 0,
      totalReviews: reviewsAgg[0]?.count || 0,
      averageRating: reviewsAgg[0]?.avgRating
        ? Math.round(reviewsAgg[0].avgRating * 10) / 10
        : 4.9,
      totalBookings,
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const isSuperAdmin = req.user?.role === 'super-admin';
    const assignedTenants = req.user?.assignedTenants ?? [];

    // If a specific tenant is selected, scope to that tenant. The sidebar's
    // "Bookings" badge represents every booking record, matching the Bookings
    // page total; status breakdowns belong on the dashboard/cards instead.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let attractionFilter: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let bookingFilter: Record<string, any>;

    if (req.tenant) {
      attractionFilter = { status: 'active', tenantIds: { $in: [req.tenant._id] } };
      bookingFilter = { tenantId: req.tenant._id };
    } else if (isSuperAdmin) {
      attractionFilter = { status: 'active' };
      bookingFilter = {};
    } else {
      attractionFilter = { status: 'active', tenantIds: { $in: assignedTenants } };
      bookingFilter = { tenantId: { $in: assignedTenants } };
    }

    const [totalAttractions, totalBookings] = await Promise.all([
      Attraction.countDocuments(attractionFilter),
      Booking.countDocuments(bookingFilter),
    ]);

    sendSuccess(res, { totalAttractions, totalBookings });
  } catch (error) {
    next(error);
  }
};
