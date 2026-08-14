import { Router } from 'express';
import {
  createBundleSupplyOfferHandler,
  getBundleSupplyOffer,
  listBundleSupplyOffers,
  reviseBundleSupplyOfferHandler,
  transitionBundleSupplyOfferHandler,
} from '../controllers/bundleSupplyOffers.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { optionalTenant } from '../middleware/tenant.middleware';
import { validate, validateParams, validateQuery } from '../middleware/validate.middleware';
import {
  adminBundleOwnerQuerySchema,
  bundleIdParamsSchema,
  createSupplyOfferSchema,
  supplyOfferCommandSchema,
  supplyOfferListQuerySchema,
  supplyOfferTransitionParamsSchema,
  updateSupplyOfferSchema,
} from '../bundles/validators';

const router = Router();

router.use(authenticate, requireRole('super-admin', 'brand-admin'));
router.get(
  '/',
  validateQuery(supplyOfferListQuerySchema),
  optionalTenant,
  listBundleSupplyOffers
);
router.get(
  '/:id',
  validateParams(bundleIdParamsSchema),
  validateQuery(adminBundleOwnerQuerySchema),
  optionalTenant,
  getBundleSupplyOffer
);
router.post(
  '/',
  validate(createSupplyOfferSchema),
  optionalTenant,
  createBundleSupplyOfferHandler
);
router.patch(
  '/:id',
  validateParams(bundleIdParamsSchema),
  validate(updateSupplyOfferSchema),
  optionalTenant,
  reviseBundleSupplyOfferHandler
);
router.post(
  '/:id/status/:status',
  validateParams(supplyOfferTransitionParamsSchema),
  validate(supplyOfferCommandSchema),
  optionalTenant,
  transitionBundleSupplyOfferHandler
);

export default router;
