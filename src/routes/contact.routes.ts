import { Router } from 'express';
import {
  contactMessageListQuerySchema,
  contactMessageStatusUpdateSchema,
  listContactMessages,
  submitContactMessage,
  updateContactMessageStatus,
} from '../controllers/contact.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { optionalTenant, requireTenant } from '../middleware/tenant.middleware';
import { publicWriteLimiter } from '../middleware/rate-limit.middleware';
import { validate, validateQuery } from '../middleware/validate.middleware';

const router = Router();

// Public: a site visitor's contact or tour enquiry. The message is stored before
// any email is attempted; the tenant comes from X-Tenant-ID or ?tenantId only.
router.post('/', publicWriteLimiter, optionalTenant, requireTenant, submitContactMessage);

// Site inbox: visitor personal data, so editor/viewer roles are excluded and the
// caller must be assigned to the requested site (super-admin: any site).
router.get('/messages', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), validateQuery(contactMessageListQuerySchema), listContactMessages);
router.patch('/messages/:id', authenticate, requireRole('super-admin', 'brand-admin', 'manager'), validate(contactMessageStatusUpdateSchema), updateContactMessageStatus);

export default router;
