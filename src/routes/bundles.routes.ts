import { Router } from 'express';
import {
  createBundleDefinitionHandler,
  createBundleQuoteHandler,
  getAdminBundle,
  getBundleLaunchReadinessHandler,
  getPublicBundle,
  listAdminBundles,
  listPublicBundles,
  replaceBundleComponentsHandler,
  transitionBundleDefinitionHandler,
  updateBundleLaunchModeHandler,
  updateBundleDefinitionHandler,
} from '../controllers/bundles.controller';
import { requireBundleFeature, requireTenantBundleMode } from '../bundles/featureFlags';
import {
  adminBundleListQuerySchema,
  bundleCommandSchema,
  bundleIdParamsSchema,
  bundleTransitionParamsSchema,
  createBundleQuoteSchema,
  createBundleSchema,
  listBundlesQuerySchema,
  replaceBundleComponentsSchema,
  updateBundleSchema,
  bundleReadinessQuerySchema,
  updateBundleLaunchModeSchema,
} from '../bundles/validators';
import { authenticate, requireRole, requireSuperAdmin } from '../middleware/auth.middleware';
import { optionalAdminTenant, optionalTenant, requireTenant } from '../middleware/tenant.middleware';
import { validate, validateParams, validateQuery } from '../middleware/validate.middleware';

const router = Router();

router.get(
  '/admin/readiness',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager', 'viewer'),
  validateQuery(bundleReadinessQuerySchema),
  optionalAdminTenant,
  requireTenant,
  getBundleLaunchReadinessHandler
);
router.put(
  '/admin/readiness',
  authenticate,
  requireSuperAdmin,
  validate(updateBundleLaunchModeSchema),
  updateBundleLaunchModeHandler
);

router.get(
  '/admin',
  authenticate,
  requireSuperAdmin,
  validateQuery(adminBundleListQuerySchema),
  listAdminBundles
);
router.get(
  '/admin/:id',
  authenticate,
  requireSuperAdmin,
  validateParams(bundleIdParamsSchema),
  getAdminBundle
);
router.post('/admin', authenticate, requireSuperAdmin, validate(createBundleSchema), createBundleDefinitionHandler);
router.patch(
  '/admin/:id',
  authenticate,
  requireSuperAdmin,
  validateParams(bundleIdParamsSchema),
  validate(updateBundleSchema),
  updateBundleDefinitionHandler
);
router.put(
  '/admin/:id/components',
  authenticate,
  requireSuperAdmin,
  validateParams(bundleIdParamsSchema),
  validate(replaceBundleComponentsSchema),
  replaceBundleComponentsHandler
);
router.post(
  '/admin/:id/status/:status',
  authenticate,
  requireSuperAdmin,
  validateParams(bundleTransitionParamsSchema),
  validate(bundleCommandSchema),
  transitionBundleDefinitionHandler
);

router.get(
  '/',
  requireBundleFeature('discovery'),
  optionalTenant,
  requireTenant,
  requireTenantBundleMode(['discovery', 'test', 'live']),
  validateQuery(listBundlesQuerySchema),
  listPublicBundles
);
router.post(
  '/:slug/quote',
  requireBundleFeature('checkout'),
  optionalTenant,
  requireTenant,
  requireTenantBundleMode(['test', 'live']),
  validate(createBundleQuoteSchema),
  createBundleQuoteHandler
);
router.get(
  '/:slug',
  requireBundleFeature('discovery'),
  optionalTenant,
  requireTenant,
  requireTenantBundleMode(['discovery', 'test', 'live']),
  getPublicBundle
);

export default router;
