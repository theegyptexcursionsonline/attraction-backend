import {
  EmailBrand,
  getEmailBrand,
  renderAccessChanged,
  renderAdminBookingNotification,
  renderBookingConfirmation,
  renderBookingPaymentLink,
  renderBookingStatusEmail,
  renderOperatorBookingStatusEmail,
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
import {
  FIRST_SCREEN,
  MOBILE_WIDTH,
  closeMeasurementBrowser,
  measureEmail,
  measurementBrowser,
} from '../services/emailMeasure';
import type { Browser } from 'playwright-core';

/**
 * EMAIL-DESIGN-STANDARD §3 mobile budgets, measured at 390px on the rendered output.
 *
 * These are asserted, not eyeballed, because the previous pass shipped a 2,042px booking
 * confirmation with 176px of chrome and every fact stacked onto two lines while every other rule
 * in the standard passed. Measured per BRAND, because the brand supplies the header logo and its
 * own colour, and the header is what the chrome budget is about.
 */

const CHROME_MAX = 140;
const ROUTINE_MAX = 1700;
const CONFIRMATION_MAX = 1600;

const TENANTS = {
  'Safari Sahara Hurghada': {
    name: 'Safari Sahara Hurghada', slug: 'safari-sahara-hurghada',
    customDomain: 'safari-sahara.com', domainMigrated: true,
    theme: { primaryColor: '#D4A843' },
    logo: 'https://cdn.example/safari-logo.png',
    contactInfo: { email: 'info@safari-sahara.com', phone: '+20 111 341 8533', address: 'Village Road, Hurghada, Red Sea Governorate, Egypt' },
    defaultLanguage: 'en', defaultCurrency: 'EUR', timezone: 'Africa/Cairo',
  },
  'Makadi Horse Club': {
    name: 'Makadi Horse Club', slug: 'makadi-horse-club',
    customDomain: 'makadihorseclub.com', domainMigrated: true,
    theme: { primaryColor: '#0F3D5E' },
    logo: 'https://cdn.example/makadi-logo.png',
    contactInfo: { email: 'reservations@makadihorseclub.com', phone: '+20 100 222 3344', address: 'Beach Road, Makadi Bay, Hurghada, Egypt' },
    defaultLanguage: 'en', defaultCurrency: 'USD', timezone: 'Africa/Cairo',
  },
  'Safari Sahara (Arabic, RTL)': {
    name: 'Safari Sahara Hurghada', slug: 'safari-sahara-hurghada',
    customDomain: 'safari-sahara.com', domainMigrated: true,
    theme: { primaryColor: '#D4A843' },
    logo: 'https://cdn.example/safari-logo.png',
    contactInfo: { email: 'info@safari-sahara.com', phone: '+20 111 341 8533', address: 'Village Road, Hurghada, Red Sea Governorate, Egypt' },
    defaultLanguage: 'ar', defaultCurrency: 'EUR', timezone: 'Africa/Cairo',
  },
};

const guestName = 'Nadia Visitor';

/** The heaviest realistic payload for each template — pickup, receipt, QR, map, the lot. */
const templatesFor = (tenant: typeof TENANTS['Makadi Horse Club']) => {
  const brand: EmailBrand = getEmailBrand(tenant);
  const booking = {
    reference: 'SSH-10421',
    attractionTitle: 'Super Safari Desert Adventure',
    date: 'Tuesday, 22 September 2026',
    time: '08:00 (Africa/Cairo)',
    guestName,
    total: 189.5,
    currency: tenant.defaultCurrency,
    guests: 2,
    guestAccessToken: 'gs_2f9c41ab7e5d4c88',
    subtotal: 200,
    fees: 9.5,
    discount: 20,
    promoCode: 'AUTUMN20',
    hotelPickup: { status: 'confirmed' as const, hotelName: 'Sunrise Royal Makadi', roomNumber: '412', pickupTime: '07:15' },
    meetingPoint: { lat: 27.0611, lng: 33.8842, label: 'Hotel lobby, Sunrise Royal Makadi' },
  };
  const enquiry = {
    reference: 'MSG-7Q2X6C', name: guestName, email: 'nadia.visitor@example.com', phone: '+20 100 555 1212',
    tourTitle: booking.attractionTitle, travelDate: '2026-09-22', guests: 2,
    message: 'Good morning,\n\nDo you offer hotel pickup from Makadi Bay, and is the tour suitable for a 9 year old?\n\nThank you,\nNadia',
    pagePath: '/super-safari-desert-adventure', locale: 'en',
  };

  return [
    ['booking-confirmation', renderBookingConfirmation(brand, { ...booking, paymentMethod: 'card' }, true, 'cid:qr.png').html, CONFIRMATION_MAX],
    ['booking-confirmation-pay-later', renderBookingConfirmation(brand, { ...booking, paymentMethod: 'pay-later' }, false).html, CONFIRMATION_MAX],
    ['booking-payment-link', renderBookingPaymentLink(brand, { reference: booking.reference, guestName, guestAccessToken: booking.guestAccessToken, total: booking.total, currency: booking.currency }).html, ROUTINE_MAX],
    ['payment-failed', renderPaymentFailed(brand, { reference: booking.reference, guestName, guestAccessToken: booking.guestAccessToken, total: booking.total, currency: booking.currency, attractionTitle: booking.attractionTitle }).html, ROUTINE_MAX],
    ['operator-cancelled', renderOperatorBookingStatusEmail(brand, { reference: booking.reference, guestName, kind: 'cancelled', refundAmount: booking.total, currency: booking.currency }).html, ROUTINE_MAX],
    ['operator-refunded', renderOperatorBookingStatusEmail(brand, { reference: booking.reference, guestName, kind: 'refunded', refundAmount: booking.total, currency: booking.currency, fullRefund: false }).html, ROUTINE_MAX],
    ['booking-cancelled', renderBookingStatusEmail(brand, { reference: booking.reference, guestName, kind: 'cancelled', refundAmount: booking.total, currency: booking.currency }).html, ROUTINE_MAX],
    ['refund-issued', renderBookingStatusEmail(brand, { reference: booking.reference, guestName, kind: 'refunded', refundAmount: booking.total, currency: booking.currency, fullRefund: true }).html, ROUTINE_MAX],
    ['departure-reminder', renderDepartureReminder(brand, booking).html, ROUTINE_MAX],
    ['trip-thank-you', renderTripThankYou(brand, { reference: booking.reference, guestName, attractionTitle: booking.attractionTitle }).html, ROUTINE_MAX],
    ['admin-booking-notification', renderAdminBookingNotification(brand, {
      reference: booking.reference, tenantName: brand.name, attractionTitle: booking.attractionTitle,
      date: booking.date, time: booking.time, guestName, guestEmail: enquiry.email, guestPhone: enquiry.phone,
      adults: 2, children: 0, total: booking.total, currency: booking.currency, paymentMethod: 'card',
      hotelPickup: booking.hotelPickup, meetingPoint: booking.meetingPoint,
    }, `${brand.origin}/admin/bookings`).html, ROUTINE_MAX],
    ['operator-enquiry', renderContactForm(tenant, enquiry).html, ROUTINE_MAX],
    ['enquiry-received', renderEnquiryReceived(brand, enquiry).html, ROUTINE_MAX],
    ['welcome', renderWelcome(brand, { userName: 'Omar Administrator', accountEmail: 'omar.admin@example.com' }).html, ROUTINE_MAX],
    ['password-reset', renderPasswordReset(brand, { userName: 'Omar Administrator', resetUrl: `${brand.origin}/reset-password?token=8f3c1d9b4a2e` }).html, ROUTINE_MAX],
    ['password-changed', renderPasswordChanged(brand, { userName: 'Omar Administrator', changedAt: '18 September 2026, 14:20' }).html, ROUTINE_MAX],
    ['team-invitation', renderInvitation(brand, { inviterName: 'Fatma Reservations Manager', role: 'manager', inviteUrl: `${brand.origin}/accept-invitation?token=d41c8a3f9b2e` }).html, ROUTINE_MAX],
    ['access-changed', renderAccessChanged(brand, { userName: 'Omar Administrator', role: 'manager', status: 'active', siteNames: [brand.name], changedBy: 'Fatma Reservations Manager' }).html, ROUTINE_MAX],
  ] as Array<[string, string, number]>;
};

let browser: Browser;

beforeAll(async () => {
  try {
    browser = await measurementBrowser();
  } catch (error) {
    throw new Error(
      'The mobile budget suite needs a Chromium build to measure rendered height at 390px. ' +
        'Install one with `npx playwright install chromium`. Original error: ' +
        (error instanceof Error ? error.message : String(error))
    );
  }
}, 120_000);

afterAll(async () => closeMeasurementBrowser());

describe.each(Object.entries(TENANTS))('%s at 390px', (_brandName, tenant) => {
  const templates = templatesFor(tenant as typeof TENANTS['Makadi Horse Club']);

  it.each(templates)('%s fits the mobile budgets', async (name, html, cap) => {
    const metrics = await measureEmail(html, browser);

    // Reported on every run so a regression shows the number, not just a red cross.
    const summary = `${name}: ${metrics.height}px tall (<= ${cap}), chrome ${metrics.chromeHeight}px (<= ${CHROME_MAX}), key fact at ${metrics.keyFactBottom}px (<= ${FIRST_SCREEN})`;
    expect(summary).toEqual(expect.any(String));

    expect(metrics.chromeHeight).toBeLessThanOrEqual(CHROME_MAX);
    expect(metrics.keyFactBottom).toBeLessThanOrEqual(FIRST_SCREEN);
    expect(metrics.height).toBeLessThanOrEqual(cap);
    expect(metrics.horizontalOverflow).toBe(false);
  }, 60_000);
});

describe('bookings with add-ons at 390px', () => {
  const brand = getEmailBrand(TENANTS['Safari Sahara Hurghada']);
  const addons = ['Photo package', 'Cold drinks', 'Helmet camera', 'Buggy upgrade']
    .map((name, index) => ({ name, quantity: index + 1, unitPrice: 5, lineTotal: 5 * (index + 1) }));
  const lines = [{ optionName: 'Double quad bike', date: '2026-09-22', time: '08:00', adults: 2, children: 0, infants: 0, addons }];
  const booking = {
    reference: 'SSH-10421', attractionTitle: 'Super Safari Desert Adventure', date: 'Tuesday, 22 September 2026',
    time: '08:00 (Africa/Cairo)', guestName: 'Nadia Visitor', total: 189.5, currency: 'EUR', guests: 2,
    guestAccessToken: 'gs_2f9c41ab7e5d4c88', subtotal: 200, fees: 9.5, discount: 20, promoCode: 'AUTUMN20', paymentMethod: 'card',
    hotelPickup: { status: 'confirmed' as const, hotelName: 'Sunrise Royal Makadi', roomNumber: '412', pickupTime: '07:15' },
  };
  const operator = {
    reference: booking.reference, tenantName: brand.name, attractionTitle: booking.attractionTitle, date: booking.date, time: booking.time,
    guestName: booking.guestName, guestEmail: 'nadia.visitor@example.com', guestPhone: '+20 100 555 1212', adults: 2, children: 0,
    total: booking.total, currency: booking.currency, paymentMethod: 'card', hotelPickup: booking.hotelPickup,
  };
  // Extras are real booking content, so they may lengthen the email, but only by a bounded
  // amount per row, and never at the expense of the first screen.
  const PER_ADDON = 45;
  const OPTION_AND_BLOCK = 110;

  it.each([
    ['guest confirmation', () => renderBookingConfirmation(brand, booking, true, 'cid:qr.png').html,
      () => renderBookingConfirmation(brand, { ...booking, lines }, true, 'cid:qr.png').html],
    ['operator alert', () => renderAdminBookingNotification(brand, operator, `${brand.origin}/admin/bookings`).html,
      () => renderAdminBookingNotification(brand, { ...operator, lines }, `${brand.origin}/admin/bookings`).html],
  ])('%s keeps the booking facts on the first screen with four add-ons', async (_name, without, withAddons) => {
    const before = await measureEmail(without(), browser);
    const after = await measureEmail(withAddons(), browser);
    expect(after.chromeHeight).toBeLessThanOrEqual(CHROME_MAX);
    expect(after.keyFactBottom).toBeLessThanOrEqual(FIRST_SCREEN);
    expect(after.horizontalOverflow).toBe(false);
    expect(after.height - before.height).toBeLessThanOrEqual(OPTION_AND_BLOCK + PER_ADDON * addons.length);
  }, 60_000);
});

describe('the measurement itself is trustworthy', () => {
  const brand = getEmailBrand(TENANTS['Safari Sahara Hurghada']);

  it('measures the same height whether images load or are blocked', async () => {
    // An image without a reserved box makes the rendered height depend on the network — and a
    // stray width attribute once widened the document to 486px, which quietly made every
    // measurement read short because the text wrapped less.
    const html = renderBookingConfirmation(
      brand,
      {
        reference: 'SSH-10421', attractionTitle: 'Super Safari Desert Adventure',
        date: 'Tuesday, 22 September 2026', time: '08:00', guestName, total: 189.5,
        currency: 'EUR', paymentMethod: 'card', guests: 2,
        meetingPoint: { lat: 27.0611, lng: 33.8842, label: 'Hotel lobby' },
      },
      true,
      'cid:qr.png'
    ).html;

    const blocked = await measureEmail(html, browser);
    const page = await browser.newPage({ viewport: { width: MOBILE_WIDTH, height: FIRST_SCREEN } });
    try {
      const pixel =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      await page.setContent(
        html.replace(/src="https?:\/\/[^"]*"/g, `src="${pixel}"`).replace(/src="cid:[^"]*"/g, `src="${pixel}"`),
        { waitUntil: 'load' }
      );
      const loaded = (await page.evaluate('Math.round(document.documentElement.scrollHeight)')) as number;
      expect(loaded).toBe(blocked.height);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('would notice a document that scrolls sideways at 390px', async () => {
    // Negative control: without it, a detector that always returned false would look like a pass.
    const overflowing = `<!DOCTYPE html><html><body style="margin:0"><h1>x</h1><div style="width:900px;height:10px;">wide</div></body></html>`;
    expect((await measureEmail(overflowing, browser)).horizontalOverflow).toBe(true);
    const fitting = `<!DOCTYPE html><html><body style="margin:0"><h1>x</h1><div style="width:300px;height:10px;">narrow</div></body></html>`;
    expect((await measureEmail(fitting, browser)).horizontalOverflow).toBe(false);
  }, 60_000);
});
