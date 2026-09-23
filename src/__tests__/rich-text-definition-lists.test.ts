import { sanitizeCustomPages, sanitizeRichText, sanitizeTranslations } from '../utils/sanitizeHtml';

const specifications = '<dl><dt>Length</dt><dd>28 m</dd><dt>Engines</dt><dd>2× MAN V8</dd></dl>';

describe('rich text definition lists', () => {
  it('preserves semantic labels and values across repeated public sanitization', () => {
    expect(sanitizeRichText(specifications)).toBe(specifications);
    expect(sanitizeRichText(sanitizeRichText(specifications))).toBe(specifications);
  });

  it('preserves definition lists in custom pages and translations', () => {
    expect(sanitizeCustomPages([{ body: specifications }])[0]).toMatchObject({ body: specifications });
    expect(sanitizeTranslations({ de: { body: specifications, content: specifications } })).toEqual({
      de: { body: specifications, content: specifications },
    });
  });

  it('does not permit scripts, event handlers, styles or unsafe links on the added tags', () => {
    const result = sanitizeRichText('<dl onclick="alert(1)" style="position:fixed"><dt id="unsafe" onmouseover="alert(1)">Length<script>alert(1)</script></dt><dd><a href="javascript:alert(1)">28 m</a><iframe src="https://example.test"></iframe></dd></dl>');
    expect(result).toBe('<dl><dt>Length</dt><dd><a>28 m</a></dd></dl>');
  });

  it('fails closed for non-string content', () => {
    expect(sanitizeRichText({ body: specifications })).toBe('');
    expect(sanitizeRichText(null)).toBe('');
  });
});
