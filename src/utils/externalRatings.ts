import { z } from 'zod';

const hosts = new Set(['www.getyourguide.com', 'getyourguide.com']);
const activityPath = /^\/[a-z0-9-]+-l[1-9]\d*\/[a-z0-9-]+-t([1-9]\d*)\/$/;
function activityId(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password || url.port || url.search || url.hash || url.href !== value) return undefined;
    return activityPath.exec(url.pathname)?.[1];
  } catch { return undefined; }
}
const plainTitle = z.string().trim().min(1).max(250).refine(value => !/[<>\u0000-\u001f\u007f]/.test(value), 'Use a plain activity title');
/** An attributed external activity snapshot, never an internal review aggregate. */
export const externalRatingSchema = z.object({
  source: z.literal('getyourguide'),
  activitySlug: z.string().trim().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  activityTitle: plainTitle,
  activityUrl: z.string().trim().max(2048).refine(value => !!activityId(value), 'Use a canonical HTTPS GetYourGuide activity URL'),
  score: z.number().finite().min(0).max(5),
  count: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  checkedAt: z.union([z.string().date(), z.string().datetime({ offset: true })]),
}).strict();
export type ExternalRatingSnapshot = z.infer<typeof externalRatingSchema>;
export const externalRatingsSchema = z.array(externalRatingSchema).max(10).superRefine((rows,context) => {
  const ids = new Set<string>(); const slugs = new Set<string>();
  rows.forEach((row,index) => {
    const id = activityId(row.activityUrl)!;
    if (ids.has(id) || slugs.has(row.activitySlug)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: 'Each canonical activity can have only one rating snapshot' });
    ids.add(id); slugs.add(row.activitySlug);
  });
});
/** Ignore malformed legacy/configuration records; ambiguous duplicates are all
 * omitted rather than arbitrarily choosing which score to show. */
export function publicExternalRatings(value: unknown): ExternalRatingSnapshot[] {
  if (!Array.isArray(value) || value.length > 10) return [];
  const rows = value.flatMap(item => { const parsed = externalRatingSchema.safeParse(item); return parsed.success ? [parsed.data] : []; });
  const ids = new Map<string,number>(); const slugs = new Map<string,number>();
  for (const row of rows) { const id = activityId(row.activityUrl)!; ids.set(id,(ids.get(id) || 0)+1); slugs.set(row.activitySlug,(slugs.get(row.activitySlug) || 0)+1); }
  return rows.filter(row => ids.get(activityId(row.activityUrl)!) === 1 && slugs.get(row.activitySlug) === 1);
}
