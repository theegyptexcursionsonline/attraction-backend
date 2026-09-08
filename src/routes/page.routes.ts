import { Router } from 'express';
import { getAdminMenu, updateAdminMenu, getPageSection, archiveAdminPage, createAdminPage, listAdminPages, permanentlyDeleteAdminPage, resolvePage, restoreAdminPage, tenantSitemap, trashAdminPage, unarchiveAdminPage, updateAdminPage } from '../controllers/page.controller';
import { optionalTenant, optionalAdminTenant, requireTenant } from '../middleware/tenant.middleware';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { z } from 'zod';
import { menuUpdateSchema, pageSectionsSchema, pageSlugSchema, sectionQuerySchema } from '../utils/siteContent';
import { validateQuery } from '../middleware/validate.middleware';

const router = Router();
router.param('id', (req, res, next, id) => { if (!/^[a-f0-9]{24}$/i.test(id)) { res.status(400).json({ success: false, error: 'Invalid page ID' }); return; } next(); });
const pageSchema = z.object({
  slug: pageSlugSchema,
  title: z.string().trim().min(1).max(160),
  metaTitle: z.string().max(160).optional(), metaDescription: z.string().max(320).optional(),
  body: z.string().max(100000).default(''), sections: pageSectionsSchema.optional(), pageType: z.enum(['attraction', 'category']),
  parentPath: z.string().regex(/^\/(?!\/)[a-z0-9/_-]*$/), categoryIds: z.array(z.string()).max(100).optional(),
  isPublished: z.boolean().optional(),
});

router.get('/admin/menu', authenticate, optionalAdminTenant, requireRole('super-admin', 'brand-admin', 'manager'), getAdminMenu);
router.put('/admin/menu', authenticate, optionalAdminTenant, requireRole('super-admin', 'brand-admin', 'manager'), validate(menuUpdateSchema), updateAdminMenu);
router.get('/sections/:pageId/:sectionId', optionalTenant, requireTenant, validateQuery(sectionQuerySchema), getPageSection);
router.get('/admin', authenticate, optionalAdminTenant, requireRole('super-admin', 'brand-admin', 'manager'), validateQuery(z.object({ page: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().positive().max(100).optional(), search: z.string().trim().max(128).optional(), lifecycle: z.enum(['active', 'archive', 'trash']).optional(), published: z.enum(['true', 'false']).optional() })), listAdminPages);
router.post('/admin', authenticate, optionalAdminTenant, requireRole('super-admin', 'brand-admin', 'manager'), validate(pageSchema), createAdminPage);
router.patch('/admin/:id', authenticate, optionalAdminTenant, requireRole('super-admin', 'brand-admin', 'manager'), validate(pageSchema.partial().extend({ expectedRevision: z.number().int().nonnegative() }).refine(value => Object.keys(value).some(key => key !== 'expectedRevision'), 'Provide a page change').refine(value => value.sections === undefined || value.expectedRevision !== undefined, 'Reload the page before saving sections')), updateAdminPage);
router.post('/admin/:id/archive', authenticate, optionalAdminTenant, requireRole('super-admin', 'brand-admin', 'manager'), archiveAdminPage);
router.post('/admin/:id/trash', authenticate, optionalAdminTenant, requireRole('super-admin', 'brand-admin', 'manager'), trashAdminPage);
router.post('/admin/:id/unarchive', authenticate, optionalAdminTenant, requireRole('super-admin', 'brand-admin', 'manager'), unarchiveAdminPage);
router.post('/admin/:id/restore', authenticate, optionalAdminTenant, requireRole('super-admin', 'brand-admin', 'manager'), restoreAdminPage);
router.delete('/admin/:id/permanent', authenticate, optionalAdminTenant, requireRole('super-admin', 'brand-admin'), permanentlyDeleteAdminPage);

router.get('/resolve', optionalTenant, resolvePage);
router.get('/sitemap.xml', optionalTenant, requireTenant, tenantSitemap);

export default router;
