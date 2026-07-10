import { Response, NextFunction } from 'express';
import { Review } from '../models/Review';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { sanitizeHtml, escapeRegex } from '../utils/helpers';
import { createAdminNotifications } from '../services/notification.service';
import {
  isSuperAdmin,
  callerTenantIds,
  attractionIdsForTenants,
  attractionInCallerTenants,
} from '../utils/tenantScope';

const PUBLIC_REVIEW_FIELDS = [
  'attractionId',
  'author',
  'avatar',
  'rating',
  'title',
  'content',
  'helpful',
  'verified',
  'country',
  'images',
  'adminReply',
  'createdAt',
  'updatedAt',
].join(' ');

export const getRecentReviews = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { limit = 6 } = req.query;
    const reviewLimit = Math.min(Number(limit) || 6, 50);

    const reviews = await Review.find({ status: 'approved' })
      .sort({ createdAt: -1 })
      .limit(reviewLimit)
      .populate('attractionId', 'title slug')
      .lean();

    sendSuccess(res, reviews);
  } catch (error) {
    next(error);
  }
};

export const getFeaturedReviews = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { limit = 6 } = req.query;
    const reviewLimit = Math.min(Number(limit) || 6, 50);

    // Get highest rated and verified reviews
    const reviews = await Review.find({
      status: 'approved',
      verified: true,
    })
      .sort({ rating: -1, helpful: -1, createdAt: -1 })
      .limit(reviewLimit)
      .populate('attractionId', 'title slug')
      .lean();

    sendSuccess(res, reviews);
  } catch (error) {
    next(error);
  }
};

export const getReviewsByAttractionId = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { attractionId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(Math.max(1, Number(limit) || 10), 100);
    const skip = (pageNum - 1) * limitNum;

    const [reviews, total] = await Promise.all([
      Review.find({
        attractionId,
        status: 'approved',
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Review.countDocuments({
        attractionId,
        status: 'approved',
      }),
    ]);

    sendSuccess(res, {
      reviews,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createReview = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      attractionId,
      rating,
      title,
      content,
      author,
      country,
      images,
    } = req.body;

    // Validation
    if (!attractionId || !rating || !title || !content || !author || !country) {
      sendError(
        res,
        'Missing required fields: attractionId, rating, title, content, author, country',
        400
      );
      return;
    }

    if (rating < 1 || rating > 5) {
      sendError(res, 'Rating must be between 1 and 5', 400);
      return;
    }

    const review = await Review.create({
      attractionId,
      rating,
      title: sanitizeHtml(title),
      content: sanitizeHtml(content),
      author: sanitizeHtml(author),
      country,
      images: images || [],
      userId: req.user?._id,
      status: 'pending',
      verified: !!req.user?._id,
    });

    const populated = await review.populate('attractionId', 'title slug');

    // Notify admins about new review
    createAdminNotifications({
      type: 'review',
      title: rating <= 2 ? 'Low Rating Review' : 'New Review Posted',
      message: `${rating}-star review on "${(populated.attractionId as unknown as { title: string })?.title || 'Unknown'}" by ${author}`,
      link: '/admin/reviews',
      data: { reviewId: review._id, rating },
    }).catch(() => {});

    sendSuccess(res, populated, 'Review created successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const getReviewById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { reviewId } = req.params;

    const review = await Review.findOne({ _id: reviewId, status: 'approved' })
      .select(PUBLIC_REVIEW_FIELDS)
      .populate('attractionId', 'title slug');

    if (!review) {
      sendError(res, 'Review not found', 404);
      return;
    }

    sendSuccess(res, review);
  } catch (error) {
    next(error);
  }
};

// Admin: Get all reviews with filters
export const getAdminReviews = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(Math.max(1, Number(limit) || 20), 100);
    const skip = (pageNum - 1) * limitNum;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: Record<string, any> = {};

    // Tenant scope: Review has no tenant field, so a non-super admin is restricted
    // to reviews of attractions in their own tenants. Without this, a brand-admin
    // could list AND moderate every tenant's reviews.
    if (req.user && !isSuperAdmin(req.user)) {
      const attrIds = await attractionIdsForTenants(callerTenantIds(req.user));
      query.attractionId = { $in: attrIds };
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      const safeSearch = escapeRegex(search as string);
      query.$or = [
        { title: { $regex: safeSearch, $options: 'i' } },
        { content: { $regex: safeSearch, $options: 'i' } },
        { author: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    // Stats must respect the same tenant scope (drop only the status/search facets).
    const statsBase = query.attractionId ? { attractionId: query.attractionId } : {};
    const [reviews, total, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      Review.find(query)
        .populate('attractionId', 'title slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Review.countDocuments(query),
      Review.countDocuments({ ...statsBase, status: 'pending' }),
      Review.countDocuments({ ...statsBase, status: 'approved' }),
      Review.countDocuments({ ...statsBase, status: 'rejected' }),
    ]);

    res.status(200).json({
      success: true,
      data: reviews,
      stats: { pending: pendingCount, approved: approvedCount, rejected: rejectedCount, total: pendingCount + approvedCount + rejectedCount },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Approve or reject a review
export const updateReviewStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      sendError(res, 'Status must be "approved" or "rejected"', 400);
      return;
    }

    const existing = await Review.findById(id).select('attractionId');
    if (!existing) {
      sendError(res, 'Review not found', 404);
      return;
    }
    // Ownership: a non-super admin may only moderate reviews of their own attractions.
    if (
      req.user &&
      !isSuperAdmin(req.user) &&
      !(await attractionInCallerTenants(existing.attractionId, callerTenantIds(req.user)))
    ) {
      sendError(res, 'Review not found', 404);
      return;
    }

    const review = await Review.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate('attractionId', 'title slug');

    if (!review) {
      sendError(res, 'Review not found', 404);
      return;
    }

    sendSuccess(res, review, `Review ${status}`);
  } catch (error) {
    next(error);
  }
};

// Admin: Reply to a review
export const replyToReview = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      sendError(res, 'Reply content is required', 400);
      return;
    }

    const author = `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || 'Admin';

    const existing = await Review.findById(id).select('attractionId');
    if (!existing) {
      sendError(res, 'Review not found', 404);
      return;
    }
    if (
      req.user &&
      !isSuperAdmin(req.user) &&
      !(await attractionInCallerTenants(existing.attractionId, callerTenantIds(req.user)))
    ) {
      sendError(res, 'Review not found', 404);
      return;
    }

    const review = await Review.findByIdAndUpdate(
      id,
      {
        adminReply: {
          content: sanitizeHtml(content),
          author,
          repliedAt: new Date(),
        },
      },
      { new: true }
    ).populate('attractionId', 'title slug');

    if (!review) {
      sendError(res, 'Review not found', 404);
      return;
    }

    sendSuccess(res, review, 'Reply posted successfully');
  } catch (error) {
    next(error);
  }
};
