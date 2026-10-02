import { z } from 'zod';

/** Whether search engines may index a site. Absent on older sites, which means visible. */
export const SEARCH_VISIBILITY = ['visible', 'hidden'] as const;
export type SearchVisibility = typeof SEARCH_VISIBILITY[number];

/** Google shows about 60 title and 155 description characters; the editor warns past those. */
export const SITE_SEO_LIMITS = { metaTitle: 70, metaDescription: 200, keyword: 60, keywords: 20 } as const;

const plain = (max: number) => z.string().trim().max(max)
  .refine(value => !/[<>\u0000-\u001f\u007f]/.test(value), 'Use plain text without HTML or control characters');
const image = z.string().trim().max(2048).refine(value => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash
      && !/[\s<>\\]/.test(value) && !/[\\\u0000-\u001f\u007f]/.test(decodeURIComponent(value));
  } catch { return false; }
}, 'Use a public HTTPS image URL without credentials');

export const siteSeoSnapshotSchema = z.object({
  metaTitle: plain(SITE_SEO_LIMITS.metaTitle),
  metaDescription: plain(SITE_SEO_LIMITS.metaDescription),
  keywords: z.array(plain(SITE_SEO_LIMITS.keyword).refine(value => value.length > 0, 'Remove empty keywords'))
    .max(SITE_SEO_LIMITS.keywords)
    .refine(values => new Set(values.map(value => value.toLowerCase())).size === values.length, 'Each keyword once'),
  ogImage: image,
  searchVisibility: z.enum(SEARCH_VISIBILITY),
}).strict();
export type SiteSeoSnapshot = z.infer<typeof siteSeoSnapshotSchema>;

/** The editor replaces the whole snapshot, guarded by the revision it loaded. */
export const seoSettingsUpdateSchema = z.object({
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  seoSettings: siteSeoSnapshotSchema,
}).strict();

/** Stored form: an empty share image is no share image. */
export const storedSiteSeo = (snapshot: SiteSeoSnapshot) => ({
  metaTitle: snapshot.metaTitle,
  metaDescription: snapshot.metaDescription,
  keywords: snapshot.keywords,
  ...(snapshot.ogImage ? { ogImage: snapshot.ogImage } : {}),
  searchVisibility: snapshot.searchVisibility,
});

const text = (value: unknown): string => typeof value === 'string' ? value : '';

/** The editor's view of any stored record, legacy or partial: never undefined fields. */
export const adminSiteSeo = (value: unknown): SiteSeoSnapshot => {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    metaTitle: text(record.metaTitle),
    metaDescription: text(record.metaDescription),
    keywords: Array.isArray(record.keywords) ? record.keywords.filter((item): item is string => typeof item === 'string') : [],
    ogImage: text(record.ogImage),
    searchVisibility: record.searchVisibility === 'hidden' ? 'hidden' : 'visible',
  };
};

export const seoRevisionOf = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;

const touchesSeo = (key: string) => key === 'seoSettings' || key.startsWith('seoSettings.');

/**
 * Removes site SEO writes from a model update that did not come from the revision-checked SEO
 * editor. General settings saves echo the snapshot they loaded; without this a stale save would
 * silently undo an SEO change (or a "hide from search engines" switch). Returns true when
 * something was removed. Mutates `update` in place, as Mongoose query middleware expects.
 */
export function dropUnrevisionedSeoWrites(update: Record<string, unknown>): boolean {
  const entries = Object.entries(update);
  const revisioned = entries.some(([operator, raw]) => operator === 'seoSettingsRevision'
    || (operator.startsWith('$') && !!raw && typeof raw === 'object' && 'seoSettingsRevision' in raw));
  if (revisioned) return false;
  let dropped = false;
  for (const [operator, raw] of entries) {
    if (!operator.startsWith('$')) {
      if (touchesSeo(operator)) { delete update[operator]; dropped = true; }
      continue;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const fields = raw as Record<string, unknown>;
    for (const key of Object.keys(fields)) {
      const renamedTo = operator === '$rename' && typeof fields[key] === 'string' ? fields[key] as string : '';
      if (touchesSeo(key) || (renamedTo && touchesSeo(renamedTo))) { delete fields[key]; dropped = true; }
    }
  }
  return dropped;
}
