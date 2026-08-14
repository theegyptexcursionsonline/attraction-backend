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
import {
  BundleOutboxRecoveryError,
  listBundleOutboxDeadLetters,
  redriveBundleOutboxDeadLetter,
} from '../services/bundleOutbox.service';

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
  if (error instanceof BundleOutboxRecoveryError) {
    sendError(res, error.message, error.statusCode);
    return;
  }
  next(error);
};

const selectedTenantMatches = (req: AuthRequest, ownerTenantId: string): boolean =>
  !req.tenant || String(req.tenant._id) === ownerTenantId;

const rejectBundleOwnerMismatch = (
  req: AuthRequest,
  res: Response,
  ownerTenantId: string
): boolean => {
  if (selectedTenantMatches(req, ownerTenantId)) return false;
  sendError(res, 'Bundle not found', 404);
  return true;
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
    const checkoutMode = req.tenant.bundleSettings?.mode;
    if (checkoutMode !== 'test' && checkoutMode !== 'live') {
      sendError(res, 'Bundle checkout is not active for this storefront', 503);
      return;
    }
    const quote = await createBundleQuote({
      storefrontTenantId,
      checkoutMode,
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

export const listBundleOutboxDeadLettersHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenantId = String(req.query.tenantId);
    const result = await listBundleOutboxDeadLetters({
      storefrontTenantId: tenantId,
      cursor: req.query.cursor ? String(req.query.cursor) : undefined,
      limit: Number(req.query.limit),
    });
    sendSuccess(res, result);
  } catch (error) {
    known(error, res, next);
  }
};

export const redriveBundleOutboxDeadLetterHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?._id) {
      sendError(res, 'Authentication required', 401);
      return;
    }
    const result = await redriveBundleOutboxDeadLetter({
      eventId: req.params.id,
      storefrontTenantId: req.body.tenantId,
      operationId: req.body.operationId,
      reason: req.body.reason,
      actorId: req.user._id,
    });
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
    sendSuccess(res, result, result.replayed
      ? 'Dead-letter redrive already accepted'
      : 'Dead-letter delivery item queued for retry');
  } catch (error) {
    known(error, res, next);
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
    const requestedTenantId = req.query.tenantId ? String(req.query.tenantId) : undefined;
    if (requestedTenantId && rejectBundleOwnerMismatch(req, res, requestedTenantId)) return;
    const ownerTenantId = req.tenant?._id.toString() || requestedTenantId;
    if (ownerTenantId) query.storefrontTenantId = ownerTenantId;
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
    const storefrontTenantId = String(req.query.tenantId);
    if (rejectBundleOwnerMismatch(req, res, storefrontTenantId)) return;
    const bundle = await BundleDefinition.findOne({
      _id: req.params.id,
      storefrontTenantId,
    });
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
    if (!selectedTenantMatches(req, req.body.storefrontTenantId)) {
      sendError(res, 'Storefront tenant does not match the selected scope', 403);
      return;
    }
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
    const { revision, storefrontTenantId, ...patch } = req.body;
    if (rejectBundleOwnerMismatch(req, res, storefrontTenantId)) return;
    const bundle = await updateDraftBundleDefinition(
      req.params.id,
      storefrontTenantId,
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
    if (rejectBundleOwnerMismatch(req, res, req.body.storefrontTenantId)) return;
    const bundle = await replaceDraftBundleComponents(
      req.params.id,
      req.body.storefrontTenantId,
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
    if (rejectBundleOwnerMismatch(req, res, req.body.storefrontTenantId)) return;
    const bundle = await transitionBundleDefinition(
      req.params.id,
      req.params.status as BundleStatus,
      { actorType: 'user', actorId: req.user!._id },
      req.body.reason,
      req.body.revision,
      req.body.storefrontTenantId
    );
    sendSuccess(res, bundle, `Bundle moved to ${req.params.status}`);
  } catch (error) {
    known(error, res, next);
  }
};
