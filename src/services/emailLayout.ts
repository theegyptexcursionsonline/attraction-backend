/**
 * One design system for every transactional email a site sends.
 *
 * Email clients are not browsers: layout is table-based, every style that matters is inline
 * (Gmail and Outlook drop or rewrite parts of <style>), and the <style> block only adds
 * progressive enhancements (phone padding, stacked rows, full-width buttons, dark mode).
 * Colours adapt to the site's brand colour but are always contrast-checked, so a light brand
 * colour such as gold never produces unreadable white-on-gold text.
 *
 * Escaping contract: parameters named `...Html` must already be escaped or built from these
 * components; every other string parameter is escaped here.
 *
 * Two ways in:
 *  - `renderEmailDocument(doc)` — HTML only, `blocks` are pre-rendered component strings.
 *    Kept for callers that assemble their own markup (bundle outbox).
 *  - `renderEmail(spec)` — the one to prefer. `blocks` are data (`EmailBlockSpec`), so the same
 *    description produces BOTH the HTML and the plain-text alternative the standard requires,
 *    and the two can never drift apart.
 */

export type EmailDir = 'ltr' | 'rtl';

export interface LayoutBrand {
  name: string;
  origin: string;
  color: string;
  logo?: string;
  /** Reading direction of the recipient's language. Defaults to 'ltr'. */
  dir?: EmailDir;
  /** BCP-47 tag for <html lang>. Defaults to 'en'. */
  lang?: string;
}

export type EmailTone = 'brand' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";
const INK = '#1c1917';
const MUTED = '#57534e';
const FAINT = '#8a847c';
const LINE = '#ece7df';
const PANEL = '#faf8f4';
const PAGE = '#f4f1ec';

/** Dark-mode surfaces. Every pairing below is >= 4.5:1, asserted in `email-standard.test.ts`. */
const DARK = {
  page: '#14110e',
  card: '#1c1917',
  panel: '#26221e',
  line: '#3d3830',
  ink: '#f5f5f4',
  muted: '#d7d3ce',
  faint: '#aaa49c',
} as const;

/** Languages that read right-to-left. Used to pick `dir` from a tenant's default language. */
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'dv', 'ku', 'yi']);

/** 'rtl' when the language code (e.g. `ar`, `ar-EG`) reads right-to-left, else 'ltr'. */
export const directionForLanguage = (language?: string | null): EmailDir => {
  const primary = String(language || '').trim().toLowerCase().split(/[-_]/)[0];
  return RTL_LANGUAGES.has(primary) ? 'rtl' : 'ltr';
};

export const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Turn one of OUR OWN escaped HTML fragments back into the text it was built from, for the
 * plain-text alternative. This is not a "strip the whole email" dump: it runs per field, on
 * markup this module produced, so the result is the original value the caller passed in.
 */
export const htmlFragmentToText = (fragment: string): string =>
  String(fragment ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h1|h2|h3)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;|&#8199;|&#65279;|&#847;/g, ' ')
    .replace(/&middot;|&#183;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&copy;/g, '©')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();

const dirOf = (brand: LayoutBrand): EmailDir => (brand.dir === 'rtl' ? 'rtl' : 'ltr');
const startAlign = (dir: EmailDir): 'left' | 'right' => (dir === 'rtl' ? 'right' : 'left');

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

const parseHex = (hex: string): [number, number, number] | null => {
  const value = hex.trim().replace('#', '');
  const full = value.length === 3 ? value.split('').map((char) => char + char).join('') : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16)) as [number, number, number];
};

const toHex = (rgb: [number, number, number]): string =>
  `#${rgb.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`;

const luminance = ([r, g, b]: [number, number, number]): number => {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

export const contrastRatio = (a: string, b: string): number => {
  const first = parseHex(a);
  const second = parseHex(b);
  if (!first || !second) return 1;
  const [light, dark] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

/** Text colour for a button filled with the brand colour: whichever of white or ink reads better. */
export const onColor = (hex: string): '#ffffff' | '#1c1917' =>
  contrastRatio(hex, '#ffffff') >= contrastRatio(hex, INK) ? '#ffffff' : INK;

/** The brand colour darkened until it is readable as text on white (WCAG AA, 4.5:1). */
export const inkColor = (hex: string): string => {
  let rgb = parseHex(hex);
  if (!rgb) return INK;
  for (let step = 0; step < 20 && contrastRatio(toHex(rgb), '#ffffff') < 4.5; step += 1) {
    rgb = rgb.map((channel) => channel * 0.88) as [number, number, number];
  }
  return toHex(rgb);
};

/**
 * The brand colour lightened until it is readable as text on the dark-mode card (WCAG AA).
 * A deep navy brand is invisible on #1c1917 otherwise.
 */
export const darkInkColor = (hex: string): string => {
  let rgb = parseHex(hex);
  if (!rgb) return DARK.ink;
  for (let step = 0; step < 24 && contrastRatio(toHex(rgb), DARK.card) < 4.5; step += 1) {
    rgb = rgb.map((channel) => 255 - (255 - channel) * 0.86) as [number, number, number];
  }
  return toHex(rgb);
};

/** A pale tint of a colour for backgrounds (mixed with white). */
export const tintColor = (hex: string, amount = 0.1): string => {
  const rgb = parseHex(hex);
  if (!rgb) return PANEL;
  return toHex(rgb.map((channel) => 255 - (255 - channel) * amount) as [number, number, number]);
};

/** A deep shade of a colour for dark-mode backgrounds (mixed with the dark card). */
export const shadeColor = (hex: string, amount = 0.22): string => {
  const rgb = parseHex(hex);
  const base = parseHex(DARK.card) as [number, number, number];
  if (!rgb) return DARK.panel;
  return toHex(rgb.map((channel, index) => base[index] + (channel - base[index]) * amount) as [number, number, number]);
};

const TONES: Record<Exclude<EmailTone, 'brand'>, { ink: string; bg: string }> = {
  success: { ink: '#166534', bg: '#ecfdf3' },
  info: { ink: '#1e40af', bg: '#eff6ff' },
  warning: { ink: '#92400e', bg: '#fffbeb' },
  danger: { ink: '#991b1b', bg: '#fef2f2' },
  neutral: { ink: '#44403c', bg: '#f5f5f4' },
};

/** Dark-mode counterparts. Each ink is >= 4.5:1 on its own bg AND on the dark card. */
const DARK_TONES: Record<Exclude<EmailTone, 'brand'>, { ink: string; bg: string }> = {
  success: { ink: '#86efac', bg: '#13291d' },
  info: { ink: '#a5c9ff', bg: '#15223a' },
  warning: { ink: '#fcd34d', bg: '#2d2410' },
  danger: { ink: '#fca5a5', bg: '#33191a' },
  neutral: { ink: '#d7d3ce', bg: '#2a2622' },
};

const toneColors = (brand: LayoutBrand, tone: EmailTone): { ink: string; bg: string } =>
  tone === 'brand' ? { ink: inkColor(brand.color), bg: tintColor(brand.color, 0.14) } : TONES[tone];

const darkToneColors = (brand: LayoutBrand, tone: EmailTone): { ink: string; bg: string } =>
  tone === 'brand' ? { ink: darkInkColor(brand.color), bg: shadeColor(brand.color, 0.24) } : DARK_TONES[tone];

const validColor = (hex: string): string => (parseHex(hex) ? hex : '#111827');

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface EmailDetailRow {
  label: string;
  valueHtml: string;
  /**
   * The value for the plain-text alternative. Optional: when omitted it is derived from
   * `valueHtml`, which is exact for markup built by this module (`emailCode`, `emailLink`,
   * escaped strings).
   */
  valueText?: string;
  hint?: string;
  /** Larger, brand-coloured value (totals). */
  emphasis?: boolean;
}

/** A label/value list in a soft panel. Rows stack on phones. Latin values are always left-to-right. */
export const emailDetails = (
  brand: LayoutBrand,
  rows: EmailDetailRow[],
  opts: { titleHtml?: string; eyebrow?: string } = {}
): string => {
  const visible = rows.filter((row) => row.valueHtml !== '');
  if (visible.length === 0) return '';
  const ink = inkColor(brand.color);
  const dir = dirOf(brand);
  const align = startAlign(dir);
  const header = opts.titleHtml || opts.eyebrow
    ? `<tr><td class="fx-panel-pad" style="padding:18px 22px 4px;">
        ${opts.eyebrow ? `<div class="fx-brand-ink" style="font-size:11px;line-height:16px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:${ink};">${escapeHtml(opts.eyebrow)}</div>` : ''}
        ${opts.titleHtml ? `<div class="fx-ink" style="margin-top:4px;font-size:18px;line-height:25px;font-weight:700;color:${INK};">${opts.titleHtml}</div>` : ''}
      </td></tr>`
    : '';
  const body = visible.map((row, index) => {
    const border = index === 0 ? '' : `border-top:1px solid ${LINE};`;
    return `<tr class="fx-row">
          <td width="36%" class="fx-label fx-bd" style="padding:12px 0;${border}vertical-align:top;text-align:${align};font-size:13px;line-height:19px;color:${FAINT};">${escapeHtml(row.label)}${row.hint ? `<div style="margin-top:2px;font-size:12px;line-height:17px;color:${FAINT};">${escapeHtml(row.hint)}</div>` : ''}</td>
          <td dir="ltr" align="${align}" class="fx-value fx-bd ${row.emphasis ? 'fx-brand-ink' : 'fx-ink'}" style="padding:12px 0 12px 16px;${border}vertical-align:top;text-align:${align};direction:ltr;unicode-bidi:isolate;word-break:break-word;font-size:${row.emphasis ? '18px' : '14px'};line-height:${row.emphasis ? '24px' : '20px'};font-weight:${row.emphasis ? '800' : '600'};color:${row.emphasis ? ink : INK};">${row.valueHtml}</td>
        </tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="fx-panel fx-bd" style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;">
      ${header}
      <tr><td class="fx-panel-pad" style="padding:${header ? '4px' : '8px'} 22px 10px;">
        <table role="presentation" dir="${dir}" width="100%" cellpadding="0" cellspacing="0">${body}</table>
      </td></tr>
    </table>`;
};

const detailsText = (rows: EmailDetailRow[], opts: { titleHtml?: string; eyebrow?: string } = {}): string => {
  const visible = rows.filter((row) => row.valueHtml !== '');
  if (visible.length === 0) return '';
  const heading = [opts.eyebrow, opts.titleHtml ? htmlFragmentToText(opts.titleHtml) : ''].filter(Boolean).join(' — ');
  const lines = visible.map((row) => {
    const value = row.valueText ?? htmlFragmentToText(row.valueHtml);
    return `${row.label}: ${value}${row.hint ? ` (${row.hint})` : ''}`;
  });
  return [heading, ...lines].filter(Boolean).join('\n');
};

export interface EmailAction {
  label: string;
  url: string;
}

/**
 * Bulletproof buttons: a VML rounded rectangle for Outlook (which ignores padding-on-anchor and
 * border-radius) and a table-cell anchor everywhere else. At least 48px tall, full width on phones.
 */
export const emailButtons = (
  brand: LayoutBrand,
  primary: EmailAction,
  secondary?: EmailAction,
  opts: { outline?: boolean } = {}
): string => {
  const color = validColor(brand.color);
  const cell = (action: EmailAction, kind: 'primary' | 'secondary') => {
    const filled = kind === 'primary' && !opts.outline;
    const fg = filled ? onColor(color) : INK;
    const href = escapeHtml(action.url);
    const label = escapeHtml(action.label);
    // Outlook renders the VML shape; every other client renders the anchor.
    const vmlWidth = Math.min(540, Math.max(200, action.label.length * 11 + 56));
    const vml = `<!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:${vmlWidth}px;" arcsize="21%" ${filled ? `fillcolor="${color}" stroke="f"` : `fillcolor="#ffffff" strokecolor="${LINE}"`}>
            <w:anchorlock/>
            <center style="color:${fg};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${label}</center>
          </v:roundrect>
        <![endif]-->`;
    return `<td class="fx-btn-cell${filled ? '' : ' fx-btn-ghost'}" align="center" ${filled ? `bgcolor="${color}"` : 'bgcolor="#ffffff"'} style="border-radius:10px;${filled ? `background:${color};` : `border:1px solid ${LINE};background:#ffffff;`}">
          ${vml}
          <!--[if !mso]><!-- --><a class="fx-btn" href="${href}" target="_blank" style="display:inline-block;min-height:20px;padding:15px 26px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;text-decoration:none;border-radius:10px;color:${fg};">${label}</a><!--<![endif]-->
        </td>`;
  };
  return `<table role="presentation" cellpadding="0" cellspacing="0" class="fx-btns"><tr>
      ${cell(primary, 'primary')}
      ${secondary ? `<td class="fx-btn-gap" width="12" style="font-size:0;line-height:0;">&nbsp;</td>${cell(secondary, 'secondary')}` : ''}
    </tr></table>`;
};

/**
 * The same URL as plain text under the button, for clients that strip buttons (standard §2.7).
 * Long URLs must not force a horizontal scroll, so the anchor wraps anywhere.
 */
export const emailFallbackLink = (brand: LayoutBrand, action: EmailAction): string => {
  // Only for web links. A mailto: with an encoded subject reads as noise, and the address is
  // already visible in the button, so repeating it helps nobody.
  if (!/^https?:\/\//i.test(action.url)) return '';
  return `<p class="fx-muted fx-small" style="margin:10px 0 0;font-size:13px;line-height:20px;color:${MUTED};word-break:break-all;">${escapeHtml(action.label)}: <a href="${escapeHtml(action.url)}" target="_blank" class="fx-brand-ink" style="color:${inkColor(brand.color)};text-decoration:underline;">${escapeHtml(action.url)}</a></p>`;
};

const buttonsText = (primary: EmailAction, secondary?: EmailAction): string =>
  [primary, secondary]
    .filter((action): action is EmailAction => !!action)
    .map((action) => `${action.label}: ${action.url}`)
    .join('\n');

/** A quoted message (visitor or guest words), line breaks preserved. */
export const emailQuote = (brand: LayoutBrand, label: string, text: string): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="fx-quote fx-bd" style="background:#ffffff;border:1px solid ${LINE};border-${startAlign(dirOf(brand))}:4px solid ${validColor(brand.color)};border-radius:10px;">
      <tr><td style="padding:16px 18px;">
        <div class="fx-faint" style="font-size:11px;line-height:16px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:${FAINT};">${escapeHtml(label)}</div>
        <div class="fx-ink fx-body" style="margin-top:6px;font-size:15px;line-height:24px;color:${INK};white-space:pre-line;word-break:break-word;">${escapeHtml(text).replace(/\r?\n/g, '<br>')}</div>
      </td></tr>
    </table>`;

/** A short coloured note (what happens next, warnings, security advice). */
export const emailNotice = (brand: LayoutBrand, tone: EmailTone, messageHtml: string): string => {
  const colors = toneColors(brand, tone);
  const dark = darkToneColors(brand, tone);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="fx-notice fx-tone-${tone}" bgcolor="${colors.bg}" style="background:${colors.bg};border-radius:10px;" data-dark-bg="${dark.bg}">
      <tr><td class="fx-notice-text" style="padding:13px 16px;font-size:13px;line-height:20px;color:${colors.ink};">${messageHtml}</td></tr>
    </table>`;
};

/** Big numbers side by side (guest counts). */
export const emailStats = (brand: LayoutBrand, items: Array<{ value: string | number; label: string }>): string => {
  const ink = inkColor(brand.color);
  const width = Math.floor(100 / Math.max(items.length, 1));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="fx-panel fx-bd" style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;"><tr>
      ${items.map((item, index) => `<td width="${width}%" align="center" class="fx-bd" style="padding:18px 8px;${index ? `border-left:1px solid ${LINE};` : ''}">
          <div class="fx-brand-ink" style="font-size:28px;line-height:32px;font-weight:800;color:${ink};">${escapeHtml(item.value)}</div>
          <div class="fx-faint" style="margin-top:4px;font-size:12px;line-height:16px;color:${FAINT};">${escapeHtml(item.label)}</div>
        </td>`).join('')}
    </tr></table>`;
};

/** A titled list (itinerary, programme). */
export const emailList = (
  brand: LayoutBrand,
  title: string,
  items: Array<{ title: string; meta?: string }>
): string => {
  const ink = inkColor(brand.color);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="fx-panel fx-bd" style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;">
      <tr><td class="fx-panel-pad fx-brand-ink" style="padding:18px 22px 6px;font-size:11px;line-height:16px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:${ink};">${escapeHtml(title)}</td></tr>
      <tr><td class="fx-panel-pad" style="padding:0 22px 12px;">
        <table role="presentation" dir="${dirOf(brand)}" width="100%" cellpadding="0" cellspacing="0">
          ${items.map((item, index) => `<tr>
            <td width="22" valign="top" class="fx-bd" style="padding:11px 0;${index ? `border-top:1px solid ${LINE};` : ''}"><div style="width:8px;height:8px;margin-top:6px;border-radius:4px;background:${validColor(brand.color)};font-size:0;line-height:0;">&nbsp;</div></td>
            <td class="fx-bd fx-ink fx-body" style="padding:10px 0;${index ? `border-top:1px solid ${LINE};` : ''}font-size:14px;line-height:20px;color:${INK};font-weight:600;">${escapeHtml(item.title)}${item.meta ? `<div class="fx-muted" style="margin-top:2px;font-size:13px;line-height:18px;font-weight:400;color:${MUTED};">${escapeHtml(item.meta)}</div>` : ''}</td>
          </tr>`).join('')}
        </table>
      </td></tr>
    </table>`;
};

/** A titled panel wrapping custom content (map, QR ticket). */
export const emailPanel = (brand: LayoutBrand, eyebrow: string, contentHtml: string, opts: { align?: 'left' | 'center'; titleHtml?: string } = {}): string => {
  const align = opts.align || startAlign(dirOf(brand));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="fx-panel fx-bd" style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;">
      <tr><td class="fx-panel-pad" align="${align}" style="padding:18px 22px 20px;text-align:${align};">
        <div class="fx-brand-ink" style="font-size:11px;line-height:16px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:${inkColor(brand.color)};">${escapeHtml(eyebrow)}</div>
        ${opts.titleHtml ? `<div class="fx-ink" style="margin-top:4px;font-size:16px;line-height:23px;font-weight:700;color:${INK};">${opts.titleHtml}</div>` : ''}
        <div style="margin-top:12px;">${contentHtml}</div>
      </td></tr>
    </table>`;
};

/** A monospaced reference code chip. Always left-to-right, even inside an RTL email. */
export const emailCode = (value: string): string =>
  `<span dir="ltr" style="font-family:${MONO};font-weight:700;letter-spacing:0.5px;direction:ltr;unicode-bidi:isolate;">${escapeHtml(value)}</span>`;

/** A link styled in the readable brand ink. `href` must be a safe, already-validated URL. */
export const emailLink = (brand: LayoutBrand, href: string, labelHtml: string): string =>
  `<a href="${escapeHtml(href)}" class="fx-brand-ink" style="color:${inkColor(brand.color)};text-decoration:none;font-weight:600;">${labelHtml}</a>`;

// ---------------------------------------------------------------------------
// Block specification — one description, two renderings (HTML + plain text)
// ---------------------------------------------------------------------------

export type EmailBlockSpec =
  | { kind: 'details'; rows: EmailDetailRow[]; titleHtml?: string; titleText?: string; eyebrow?: string }
  | {
      kind: 'buttons';
      primary: EmailAction;
      secondary?: EmailAction;
      outline?: boolean;
      /** Repeat the primary URL as a plain text link under the button (standard §2.7). */
      showUrl?: boolean;
    }
  | { kind: 'notice'; tone: EmailTone; messageHtml: string; text?: string }
  | { kind: 'quote'; label: string; text: string }
  | { kind: 'list'; title: string; items: Array<{ title: string; meta?: string }> }
  | { kind: 'stats'; items: Array<{ value: string | number; label: string }> }
  | { kind: 'panel'; eyebrow: string; contentHtml: string; text: string; align?: 'left' | 'center'; titleHtml?: string }
  /** Pre-rendered markup. `text` is mandatory so the plain-text alternative never loses a fact. */
  | { kind: 'raw'; html: string; text: string }
  | null
  | undefined
  | false
  | '';

const renderBlockHtml = (brand: LayoutBrand, block: EmailBlockSpec): string => {
  if (!block) return '';
  switch (block.kind) {
    case 'details':
      return emailDetails(brand, block.rows, { titleHtml: block.titleHtml, eyebrow: block.eyebrow });
    case 'buttons':
      return (
        emailButtons(brand, block.primary, block.secondary, { outline: block.outline }) +
        (block.showUrl === false ? '' : emailFallbackLink(brand, block.primary))
      );
    case 'notice':
      return emailNotice(brand, block.tone, block.messageHtml);
    case 'quote':
      return emailQuote(brand, block.label, block.text);
    case 'list':
      return emailList(brand, block.title, block.items);
    case 'stats':
      return emailStats(brand, block.items);
    case 'panel':
      return emailPanel(brand, block.eyebrow, block.contentHtml, { align: block.align, titleHtml: block.titleHtml });
    case 'raw':
      return block.html;
    default:
      return '';
  }
};

const renderBlockText = (block: EmailBlockSpec): string => {
  if (!block) return '';
  switch (block.kind) {
    case 'details':
      return detailsText(block.rows, { titleHtml: block.titleText ?? block.titleHtml, eyebrow: block.eyebrow });
    case 'buttons':
      return buttonsText(block.primary, block.secondary);
    case 'notice':
      return block.text ?? htmlFragmentToText(block.messageHtml);
    case 'quote':
      return `${block.label}:\n${block.text}`;
    case 'list':
      return [block.title, ...block.items.map((item) => `- ${item.title}${item.meta ? ` (${item.meta})` : ''}`)].join('\n');
    case 'stats':
      return block.items.map((item) => `${item.label}: ${item.value}`).join('\n');
    case 'panel':
      return `${block.eyebrow}${block.titleHtml ? ` — ${htmlFragmentToText(block.titleHtml)}` : ''}\n${block.text}`;
    case 'raw':
      return block.text;
    default:
      return '';
  }
};

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export interface EmailFooter {
  /** How to get help. */
  note?: string;
  contact?: { email?: string; phone?: string };
  /**
   * Why the reader is receiving this (standard §2.9 / §4). Required on every message; the
   * document falls back to a transactional default rather than shipping without one.
   */
  whyReceived?: string;
  /** Company postal address for the legal footer. */
  postalAddress?: string;
  /** Absolute https URL. Present on reminders, digests and anything not strictly transactional. */
  unsubscribeUrl?: string;
}

export interface EmailDocument {
  brand: LayoutBrand;
  /** Document <title>. */
  title: string;
  /** Inbox preview line. Clamped to 90 characters. */
  preheader: string;
  badge?: { label: string; tone: EmailTone };
  heading: string;
  /** Short paragraph under the heading (escaped or inline-sanitised HTML). */
  introHtml?: string;
  /** Components in reading order. Empty strings are skipped. */
  blocks: string[];
  footer?: EmailFooter;
}

/** The same document, described as data so the plain-text alternative comes from the same source. */
export interface EmailDocumentSpec extends Omit<EmailDocument, 'blocks'> {
  blocks: EmailBlockSpec[];
  /** Plain-text form of `introHtml`. Derived from the HTML when omitted. */
  introText?: string;
}

/** Inbox preview lines are cut off around 90 characters; anything longer is dead weight. */
export const PREHEADER_MAX = 90;

const clampPreheader = (value: string): string => {
  const line = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (line.length <= PREHEADER_MAX) return line;
  const cut = line.slice(0, PREHEADER_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:·-]+$/, '')}…`;
};

const DEFAULT_WHY_RECEIVED = 'You received this message because it relates to your booking or account with us.';

const logoMark = (brand: LayoutBrand): string => {
  const name = escapeHtml(brand.name);
  if (!brand.logo) {
    return `<div class="fx-ink" style="font-size:18px;line-height:24px;font-weight:800;color:${INK};letter-spacing:-0.2px;">${name}</div>`;
  }
  // A white plate behind the logo: a dark logo on a dark-mode background would otherwise vanish,
  // and email clients never invert an image for you (standard §3, dark mode).
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" class="fx-logo-plate" bgcolor="#ffffff" style="background:#ffffff;border-radius:12px;"><tr>
      <td style="vertical-align:middle;padding:10px 4px 10px 14px;"><img src="${escapeHtml(brand.logo)}" alt="${name}" height="40" style="display:block;height:40px;max-height:40px;width:auto;border:0;outline:none;text-decoration:none;"></td>
      <td style="vertical-align:middle;padding:10px 16px 10px 12px;font-size:15px;line-height:20px;font-weight:700;color:${INK};">${name}</td>
    </tr></table>`;
};

const shellStyles = (brand: LayoutBrand): string => {
  const darkBrandInk = darkInkColor(brand.color);
  const toneRules = (['success', 'info', 'warning', 'danger', 'neutral'] as const)
    .map((tone) => `.fx-tone-${tone},.fx-tone-${tone} td{background:${DARK_TONES[tone].bg}!important;color:${DARK_TONES[tone].ink}!important;}`)
    .join('\n      ');
  const darkRules = `
      .fx-page,.fx-page>tbody>tr>td,.fx-shell{background:${DARK.page}!important;}
      .fx-card,.fx-card>tbody>tr>td{background:${DARK.card}!important;}
      .fx-card{border-color:${DARK.line}!important;}
      .fx-panel,.fx-panel>tbody>tr>td,.fx-quote,.fx-quote>tbody>tr>td{background:${DARK.panel}!important;}
      .fx-panel,.fx-quote{border-color:${DARK.line}!important;}
      .fx-bd{border-color:${DARK.line}!important;}
      .fx-ink,.fx-ink a,.fx-h1{color:${DARK.ink}!important;}
      .fx-muted,.fx-muted a{color:${DARK.muted}!important;}
      .fx-faint{color:${DARK.faint}!important;}
      .fx-brand-ink,.fx-brand-ink a{color:${darkBrandInk}!important;}
      .fx-btn-ghost{background:${DARK.panel}!important;border-color:${DARK.line}!important;}
      .fx-btn-ghost .fx-btn{color:${DARK.ink}!important;}
      .fx-logo-plate,.fx-logo-plate td{background:#ffffff!important;color:${INK}!important;}
      ${toneRules}`;
  return `
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
    a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
    @media screen and (max-width:620px){
      .fx-shell{padding:16px 0!important;}
      .fx-card{border-radius:14px!important;}
      .fx-pad{padding-left:24px!important;padding-right:24px!important;}
      .fx-panel-pad{padding-left:18px!important;padding-right:18px!important;}
      .fx-h1{font-size:24px!important;line-height:31px!important;}
      .fx-intro,.fx-body,.fx-value{font-size:16px!important;line-height:25px!important;}
      .fx-label{font-size:14px!important;line-height:20px!important;}
      .fx-notice-text{font-size:15px!important;line-height:23px!important;}
      .fx-small{font-size:14px!important;line-height:21px!important;}
      .fx-row td{display:block!important;width:100%!important;}
      .fx-label{padding:12px 0 2px!important;}
      .fx-value{padding:0 0 12px!important;border-top:0!important;}
      .fx-btns,.fx-btns tbody,.fx-btns tr,.fx-btn-cell{display:block!important;width:100%!important;}
      .fx-btn-gap{display:block!important;height:12px!important;width:100%!important;}
      .fx-btn{display:block!important;}
    }
    @media (prefers-color-scheme: dark){${darkRules}
    }
    [data-ogsc] .fx-page,[data-ogsc] .fx-shell{background:${DARK.page}!important;}
    [data-ogsc] .fx-card{background:${DARK.card}!important;border-color:${DARK.line}!important;}
    [data-ogsc] .fx-panel,[data-ogsc] .fx-quote{background:${DARK.panel}!important;border-color:${DARK.line}!important;}
    [data-ogsc] .fx-ink,[data-ogsc] .fx-h1{color:${DARK.ink}!important;}
    [data-ogsc] .fx-muted{color:${DARK.muted}!important;}
    [data-ogsc] .fx-faint{color:${DARK.faint}!important;}
    [data-ogsc] .fx-brand-ink{color:${darkBrandInk}!important;}`;
};

const renderShell = (doc: EmailDocument, blocksHtml: string): string => {
  const { brand } = doc;
  const color = validColor(brand.color);
  const year = new Date().getFullYear();
  const dir = dirOf(brand);
  const lang = escapeHtml((brand.lang || 'en').slice(0, 20));
  const align = startAlign(dir);
  const badge = doc.badge ? toneColors(brand, doc.badge.tone) : null;
  const contactParts = [
    doc.footer?.contact?.email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(doc.footer.contact.email)
      ? `<a href="mailto:${escapeHtml(doc.footer.contact.email)}" dir="ltr" style="color:${MUTED};text-decoration:underline;unicode-bidi:isolate;">${escapeHtml(doc.footer.contact.email)}</a>`
      : '',
    doc.footer?.contact?.phone && doc.footer.contact.phone.replace(/\D/g, '').length >= 6
      ? `<a href="tel:${escapeHtml(doc.footer.contact.phone.replace(/[^+0-9]/g, ''))}" dir="ltr" style="color:${MUTED};text-decoration:underline;unicode-bidi:isolate;">${escapeHtml(doc.footer.contact.phone)}</a>`
      : '',
  ].filter(Boolean);
  const whyReceived = doc.footer?.whyReceived || DEFAULT_WHY_RECEIVED;
  // https (a preference centre) or mailto (the site's monitored inbox) — both are real,
  // working opt-out routes. Anything else is dropped rather than rendered as a dead link.
  const unsubscribe = doc.footer?.unsubscribeUrl && /^(https:\/\/|mailto:)/i.test(doc.footer.unsubscribeUrl)
    ? `<a href="${escapeHtml(doc.footer.unsubscribeUrl)}" class="fx-muted" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(doc.title)}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <style>table,td{border-collapse:collapse;}td,a,div,span{font-family:Arial,sans-serif!important;}</style>
  <![endif]-->
  <style>
    :root{color-scheme:light dark;supported-color-schemes:light dark;}${shellStyles(brand)}
  </style>
</head>
<body dir="${dir}" class="fx-page" style="margin:0;padding:0;width:100%;background:${PAGE};direction:${dir};text-align:${align};">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${PAGE};">${escapeHtml(clampPreheader(doc.preheader))}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="fx-page" style="background:${PAGE};">
    <tr><td align="center" class="fx-shell" style="padding:28px 12px 32px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center"><tr><td><![endif]-->
      <table role="presentation" dir="${dir}" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:${FONT};">
        <tr><td align="center" style="padding:4px 0 18px;">${logoMark(brand)}</td></tr>
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="fx-card" style="background:#ffffff;border:1px solid ${LINE};border-radius:18px;overflow:hidden;">
            <tr><td height="5" style="height:5px;background:${color};font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td class="fx-pad" style="padding:32px 36px 22px;">
              ${badge && doc.badge ? `<span style="display:inline-block;padding:5px 11px;border-radius:999px;background:${badge.bg};color:${badge.ink};font-size:11px;line-height:14px;font-weight:700;letter-spacing:0.9px;text-transform:uppercase;">${escapeHtml(doc.badge.label)}</span>` : ''}
              <h1 class="fx-h1 fx-ink" style="margin:${doc.badge ? '14px' : '0'} 0 0;font-size:26px;line-height:33px;font-weight:800;letter-spacing:-0.4px;color:${INK};">${escapeHtml(doc.heading)}</h1>
              ${doc.introHtml ? `<p class="fx-intro fx-muted" style="margin:10px 0 0;font-size:15px;line-height:24px;color:${MUTED};">${doc.introHtml}</p>` : ''}
            </td></tr>
            ${blocksHtml}
            <tr><td style="font-size:0;line-height:0;height:12px;">&nbsp;</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" class="fx-pad" style="padding:22px 28px 0;text-align:center;">
          ${doc.footer?.note ? `<p class="fx-muted fx-small" style="margin:0 0 8px;font-size:13px;line-height:20px;color:${MUTED};">${escapeHtml(doc.footer.note)}</p>` : ''}
          ${contactParts.length ? `<p class="fx-muted fx-small" style="margin:0 0 8px;font-size:13px;line-height:20px;color:${MUTED};">${contactParts.join(' &nbsp;&#183;&nbsp; ')}</p>` : ''}
          <p class="fx-faint fx-small" style="margin:0 0 6px;font-size:12px;line-height:18px;color:${FAINT};">${escapeHtml(whyReceived)}</p>
          ${doc.footer?.postalAddress ? `<p class="fx-faint fx-small" style="margin:0 0 6px;font-size:12px;line-height:18px;color:${FAINT};">${escapeHtml(doc.footer.postalAddress)}</p>` : ''}
          <p class="fx-faint fx-small" style="margin:0;font-size:12px;line-height:18px;color:${FAINT};">&copy; ${year} ${escapeHtml(brand.name)}${unsubscribe ? ` &#183; ${unsubscribe}` : ''}</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
};

export const renderEmailDocument = (doc: EmailDocument): string =>
  renderShell(
    doc,
    doc.blocks
      .filter((block) => block && block.trim())
      .map((block) => `<tr><td class="fx-pad" style="padding:0 36px 20px;">${block}</td></tr>`)
      .join('\n')
  );

const RULE = '—'.repeat(24);

/** The plain-text alternative: the same facts, reference and URLs, written as text. */
export const renderEmailText = (spec: EmailDocumentSpec): string => {
  const { brand } = spec;
  const intro = spec.introText ?? (spec.introHtml ? htmlFragmentToText(spec.introHtml) : '');
  const body = spec.blocks.map(renderBlockText).map((part) => part.trim()).filter(Boolean);
  const footer = [
    spec.footer?.note,
    spec.footer?.contact?.email,
    spec.footer?.contact?.phone,
    spec.footer?.whyReceived || DEFAULT_WHY_RECEIVED,
    spec.footer?.postalAddress,
    spec.footer?.unsubscribeUrl && /^(https:\/\/|mailto:)/i.test(spec.footer.unsubscribeUrl)
      ? `Unsubscribe: ${spec.footer.unsubscribeUrl}`
      : '',
    `© ${new Date().getFullYear()} ${brand.name}`,
  ].filter(Boolean) as string[];

  return [
    brand.name,
    RULE,
    spec.heading,
    intro,
    ...body,
    RULE,
    ...footer,
  ]
    .filter((part) => part && part.trim())
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * Render one email in both parts. Every template should use this: the HTML and the plain-text
 * alternative come from a single description, so a fact can never be present in one and missing
 * from the other.
 */
export const renderEmail = (spec: EmailDocumentSpec): { html: string; text: string } => ({
  html: renderEmailDocument({
    ...spec,
    blocks: spec.blocks.map((block) => renderBlockHtml(spec.brand, block)),
  }),
  text: renderEmailText(spec),
});
