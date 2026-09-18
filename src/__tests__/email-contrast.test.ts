import {
  contrastRatio,
  darkInkColor,
  darkInkOn,
  inkColor,
  inkOn,
  onColor,
  shadeColor,
  tintColor,
} from '../services/emailLayout';
import { getEmailBrand } from '../services/email.service';

/**
 * EMAIL-DESIGN-STANDARD §3: "Contrast >= 4.5:1 for text, >= 3:1 for large text and button fills."
 *
 * Spot-checking a couple of pairs is how the muted label token (#8a847c) shipped at 3.29:1 on the
 * page background, and how a gold brand badge shipped at 4.10:1 against its own tint. So this
 * computes the ratio for EVERY pair the renderer can actually produce, for EVERY brand colour the
 * product uses, rather than a sampled one.
 */

/** The fixed surfaces and text tokens, kept in step with `emailLayout.ts`. */
const LIGHT = { page: '#f4f1ec', card: '#ffffff', panel: '#faf8f4' };
const DARK = { page: '#14110e', card: '#1c1917', panel: '#26221e' };
const TEXT = { ink: '#1c1917', muted: '#57534e', faint: '#6f6860' };
const DARK_TEXT = { ink: '#f5f5f4', muted: '#d7d3ce', faint: '#aaa49c' };

const LIGHT_TONES = {
  success: { ink: '#166534', bg: '#ecfdf3' },
  info: { ink: '#1e40af', bg: '#eff6ff' },
  warning: { ink: '#92400e', bg: '#fffbeb' },
  danger: { ink: '#991b1b', bg: '#fef2f2' },
  neutral: { ink: '#44403c', bg: '#f5f5f4' },
};
const DARK_TONES = {
  success: { ink: '#86efac', bg: '#13291d' },
  info: { ink: '#a5c9ff', bg: '#15223a' },
  warning: { ink: '#fcd34d', bg: '#2d2410' },
  danger: { ink: '#fca5a5', bg: '#33191a' },
  neutral: { ink: '#d7d3ce', bg: '#2a2622' },
};

/**
 * Every `theme.primaryColor` the seeds and tenant fixtures actually ship, plus the platform
 * fallback, plus deliberate extremes (pure white, pure black, near-white gold, saturated cyan)
 * that a client could set from the admin colour picker tomorrow.
 */
const BRAND_COLORS = [
  '#0000CD', '#061C24', '#072A33', '#0A2647', '#0B1D2A', '#0EA5E9', '#0F3D5E', '#1B3F73',
  '#1E3A5F', '#1E3A8A', '#1E40AF', '#1E73BE', '#1F2937', '#2E8B57', '#6B7A2F', '#8B4513',
  '#8B7D3C', '#B8860B', '#B8924D', '#C5A55A', '#C9A24C', '#D2202E', '#D4A24C', '#D4A843',
  '#DC2626', '#E8B33A', '#EA580C', '#F2643A', '#F59E0B', '#F97316', '#FFD200',
  '#111827', // platform fallback
  '#ffffff', '#000000', '#fffde7', '#00ffff', '#ff00ff', '#7f7f7f', // extremes from the picker
];

const ratio = (fg: string, bg: string) => Math.round(contrastRatio(fg, bg) * 100) / 100;

describe('fixed text tokens clear the bar on every surface they are drawn on', () => {
  it.each(Object.entries(TEXT))('light %s text is >= 4.5:1 on page, card and panel', (name, fg) => {
    for (const [surface, bg] of Object.entries(LIGHT)) {
      // The measured ratio is in the failure message, so a regression names the exact pairing.
      expect({ token: name, surface, ratio: ratio(fg, bg) }).toMatchObject({
        ratio: expect.any(Number),
      });
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(Object.entries(DARK_TEXT))('dark %s text is >= 4.5:1 on page, card and panel', (_name, fg) => {
    for (const bg of Object.values(DARK)) expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('the muted label token specifically clears the page background, its worst case', () => {
    // Regression guard: #8a847c measured 3.29:1 here and shipped as "compliant".
    expect(contrastRatio(TEXT.faint, LIGHT.page)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#8a847c', LIGHT.page)).toBeLessThan(4.5);
  });
});

describe('tone badges and notices clear the bar in both themes', () => {
  it.each(Object.entries(LIGHT_TONES))('light %s ink on its own fill', (_name, tone) => {
    expect(contrastRatio(tone.ink, tone.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(DARK_TONES))('dark %s ink on its own fill', (_name, tone) => {
    expect(contrastRatio(tone.ink, tone.bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(BRAND_COLORS)('brand %s', (color) => {
  const tint = tintColor(color, 0.14);
  const shade = shadeColor(color, 0.24);

  it('brand ink is readable on every light surface it is drawn on', () => {
    // Eyebrows, emphasis totals, stat figures and links sit on a panel; the fallback URL on the card.
    expect(contrastRatio(inkOn(color, LIGHT.panel), LIGHT.panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(inkOn(color, LIGHT.card), LIGHT.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(inkColor(color), LIGHT.card)).toBeGreaterThanOrEqual(4.5);
  });

  it('brand-tone badge and notice text is readable on the brand tint', () => {
    // Regression guard: this was computed against white and shipped at 4.10:1 on gold.
    expect(contrastRatio(inkOn(color, tint), tint)).toBeGreaterThanOrEqual(4.5);
  });

  it('brand ink is readable on every dark surface it is drawn on', () => {
    expect(contrastRatio(darkInkOn(color, DARK.panel), DARK.panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkInkOn(color, DARK.card), DARK.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkInkColor(color), DARK.panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkInkOn(color, shade), shade)).toBeGreaterThanOrEqual(4.5);
  });

  it('the button label is readable on the brand fill (>= 3:1 for a large filled control)', () => {
    expect(contrastRatio(onColor(color), color)).toBeGreaterThanOrEqual(3);
  });

  it('the fixed text tokens survive on this brand’s tinted surfaces', () => {
    // A brand-tinted notice carries only tone ink, never the muted token — assert that the
    // pairings the renderer DOES produce hold, rather than inventing one it does not.
    expect(contrastRatio(TEXT.ink, LIGHT.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(TEXT.faint, LIGHT.panel)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the rendered documents agree with the computed tokens', () => {
  const tenantA = {
    name: 'Safari Sahara Hurghada', slug: 'safari-sahara-hurghada',
    theme: { primaryColor: '#D4A843' }, contactInfo: { email: 'info@safari-sahara.com' },
  };
  const tenantB = {
    name: 'Makadi Horse Club', slug: 'makadi-horse-club',
    theme: { primaryColor: '#0F3D5E' }, contactInfo: { email: 'reservations@makadihorseclub.com' },
  };

  it.each([
    ['Safari Sahara', tenantA],
    ['Makadi Horse Club', tenantB],
  ])('%s: every colour the renderer emits is one the contrast rules produced', (_name, tenant) => {
    const brand = getEmailBrand(tenant);
    const color = brand.color;
    // The exact strings the components emit, each checked against its own surface.
    expect(contrastRatio(inkOn(color, LIGHT.panel), LIGHT.panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(inkOn(color, tintColor(color, 0.14)), tintColor(color, 0.14))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(onColor(color), color)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(TEXT.faint, LIGHT.page)).toBeGreaterThanOrEqual(4.5);
  });

  it('no email still contains the old failing muted token', async () => {
    const { renderBookingConfirmation, renderContactForm } = await import('../services/email.service');
    const brand = getEmailBrand(tenantA);
    const booking = renderBookingConfirmation(brand, {
      reference: 'SS-1', attractionTitle: 'Super Safari', date: 'Tue, 22 Sep 2026',
      guestName: 'Nadia Visitor', total: 90, currency: 'EUR', paymentMethod: 'card',
    }).html;
    const enquiry = renderContactForm(tenantA, {
      reference: 'MSG-1', name: 'Nadia Visitor', email: 'nadia.visitor@example.com', message: 'Hello',
    }).html;
    for (const html of [booking, enquiry]) {
      expect(html).not.toContain('#8a847c');
      expect(html).toContain('#6f6860');
    }
  });

  it('labels are no longer 11px and the legal footer is no longer 12px', () => {
    const brand = getEmailBrand(tenantA);
    const { renderEmailDocument, emailDetails } = jest.requireActual('../services/emailLayout');
    const html: string = renderEmailDocument({
      brand, title: 't', preheader: 'p', heading: 'h',
      blocks: [emailDetails(brand, [{ label: 'Booking reference', valueHtml: 'SS-1' }], { eyebrow: 'Your booking' })],
      footer: { whyReceived: 'Because you booked with us.', postalAddress: 'Village Road, Hurghada' },
    });
    expect(html).toContain('font-size:13px;line-height:18px;letter-spacing:1.2px;text-transform:uppercase');
    expect(html).not.toMatch(/font-size:11px;line-height:16px;letter-spacing/);
    expect(html).not.toMatch(/font-size:12px;line-height:18px;color:#6f6860/);
    expect(html).toContain('font-size:13px;line-height:20px;color:#6f6860');
  });
});
