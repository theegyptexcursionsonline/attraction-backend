import { Response, NextFunction } from 'express';
import { Category } from '../models/Category';
import { Attraction } from '../models/Attraction';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types';
import { publicCursorPlan } from '../utils/publicCursor';
import { searchRegexValue } from '../utils/helpers';
import { localizationStages, requestedLocale, sourceFallbackAllowed, TranslationError } from '../services/attractionLocalization.service';

export const getCategories = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const forEditor = req.query.forEditor === 'true';
    const cursorMode = req.query.pagination === 'cursor';
    const locale = requestedLocale(req.query.locale);
    if (req.query.cursor && !cursorMode) throw new TranslationError('Select cursor pagination');
    if (cursorMode && forEditor) throw new TranslationError('Cursor pagination is for public categories');
    if (locale && !req.tenant) throw new TranslationError('Select one public site for translated categories');
    if (forEditor && (!req.user || !['super-admin', 'brand-admin', 'manager', 'editor', 'viewer'].includes(req.user.role))) {
      sendError(res, 'Staff access is required for editor options', req.user ? 403 : 401);
      return;
    }
    const { includeCount = 'true' } = req.query;

    // Build match filter – scope to tenant or user's assigned tenants
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchFilter: Record<string, any> = { status: 'active' };
    let scopedToTenant = false;

    if (req.tenant) {
      matchFilter.tenantIds = { $in: [req.tenant._id] };
      scopedToTenant = true;
    } else if (req.user && req.user.role !== 'super-admin') {
      const adminRoles = ['brand-admin', 'manager', 'editor', 'viewer'];
      if (adminRoles.includes(req.user.role) && req.user.assignedTenants?.length > 0) {
        matchFilter.tenantIds = { $in: req.user.assignedTenants };
        scopedToTenant = true;
      } else if (adminRoles.includes(req.user.role)) {
        if (cursorMode) res.json({ success: true, data: [], pagination: { limit: Number(req.query.limit || 20), total: 0, previousCursor: null, nextCursor: null } });
        else sendSuccess(res, []);
        return;
      }
    }

    if (cursorMode) {
      const limit = Number(req.query.limit || 20);
      const literal = searchRegexValue(req.query.search);
      const query = { isActive: true, ...(literal ? { $or: ['name', 'slug', 'description'].map(field => ({ [field]: { $regex: literal, $options: 'i' } })) } : {}) };
      const tourScope = { ...matchFilter, archivedAt: { $exists: false }, trashedAt: { $exists: false } };
      const sourceFallback = sourceFallbackAllowed(req.query.localeFallback, req.tenant);
      const pipeline = [
        { $match: query },
        { $lookup: { from: Attraction.collection.name, let: { category: '$slug' }, pipeline: [
          { $match: { ...tourScope, $expr: { $eq: ['$category', '$$category'] } } },
          ...(locale && req.tenant ? localizationStages(req.tenant._id, locale, undefined, !sourceFallback) : []),
          { $count: 'total' },
        ], as: '__counts' } },
        { $set: { count: { $ifNull: [{ $arrayElemAt: ['$__counts.total', 0] }, 0] } } },
        { $match: { count: { $gt: 0 } } },
        { $unset: '__counts' },
      ];
      const plan = publicCursorPlan({ query, tourScope, locale, sourceFallback }, [
        { field: 'sortOrder', direction: 1, kind: 'number' }, { field: '_id', direction: 1, kind: 'id' },
      ], req.query.cursor as string | undefined);
      const [rows, counts] = await Promise.all([
        Category.aggregate([...pipeline, { $set: plan.normalized }, ...(plan.seek ? [{ $match: plan.seek }] : []), { $sort: plan.sort }, { $limit: limit + 1 }]),
        Category.aggregate([...pipeline, { $count: 'total' }]),
      ]);
      const result = plan.page(rows, limit, counts[0]?.total || 0);
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ success: true, data: result.rows.map(row => {
        if (includeCount === 'false') delete row.count;
        return row;
      }), pagination: result.pagination });
      return;
    }

    const categories = await Category.find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    if (forEditor) {
      sendSuccess(res, categories);
      return;
    }

    if (includeCount === 'true') {
      // Get attraction counts for each category
      const counts = await Attraction.aggregate([
        { $match: matchFilter },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]);

      const countMap = new Map(counts.map((c) => [c._id, c.count]));

      const categoriesWithCount = categories.map((cat) => ({
        ...cat,
        count: countMap.get(cat.slug) || 0,
      }));

      // If scoped to tenant, only return categories that have >0 attractions
      if (scopedToTenant) {
        sendSuccess(res, categoriesWithCount.filter((c) => c.count > 0));
      } else {
        sendSuccess(res, categoriesWithCount);
      }
    } else if (scopedToTenant) {
      // Even without counts, scope to categories with matching attractions
      const categorySlugs = await Attraction.distinct('category', matchFilter);
      sendSuccess(res, categories.filter((cat) => categorySlugs.includes(cat.slug)));
    } else {
      sendSuccess(res, categories);
    }
  } catch (error) {
    next(error);
  }
};

export const getCategoryBySlug = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { slug } = req.params;

    const category = await Category.findOne({ slug, isActive: true }).lean();

    if (!category) {
      sendError(res, 'Category not found', 404);
      return;
    }

    // Get attraction count
    const attractionQuery: Record<string, unknown> = {
      category: slug,
      status: 'active',
    };
    if (req.tenant) attractionQuery.tenantIds = { $in: [req.tenant._id] };
    const count = await Attraction.countDocuments(attractionQuery);

    if (req.tenant && count === 0) {
      sendError(res, 'Category not found', 404);
      return;
    }

    sendSuccess(res, { ...category, count });
  } catch (error) {
    next(error);
  }
};

// Admin endpoints
export const createCategory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const category = await Category.create(req.body);
    sendSuccess(res, category, 'Category created successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const category = await Category.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!category) {
      sendError(res, 'Category not found', 404);
      return;
    }

    sendSuccess(res, category, 'Category updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if category has attractions
    const category = await Category.findById(id);
    if (!category) {
      sendError(res, 'Category not found', 404);
      return;
    }

    const attractionCount = await Attraction.countDocuments({
      category: category.slug,
    });

    if (attractionCount > 0) {
      sendError(res, 'Cannot delete category with attractions', 400);
      return;
    }

    await Category.findByIdAndDelete(id);

    sendSuccess(res, null, 'Category deleted successfully');
  } catch (error) {
    next(error);
  }
};
