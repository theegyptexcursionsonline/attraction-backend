import { Router } from 'express';
import {
  getActiveOffers,
  getOfferForAttraction,
  getAllOffers,
  getOfferStats,
  createOffer,
  updateOffer,
  deleteOffer,
} from '../controllers/specialOffers.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateQuery } from '../middleware/validate.middleware';
import { paginationSchema } from '../utils/validators';
import { optionalTenant } from '../middleware/tenant.middleware';

const router = Router();

// Public routes
router.get('/active', optionalTenant, getActiveOffers);
router.get('/attraction/:attractionId', optionalTenant, getOfferForAttraction);

// Admin routes
router.get('/stats', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), getOfferStats);
router.get('/', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), validateQuery(paginationSchema), getAllOffers);
router.post('/', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), createOffer);
router.patch('/:id', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), updateOffer);
router.delete('/:id', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), deleteOffer);

export default router;
