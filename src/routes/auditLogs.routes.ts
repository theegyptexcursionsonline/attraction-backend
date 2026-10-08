import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateQuery } from '../middleware/validate.middleware';
import { listAuditLogs } from '../controllers/auditLogs.controller';
import { AUDIT_ACTIONS } from '../models/AuditLog';
import { regexSearchSchema } from '../utils/validators';

const router = Router();

/**
 * @swagger
 * /audit-logs:
 *   get:
 *     summary: User log - sign-ins and every change made by the admin team (Super Admin, Brand Admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/',
  authenticate,
  requireRole('super-admin', 'brand-admin'),
  validateQuery(z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    actorId: z.string().optional(),
    action: z.enum([...AUDIT_ACTIONS, 'auth.*', 'record.*']).optional(),
    outcome: z.enum(['success', 'failure']).optional(),
    resource: z.string().regex(/^[a-z0-9-]{1,60}$/).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    search: regexSearchSchema,
  })),
  listAuditLogs
);

export default router;
