/**
 * Escape special regex characters in a user-supplied string to prevent
 * ReDoS and NoSQL injection via $regex.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Longest user-supplied value accepted by a regex-backed search. */
export const MAX_REGEX_SEARCH_LENGTH = 128;

/**
 * Convert search-box input into a bounded literal pattern for Mongo `$regex`
 * clauses and JavaScript `RegExp` instances.
 *
 * Search input is text, never an executable pattern. Accepting `unknown` keeps
 * controller-level defence in depth even when a route is called without its
 * normal query validator (for example from a focused unit test).
 */
export function searchRegexValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  const bounded = Array.from(value.trim()).slice(0, MAX_REGEX_SEARCH_LENGTH).join('');
  return escapeRegex(bounded);
}

/**
 * Strip HTML tags and common XSS vectors from user-generated content.
 */
export function sanitizeHtml(str: string): string {
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}
