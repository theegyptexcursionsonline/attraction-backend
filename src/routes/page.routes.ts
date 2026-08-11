import { Router } from 'express';
import { archiveAdminPage, createAdminPage, listAdminPages, permanentlyDeleteAdminPage, resolvePage, restoreAdminPage, tenantSitemap, trashAdminPage, unarchiveAdminPage, updateAdminPage } from '../controllers/page.controller';
import { optionalTenant, requireTenant } from '../middleware/tenant.middleware';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { z } from 'zod';

const router = Router();
const pageSchema = z.object({
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(160),
  metaTitle: z.string().max(160).optional(), metaDescription: z.string().max(320).optional(),
  body: z.string().min(1), pageType: z.enum(['attraction', 'category']),
  parentPath: z.string().regex(/^\/(?!\/)[a-z0-9/_-]*$/), categoryIds: z.array(z.string()).max(100).optional(),
});

router.get('/admin', authenticate, optionalTenant, requireRole('super-admin', 'brand-admin', 'manager'), listAdminPages);
router.post('/admin', authenticate, optionalTenant, requireRole('super-admin', 'brand-admin', 'manager'), validate(pageSchema), createAdminPage);
router.patch('/admin/:id', authenticate, optionalTenant, requireRole('super-admin', 'brand-admin', 'manager'), validate(pageSchema.partial()), updateAdminPage);
router.post('/admin/:id/archive', authenticate, optionalTenant, requireRole('super-admin', 'brand-admin', 'manager'), archiveAdminPage);
router.post('/admin/:id/trash', authenticate, optionalTenant, requireRole('super-admin', 'brand-admin', 'manager'), trashAdminPage);
router.post('/admin/:id/unarchive', authenticate, optionalTenant, requireRole('super-admin', 'brand-admin', 'manager'), unarchiveAdminPage);
router.post('/admin/:id/restore', authenticate, optionalTenant, requireRole('super-admin', 'brand-admin', 'manager'), restoreAdminPage);
router.delete('/admin/:id/permanent', authenticate, optionalTenant, requireRole('super-admin', 'brand-admin'), permanentlyDeleteAdminPage);

router.get('/resolve', optionalTenant, resolvePage);
router.get('/sitemap.xml', optionalTenant, requireTenant, tenantSitemap);

export default router;
