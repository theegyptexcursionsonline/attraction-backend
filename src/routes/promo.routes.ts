import { Router } from 'express';
import {
  validatePromoCode,
  getPromoCodes,
  getPromoCodeStats,
  getPromoCodeById,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
} from '../controllers/promo.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { optionalTenant, requireTenant } from '../middleware/tenant.middleware';
import { publicWriteLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// Public — validate a promo code
router.post('/validate', publicWriteLimiter, optionalTenant, requireTenant, validatePromoCode);

// Admin — CRUD
router.get('/', authenticate, requireAdmin, optionalTenant, getPromoCodes);
router.get('/stats', authenticate, requireAdmin, optionalTenant, getPromoCodeStats);
router.get('/:id', authenticate, requireAdmin, optionalTenant, getPromoCodeById);
router.post('/', authenticate, requireAdmin, optionalTenant, createPromoCode);
router.patch('/:id', authenticate, requireAdmin, optionalTenant, updatePromoCode);
router.delete('/:id', authenticate, requireAdmin, optionalTenant, deletePromoCode);

export default router;
