import { CorsOptions } from 'cors';
import { env } from './env';

// Support comma-separated FRONTEND_URL for multiple origins
// e.g. FRONTEND_URL=https://myapp.vercel.app,https://custom-domain.com
const allowedOrigins = [
  ...env.frontendUrl.split(',').map((u) => u.trim()).filter(Boolean),
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3050',
  'http://127.0.0.1:3050',
];

// Patterns for owned preview subdomains and custom tenant domains.
const allowedPatterns = [
  /^foxes-network\.netlify\.app$/,
  /^[a-z0-9-]+--foxes-network\.netlify\.app$/,
  /\.foxesnetwork\.com$/,
  // Foxes demo portal — public-facing demo domain on the same shared origin
  // as foxes-network.netlify.app, gated by per-tenant access codes
  /^foxesdemoplatform\.com$/,
  /^www\.foxesdemoplatform\.com$/,
  // Custom tenant domains (Fouad's client brands)
  /^makadihorseclub\.com$/,
  /^cairotourfromhurghada\.com$/,
  /^cairotourspackages\.com$/,
  /^parasailinghurghada\.com$/,
  /^luxortourfromhurghada\.com$/,
  /^horseridinghurghada\.com$/,
  /^hurghadasnorkeling\.com$/,
  /^pyramidsexcursions\.com$/,
  /^hurghadaprivatesafari\.com$/,
  /^makadibaysafari\.com$/,
  /^safariredsea\.com$/,
  /^rittaltravelegypt\.com$/,
  /^splashspeedboathurghada\.com$/,
  /^egyptsunmarine\.com$/,
  /^luxorairballoon\.com$/,
  /^www\.luxorairballoon\.com$/,
  /^caironightcruise\.com$/,
  /^www\.caironightcruise\.com$/,
  /^royalseascope\.com$/,
  /^www\.royalseascope\.com$/,
  /^piratespremiersailing\.com$/,
  /^www\.piratespremiersailing\.com$/,
  /^nefertaricruise\.com$/,
  /^www\.nefertaricruise\.com$/,
  /^elitevipcruise\.com$/,
  /^www\.elitevipcruise\.com$/,
  /^rosettaclassic\.com$/,
  /^www\.rosettaclassic\.com$/,
  /^majestictravel\.com$/,
  /^www\.majestictravel\.com$/,
  /^hurghadapremiumexcursions\.com$/,
  /^www\.hurghadapremiumexcursions\.com$/,
  // German EEO network
  /^aegyptenausfluege\.de$/,
  /^kairoausfluege\.de$/,
  /^hurghadaausfluege\.de$/,
  /^makadibayausfluege\.de$/,
  /^sharmausfluege\.de$/,
  /^elgounaausfluege\.de$/,
  /^luxorausfluege\.de$/,
];

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check exact match
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Check pattern match (subdomains)
    try {
      const hostname = new URL(origin).hostname;
      if (allowedPatterns.some((pattern) => pattern.test(hostname))) {
        return callback(null, true);
      }
    } catch {
      // Invalid URL, reject
    }

    const error = new Error('Not allowed by CORS');
    error.name = 'CorsError';
    callback(error);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Tenant-ID',
    'X-Tenant-Slug',
    'X-Booking-Access-Token',
    'X-API-Key',
    'Idempotency-Key',
  ],
  exposedHeaders: ['X-Total-Count', 'X-Total-Pages'],
  maxAge: 86400, // 24 hours
};
