import { Router } from 'express';
import {
  getActiveOffers,
  getOfferForAttraction,
  getAllOffers,
  getOfferStats,
  createOffer,
  createOffersBulk,
  updateOffer,
  deleteOffer,
} from '../controllers/specialOffers.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validate, validateQuery } from '../middleware/validate.middleware';
import { createSpecialOfferSchema, createSpecialOffersBulkSchema, paginationSchema, regexSearchSchema, updateSpecialOfferSchema } from '../utils/validators';
import { optionalTenant } from '../middleware/tenant.middleware';
import { z } from 'zod';

const router = Router();
export const specialOffersListQuerySchema = paginationSchema.extend({
  search: regexSearchSchema,
  status: z.enum(['active', 'expired', 'upcoming', 'inactive']).optional(),
});

// Public routes
router.get('/active', optionalTenant, getActiveOffers);
router.get('/attraction/:attractionId', optionalTenant, getOfferForAttraction);

// Admin routes
router.get('/stats', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), getOfferStats);
router.get('/', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), validateQuery(specialOffersListQuerySchema), getAllOffers);
router.post('/bulk', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), validate(createSpecialOffersBulkSchema), createOffersBulk);
router.post('/', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), validate(createSpecialOfferSchema), createOffer);
router.patch('/:id', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), validate(updateSpecialOfferSchema), updateOffer);
router.delete('/:id', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), deleteOffer);

export default router;
