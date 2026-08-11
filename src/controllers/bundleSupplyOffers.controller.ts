import { NextFunction, Response } from 'express';
import { Types } from 'mongoose';
import { BundleSupplyOffer } from '../models/BundleSupplyOffer';
import { AuthRequest } from '../types';
import { callerTenantIds, isSuperAdmin } from '../utils/tenantScope';
import { sendError, sendSuccess } from '../utils/response';
import {
  BundleSupplyOfferError,
  createBundleSupplyOffer,
  reviseBundleSupplyOffer,
  transitionBundleSupplyOffer,
} from '../services/bundleSupplyOffer.service';
import { SupplyOfferStatus } from '../bundles/domain';

const handleKnownError = (error: unknown, res: Response, next: NextFunction): void => {
  if (error instanceof BundleSupplyOfferError || (error instanceof Error && error.name === 'InvalidBundleTransitionError')) {
    sendError(
      res,
      error.message,
      error instanceof BundleSupplyOfferError ? error.statusCode : 409
    );
    return;
  }
  next(error);
};

const resolveSupplierTenant = (
  req: AuthRequest,
  requested?: string
): string | null => {
  const tenantId = requested || req.tenant?._id.toString() || (req.query.tenantId as string | undefined);
  if (!tenantId) return null;
  if (!isSuperAdmin(req.user) && !callerTenantIds(req.user).includes(tenantId)) return null;
  return tenantId;
};

export const listBundleSupplyOffers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const allSuppliers =
      isSuperAdmin(req.user) &&
      (req.query as Record<string, unknown>).allSuppliers === true;
    const tenantId = allSuppliers
      ? null
      : resolveSupplierTenant(req, req.query.tenantId as string | undefined);
    if (!isSuperAdmin(req.user) && !tenantId) {
      sendError(res, 'An assigned supplier tenant is required', 403);
      return;
    }
    const limit = Number(req.query.limit || 20);
    const query: Record<string, unknown> = {};
    if (tenantId) query.supplierTenantId = tenantId;
    if (req.query.status) query.status = req.query.status;
    if (req.query.cursor) query._id = { $lt: req.query.cursor };
    const rows = await BundleSupplyOffer.find(query).sort({ _id: -1 }).limit(limit + 1);
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

export const getBundleSupplyOffer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const query: Record<string, unknown> = { _id: req.params.id };
    if (!isSuperAdmin(req.user)) {
      const tenantIds = callerTenantIds(req.user);
      if (tenantIds.length === 0) {
        sendError(res, 'An assigned supplier tenant is required', 403);
        return;
      }
      query.supplierTenantId = { $in: tenantIds };
    }
    const offer = await BundleSupplyOffer.findOne(query);
    if (!offer) {
      sendError(res, 'Supply offer not found', 404);
      return;
    }
    sendSuccess(res, offer);
  } catch (error) {
    next(error);
  }
};

export const createBundleSupplyOfferHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenantId = resolveSupplierTenant(req, req.body.supplierTenantId);
    if (!tenantId || !req.user?._id) {
      sendError(res, 'Access denied to this supplier tenant', 403);
      return;
    }
    const offer = await createBundleSupplyOffer(
      { ...req.body, supplierTenantId: tenantId },
      {
        actorType: 'user',
        actorId: req.user._id,
        actorTenantId: isSuperAdmin(req.user) ? undefined : new Types.ObjectId(tenantId),
      }
    );
    sendSuccess(res, offer, 'Supply offer created', 201);
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

export const reviseBundleSupplyOfferHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?._id) {
      sendError(res, 'Authentication required', 401);
      return;
    }
    const supplierTenantId = isSuperAdmin(req.user)
      ? undefined
      : resolveSupplierTenant(req, req.tenant?._id.toString());
    if (!isSuperAdmin(req.user) && !supplierTenantId) {
      sendError(res, 'An assigned supplier tenant is required', 403);
      return;
    }
    const { revision, ...patch } = req.body;
    const offer = await reviseBundleSupplyOffer(
      req.params.id,
      patch,
      revision,
      { actorType: 'user', actorId: req.user._id, actorTenantId: req.tenant?._id },
      supplierTenantId || undefined
    );
    sendSuccess(res, offer, 'Supply offer revised');
  } catch (error) {
    handleKnownError(error, res, next);
  }
};

export const transitionBundleSupplyOfferHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?._id) {
      sendError(res, 'Authentication required', 401);
      return;
    }
    const toStatus = req.params.status as SupplyOfferStatus;
    const superOnly = ['approved', 'rejected'];
    if (superOnly.includes(toStatus) && !isSuperAdmin(req.user)) {
      sendError(res, 'Super admin approval is required', 403);
      return;
    }
    const supplierTenantId = isSuperAdmin(req.user)
      ? undefined
      : resolveSupplierTenant(req, req.tenant?._id.toString());
    if (!isSuperAdmin(req.user) && !supplierTenantId) {
      sendError(res, 'An assigned supplier tenant is required', 403);
      return;
    }
    const offer = await transitionBundleSupplyOffer(
      req.params.id,
      toStatus,
      { actorType: 'user', actorId: req.user._id, actorTenantId: req.tenant?._id },
      {
        supplierTenantId: supplierTenantId || undefined,
        reason: req.body.reason,
        expectedRevision: req.body.revision,
      }
    );
    sendSuccess(res, offer, `Supply offer moved to ${toStatus}`);
  } catch (error) {
    handleKnownError(error, res, next);
  }
};
