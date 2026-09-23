import { pagePresentationSchema } from '../utils/siteContent';
import { urlNamespacePlugin } from '../plugins/urlNamespace';
import mongoose, { Schema } from 'mongoose';
import { ITenant } from '../types';
import { notificationCopyEmails } from '../utils/notificationRecipients';
import { GOOGLE_ANALYTICS_ID, GOOGLE_TAG_MANAGER_ID, trackingSettingsSchema, trackingVerificationSchema, TrackingSettings } from '../utils/trackingSettings';
import { AI_SEARCH_WIDGET_ID_PATTERN, VOICE_WIDGET_ID_PATTERN } from '../utils/aiSettings';
export { AI_SEARCH_WIDGET_ID_PATTERN, VOICE_WIDGET_ID_PATTERN } from '../utils/aiSettings';

const plainTrackingValue = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(plainTrackingValue)
    : value && typeof value === 'object' && 'toObject' in value && typeof value.toObject === 'function'
    ? value.toObject() : value;

const trackingSchema = new Schema<TrackingSettings>({
  googleTagManagerId: { type: String, required: false, default: '', validate: (value: string) => value === '' || GOOGLE_TAG_MANAGER_ID.test(value) },
  googleAnalyticsId: { type: String, required: false, default: '', validate: (value: string) => value === '' || GOOGLE_ANALYTICS_ID.test(value) },
  verificationCodes: {
    type: [new Schema({
      provider: { type: String, required: true, enum: ['google', 'bing', 'facebook', 'pinterest'] },
      code: { type: String, required: true, maxlength: 256, validate: (value: string) => trackingVerificationSchema.shape.code.safeParse(value).success },
    }, { _id: false, strict: 'throw' })],
    default: [],
    castNonArrays: false,
    validate: (value: unknown) => trackingSettingsSchema.shape.verificationCodes.safeParse(plainTrackingValue(value)).success,
  },
}, { _id: false, strict: 'throw' });

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
    customDomainStatus: {
      type: String,
      enum: ['unconfigured', 'pending_dns', 'ready', 'error'],
      default: 'unconfigured',
    },
    customDomainAliasesAddedAt: Date,
    customDomainLastCheckedAt: Date,
    customDomainLastError: String,
    customDomainLastChangedBy: { type: Schema.Types.ObjectId, ref: 'User' },
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
      enum: ['default', 'luxury', 'minimal', 'nautical', 'equestrian', 'marine', 'desert', 'safari', 'travel', 'stable', 'sunmarine', 'rittal', 'speedboat', 'ancient', 'pyramid', 'skyride', 'temple', 'ranch', 'reef', 'obelisk', 'dune', 'savanna', 'expedition', 'dolphin', 'safarisahara', 'quadtour', 'desertfox', 'pharaonic', 'luxorballoon', 'nilenight', 'seascope', 'pirates', 'nefertari', 'elitevip', 'classic', 'majestic', 'bazaar', 'abyss', 'island', 'angler', 'lagoon', 'sandbar', 'evening', 'atlas', 'premium', 'caravan', 'pod', 'overland', 'azure', 'concierge', 'mirage', 'meridian', 'depth'],
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
    // Private to admins (never in the public tenant contract): where booking alerts go
    // when the reservations inbox differs from the public support email.
    notificationSettings: {
      bookingEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
      bookingCcEmails: { type: [String], default: undefined, validate: { validator: (emails: string[]) => { try { notificationCopyEmails(emails); return true; } catch { return false; } }, message: 'Invalid booking copy recipients' } },
      contactCcEmails: { type: [String], default: undefined, validate: { validator: (emails: string[]) => { try { notificationCopyEmails(emails); return true; } catch { return false; } }, message: 'Invalid contact copy recipients' } },
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
      // AI Search and Voice: `enabled` and `widgetId` are set only by a super admin through
      // PATCH /tenants/:id/ai-products (see utils/aiSettings), which also stamps updatedBy/At
      // and bumps aiProductsRevision. The storefront loads a product only with both set.
      voiceAgent: {
        enabled: { type: Boolean, default: false },
        // Foxes Voice WidgetConfig id (an ObjectId), never a voice tenant credential.
        widgetId: { type: String, trim: true, lowercase: true, match: [VOICE_WIDGET_ID_PATTERN, 'Voice widget ID must be a 24-character widget id'] },
        languages: [{ type: String }],
        buttonPosition: { type: String, default: 'bottom-right' },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        updatedAt: Date,
      },
      searchWidget: {
        // Off unless switched on. Records from before this default stored nothing here and
        // are read as on-when-an-id-exists until migrate-enabled-default makes it explicit.
        enabled: { type: Boolean, default: false },
        widgetId: {
          type: String,
          trim: true,
          match: [AI_SEARCH_WIDGET_ID_PATTERN, 'AI Search widget ID must look like wgt_…'],
        },
        placeholder: String,
        showPopularSearches: { type: Boolean, default: true },
        maxSuggestions: { type: Number, default: 6 },
        // Browsing pages only unless the site admin chooses every catalogue page.
        displayPages: { type: String, enum: ['browse', 'all'], default: 'browse' },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        updatedAt: Date,
      },
    },
    // Optimistic lock for AI product switches and ids; see PATCH /tenants/:id/ai-products.
    aiProductsRevision: { type: Number, default: 0, min: 0 },
    // Areas served by hotel pickup rather than departures; see utils/pickupDestinations.
    pickupDestinationSlugs: {
      type: [{ type: String, lowercase: true, trim: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ }],
      default: undefined,
      validate: { validator: (value?: string[]) => !value || value.length <= 12, message: 'A site can list at most 12 pickup destinations' },
    },
    navigationRevision: { type: Number, default: 0 },
    navigation: [{
      label: { type: String, required: true },
      href: { type: String, required: true },
      columns: [{ label: { type: String, required: true }, links: [{ label: { type: String, required: true }, href: { type: String, required: true } }] }],
    }],
    seoSettings: {
      metaTitle: String,
      metaDescription: String,
      keywords: [{ type: String }],
      ogImage: String,
    },
    // Explicit identifiers/tokens only. Changes are made by the revision-checked route.
    trackingSettings: {
      type: trackingSchema,
      default: undefined,
      set: (value: unknown) => value === undefined ? undefined : trackingSettingsSchema.parse(value),
      validate: (value: unknown) => value === undefined || trackingSettingsSchema.safeParse(plainTrackingValue(value)).success,
    },
    trackingSettingsRevision: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    paymentSettings: {
      stripeAccountId: String,
      enabledGateways: [{ type: String }],
      // Existing tenants retain offline checkout unless explicitly disabled.
      allowPayAtLocation: { type: Boolean, default: true },
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
        previousWebhookSecretEnc: { type: String, default: '', select: false },
        previousWebhookValidUntil: Date,
        configuredAt: Date,
        verifiedAccountId: String,
        verifiedCredentialFingerprint: String,
        credentialsVerifiedAt: Date,
        webhookVerifiedAt: Date,
        webhookContextFingerprint: String,
        configRevision: { type: Number, default: 0, min: 0 },
        // Monotonic compare-and-set fence shared by gateway mutations and
        // Bundle payment-session claims. It closes the cross-collection race
        // where an admin changed accounts after checkout read the old keys but
        // before the provider PaymentIntent was durably bound to its order.
        bindingFenceRevision: { type: Number, default: 0, min: 0 },
      },
    },
    // Bundle launches are tenant-specific. Existing tenants remain in safe
    // discovery-only mode until a guarded admin readiness check promotes the
    // storefront to TEST acceptance or LIVE sales.
    bundleSettings: {
      mode: {
        type: String,
        enum: ['off', 'discovery', 'test', 'live'],
        default: 'discovery',
      },
      updatedAt: Date,
      updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      reason: { type: String, trim: true, maxlength: 500 },
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
        layoutMode: { type: String, enum: ['website', 'standalone'], default: 'website' },
        heroImage: { type: String, maxlength: 2048, validate: (value: string) => pagePresentationSchema.shape.heroImage.safeParse(value).success },
        heroDescription: { type: String, maxlength: 1000 },
        heroImageAlt: { type: String, validate: (value: string) => pagePresentationSchema.shape.heroImageAlt.safeParse(value).success },
        ogImage: { type: String, validate: (value: string) => pagePresentationSchema.shape.ogImage.safeParse(value).success },
        updatedAt: { type: Date },
        body: { type: String, default: '' },
        revision: { type: Number, default: 0 },
        sections: { type: [{
          _id: false,
          id: { type: String, required: true },
          type: { type: String, enum: ['content', 'tours', 'pages'], required: true },
          title: String, body: String,
          layout: { type: String, enum: ['vertical', 'horizontal'] },
          attractionIds: { type: [String], default: undefined },
          categoryIds: { type: [String], default: undefined },
          pageIds: { type: [String], default: undefined },
        }], default: undefined },
        pageType: { type: String, enum: ['attraction', 'category'], default: 'attraction' },
        parentPath: { type: String, default: '/' },
        categoryIds: [{ type: String }],
        // Existing pages predate this field and remain public. Explicit false
        // gives editors a safe draft state without changing live content.
        isPublished: { type: Boolean, default: true },
        status: { type: String, enum: ['active', 'archived'], default: 'active' },
        archivedAt: { type: Date },
        trashedAt: { type: Date },
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

// Mongoose query updates can cast strings/numbers before nested setters run,
// and $push validates only the new item rather than bounded/unique array rules.
// Require a complete validated snapshot for every model-level tracking write.
tenantSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
  const update = this.getUpdate();
  if (!update || Array.isArray(update)) return;
  for (const [operator, raw] of Object.entries(update)) {
    const fields = operator.startsWith('$') && raw && typeof raw === 'object'
      ? raw as Record<string, unknown> : { [operator]: raw };
    for (const [field, value] of Object.entries(fields)) {
      if (field === 'trackingSettings') {
        if (operator.startsWith('$') && !['$set', '$setOnInsert'].includes(operator)) throw new Error('Replace the full tracking settings snapshot');
        fields[field] = trackingSettingsSchema.parse(value);
      } else if (field.startsWith('trackingSettings.')) {
        throw new Error('Replace the full tracking settings snapshot');
      }
    }
  }
});

// Index for domain lookups
tenantSchema.index({ domain: 1, status: 1 });
tenantSchema.index({ customDomain: 1, status: 1 });

tenantSchema.plugin(urlNamespacePlugin, { kind: 'page' });

export const Tenant = mongoose.model<ITenant>('Tenant', tenantSchema);
