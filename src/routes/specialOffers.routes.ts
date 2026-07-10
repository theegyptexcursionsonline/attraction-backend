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
import { authenticate, requireAdmin, requireRole } from '../middleware/auth.middleware';
import { validateQuery } from '../middleware/validate.middleware';
import { paginationSchema } from '../utils/validators';

const router = Router();

// Public routes
router.get('/active', getActiveOffers);
router.get('/attraction/:attractionId', getOfferForAttraction);

// Admin routes
router.get('/stats', authenticate, requireAdmin, getOfferStats);
router.get('/', authenticate, requireAdmin, validateQuery(paginationSchema), getAllOffers);
router.post('/', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), createOffer);
router.patch('/:id', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), updateOffer);
router.delete('/:id', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), deleteOffer);

export default router;
