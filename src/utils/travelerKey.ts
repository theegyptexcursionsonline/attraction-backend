import { decryptSecret, encryptSecret } from './secretCrypto';

/**
 * An opaque key for one traveller, so the admin can open a traveller's details without putting
 * their email address in a URL, where it would land in request logs and browser history.
 *
 * The key is the email encrypted with the platform key (AES-GCM, random IV) and tagged with its
 * purpose, so no other encrypted value can be passed in its place. It only names the traveller:
 * who may see them is still decided by the brand scope of the request that uses it.
 */
const PURPOSE = 'traveler-detail:';
const KEY_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const toUrlSafe = (part: string): string => part.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromUrlSafe = (part: string): string => {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  return base64 + '='.repeat((4 - (base64.length % 4)) % 4);
};

/** The key for a traveller's email, or undefined when no encryption key is configured. */
export const travelerDetailKey = (email: string): string | undefined => {
  try {
    return encryptSecret(`${PURPOSE}${email}`).split(':').map(toUrlSafe).join('.');
  } catch {
    return undefined;
  }
};

/** The email a key stands for, or null for anything that is not a key this server issued. */
export const emailFromTravelerKey = (key: unknown): string | null => {
  if (typeof key !== 'string' || key.length > 600 || !KEY_PATTERN.test(key)) return null;
  const plain = decryptSecret(key.split('.').map(fromUrlSafe).join(':'));
  return plain.startsWith(PURPOSE) ? plain.slice(PURPOSE.length) : null;
};
