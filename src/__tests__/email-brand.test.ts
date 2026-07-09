import { getEmailBrand, brandedLink } from '../services/email.service';

// The rule (Fouad, 05/07): transactional email links must use each brand's OWN
// domain — but only once that domain is confirmed to serve the Attractions build,
// otherwise a link to an un-migrated (old WordPress) domain would 404. Gating is
// the per-tenant `domainMigrated` flag, with a legacy hardcoded allow-list kept
// for back-compat.
describe('getEmailBrand — brand-domain link selection', () => {
  it('uses the shared origin + ?tenant= when the domain is NOT migrated', () => {
    const brand = getEmailBrand({ name: 'Acme Tours', slug: 'acme', customDomain: 'acme.com' });
    expect(brand.name).toBe('Acme Tours');
    expect(brand.origin).not.toContain('acme.com'); // never link an un-migrated domain
    expect(brand.slug).toBe('acme'); // themes the shared-origin page to the brand
    const link = brandedLink(brand, '/accept-invitation', { token: 'tok123' });
    expect(link).toContain('tenant=acme');
    expect(link).toContain('token=tok123');
  });

  it('uses the brand custom domain when domainMigrated is true (and normalises it)', () => {
    const brand = getEmailBrand({
      name: 'Acme Tours',
      slug: 'acme',
      customDomain: 'https://Acme.com/',
      domainMigrated: true,
    });
    expect(brand.origin).toBe('https://acme.com');
    expect(brand.slug).toBeUndefined(); // no ?tenant= needed on the brand's own domain
    expect(brandedLink(brand, '/reset-password', { token: 't' })).toBe(
      'https://acme.com/reset-password?token=t',
    );
  });

  it('honours the legacy MIGRATED_DOMAINS allow-list even without the flag (back-compat)', () => {
    const brand = getEmailBrand({ name: 'Makadi', slug: 'makadi', customDomain: 'makadihorseclub.com' });
    expect(brand.origin).toBe('https://makadihorseclub.com');
  });

  it('does not brand to the custom domain when the flag is false and it is not allow-listed', () => {
    const brand = getEmailBrand({ name: 'New Client', slug: 'newclient', customDomain: 'newclient.com', domainMigrated: false });
    expect(brand.origin).not.toContain('newclient.com');
    expect(brand.slug).toBe('newclient');
  });

  it('falls back to the platform brand + shared origin with no tenant', () => {
    const brand = getEmailBrand(null);
    expect(brand.name).toBe('Foxes Network');
    expect(brand.origin).toBeTruthy();
  });
});
