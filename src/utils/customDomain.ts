import { isIP } from 'net';
import { domainToASCII } from 'url';

const RESERVED_SUFFIXES = [
  'foxesdemoplatform.com',
  'foxesnetwork.com',
  'netlify.app',
];

export class CustomDomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomDomainValidationError';
  }
}

/**
 * Accepts one registrable hostname, stores the apex form, and rejects values
 * that could target the shared platform or an internal host.
 */
export const normalizeCustomDomain = (input: string): string => {
  const raw = input.trim().toLowerCase().replace(/\.$/, '');

  if (!raw || raw.includes('://') || /[/?#@\s]/.test(raw) || raw.includes(':')) {
    throw new CustomDomainValidationError('Enter a domain only, for example example.com');
  }

  const withoutWww = raw.replace(/^www\./, '');
  const ascii = domainToASCII(withoutWww);
  if (!ascii || ascii.length > 253 || isIP(ascii) !== 0 || ascii === 'localhost') {
    throw new CustomDomainValidationError('Enter a valid public domain');
  }

  const labels = ascii.split('.');
  const validLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (labels.length < 2 || labels.some((label) => !validLabel.test(label))) {
    throw new CustomDomainValidationError('Enter a valid public domain');
  }

  if (
    RESERVED_SUFFIXES.some(
      (suffix) => ascii === suffix || ascii.endsWith(`.${suffix}`)
    )
  ) {
    throw new CustomDomainValidationError('Shared platform domains cannot be assigned to a tenant');
  }

  return ascii;
};

export const aliasesForCustomDomain = (domain: string): [string, string] => [
  domain,
  `www.${domain}`,
];
