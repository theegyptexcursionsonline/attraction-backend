import {
  getEmailBrand,
  resolveEmailEnvelope,
  sendContactFormEmail,
} from '../services/email.service';

const tenant = {
  name: 'Tenant A Adventures',
  slug: 'tenant-a',
  contactInfo: { email: 'help@tenant-a.example' },
  theme: { primaryColor: '#123456' },
};

describe('tenant-scoped email delivery', () => {
  it('uses the tenant identity and reply-to without changing the verified sender mailbox', () => {
    const envelope = resolveEmailEnvelope(tenant, 'guest@example.com');

    expect(envelope.from).toMatch(/^Tenant A Adventures <[^<>\s]+@[^<>\s]+>$/);
    expect(envelope.to).toEqual(['guest@example.com']);
    expect(envelope.replyTo).toBe('help@tenant-a.example');
    expect(JSON.stringify(envelope)).not.toContain('tenant-b');
  });

  it('allows a contact-form sender to become reply-to, never the transport sender', () => {
    const envelope = resolveEmailEnvelope(tenant, 'help@tenant-a.example', 'visitor@example.net');

    expect(envelope.from).not.toContain('visitor@example.net');
    expect(envelope.replyTo).toBe('visitor@example.net');
  });

  it('rejects contact delivery when the selected tenant has no operator email', async () => {
    await expect(
      sendContactFormEmail(
        { name: 'Unconfigured Tenant', slug: 'unconfigured' },
        'Guest User',
        'guest@example.com',
        'Question',
        'Please contact me.'
      )
    ).rejects.toThrow('Tenant contact email is not configured');
  });

  it('does not trust a custom-domain value containing a path or user-info', () => {
    const brand = getEmailBrand({
      name: 'Tenant A Adventures',
      slug: 'tenant-a',
      customDomain: 'tenant-a.example@attacker.example/path',
      domainMigrated: true,
    });

    expect(brand.origin).not.toContain('attacker.example');
    expect(brand.slug).toBe('tenant-a');
  });

  it('does not allow logo markup to escape the image source attribute', () => {
    const brand = getEmailBrand({
      name: 'Tenant A Adventures',
      slug: 'tenant-a',
      logo: 'https://cdn.example/logo.png\" onerror=\"alert(1)',
    });

    expect(brand.logo).not.toContain('" onerror=');
  });
});
