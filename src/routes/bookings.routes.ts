import { Router } from 'express';
import {
  createBooking,
  getBookingByReference,
  getMyBookings,
  cancelBooking,
  getBookingTicket,
  getAllBookings,
  updateBookingStatus,
  deleteBooking,
  getBookingStats,
  getResellerEarnings,
  getSettlement,
  updateSettlement,
  settleBatch,
} from '../controllers/bookings.controller';
import { authenticate, optionalAuth, requireAdmin, requireRole } from '../middleware/auth.middleware';
import { optionalTenant } from '../middleware/tenant.middleware';
import { validate, validateQuery } from '../middleware/validate.middleware';
import { createBookingSchema, paginationSchema } from '../utils/validators';
import { bookingLimiter } from '../middleware/rate-limit.middleware';
import { z } from 'zod';

const router = Router();

/**
 * @swagger
 * /bookings:
 *   post:
 *     summary: Create a new booking
 *     tags: [Bookings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBookingRequest'
 *     responses:
 *       201:
 *         description: Booking created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Booking'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post(
  '/',
  bookingLimiter,
  optionalAuth,
  optionalTenant,
  validate(createBookingSchema),
  createBooking
);

/**
 * @swagger
 * /bookings/reference/{reference}:
 *   get:
 *     summary: Get booking by reference
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking reference (e.g., AN-ABC123)
 *     responses:
 *       200:
 *         description: Booking details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Booking'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/reference/:reference', optionalAuth, getBookingByReference);

/**
 * @swagger
 * /bookings/my:
 *   get:
 *     summary: Get current user's bookings
 *     tags: [Bookings]
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
 *           default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, cancelled, completed, refunded]
 *     responses:
 *       200:
 *         description: User's bookings
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/my', authenticate, validateQuery(paginationSchema), getMyBookings);

/**
 * @swagger
 * /bookings/{id}/cancel:
 *   patch:
 *     summary: Cancel a booking
 *     tags: [Bookings]
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
 *         description: Booking cancelled
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.patch('/:id/cancel', authenticate, cancelBooking);

/**
 * @swagger
 * /bookings/{id}/ticket:
 *   get:
 *     summary: Download booking ticket (PDF)
 *     tags: [Bookings]
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
 *         description: Ticket PDF URL
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id/ticket', optionalAuth, getBookingTicket);

/**
 * @swagger
 * /bookings/admin:
 *   get:
 *     summary: Get all bookings (Admin)
 *     tags: [Bookings]
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
 *           enum: [pending, confirmed, cancelled, completed, refunded]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: All bookings
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get(
  '/admin',
  authenticate,
  requireAdmin,
  optionalTenant,
  validateQuery(
    paginationSchema.merge(
      z.object({
        status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'refunded']).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        search: z.string().optional(),
      })
    )
  ),
  getAllBookings
);

/**
 * @swagger
 * /bookings/admin/stats:
 *   get:
 *     summary: Get booking statistics (Admin)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Booking statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalBookings:
 *                       type: integer
 *                     confirmedBookings:
 *                       type: integer
 *                     pendingBookings:
 *                       type: integer
 *                     cancelledBookings:
 *                       type: integer
 *                     totalRevenue:
 *                       type: number
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  '/admin/stats',
  authenticate,
  requireAdmin,
  optionalTenant,
  getBookingStats
);

/**
 * @swagger
 * /bookings/admin/earnings:
 *   get:
 *     summary: Get reseller revenue-split earnings (Admin)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reseller earnings split by supplier vs seller role
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     asSupplier:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         count:
 *                           type: integer
 *                     asSeller:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         count:
 *                           type: integer
 *                     recent:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get(
  '/admin/earnings',
  authenticate,
  requireAdmin,
  optionalTenant,
  getResellerEarnings
);

// Reseller settlement — supplier payout ledger + mark settled (single/batch).
// Keep above `/admin/:id` so the segments are not captured as an id.
router.get('/admin/settlement', authenticate, requireAdmin, optionalTenant, getSettlement);
router.post('/admin/settlement/settle', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, settleBatch);
router.patch('/admin/:id/settlement', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, updateSettlement);

/**
 * @swagger
 * /bookings/admin/{id}:
 *   patch:
 *     summary: Update booking status (Admin)
 *     tags: [Bookings]
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
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, completed]
 *     responses:
 *       200:
 *         description: Booking updated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.patch(
  '/admin/:id',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager'),
  validate(
    z.object({
      status: z.enum(['pending', 'confirmed', 'completed']).optional(),
    }).strict()
  ),
  updateBookingStatus
);

// Hard-delete a booking — super-admin only (destructive; removes test/junk
// bookings that would otherwise persist in dashboards + booking counts). A
// supplier/brand-admin can only CANCEL (PATCH status), never delete.
router.delete('/admin/:id', authenticate, requireRole('super-admin'), deleteBooking);

export default router;
