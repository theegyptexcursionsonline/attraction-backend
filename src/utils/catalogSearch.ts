import { escapeRegex, MAX_REGEX_SEARCH_LENGTH } from './helpers';

/** Words past this many are ignored; eight is far beyond what anyone types into a tour search. */
export const MAX_CATALOG_SEARCH_WORDS = 8;

/** The attraction fields a shopper's words are looked for in. */
const CATALOG_SEARCH_FIELDS = ['title', 'shortDescription', 'description', 'destination.city'] as const;

/**
 * A plural typed by the shopper still finds a singular title: "pyramids" finds "The Great Pyramid
 * of Khufu" and "horses" finds "Horse Riding" (the old `$text` search stemmed words, so dropping
 * this lost results it used to find). The stem is a substring of the plural, so it only widens.
 * Words shorter than four letters and words ending in "ss" ("glass") are left as typed.
 */
export function singularStem(word: string): string {
  const lower = word.toLowerCase();
  if (Array.from(word).length < 4 || !lower.endsWith('s') || lower.endsWith('ss')) return word;
  if (lower.endsWith('ies') && word.length >= 5) return word.slice(0, -3);
  if (/(?:ch|sh|x|z|ss)es$/.test(lower)) return word.slice(0, -2);
  return word.slice(0, -1);
}

export class InvalidCatalogSearch extends Error {
  statusCode = 400;
  constructor() { super(`Search must be text of at most ${MAX_REGEX_SEARCH_LENGTH} characters`); }
}

/**
 * The storefront catalogue search behind `GET /attractions?search=`. Every word typed must
 * appear — in the title, the descriptions or the city — as written, in any letter case, so
 * "Makadi Bay horse riding" finds the horse ride instead of every tour mentioning "bay", a
 * part-word such as "bugg" still finds the buggy tours, and a plural finds its singular. Words
 * are matched literally, never as a pattern. The search is one piece of text of at most 128 characters (a repeated parameter or a
 * longer text is refused, as on every other search route); blank text is no filter.
 */
export function catalogSearchFilter(search: unknown): { $and: Array<Record<string, unknown>> } | null {
  if (search === undefined) return null;
  if (typeof search !== 'string' || Array.from(search).length > MAX_REGEX_SEARCH_LENGTH) throw new InvalidCatalogSearch();
  const words = search.trim().split(/\s+/u).filter(Boolean).slice(0, MAX_CATALOG_SEARCH_WORDS);
  if (!words.length) return null;
  return {
    $and: words.map((word) => {
      const pattern = new RegExp(escapeRegex(singularStem(word)), 'i');
      return { $or: CATALOG_SEARCH_FIELDS.map((field) => ({ [field]: pattern })) };
    }),
  };
}
