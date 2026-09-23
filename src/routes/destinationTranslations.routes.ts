import { Router } from 'express';
import { authenticate,requireRole } from '../middleware/auth.middleware';
import { getDestinationTranslation,saveDestinationTranslation,transitionDestinationTranslation } from '../controllers/destinationTranslations.controller';
const router = Router(); router.use(authenticate,requireRole('super-admin','brand-admin','manager','editor'));
router.get('/:tenantId/:destinationId/:locale',getDestinationTranslation);
router.put('/:tenantId/:destinationId/:locale',saveDestinationTranslation);
router.post('/:tenantId/:destinationId/:locale/transition',requireRole('super-admin','brand-admin','manager'),transitionDestinationTranslation);
export default router;
