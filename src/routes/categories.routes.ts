import { Router } from 'express';
import {
  getCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categories.controller';
import { authenticate, optionalAuth, requireSuperAdmin } from '../middleware/auth.middleware';
import { optionalTenant } from '../middleware/tenant.middleware';
import { validate } from '../middleware/validate.middleware';
import { createCategorySchema, updateCategorySchema } from '../utils/validators';

const router = Router();

/**
 * @swagger
 * /categories:
 *   get:
 *     summary: Get all categories
 *     tags: [Categories]
 *     parameters:
 *       - in: query
 *         name: includeCount
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include attraction count per category
 *     responses:
 *       200:
 *         description: List of categories
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
 *                     $ref: '#/components/schemas/Category'
 */
router.get('/', optionalAuth, optionalTenant, getCategories);

/**
 * @swagger
 * /categories/{slug}:
 *   get:
 *     summary: Get category by slug
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Category slug
 *     responses:
 *       200:
 *         description: Category details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Category'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:slug', optionalAuth, optionalTenant, getCategoryBySlug);

/**
 * @swagger
 * /categories:
 *   post:
 *     summary: Create category (Admin)
 *     tags: [Categories]
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
 *             properties:
 *               slug:
 *                 type: string
 *               name:
 *                 type: string
 *               icon:
 *                 type: string
 *               description:
 *                 type: string
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Category created
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  '/',
  authenticate,
  requireSuperAdmin,
  validate(createCategorySchema),
  createCategory
);

/**
 * @swagger
 * /categories/{id}:
 *   patch:
 *     summary: Update category (Admin)
 *     tags: [Categories]
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
 *               icon:
 *                 type: string
 *               description:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Category updated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.patch(
  '/:id',
  authenticate,
  requireSuperAdmin,
  validate(updateCategorySchema),
  updateCategory
);

/**
 * @swagger
 * /categories/{id}:
 *   delete:
 *     summary: Delete category (Admin)
 *     tags: [Categories]
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
 *         description: Category deleted
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete(
  '/:id',
  authenticate,
  requireSuperAdmin,
  deleteCategory
);

export default router;
