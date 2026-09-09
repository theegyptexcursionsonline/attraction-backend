import { sanitizeRichText, sanitizePageSections } from './sanitizeHtml';

export const SAFARI_TENANT_ID = '69fc3f42ec93e48e8efd4455';
export const SAFARI_QUAD_PAGE_ID = '6aa088053fae11568393effa';
export const SAFARI_LEGACY_PAGES: Record<string, { pageId: string; retiredTourId?: string }> = {
  'hurghada-quad-biking': { pageId: SAFARI_QUAD_PAGE_ID, retiredTourId: '69fc40483ac583b3163b9989' },
  'hurghada-quad-biking-tours': { pageId: SAFARI_QUAD_PAGE_ID },
  'hurghada-jeep-safari': { pageId: '6aa0865d3fae11568393ea3c', retiredTourId: '69fc40523ac583b3163b9992' },
  'polaris-rzr-safari-hurghada': { pageId: '6aa0832d3fae11568393e1e8', retiredTourId: '69fc40603ac583b3163b99ad' },
};

export const hasSafariLegacyPage = (slug: string): boolean => Object.prototype.hasOwnProperty.call(SAFARI_LEGACY_PAGES, slug);

export function safariLegacyPage(tenantId: string, slug: string, pages: any[], owners: any[]) {
  const mapping = tenantId === SAFARI_TENANT_ID && hasSafariLegacyPage(slug) ? SAFARI_LEGACY_PAGES[slug] : undefined;
  if (!mapping || pages.some(page => page.slug === slug)) return null;
  if (mapping.retiredTourId) {
    if (owners.length !== 1 || String(owners[0]._id) !== mapping.retiredTourId || owners[0].status !== 'archived') return null;
  } else if (owners.length) return null;
  const page = pages.find(candidate => String(candidate._id) === mapping.pageId);
  if (!page || page.status !== 'active' || page.isPublished !== true || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug) || hasSafariLegacyPage(page.slug)) return null;
  return { type: 'page' as const, redirectTo: `/${page.slug}`, page: {
    ...page, body: sanitizeRichText(page.body),
    ...(page.sections !== undefined ? { sections: sanitizePageSections(page.sections) } : {}),
  } };
}
