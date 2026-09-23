import { z } from 'zod';

export const imageAltSchema = z.string().trim().max(300).refine(value => !/[<>\u0000-\u001f\u007f]/.test(value), 'Use plain image description text');
export const secureImageUrlSchema = z.string().trim().max(2048).refine(value => {
  if (value === '') return true;
  if (!value.startsWith('https://') || /[\\\s\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const decoded = decodeURIComponent(value);
    const url = new URL(value);
    return !/[\\\u0000-\u001f\u007f]/.test(decoded) && !url.username && !url.password && !!url.hostname;
  } catch { return false; }
}, 'Use a secure HTTPS image URL without credentials');
export const imageAltTextsSchema = z.array(z.object({
  url: secureImageUrlSchema.refine(value => value.length > 0), alt: imageAltSchema,
}).strict()).max(10).refine(rows => new Set(rows.map(row => row.url)).size === rows.length, 'Each image can have one description');
export type ImageAltText = z.infer<typeof imageAltTextsSchema>[number];

/** Supplied mappings are validated against the effective gallery. Existing
 * mappings survive reorder, and removed images lose their old description. */
export function resolveImageAltTexts(images: string[], supplied: unknown, existing: ImageAltText[] = []): ImageAltText[] {
  const available = new Set(images);
  if (supplied === undefined) return existing.filter(row => available.has(row.url));
  const rows = imageAltTextsSchema.parse(supplied);
  if (rows.some(row => !available.has(row.url))) throw new Error('Image descriptions must refer to an image in this gallery');
  return rows.filter(row => row.alt !== '');
}
