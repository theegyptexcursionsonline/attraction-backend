import dotenv from 'dotenv';

dotenv.config();

// Railway does not set NODE_ENV automatically. Treat its production environment
// as production even if the variable is accidentally omitted so security checks,
// secure cookies, error redaction, and payment verification fail closed.
const nodeEnv =
  process.env.NODE_ENV ||
  (process.env.RAILWAY_ENVIRONMENT_NAME?.toLowerCase() === 'production'
    ? 'production'
    : 'development');
const isDev = nodeEnv === 'development';
const isProd = nodeEnv === 'production';

// Allow a development fallback secret, but require explicit JWT secret elsewhere.
const jwtSecret = process.env.JWT_SECRET || (isDev ? 'dev-secret-change-me' : '');
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}

const configuredEncryptionKey = process.env.ENCRYPTION_KEY?.trim() || '';
if (isProd && configuredEncryptionKey === jwtSecret) {
  throw new Error('ENCRYPTION_KEY must be distinct from JWT_SECRET in production');
}
const requireDedicatedEncryptionKey =
  process.env.REQUIRE_DEDICATED_ENCRYPTION_KEY?.toLowerCase() === 'true';
if (isProd && requireDedicatedEncryptionKey && !configuredEncryptionKey) {
  throw new Error(
    'ENCRYPTION_KEY environment variable is required when REQUIRE_DEDICATED_ENCRYPTION_KEY=true'
  );
}
// During the production migration window, an empty primary key keeps startup
// available for legacy decrypts but prevents any new secret from being encrypted
// with JWT_SECRET. Development/tests retain their convenient local fallback.
const encryptionKey = configuredEncryptionKey || (isProd ? '' : jwtSecret);

const configuredBookingAccessSecret = process.env.BOOKING_ACCESS_SECRET?.trim() || '';
if (isProd && !configuredBookingAccessSecret) {
  throw new Error('BOOKING_ACCESS_SECRET environment variable is required in production');
}
if (isProd && configuredBookingAccessSecret === jwtSecret) {
  throw new Error('BOOKING_ACCESS_SECRET must be distinct from JWT_SECRET in production');
}
const bookingAccessSecret = configuredBookingAccessSecret || jwtSecret;

export const env = {
  nodeEnv,
  port: parseInt(process.env.PORT || '5000', 10),
  
  // MongoDB
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/attractions-network',
  
  // JWT
  jwtSecret,
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '4h',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',

  // Foxes Passport: the SHARED Foxes NEXTAUTH_SECRET, used ONLY to verify inbound
  // single-sign-on assertions. Never mixed with this platform's own jwtSecret.
  foxesPassportSecret: process.env.FOXES_PASSPORT_SECRET || '',
  
  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  
  // Mailgun
  mailgunApiKey: process.env.MAILGUN_API_KEY || '',
  mailgunDomain: process.env.MAILGUN_DOMAIN || '',
  mailgunFromEmail: process.env.MAILGUN_FROM_EMAIL || 'Attractions Network <noreply@foxesnetwork.com>',
  
  // Cloudinary
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY || '',

  // foxes-content-engine publishing key (Bearer token on /api/admin/content/*)
  contentEngineApiKey: process.env.CONTENT_ENGINE_API_KEY || '',

  // A dedicated production key keeps encrypted tenant credentials independent
  // from auth-token rotation. The legacy JWT key is decrypt-only in production
  // until existing ciphertext has been re-encrypted with the primary key.
  encryptionKey,
  legacyEncryptionKey: jwtSecret,
  requireDedicatedEncryptionKey,
  hasDedicatedEncryptionKey: Boolean(configuredEncryptionKey),

  // HMAC key for guest booking-access tokens. Production keeps it separate from
  // JWT signing so either credential can rotate without invalidating the other.
  bookingAccessSecret,

  // Google Static Maps key (for the meeting-point map in booking emails). Shared
  // with the tourticket/EEO projects. When unset, the email map falls back to a
  // keyless static-map source, so this is an enhancement, not a hard dependency.
  googleMapsStaticKey:
    process.env.GOOGLE_MAPS_STATIC_KEY || process.env.GOOGLE_MAPS_API_KEY || '',

  // Frontend URL
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  // Rate Limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
  
  isDev,
  isProd,
};
