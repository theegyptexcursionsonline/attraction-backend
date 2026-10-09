/**
 * Account emails: every link opens a real page (no "//path", which the storefront router reads as
 * another host and answers with its error page), and the access email says what changed.
 */
import { brandedLink, getEmailBrand, invitationLink, renderAccessChanged } from '../services/email.service';

const sharedBrand = getEmailBrand({ name: 'Red Sea Trips', slug: 'red-sea-trips' });

describe('links in account and booking emails', () => {
  it.each(['/accept-invitation', '/reset-password', '/login', '/checkout/confirmation', '/checkout/pay', '/admin/bookings'])(
    'opens %s on the shared origin with a single slash',
    (route) => {
      const link = brandedLink(sharedBrand, route, { token: 'tok123' });
      const url = new URL(link);
      expect(url.pathname).toBe(route);
      expect(url.searchParams.get('tenant')).toBe('red-sea-trips');
      expect(link).not.toMatch(/[^:]\/\//);
    }
  );

  it('keeps the shared origin bare so every caller can append a path', () => {
    expect(sharedBrand.origin).not.toMatch(/\/$/);
  });

  it('builds the invitation link the Team screen copies with a single slash', () => {
    const url = new URL(invitationLink('abc', { name: 'Red Sea Trips', slug: 'red-sea-trips' }));
    expect(url.pathname).toBe('/accept-invitation');
    expect(url.searchParams.get('token')).toBe('abc');
  });

  it('still uses a migrated custom domain as it is', () => {
    const brand = getEmailBrand({ name: 'Acme', slug: 'acme', customDomain: 'acme.example', domainMigrated: true });
    expect(brandedLink(brand, '/login')).toBe('https://acme.example/login');
  });
});

describe('the access email', () => {
  const base = { userName: 'Omar Administrator', role: 'manager', status: 'active', siteNames: ['Red Sea Trips'], changedBy: 'Fatma Manager' };

  it('lists the sections the person can now use', () => {
    const { html, text } = renderAccessChanged(sharedBrand, { ...base, sectionNames: ['Tours', 'Packages'], signedOut: false });
    expect(text).toContain('Sections: Tours, Packages');
    expect(html).toContain('Tours, Packages');
  });

  it('says every section when the person has all of them, and no sections when none', () => {
    expect(renderAccessChanged(sharedBrand, { ...base, sectionNames: null, signedOut: false }).text).toContain('Sections: All sections');
    expect(renderAccessChanged(sharedBrand, { ...base, sectionNames: [], signedOut: false }).text).toContain('Sections: No sections');
  });

  it('claims a sign-out only when sessions were actually ended', () => {
    expect(renderAccessChanged(sharedBrand, { ...base, signedOut: false }).text).not.toMatch(/signed out/i);
    expect(renderAccessChanged(sharedBrand, { ...base, signedOut: true }).text).toContain('You have been signed out and will need to sign in again.');
  });

  it('keeps its earlier wording for callers that pass neither field', () => {
    const { text } = renderAccessChanged(sharedBrand, base);
    expect(text).toContain('You have been signed out');
    expect(text).not.toContain('Sections:');
  });

  it('escapes section names', () => {
    const { html } = renderAccessChanged(sharedBrand, { ...base, sectionNames: ['<img src=x onerror="alert(1)">'], signedOut: false });
    expect(html).not.toContain('<img src=x');
  });
});
