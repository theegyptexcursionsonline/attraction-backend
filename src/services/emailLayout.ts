/**
 * One design system for every transactional email a site sends.
 *
 * Email clients are not browsers: layout is table-based, every style that matters is inline
 * (Gmail and Outlook drop or rewrite parts of <style>), and the <style> block only adds
 * progressive enhancements (phone padding, stacked rows, full-width buttons). Colours adapt to
 * the site's brand colour but are always contrast-checked, so a light brand colour such as gold
 * never produces unreadable white-on-gold text.
 *
 * Escaping contract: parameters named `...Html` must already be escaped or built from these
 * components; every other string parameter is escaped here.
 */

export interface LayoutBrand {
  name: string;
  origin: string;
  color: string;
  logo?: string;
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

export const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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

/** A pale tint of a colour for backgrounds (mixed with white). */
export const tintColor = (hex: string, amount = 0.1): string => {
  const rgb = parseHex(hex);
  if (!rgb) return PANEL;
  return toHex(rgb.map((channel) => 255 - (255 - channel) * amount) as [number, number, number]);
};

const TONES: Record<Exclude<EmailTone, 'brand'>, { ink: string; bg: string }> = {
  success: { ink: '#166534', bg: '#ecfdf3' },
  info: { ink: '#1e40af', bg: '#eff6ff' },
  warning: { ink: '#92400e', bg: '#fffbeb' },
  danger: { ink: '#991b1b', bg: '#fef2f2' },
  neutral: { ink: '#44403c', bg: '#f5f5f4' },
};

const toneColors = (brand: LayoutBrand, tone: EmailTone): { ink: string; bg: string } =>
  tone === 'brand' ? { ink: inkColor(brand.color), bg: tintColor(brand.color, 0.14) } : TONES[tone];

const validColor = (hex: string): string => (parseHex(hex) ? hex : '#111827');

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface EmailDetailRow {
  label: string;
  valueHtml: string;
  hint?: string;
  /** Larger, brand-coloured value (totals). */
  emphasis?: boolean;
}

/** A label/value list in a soft panel. Rows stack on phones. Values are always left-to-right. */
export const emailDetails = (
  brand: LayoutBrand,
  rows: EmailDetailRow[],
  opts: { titleHtml?: string; eyebrow?: string } = {}
): string => {
  const visible = rows.filter((row) => row.valueHtml !== '');
  if (visible.length === 0) return '';
  const ink = inkColor(brand.color);
  const header = opts.titleHtml || opts.eyebrow
    ? `<tr><td class="fx-panel-pad" style="padding:18px 22px 4px;">
        ${opts.eyebrow ? `<div style="font-size:11px;line-height:16px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:${ink};">${escapeHtml(opts.eyebrow)}</div>` : ''}
        ${opts.titleHtml ? `<div style="margin-top:4px;font-size:18px;line-height:25px;font-weight:700;color:${INK};">${opts.titleHtml}</div>` : ''}
      </td></tr>`
    : '';
  const body = visible.map((row, index) => {
    const border = index === 0 ? '' : `border-top:1px solid ${LINE};`;
    return `<tr class="fx-row">
          <td dir="ltr" width="36%" class="fx-label" style="padding:12px 0;${border}vertical-align:top;text-align:left;direction:ltr;font-size:13px;line-height:19px;color:${FAINT};">${escapeHtml(row.label)}${row.hint ? `<div style="margin-top:2px;font-size:12px;line-height:17px;color:${FAINT};">${escapeHtml(row.hint)}</div>` : ''}</td>
          <td dir="ltr" align="left" class="fx-value" style="padding:12px 0 12px 16px;${border}vertical-align:top;text-align:left;direction:ltr;unicode-bidi:isolate;word-break:break-word;font-size:${row.emphasis ? '18px' : '14px'};line-height:${row.emphasis ? '24px' : '20px'};font-weight:${row.emphasis ? '800' : '600'};color:${row.emphasis ? ink : INK};">${row.valueHtml}</td>
        </tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;">
      ${header}
      <tr><td class="fx-panel-pad" style="padding:${header ? '4px' : '8px'} 22px 10px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>
      </td></tr>
    </table>`;
};

export interface EmailAction {
  label: string;
  url: string;
}

/** Bulletproof buttons (table cells, so Outlook keeps the colour). Full width on phones. */
export const emailButtons = (
  brand: LayoutBrand,
  primary: EmailAction,
  secondary?: EmailAction,
  opts: { outline?: boolean } = {}
): string => {
  const color = validColor(brand.color);
  const cell = (action: EmailAction, kind: 'primary' | 'secondary') => {
    const filled = kind === 'primary' && !opts.outline;
    return `<td class="fx-btn-cell" align="center" ${filled ? `bgcolor="${color}"` : ''} style="border-radius:10px;${filled ? `background:${color};` : `border:1px solid ${LINE};background:#ffffff;`}">
          <a class="fx-btn" href="${escapeHtml(action.url)}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;text-decoration:none;border-radius:10px;color:${filled ? onColor(color) : INK};">${escapeHtml(action.label)}</a>
        </td>`;
  };
  return `<table role="presentation" cellpadding="0" cellspacing="0" class="fx-btns"><tr>
      ${cell(primary, 'primary')}
      ${secondary ? `<td class="fx-btn-gap" width="10" style="font-size:0;line-height:0;">&nbsp;</td>${cell(secondary, 'secondary')}` : ''}
    </tr></table>`;
};

/** A quoted message (visitor or guest words), line breaks preserved. */
export const emailQuote = (brand: LayoutBrand, label: string, text: string): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${LINE};border-left:4px solid ${validColor(brand.color)};border-radius:10px;">
      <tr><td style="padding:16px 18px;">
        <div style="font-size:11px;line-height:16px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:${FAINT};">${escapeHtml(label)}</div>
        <div style="margin-top:6px;font-size:15px;line-height:24px;color:${INK};white-space:pre-line;word-break:break-word;">${escapeHtml(text).replace(/\r?\n/g, '<br>')}</div>
      </td></tr>
    </table>`;

/** A short coloured note (what happens next, warnings, security advice). */
export const emailNotice = (brand: LayoutBrand, tone: EmailTone, messageHtml: string): string => {
  const colors = toneColors(brand, tone);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.bg};border-radius:10px;">
      <tr><td style="padding:13px 16px;font-size:13px;line-height:20px;color:${colors.ink};">${messageHtml}</td></tr>
    </table>`;
};

/** Big numbers side by side (guest counts). */
export const emailStats = (brand: LayoutBrand, items: Array<{ value: string | number; label: string }>): string => {
  const ink = inkColor(brand.color);
  const width = Math.floor(100 / Math.max(items.length, 1));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;"><tr>
      ${items.map((item, index) => `<td width="${width}%" align="center" style="padding:18px 8px;${index ? `border-left:1px solid ${LINE};` : ''}">
          <div style="font-size:28px;line-height:32px;font-weight:800;color:${ink};">${escapeHtml(item.value)}</div>
          <div style="margin-top:4px;font-size:12px;line-height:16px;color:${FAINT};">${escapeHtml(item.label)}</div>
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
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;">
      <tr><td class="fx-panel-pad" style="padding:18px 22px 6px;font-size:11px;line-height:16px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:${ink};">${escapeHtml(title)}</td></tr>
      <tr><td class="fx-panel-pad" style="padding:0 22px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${items.map((item, index) => `<tr>
            <td width="22" valign="top" style="padding:11px 0;${index ? `border-top:1px solid ${LINE};` : ''}"><div style="width:8px;height:8px;margin-top:6px;border-radius:4px;background:${validColor(brand.color)};font-size:0;line-height:0;">&nbsp;</div></td>
            <td style="padding:10px 0;${index ? `border-top:1px solid ${LINE};` : ''}font-size:14px;line-height:20px;color:${INK};font-weight:600;">${escapeHtml(item.title)}${item.meta ? `<div style="margin-top:2px;font-size:13px;line-height:18px;font-weight:400;color:${MUTED};">${escapeHtml(item.meta)}</div>` : ''}</td>
          </tr>`).join('')}
        </table>
      </td></tr>
    </table>`;
};

/** A titled panel wrapping custom content (map, QR ticket). */
export const emailPanel = (brand: LayoutBrand, eyebrow: string, contentHtml: string, opts: { align?: 'left' | 'center'; titleHtml?: string } = {}): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PANEL};border:1px solid ${LINE};border-radius:14px;">
      <tr><td class="fx-panel-pad" align="${opts.align || 'left'}" style="padding:18px 22px 20px;text-align:${opts.align || 'left'};">
        <div style="font-size:11px;line-height:16px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;color:${inkColor(brand.color)};">${escapeHtml(eyebrow)}</div>
        ${opts.titleHtml ? `<div style="margin-top:4px;font-size:16px;line-height:23px;font-weight:700;color:${INK};">${opts.titleHtml}</div>` : ''}
        <div style="margin-top:12px;">${contentHtml}</div>
      </td></tr>
    </table>`;

/** A monospaced reference code chip. */
export const emailCode = (value: string): string =>
  `<span style="font-family:${MONO};font-weight:700;letter-spacing:0.5px;">${escapeHtml(value)}</span>`;

/** A link styled in the readable brand ink. `href` must be a safe, already-validated URL. */
export const emailLink = (brand: LayoutBrand, href: string, labelHtml: string): string =>
  `<a href="${escapeHtml(href)}" style="color:${inkColor(brand.color)};text-decoration:none;font-weight:600;">${labelHtml}</a>`;

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export interface EmailDocument {
  brand: LayoutBrand;
  /** Document <title>. */
  title: string;
  /** Inbox preview line. */
  preheader: string;
  badge?: { label: string; tone: EmailTone };
  heading: string;
  /** Short paragraph under the heading (escaped or inline-sanitised HTML). */
  introHtml?: string;
  /** Components in reading order. Empty strings are skipped. */
  blocks: string[];
  footer?: {
    /** Why the recipient got this email, or how to get help. */
    note?: string;
    contact?: { email?: string; phone?: string };
  };
}

const logoMark = (brand: LayoutBrand): string => {
  const name = escapeHtml(brand.name);
  if (!brand.logo) {
    return `<div style="font-size:18px;line-height:24px;font-weight:800;color:${INK};letter-spacing:-0.2px;">${name}</div>`;
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
      <td style="vertical-align:middle;"><img src="${escapeHtml(brand.logo)}" alt="${name}" height="40" style="display:block;height:40px;max-height:40px;width:auto;border:0;outline:none;text-decoration:none;"></td>
      <td style="vertical-align:middle;padding-left:12px;font-size:15px;line-height:20px;font-weight:700;color:${INK};">${name}</td>
    </tr></table>`;
};

export const renderEmailDocument = (doc: EmailDocument): string => {
  const { brand } = doc;
  const color = validColor(brand.color);
  const year = new Date().getFullYear();
  const badge = doc.badge ? toneColors(brand, doc.badge.tone) : null;
  const contactParts = [
    doc.footer?.contact?.email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(doc.footer.contact.email)
      ? `<a href="mailto:${escapeHtml(doc.footer.contact.email)}" style="color:${MUTED};text-decoration:underline;">${escapeHtml(doc.footer.contact.email)}</a>`
      : '',
    doc.footer?.contact?.phone && doc.footer.contact.phone.replace(/\D/g, '').length >= 6
      ? `<a href="tel:${escapeHtml(doc.footer.contact.phone.replace(/[^+0-9]/g, ''))}" style="color:${MUTED};text-decoration:underline;">${escapeHtml(doc.footer.contact.phone)}</a>`
      : '',
  ].filter(Boolean);
  const blocks = doc.blocks.filter((block) => block && block.trim())
    .map((block) => `<tr><td class="fx-pad" style="padding:0 36px 20px;">${block}</td></tr>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(doc.title)}</title>
  <!--[if mso]><style>table,td{border-collapse:collapse;}td,a,div,span{font-family:Arial,sans-serif!important;}</style><![endif]-->
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
    a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
    @media screen and (max-width:620px){
      .fx-shell{padding:16px 8px!important;}
      .fx-card{border-radius:14px!important;}
      .fx-pad{padding-left:20px!important;padding-right:20px!important;}
      .fx-panel-pad{padding-left:16px!important;padding-right:16px!important;}
      .fx-h1{font-size:23px!important;line-height:30px!important;}
      .fx-row td{display:block!important;width:100%!important;}
      .fx-label{padding:12px 0 2px!important;}
      .fx-value{padding:0 0 12px!important;border-top:0!important;}
      .fx-btns,.fx-btns tbody,.fx-btns tr,.fx-btn-cell{display:block!important;width:100%!important;}
      .fx-btn-gap{display:block!important;height:10px!important;width:100%!important;}
      .fx-btn{display:block!important;}
    }
  </style>
</head>
<body dir="ltr" style="margin:0;padding:0;width:100%;background:${PAGE};direction:ltr;text-align:left;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${PAGE};">${escapeHtml(doc.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
    <tr><td align="center" class="fx-shell" style="padding:28px 12px 32px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center"><tr><td><![endif]-->
      <table role="presentation" dir="ltr" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:${FONT};">
        <tr><td align="center" style="padding:4px 0 18px;">${logoMark(brand)}</td></tr>
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="fx-card" style="background:#ffffff;border:1px solid ${LINE};border-radius:18px;overflow:hidden;">
            <tr><td height="5" style="height:5px;background:${color};font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td class="fx-pad" style="padding:32px 36px 22px;">
              ${badge && doc.badge ? `<span style="display:inline-block;padding:5px 11px;border-radius:999px;background:${badge.bg};color:${badge.ink};font-size:11px;line-height:14px;font-weight:700;letter-spacing:0.9px;text-transform:uppercase;">${escapeHtml(doc.badge.label)}</span>` : ''}
              <h1 class="fx-h1" style="margin:${doc.badge ? '14px' : '0'} 0 0;font-size:26px;line-height:33px;font-weight:800;letter-spacing:-0.4px;color:${INK};">${escapeHtml(doc.heading)}</h1>
              ${doc.introHtml ? `<p style="margin:10px 0 0;font-size:15px;line-height:24px;color:${MUTED};">${doc.introHtml}</p>` : ''}
            </td></tr>
            ${blocks}
            <tr><td style="font-size:0;line-height:0;height:12px;">&nbsp;</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" class="fx-pad" style="padding:22px 28px 0;text-align:center;">
          ${doc.footer?.note ? `<p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${MUTED};">${escapeHtml(doc.footer.note)}</p>` : ''}
          ${contactParts.length ? `<p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${MUTED};">${contactParts.join(' &nbsp;·&nbsp; ')}</p>` : ''}
          <p style="margin:0;font-size:12px;line-height:18px;color:${FAINT};">&copy; ${year} ${escapeHtml(brand.name)}</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
};
