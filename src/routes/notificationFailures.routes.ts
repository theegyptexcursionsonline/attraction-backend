import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { listNotificationFailures, reconcileNotificationFailure } from '../controllers/notificationFailures.controller';

const router = Router();
router.get('/:tenantId/notification-failures', authenticate, requireRole('super-admin', 'brand-admin'), listNotificationFailures);
router.post('/:tenantId/notification-failures/:source/:id/reconcile', authenticate, requireRole('super-admin', 'brand-admin'), reconcileNotificationFailure);
export default router;
