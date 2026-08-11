import crypto from 'crypto';

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value instanceof Date ? value.toISOString() : value;
};

export const bundleFingerprint = (value: unknown): string =>
  crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');

export const bundleReference = (prefix: 'BTW' | 'BQ'): string =>
  `${prefix}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

export const bundleEventId = (): string => crypto.randomUUID();
