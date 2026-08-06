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
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { optionalTenant, requireTenant } from '../middleware/tenant.middleware';
import { publicWriteLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// Public — validate a promo code
router.post('/validate', publicWriteLimiter, optionalTenant, requireTenant, validatePromoCode);

// Admin — CRUD
router.get('/', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, getPromoCodes);
router.get('/stats', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, getPromoCodeStats);
router.get('/:id', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, getPromoCodeById);
router.post('/', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, createPromoCode);
router.patch('/:id', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, updatePromoCode);
router.delete('/:id', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, deletePromoCode);

export default router;
