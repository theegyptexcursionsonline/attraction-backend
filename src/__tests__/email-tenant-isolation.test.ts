import {
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
  resolveEmailEnvelope,
} from '../services/email.service';

/**
 * Brand A's email must never contain one atom of brand B's identity.
 *
 * The structural guarantee is that `getEmailBrand` reads NOTHING but its `tenant` argument — no
 * request state, no module-level default. These tests hold that line by rendering every template
 * for two tenants whose every branded field differs, and asserting each output is free of the
 * other's name, slug, domain, logo, colour, inbox, phone and postal address.
 */

const ALPHA = {
  _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  name: 'Safari Sahara Hurghada',
  slug: 'safari-sahara-hurghada',
  customDomain: 'safari-sahara.com',
  domainMigrated: true,
  theme: { primaryColor: '#D4A843' },
  logo: 'https://cdn.example/alpha-logo.png',
  contactInfo: { email: 'info@safari-sahara.com', phone: '+20 111 341 8533', address: '12 Village Road, Hurghada' },
  defaultLanguage: 'en',
  defaultCurrency: 'EUR',
  timezone: 'Africa/Cairo',
};

const BETA = {
  _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  name: 'Makadi Horse Club',
  slug: 'makadi-horse-club',
  customDomain: 'makadihorseclub.com',
  domainMigrated: true,
  theme: { primaryColor: '#0F3D5E' },
  logo: 'https://cdn.example/beta-logo.png',
  contactInfo: { email: 'reservations@makadihorseclub.com', phone: '+20 100 222 3344', address: '5 Beach Road, Makadi Bay' },
  defaultLanguage: 'en',
  defaultCurrency: 'USD',
  timezone: 'Africa/Cairo',
};

/** Every string that identifies a tenant and must not cross into the other's mail. */
const identityOf = (tenant: typeof ALPHA): string[] => [
  tenant.name,
  tenant.slug,
  tenant.customDomain,
  tenant.logo,
  tenant.theme.primaryColor,
  tenant.theme.primaryColor.toLowerCase(),
  tenant.contactInfo.email,
  tenant.contactInfo.phone,
  tenant.contactInfo.address,
];

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
  message: 'Do you offer hotel pickup?',
};

const renderAllFor = (tenant: typeof ALPHA): Array<[string, { html: string; text: string }]> => {
  const brand = getEmailBrand(tenant);
  return [
    ['booking-confirmation', renderBookingConfirmation(brand, { ...booking, paymentMethod: 'card' }, true, 'cid:qr.png')],
    ['booking-payment-link', renderBookingPaymentLink(brand, { reference: booking.reference, guestName: booking.guestName, guestAccessToken: 'tok', total: 1, currency: 'EUR' })],
    ['payment-failed', renderPaymentFailed(brand, { reference: booking.reference, guestName: booking.guestName, total: 1, currency: 'EUR' })],
    ['admin-booking-notification', renderAdminBookingNotification(brand, {
      reference: booking.reference, tenantName: tenant.name, attractionTitle: booking.attractionTitle,
      date: booking.date, guestName: booking.guestName, guestEmail: 'nadia.visitor@example.com',
      guestPhone: '+20 100 555 1212', adults: 2, children: 0, total: 1, currency: 'EUR', paymentMethod: 'card',
    }, `${brand.origin}/admin/bookings`)],
    ['booking-cancelled', renderBookingStatusEmail(brand, { reference: booking.reference, guestName: booking.guestName, kind: 'cancelled' })],
    ['refund-issued', renderBookingStatusEmail(brand, { reference: booking.reference, guestName: booking.guestName, kind: 'refunded', refundAmount: 1, currency: 'EUR' })],
    ['departure-reminder', renderDepartureReminder(brand, booking)],
    ['trip-thank-you', renderTripThankYou(brand, { reference: booking.reference, guestName: booking.guestName, attractionTitle: booking.attractionTitle })],
    ['welcome', renderWelcome(brand, { userName: 'Omar Administrator', accountEmail: 'omar.admin@example.com' })],
    ['password-reset', renderPasswordReset(brand, { userName: 'Omar Administrator', resetUrl: `${brand.origin}/reset-password?token=t` })],
    ['password-changed', renderPasswordChanged(brand, { userName: 'Omar Administrator', changedAt: '18 Sep 2026, 14:20' })],
    ['team-invitation', renderInvitation(brand, { inviterName: 'Fatma Manager', role: 'manager', inviteUrl: `${brand.origin}/accept-invitation?token=t` })],
    ['access-changed', renderAccessChanged(brand, { userName: 'Omar Administrator', role: 'manager', status: 'active', siteNames: [tenant.name], changedBy: 'Fatma Manager' })],
    ['enquiry-received', renderEnquiryReceived(brand, enquiry)],
    ['operator-enquiry', renderContactForm(tenant, enquiry)],
  ];
};

describe('tenant isolation: one brand never renders another brand', () => {
  const alphaEmails = renderAllFor(ALPHA);
  const betaEmails = renderAllFor(BETA);

  it.each(alphaEmails.map(([name, parts]) => [name, parts] as const))(
    '%s rendered for Safari Sahara contains no trace of Makadi Horse Club',
    (_name, parts) => {
      for (const marker of identityOf(BETA)) {
        expect(parts.html).not.toContain(marker);
        expect(parts.text).not.toContain(marker);
      }
      expect(parts.html).toContain(ALPHA.name);
    }
  );

  it.each(betaEmails.map(([name, parts]) => [name, parts] as const))(
    '%s rendered for Makadi Horse Club contains no trace of Safari Sahara',
    (_name, parts) => {
      for (const marker of identityOf(ALPHA)) {
        expect(parts.html).not.toContain(marker);
        expect(parts.text).not.toContain(marker);
      }
      expect(parts.html).toContain(BETA.name);
    }
  );

  it('renders the same template differently for the two brands, so the check is meaningful', () => {
    for (let index = 0; index < alphaEmails.length; index += 1) {
      const [name, alpha] = alphaEmails[index];
      const [, beta] = betaEmails[index];
      expect(alpha.html).not.toBe(beta.html);
      expect(alpha.html).toContain('safari-sahara.com');
      expect(beta.html).toContain('makadihorseclub.com');
      expect(name).toBeTruthy();
    }
  });

  it('every link in a brand email stays on that brand host', () => {
    for (const [, parts] of alphaEmails) {
      for (const href of [...parts.html.matchAll(/href="(https:\/\/[^"]+)"/g)].map((m) => m[1])) {
        const host = new URL(href).hostname;
        expect(host).not.toContain('makadihorseclub.com');
        // Own domain, or a third-party utility the template legitimately uses (maps).
        expect(
          host === 'safari-sahara.com' || host.endsWith('google.com') || host.endsWith('wsrv.nl')
        ).toBe(true);
      }
    }
  });

  it('resolves the envelope from the passed tenant only, never a neighbour', () => {
    const envelope = resolveEmailEnvelope(ALPHA, 'guest@example.com');
    expect(envelope.from).toContain(ALPHA.name);
    expect(envelope.replyTo).toBe(ALPHA.contactInfo.email);
    const serialised = JSON.stringify(envelope);
    for (const marker of identityOf(BETA)) expect(serialised).not.toContain(marker);
  });

  it('falls back to the platform brand for a null tenant rather than borrowing a real one', () => {
    const platform = getEmailBrand(null);
    expect(platform.name).toBe('Foxes Network');
    for (const marker of [...identityOf(ALPHA), ...identityOf(BETA)]) {
      expect(JSON.stringify(platform)).not.toContain(marker);
    }
  });

  it('never links an un-migrated custom domain, which would 404 on the client old site', () => {
    const unmigrated = getEmailBrand({ ...ALPHA, domainMigrated: false, customDomain: 'not-yet-migrated.example' });
    expect(unmigrated.origin).not.toContain('not-yet-migrated.example');
    expect(unmigrated.slug).toBe(ALPHA.slug);
  });

  it('keeps the operator alert free of the site inbox it is being sent to', () => {
    const [, operatorAlert] = renderAllFor(ALPHA).find(([name]) => name === 'admin-booking-notification')!;
    // The site does not need its own support address read back to it in an internal alert.
    expect(operatorAlert.html).not.toContain(`mailto:${ALPHA.contactInfo.email}`);
    expect(operatorAlert.html).toContain('nadia.visitor@example.com');
  });
});
