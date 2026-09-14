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

  it('reports a recorded no-recipient failure (not a throw) when the tenant has no operator email', async () => {
    const enquiry = {
      reference: 'MSG-7K2M9Q',
      name: 'Guest User',
      email: 'guest@example.com',
      subject: 'Question',
      message: 'Please contact me.',
    };
    for (const contactInfo of [undefined, { email: '' }, { email: 'not-an-address' }]) {
      await expect(
        sendContactFormEmail({ name: 'Unconfigured Tenant', slug: 'unconfigured', contactInfo }, enquiry)
      ).resolves.toEqual({ status: 'failed', reason: 'no_recipient' });
    }
  });

  it('reports a skipped delivery when the mail provider is not configured', async () => {
    // The suite forces MAILGUN_API_KEY/MAILGUN_DOMAIN empty, so this proves the
    // unconfigured path without any possibility of a real send.
    await expect(
      sendContactFormEmail(tenant, {
        reference: 'MSG-7K2M9Q',
        name: 'Guest User',
        email: 'guest@example.com',
        message: 'Please contact me.',
      })
    ).resolves.toEqual({ status: 'skipped', reason: 'provider_not_configured' });
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
