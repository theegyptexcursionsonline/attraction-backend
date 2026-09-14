import {
  contrastRatio,
  emailButtons,
  emailDetails,
  emailQuote,
  inkColor,
  onColor,
  renderEmailDocument,
} from '../services/emailLayout';
import {
  getEmailBrand,
  renderAdminBookingNotificationHtml,
  renderBookingConfirmationHtml,
  renderContactFormHtml,
  renderInvitationHtml,
  renderPasswordResetHtml,
} from '../services/email.service';
import { renderBundleEmail } from '../services/bundleOutbox.service';

const gold = { name: 'Safari Sahara Hurghada', origin: 'https://safari-sahara.com', color: '#D4A843' };

describe('email design system colours', () => {
  it('never puts white text on a light brand colour', () => {
    expect(onColor('#D4A843')).toBe('#1c1917');
    expect(onColor('#0f3d5e')).toBe('#ffffff');
    const html = emailButtons(gold, { label: 'Open in admin', url: 'https://safari-sahara.com/admin' });
    expect(html).toContain('color:#1c1917');
    expect(html).not.toMatch(/background:#D4A843;[^"]*"[^>]*>\s*<a[^>]*color:#ffffff/);
  });

  it('darkens a light brand colour until it is readable as text on white', () => {
    const ink = inkColor('#D4A843');
    expect(contrastRatio(ink, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(inkColor('#0f3d5e')).toBe('#0f3d5e');
    expect(inkColor('not-a-colour')).toBe('#1c1917');
  });
});

describe('email components escape everything they are given', () => {
  const attack = '<img src=x onerror="alert(1)">';
  it('escapes labels, button text, quotes and the document heading', () => {
    const html = renderEmailDocument({
      brand: { ...gold, name: attack, logo: 'https://cdn.example/logo.png" onerror="x' },
      title: attack,
      preheader: attack,
      heading: attack,
      badge: { label: attack, tone: 'brand' },
      blocks: [
        emailDetails(gold, [{ label: attack, valueHtml: 'safe', hint: attack }]),
        emailButtons(gold, { label: attack, url: 'https://example.com/?a=1&b="2"' }),
        emailQuote(gold, attack, `line one\n${attack}`),
      ],
      footer: { note: attack, contact: { email: 'bad@@', phone: attack } },
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('onerror="alert');
    expect(html).not.toContain('" onerror="x');
    expect(html).toContain('line one<br>&lt;img');
    expect(html).toContain('href="https://example.com/?a=1&amp;b=&quot;2&quot;"');
    expect(html).not.toContain('mailto:bad@@');
  });

  it('skips empty rows and empty blocks', () => {
    expect(emailDetails(gold, [{ label: 'Phone', valueHtml: '' }])).toBe('');
    const html = renderEmailDocument({ brand: gold, title: 't', preheader: 'p', heading: 'h', blocks: ['', '  '] });
    expect(html).not.toContain('<td class="fx-pad" style="padding:0 36px 20px;"></td>');
  });
});

describe('every template uses the shared design', () => {
  const tenant = {
    name: 'Safari Sahara Hurghada', slug: 'safari-sahara-hurghada', customDomain: 'safari-sahara.com', domainMigrated: true,
    theme: { primaryColor: '#D4A843' }, logo: 'https://cdn.example/logo.png',
    contactInfo: { email: 'info@safari-sahara.com', phone: '+201113418533' },
  };
  const brand = getEmailBrand(tenant);
  const shared = (html: string) => {
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain('class="fx-card"');
    expect(html).toContain('<img src="https://cdn.example/logo.png"');
    expect(html).toContain('max-width:600px');
  };

  it('customer booking: site contact in the footer, readable total, no dark-theme leftovers', () => {
    const html = renderBookingConfirmationHtml(brand, { reference: 'SS-1', attractionTitle: 'Super Safari', date: 'Tue, 22 Sep 2026', guestName: 'Nadia Visitor', total: 90, currency: 'EUR', paymentMethod: 'card' });
    shared(html);
    expect(html).toContain('mailto:info@safari-sahara.com');
    expect(html).toContain('tel:+201113418533');
    expect(html).toContain(`color:${inkColor('#D4A843')};">EUR 90.00`);
    expect(html).not.toContain('#0b0907');
  });

  it('operator emails do not advertise the site contact details back to the site', () => {
    const html = renderAdminBookingNotificationHtml(brand, { reference: 'SS-1', tenantName: 'Safari Sahara Hurghada', attractionTitle: 'Super Safari', date: 'Tue', guestName: 'Nadia Visitor', guestEmail: 'nadia@example.com', guestPhone: '+20 100', adults: 2, children: 0, total: 90, currency: 'EUR', paymentMethod: 'card' }, 'https://safari-sahara.com/admin/bookings');
    shared(html);
    expect(html).toContain('Email Nadia');
    expect(html).not.toContain('mailto:info@safari-sahara.com');
  });

  it('contact enquiry: reply button carries the topic and reference, and links the inbox', () => {
    const html = renderContactFormHtml(tenant, { reference: 'MSG-7Q2X6C', name: 'EEO QA Visitor', email: 'qa@example.com', tourTitle: 'Super Safari', message: 'Hello' });
    shared(html);
    expect(html).toContain('Reply to EEO');
    expect(html).toContain(`mailto:qa@example.com?subject=${encodeURIComponent('Re: Super Safari (MSG-7Q2X6C)')}`);
    expect(html).toContain('https://safari-sahara.com/admin/messages');
  });

  it('password reset and invitation render through the shared design', () => {
    const reset = renderPasswordResetHtml(brand, { userName: 'Omar Admin', resetUrl: 'https://safari-sahara.com/reset-password?token=abc' });
    shared(reset);
    expect(reset).toContain('Hi Omar,');
    const invite = renderInvitationHtml(brand, { inviterName: 'Fatma <b>', role: 'manager', inviteUrl: 'javascript:alert(1)' });
    shared(invite);
    expect(invite).toContain('Fatma &lt;b&gt;');
    expect(invite).not.toContain('javascript:');
  });

  it('bundle emails render through the shared design with an escaped itinerary', () => {
    const html = renderBundleEmail(tenant, {
      badge: { label: 'Bundle confirmed', tone: 'success' },
      heading: 'Your bundle is confirmed',
      reference: 'BN-1',
      items: [{ title: 'Dolphin <b>trip</b>', meta: 'Thu · 08:00' }],
      action: { label: 'View bundle order', url: 'https://safari-sahara.com/bundle-orders/1' },
    });
    shared(html);
    expect(html).toContain('Dolphin &lt;b&gt;trip&lt;/b&gt;');
    expect(html).toContain('View bundle order');
  });
});
