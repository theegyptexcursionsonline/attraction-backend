import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.middleware';
import { optionalTenant, requireTenant } from '../middleware/tenant.middleware';
import { validateQuery } from '../middleware/validate.middleware';
import { publicRouteCompositionRequest } from '../services/publicRouteComposition.schema';
import { getPublicRouteComposition } from '../controllers/publicRouteComposition.controller';

const router = Router();

router.get('/route-composition', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.vary('X-Tenant-ID');
  next();
}, validateQuery(publicRouteCompositionRequest), optionalAuth, optionalTenant,
requireTenant, getPublicRouteComposition);

export default router;
