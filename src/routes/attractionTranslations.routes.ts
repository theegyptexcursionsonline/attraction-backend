import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { getAttractionTranslation, saveAttractionTranslation, transitionAttractionTranslation } from '../controllers/attractionTranslations.controller';
const router = Router(); router.use(authenticate, requireRole('super-admin', 'brand-admin', 'manager', 'editor'));
router.get('/:tenantId/:attractionId/:locale', getAttractionTranslation);
router.put('/:tenantId/:attractionId/:locale', saveAttractionTranslation);
router.post('/:tenantId/:attractionId/:locale/transition', requireRole('super-admin', 'brand-admin', 'manager'), transitionAttractionTranslation);
export default router;
