import {
  CustomDomainValidationError,
  aliasesForCustomDomain,
  normalizeCustomDomain,
} from '../utils/customDomain';

describe('custom-domain normalization', () => {
  it('normalizes case, www, trailing dots, and international domains', () => {
    expect(normalizeCustomDomain(' WWW.Example.COM. ')).toBe('example.com');
    expect(normalizeCustomDomain('münchen.de')).toBe('xn--mnchen-3ya.de');
    expect(aliasesForCustomDomain('example.com')).toEqual(['example.com', 'www.example.com']);
  });

  it.each([
    'https://example.com',
    'example.com/path',
    'example.com:443',
    '127.0.0.1',
    'localhost',
    '-bad.example',
    'foxesdemoplatform.com',
    'tenant.foxesnetwork.com',
    'foxes-network.netlify.app',
  ])('rejects unsafe or non-hostname input: %s', (input) => {
    expect(() => normalizeCustomDomain(input)).toThrow(CustomDomainValidationError);
  });
});
