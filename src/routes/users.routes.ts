import { Router } from 'express';
import {
  getProfile,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  getUsers,
  getTravelers,
  getUserById,
  inviteUser,
  createInvitationLink,
  setUserPassword,
  updateUser,
  deleteUser,
} from '../controllers/users.controller';
import { authenticate, requireRole, requireSuperAdmin } from '../middleware/auth.middleware';
import { validate, validateQuery } from '../middleware/validate.middleware';
import { paginationSchema, regexSearchSchema } from '../utils/validators';
import { z } from 'zod';

const router = Router();

/**
 * @swagger
 * /users/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/profile', authenticate, getProfile);

/**
 * @swagger
 * /users/wishlist:
 *   get:
 *     summary: Get user wishlist
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's wishlist attractions
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
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/wishlist', authenticate, getWishlist);

/**
 * @swagger
 * /users/wishlist/{attractionId}:
 *   post:
 *     summary: Add attraction to wishlist
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: attractionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Added to wishlist
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/wishlist/:attractionId', authenticate, addToWishlist);

/**
 * @swagger
 * /users/wishlist/{attractionId}:
 *   delete:
 *     summary: Remove attraction from wishlist
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: attractionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Removed from wishlist
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.delete('/wishlist/:attractionId', authenticate, removeFromWishlist);

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users (Admin)
 *     tags: [Users]
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
 *         name: role
 *         schema:
 *           type: string
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
 *         description: List of users
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get(
  '/',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager'),
  validateQuery(
    paginationSchema.merge(
      z.object({
        role: z.string().optional(),
        status: z.enum(['active', 'inactive', 'pending', 'suspended']).optional(),
        search: regexSearchSchema,
        tenantId: z.string().optional(),
      })
    )
  ),
  getUsers
);

router.get(
  '/travelers',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager'),
  validateQuery(
    z.object({
      limit: z.coerce.number().int().min(1).max(50).optional(),
      cursor: z.string().optional(),
      status: z.enum(['active', 'inactive', 'pending', 'suspended']).optional(),
      search: regexSearchSchema,
    })
  ),
  getTravelers
);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get user by ID (Admin)
 *     tags: [Users]
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
 *         description: User details
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get(
  '/:id',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager'),
  getUserById
);

/**
 * @swagger
 * /users/invite:
 *   post:
 *     summary: Invite new user (Admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - firstName
 *               - lastName
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [super-admin, brand-admin, manager, editor, viewer]
 *               assignedTenants:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: User invited
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  '/invite',
  authenticate,
  requireRole('super-admin', 'brand-admin'),
  validate(
    z.object({
      email: z.string().email(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      role: z.enum(['super-admin', 'brand-admin', 'manager', 'editor', 'viewer']),
      assignedTenants: z.array(z.string()).optional(),
    })
  ),
  inviteUser
);

/**
 * @swagger
 * /users/{id}/invitation-link:
 *   post:
 *     summary: Create a fresh invitation link for a pending user, without sending email (Admin)
 *     tags: [Users]
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
 *         description: Link created; earlier invitation links stop working
 *       404:
 *         description: User not found or outside the caller's sites
 *       409:
 *         description: User has already joined
 */
router.post(
  '/:id/invitation-link',
  authenticate,
  requireRole('super-admin', 'brand-admin'),
  createInvitationLink
);

/**
 * @swagger
 * /users/{id}/password:
 *   post:
 *     summary: Set a site team member's password; a pending member becomes active (Super Admin)
 *     tags: [Users]
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
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 12
 *     responses:
 *       200:
 *         description: Password set; the member's sessions are signed out
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post(
  '/:id/password',
  authenticate,
  requireSuperAdmin,
  validate(
    z.object({
      password: z
        .string()
        .min(12, 'Password must be at least 12 characters')
        .max(128, 'Password must be at most 128 characters')
        .regex(/[A-Za-z]/, 'Password must include a letter')
        .regex(/[0-9]/, 'Password must include a number'),
    })
  ),
  setUserPassword
);

/**
 * @swagger
 * /users/{id}:
 *   patch:
 *     summary: Update user (Admin)
 *     tags: [Users]
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
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [super-admin, brand-admin, manager, editor, viewer]
 *               status:
 *                 type: string
 *                 enum: [active, inactive, pending, suspended]
 *               assignedTenants:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: User updated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.patch(
  '/:id',
  authenticate,
  requireRole('super-admin', 'brand-admin'),
  validate(
    z.object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      role: z.enum(['super-admin', 'brand-admin', 'manager', 'editor', 'viewer']).optional(),
      status: z.enum(['active', 'inactive', 'pending', 'suspended']).optional(),
      assignedTenants: z.array(z.string()).optional(),
    })
  ),
  updateUser
);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete user (Super Admin)
 *     tags: [Users]
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
 *         description: User deleted
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete(
  '/:id',
  authenticate,
  requireSuperAdmin,
  deleteUser
);

export default router;
