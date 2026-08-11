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
  bundleCommandSchema,
  bundleIdParamsSchema,
  createSupplyOfferSchema,
  supplyOfferListQuerySchema,
  supplyOfferTransitionParamsSchema,
  updateSupplyOfferSchema,
} from '../bundles/validators';

const router = Router();

router.use(authenticate, requireRole('super-admin', 'brand-admin'), optionalTenant);
router.get('/', validateQuery(supplyOfferListQuerySchema), listBundleSupplyOffers);
router.get('/:id', validateParams(bundleIdParamsSchema), getBundleSupplyOffer);
router.post('/', validate(createSupplyOfferSchema), createBundleSupplyOfferHandler);
router.patch(
  '/:id',
  validateParams(bundleIdParamsSchema),
  validate(updateSupplyOfferSchema),
  reviseBundleSupplyOfferHandler
);
router.post(
  '/:id/status/:status',
  validateParams(supplyOfferTransitionParamsSchema),
  validate(bundleCommandSchema),
  transitionBundleSupplyOfferHandler
);

export default router;
