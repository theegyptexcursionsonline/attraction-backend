import { Router, Response, NextFunction } from 'express';
import { Booking } from '../models/Booking';
import { Attraction } from '../models/Attraction';
import { authenticateApiKey, requireScope } from '../middleware/apiKey.middleware';
import { sendError, sendPaginated, sendSuccess } from '../utils/response';
import { AuthRequest } from '../types';

const router = Router();

// Partner-facing programmatic API. Every route is authenticated by an API key
// (`authenticateApiKey`) which resolves the OWNING tenant from the key itself —
// a caller can never select or override the tenant. All reads below are scoped
// to that tenant, so a key can only ever see its own tenant's data.
router.use(authenticateApiKey);

// Clamp pagination to safe bounds. limit is capped at 100 to protect the DB.
const parsePaging = (req: AuthRequest): { page: number; limit: number; skip: number } => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const rawLimit = parseInt(String(req.query.limit ?? '20'), 10) || 20;
  const limit = Math.min(100, Math.max(1, rawLimit));
  return { page, limit, skip: (page - 1) * limit };
};

// The set of bookings a tenant is allowed to read: its own storefront sales
// (`tenantId`) PLUS resale bookings of tours it supplies (`supplierTenantId`),
// mirroring the admin booking scope. This is the single source of truth for
// tenant isolation on this surface — every booking query ANDs it in.
const bookingTenantScope = (req: AuthRequest): Record<string, unknown> => {
  const tenantId = req.tenant?._id;
  return {
    $or: [
      { tenantId },
      { supplierTenantId: tenantId, isResale: true },
    ],
  };
};

/**
 * @swagger
 * /v1/bookings:
 *   get:
 *     summary: List the authenticated tenant's bookings (API key)
 *     tags: [Partner API]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, confirmed, cancelled, completed, refunded] }
 *     responses:
 *       200:
 *         description: Paginated bookings owned by the key's tenant only
 *       401:
 *         description: Missing/invalid API key
 *       403:
 *         description: Key missing the read scope
 */
router.get(
  '/bookings',
  requireScope('read'),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, skip } = parsePaging(req);

      const query: Record<string, unknown> = bookingTenantScope(req);
      const status = req.query.status;
      if (typeof status === 'string' && status) {
        query.status = status;
      }

      const [bookings, total] = await Promise.all([
        Booking.find(query)
          .populate('attractionId', 'title slug images destination')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Booking.countDocuments(query),
      ]);

      sendPaginated(res, bookings, page, limit, total);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /v1/bookings/{id}:
 *   get:
 *     summary: Get one of the authenticated tenant's bookings (API key)
 *     tags: [Partner API]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The booking, if it belongs to the key's tenant
 *       404:
 *         description: Not found (or belongs to another tenant)
 */
router.get(
  '/bookings/:id',
  requireScope('read'),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Tenant scope is part of the QUERY (not a post-fetch check), so a booking
      // owned by another tenant is indistinguishable from a non-existent one:
      // both return 404 and never leak another tenant's data.
      const booking = await Booking.findOne({
        _id: req.params.id,
        ...bookingTenantScope(req),
      })
        .populate('attractionId', 'title slug images destination')
        .lean();

      if (!booking) {
        sendError(res, 'Booking not found', 404);
        return;
      }

      sendSuccess(res, booking);
    } catch (error) {
      // A malformed ObjectId (CastError) is a client error, not a 500 — and must
      // not leak existence of other tenants' data, so treat it as not found.
      if (error instanceof Error && error.name === 'CastError') {
        sendError(res, 'Booking not found', 404);
        return;
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /v1/attractions:
 *   get:
 *     summary: List the authenticated tenant's own attraction catalog (API key)
 *     tags: [Partner API]
 *     security:
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Paginated attractions assigned to the key's tenant only
 */
router.get(
  '/attractions',
  requireScope('read'),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, skip } = parsePaging(req);

      // Only attractions assigned to this tenant's storefront.
      const query = { tenantIds: req.tenant?._id };

      const [attractions, total] = await Promise.all([
        Attraction.find(query)
          .select('slug title shortDescription images category destination priceFrom currency status featured')
          .sort({ sortOrder: 1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Attraction.countDocuments(query),
      ]);

      sendPaginated(res, attractions, page, limit, total);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
