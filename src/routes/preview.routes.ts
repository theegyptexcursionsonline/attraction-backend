import { Router } from 'express';
import {
  unlockPreview,
  unlockByCode,
  lookupPreviewTenant,
  getPreviewCode,
  regeneratePreviewCode,
} from '../controllers/preview.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();

// Aggressive rate limit on the public unlock endpoints so codes can't be
// brute-forced. ~6 attempts per minute per IP — fine for legitimate clients
// who occasionally mistype, painful for scripts.
const unlockLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts. Please wait a minute and try again.' },
});

// Public — gate page hits these
router.get('/lookup', lookupPreviewTenant);
router.post('/unlock', unlockLimiter, unlockPreview);
router.post('/unlock-by-code', unlockLimiter, unlockByCode);

// Admin — view/rotate per-tenant code
router.get('/admin/code/:tenantId', authenticate, requireRole('super-admin', 'brand-admin'), getPreviewCode);
router.post('/admin/regenerate/:tenantId', authenticate, requireRole('super-admin', 'brand-admin'), regeneratePreviewCode);

export default router;
