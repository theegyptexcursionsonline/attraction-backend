import { Router } from 'express';
import {
  createRsvp,
  getAllRsvps,
  getRsvpStats,
  updateRsvpStatus,
  deleteRsvp,
} from '../controllers/rsvps.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { optionalTenant } from '../middleware/tenant.middleware';
import { publicWriteLimiter } from '../middleware/rate-limit.middleware';
import { validateQuery } from '../middleware/validate.middleware';
import { regexSearchSchema } from '../utils/validators';
import { z } from 'zod';

const router = Router();
const adminRsvpListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  status: z.enum(['pending', 'confirmed', 'cancelled']).optional(),
  eventSlug: z.string().trim().max(120).optional(),
  search: regexSearchSchema,
  tenantId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

// Public: submit an RSVP for an event. Tenant is resolved from X-Tenant-ID, ?tenantId,
// or body.tenantSlug so the endpoint works from tenant custom domains and admin panels.
router.post('/', publicWriteLimiter, optionalTenant, createRsvp);

// Admin: list, view stats, update status, delete
router.get('/admin/stats', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, getRsvpStats);
router.get('/admin', authenticate, validateQuery(adminRsvpListQuerySchema), requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, getAllRsvps);
router.patch('/admin/:id/status', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), updateRsvpStatus);
router.delete('/admin/:id', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), deleteRsvp);

export default router;
