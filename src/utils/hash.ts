import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

export const generateRandomToken = (length = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

export const generateBookingReference = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const part1 = Array.from({ length: 5 }, () => 
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
  const part2 = Array.from({ length: 4 }, () => 
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
  return `ATT-${part1}-${part2}`;
};

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Programmatic API key: `fxs_att_<43 base64url chars>` (~256 bits of entropy).
// The `fxs_att_` prefix scopes it to this platform (Attractions) and makes
// leaked keys greppable. Returned to the caller exactly once; only its sha256
// hash is stored.
export const API_KEY_PREFIX = 'fxs_att_';
export const generateApiKey = (): string => {
  return `${API_KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
};

// Non-secret display fragment for an API key, e.g. "fxs_att_a1b2c3…".
export const apiKeyPreview = (key: string): string => {
  return `${key.slice(0, API_KEY_PREFIX.length + 6)}…`;
};

// Per-endpoint webhook signing secret: `whsec_<64 hex>`.
export const generateWebhookSecret = (): string => {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
};

// 8-char alphanumeric access code grouped as XXXX-XXXX. Skips visually
// ambiguous characters (0/O/1/I/L) so clients can read & type it from
// a phone screen without errors. ~32 bits of entropy — enough to make
// guessing impractical when paired with rate limiting.
const PREVIEW_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const generatePreviewAccessCode = (): string => {
  const pick = () =>
    PREVIEW_CODE_ALPHABET.charAt(
      Math.floor((crypto.randomBytes(1)[0] / 256) * PREVIEW_CODE_ALPHABET.length)
    );
  const part = () => Array.from({ length: 4 }, pick).join('');
  return `${part()}-${part()}`;
};
