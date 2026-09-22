import { Router } from 'express';
import { getHomepageStats, getAdminStats } from '../controllers/stats.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { optionalTenant } from '../middleware/tenant.middleware';
import { validateQuery } from '../middleware/validate.middleware';
import { z } from 'zod';
import { sendError } from '../utils/response';

const router = Router();

const tenantIdentifier = z.string().trim().min(1).max(253);
router.get('/homepage',
  validateQuery(z.object({ tenantId: tenantIdentifier.optional(), tenant: tenantIdentifier.optional() })),
  (req, res, next) => {
    // optionalTenant intentionally permits an omitted selector. A supplied but
    // malformed selector must not silently become marketplace statistics.
    const header = req.headers['x-tenant-id'];
    if (header !== undefined && !tenantIdentifier.safeParse(header).success) {
      sendError(res, 'Invalid tenant identifier', 400);
      return;
    }
    next();
  },
  optionalTenant, getHomepageStats);
router.get('/admin', authenticate, requireAdmin, optionalTenant, getAdminStats);

export default router;
