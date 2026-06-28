import { Router } from 'express';
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  getWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookDeliveries,
  pingWebhookEndpoint,
} from '../controllers/webhooks.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { optionalTenant } from '../middleware/tenant.middleware';

const router = Router();

// All webhook management is tenant-scoped admin work over the JWT session.
router.use(authenticate, requireAdmin, optionalTenant);

/**
 * @swagger
 * /webhooks:
 *   get:
 *     summary: List webhook endpoints (tenant-scoped)
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Webhook endpoints (signing secret never returned)
 *   post:
 *     summary: Create a webhook endpoint (signing secret returned once)
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url:
 *                 type: string
 *               description:
 *                 type: string
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [booking.created, booking.confirmed, booking.cancelled, payment.succeeded, ticket.issued, ping, '*']
 *               tenantId:
 *                 type: string
 *                 description: Required for super-admins; inferred for tenant admins
 *     responses:
 *       201:
 *         description: Endpoint created (secret shown once)
 */
router.get('/', listWebhookEndpoints);
router.post('/', createWebhookEndpoint);

/**
 * @swagger
 * /webhooks/{id}:
 *   get:
 *     summary: Get a webhook endpoint
 *     tags: [Webhooks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *   patch:
 *     summary: Update a webhook endpoint (url / events / enabled)
 *     tags: [Webhooks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *   delete:
 *     summary: Delete a webhook endpoint
 *     tags: [Webhooks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.get('/:id', getWebhookEndpoint);
router.patch('/:id', updateWebhookEndpoint);
router.delete('/:id', deleteWebhookEndpoint);

/**
 * @swagger
 * /webhooks/{id}/deliveries:
 *   get:
 *     summary: List recent deliveries for an endpoint
 *     tags: [Webhooks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 * /webhooks/{id}/ping:
 *   post:
 *     summary: Send a test ping event to an endpoint
 *     tags: [Webhooks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.get('/:id/deliveries', listWebhookDeliveries);
router.post('/:id/ping', pingWebhookEndpoint);

export default router;
