import dns from 'dns';
import net from 'net';

export type DnsLookup = typeof dns.promises.lookup;

export interface ValidatedWebhookDestination {
  url: URL;
  address: string;
  family: 4 | 6;
}

const normalizeIp = (address: string): string => {
  const unwrapped = address.replace(/^\[|\]$/g, '').toLowerCase();
  const mapped = unwrapped.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? mapped[1] : unwrapped;
};

const isPublicIpv4 = (address: string): boolean => {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
};

const isPublicIpv6 = (address: string): boolean => {
  const value = address.toLowerCase();
  if (value === '::' || value === '::1') return false;
  if (value.startsWith('::ffff:')) return false;
  if (value.startsWith('fc') || value.startsWith('fd')) return false;
  if (/^fe[89ab]/.test(value)) return false;
  if (/^fe[c-f]/.test(value)) return false;
  if (value.startsWith('ff')) return false;
  if (value.startsWith('2001:db8:') || value === '2001:db8::') return false;
  return true;
};

export const isPublicIp = (address: string): boolean => {
  const normalized = normalizeIp(address);
  const family = net.isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family === 6) return isPublicIpv6(normalized);
  return false;
};

export const validateWebhookDestination = async (
  value: string,
  lookup: DnsLookup = dns.promises.lookup
): Promise<ValidatedWebhookDestination> => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('A valid public http(s) url is required');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('A valid public http(s) url is required');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Webhook destination is not allowed');
  }

  const literalFamily = net.isIP(normalizeIp(hostname));
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = literalFamily
      ? [{ address: normalizeIp(hostname), family: literalFamily }]
      : await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Webhook destination could not be resolved');
  }

  if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error('Webhook destination is not allowed');
  }

  return {
    url,
    address: normalizeIp(addresses[0].address),
    family: addresses[0].family as 4 | 6,
  };
};
