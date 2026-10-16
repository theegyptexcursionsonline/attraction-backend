import { ContentLocaleSchema } from './contentReceiverContract';

/**
 * Journal articles are written in their own language (`defaultLocale`) and may carry
 * translations keyed by locale. A reader who asks for a language sees one article in
 * one language: either every reader-facing field from a complete translation, or the
 * original untouched. Fields are never mixed, so a German page never shows an English
 * title over a German body.
 */

type Translation = Record<string, unknown>;

const filled = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** A translation counts once it has its own title and body. */
function completeTranslation(value: unknown): Translation | null {
  const translation = record(value);
  return filled(translation.title) && filled(translation.content) ? translation : null;
}

function ownLocale(post: Record<string, unknown>): string {
  return filled(post.defaultLocale) && ContentLocaleSchema.safeParse(post.defaultLocale.trim()).success
    ? post.defaultLocale.trim()
    : 'en';
}

/** The languages a reader can open, the article's own first. */
export function availableBlogLocales(post: Record<string, unknown>): string[] {
  const own = ownLocale(post);
  const translations = record(post.translations);
  return [
    own,
    ...Object.keys(translations).filter(
      (locale) =>
        locale !== own &&
        ContentLocaleSchema.safeParse(locale).success &&
        completeTranslation(translations[locale]) !== null
    ),
  ];
}

const faqs = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map(record)
        .filter((faq) => filled(faq.question) && filled(faq.answer))
        .map((faq) => ({ question: (faq.question as string).trim(), answer: (faq.answer as string).trim() }))
    : [];

/**
 * The article as a reader of `locale` sees it. `contentLocale` names the language of
 * the returned fields; `availableLocales` lists every language the article can be read in.
 */
export function localizeBlogPost<T extends Record<string, unknown>>(
  post: T,
  locale?: string
): T & { contentLocale: string; availableLocales: string[] } {
  const availableLocales = availableBlogLocales(post);
  const own = availableLocales[0];
  const translation =
    locale && locale !== own && availableLocales.includes(locale)
      ? completeTranslation(record(post.translations)[locale])
      : null;
  if (!translation) return { ...post, contentLocale: own, availableLocales };
  return {
    ...post,
    title: (translation.title as string).trim(),
    excerpt: filled(translation.excerpt) ? translation.excerpt.trim() : '',
    ...('content' in post ? { content: translation.content } : {}),
    // Search snippets fall back to the translated title and excerpt, never the original's.
    metaTitle: filled(translation.metaTitle) ? translation.metaTitle.trim() : undefined,
    metaDescription: filled(translation.metaDescription) ? translation.metaDescription.trim() : undefined,
    ...('tags' in post ? { tags: Array.isArray(translation.tags) ? translation.tags.filter(filled) : [] } : {}),
    ...('faqs' in post ? { faqs: faqs(translation.faqs) } : {}),
    contentLocale: locale as string,
    availableLocales,
  };
}

const textAt = (path: string) => ({ $cond: [{ $eq: [{ $type: path }, 'string'] }, path, ''] });
const filledAt = (path: string) => ({ $gt: [{ $strLenCP: { $trim: { input: textAt(path) } } }, 0] });

/**
 * List rows read each translation's card fields; a body is reduced to a marker that
 * says whether it exists, so a page of cards never carries every article's full text.
 */
export const BLOG_LIST_TRANSLATIONS = {
  $arrayToObject: {
    $map: {
      input: {
        $objectToArray: { $cond: [{ $eq: [{ $type: '$translations' }, 'object'] }, '$translations', {}] },
      },
      as: 'translation',
      in: {
        k: '$$translation.k',
        v: {
          title: textAt('$$translation.v.title'),
          excerpt: textAt('$$translation.v.excerpt'),
          tags: { $cond: [{ $isArray: '$$translation.v.tags' }, '$$translation.v.tags', []] },
          content: { $cond: [filledAt('$$translation.v.content'), 'present', ''] },
        },
      },
    },
  },
};

/** One list card in the requested language; the translation map itself never leaves the API. */
export function localizeBlogListRow(row: Record<string, unknown>, locale?: string): Record<string, unknown> {
  const { translations, ...card } = localizeBlogPost(row, locale);
  void translations;
  return card;
}

/** Field paths a search may read for `locale`; the locale is a validated key, never free text. */
export function blogSearchFields(locale?: string): string[] {
  const own = ['title', 'excerpt', 'category'];
  return locale && ContentLocaleSchema.safeParse(locale).success
    ? [...own, `translations.${locale}.title`, `translations.${locale}.excerpt`]
    : own;
}
