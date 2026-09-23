import { z } from 'zod';

export const FIXED_PAGE_KEYS = ['home', 'cruises', 'destinations', 'deals', 'about', 'faq', 'contact', 'blog', 'terms', 'privacy'] as const;
const plain = (max: number) => z.string().trim().max(max).refine(value => !/[<>\u0000-\u001f\u007f]/.test(value), 'Use plain text without HTML or control characters');
const image = z.string().trim().max(2048).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !/[\s<>\\]/.test(value) && !/[\\\u0000-\u001f\u007f]/.test(decodeURIComponent(value)); } catch { return false; }
}, 'Use a public HTTPS image URL without credentials');
export const fixedPageSeoSchema = z.object({ title: plain(120), description: plain(320), heading: plain(160), ogImage: image }).strict();
export const fixedPagesSchema = z.object(Object.fromEntries(FIXED_PAGE_KEYS.map(key => [key, fixedPageSeoSchema.optional()])) as Record<typeof FIXED_PAGE_KEYS[number], z.ZodOptional<typeof fixedPageSeoSchema>>).strict();
export const pageSeoSchema = z.object({ version: z.literal(1), pages: fixedPagesSchema }).strict();
export type PageSeo = z.infer<typeof pageSeoSchema>;
export const pageSeoUpdateSchema = z.object({ expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1), pages: fixedPagesSchema }).strict();
export const publicPageSeo = (value: unknown): PageSeo => {
  const parsed = pageSeoSchema.safeParse(value);
  return parsed.success ? parsed.data : { version: 1, pages: {} };
};
/** Legacy settings snapshots must never overwrite the separately versioned page editor. */
export const withoutPageSeoFields = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('$') && !['pageSeo', 'pageSeoRevision'].some(field => key === field || key.startsWith(`${field}.`))));
};
