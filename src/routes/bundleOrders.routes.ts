import { Router } from 'express';
import {
  confirmBundlePaymentHandler,
  cancelBundleOrderHandler,
  createBundleOrderHandler,
  createBundlePaymentSessionHandler,
  getBundleOrderHandler,
  getBundleOrderAdmin,
  getBundleOrderByReferenceHandler,
  fulfilBundleComponentHandler,
  listBundleOrdersAdmin,
  markBundleSettlementPaidHandler,
  recoverBundleOrderHandler,
  refundBundleOrderHandler,
  releaseBundleSettlementHandler,
} from '../controllers/bundleOrders.controller';
import {
  requireBundleFeature,
  requireTenantBundleCheckoutReady,
  requireTenantBundleMode,
} from '../bundles/featureFlags';
import {
  bundleOrderListQuerySchema,
  bundleComponentParamsSchema,
  bundleIdParamsSchema,
  bundleReferenceParamsSchema,
  bundleSettlementPaidSchema,
  cancelBundleOrderSchema,
  createBundleOrderSchema,
  recoverBundleOrderSchema,
  refundBundleOrderSchema,
} from '../bundles/validators';
import { authenticate, optionalAuth, requireRole, requireSuperAdmin } from '../middleware/auth.middleware';
import { optionalTenant, requireTenant } from '../middleware/tenant.middleware';
import { validate, validateParams, validateQuery } from '../middleware/validate.middleware';
import { bookingLimiter, paymentLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

router.get(
  '/admin',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager', 'viewer'),
  validateQuery(bundleOrderListQuerySchema),
  listBundleOrdersAdmin
);
router.get(
  '/admin/:id',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager', 'viewer'),
  validateParams(bundleIdParamsSchema),
  getBundleOrderAdmin
);
router.post(
  '/admin/:id/refund',
  authenticate,
  requireSuperAdmin,
  paymentLimiter,
  validateParams(bundleIdParamsSchema),
  validate(refundBundleOrderSchema),
  refundBundleOrderHandler
);
router.post(
  '/admin/:id/components/:componentId/fulfil',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager'),
  validateParams(bundleComponentParamsSchema),
  fulfilBundleComponentHandler
);
router.post(
  '/admin/:id/components/:componentId/release-settlement',
  authenticate,
  requireSuperAdmin,
  validateParams(bundleComponentParamsSchema),
  releaseBundleSettlementHandler
);
router.post(
  '/admin/:id/components/:componentId/mark-settled',
  authenticate,
  requireSuperAdmin,
  validateParams(bundleComponentParamsSchema),
  validate(bundleSettlementPaidSchema),
  markBundleSettlementPaidHandler
);
router.post(
  '/admin/:id/recover',
  requireBundleFeature('recovery'),
  authenticate,
  requireSuperAdmin,
  validateParams(bundleIdParamsSchema),
  validate(recoverBundleOrderSchema),
  recoverBundleOrderHandler
);

router.post(
  '/',
  requireBundleFeature('checkout'),
  bookingLimiter,
  optionalAuth,
  optionalTenant,
  requireTenant,
  requireTenantBundleMode(['test', 'live']),
  requireBundleFeature('recovery'),
  requireTenantBundleCheckoutReady,
  validate(createBundleOrderSchema),
  createBundleOrderHandler
);
router.get(
  '/reference/:reference',
  optionalAuth,
  optionalTenant,
  validateParams(bundleReferenceParamsSchema),
  getBundleOrderByReferenceHandler
);
router.get(
  '/:id',
  optionalAuth,
  optionalTenant,
  validateParams(bundleIdParamsSchema),
  getBundleOrderHandler
);
router.post(
  '/:id/cancel',
  requireBundleFeature('checkout'),
  bookingLimiter,
  optionalAuth,
  optionalTenant,
  validateParams(bundleIdParamsSchema),
  validate(cancelBundleOrderSchema),
  cancelBundleOrderHandler
);
router.post(
  '/:id/payment-intent',
  requireBundleFeature('checkout'),
  paymentLimiter,
  optionalAuth,
  optionalTenant,
  requireTenant,
  requireTenantBundleMode(['test', 'live']),
  requireBundleFeature('recovery'),
  validateParams(bundleIdParamsSchema),
  createBundlePaymentSessionHandler
);
router.post(
  '/:id/confirm',
  requireBundleFeature('checkout'),
  paymentLimiter,
  optionalAuth,
  optionalTenant,
  requireTenant,
  validateParams(bundleIdParamsSchema),
  confirmBundlePaymentHandler
);

export default router;
