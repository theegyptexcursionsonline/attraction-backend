import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Symmetric encryption for tenant-held secrets stored at rest (Stripe secret key,
 * webhook signing secret). AES-256-GCM with a per-value random IV; the auth tag
 * detects tampering. Output format: base64(iv):base64(tag):base64(ciphertext).
 *
 * The 32-byte key is derived from env.encryptionKey via SHA-256, so any length
 * secret works. During key migration, decrypt also tries the legacy JWT-derived
 * key. Encryption never uses that legacy fallback in production.
 */
const deriveKey = (secret: string): Buffer =>
  crypto.createHash('sha256').update(secret).digest();

const PRIMARY_KEY = env.encryptionKey ? deriveKey(env.encryptionKey) : null;
const LEGACY_KEY = env.legacyEncryptionKey && env.legacyEncryptionKey !== env.encryptionKey
  ? deriveKey(env.legacyEncryptionKey)
  : null;

export type SecretKeySource = 'primary' | 'legacy' | null;

export interface DecryptedSecret {
  value: string;
  source: SecretKeySource;
}

const decryptWithKey = (payload: string, key: Buffer): string => {
  const [ivB, tagB, dataB] = payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

export const encryptSecret = (plain: string): string => {
  if (!plain) return '';
  if (!PRIMARY_KEY) {
    throw new Error('ENCRYPTION_KEY is required before storing new encrypted secrets');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', PRIMARY_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
};

export const decryptSecretWithSource = (payload?: string | null): DecryptedSecret => {
  if (!payload) return { value: '', source: null };
  const parts = payload.split(':');
  if (parts.length !== 3) return { value: '', source: null };

  const candidates: Array<{ source: Exclude<SecretKeySource, null>; key: Buffer }> = [];
  if (PRIMARY_KEY) candidates.push({ source: 'primary', key: PRIMARY_KEY });
  if (LEGACY_KEY) candidates.push({ source: 'legacy', key: LEGACY_KEY });

  for (const candidate of candidates) {
    try {
      return { value: decryptWithKey(payload, candidate.key), source: candidate.source };
    } catch {
      // Try the next configured key. GCM authentication rejects a wrong key.
    }
  }

  return { value: '', source: null };
};

export const decryptSecret = (payload?: string | null): string =>
  decryptSecretWithSource(payload).value;

/** Re-encrypt a legacy value with the primary key; safe to run repeatedly. */
export const reencryptLegacySecret = (payload: string): string => {
  const decrypted = decryptSecretWithSource(payload);
  if (!decrypted.value || !decrypted.source) {
    throw new Error('Encrypted secret could not be decrypted');
  }
  return decrypted.source === 'primary' ? payload : encryptSecret(decrypted.value);
};

/** Last-4 hint for a secret so admin UIs can show "•••• abcd" without revealing it. */
export const secretHint = (plain?: string | null): string =>
  plain && plain.length >= 4 ? plain.slice(-4) : '';
