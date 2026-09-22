import { z } from 'zod';

export const GOOGLE_TAG_MANAGER_ID = /^GTM-[A-Z0-9]{4,20}$/;
export const GOOGLE_ANALYTICS_ID = /^G-[A-Z0-9]{4,20}$/;
// Verification meta content only, never complete HTML, scripts, URLs or headers.
export const VERIFICATION_CODE = /^[A-Za-z0-9_-]+={0,2}$/;
const optionalId = (pattern: RegExp) => z.string().trim().refine(value => value === '' || pattern.test(value), 'Enter a valid tracking ID');
export const trackingVerificationSchema = z.object({
  provider: z.enum(['google', 'bing', 'facebook', 'pinterest']),
  code: z.string().trim().min(1).max(256).regex(VERIFICATION_CODE, 'Enter the verification token only'),
}).strict();

export const trackingSettingsSchema = z.object({
  googleTagManagerId: optionalId(GOOGLE_TAG_MANAGER_ID),
  googleAnalyticsId: optionalId(GOOGLE_ANALYTICS_ID),
  verificationCodes: z.array(trackingVerificationSchema).max(8).refine(
    codes => new Set(codes.map(item => `${item.provider}:${item.code}`)).size === codes.length,
    'Duplicate verification codes are not allowed'
  ),
}).strict();

export type TrackingSettings = z.infer<typeof trackingSettingsSchema>;
export const trackingSettingsUpdateSchema = trackingSettingsSchema.extend({
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
}).strict();

/** Also validates raw/legacy database values before exposing them to a storefront. */
export const publicTrackingSettings = (value: unknown): TrackingSettings => {
  const parsed = trackingSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : { googleTagManagerId: '', googleAnalyticsId: '', verificationCodes: [] };
};

export const trackingRevisionOf = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;

/** Generic writers must never bypass the dedicated revision-checked route. */
export const hasTrackingSettingsFields = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) =>
    ['trackingSettings', 'trackingSettingsRevision'].some(field => key === field || key.startsWith(`${field}.`))
    || (key.startsWith('$') && hasTrackingSettingsFields(child))
  );
};
