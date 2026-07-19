import { Router } from 'express';
import {
  createRsvp,
  getAllRsvps,
  getRsvpStats,
  updateRsvpStatus,
  deleteRsvp,
} from '../controllers/rsvps.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { optionalTenant } from '../middleware/tenant.middleware';
import { publicWriteLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// Public: submit an RSVP for an event. Tenant is resolved from X-Tenant-ID, ?tenantId,
// or body.tenantSlug so the endpoint works from tenant custom domains and admin panels.
router.post('/', publicWriteLimiter, optionalTenant, createRsvp);

// Admin: list, view stats, update status, delete
router.get('/admin/stats', authenticate, requireAdmin, optionalTenant, getRsvpStats);
router.get('/admin', authenticate, requireAdmin, optionalTenant, getAllRsvps);
router.patch('/admin/:id/status', authenticate, requireAdmin, updateRsvpStatus);
router.delete('/admin/:id', authenticate, requireAdmin, deleteRsvp);

export default router;
