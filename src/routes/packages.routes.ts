import { Router } from 'express';
import {
  addPackageDepartures,
  deletePackageDeparture,
  getPackageCalendar,
  getPackageForEditor,
  listPackageDepartures,
  publishPackage,
  quotePackage,
  savePackageDetails,
  upsertPackageDeparture,
} from '../controllers/packages.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { optionalTenant } from '../middleware/tenant.middleware';

/**
 * Package listings. The listing itself (title, text, images, sites, URL) is created and edited
 * through the attraction endpoints like every tour; these routes own what is particular to a
 * package. Roles mirror tours: whoever may edit and publish a tour may edit and publish a package,
 * and departures follow the stop-sale roles.
 */
const router = Router();

const EDIT_ROLES = ['super-admin', 'brand-admin', 'manager', 'editor'];
const READ_ROLES = [...EDIT_ROLES, 'viewer'];
const SEAT_ROLES = ['super-admin', 'brand-admin', 'manager'];

// Public: a published package listed on the requesting site.
router.get('/:id/calendar', optionalTenant, getPackageCalendar);
router.post('/:id/quote', optionalTenant, quotePackage);

// Package editor.
router.get('/:id', authenticate, requireRole(...READ_ROLES), getPackageForEditor);
router.put('/:id', authenticate, requireRole(...EDIT_ROLES), savePackageDetails);
router.post('/:id/publish', authenticate, requireRole(...EDIT_ROLES), publishPackage);

// Dated departures and their seats.
router.get('/:id/departures', authenticate, requireRole(...READ_ROLES), listPackageDepartures);
router.post('/:id/departures', authenticate, requireRole(...SEAT_ROLES), addPackageDepartures);
router.put('/:id/departures/:date', authenticate, requireRole(...SEAT_ROLES), upsertPackageDeparture);
router.delete('/:id/departures/:date', authenticate, requireRole(...SEAT_ROLES), deletePackageDeparture);

export default router;
