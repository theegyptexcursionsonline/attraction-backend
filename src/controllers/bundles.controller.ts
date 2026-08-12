import { NextFunction, Response } from 'express';
import { BundleStatus } from '../bundles/domain';
import { BundleDefinition } from '../models/BundleDefinition';
import {
  BundleCatalogError,
  createBundleDefinition,
  replaceDraftBundleComponents,
  transitionBundleDefinition,
  updateDraftBundleDefinition,
} from '../services/bundleCatalog.service';
import {
  BundleOrderError,
  createBundleQuote,
  publicBundleDto,
} from '../services/bundleOrder.service';
import { BundleInventoryError } from '../services/bundleInventory.service';
import { AuthRequest } from '../types';
import { sendError, sendSuccess } from '../utils/response';
import {
  BundleLaunchModeError,
  getBundleLaunchReadiness,
  updateTenantBundleLaunchMode,
} from '../services/bundleLaunchReadiness.service';

const known = (error: unknown, res: Response, next: NextFunction): void => {
  if (
    error instanceof BundleCatalogError ||
    error instanceof BundleOrderError ||
    error instanceof BundleInventoryError
  ) {
    sendError(res, error.message, error.statusCode);
    return;
  }
  if (error instanceof Error && error.name === 'InvalidBundleTransitionError') {
    sendError(res, error.message, 409);
    return;
  }
  next(error);
};

export const listPublicBundles = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.tenant) {
      sendError(res, 'Tenant context required', 400);
      return;
    }
    const limit = Number(req.query.limit || 20);
    const query: Record<string, unknown> = {
      storefrontTenantId: req.tenant._id,
      status: 'published',
    };
    if (req.query.area) query.area = req.query.area;
    if (req.query.category) query.category = req.query.category;
    if (req.query.cursor) query._id = { $lt: req.query.cursor };
    const rows = await BundleDefinition.find(query).sort({ _id: -1 }).limit(limit + 1);
    const hasMore = rows.length > limit;
    const data = (hasMore ? rows.slice(0, limit) : rows).map(publicBundleDto);
    sendSuccess(res, {
      data,
      pageInfo: { hasMore, nextCursor: hasMore ? rows[limit - 1]._id.toString() : null },
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicBundle = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.tenant) {
      sendError(res, 'Tenant context required', 400);
      return;
    }
    const bundle = await BundleDefinition.findOne({
      storefrontTenantId: req.tenant._id,
      slug: req.params.slug,
      status: 'published',
    });
    if (!bundle) {
      sendError(res, 'Bundle not found', 404);
      return;
    }
    sendSuccess(res, publicBundleDto(bundle));
  } catch (error) {
    next(error);
  }
};

export const createBundleQuoteHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.tenant || String(req.body.storefrontTenantId) !== String(req.tenant._id)) {
      sendError(res, 'Storefront tenant does not match this request', 403);
      return;
    }
    const { storefrontTenantId, ...request } = req.body;
    const quote = await createBundleQuote({
      storefrontTenantId,
      slug: req.params.slug,
      request,
    });
    sendSuccess(res, quote, 'Bundle price and availability confirmed', 201);
  } catch (error) {
    known(error, res, next);
  }
};

export const getBundleLaunchReadinessHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.tenant) {
      sendError(res, 'Tenant context required', 400);
      return;
    }
    sendSuccess(res, await getBundleLaunchReadiness(req.tenant));
  } catch (error) {
    next(error);
  }
};

export const updateBundleLaunchModeHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?._id) {
      sendError(res, 'Authentication required', 401);
      return;
    }
    const readiness = await updateTenantBundleLaunchMode({
      tenantId: req.body.tenantId,
      mode: req.body.mode,
      reason: req.body.reason,
      expectedRevision: req.body.revision,
      actorId: req.user._id,
    });
    sendSuccess(res, readiness, `Bundle storefront moved to ${req.body.mode}`);
  } catch (error) {
    if (error instanceof BundleLaunchModeError) {
      sendError(res, error.message, error.statusCode);
      return;
    }
    next(error);
  }
};

export const listAdminBundles = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const limit = Number(req.query.limit || 20);
    const query: Record<string, unknown> = {};
    if (req.query.tenantId) query.storefrontTenantId = req.query.tenantId;
    if (req.query.status) query.status = req.query.status;
    if (req.query.cursor) query._id = { $lt: req.query.cursor };
    const rows = await BundleDefinition.find(query).sort({ _id: -1 }).limit(limit + 1);
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    sendSuccess(res, {
      data,
      pageInfo: { hasMore, nextCursor: hasMore ? data[data.length - 1]._id.toString() : null },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminBundle = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const bundle = await BundleDefinition.findById(req.params.id);
    if (!bundle) {
      sendError(res, 'Bundle not found', 404);
      return;
    }
    sendSuccess(res, bundle);
  } catch (error) {
    next(error);
  }
};

export const createBundleDefinitionHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const bundle = await createBundleDefinition(req.body, {
      actorType: 'user',
      actorId: req.user!._id,
    });
    sendSuccess(res, bundle, 'Bundle draft created', 201);
  } catch (error) {
    known(error, res, next);
  }
};

export const updateBundleDefinitionHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { revision, ...patch } = req.body;
    const bundle = await updateDraftBundleDefinition(
      req.params.id,
      patch,
      revision,
      { actorType: 'user', actorId: req.user!._id }
    );
    sendSuccess(res, bundle, 'Bundle draft updated');
  } catch (error) {
    known(error, res, next);
  }
};

export const replaceBundleComponentsHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const bundle = await replaceDraftBundleComponents(
      req.params.id,
      req.body.components,
      req.body.revision,
      { actorType: 'user', actorId: req.user!._id }
    );
    sendSuccess(res, bundle, 'Bundle components replaced');
  } catch (error) {
    known(error, res, next);
  }
};

export const transitionBundleDefinitionHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const bundle = await transitionBundleDefinition(
      req.params.id,
      req.params.status as BundleStatus,
      { actorType: 'user', actorId: req.user!._id },
      req.body.reason,
      req.body.revision
    );
    sendSuccess(res, bundle, `Bundle moved to ${req.params.status}`);
  } catch (error) {
    known(error, res, next);
  }
};
