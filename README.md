# Attractions Network — Backend API

Express + TypeScript REST API for the Attractions Network multi-tenant tours & attractions marketplace. Serves auth, catalog, booking, payment, review, tenant, and notification endpoints on top of MongoDB.

## Tech stack

- **Runtime:** Node.js 18+ / Express 4 + TypeScript
- **Database:** MongoDB via Mongoose 8
- **Auth:** JWT (`jsonwebtoken`) + bcrypt, access/refresh tokens, cookie-parser
- **Payments:** Stripe
- **Email:** Mailgun (`mailgun.js`) / Nodemailer
- **Uploads:** Cloudinary + Multer
- **Docs:** Swagger (`swagger-jsdoc` + `swagger-ui-express`)
- **Tickets/QR:** PDFKit + qrcode
- **Security:** Helmet, CORS, express-rate-limit, express-mongo-sanitize
- **Testing:** Jest + Supertest

## Features

- Tenant-aware catalog APIs: attractions, destinations, categories, special offers
- Booking & payment flows with promo codes, reviews, resident-vs-foreigner pricing, and optional hotel-pickup capture
- Event RSVP support and async guest/admin booking emails
- Per-tenant preview-site access codes (public unlock + admin reveal/regenerate)
- Public tenant config exposing branding, pricing settings, flat URLs and custom pages
- Tenant-admin tooling including a portfolio-stats aggregation endpoint
- Media upload, tenant-scoped page resolution / sitemap endpoints, and seed/rollout scripts
- Fail-closed Content Engine blog receiver with exact tenant/locale isolation and transactional UUID replay

## Getting started

### Prerequisites

- Node.js 18+
- A MongoDB instance

### Install

```bash
npm install
```

### Environment

Copy `.env.example` to `.env` and fill in values:

- **Server:** `NODE_ENV`, `PORT`
- **Database:** `MONGODB_URI`
- **Auth:** `JWT_SECRET`, `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY`
- **Email:** `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM_EMAIL`
- **Uploads:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- **CORS:** `FRONTEND_URL` (comma-separated for multiple origins)
- **Content receiver:** `CONTENT_ENGINE_API_KEY`, `CONTENT_ENGINE_ALLOWED_TENANTS`
- **Rate limiting:** `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`

### Run

```bash
npm run dev    # ts-node-dev with respawn
npm run build  # tsc → dist/
npm start      # node dist/app.js
npm run lint   # tsc --noEmit
npm test       # Jest (runInBand)
npm run seed   # seed base data
```

## Project structure

```
src/
├── app.ts          # Express app + middleware + route registration
├── config/         # CORS, env, and runtime config
├── routes/         # attraction, auth, booking, category, destination,
│                   #   notification, payment, preview, promo, review,
│                   #   rsvp, special-offer, stats, tenant, upload, user
├── controllers/    # request handlers
├── models/         # Attraction, Booking, Destination, EventRsvp, Review,
│                   #   SpecialOffer, Tenant, User, ...
├── services/       # email, media, and operational helpers
└── scripts/        # seeding + tenant maintenance
```

## Deployment

Deploys to Railway via `railway.json` (Nixpacks, `npm run build` → `npm start`, health check at `/api/health`).
