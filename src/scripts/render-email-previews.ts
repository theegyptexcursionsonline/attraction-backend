/**
 * Renders every transactional template with realistic sample data, for two different tenant
 * brands, to `readiness-proof/<date>/email-previews/` plus an index.
 *
 * Nothing is sent: the templates are pure functions, so this never touches the mail provider.
 *
 *   npx ts-node -T src/scripts/render-email-previews.ts [outDir]
 */
import fs from 'fs';
import path from 'path';
import {
  FIRST_SCREEN,
  closeMeasurementBrowser,
  measureEmail,
  measurementBrowser,
} from '../services/emailMeasure';
import {
  EmailBrand,
  EmailTenant,
  contactEnquirySubject,
  emailSubject,
  getEmailBrand,
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
} from '../services/email.service';

const OUT = process.argv[2] || path.join(process.cwd(), 'readiness-proof', '2026-09-18', 'email-previews');

/** Two real-shaped sites with deliberately different brand colour, logo, domain and contacts. */
const TENANTS: Array<EmailTenant & { key: string }> = [
  {
    key: 'safari-sahara',
    name: 'Safari Sahara Hurghada',
    slug: 'safari-sahara-hurghada',
    customDomain: 'safari-sahara.com',
    domainMigrated: true,
    theme: { primaryColor: '#D4A843' },
    logo: 'https://res.cloudinary.com/demo/image/upload/w_200/sample.png',
    contactInfo: {
      email: 'info@safari-sahara.com',
      phone: '+20 111 341 8533',
      address: 'Village Road, Hurghada, Red Sea Governorate, Egypt',
    },
    defaultLanguage: 'en',
    defaultCurrency: 'EUR',
    timezone: 'Africa/Cairo',
  },
  {
    key: 'makadi-horse-club',
    name: 'Makadi Horse Club',
    slug: 'makadi-horse-club',
    customDomain: 'makadihorseclub.com',
    domainMigrated: true,
    theme: { primaryColor: '#0F3D5E' },
    logo: 'https://res.cloudinary.com/demo/image/upload/w_200/balloons.jpg',
    contactInfo: {
      email: 'reservations@makadihorseclub.com',
      phone: '+20 100 222 3344',
      address: 'Beach Road, Makadi Bay, Hurghada, Egypt',
    },
    defaultLanguage: 'en',
    defaultCurrency: 'USD',
    timezone: 'Africa/Cairo',
  },
];

/** An Arabic-language variant of the first site, to prove the RTL path. */
const RTL_TENANT: EmailTenant & { key: string } = { ...TENANTS[0], key: 'safari-sahara-ar', defaultLanguage: 'ar' };

const guest = { firstName: 'Nadia', lastName: 'Visitor', email: 'nadia.visitor@example.com', phone: '+20 100 555 1212' };
const guestName = `${guest.firstName} ${guest.lastName}`;

const bookingFor = (tenant: EmailTenant) => ({
  reference: tenant.slug === 'makadi-horse-club' ? 'MHC-20841' : 'SSH-10421',
  attractionTitle: tenant.slug === 'makadi-horse-club' ? 'Sunrise Horse Ride on the Beach' : 'Super Safari Desert Adventure',
  date: 'Tuesday, 22 September 2026',
  time: '08:00 (Africa/Cairo)',
  guestName,
  total: 189.5,
  currency: tenant.defaultCurrency || 'EUR',
  guests: 2,
  guestAccessToken: 'gs_2f9c41ab7e5d4c88',
  subtotal: 200,
  fees: 9.5,
  discount: 20,
  promoCode: 'AUTUMN20',
  hotelPickup: { status: 'confirmed' as const, hotelName: 'Sunrise Royal Makadi', roomNumber: '412', pickupTime: '07:15' },
  meetingPoint: { lat: 27.0611, lng: 33.8842, label: 'Hotel lobby, Sunrise Royal Makadi' },
});

/** A booked option with extras, rendered as separate previews so the base budgets stay comparable. */
const addonLinesFor = (tenant: EmailTenant) => [{
  optionName: tenant.slug === 'makadi-horse-club' ? 'Private ride' : 'Double quad bike',
  date: '2026-09-22', time: '08:00', adults: 2, children: 0, infants: 0,
  addons: [
    { name: 'Photo package', quantity: 2, unitPrice: 10, lineTotal: 20 },
    { name: 'Cold drinks', quantity: 1, unitPrice: 4, lineTotal: 4 },
  ],
}];

const enquiryFor = (tenant: EmailTenant) => ({
  reference: 'MSG-7Q2X6C',
  name: guestName,
  email: guest.email,
  phone: guest.phone,
  tourTitle: bookingFor(tenant).attractionTitle,
  travelDate: '2026-09-22',
  guests: 2,
  message: 'Good morning,\n\nDo you offer hotel pickup from Makadi Bay, and is the tour suitable for a 9 year old?\n\nThank you,\nNadia',
  pagePath: '/super-safari-desert-adventure',
  locale: 'en',
});

interface Preview {
  slug: string;
  title: string;
  subject: string;
  html: string;
  text: string;
  /** Filled in by the measuring pass (EMAIL-DESIGN-STANDARD §6). */
  height?: number;
  chromeHeight?: number;
  keyFactBottom?: number;
  overflow?: boolean;
}

const CHROME_MAX = 140;
const ROUTINE_MAX = 1700;
const CONFIRMATION_MAX = 1600;
const capFor = (slug: string): number => (slug.startsWith('booking-confirmation') ? CONFIRMATION_MAX : ROUTINE_MAX);

const buildPreviews = (tenant: EmailTenant): Preview[] => {
  const brand: EmailBrand = getEmailBrand(tenant);
  const booking = bookingFor(tenant);
  const enquiry = enquiryFor(tenant);
  const paid = { ...booking, paymentMethod: 'card' };

  const rows: Array<[string, string, string, { html: string; text: string }]> = [
    ['booking-confirmation', 'Booking confirmation (paid, with ticket + receipt)', emailSubject('Booking confirmed', booking.reference),
      renderBookingConfirmation(brand, paid, true, 'https://res.cloudinary.com/demo/image/upload/w_156/sample.png')],
    ['booking-confirmation-pay-later', 'Booking confirmation (pay at location)', emailSubject('Booking confirmed', booking.reference),
      renderBookingConfirmation(brand, { ...booking, paymentMethod: 'pay-later' }, false)],
    ['booking-payment-link', 'Payment link', emailSubject('Complete payment', booking.reference),
      renderBookingPaymentLink(brand, { reference: booking.reference, guestName, guestAccessToken: booking.guestAccessToken, total: booking.total, currency: booking.currency })],
    ['payment-failed', 'Payment failed / action needed', emailSubject('Payment not completed', booking.reference),
      renderPaymentFailed(brand, { reference: booking.reference, guestName, guestAccessToken: booking.guestAccessToken, total: booking.total, currency: booking.currency, attractionTitle: booking.attractionTitle })],
    ['booking-cancelled', 'Booking cancelled (with refund)', emailSubject('Booking cancelled', booking.reference),
      renderBookingStatusEmail(brand, { reference: booking.reference, guestName, kind: 'cancelled', refundAmount: booking.total, currency: booking.currency, guestAccessToken: booking.guestAccessToken })],
    ['refund-issued', 'Refund issued', emailSubject('Refund processed', booking.reference),
      renderBookingStatusEmail(brand, { reference: booking.reference, guestName, kind: 'refunded', refundAmount: booking.total, currency: booking.currency, fullRefund: true, guestAccessToken: booking.guestAccessToken })],
    ['departure-reminder', 'Departure reminder (24h before)', emailSubject('Tomorrow', booking.attractionTitle, booking.reference),
      renderDepartureReminder(brand, booking)],
    ['trip-thank-you', 'After-trip thank-you', emailSubject('Thank you for travelling with us', booking.reference),
      renderTripThankYou(brand, { reference: booking.reference, guestName, attractionTitle: booking.attractionTitle, guestAccessToken: booking.guestAccessToken })],
    ['admin-booking-notification', 'Operator: new booking alert', emailSubject('New booking', booking.reference, booking.attractionTitle),
      renderAdminBookingNotification(brand, {
        reference: booking.reference, tenantName: brand.name, attractionTitle: booking.attractionTitle,
        date: booking.date, time: booking.time, guestName, guestEmail: guest.email, guestPhone: guest.phone,
        adults: 2, children: 0, total: booking.total, currency: booking.currency, paymentMethod: 'card',
        hotelPickup: booking.hotelPickup, meetingPoint: booking.meetingPoint,
      }, `${brand.origin}/admin/bookings`)],
    ['booking-confirmation-with-addons', 'Booking confirmation with an option and add-ons (paid)', emailSubject('Booking confirmed', booking.reference),
      renderBookingConfirmation(brand, { ...paid, lines: addonLinesFor(tenant) }, true, 'https://res.cloudinary.com/demo/image/upload/w_156/sample.png')],
    ['admin-booking-notification-with-addons', 'Operator: new booking alert with an option and add-ons', emailSubject('New booking', booking.reference, booking.attractionTitle),
      renderAdminBookingNotification(brand, {
        reference: booking.reference, tenantName: brand.name, attractionTitle: booking.attractionTitle,
        date: booking.date, time: booking.time, guestName, guestEmail: guest.email, guestPhone: guest.phone,
        adults: 2, children: 0, infants: 0, lines: addonLinesFor(tenant), total: booking.total, currency: booking.currency, paymentMethod: 'card',
        hotelPickup: booking.hotelPickup, meetingPoint: booking.meetingPoint,
      }, `${brand.origin}/admin/bookings`)],
    ['operator-enquiry', 'Operator: new enquiry', contactEnquirySubject(enquiry),
      renderContactForm(tenant, enquiry)],
    ['enquiry-received', 'Enquiry received (visitor acknowledgement)', emailSubject('We received your message', enquiry.reference),
      renderEnquiryReceived(brand, enquiry)],
    ['welcome', 'Welcome / account created', emailSubject(`Welcome to ${brand.name}`),
      renderWelcome(brand, { userName: guestName, accountEmail: guest.email })],
    ['password-reset', 'Password reset', emailSubject('Reset your password', brand.name),
      renderPasswordReset(brand, { userName: 'Omar Administrator', resetUrl: `${brand.origin}/reset-password?token=8f3c1d9b4a2e` })],
    ['password-changed', 'Password changed', emailSubject('Your password was changed', brand.name),
      renderPasswordChanged(brand, { userName: 'Omar Administrator', changedAt: '18 September 2026, 14:20' })],
    ['team-invitation', 'Team invitation', emailSubject(`You're invited to join ${brand.name}`),
      renderInvitation(brand, { inviterName: 'Fatma Reservations Manager', role: 'manager', inviteUrl: `${brand.origin}/accept-invitation?token=d41c8a3f9b2e` })],
    ['access-changed', 'Access changed', emailSubject('Your access was updated', brand.name),
      renderAccessChanged(brand, { userName: 'Omar Administrator', role: 'manager', status: 'active', siteNames: [brand.name], changedBy: 'Fatma Reservations Manager' })],
  ];

  return rows.map(([slug, title, subject, parts]) => ({ slug, title, subject, html: parts.html, text: parts.text }));
};

const escape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const write = (file: string, body: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, 'utf8');
};

const main = async (): Promise<void> => {
  fs.mkdirSync(OUT, { recursive: true });
  const sets = [...TENANTS, RTL_TENANT].map((tenant) => ({ tenant, previews: buildPreviews(tenant) }));

  // Measure every template at 390px on the rendered output, as §3/§6 require. Estimating from
  // markup is how a 2,042px booking confirmation once passed review.
  const browser = await measurementBrowser();
  for (const { tenant, previews } of sets) {
    console.log(`\n${tenant.name}${tenant.defaultLanguage === 'ar' ? ' (Arabic, RTL)' : ''} — measured at 390px`);
    console.log('   height   chrome   key fact   template');
    for (const preview of previews) {
      write(path.join(OUT, tenant.key, `${preview.slug}.html`), preview.html);
      write(path.join(OUT, tenant.key, `${preview.slug}.txt`), preview.text);
      const metrics = await measureEmail(preview.html, browser);
      Object.assign(preview, {
        height: metrics.height,
        chromeHeight: metrics.chromeHeight,
        keyFactBottom: metrics.keyFactBottom,
        overflow: metrics.horizontalOverflow,
      });
      const flag = (value: number, cap: number) => (value > cap ? '!' : ' ');
      console.log(
        `  ${String(metrics.height).padStart(5)}px${flag(metrics.height, capFor(preview.slug))}` +
          `  ${String(metrics.chromeHeight).padStart(4)}px${flag(metrics.chromeHeight, CHROME_MAX)}` +
          `   ${String(metrics.keyFactBottom).padStart(5)}px${flag(metrics.keyFactBottom, FIRST_SCREEN)}` +
          `   ${preview.slug}${metrics.horizontalOverflow ? '  [SCROLLS SIDEWAYS]' : ''}`
      );
    }
    const avg = Math.round(previews.reduce((total, p) => total + (p.height || 0), 0) / previews.length);
    console.log(`  average ${avg}px over ${previews.length} templates`);
  }
  await closeMeasurementBrowser();

  const index = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ATN transactional email previews</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f5f2; --card:#fff; --ink:#1c1917; --muted:#57534e; --line:#e7e2da; }
  @media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) { --bg:#14110e; --card:#1c1917; --ink:#f5f5f4; --muted:#d7d3ce; --line:#3d3830; } }
  body { margin:0; padding:24px 16px 64px; background:var(--bg); color:var(--ink);
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
  .wrap { max-width:1100px; margin:0 auto; }
  h1 { font-size:26px; margin:0 0 6px; letter-spacing:-.4px; }
  p.lead { color:var(--muted); margin:0 0 28px; line-height:1.55; }
  h2 { font-size:17px; margin:34px 0 12px; }
  table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  th, td { text-align:left; padding:11px 14px; border-bottom:1px solid var(--line); font-size:14px; vertical-align:top; }
  th { color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.8px; }
  tr:last-child td { border-bottom:0; }
  a { color:inherit; }
  code { font-family:'SF Mono',Menlo,Consolas,monospace; font-size:12px; color:var(--muted); }
  td.ok { color:#166534; font-variant-numeric:tabular-nums; }
  td.over { color:#991b1b; font-weight:700; font-variant-numeric:tabular-nums; }
  @media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) td.ok { color:#86efac; } :root:not([data-theme="light"]) td.over { color:#fca5a5; } }
  .n { color:var(--muted); font-size:13px; }
  @media (max-width:640px){ th:nth-child(3), td:nth-child(3) { display:none; } }
</style>
</head>
<body>
<div class="wrap">
  <h1>Transactional email previews</h1>
  <p class="lead">Every template this backend sends, rendered with realistic sample data for two different
  site brands plus an Arabic (right-to-left) variant. Each row links the HTML part and the plain-text
  alternative. Open a file and toggle your OS light/dark setting to check dark mode; narrow the window
  to 390px to check the mobile layout. Heights are measured on the rendered output at 390px, not
  estimated; the budgets are <strong>chrome ≤ 140px</strong>, key fact within the first
  <strong>844px</strong>, routine email ≤ 1,700px and booking confirmation ≤ 1,600px.</p>
${sets.map(({ tenant, previews }) => `  <h2>${escape(tenant.name || '')}${tenant.defaultLanguage === 'ar' ? ' — Arabic (RTL)' : ''} <span class="n">· ${escape(tenant.theme?.primaryColor || '')} · ${escape(tenant.customDomain || '')}</span></h2>
  <table>
    <tr><th>Template</th><th>Subject</th><th>390px height</th><th>Chrome</th><th>Parts</th></tr>
${previews.map((preview) => `    <tr>
      <td><a href="${tenant.key}/${preview.slug}.html">${escape(preview.title)}</a></td>
      <td>${escape(preview.subject)} <span class="n">(${preview.subject.length}/60)</span></td>
      <td class="${(preview.height || 0) > capFor(preview.slug) ? 'over' : 'ok'}">${preview.height}px <span class="n">/ ${capFor(preview.slug)}</span></td>
      <td class="${(preview.chromeHeight || 0) > CHROME_MAX ? 'over' : 'ok'}">${preview.chromeHeight}px <span class="n">/ ${CHROME_MAX}</span></td>
      <td><a href="${tenant.key}/${preview.slug}.html">HTML</a> · <a href="${tenant.key}/${preview.slug}.txt">text</a></td>
    </tr>`).join('\n')}
  </table>`).join('\n')}
  <p class="n" style="margin-top:32px;">Generated by <code>src/scripts/render-email-previews.ts</code>. No email was sent to produce these.</p>
</div>
</body>
</html>`;

  write(path.join(OUT, 'index.html'), index);
  const count = sets.reduce((total, set) => total + set.previews.length, 0);
  console.log(`\nRendered ${count} previews across ${sets.length} brand variants -> ${OUT}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
