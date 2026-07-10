import { Router } from 'express';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '../controllers/apiKeys.controller';
import { authenticate, requireAdmin, requireRole } from '../middleware/auth.middleware';
import { optionalTenant } from '../middleware/tenant.middleware';

const router = Router();

/**
 * Tenant-scoped programmatic API keys. Managed by tenant admins over the normal
 * JWT session; non-super-admins can only manage keys for their assigned tenants.
 *
 * @swagger
 * /api-keys:
 *   get:
 *     summary: List API keys (tenant-scoped)
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API keys (hash and plaintext never returned)
 *   post:
 *     summary: Create an API key (plaintext returned once)
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [label]
 *             properties:
 *               label:
 *                 type: string
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [read, write, '*']
 *               tenantId:
 *                 type: string
 *                 description: Required for super-admins; inferred for tenant admins
 *     responses:
 *       201:
 *         description: API key created (key shown once)
 */
router.get('/', authenticate, requireAdmin, optionalTenant, listApiKeys);
router.post(
  '/',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager'),
  optionalTenant,
  createApiKey
);

/**
 * @swagger
 * /api-keys/{id}:
 *   delete:
 *     summary: Revoke an API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key revoked
 *       404:
 *         description: Not found (or belongs to another tenant)
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager'),
  optionalTenant,
  revokeApiKey
);

export default router;
