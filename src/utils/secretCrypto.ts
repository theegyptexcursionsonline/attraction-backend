import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Symmetric encryption for tenant-held secrets stored at rest (Stripe secret key,
 * webhook signing secret). AES-256-GCM with a per-value random IV; the auth tag
 * detects tampering. Output format: base64(iv):base64(tag):base64(ciphertext).
 *
 * The 32-byte key is derived from env.encryptionKey via SHA-256, so any length
 * secret works. Never log or return the decrypted values to clients.
 */
const KEY = crypto.createHash('sha256').update(env.encryptionKey || 'dev-fallback-key').digest();

export const encryptSecret = (plain: string): string => {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
};

export const decryptSecret = (payload?: string | null): string => {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts.length !== 3) return '';
  try {
    const [ivB, tagB, dataB] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
};

/** Last-4 hint for a secret so admin UIs can show "•••• abcd" without revealing it. */
export const secretHint = (plain?: string | null): string =>
  plain && plain.length >= 4 ? plain.slice(-4) : '';
