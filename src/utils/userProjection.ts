const SENSITIVE_USER_FIELDS = [
  'password',
  'refreshToken',
  'passwordResetToken',
  'passwordResetExpires',
  'tokenVersion',
  '__v',
] as const;

export const PUBLIC_USER_PROJECTION = SENSITIVE_USER_FIELDS
  .map((field) => `-${field}`)
  .join(' ');

/**
 * Mongoose's toJSON transform does not run for lean queries, so public user
 * responses need an explicit final redaction step as well as a query projection.
 */
export const redactUserSecrets = <T extends Record<string, unknown>>(user: T): T => {
  const safeUser = { ...user };
  for (const field of SENSITIVE_USER_FIELDS) {
    delete safeUser[field];
  }
  return safeUser;
};
