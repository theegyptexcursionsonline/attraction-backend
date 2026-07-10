import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isDev = nodeEnv === 'development';
const isProd = nodeEnv === 'production';

// Allow a development fallback secret, but require explicit JWT secret elsewhere.
const jwtSecret = process.env.JWT_SECRET || (isDev ? 'dev-secret-change-me' : '');
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}

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

  // Key used to encrypt per-tenant secrets at rest (e.g. each tenant's Stripe
  // secret + webhook signing secret). Falls back to the JWT secret so a dedicated
  // key is optional; set ENCRYPTION_KEY in prod to rotate independently.
  encryptionKey: process.env.ENCRYPTION_KEY || jwtSecret,

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
