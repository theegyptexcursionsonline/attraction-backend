import {
  EmailBrand,
  contactEnquirySubject,
  emailSubject,
  getEmailBrand,
  recipientFingerprint,
  renderAccessChanged,
  renderAdminBookingNotification,
  renderBookingConfirmation,
  renderBookingPaymentLink,
  renderBookingStatusEmail,
  renderContactForm,
  renderDepartureReminder,
  renderEnquiryReceived,
  renderInvitation,
  renderPasswordChanged,
  renderPasswordReset,
  renderPaymentFailed,
  renderTripThankYou,
  renderWelcome,
  resolveEmailRecipient,
  unsubscribeTarget,
} from '../services/email.service';
import { PREHEADER_MAX, contrastRatio, directionForLanguage, htmlFragmentToText } from '../services/emailLayout';

/**
 * Golden render tests for every template, against EMAIL-DESIGN-STANDARD.md.
 *
 * The rules checked here are the ones that only show up in a real inbox — a missing plain-text
 * part, an http link, an unresolved placeholder, a preheader that repeats the subject, an
 * unescaped value — so each is asserted on EVERY template rather than spot-checked on one.
 */

const TENANT_A = {
  _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  name: 'Safari Sahara Hurghada',
  slug: 'safari-sahara-hurghada',
  customDomain: 'safari-sahara.com',
  domainMigrated: true,
  theme: { primaryColor: '#D4A843' },
  logo: 'https://cdn.example/safari-logo.png',
  contactInfo: { email: 'info@safari-sahara.com', phone: '+20 111 341 8533', address: '12 Village Road, Hurghada, Egypt' },
  defaultLanguage: 'en',
  defaultCurrency: 'EUR',
  timezone: 'Africa/Cairo',
};

const TENANT_B = {
  _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  name: 'Makadi Horse Club',
  slug: 'makadi-horse-club',
  customDomain: 'makadihorseclub.com',
  domainMigrated: true,
  theme: { primaryColor: '#0F3D5E' },
  logo: 'https://cdn.example/makadi-logo.png',
  contactInfo: { email: 'reservations@makadihorseclub.com', phone: '+20 100 222 3344', address: '5 Beach Road, Makadi Bay, Egypt' },
  defaultLanguage: 'en',
  defaultCurrency: 'USD',
  timezone: 'Africa/Cairo',
};

const brandA = getEmailBrand(TENANT_A);
const brandB = getEmailBrand(TENANT_B);

const booking = {
  reference: 'SS-10421',
  attractionTitle: 'Super Safari Desert Adventure',
  date: 'Tue, 22 Sep 2026',
  time: '08:00',
  guestName: 'Nadia Visitor',
  total: 189.5,
  currency: 'EUR',
  guests: 2,
  guestAccessToken: 'tok-abc123',
};

const enquiry = {
  reference: 'MSG-7Q2X6C',
  name: 'Nadia Visitor',
  email: 'nadia.visitor@example.com',
  tourTitle: 'Super Safari Desert Adventure',
  message: 'Do you offer hotel pickup from Makadi Bay?',
};

/** Every template, rendered for one brand, with the facts each one must carry. */
const templatesFor = (brand: EmailBrand, tenant: typeof TENANT_A) => [
  {
    name: 'booking-confirmation',
    subject: emailSubject('Booking confirmed', booking.reference),
    parts: renderBookingConfirmation(brand, { ...booking, paymentMethod: 'card', subtotal: 170, fees: 19.5 }, true, 'cid:qr.png'),
    facts: [booking.reference, booking.attractionTitle, 'EUR 189.50', booking.date],
  },
  {
    name: 'booking-payment-link',
    subject: emailSubject('Complete payment', booking.reference),
    parts: renderBookingPaymentLink(brand, { reference: booking.reference, guestName: booking.guestName, guestAccessToken: 'tok-abc123', total: 189.5, currency: 'EUR' }),
    facts: [booking.reference, 'EUR 189.50'],
  },
  {
    name: 'payment-failed',
    subject: emailSubject('Payment not completed', booking.reference),
    parts: renderPaymentFailed(brand, { reference: booking.reference, guestName: booking.guestName, guestAccessToken: 'tok-abc123', total: 189.5, currency: 'EUR', attractionTitle: booking.attractionTitle }),
    facts: [booking.reference, 'EUR 189.50'],
  },
  {
    name: 'admin-booking-notification',
    subject: emailSubject('New booking', booking.reference, booking.attractionTitle),
    parts: renderAdminBookingNotification(brand, {
      reference: booking.reference, tenantName: tenant.name, attractionTitle: booking.attractionTitle,
      date: booking.date, time: booking.time, guestName: booking.guestName,
      guestEmail: 'nadia.visitor@example.com', guestPhone: '+20 100 555 1212',
      adults: 2, children: 0, total: 189.5, currency: 'EUR', paymentMethod: 'card',
    }, `${brand.origin}/admin/bookings`),
    facts: [booking.reference, booking.guestName, 'EUR 189.50'],
  },
  {
    name: 'booking-cancelled',
    subject: emailSubject('Booking cancelled', booking.reference),
    parts: renderBookingStatusEmail(brand, { reference: booking.reference, guestName: booking.guestName, kind: 'cancelled', refundAmount: 189.5, currency: 'EUR' }),
    facts: [booking.reference, 'EUR 189.50'],
  },
  {
    name: 'refund-issued',
    subject: emailSubject('Refund processed', booking.reference),
    parts: renderBookingStatusEmail(brand, { reference: booking.reference, guestName: booking.guestName, kind: 'refunded', refundAmount: 189.5, currency: 'EUR', fullRefund: true }),
    facts: [booking.reference, 'EUR 189.50'],
  },
  {
    name: 'departure-reminder',
    subject: emailSubject('Tomorrow', booking.attractionTitle, booking.reference),
    parts: renderDepartureReminder(brand, { ...booking }),
    facts: [booking.reference, booking.attractionTitle, booking.date],
  },
  {
    name: 'trip-thank-you',
    subject: emailSubject('Thank you for travelling with us', booking.reference),
    parts: renderTripThankYou(brand, { reference: booking.reference, guestName: booking.guestName, attractionTitle: booking.attractionTitle }),
    facts: [booking.reference, booking.attractionTitle],
  },
  {
    name: 'welcome',
    subject: emailSubject(`Welcome to ${brand.name}`),
    parts: renderWelcome(brand, { userName: 'Omar Administrator', accountEmail: 'omar.admin@example.com' }),
    facts: ['omar.admin@example.com', brand.name],
  },
  {
    name: 'password-reset',
    subject: emailSubject('Reset your password', brand.name),
    parts: renderPasswordReset(brand, { userName: 'Omar Administrator', resetUrl: `${brand.origin}/reset-password?token=abc123` }),
    facts: ['Omar', 'reset-password?token=abc123'],
  },
  {
    name: 'password-changed',
    subject: emailSubject('Your password was changed', brand.name),
    parts: renderPasswordChanged(brand, { userName: 'Omar Administrator', changedAt: '18 Sep 2026, 14:20' }),
    facts: ['Omar', '18 Sep 2026, 14:20'],
  },
  {
    name: 'team-invitation',
    subject: emailSubject(`You're invited to join ${brand.name}`),
    parts: renderInvitation(brand, { inviterName: 'Fatma Manager', role: 'manager', inviteUrl: `${brand.origin}/accept-invitation?token=inv123` }),
    facts: ['Fatma Manager', 'manager', 'accept-invitation?token=inv123'],
  },
  {
    name: 'access-changed',
    subject: emailSubject('Your access was updated', brand.name),
    parts: renderAccessChanged(brand, { userName: 'Omar Administrator', role: 'manager', status: 'active', siteNames: [tenant.name], changedBy: 'Fatma Manager' }),
    facts: ['manager', 'active', tenant.name],
  },
  {
    name: 'enquiry-received',
    subject: emailSubject('We received your message', enquiry.reference),
    parts: renderEnquiryReceived(brand, enquiry),
    facts: [enquiry.reference, enquiry.message],
  },
  {
    name: 'operator-enquiry',
    subject: contactEnquirySubject(enquiry),
    parts: renderContactForm(tenant, enquiry),
    facts: [enquiry.reference, enquiry.name, enquiry.message],
  },
];

const A = templatesFor(brandA, TENANT_A);

describe('every template satisfies the email standard', () => {
  it.each(A.map((t) => [t.name, t] as const))('%s: carries its required facts in HTML and in plain text', (_name, template) => {
    for (const fact of template.facts) {
      expect(template.parts.html).toContain(fact.replace(/&/g, '&amp;'));
      expect(template.parts.text).toContain(fact);
    }
  });

  it.each(A.map((t) => [t.name, t] as const))('%s: produces a plain-text alternative that is not an HTML dump', (_name, template) => {
    const { text } = template.parts;
    expect(text.trim().length).toBeGreaterThan(80);
    expect(text).not.toMatch(/<[a-z!/][^>]*>/i);
    expect(text).not.toContain('&nbsp;');
    expect(text).not.toContain('&amp;');
    expect(text).not.toContain('style=');
    // The reader must be able to act without the HTML part.
    expect(text).toMatch(/https:\/\/\S+|mailto:\S+/);
  });

  it.each(A.map((t) => [t.name, t] as const))('%s: leaves no unresolved placeholder', (_name, template) => {
    for (const body of [template.parts.html, template.parts.text]) {
      expect(body).not.toMatch(/\{\{[^}]*\}\}/);
      expect(body).not.toMatch(/\$\{[^}]*\}/);
      expect(body).not.toMatch(/\bundefined\b/);
      expect(body).not.toMatch(/\bNaN\b/);
      expect(body).not.toContain('[object Object]');
      expect(body).not.toContain('null');
    }
  });

  it.each(A.map((t) => [t.name, t] as const))('%s: every link is absolute https (or mailto/tel)', (_name, template) => {
    const hrefs = [...template.parts.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toMatch(/^(https:\/\/|mailto:|tel:)/);
      expect(href).not.toMatch(/^http:\/\//);
    }
    for (const url of [...template.parts.text.matchAll(/https?:\/\/\S+/g)].map((m) => m[0])) {
      expect(url.startsWith('https://')).toBe(true);
    }
    // Images too: a mixed-content image is blocked by many clients.
    for (const src of [...template.parts.html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1])) {
      expect(src).toMatch(/^(https:\/\/|cid:)/);
    }
  });

  it.each(A.map((t) => [t.name, t] as const))('%s: every image carries alt text', (_name, template) => {
    for (const tag of template.parts.html.match(/<img[^>]*>/g) || []) {
      expect(tag).toMatch(/\salt="/);
      // Decorative images must opt out explicitly, not silently.
      if (/\salt=""/.test(tag)) expect(tag).toContain('role="presentation"');
    }
  });

  it.each(A.map((t) => [t.name, t] as const))('%s: has a preheader that is short and does not repeat the subject', (_name, template) => {
    const preheader = template.parts.html.match(/opacity:0;font-size:1px;line-height:1px;color:#[0-9a-f]{6};">([^<]*)</i)?.[1] || '';
    const clean = htmlFragmentToText(preheader);
    expect(clean.length).toBeGreaterThan(0);
    expect(clean.length).toBeLessThanOrEqual(PREHEADER_MAX);
    expect(clean.toLowerCase()).not.toBe(template.subject.toLowerCase());
  });

  it.each(A.map((t) => [t.name, t] as const))('%s: subject is <= 60 characters and does not shout', (_name, template) => {
    expect(template.subject.length).toBeLessThanOrEqual(60);
    expect(template.subject).not.toMatch(/[\r\n]/);
    expect(template.subject).not.toMatch(/!{2,}/);
    expect(template.subject).not.toMatch(/\bFREE\b/);
    const letters = template.subject.replace(/[^A-Za-z]/g, '');
    expect(letters === letters.toUpperCase() && letters.length >= 8).toBe(false);
  });

  it.each(A.map((t) => [t.name, t] as const))('%s: declares dark mode and renders one 600px single column', (_name, template) => {
    const { html } = template.parts;
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toContain('<meta name="supported-color-schemes" content="light dark">');
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).toContain('[data-ogsc]'); // Outlook.com dark mode
    expect(html).toContain('max-width:600px');
    expect(html).toContain('role="presentation"');
    // No external CSS, JS, iframes or SVG.
    expect(html).not.toMatch(/<script|<iframe|<svg|<link\s/i);
    expect(html).not.toMatch(/oklch\(|lab\(/);
  });

  it.each(A.map((t) => [t.name, t] as const))('%s: every button has an Outlook VML fallback and a 44px+ tap target', (_name, template) => {
    const { html } = template.parts;
    const anchors = (html.match(/class="fx-btn"/g) || []).length;
    const vml = (html.match(/<v:roundrect/g) || []).length;
    expect(anchors).toBeGreaterThan(0);
    expect(vml).toBe(anchors);
    expect(html).toContain('height:48px;v-text-anchor:middle');
    // 15px padding + 20px line-height + 15px padding = 50px, comfortably over 44.
    expect(html).toContain('padding:15px 26px');
    // A web primary action repeats its URL as plain text for clients that strip buttons.
    // A mailto primary (the operator's "Reply to ..." button) does not: the address is the button.
    const primaryIsWeb = (html.match(/<a class="fx-btn" href="([^"]+)"/) || [])[1]?.startsWith('https://') ?? false;
    if (primaryIsWeb) expect(html).toMatch(/class="fx-muted fx-small"[^>]*>[^<]*: <a href="https:\/\//);
  });

  it.each(A.map((t) => [t.name, t] as const))('%s: body text reaches 16px on mobile and the headline stays >= 24px', (_name, template) => {
    const { html } = template.parts;
    expect(html).toContain('.fx-intro,.fx-body,.fx-value{font-size:16px!important');
    expect(html).toContain('.fx-h1{font-size:24px!important');
    expect(html).toContain('.fx-pad{padding-left:24px!important;padding-right:24px!important;}');
  });

  it.each(A.map((t) => [t.name, t] as const))('%s: says why the reader received it', (_name, template) => {
    expect(template.parts.html).toMatch(/You received this/);
    expect(template.parts.text).toMatch(/You received this/);
  });
});

describe('opt-out', () => {
  it('scheduled mail offers an unsubscribe route; transactional mail does not', () => {
    const reminder = renderDepartureReminder(brandA, booking);
    expect(reminder.html).toContain('Unsubscribe');
    expect(reminder.text).toContain('Unsubscribe:');
    expect(unsubscribeTarget(brandA, booking.reference)).toContain('mailto:info@safari-sahara.com');

    const confirmation = renderBookingConfirmation(brandA, { ...booking, paymentMethod: 'card' });
    expect(confirmation.html).not.toContain('>Unsubscribe<');
    // ...but still explains why it arrived.
    expect(confirmation.html).toContain('You received this email because it relates to a booking');
  });

  it('never emits an unsubscribe link for a site with no contact inbox', () => {
    const brandless = getEmailBrand({ name: 'Quiet Site', slug: 'quiet' });
    expect(unsubscribeTarget(brandless, 'REF-1')).toBeUndefined();
    expect(renderDepartureReminder(brandless, booking).html).not.toContain('>Unsubscribe<');
  });
});

describe('escaping', () => {
  const attack = '<img src=x onerror="alert(1)">';
  const quoted = '"><script>alert(1)</script>';

  it('escapes every interpolated value in every template that takes one', () => {
    const bodies = [
      renderBookingConfirmation(brandA, { ...booking, guestName: attack, attractionTitle: attack, reference: attack, currency: attack }).html,
      renderBookingPaymentLink(brandA, { reference: attack, guestName: attack, guestAccessToken: quoted, total: 1, currency: attack }).html,
      renderPaymentFailed(brandA, { reference: attack, guestName: attack, total: 1, currency: attack, attractionTitle: attack }).html,
      renderAdminBookingNotification(brandA, {
        reference: attack, tenantName: attack, attractionTitle: attack, date: attack, guestName: attack,
        guestEmail: attack, guestPhone: attack, adults: 1, children: 0, total: 1, currency: attack, paymentMethod: attack,
      }, 'javascript:alert(1)').html,
      renderBookingStatusEmail(brandA, { reference: attack, guestName: attack, kind: 'cancelled' }).html,
      renderDepartureReminder(brandA, { ...booking, guestName: attack, attractionTitle: attack, reference: attack }).html,
      renderTripThankYou(brandA, { reference: attack, guestName: attack, attractionTitle: attack, attractionPath: 'javascript:alert(1)' }).html,
      renderWelcome(brandA, { userName: attack, accountEmail: attack }).html,
      renderPasswordReset(brandA, { userName: attack, resetUrl: 'javascript:alert(1)' }).html,
      renderPasswordChanged(brandA, { userName: attack, changedAt: attack }).html,
      renderInvitation(brandA, { inviterName: attack, role: attack, inviteUrl: 'javascript:alert(1)' }).html,
      renderAccessChanged(brandA, { userName: attack, role: attack, status: attack, siteNames: [attack], changedBy: attack }).html,
      renderEnquiryReceived(brandA, { ...enquiry, name: attack, tourTitle: attack, message: attack }).html,
      renderContactForm(TENANT_A, { ...enquiry, name: attack, tourTitle: attack, message: attack }).html,
    ];
    for (const html of bodies) {
      expect(html).not.toContain('<img src=x');
      expect(html).not.toContain('onerror="alert');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('javascript:');
      // The payload survives only as inert, escaped text. (Where it lands in a name it is
      // truncated to the first word, so assert the escaping, not the whole string.)
      expect(html).toContain('&lt;');
    }
  });

  it('escapes hostile values in the plain-text part without letting markup through', () => {
    const { text } = renderEnquiryReceived(brandA, { ...enquiry, name: attack, message: attack });
    // The text part carries the literal characters the visitor typed, never live markup.
    expect(text).toContain('<img src=x onerror="alert(1)">');
    expect(text).not.toContain('&lt;');
  });

  it('refuses a non-http action URL rather than rendering it', () => {
    expect(renderPasswordReset(brandA, { userName: 'Omar', resetUrl: 'javascript:alert(1)' }).html).toContain('href="#"');
  });
});

describe('recipient routing outside production', () => {
  it('delivers as addressed in production', () => {
    expect(resolveEmailRecipient('guest@example.com', 'transactional', { nodeEnv: 'production', qaInbox: '' }))
      .toEqual({ recipient: 'guest@example.com' });
  });

  it('redirects a staging send to the QA inbox', () => {
    expect(resolveEmailRecipient('guest@example.com', 'transactional', { nodeEnv: 'staging', qaInbox: 'QA-Inbox@Example.com' }))
      .toEqual({ recipient: 'qa-inbox@example.com' });
  });

  it('skips rather than delivers when staging has no QA inbox', () => {
    expect(resolveEmailRecipient('guest@example.com', 'transactional', { nodeEnv: 'staging', qaInbox: '' }))
      .toEqual({ skip: 'non_production_no_qa_inbox' });
    expect(resolveEmailRecipient('guest@example.com', 'reminder', { nodeEnv: 'development', qaInbox: 'not-an-address' }))
      .toEqual({ skip: 'non_production_no_qa_inbox' });
  });

  it('sends account-security mail to the account holder everywhere, by design', () => {
    expect(resolveEmailRecipient('omar.admin@example.com', 'account', { nodeEnv: 'staging', qaInbox: 'qa@example.com' }))
      .toEqual({ recipient: 'omar.admin@example.com' });
  });

  it('never puts a full address in a log fingerprint', () => {
    const hash = recipientFingerprint('Guest@Example.com');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('example.com');
    expect(hash).toBe(recipientFingerprint('guest@example.com'));
  });
});

describe('contrast', () => {
  it('keeps body, muted and faint text readable on both light and dark surfaces', () => {
    const pairs: Array<[string, string]> = [
      ['#1c1917', '#ffffff'], // ink on card
      ['#57534e', '#ffffff'], // muted on card
      ['#57534e', '#faf8f4'], // muted on panel
      ['#f5f5f4', '#1c1917'], // dark ink on dark card
      ['#d7d3ce', '#1c1917'], // dark muted on dark card
      ['#d7d3ce', '#26221e'], // dark muted on dark panel
    ];
    for (const [fg, bg] of pairs) expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps faint labels above the large-text threshold on both themes', () => {
    expect(contrastRatio('#8a847c', '#faf8f4')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio('#aaa49c', '#26221e')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps every tone badge readable on its own background in both themes', () => {
    const light: Array<[string, string]> = [
      ['#166534', '#ecfdf3'], ['#1e40af', '#eff6ff'], ['#92400e', '#fffbeb'], ['#991b1b', '#fef2f2'], ['#44403c', '#f5f5f4'],
    ];
    const dark: Array<[string, string]> = [
      ['#86efac', '#13291d'], ['#a5c9ff', '#15223a'], ['#fcd34d', '#2d2410'], ['#fca5a5', '#33191a'], ['#d7d3ce', '#2a2622'],
    ];
    for (const [fg, bg] of [...light, ...dark]) expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps a light brand button readable by flipping the label to ink', () => {
    const gold = renderBookingConfirmation(getEmailBrand(TENANT_A), { ...booking, paymentMethod: 'card' }).html;
    expect(gold).toContain('color:#1c1917'); // ink label on the gold fill
    const navy = renderBookingConfirmation(getEmailBrand(TENANT_B), { ...booking, paymentMethod: 'card' }).html;
    expect(navy).toContain('color:#ffffff'); // white label on the navy fill
  });
});

describe('right-to-left', () => {
  const arabicTenant = { ...TENANT_A, defaultLanguage: 'ar' };
  const arabicBrand = getEmailBrand(arabicTenant);

  it('picks direction from the site language', () => {
    expect(directionForLanguage('ar')).toBe('rtl');
    expect(directionForLanguage('ar-EG')).toBe('rtl');
    expect(directionForLanguage('he')).toBe('rtl');
    expect(directionForLanguage('en')).toBe('ltr');
    expect(directionForLanguage(undefined)).toBe('ltr');
    expect(arabicBrand.dir).toBe('rtl');
    expect(brandA.dir).toBe('ltr');
  });

  it('mirrors the document and keeps Latin values isolated left-to-right', () => {
    const { html } = renderBookingConfirmation(arabicBrand, { ...booking, paymentMethod: 'card' });
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('direction:rtl');
    expect(html).toContain('text-align:right');
    // The reference and the amount must not be reordered by the bidi algorithm.
    expect(html).toContain('unicode-bidi:isolate');
    expect(html).toMatch(/<span dir="ltr"[^>]*>SS-10421<\/span>/);
  });

  it('leaves an English site left-to-right', () => {
    const { html } = renderBookingConfirmation(brandA, { ...booking, paymentMethod: 'card' });
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).not.toContain('direction:rtl');
  });
});

describe('the paid confirmation doubles as the payment receipt', () => {
  it('itemises the money when the booking was actually paid', () => {
    const { html, text } = renderBookingConfirmation(brandA, {
      ...booking, paymentMethod: 'card', subtotal: 200, fees: 9.5, discount: 20, promoCode: 'AUTUMN20',
    });
    for (const body of [html, text]) {
      expect(body).toContain('EUR 200.00');
      expect(body).toContain('EUR 9.50');
      expect(body).toContain('AUTUMN20');
      expect(body).toContain('EUR 189.50');
    }
    expect(text).toContain('Total paid');
  });

  it('shows no receipt breakdown for a pay-at-location booking', () => {
    const { html, text } = renderBookingConfirmation(brandA, { ...booking, paymentMethod: 'pay-later', subtotal: 200, fees: 9.5 });
    expect(html).not.toContain('EUR 200.00');
    expect(text).toContain('Pay at location');
  });
});
