import { Router } from 'express';
import {
  createBundleDefinitionHandler,
  createBundleQuoteHandler,
  getAdminBundle,
  getPublicBundle,
  listAdminBundles,
  listPublicBundles,
  replaceBundleComponentsHandler,
  transitionBundleDefinitionHandler,
  updateBundleDefinitionHandler,
} from '../controllers/bundles.controller';
import { requireBundleFeature } from '../bundles/featureFlags';
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
} from '../bundles/validators';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware';
import { optionalTenant, requireTenant } from '../middleware/tenant.middleware';
import { validate, validateParams, validateQuery } from '../middleware/validate.middleware';

const router = Router();

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
  validateQuery(listBundlesQuerySchema),
  listPublicBundles
);
router.post(
  '/:slug/quote',
  requireBundleFeature('checkout'),
  optionalTenant,
  requireTenant,
  validate(createBundleQuoteSchema),
  createBundleQuoteHandler
);
router.get(
  '/:slug',
  requireBundleFeature('discovery'),
  optionalTenant,
  requireTenant,
  getPublicBundle
);

export default router;
