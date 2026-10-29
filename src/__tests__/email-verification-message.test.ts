import { brandedLink, getEmailBrand, renderEmailVerification } from '../services/email.service';

describe('the email that confirms a new account', () => {
  it('links to the site\'s own verify-email page and says no account opens without it', () => {
    const brand = getEmailBrand(null);
    const verifyUrl = brandedLink(brand, '/verify-email', { token: 'abc123' });
    expect(verifyUrl).toMatch(/\/verify-email\?token=abc123/);
    const { html, text } = renderEmailVerification(brand, { userName: 'Anna Smith', verifyUrl });
    expect(html).toContain(verifyUrl.replace(/&/g, '&amp;'));
    expect(text).toContain('Confirm your email address');
    expect(text).toMatch(/No account is opened without this confirmation/);
  });
});
