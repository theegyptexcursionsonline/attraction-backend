import { Router } from 'express';
import {
  getAttractions,
  getAttractionBySlug,
  getAttractionById,
  getAttractionReviews,
  getAttractionAvailability,
  getFeaturedAttractions,
  createAttraction,
  updateAttraction,
  deleteAttraction,
  getBlockedDates,
  blockDates,
  unblockDate,
  getResellableAttractions,
  addReseller,
  removeReseller,
  getResellerConfig,
  updateResellerConfig,
} from '../controllers/attractions.controller';
import { authenticate, optionalAuth, requireAdmin, requireRole } from '../middleware/auth.middleware';
import { optionalTenant } from '../middleware/tenant.middleware';
import { validate, validateQuery } from '../middleware/validate.middleware';
import { createAttractionSchema, updateAttractionSchema, paginationSchema, attractionFiltersSchema } from '../utils/validators';
import { z } from 'zod';

const router = Router();

/**
 * @swagger
 * /attractions:
 *   get:
 *     summary: List attractions with filters
 *     tags: [Attractions]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category slug
 *       - in: query
 *         name: destination
 *         schema:
 *           type: string
 *         description: Filter by destination city
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum price
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum price
 *       - in: query
 *         name: rating
 *         schema:
 *           type: number
 *         description: Minimum rating
 *       - in: query
 *         name: badges
 *         schema:
 *           type: string
 *         description: Filter by badges (comma-separated)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title and description
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: -createdAt
 *         description: Sort field (prefix with - for descending)
 *     responses:
 *       200:
 *         description: List of attractions
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
 *                     $ref: '#/components/schemas/Attraction'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get(
  '/',
  optionalAuth,
  optionalTenant,
  validateQuery(paginationSchema.merge(attractionFiltersSchema)),
  getAttractions
);

/**
 * @swagger
 * /attractions/featured:
 *   get:
 *     summary: Get featured attractions
 *     tags: [Attractions]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 6
 *         description: Number of featured attractions to return
 *     responses:
 *       200:
 *         description: Featured attractions
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
 *                     $ref: '#/components/schemas/Attraction'
 */
router.get('/featured', optionalAuth, optionalTenant, getFeaturedAttractions);

/**
 * @swagger
 * /attractions/resellable:
 *   get:
 *     summary: List attractions other tenants have opened for resale that this tenant can pick up
 *     tags: [Attractions, Marketplace]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resellable attractions
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
// NOTE: must stay above the `/:slug` and `/:id/...` catch-alls so it is not shadowed.
router.get(
  '/resellable',
  authenticate,
  optionalTenant,
  requireRole('super-admin', 'brand-admin'),
  getResellableAttractions
);

/**
 * @swagger
 * /attractions/{slug}:
 *   get:
 *     summary: Get attraction by slug
 *     tags: [Attractions]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Attraction slug
 *     responses:
 *       200:
 *         description: Attraction details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Attraction'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:slug', optionalAuth, optionalTenant, getAttractionBySlug);

/**
 * @swagger
 * /attractions/{id}/reviews:
 *   get:
 *     summary: Get attraction reviews
 *     tags: [Attractions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Attraction ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Attraction reviews
 */
router.get('/:id/reviews', optionalTenant, validateQuery(paginationSchema), getAttractionReviews);

/**
 * @swagger
 * /attractions/{id}/availability:
 *   get:
 *     summary: Get attraction availability
 *     tags: [Attractions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Attraction ID
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Specific date
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *         description: Month (YYYY-MM format)
 *     responses:
 *       200:
 *         description: Availability data
 */
router.get(
  '/:id/availability',
  validateQuery(z.object({
    date: z.string().optional(),
    month: z.string().optional(),
  })),
  getAttractionAvailability
);

// Stop Sale — Admin routes
router.get('/:id/blocked-dates', authenticate, requireAdmin, getBlockedDates);
router.post('/:id/block-dates', authenticate, requireAdmin, blockDates);
router.delete('/:id/block-dates/:date', authenticate, requireAdmin, unblockDate);

// Reseller marketplace — opt the current tenant in/out of selling an attraction.
router.post('/:id/resell', authenticate, optionalTenant, requireRole('super-admin', 'brand-admin'), addReseller);
router.delete('/:id/resell', authenticate, optionalTenant, requireRole('super-admin', 'brand-admin'), removeReseller);

// Resellers hub (supplier side) — owner lists their tours + sets commission.
// MUST stay above `/admin/:id` so it is not captured as an id.
router.get('/admin/reseller-config', authenticate, optionalTenant, requireRole('super-admin', 'brand-admin', 'manager'), getResellerConfig);
router.patch('/:id/reseller-config', authenticate, optionalTenant, requireRole('super-admin', 'brand-admin', 'manager'), updateResellerConfig);

// Submit a review
router.post(
  '/:id/reviews',
  optionalAuth,
  (req: any, res: any, next: any) => {
    // Inline validation
    const { rating, title, content, author, country } = req.body;
    if (!rating || !title || !content || !author || !country) {
      return res.status(400).json({ success: false, message: 'Missing required fields: rating, title, content, author, country' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }
    next();
  },
  async (req: any, res: any, next: any) => {
    try {
      const { Review } = require('../models/Review');
      const review = await Review.create({
        attractionId: req.params.id,
        userId: req.user?._id,
        author: req.body.author,
        rating: req.body.rating,
        title: req.body.title,
        content: req.body.content,
        country: req.body.country,
        images: req.body.images || [],
        verified: !!req.user,
        status: 'pending',
      });
      res.status(201).json({ success: true, data: review, message: 'Review submitted for moderation' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /attractions:
 *   post:
 *     summary: Create attraction
 *     tags: [Attractions]
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
 *               - title
 *               - description
 *               - category
 *             properties:
 *               slug:
 *                 type: string
 *               title:
 *                 type: string
 *               shortDescription:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *               priceFrom:
 *                 type: number
 *               currency:
 *                 type: string
 *     responses:
 *       201:
 *         description: Attraction created
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  '/',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager', 'editor'),
  validate(createAttractionSchema),
  createAttraction
);

/**
 * @swagger
 * /attractions/admin/{id}:
 *   get:
 *     summary: Get attraction by ID (Admin)
 *     tags: [Attractions]
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
 *         description: Attraction details
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  '/admin/:id',
  authenticate,
  requireAdmin,
  getAttractionById
);

/**
 * @swagger
 * /attractions/{id}:
 *   patch:
 *     summary: Update attraction
 *     tags: [Attractions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive, draft]
 *     responses:
 *       200:
 *         description: Attraction updated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.patch(
  '/:id',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager', 'editor'),
  validate(updateAttractionSchema),
  updateAttraction
);

/**
 * @swagger
 * /attractions/{id}:
 *   delete:
 *     summary: Delete attraction
 *     tags: [Attractions]
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
 *         description: Attraction deleted
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager'),
  deleteAttraction
);

export default router;
