import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateQuery } from '../middleware/validate.middleware';
import { exportAuditLogs, listAuditLogs } from '../controllers/auditLogs.controller';
import { AUDIT_ACTIONS } from '../models/AuditLog';
import { AUDIT_SUBJECTS } from '../services/auditSubjects';
import { regexSearchSchema } from '../utils/validators';

const router = Router();

const filters = z.object({
  actorId: z.string().optional(),
  action: z.enum([...AUDIT_ACTIONS, 'auth.*', 'record.*']).optional(),
  outcome: z.enum(['success', 'failure']).optional(),
  resource: z.string().regex(/^[a-z0-9-]{1,60}$/).optional(),
  subject: z.enum(AUDIT_SUBJECTS).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: regexSearchSchema,
});

/**
 * @swagger
 * /audit-logs/export:
 *   get:
 *     summary: User log as a CSV report of the current filters, same brand scope as the list (Super Admin, Brand Admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/export',
  authenticate,
  requireRole('super-admin', 'brand-admin'),
  validateQuery(filters),
  exportAuditLogs
);

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
  validateQuery(filters.extend({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  })),
  listAuditLogs
);

export default router;
