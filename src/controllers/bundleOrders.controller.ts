import { NextFunction, Response } from 'express';
import { generateBundleAccessToken, verifyBundleAccessToken } from '../bundles/guestAccess';
import { BundleOrder, IBundleOrder } from '../models/BundleOrder';
import { BundleQuote } from '../models/BundleQuote';
import {
  BundleIdempotencyError,
} from '../services/bundleIdempotency.service';
import {
  BundleOrderError,
  createBundleOrder,
  customerBundleOrderDto,
  supplierBundleOrderDto,
} from '../services/bundleOrder.service';
import { BundleInventoryError } from '../services/bundleInventory.service';
import {
  BundlePaymentError,
  confirmBundlePaymentFromProvider,
  createBundlePaymentSession,
  refundBundleOrder,
} from '../services/bundlePayment.service';
import { AuthRequest } from '../types';
import { callerTenantIds, isSuperAdmin } from '../utils/tenantScope';
import { sendError, sendSuccess } from '../utils/response';
import {
  BundleOperationsError,
  cancelBundleOrder,
  fulfilBundleComponent,
  markBundleSettlementPaid,
  recoverBundleOrder,
  releaseBundleSettlement,
} from '../services/bundleOperations.service';

const known = (error: unknown, res: Response, next: NextFunction): void => {
  if (
    error instanceof BundleOrderError ||
    error instanceof BundleInventoryError ||
    error instanceof BundlePaymentError ||
    error instanceof BundleIdempotencyError ||
    error instanceof BundleOperationsError
  ) {
    sendError(res, error.message, error.statusCode);
    return;
  }
  next(error);
};

export const fulfilBundleComponentHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const supplierTenantId = req.query.tenantId as string | undefined;
    if (
      !supplierTenantId ||
      (!isSuperAdmin(req.user) && !callerTenantIds(req.user).includes(supplierTenantId))
    ) {
      sendError(res, 'An assigned supplier tenant is required', 403);
      return;
    }
    const order = await fulfilBundleComponent({
      orderId: req.params.id,
      componentId: req.params.componentId,
      supplierTenantId,
      actorId: req.user!._id,
    });
    sendSuccess(res, supplierBundleOrderDto(order, supplierTenantId), 'Component marked fulfilled');
  } catch (error) {
    known(error, res, next);
  }
};

export const releaseBundleSettlementHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const order = await releaseBundleSettlement({
      orderId: req.params.id,
      componentId: req.params.componentId,
      actorId: req.user!._id,
    });
    sendSuccess(res, order, 'Settlement released');
  } catch (error) {
    known(error, res, next);
  }
};

export const markBundleSettlementPaidHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const order = await markBundleSettlementPaid({
      orderId: req.params.id,
      componentId: req.params.componentId,
      operationId: req.body.operationId,
      actorId: req.user!._id,
    });
    sendSuccess(res, order, 'Settlement marked paid');
  } catch (error) {
    known(error, res, next);
  }
};

const canUseCustomerOrder = (
  req: AuthRequest,
  order: IBundleOrder | null
): boolean => {
  if (!order) return false;
  if (isSuperAdmin(req.user)) return true;
  if (req.user && order.userId && String(order.userId) === String(req.user._id)) return true;
  if (req.user && callerTenantIds(req.user).includes(order.storefrontTenantId.toString())) return true;
  return verifyBundleAccessToken(
    req.headers['x-bundle-access-token'],
    order._id.toString(),
    order.reference
  );
};

const loadCustomerOrder = async (req: AuthRequest, res: Response) => {
  const order = await BundleOrder.findById(req.params.id);
  if (!order) {
    sendError(res, 'Bundle order not found', 404);
    return null;
  }
  if (req.tenant && String(req.tenant._id) !== String(order.storefrontTenantId)) {
    sendError(res, 'Bundle order not found', 404);
    return null;
  }
  if (!canUseCustomerOrder(req, order)) {
    sendError(res, 'Bundle order access denied', 403);
    return null;
  }
  return order;
};

export const createBundleOrderHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.tenant) {
      sendError(res, 'Tenant context required', 400);
      return;
    }
    const quote = await BundleQuote.findById(req.body.quoteId).select('storefrontTenantId');
    if (!quote || String(quote.storefrontTenantId) !== String(req.tenant._id)) {
      sendError(res, 'Quote not found', 404);
      return;
    }
    const idempotencyKey = req.header('Idempotency-Key') || '';
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      sendError(res, 'A valid Idempotency-Key header is required', 400);
      return;
    }
    const result = await createBundleOrder({
      ...req.body,
      userId: req.user?._id,
      idempotencyKey,
    });
    const accessToken = generateBundleAccessToken(
      result.order._id.toString(),
      result.order.reference
    );
    sendSuccess(res, {
      order: customerBundleOrderDto(result.order),
      accessToken,
      replayed: result.replayed,
    }, result.replayed ? 'Existing bundle order returned' : 'Bundle reserved', result.replayed ? 200 : 201);
  } catch (error) {
    known(error, res, next);
  }
};

export const getBundleOrderHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const order = await loadCustomerOrder(req, res);
    if (!order) return;
    sendSuccess(res, customerBundleOrderDto(order));
  } catch (error) {
    next(error);
  }
};

export const getBundleOrderByReferenceHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const order = await BundleOrder.findOne({ reference: req.params.reference });
    if (!order) {
      sendError(res, 'Bundle order not found', 404);
      return;
    }
    if (req.tenant && String(req.tenant._id) !== String(order.storefrontTenantId)) {
      sendError(res, 'Bundle order not found', 404);
      return;
    }
    if (!canUseCustomerOrder(req, order)) {
      sendError(res, 'Bundle order access denied', 403);
      return;
    }
    sendSuccess(res, customerBundleOrderDto(order));
  } catch (error) {
    next(error);
  }
};

export const cancelBundleOrderHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const existing = await loadCustomerOrder(req, res);
    if (!existing) return;
    const order = await cancelBundleOrder({
      orderId: existing._id.toString(),
      reason: req.body.reason,
      actor: req.user
        ? {
            actorType: 'user',
            actorId: req.user._id,
            actorTenantId: req.tenant?._id,
          }
        : { actorType: 'guest' },
    });
    sendSuccess(
      res,
      customerBundleOrderDto(order),
      order.status === 'cancel_pending'
        ? 'Cancellation request recorded for refund review'
        : 'Bundle order cancelled'
    );
  } catch (error) {
    known(error, res, next);
  }
};

export const createBundlePaymentSessionHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const order = await loadCustomerOrder(req, res);
    if (!order) return;
    const result = await createBundlePaymentSession(order._id.toString(), order.storefrontTenantId);
    sendSuccess(res, result, 'Payment session ready');
  } catch (error) {
    known(error, res, next);
  }
};

export const confirmBundlePaymentHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const order = await loadCustomerOrder(req, res);
    if (!order) return;
    const result = await confirmBundlePaymentFromProvider(
      order._id.toString(),
      order.storefrontTenantId
    );
    sendSuccess(res, {
      order: customerBundleOrderDto(result.order),
      duplicate: result.duplicate,
    }, 'Bundle payment verified');
  } catch (error) {
    known(error, res, next);
  }
};

export const listBundleOrdersAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const requestedTenant = req.query.tenantId as string | undefined;
    if (!isSuperAdmin(req.user) && (!requestedTenant || !callerTenantIds(req.user).includes(requestedTenant))) {
      sendError(res, 'An assigned supplier tenant is required', 403);
      return;
    }
    const limit = Number(req.query.limit || 20);
    const query: Record<string, unknown> = {};
    if (isSuperAdmin(req.user)) {
      if (requestedTenant) {
        query.$or = [
          { storefrontTenantId: requestedTenant },
          { 'components.supplierTenantId': requestedTenant },
        ];
      }
    } else {
      query['components.supplierTenantId'] = requestedTenant;
    }
    if (req.query.status) query.status = req.query.status;
    if (req.query.cursor) query._id = { $lt: req.query.cursor };
    const rows = await BundleOrder.find(query).sort({ _id: -1 }).limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const data = isSuperAdmin(req.user)
      ? page
      : page.map((order) => supplierBundleOrderDto(order, requestedTenant!));
    sendSuccess(res, {
      data,
      pageInfo: { hasMore, nextCursor: hasMore ? page[page.length - 1]._id.toString() : null },
    });
  } catch (error) {
    next(error);
  }
};

export const getBundleOrderAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const requestedTenant = req.query.tenantId as string | undefined;
    const query: Record<string, unknown> = { _id: req.params.id };
    if (!isSuperAdmin(req.user)) {
      if (!requestedTenant || !callerTenantIds(req.user).includes(requestedTenant)) {
        sendError(res, 'An assigned supplier tenant is required', 403);
        return;
      }
      query['components.supplierTenantId'] = requestedTenant;
    }
    const order = await BundleOrder.findOne(query);
    if (!order) {
      sendError(res, 'Bundle order not found', 404);
      return;
    }
    sendSuccess(
      res,
      isSuperAdmin(req.user) ? order : supplierBundleOrderDto(order, requestedTenant!)
    );
  } catch (error) {
    next(error);
  }
};

export const recoverBundleOrderHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await recoverBundleOrder({
      orderId: req.params.id,
      reason: req.body.reason,
      actorId: req.user!._id,
    });
    sendSuccess(res, result, `Bundle recovery outcome: ${result.outcome}`);
  } catch (error) {
    known(error, res, next);
  }
};

export const refundBundleOrderHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await refundBundleOrder({
      orderId: req.params.id,
      operationId: req.body.operationId,
      amountMinor: req.body.amountMinor,
      reason: req.body.reason,
      actorId: req.user!._id,
    });
    sendSuccess(res, { order: result.order, duplicate: result.duplicate }, 'Refund reconciled');
  } catch (error) {
    known(error, res, next);
  }
};
