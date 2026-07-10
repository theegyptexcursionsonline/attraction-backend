import mongoose, { Schema } from 'mongoose';
import { ITenant } from '../types';

const tenantSchema = new Schema<ITenant>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    domain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    customDomain: {
      type: String,
      lowercase: true,
      sparse: true,
      index: true,
    },
    // Flip to true (per tenant) once the custom domain serves the Attractions build,
    // so transactional email links use the brand domain instead of the shared origin.
    domainMigrated: {
      type: Boolean,
      default: false,
    },
    logo: {
      type: String,
      required: true,
    },
    logoDark: {
      type: String,
    },
    favicon: {
      type: String,
    },
    heroImages: [{
      type: String,
    }],
    tagline: {
      type: String,
    },
    description: {
      type: String,
    },
    theme: {
      primaryColor: {
        type: String,
        default: '#0066FF',
      },
      secondaryColor: {
        type: String,
        default: '#00D4AA',
      },
      accentColor: {
        type: String,
        default: '#FF6B35',
      },
    },
    fonts: {
      heading: {
        type: String,
        default: 'Inter',
      },
      body: {
        type: String,
        default: 'Inter',
      },
    },
    designMode: {
      type: String,
      enum: ['default', 'luxury', 'minimal', 'nautical', 'equestrian', 'marine', 'desert', 'safari', 'travel', 'stable', 'sunmarine', 'rittal', 'speedboat', 'ancient', 'pyramid', 'skyride', 'temple', 'ranch', 'reef', 'obelisk', 'dune', 'savanna', 'expedition', 'dolphin', 'safarisahara', 'quadtour', 'desertfox', 'pharaonic', 'luxorballoon', 'nilenight', 'seascope', 'pirates', 'nefertari', 'elitevip', 'classic', 'majestic', 'bazaar', 'abyss', 'island', 'angler', 'lagoon', 'sandbar', 'evening', 'atlas', 'premium', 'caravan', 'pod', 'overland', 'azure', 'concierge', 'mirage'],
      default: 'default',
    },
    defaultCurrency: {
      type: String,
      required: true,
      default: 'USD',
    },
    defaultLanguage: {
      type: String,
      required: true,
      default: 'en',
    },
    supportedLanguages: [{
      type: String,
    }],
    timezone: {
      type: String,
      default: 'UTC',
    },
    contactInfo: {
      email: String,
      phone: String,
      whatsapp: String,
      address: String,
      supportHours: String,
    },
    socialLinks: {
      facebook: String,
      instagram: String,
      twitter: String,
      linkedin: String,
      youtube: String,
      tiktok: String,
    },
    pricingSettings: {
      // When true, tours on this tenant can expose a lower "resident" price
      // and the booking widget will ask the visitor to pick Foreigner vs Resident.
      enableResidentPricing: { type: Boolean, default: false },
    },
    aiSettings: {
      bookingWidget: {
        enabled: { type: Boolean, default: true },
        position: { type: String, default: 'bottom-right' },
        primaryColor: String,
        welcomeMessage: String,
        languages: [{ type: String }],
        autoOpen: { type: Boolean, default: false },
      },
      voiceAgent: {
        enabled: { type: Boolean, default: false },
        languages: [{ type: String }],
        buttonPosition: { type: String, default: 'bottom-right' },
      },
      searchWidget: {
        enabled: { type: Boolean, default: true },
        placeholder: String,
        showPopularSearches: { type: Boolean, default: true },
        maxSuggestions: { type: Number, default: 6 },
      },
    },
    navigation: [{
      label: { type: String, required: true },
      href: { type: String, required: true },
    }],
    seoSettings: {
      metaTitle: String,
      metaDescription: String,
      keywords: [{ type: String }],
      ogImage: String,
    },
    paymentSettings: {
      stripeAccountId: String,
      enabledGateways: [{ type: String }],
      // True when this supplier collects online payments through their OWN gateway
      // (not the platform's). Drives settlement authority: own-gateway suppliers
      // hold their own funds and may self-settle card bookings too.
      ownPaymentGateway: { type: Boolean, default: false },
      // Per-tenant Stripe gateway — each site's admin enters their OWN keys. The
      // publishable key is public (the checkout needs it); the secret + webhook
      // signing secret are stored ENCRYPTED and never returned to clients
      // (select:false + AES-GCM via secretCrypto).
      stripe: {
        enabled: { type: Boolean, default: false },
        publishableKey: { type: String, default: '' },
        secretKeyEnc: { type: String, default: '', select: false },
        webhookSecretEnc: { type: String, default: '', select: false },
        configuredAt: Date,
      },
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending', 'suspended', 'coming_soon'],
      default: 'pending',
      index: true,
    },
    // Per-tenant access code that gates preview-environment access (foxes-network.netlify.app etc).
    // Real custom domains bypass this. select:false ensures the code is never loaded into normal
    // queries — endpoints that need it must explicitly .select('+previewAccessCode').
    previewAccessCode: {
      type: String,
      select: false,
      sparse: true,
      index: true,
    },
    previewAccessCodeUpdatedAt: {
      type: Date,
      select: false,
    },

    // SEO migration tenants (e.g. Safari Sahara — preserving existing /hurghada-quad-biking
    // ranks rather than nesting under /attractions/) get flat root-level URLs. The frontend
    // root catch-all uses this flag to decide whether `/<slug>` resolves to an attraction.
    flatUrls: {
      type: Boolean,
      default: false,
    },

    // Free-form static pages defined per tenant (about, contact, terms, privacy,
    // become-a-partner, etc.). Lets a tenant ship its own copy without us hard-coding
    // page templates. Slug must be unique within the tenant.
    customPages: [
      {
        slug: { type: String, required: true, lowercase: true, trim: true },
        title: { type: String, required: true },
        metaTitle: { type: String },
        metaDescription: { type: String },
        body: { type: String, required: true }, // HTML or Markdown
        sortOrder: { type: Number, default: 0 },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        const obj = ret as Record<string, unknown>;
        delete obj.__v;
        // Never leak the access code in regular API responses
        delete obj.previewAccessCode;
        return obj;
      },
    },
  }
);

// Index for domain lookups
tenantSchema.index({ domain: 1, status: 1 });
tenantSchema.index({ customDomain: 1, status: 1 });

export const Tenant = mongoose.model<ITenant>('Tenant', tenantSchema);
