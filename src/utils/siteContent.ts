import { z } from 'zod';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid record ID');
const heading = z.string().trim().max(160).optional();
const base = { id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), title: heading };
const layout = z.enum(['vertical', 'horizontal']);
export const pageSectionsSchema = z.array(z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('content'), body: z.string().max(100000) }),
  z.object({ ...base, type: z.literal('tours'), layout, attractionIds: z.array(objectId).max(100).optional(), categoryIds: z.array(z.string().trim().min(1).max(120)).max(30).optional() }),
  z.object({ ...base, type: z.literal('pages'), layout, pageIds: z.array(objectId).max(100) }),
])).max(40).refine(items => new Set(items.map(item => item.id)).size === items.length, 'Section IDs must be unique');
export type PageSection = z.infer<typeof pageSectionsSchema>[number];

export const isSafeNavigationHref = (href: string): boolean => {
  if (/[\\\s\u0000-\u001f\u007f]/.test(href) || /%0[ad]|%5c/i.test(href)) return false;
  let decoded: string;
  try { decoded = decodeURIComponent(href); } catch { return false; }
  if (/[\\\s\u0000-\u001f\u007f]/.test(decoded)) return false;
  const internal = decoded.startsWith('/') && !decoded.startsWith('//');
  try {
    const url = new URL(decoded, 'https://site.invalid');
    if ([...url.searchParams.keys()].some(key => ['tenant', 'tenantid'].includes(key.toLowerCase()))) return false;
    if (decoded.split(/[?#]/)[0].split('/').some(part => part === '..' || part === '.')) return false;
    return internal || (url.protocol === 'https:' && !url.username && !url.password && /^https:\/\//.test(decoded));
  } catch { return false; }
};
const link = z.object({ label: z.string().trim().min(1).max(100), href: z.string().trim().max(2048).refine(isSafeNavigationHref, 'Use a site path or secure HTTPS URL') });
export const navigationSchema = z.array(link.extend({ columns: z.array(z.object({ label: z.string().trim().min(1).max(100), links: z.array(link).min(1).max(20) })).max(8).optional() })).max(12);
export type SiteNavigation = z.infer<typeof navigationSchema>;
export const menuUpdateSchema = z.object({ navigation: navigationSchema, expectedRevision: z.number().int().nonnegative() }).strict();
export const reservedPageSlugs = new Set(['about', 'accept-invitation', 'account', 'admin', 'adventures', 'api', 'attractions', 'auth', 'blog', 'booking', 'bookings', 'bundle-orders', 'bundles', 'camel-treks', 'cart', 'categories', 'charters', 'checkout', 'contact', 'cookies', 'cruises', 'dashboard', 'day-trips', 'deals', 'desert-safari', 'destinations', 'discover', 'dives', 'dolphin-trips', 'evenings', 'excursions', 'experiences', 'faq', 'flights', 'forgot-password', 'heritage', 'islands', 'jeep-tours', 'journeys', 'license', 'login', 'logout', 'luxury-cruises', 'makadi-adventures', 'opening', 'orangebay', 'payment', 'payments', 'preview', 'preview-unlock', 'privacy', 'private-tours', 'profile', 'reeftrips', 'refunds', 'register', 'reset-password', 'riding', 'robots', 'safaris', 'sailing', 'search', 'signup', 'sitemap', 'snorkeling', 'submarines', 'terms', 'tours', 'trips', 'verify-email', 'water-activities', 'water-sports', 'yachts']);
export const pageSlugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).refine(slug => !reservedPageSlugs.has(slug), 'This URL belongs to a built-in website page');
export const sectionQuerySchema = z.object({ cursor: objectId.optional(), limit: z.coerce.number().int().min(1).max(100).default(12) });

// Presentation is authored independently from search metadata. Empty strings clear optional fields.
export const pagePresentationSchema = z.object({
  layoutMode: z.enum(['website', 'standalone']).optional(),
  heroImage: z.string().trim().max(2048).refine(value => value === '' || (value.startsWith('https://') && isSafeNavigationHref(value)), 'Use a secure HTTPS image URL').optional(),
  heroDescription: z.string().trim().max(1000).optional(),
});
