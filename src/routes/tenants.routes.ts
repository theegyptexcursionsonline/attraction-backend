import { Router } from 'express';
import {
  getTenants,
  getPublicTenants,
  getPublicTenantById,
  getTenantById,
  getTenantBySlug,
  getTenantByCustomDomain,
  getCustomDomainStatus,
  configureCustomDomain,
  verifyCustomDomain,
  removeCustomDomain,
  createTenant,
  updateTenant,
  updateTenantSettings,
  deleteTenant,
  getTenantStats,
  getPortfolioStats,
} from '../controllers/tenants.controller';
import { authenticate, requireSuperAdmin, requireAdmin, canAccessTenant } from '../middleware/auth.middleware';
import { validate, validateQuery } from '../middleware/validate.middleware';
import { createTenantSchema, updateTenantSchema, paginationSchema } from '../utils/validators';
import { z } from 'zod';

const router = Router();

/**
 * @swagger
 * /tenants/public:
 *   get:
 *     summary: Get all public tenants (active + coming_soon, no auth)
 *     tags: [Tenants]
 *     responses:
 *       200:
 *         description: List of public tenants
 */
router.get('/public', getPublicTenants);

/**
 * @swagger
 * /tenants/public/{id}:
 *   get:
 *     summary: Get a single tenant by ID (public, no auth)
 *     tags: [Tenants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tenant details
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/public/:id', getPublicTenantById);

/**
 * @swagger
 * /tenants/by-slug/{slug}:
 *   get:
 *     summary: Get tenant by slug
 *     tags: [Tenants]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tenant details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Tenant'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/by-slug/:slug', getTenantBySlug);

router.get('/by-domain/:hostname', getTenantByCustomDomain);

// Portfolio-wide totals for the admin Sites list page (Super-admin sees
// everything; brand-admin sees only their assigned sites).
router.get(
  '/admin/portfolio-stats',
  authenticate,
  requireAdmin,
  getPortfolioStats
);

/**
 * @swagger
 * /tenants:
 *   get:
 *     summary: Get all tenants (Admin)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, pending, suspended]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of tenants
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get(
  '/',
  authenticate,
  requireAdmin,
  validateQuery(
    paginationSchema.merge(
      z.object({
        status: z.enum(['active', 'inactive', 'pending', 'suspended', 'coming_soon']).optional(),
        search: z.string().optional(),
      })
    )
  ),
  getTenants
);

/**
 * @swagger
 * /tenants/{id}:
 *   get:
 *     summary: Get tenant by ID (Admin)
 *     tags: [Tenants]
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
 *         description: Tenant details
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get(
  '/:id',
  authenticate,
  requireAdmin,
  canAccessTenant,
  getTenantById
);

/**
 * @swagger
 * /tenants/{id}/stats:
 *   get:
 *     summary: Get tenant statistics (Admin)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d]
 *           default: 30d
 *     responses:
 *       200:
 *         description: Tenant statistics
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  '/:id/stats',
  authenticate,
  requireAdmin,
  canAccessTenant,
  validateQuery(z.object({ period: z.enum(['7d', '30d', '90d']).optional() })),
  getTenantStats
);

router.get(
  '/:id/custom-domain/status',
  authenticate,
  requireSuperAdmin,
  getCustomDomainStatus
);

router.post(
  '/:id/custom-domain',
  authenticate,
  requireSuperAdmin,
  validate(z.object({ domain: z.string().trim().min(3).max(253) })),
  configureCustomDomain
);

router.post(
  '/:id/custom-domain/verify',
  authenticate,
  requireSuperAdmin,
  verifyCustomDomain
);

router.delete(
  '/:id/custom-domain',
  authenticate,
  requireSuperAdmin,
  removeCustomDomain
);

/**
 * @swagger
 * /tenants:
 *   post:
 *     summary: Create tenant (Super Admin)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - slug
 *               - name
 *               - domain
 *             properties:
 *               slug:
 *                 type: string
 *               name:
 *                 type: string
 *               domain:
 *                 type: string
 *               logo:
 *                 type: string
 *               tagline:
 *                 type: string
 *               description:
 *                 type: string
 *               theme:
 *                 type: object
 *                 properties:
 *                   primaryColor:
 *                     type: string
 *                   secondaryColor:
 *                     type: string
 *     responses:
 *       201:
 *         description: Tenant created
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  '/',
  authenticate,
  requireAdmin,
  validate(createTenantSchema),
  createTenant
);

/**
 * @swagger
 * /tenants/{id}/settings:
 *   patch:
 *     summary: Update tenant settings (Brand Admin+)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               contactInfo:
 *                 type: object
 *               socialLinks:
 *                 type: object
 *               paymentSettings:
 *                 type: object
 *               theme:
 *                 type: object
 *     responses:
 *       200:
 *         description: Tenant settings updated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.patch(
  '/:id/settings',
  authenticate,
  requireAdmin,
  canAccessTenant,
  updateTenantSettings
);

/**
 * @swagger
 * /tenants/{id}:
 *   patch:
 *     summary: Update tenant (Super Admin)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive, pending, suspended]
 *     responses:
 *       200:
 *         description: Tenant updated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.patch(
  '/:id',
  authenticate,
  requireSuperAdmin,
  validate(updateTenantSchema),
  updateTenant
);

/**
 * @swagger
 * /tenants/{id}:
 *   delete:
 *     summary: Delete tenant (Super Admin)
 *     tags: [Tenants]
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
 *         description: Tenant deleted
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete(
  '/:id',
  authenticate,
  requireSuperAdmin,
  deleteTenant
);

export default router;
