import {
  renderBookingConfirmationHtml,
  getEmailBrand,
  renderActionEmail,
  renderContactFormHtml,
  renderBookingStatusEmailHtml,
} from '../services/email.service';
import type { EmailBrand, BookingEmailDetails } from '../services/email.service';

const brand: EmailBrand = {
  name: 'Makadi Horse Club',
  origin: 'https://makadihorseclub.com',
  color: '#8B4513',
};

const base: BookingEmailDetails = {
  reference: 'ATT-TEST-1',
  attractionTitle: 'Private VIP Horse Ride',
  date: '2026-07-15',
  time: '08:00',
  guestName: 'QA Test',
  total: 199.5,
  currency: 'USD',
  guests: 2,
};

describe('renderBookingConfirmationHtml', () => {
  it('includes the brand, reference, date and a working public confirmation link', () => {
    const html = renderBookingConfirmationHtml(brand, { ...base, paymentMethod: 'pay-later' });
    expect(html).toContain('Makadi Horse Club');
    expect(html).toContain('ATT-TEST-1');
    expect(html).toContain('2026-07-15');
    expect(html).toContain('#8B4513'); // brand colour applied to the chrome
    // "View booking" points at the PUBLIC confirmation page, not the login-gated dashboard
    expect(html).toContain('https://makadihorseclub.com/checkout/confirmation?ref=ATT-TEST-1');
    expect(html).not.toContain('/dashboard/bookings');
  });

  it('forces left-to-right direction so RTL mailboxes (Arabic Outlook) do not flip the layout', () => {
    const html = renderBookingConfirmationHtml(brand, { ...base, paymentMethod: 'pay-later' });
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain('dir="ltr"'); // also on body + container
  });

  it('keeps booking detail values left-aligned instead of right-to-left looking', () => {
    const html = renderBookingConfirmationHtml(brand, { ...base, paymentMethod: 'pay-later' });
    expect(html).toContain('align="left"');
    expect(html).toContain('text-align:left;direction:ltr;unicode-bidi:isolate');
    expect(html).not.toContain('<td align="right" style="padding:12px 0;');
  });

  it('says "Pay at location" and never "paid" for a pay-later booking', () => {
    const html = renderBookingConfirmationHtml(brand, { ...base, paymentMethod: 'pay-later' });
    expect(html).toMatch(/Pay at location/i);
    expect(html).not.toMatch(/paid/i);
  });

  it('says "Total paid" for a card booking', () => {
    const html = renderBookingConfirmationHtml(brand, { ...base, paymentMethod: 'card' });
    expect(html).toMatch(/Total paid/i);
  });

  it('renders a meeting-point map + directions link when coordinates are present', () => {
    const html = renderBookingConfirmationHtml(brand, {
      ...base,
      paymentMethod: 'pay-later',
      meetingPoint: { lat: 27.0287, lng: 33.9186, label: 'Makadi Horse Club VIP Lounge' },
    });
    expect(html).toMatch(/Meeting point/i);
    expect(html).toContain('Makadi Horse Club VIP Lounge');
    expect(html).toMatch(/maps\.googleapis\.com|wsrv\.nl/); // static map image (Google, or keyless fallback)
    expect(html).toContain('google.com/maps/search'); // tappable directions link
    expect(html).toMatch(/Get directions/i);
    // coordinates appear in the maps link
    expect(html).toContain('27.0287,33.9186');
  });

  it('omits the map block entirely when there are no coordinates', () => {
    const html = renderBookingConfirmationHtml(brand, { ...base, paymentMethod: 'pay-later' });
    expect(html).not.toMatch(/Meeting point/i);
    expect(html).not.toContain('wsrv.nl');
  });

  it('shows the tenant logo (absolute URL) in the header when the tenant has one', () => {
    // makadihorseclub.com is in the migrated-domain allow-list, so links + the
    // logo resolve against the custom domain.
    const b = getEmailBrand({
      name: 'Makadi Horse Club', slug: 'makadi-horse-club',
      customDomain: 'makadihorseclub.com', logo: '/logos/makadi-horse-club.png',
      theme: { primaryColor: '#B8860B' },
    });
    expect(b.logo).toBe('https://makadihorseclub.com/logos/makadi-horse-club.png');
    const html = renderBookingConfirmationHtml(b, { ...base, paymentMethod: 'pay-later' });
    expect(html).toContain('<img src="https://makadihorseclub.com/logos/makadi-horse-club.png"');
    expect(html).toContain('alt="Makadi Horse Club"'); // brand name is the alt fallback
  });

  it('falls back to the brand name as text when the tenant has no logo', () => {
    const b = getEmailBrand({ name: 'No Logo Co', slug: 'no-logo', theme: { primaryColor: '#333333' } });
    expect(b.logo).toBeUndefined();
    const html = renderBookingConfirmationHtml(b, { ...base, paymentMethod: 'pay-later' });
    expect(html).not.toContain('<img src="https://');
    expect(html).toContain('No Logo Co');
  });

  it('escapes guest, attraction, hotel, and meeting-point markup', () => {
    const attack = '<img src=x onerror="alert(1)">';
    const html = renderBookingConfirmationHtml(brand, {
      ...base,
      guestName: attack,
      attractionTitle: attack,
      hotelPickup: { hotelName: attack, roomNumber: attack },
      meetingPoint: { lat: 27.0287, lng: 33.9186, label: attack },
    });

    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain('&lt;img');
  });
});

import { renderAdminBookingNotificationHtml } from '../services/email.service';
import type { AdminBookingDetails } from '../services/email.service';

const adminBase: AdminBookingDetails = {
  reference: 'ATT-TEST-1',
  tenantName: 'Makadi Horse Club',
  attractionTitle: 'Private VIP Horse Ride',
  date: '2026-07-15',
  time: '08:00',
  guestName: 'QA Test',
  guestEmail: 'guest@example.com',
  guestPhone: '+201000000000',
  adults: 2,
  children: 0,
  total: 199.5,
  currency: 'USD',
  paymentMethod: 'pay-later',
};

describe('renderActionEmail (password-reset / invitation branding — A9)', () => {
  const branded = getEmailBrand({
    name: 'Makadi Horse Club', slug: 'makadi-horse-club',
    customDomain: 'makadihorseclub.com', logo: '/logos/makadi-horse-club.png',
    theme: { primaryColor: '#B8860B' },
  });

  it('renders the tenant logo + brand colour, not the old generic purple chrome', () => {
    const html = renderActionEmail(branded, {
      title: 'Password reset', heading: 'Reset your password',
      intro: 'Click below to choose a new password.', ctaLabel: 'Reset password',
      ctaUrl: 'https://makadihorseclub.com/reset-password?token=abc',
    });
    expect(html).toContain('<img src="https://makadihorseclub.com/logos/makadi-horse-club.png"');
    expect(html).toContain('#B8860B'); // brand colour on the header + button
    expect(html).not.toContain('#7c3aed'); // the old hardcoded purple is gone
    expect(html).not.toContain('#c026d3'); // the old magenta gradient is gone
    expect(html).toContain('https://makadihorseclub.com/reset-password?token=abc');
    expect(html).toContain('Reset password');
  });

  it('does not leak the generic "Foxes Network" brand when a tenant is present', () => {
    const html = renderActionEmail(branded, {
      title: 'Invitation', heading: "You're invited", intro: 'Join us.',
      ctaLabel: 'Accept invitation', ctaUrl: 'https://makadihorseclub.com/accept-invitation?token=x',
    });
    expect(html).not.toContain('Foxes Network');
    expect(html).toContain('Makadi Horse Club'); // footer / alt uses the tenant brand
  });

  it('keeps only narrow inline markup and rejects non-http action URLs', () => {
    const html = renderActionEmail(branded, {
      title: '<img src=x onerror=alert(1)>',
      heading: '<script>alert(1)</script>',
      intro: '<strong>Allowed</strong><img src=x onerror=alert(1)><script>alert(2)</script>',
      ctaLabel: 'Continue',
      ctaUrl: 'javascript:alert(1)',
    });

    expect(html).toContain('<strong>Allowed</strong>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('onerror="alert');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });
});

describe('renderAdminBookingNotificationHtml', () => {
  it('includes tenant, guest, experience, contact and the admin link', () => {
    const html = renderAdminBookingNotificationHtml(brand, adminBase, 'https://makadihorseclub.com/admin/bookings');
    expect(html).toContain('Makadi Horse Club');
    expect(html).toContain('QA Test');
    expect(html).toContain('Private VIP Horse Ride');
    expect(html).toContain('ATT-TEST-1');
    expect(html).toContain('mailto:guest@example.com');
    expect(html).toContain('https://makadihorseclub.com/admin/bookings');
    expect(html).toContain('#8B4513'); // brand colour
  });

  it('never prints "undefined" when the experience title is missing', () => {
    const html = renderAdminBookingNotificationHtml(brand, { ...adminBase, attractionTitle: '' }, 'https://x/admin/bookings');
    expect(html).not.toContain('undefined');
    expect(html).toContain('Experience'); // fallback label used
  });

  it('keeps operator booking detail values left-aligned instead of right-to-left looking', () => {
    const html = renderAdminBookingNotificationHtml(brand, adminBase, 'https://makadihorseclub.com/admin/bookings');
    expect(html).toContain('align="left"');
    expect(html).toContain('text-align:left;direction:ltr;unicode-bidi:isolate');
    expect(html).not.toContain('<td align="right" style="padding:12px 0;');
  });

  it('renders the meeting-point map for the operator when coordinates are present', () => {
    const html = renderAdminBookingNotificationHtml(
      brand,
      { ...adminBase, meetingPoint: { lat: 27.0287, lng: 33.9186, label: 'Makadi Horse Club VIP Lounge' } },
      'https://makadihorseclub.com/admin/bookings',
    );
    expect(html).toMatch(/Meeting point/i);
    expect(html).toMatch(/maps\.googleapis\.com|wsrv\.nl/);
    expect(html).toContain("google.com/maps/search");
    expect(html).toContain('27.0287,33.9186');
  });

  it('escapes operator-notification guest fields', () => {
    const attack = '<svg onload=alert(1)>';
    const html = renderAdminBookingNotificationHtml(
      brand,
      {
        ...adminBase,
        guestName: attack,
        guestEmail: 'guest@example.com\" onmouseover=\"alert(1)',
        guestPhone: attack,
      },
      'https://makadihorseclub.com/admin/bookings'
    );

    expect(html).not.toContain('<svg');
    expect(html).not.toContain('onload="alert');
    expect(html).not.toContain('href="mailto:guest@example.com&quot;');
    expect(html).toContain('&lt;svg');
  });
});

describe('renderContactFormHtml', () => {
  it('tenant-brands and escapes every visitor-controlled field', () => {
    const attack = '<img src=x onerror="alert(1)">';
    const html = renderContactFormHtml(
      {
        name: 'Makadi Horse Club',
        slug: 'makadi-horse-club',
        theme: { primaryColor: '#B8860B' },
        contactInfo: { email: 'info@makadihorseclub.com' },
      },
      attack,
      'visitor@example.com',
      attack,
      `Line one\n${attack}`
    );

    expect(html).toContain('Makadi Horse Club Contact Form');
    expect(html).toContain('#B8860B');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain('&lt;img');
    expect(html).toContain('Line one<br>');
  });
});

describe('renderBookingStatusEmailHtml', () => {
  it.each([
    ['cancelled', 'Your booking is cancelled'],
    ['refunded', 'Your refund is complete'],
  ] as const)('tenant-brands and escapes the %s email', (kind, heading) => {
    const html = renderBookingStatusEmailHtml(brand, {
      reference: '<script>alert(1)</script>',
      guestName: '<img src=x onerror="alert(1)">',
      kind,
      guestAccessToken: 'guest-token',
      refundAmount: 75,
      currency: 'usd',
      fullRefund: true,
    });

    expect(html).toContain(heading);
    expect(html).toContain('#8B4513');
    expect(html).toContain('accessToken=guest-token');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });
});
