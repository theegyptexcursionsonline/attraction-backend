import { sanitizeRichText, sanitizePageSections } from './sanitizeHtml';
import { SAFARI_QUAD_PAGE_ID, SAFARI_TENANT_ID } from './safariLegacyPages';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * One piece of content that has lived at several public addresses — an old WordPress URL, an
 * interim URL on the new site, the address it has today. `slugs` is in preference order and
 * `pageIds` lets a family follow its page through a later rename.
 */
export interface LegacyUrlFamily { slugs: readonly string[]; pageIds: readonly string[] }

/**
 * Old public addresses per site (keyed by tenant id). A request for an address nothing serves
 * any more is sent to whichever family member a published page serves right now, so the old
 * link keeps working whichever way the editor later rebuilds or renames the page.
 */
export const LEGACY_URL_FAMILIES: Readonly<Record<string, readonly LegacyUrlFamily[]>> = {
  [SAFARI_TENANT_ID]: [
    // 11 Sep: the editor rebuilt the Quad, Jeep and Polaris pages on their WordPress addresses,
    // which retired the 9 Sep interim addresses and the old page ids.
    {
      slugs: ['hurghada-quad-biking', 'quad-biking', 'hurghada-quad-biking-tours'],
      pageIds: ['6aa2c2c4aed8540632bb2f1e', SAFARI_QUAD_PAGE_ID],
    },
    { slugs: ['hurghada-jeep-safari', 'jeep-buggy-safari'], pageIds: ['6aa2c34aaed8540632bb331b', '6aa0865d3fae11568393ea3c'] },
    { slugs: ['polaris-rzr-safari-hurghada', 'polaris-rzr-safari'], pageIds: ['6aa2c04daed8540632bb21bd', '6aa0832d3fae11568393e1e8'] },
  ],
};

const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

/** Whether `slug` is an old address of some content on this site (cheap pre-check before any read). */
export function legacyUrlFamily(tenantId: string, slug: string): LegacyUrlFamily | null {
  if (!SLUG.test(slug)) return null;
  return own(LEGACY_URL_FAMILIES, tenantId)?.find(family => family.slugs.includes(slug)) ?? null;
}

type PageRecord = { _id?: unknown; slug?: unknown; status?: unknown; isPublished?: unknown; [key: string]: unknown };
const live = (page: PageRecord): boolean => page.status === 'active' && page.isPublished === true && typeof page.slug === 'string' && SLUG.test(page.slug);

/**
 * Resolve an old address to the published page that carries its content today.
 *
 * Fails closed (returns null) when the requested address is still held by any page or tour that
 * is on the website — including a draft being rebuilt there — or when no family member is live.
 * The target is always an exact, live page address on the same site, so a redirect never chains.
 */
export function resolveLegacyPage(tenantId: string, slug: string, pages: PageRecord[], heldByTour: boolean) {
  const family = legacyUrlFamily(tenantId, slug);
  if (!family || heldByTour) return null;
  if (pages.some(page => page.slug === slug && page.status !== 'archived')) return null;

  const bySlug = family.slugs.filter(candidate => candidate !== slug)
    .map(candidate => pages.find(page => page.slug === candidate && live(page)))
    .find(Boolean);
  const target = bySlug ?? family.pageIds
    .map(id => pages.find(page => String(page._id) === id && live(page) && page.slug !== slug))
    .find(Boolean);
  if (!target) return null;

  return {
    type: 'page' as const,
    redirectTo: `/${target.slug as string}`,
    page: {
      ...target,
      layoutMode: target.layoutMode ?? 'website',
      body: sanitizeRichText(target.body),
      ...(target.sections !== undefined ? { sections: sanitizePageSections(target.sections) } : {}),
    },
  };
}
