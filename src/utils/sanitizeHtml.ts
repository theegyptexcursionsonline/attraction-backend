import sanitizeHtml from 'sanitize-html';

const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'a', 'img', 'figure', 'figcaption', 'hr', 'table', 'thead', 'tbody',
    'tr', 'th', 'td', 'div', 'span',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    th: ['scope', 'colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: (_tagName, attribs) => ({
      tagName: 'a',
      attribs: {
        ...attribs,
        ...(attribs.target === '_blank' ? { rel: 'noopener noreferrer' } : {}),
      },
    }),
    img: (_tagName, attribs) => ({
      tagName: 'img',
      attribs: { ...attribs, loading: attribs.loading || 'lazy' },
    }),
  },
};

export const sanitizeRichText = (value: unknown): string =>
  sanitizeHtml(typeof value === 'string' ? value : '', options);

export const sanitizeTranslations = (
  value: unknown
): Record<string, Record<string, unknown>> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([locale, translation]) => {
      if (!translation || typeof translation !== 'object' || Array.isArray(translation)) {
        return [locale, {}];
      }

      const fields = { ...(translation as Record<string, unknown>) };
      if (fields.content !== undefined) fields.content = sanitizeRichText(fields.content);
      if (fields.body !== undefined) fields.body = sanitizeRichText(fields.body);
      return [locale, fields];
    })
  );
};

export const sanitizeCustomPages = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((page): page is Record<string, unknown> => !!page && typeof page === 'object')
    .map((page) => ({ ...page, body: sanitizeRichText(page.body) }));
};
