import { Router } from 'express';
import {
  createBundleDefinitionHandler,
  createBundleQuoteHandler,
  getAdminBundle,
  getBundleLaunchReadinessHandler,
  getPublicBundle,
  listBundleOutboxDeadLettersHandler,
  listAdminBundles,
  listPublicBundles,
  redriveBundleOutboxDeadLetterHandler,
  replaceBundleComponentsHandler,
  transitionBundleDefinitionHandler,
  updateBundleLaunchModeHandler,
  updateBundleDefinitionHandler,
} from '../controllers/bundles.controller';
import {
  requireBundleFeature,
  requireTenantBundleCheckoutReady,
  requireTenantBundleMode,
} from '../bundles/featureFlags';
import {
  adminBundleListQuerySchema,
  adminBundleOwnerQuerySchema,
  bundleDefinitionCommandSchema,
  bundleIdParamsSchema,
  bundleTransitionParamsSchema,
  createBundleQuoteSchema,
  createBundleSchema,
  listBundlesQuerySchema,
  replaceBundleComponentsSchema,
  updateBundleSchema,
  bundleReadinessQuerySchema,
  bundleOutboxDeadLetterListQuerySchema,
  bundleOutboxRedriveParamsSchema,
  bundleOutboxRedriveSchema,
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
  '/admin/outbox/dead-letters',
  authenticate,
  requireSuperAdmin,
  validateQuery(bundleOutboxDeadLetterListQuerySchema),
  listBundleOutboxDeadLettersHandler
);
router.post(
  '/admin/outbox/:id/redrive',
  authenticate,
  requireSuperAdmin,
  validateParams(bundleOutboxRedriveParamsSchema),
  validate(bundleOutboxRedriveSchema),
  redriveBundleOutboxDeadLetterHandler
);

router.get(
  '/admin',
  authenticate,
  requireSuperAdmin,
  validateQuery(adminBundleListQuerySchema),
  optionalAdminTenant,
  listAdminBundles
);
router.get(
  '/admin/:id',
  authenticate,
  requireSuperAdmin,
  validateParams(bundleIdParamsSchema),
  validateQuery(adminBundleOwnerQuerySchema),
  optionalAdminTenant,
  getAdminBundle
);
router.post(
  '/admin',
  authenticate,
  requireSuperAdmin,
  validate(createBundleSchema),
  optionalAdminTenant,
  createBundleDefinitionHandler
);
router.patch(
  '/admin/:id',
  authenticate,
  requireSuperAdmin,
  validateParams(bundleIdParamsSchema),
  validate(updateBundleSchema),
  optionalAdminTenant,
  updateBundleDefinitionHandler
);
router.put(
  '/admin/:id/components',
  authenticate,
  requireSuperAdmin,
  validateParams(bundleIdParamsSchema),
  validate(replaceBundleComponentsSchema),
  optionalAdminTenant,
  replaceBundleComponentsHandler
);
router.post(
  '/admin/:id/status/:status',
  authenticate,
  requireSuperAdmin,
  validateParams(bundleTransitionParamsSchema),
  validate(bundleDefinitionCommandSchema),
  optionalAdminTenant,
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
  requireBundleFeature('recovery'),
  requireTenantBundleCheckoutReady,
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
