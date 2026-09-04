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
import { validateQuery } from '../middleware/validate.middleware';
import { paginationSchema, regexSearchSchema } from '../utils/validators';
import { z } from 'zod';

const router = Router();
const promoCodeListQuerySchema = paginationSchema.extend({
  search: regexSearchSchema,
  status: z.enum(['all', 'active', 'inactive']).optional(),
});

// Public — validate a promo code
router.post('/validate', publicWriteLimiter, optionalTenant, requireTenant, validatePromoCode);

// Admin — CRUD
router.get('/', authenticate, validateQuery(promoCodeListQuerySchema), requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, getPromoCodes);
router.get('/stats', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, getPromoCodeStats);
router.get('/:id', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, getPromoCodeById);
router.post('/', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, createPromoCode);
router.patch('/:id', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, updatePromoCode);
router.delete('/:id', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, deletePromoCode);

export default router;
