import { Router } from 'express';
import {
  getDestinations,
  getDestinationBySlug,
  getFeaturedDestinations,
  createDestination,
  updateDestination,
  deleteDestination,
} from '../controllers/destinations.controller';
import { authenticate, optionalAuth, requireSuperAdmin } from '../middleware/auth.middleware';
import { optionalTenant } from '../middleware/tenant.middleware';
import { validate, validateQuery } from '../middleware/validate.middleware';
import { createDestinationSchema, updateDestinationSchema, paginationSchema } from '../utils/validators';
import { z } from 'zod';

const router = Router();

/**
 * @swagger
 * /destinations:
 *   get:
 *     summary: Get all destinations
 *     tags: [Destinations]
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
 *         name: continent
 *         schema:
 *           type: string
 *         description: Filter by continent
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in name and country
 *       - in: query
 *         name: includeCount
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include attraction count
 *     responses:
 *       200:
 *         description: List of destinations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Destination'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get(
  '/',
  optionalAuth,
  optionalTenant,
  validateQuery(
    paginationSchema.merge(
      z.object({
        continent: z.string().optional(),
        search: z.string().optional(),
        includeCount: z.enum(['true', 'false']).optional(),
      })
    )
  ),
  getDestinations
);

/**
 * @swagger
 * /destinations/featured:
 *   get:
 *     summary: Get featured destinations
 *     tags: [Destinations]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 6
 *     responses:
 *       200:
 *         description: Featured destinations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Destination'
 */
router.get('/featured', optionalAuth, optionalTenant, getFeaturedDestinations);

/**
 * @swagger
 * /destinations/{slug}:
 *   get:
 *     summary: Get destination by slug
 *     tags: [Destinations]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Destination details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Destination'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:slug', optionalAuth, optionalTenant, getDestinationBySlug);

/**
 * @swagger
 * /destinations:
 *   post:
 *     summary: Create destination (Admin)
 *     tags: [Destinations]
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
 *               - country
 *             properties:
 *               slug:
 *                 type: string
 *               name:
 *                 type: string
 *               country:
 *                 type: string
 *               continent:
 *                 type: string
 *               description:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *               highlights:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Destination created
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  '/',
  authenticate,
  requireSuperAdmin,
  validate(createDestinationSchema),
  createDestination
);

/**
 * @swagger
 * /destinations/{id}:
 *   patch:
 *     summary: Update destination (Admin)
 *     tags: [Destinations]
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
 *               description:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Destination updated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.patch(
  '/:id',
  authenticate,
  requireSuperAdmin,
  validate(updateDestinationSchema),
  updateDestination
);

/**
 * @swagger
 * /destinations/{id}:
 *   delete:
 *     summary: Delete destination (Admin)
 *     tags: [Destinations]
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
 *         description: Destination deleted
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete(
  '/:id',
  authenticate,
  requireSuperAdmin,
  deleteDestination
);

export default router;
