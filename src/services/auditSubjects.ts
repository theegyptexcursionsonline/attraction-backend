import mongoose, { Types } from 'mongoose';

/**
 * User log detail: which record an admin request changed, its name, the brands it belongs to and
 * what changed, read from the database before and after the request.
 *
 * Privacy is an allow-list. Each record type names the only fields the log may read; nothing else
 * is ever loaded. A field marked `value` may keep its before and after values (short text, numbers,
 * yes/no, dates, short lists); a field marked `name` is compared in memory and only its name is
 * kept. Passwords, tokens, 2FA, guest and customer contact details, payment data, preview codes and
 * webhook secrets are on no list, so they are never read, compared or stored.
 */

export const AUDIT_SUBJECTS = [
  'tour', 'attraction', 'package', 'booking', 'team-member', 'customer-account', 'site', 'page',
  'promo-code', 'special-offer', 'review', 'category', 'destination', 'bundle', 'bundle-order',
  'supplier-offer', 'journal-post', 'tour-translation', 'destination-translation', 'api-key',
  'webhook', 'message', 'rsvp', 'image', 'user-log',
] as const;
export type AuditSubject = (typeof AUDIT_SUBJECTS)[number];

export const AUDIT_VERBS = [
  'create', 'update', 'delete', 'delete-permanently', 'archive', 'unarchive', 'restore', 'trash',
  'duplicate', 'publish', 'status', 'block-dates', 'unblock-date', 'resell-start', 'resell-stop',
  'reseller-settings', 'stop-sale', 'departures', 'cancel', 'refund', 'payment-link', 'settlement',
  'settle', 'invite', 'invitation-link', 'reset-password', 'revoke-sessions', 'settings', 'sections',
  'domain-add', 'domain-check', 'domain-remove', 'tracking', 'ai-products', 'seo', 'payment-settings',
  'preview-code', 'menu', 'reply', 'upload', 'generate', 'fulfil', 'release-settlement', 'mark-settled',
  'resolve-dispute', 'recover', 'retry', 'readiness', 'resolve-notification', 'revoke', 'test', 'export',
] as const;
export type AuditVerb = (typeof AUDIT_VERBS)[number];

export type AuditValue = string | number | boolean | null | Array<string | number | boolean>;
export interface AuditChange { field: string; before?: AuditValue; after?: AuditValue }

type FieldMode = 'value' | 'name';
type Doc = Record<string, unknown>;

export interface RecordSnapshot {
  subject: AuditSubject;
  label?: string;
  /** The brands the record belongs to, its owner first. */
  brands: string[];
  /** Allow-listed fields only. */
  values: Record<string, unknown>;
  /** Fields this snapshot may report (a customer account reports fewer than a team member). */
  fields: Record<string, FieldMode>;
}

interface SubjectSpec {
  model: string;
  subject: AuditSubject | ((doc: Doc) => AuditSubject);
  fields: Record<string, FieldMode>;
  /** Fields needed for the name and the brands; read, never reported. */
  identity: string[];
  label?: (doc: Doc) => string | undefined;
  brands: (doc: Doc) => unknown[];
  /** Narrows the reported fields for a particular record (customers). */
  fieldsFor?: (doc: Doc) => Record<string, FieldMode>;
  /** A second, equally narrow read for records named after their parent (offers, reviews). */
  enrich?: (doc: Doc) => Promise<{ label?: string; brands?: unknown[] }>;
  /** Records no brand owns (categories, destinations). Any other record is named only when its brand is known. */
  global?: true;
  /** Records that are not looked up by `_id` alone. */
  find?: (id: string, params: Record<string, string>) => Promise<Doc | null>;
}

const MAX_TEXT = 160;
const MAX_LIST = 20;
export const MAX_CHANGES = 40;
export const MAX_CHANGED_FIELDS = 60;
const SNAPSHOT_TIMEOUT_MS = 1500;
const TEAM_ROLES = new Set(['super-admin', 'brand-admin', 'manager', 'editor', 'viewer']);

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_TEXT) : undefined;

const idString = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const raw = typeof value === 'object' && value !== null && '_id' in value ? (value as { _id: unknown })._id : value;
  const rendered = String(raw);
  return /^[a-f0-9]{24}$/i.test(rendered) ? rendered.toLowerCase() : undefined;
};

const uniqueIds = (values: unknown[]): string[] =>
  Array.from(new Set(values.flatMap((value) => (Array.isArray(value) ? value : [value])).map(idString).filter((id): id is string => Boolean(id))));

const get = (doc: Doc | null | undefined, path: string): unknown =>
  path.split('.').reduce<unknown>((current, key) => (current && typeof current === 'object' ? (current as Doc)[key] : undefined), doc);

const modelOf = (name: string): mongoose.Model<Doc> | undefined =>
  (mongoose.models[name] as mongoose.Model<Doc> | undefined);

/** A tour's own brands and title, read through the same narrow projection. */
const tourIdentity = async (attractionId: unknown): Promise<{ label?: string; brands?: unknown[] }> => {
  const Attraction = modelOf('Attraction');
  const id = idString(attractionId);
  if (!Attraction || !id) return {};
  const tour = await Attraction.findById(id).select('title ownerTenantId tenantIds').lean<Doc>();
  return tour ? { label: text(tour.title), brands: [tour.ownerTenantId, tour.tenantIds] } : {};
};

const LISTING_FIELDS: Record<string, FieldMode> = {
  title: 'value', slug: 'value', pathSlug: 'value', status: 'value', listingType: 'value',
  category: 'value', subcategory: 'value', 'destination.city': 'value', 'destination.country': 'value',
  duration: 'value', priceFrom: 'value', currency: 'value', enquiryOnly: 'value', featured: 'value',
  sortOrder: 'value', instantConfirmation: 'value', mobileTicket: 'value', hasHotelPickup: 'value',
  validityDuration: 'value', languages: 'value', 'reseller.enabled': 'value', trashedAt: 'value',
  shortDescription: 'name', description: 'name', images: 'name', imageAltTexts: 'name', pricingOptions: 'name',
  addons: 'name', entryWindows: 'name', itinerary: 'name', highlights: 'name', inclusions: 'name',
  exclusions: 'name', whatToBring: 'name', needToKnow: 'name', accessibility: 'name', gettingThere: 'name',
  participantRequirements: 'name', meetingPoint: 'name', cancellationPolicy: 'name', availability: 'name',
  seo: 'name', venueInfo: 'name', packageDetails: 'name', parentPage: 'name', badges: 'name',
  tenantIds: 'name', 'reseller.value': 'name', 'reseller.allowedTenants': 'name',
};

const TEAM_MEMBER_FIELDS: Record<string, FieldMode> = {
  firstName: 'value', lastName: 'value', role: 'value', status: 'value', sectionAccess: 'value',
  interfaceLocale: 'value', email: 'name', assignedTenants: 'name',
};
const CUSTOMER_FIELDS: Record<string, FieldMode> = { role: 'value', status: 'value' };

const SITE_FIELDS: Record<string, FieldMode> = {
  name: 'value', slug: 'value', status: 'value', domain: 'value', customDomain: 'value',
  customDomainStatus: 'value', defaultCurrency: 'value', defaultLanguage: 'value', supportedLanguages: 'value',
  timezone: 'value', designMode: 'value', flatUrls: 'value', enabledSections: 'value', tagline: 'value',
  'theme.primaryColor': 'value', 'theme.secondaryColor': 'value', 'theme.accentColor': 'value',
  'fonts.heading': 'value', 'fonts.body': 'value',
  logo: 'name', logoDark: 'name', favicon: 'name', heroImages: 'name', description: 'name',
  contactInfo: 'name', notificationSettings: 'name', socialLinks: 'name', pricingSettings: 'name',
  aiSettings: 'name', navigation: 'name', seoSettings: 'name', trackingSettings: 'name', pageSeo: 'name',
  externalRatings: 'name', bundleSettings: 'name', pickupDestinationSlugs: 'name',
};

const PAGE_FIELDS: Record<string, FieldMode> = {
  title: 'value', slug: 'value', isPublished: 'value', status: 'value', pageType: 'value',
  layoutMode: 'value', parentPath: 'value', sortOrder: 'value', metaTitle: 'value', trashedAt: 'value',
  body: 'name', sections: 'name', heroImage: 'name', heroDescription: 'name', heroImageAlt: 'name',
  metaDescription: 'name', ogImage: 'name', categoryIds: 'name', archivedAt: 'name',
};

const SPECS = {
  listing: {
    model: 'Attraction',
    subject: (doc: Doc) => (doc.listingType === 'package' ? 'package' : doc.listingType === 'attraction' ? 'attraction' : 'tour'),
    fields: LISTING_FIELDS,
    identity: ['title', 'listingType', 'ownerTenantId', 'tenantIds'],
    label: (doc: Doc) => text(doc.title),
    brands: (doc: Doc) => [doc.ownerTenantId, doc.tenantIds],
  },
  booking: {
    model: 'Booking',
    subject: 'booking',
    // Booked items carry the guest's pickup hotel and room, so they are not on the list.
    fields: { status: 'value', settlementStatus: 'name', settledAt: 'name' },
    identity: ['reference', 'tenantId', 'sellerTenantId', 'supplierTenantId'],
    label: (doc: Doc) => text(doc.reference),
    brands: (doc: Doc) => [doc.tenantId, doc.sellerTenantId, doc.supplierTenantId],
  },
  user: {
    model: 'User',
    subject: (doc: Doc) => (TEAM_ROLES.has(String(doc.role)) ? 'team-member' : 'customer-account'),
    fields: TEAM_MEMBER_FIELDS,
    identity: ['firstName', 'lastName', 'role', 'assignedTenants'],
    // A customer's name is guest contact data: their account is never named in the log.
    label: (doc: Doc) => (TEAM_ROLES.has(String(doc.role))
      ? text(`${typeof doc.firstName === 'string' ? doc.firstName : ''} ${typeof doc.lastName === 'string' ? doc.lastName : ''}`)
      : undefined),
    brands: (doc: Doc) => [doc.assignedTenants],
    fieldsFor: (doc: Doc) => (TEAM_ROLES.has(String(doc.role)) ? TEAM_MEMBER_FIELDS : CUSTOMER_FIELDS),
  },
  site: {
    model: 'Tenant',
    subject: 'site',
    fields: SITE_FIELDS,
    identity: ['name'],
    label: (doc: Doc) => text(doc.name),
    brands: (doc: Doc) => [doc._id],
  },
  page: {
    model: 'Tenant',
    subject: 'page',
    fields: PAGE_FIELDS,
    identity: [],
    label: (doc: Doc) => text(doc.title),
    brands: (doc: Doc) => [doc.tenantId],
    find: async (id: string) => {
      const Tenant = modelOf('Tenant');
      if (!Tenant || !/^[a-f0-9]{24}$/i.test(id)) return null;
      const pageId = new Types.ObjectId(id);
      // Only this page, and only its listed fields, leave the database.
      const [row] = await Tenant.aggregate<{ _id: unknown; page?: Doc }>([
        { $match: { 'customPages._id': pageId } },
        { $limit: 1 },
        { $project: { page: { $arrayElemAt: [{ $filter: { input: '$customPages', cond: { $eq: ['$$this._id', pageId] } } }, 0] } } },
        { $project: Object.fromEntries(Object.keys(PAGE_FIELDS).map((field) => [`page.${field}`, 1])) },
      ]);
      return row?.page ? { ...row.page, tenantId: row._id } : null;
    },
  },
  promo: {
    model: 'PromoCode',
    subject: 'promo-code',
    fields: {
      code: 'value', discountType: 'value', discountValue: 'value', currency: 'value', minOrderAmount: 'value',
      maxDiscount: 'value', usageLimit: 'value', validFrom: 'value', validUntil: 'value', isActive: 'value', description: 'name',
    },
    identity: ['code', 'tenantId'],
    label: (doc: Doc) => text(doc.code),
    brands: (doc: Doc) => [doc.tenantId],
  },
  offer: {
    model: 'SpecialOffer',
    subject: 'special-offer',
    fields: {
      title: 'value', discountType: 'value', discountValue: 'value', currency: 'value', validFrom: 'value',
      validUntil: 'value', usageLimit: 'value', isActive: 'value', description: 'name',
    },
    identity: ['title', 'attractionId'],
    label: (doc: Doc) => text(doc.title),
    brands: () => [],
    enrich: async (doc: Doc) => ({ brands: (await tourIdentity(doc.attractionId)).brands }),
  },
  review: {
    model: 'Review',
    subject: 'review',
    // The author, their words, photos and country are the guest's own; only the moderation is logged.
    fields: { status: 'value', rating: 'value', verified: 'value', adminReply: 'name' },
    identity: ['attractionId'],
    brands: () => [],
    enrich: (doc: Doc) => tourIdentity(doc.attractionId),
  },
  category: {
    model: 'Category',
    subject: 'category',
    global: true,
    fields: { name: 'value', slug: 'value', isActive: 'value', sortOrder: 'value', icon: 'name', description: 'name', parentId: 'name' },
    identity: ['name'],
    label: (doc: Doc) => text(doc.name),
    brands: () => [],
  },
  destination: {
    model: 'Destination',
    subject: 'destination',
    global: true,
    fields: {
      name: 'value', slug: 'value', country: 'value', continent: 'value', isActive: 'value', sortOrder: 'value',
      timezone: 'value', language: 'value', description: 'name', shortDescription: 'name', images: 'name',
      heroImage: 'name', highlights: 'name', bestTimeToVisit: 'name', coordinates: 'name', tags: 'name',
    },
    identity: ['name'],
    label: (doc: Doc) => text(doc.name),
    brands: () => [],
  },
  bundle: {
    model: 'BundleDefinition',
    subject: 'bundle',
    fields: {
      title: 'value', slug: 'value', status: 'value', area: 'value', category: 'value', currency: 'value', version: 'value',
      shortDescription: 'name', description: 'name', images: 'name', components: 'name', policies: 'name', customerPricesMinor: 'name',
    },
    identity: ['title', 'storefrontTenantId'],
    label: (doc: Doc) => text(doc.title),
    brands: (doc: Doc) => [doc.storefrontTenantId],
  },
  bundleOrder: {
    model: 'BundleOrder',
    subject: 'bundle-order',
    fields: { status: 'value', components: 'name' },
    identity: ['reference', 'storefrontTenantId', 'components.supplierTenantId'],
    label: (doc: Doc) => text(doc.reference),
    brands: (doc: Doc) => [doc.storefrontTenantId, ((doc.components as Doc[] | undefined) || []).map((component) => component.supplierTenantId)],
  },
  supplyOffer: {
    model: 'BundleSupplyOffer',
    subject: 'supplier-offer',
    fields: {
      status: 'value', currency: 'value', version: 'value', validTravelFrom: 'value', validTravelTo: 'value',
      salesStartsAt: 'value', salesEndsAt: 'value', leadTimeHours: 'value', termsVersion: 'value',
      supplierNetPricesMinor: 'name', optionIds: 'name', entryWindowLabels: 'name', capacityPerDeparture: 'name',
      blackoutDates: 'name', cancellationPolicy: 'name', rejectionReason: 'name', pausedReason: 'name',
    },
    identity: ['attractionId', 'supplierTenantId'],
    brands: (doc: Doc) => [doc.supplierTenantId],
    enrich: async (doc: Doc) => ({ label: (await tourIdentity(doc.attractionId)).label }),
  },
  journal: {
    model: 'BlogPost',
    subject: 'journal-post',
    fields: {
      title: 'value', slug: 'value', status: 'value', category: 'value', featured: 'value', publishedAt: 'value', tags: 'value',
      excerpt: 'name', content: 'name', featuredImage: 'name', featuredImageAlt: 'name', metaTitle: 'name',
      metaDescription: 'name', faqs: 'name', translations: 'name', author: 'name',
    },
    identity: ['title', 'tenantId', 'tenantRef'],
    label: (doc: Doc) => text(doc.title),
    brands: (doc: Doc) => [doc.tenantRef, doc.tenantId],
  },
  tourTranslation: {
    model: 'AttractionTranslation',
    subject: 'tour-translation',
    fields: { status: 'value', slug: 'value', content: 'name' },
    identity: ['tenantId', 'attractionId', 'locale'],
    brands: (doc: Doc) => [doc.tenantId],
    enrich: async (doc: Doc) => {
      const tour = await tourIdentity(doc.attractionId);
      // Named only when the tour is sold on the brand the translation belongs to.
      const own = uniqueIds(tour.brands || []).includes(String(idString(doc.tenantId)));
      return { label: own && tour.label ? `${tour.label} (${String(doc.locale).toUpperCase()})` : undefined };
    },
    find: async (_id: string, params: Record<string, string>) => {
      const Model = modelOf('AttractionTranslation');
      if (!Model || !idString(params.tenantId) || !idString(params.attractionId)) return null;
      const doc = await Model.findOne({ tenantId: params.tenantId, attractionId: params.attractionId, locale: params.locale })
        .select('tenantId attractionId locale status slug content').lean<Doc>();
      return doc || { tenantId: params.tenantId, attractionId: params.attractionId, locale: params.locale };
    },
  },
  destinationTranslation: {
    model: 'DestinationTranslation',
    subject: 'destination-translation',
    fields: { status: 'value', slug: 'value', content: 'name' },
    identity: ['tenantId', 'destinationId', 'locale'],
    brands: (doc: Doc) => [doc.tenantId],
    enrich: async (doc: Doc) => {
      const Destination = modelOf('Destination');
      const id = idString(doc.destinationId);
      const destination = Destination && id ? await Destination.findById(id).select('name').lean<Doc>() : null;
      return { label: destination && text(destination.name) ? `${text(destination.name)} (${String(doc.locale).toUpperCase()})` : undefined };
    },
    find: async (_id: string, params: Record<string, string>) => {
      const Model = modelOf('DestinationTranslation');
      if (!Model || !idString(params.tenantId) || !idString(params.destinationId)) return null;
      const doc = await Model.findOne({ tenantId: params.tenantId, destinationId: params.destinationId, locale: params.locale })
        .select('tenantId destinationId locale status slug content').lean<Doc>();
      return doc || { tenantId: params.tenantId, destinationId: params.destinationId, locale: params.locale };
    },
  },
  apiKey: {
    model: 'ApiKey',
    subject: 'api-key',
    // Never the key, its hash or its prefix.
    fields: { label: 'value', scopes: 'value', revoked: 'value' },
    identity: ['label', 'tenantId'],
    label: (doc: Doc) => text(doc.label),
    brands: (doc: Doc) => [doc.tenantId],
  },
  webhook: {
    model: 'WebhookEndpoint',
    subject: 'webhook',
    // Never the signing secret. The address can carry a token in its path, so only its change is noted.
    fields: { description: 'value', events: 'value', enabled: 'value', url: 'name' },
    identity: ['description', 'tenantId'],
    label: (doc: Doc) => text(doc.description),
    brands: (doc: Doc) => [doc.tenantId],
  },
  message: {
    model: 'ContactMessage',
    subject: 'message',
    // The sender's name, address, phone and words are never read.
    fields: { status: 'value' },
    identity: ['reference', 'tenantId'],
    label: (doc: Doc) => text(doc.reference),
    brands: (doc: Doc) => [doc.tenantId],
  },
  rsvp: {
    model: 'EventRsvp',
    subject: 'rsvp',
    fields: { status: 'value' },
    identity: ['eventName', 'tenantId'],
    label: (doc: Doc) => text(doc.eventName),
    brands: (doc: Doc) => [doc.tenantId],
  },
} satisfies Record<string, SubjectSpec>;
export type SpecKey = keyof typeof SPECS;

interface RouteRule {
  methods: string[];
  pattern: RegExp;
  spec?: SpecKey;
  subject?: AuditSubject;
  verb: AuditVerb;
  /** The record id comes from the response (new records) or the brand open in the admin (menu). */
  idFrom?: 'response' | 'site-header';
  /** Safe facts taken from the path itself, e.g. the date that was reopened. */
  pathChanges?: (params: Record<string, string>) => AuditChange[];
}

const ID = '(?<id>[a-f0-9]{24})';
// Express matches paths without regard to case, so the log does too.
const rule = (methods: string | string[], pattern: RegExp, spec: SpecKey | undefined, verb: AuditVerb, extra: Partial<RouteRule> = {}): RouteRule =>
  ({ methods: Array.isArray(methods) ? methods : [methods], pattern: new RegExp(pattern.source, 'i'), spec, verb, ...extra });

/** First match wins: specific routes before the plain record routes. */
const ROUTES: RouteRule[] = [
  // Tours, attractions and packages (the /admin/ aliases share the routers).
  rule('POST', /^\/(?:admin\/)?attractions\/stop-sale\/batch$/, undefined, 'stop-sale', { subject: 'tour' }),
  rule('PATCH', /^\/(?:admin\/)?attractions\/admin\/reseller-config\/bulk$/, undefined, 'reseller-settings', { subject: 'tour' }),
  rule('POST', new RegExp(`^/(?:admin/)?attractions/${ID}/duplicate$`), 'listing', 'duplicate'),
  rule('POST', new RegExp(`^/(?:admin/)?attractions/${ID}/restore$`), 'listing', 'restore'),
  rule('POST', new RegExp(`^/(?:admin/)?attractions/${ID}/archive$`), 'listing', 'archive'),
  rule('POST', new RegExp(`^/(?:admin/)?attractions/${ID}/unarchive$`), 'listing', 'unarchive'),
  rule('DELETE', new RegExp(`^/(?:admin/)?attractions/${ID}/permanent$`), 'listing', 'delete-permanently'),
  rule('POST', new RegExp(`^/(?:admin/)?attractions/${ID}/block-dates$`), 'listing', 'block-dates'),
  rule('DELETE', new RegExp(`^/(?:admin/)?attractions/${ID}/block-dates/(?<date>\\d{4}-\\d{2}-\\d{2})$`), 'listing', 'unblock-date', {
    pathChanges: (params) => [{ field: 'reopenedDate', after: params.date }],
  }),
  rule('POST', new RegExp(`^/(?:admin/)?attractions/${ID}/resell$`), 'listing', 'resell-start'),
  rule('DELETE', new RegExp(`^/(?:admin/)?attractions/${ID}/resell$`), 'listing', 'resell-stop'),
  rule('PATCH', new RegExp(`^/(?:admin/)?attractions/${ID}/reseller-config$`), 'listing', 'reseller-settings'),
  rule('POST', new RegExp(`^/(?:admin/)?attractions/${ID}/reviews$`), 'review', 'create', { idFrom: 'response' }),
  rule(['PATCH', 'PUT'], new RegExp(`^/(?:admin/)?attractions/${ID}$`), 'listing', 'update'),
  rule('DELETE', new RegExp(`^/(?:admin/)?attractions/${ID}$`), 'listing', 'delete'),
  rule('POST', /^\/(?:admin\/)?attractions$/, 'listing', 'create', { idFrom: 'response' }),
  rule('PUT', new RegExp(`^/packages/${ID}$`), 'listing', 'update'),
  rule('POST', new RegExp(`^/packages/${ID}/publish$`), 'listing', 'publish'),
  rule(['POST', 'PUT', 'DELETE'], new RegExp(`^/packages/${ID}/departures(?:/(?<date>\\d{4}-\\d{2}-\\d{2}))?$`), 'listing', 'departures'),
  rule('POST', new RegExp(`^/packages/${ID}/bookings$`), 'booking', 'create', { idFrom: 'response' }),

  // Bookings and payments.
  rule('POST', /^\/(?:admin\/)?bookings\/admin\/settlement\/settle$/, undefined, 'settle', { subject: 'booking' }),
  rule('PATCH', new RegExp(`^/(?:admin/)?bookings/admin/${ID}/settlement$`), 'booking', 'settlement'),
  rule('POST', new RegExp(`^/(?:admin/)?bookings/admin/${ID}/payment-link$`), 'booking', 'payment-link'),
  rule('PATCH', new RegExp(`^/(?:admin/)?bookings/admin/${ID}$`), 'booking', 'update'),
  rule('DELETE', new RegExp(`^/(?:admin/)?bookings/admin/${ID}$`), 'booking', 'delete'),
  rule('PATCH', new RegExp(`^/(?:admin/)?bookings/${ID}/cancel$`), 'booking', 'cancel'),
  rule('POST', /^\/(?:admin\/)?bookings$/, 'booking', 'create', { idFrom: 'response' }),
  rule('POST', new RegExp(`^/payments/(?<id>[a-f0-9]{24})/refund$`), 'booking', 'refund'),
  // Named after the site in the path; the site's payment settings themselves are on no allow-list.
  rule('PUT', new RegExp(`^/payments/gateway/${ID}$`), 'site', 'payment-settings'),

  // Team members.
  rule('POST', /^\/(?:admin\/)?users\/invite$/, 'user', 'invite', { idFrom: 'response' }),
  rule('POST', new RegExp(`^/(?:admin/)?users/${ID}/invitation-link$`), 'user', 'invitation-link'),
  rule('POST', new RegExp(`^/(?:admin/)?users/${ID}/password$`), 'user', 'reset-password'),
  rule('POST', new RegExp(`^/(?:admin/)?users/${ID}/revoke-sessions$`), 'user', 'revoke-sessions'),
  rule('PATCH', new RegExp(`^/(?:admin/)?users/${ID}$`), 'user', 'update'),
  rule('DELETE', new RegExp(`^/(?:admin/)?users/${ID}$`), 'user', 'delete'),

  // Sites and their pages.
  rule('POST', new RegExp(`^/tenants/(?<id>[a-f0-9]{24})/notification-failures/[a-z-]+/[a-f0-9]{24}/reconcile$`), 'site', 'resolve-notification'),
  rule('POST', new RegExp(`^/(?:admin/)?tenants/${ID}/custom-domain/verify$`), 'site', 'domain-check'),
  rule('POST', new RegExp(`^/(?:admin/)?tenants/${ID}/custom-domain$`), 'site', 'domain-add'),
  rule('DELETE', new RegExp(`^/(?:admin/)?tenants/${ID}/custom-domain$`), 'site', 'domain-remove'),
  rule('PATCH', new RegExp(`^/(?:admin/)?tenants/${ID}/settings$`), 'site', 'settings'),
  rule('PUT', new RegExp(`^/(?:admin/)?tenants/${ID}/sections$`), 'site', 'sections'),
  rule('PATCH', new RegExp(`^/(?:admin/)?tenants/${ID}/tracking-settings$`), 'site', 'tracking'),
  rule('PATCH', new RegExp(`^/(?:admin/)?tenants/${ID}/ai-products$`), 'site', 'ai-products'),
  rule('PATCH', new RegExp(`^/(?:admin/)?tenants/${ID}/(?:page-seo|seo-settings)$`), 'site', 'seo'),
  rule(['PATCH', 'PUT'], new RegExp(`^/(?:admin/)?tenants/${ID}$`), 'site', 'update'),
  rule('DELETE', new RegExp(`^/(?:admin/)?tenants/${ID}$`), 'site', 'delete'),
  rule('POST', /^\/(?:admin\/)?tenants$/, 'site', 'create', { idFrom: 'response' }),
  rule('POST', new RegExp(`^/preview/admin/regenerate/${ID}$`), 'site', 'preview-code'),
  rule('PUT', /^\/page\/admin\/menu$/, 'site', 'menu', { idFrom: 'site-header' }),
  rule('POST', new RegExp(`^/page/admin/${ID}/archive$`), 'page', 'archive'),
  rule('POST', new RegExp(`^/page/admin/${ID}/trash$`), 'page', 'trash'),
  rule('POST', new RegExp(`^/page/admin/${ID}/unarchive$`), 'page', 'unarchive'),
  rule('POST', new RegExp(`^/page/admin/${ID}/restore$`), 'page', 'restore'),
  rule('DELETE', new RegExp(`^/page/admin/${ID}/permanent$`), 'page', 'delete-permanently'),
  rule('PATCH', new RegExp(`^/page/admin/${ID}$`), 'page', 'update'),
  rule('POST', /^\/page\/admin$/, 'page', 'create', { idFrom: 'response' }),

  // Journal and translations.
  rule('POST', new RegExp(`^/admin/journal/[a-f0-9]{24}/${ID}/transition$`), 'journal', 'status'),
  rule('PUT', new RegExp(`^/admin/journal/[a-f0-9]{24}/${ID}$`), 'journal', 'update'),
  rule('POST', /^\/admin\/journal\/[a-f0-9]{24}$/, 'journal', 'create', { idFrom: 'response' }),
  rule(['PUT', 'POST'], /^\/admin\/attraction-translations\/(?<tenantId>[a-f0-9]{24})\/(?<attractionId>[a-f0-9]{24})\/(?<locale>ar|de|ru|fr)(?<transition>\/transition)?$/, 'tourTranslation', 'update'),
  rule(['PUT', 'POST'], /^\/admin\/destination-translations\/(?<tenantId>[a-f0-9]{24})\/(?<destinationId>[a-f0-9]{24})\/(?<locale>ar|de|ru|fr)(?<transition>\/transition)?$/, 'destinationTranslation', 'update'),

  // Sales tools.
  rule('POST', /^\/promo-codes$/, 'promo', 'create', { idFrom: 'response' }),
  rule('PATCH', new RegExp(`^/promo-codes/${ID}$`), 'promo', 'update'),
  rule('DELETE', new RegExp(`^/promo-codes/${ID}$`), 'promo', 'delete'),
  rule('POST', /^\/special-offers\/bulk$/, undefined, 'create', { subject: 'special-offer' }),
  rule('POST', /^\/special-offers$/, 'offer', 'create', { idFrom: 'response' }),
  rule('PATCH', new RegExp(`^/special-offers/${ID}$`), 'offer', 'update'),
  rule('DELETE', new RegExp(`^/special-offers/${ID}$`), 'offer', 'delete'),
  rule('PATCH', new RegExp(`^/reviews/${ID}/status$`), 'review', 'status'),
  rule('POST', new RegExp(`^/reviews/${ID}/reply$`), 'review', 'reply'),
  rule('POST', /^\/reviews$/, 'review', 'create', { idFrom: 'response' }),
  rule('POST', /^\/(?:admin\/)?categories$/, 'category', 'create', { idFrom: 'response' }),
  rule('PATCH', new RegExp(`^/(?:admin/)?categories/${ID}$`), 'category', 'update'),
  rule('DELETE', new RegExp(`^/(?:admin/)?categories/${ID}$`), 'category', 'delete'),
  rule('POST', /^\/(?:admin\/)?destinations$/, 'destination', 'create', { idFrom: 'response' }),
  rule('PATCH', new RegExp(`^/(?:admin/)?destinations/${ID}$`), 'destination', 'update'),
  rule('DELETE', new RegExp(`^/(?:admin/)?destinations/${ID}$`), 'destination', 'delete'),

  // Bundles.
  rule('PUT', /^\/bundles\/admin\/readiness$/, undefined, 'readiness', { subject: 'bundle' }),
  rule('POST', new RegExp(`^/bundles/admin/outbox/${ID}/redrive$`), undefined, 'retry', { subject: 'bundle-order' }),
  rule('POST', new RegExp(`^/bundles/admin/${ID}/status/(?<status>[a-z_-]+)$`), 'bundle', 'status'),
  rule('PUT', new RegExp(`^/bundles/admin/${ID}/components$`), 'bundle', 'update'),
  rule('PATCH', new RegExp(`^/bundles/admin/${ID}$`), 'bundle', 'update'),
  rule('POST', /^\/bundles\/admin$/, 'bundle', 'create', { idFrom: 'response' }),
  rule('POST', new RegExp(`^/bundle-orders/admin/${ID}/refund$`), 'bundleOrder', 'refund'),
  rule('POST', new RegExp(`^/bundle-orders/admin/${ID}/components/[A-Za-z0-9_-]{1,64}/fulfil$`), 'bundleOrder', 'fulfil'),
  rule('POST', new RegExp(`^/bundle-orders/admin/${ID}/components/[A-Za-z0-9_-]{1,64}/release-settlement$`), 'bundleOrder', 'release-settlement'),
  rule('POST', new RegExp(`^/bundle-orders/admin/${ID}/components/[A-Za-z0-9_-]{1,64}/mark-settled$`), 'bundleOrder', 'mark-settled'),
  rule('POST', new RegExp(`^/bundle-orders/admin/${ID}/components/[A-Za-z0-9_-]{1,64}/resolve-settlement-dispute$`), 'bundleOrder', 'resolve-dispute'),
  rule('POST', new RegExp(`^/bundle-orders/admin/${ID}/recover$`), 'bundleOrder', 'recover'),
  rule('POST', new RegExp(`^/bundle-orders/${ID}/cancel$`), 'bundleOrder', 'cancel'),
  rule('POST', /^\/bundle-orders$/, 'bundleOrder', 'create', { idFrom: 'response' }),
  rule('POST', new RegExp(`^/bundle-supply-offers/${ID}/status/(?<status>[a-z_-]+)$`), 'supplyOffer', 'status'),
  rule('PATCH', new RegExp(`^/bundle-supply-offers/${ID}$`), 'supplyOffer', 'update'),
  rule('POST', /^\/bundle-supply-offers$/, 'supplyOffer', 'create', { idFrom: 'response' }),

  // Messages, RSVPs, integrations, uploads.
  rule('PATCH', new RegExp(`^/contact/messages/${ID}$`), 'message', 'status'),
  rule('PATCH', new RegExp(`^/rsvps/admin/${ID}/status$`), 'rsvp', 'status'),
  rule('DELETE', new RegExp(`^/rsvps/admin/${ID}$`), 'rsvp', 'delete'),
  rule('POST', /^\/api-keys$/, 'apiKey', 'create', { idFrom: 'response' }),
  rule('DELETE', new RegExp(`^/api-keys/${ID}$`), 'apiKey', 'revoke'),
  rule('POST', new RegExp(`^/webhooks/${ID}/ping$`), 'webhook', 'test'),
  rule('PATCH', new RegExp(`^/webhooks/${ID}$`), 'webhook', 'update'),
  rule('DELETE', new RegExp(`^/webhooks/${ID}$`), 'webhook', 'delete'),
  rule('POST', /^\/webhooks$/, 'webhook', 'create', { idFrom: 'response' }),
  rule('POST', /^\/upload\/(?:image|images)$/, undefined, 'upload', { subject: 'image' }),
  rule('POST', /^\/upload\/generate$/, undefined, 'generate', { subject: 'image' }),
];

/**
 * The path as Express routes it: each segment percent-decoded, so `/attractions/6%61…` is the same
 * record as `/attractions/6a…`. A segment that does not decode is kept as sent (Express answers 400).
 */
export const decodedPath = (path: string): string => path.split('/').map((segment) => {
  try { return decodeURIComponent(segment); } catch { return segment; }
}).join('/');

export interface AuditRouteMatch {
  rule: RouteRule;
  recordId?: string;
  params: Record<string, string>;
}

/** The record an admin request concerns, from its method and path (`/api/...`, no query). */
export const matchAuditRoute = (method: string, apiPath: string): AuditRouteMatch | undefined => {
  const path = decodedPath(apiPath).replace(/^\/api(?=\/)/i, '').replace(/\/+$/, '');
  for (const candidate of ROUTES) {
    if (!candidate.methods.includes(method.toUpperCase())) continue;
    const match = candidate.pattern.exec(path);
    if (!match) continue;
    const params = { ...(match.groups || {}) };
    for (const key of Object.keys(params)) if (params[key] === undefined) delete params[key];
    const recordId = params.id?.toLowerCase();
    return { rule: candidate, recordId, params };
  }
  return undefined;
};

/** True when the route reads a record before the change (an existing record named in the path). */
export const needsBeforeSnapshot = (match: AuditRouteMatch | undefined): boolean => {
  if (!match?.rule.spec || match.rule.idFrom === 'response') return false;
  const spec: SubjectSpec = SPECS[match.rule.spec];
  return Boolean(match.recordId || match.rule.idFrom === 'site-header' || (spec.find && Object.keys(match.params).length));
};

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T | undefined> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), ms); timer.unref?.(); });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Reads one record through its allow-list. `null` means the record does not exist (deleted, or
 * never existed); `undefined` means it could not be read in time, so nothing is claimed about it.
 */
export const takeSnapshot = async (specKey: SpecKey, recordId: string | undefined, params: Record<string, string> = {}): Promise<RecordSnapshot | null | undefined> => {
  const spec: SubjectSpec = SPECS[specKey];
  if (mongoose.connection.readyState !== 1) return undefined;
  const read = async (): Promise<RecordSnapshot | null> => {
    let doc: Doc | null = null;
    if (spec.find) {
      doc = await spec.find(recordId || '', params);
    } else {
      const Model = modelOf(spec.model);
      if (!Model || !recordId || !Types.ObjectId.isValid(recordId)) return null;
      const paths = Array.from(new Set([...Object.keys(spec.fields), ...spec.identity]));
      // A path and one of its parents in the same projection is a MongoDB error: keep the parent.
      const projection = paths.filter((field) => !paths.some((other) => field.startsWith(`${other}.`))).join(' ');
      doc = await Model.findById(recordId).select(projection).lean<Doc>();
    }
    if (!doc) return null;
    const extra = spec.enrich ? await spec.enrich(doc) : {};
    const fields = spec.fieldsFor ? spec.fieldsFor(doc) : spec.fields;
    const values: Record<string, unknown> = {};
    for (const field of Object.keys(fields)) values[field] = get(doc, field);
    const brands = uniqueIds([...(spec.brands(doc) || []), ...(extra.brands || [])]);
    // A brand's record whose brand cannot be worked out (an offer whose tour is gone) could belong to
    // anyone: it keeps no name and no values, so nothing of it can surface under the wrong brand.
    const owned = spec.global || brands.length > 0;
    return {
      subject: typeof spec.subject === 'function' ? spec.subject(doc) : spec.subject,
      label: owned ? extra.label ?? spec.label?.(doc) : undefined,
      brands,
      values: owned ? values : {},
      fields: owned ? fields : {},
    };
  };
  try {
    return await withTimeout(read(), SNAPSHOT_TIMEOUT_MS);
  } catch (error) {
    console.error('[audit] record could not be read', { spec: specKey, error: error instanceof Error ? error.message : 'unknown' });
    return undefined;
  }
};

/** A value worth keeping in a log line: short scalars and short lists. Anything else is name-only. */
export const auditValue = (value: unknown): AuditValue | undefined => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.trim().slice(0, MAX_TEXT);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (Array.isArray(value)) {
    if (value.length > MAX_LIST) return undefined;
    const items = value.map((item) => (typeof item === 'string' ? item.trim().slice(0, 60) : typeof item === 'number' || typeof item === 'boolean' ? item : undefined));
    return items.every((item) => item !== undefined) ? (items as Array<string | number | boolean>) : undefined;
  }
  return undefined;
};

/** Order-independent comparison text for any stored value (ids, dates and maps included). */
const stable = (value: unknown): string => {
  const normal = (input: unknown): unknown => {
    if (input === undefined || input === null || input === '') return null;
    if (input instanceof Date) return input.toISOString();
    if (input instanceof Map) return normal(Object.fromEntries(input));
    if (Array.isArray(input)) return input.map(normal);
    if (typeof input === 'object') {
      const id = idString(input);
      if (id && typeof (input as { toHexString?: unknown }).toHexString === 'function') return id;
      return Object.fromEntries(Object.entries(input as Doc).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normal(child)]));
    }
    return input;
  };
  return JSON.stringify(normal(value));
};

const isEmpty = (value: unknown): boolean =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

/**
 * What changed between the two pictures. A new record lists its key facts; a removed record keeps
 * the facts it had; a changed record lists before → after for `value` fields and the names of the
 * `name` fields that changed. Without a "before" picture nothing is claimed about a change.
 * Customers keep the narrower list whichever side has it.
 */
export const diffSnapshots = (
  before: RecordSnapshot | null | undefined,
  after: RecordSnapshot | null | undefined,
  options: { created?: boolean } = {},
): { changes: AuditChange[]; changedFields: string[] } => {
  const changes: AuditChange[] = [];
  const changedFields: string[] = [];
  const fields = before?.fields && after?.fields
    ? Object.fromEntries(Object.entries(before.fields).filter(([field]) => field in after.fields))
    : (before?.fields || after?.fields || {});
  for (const [field, mode] of Object.entries(fields)) {
    const was = before?.values[field];
    const now = after?.values[field];
    if (options.created) {
      if (!after || mode !== 'value' || isEmpty(now)) continue;
      const afterValue = auditValue(now);
      if (afterValue !== undefined && changes.length < MAX_CHANGES) changes.push({ field, after: afterValue });
    } else if (before && after) {
      if (stable(was) === stable(now)) continue;
      const beforeValue = mode === 'value' ? auditValue(was) : undefined;
      const afterValue = mode === 'value' ? auditValue(now) : undefined;
      if (beforeValue !== undefined && afterValue !== undefined && changes.length < MAX_CHANGES) changes.push({ field, before: beforeValue, after: afterValue });
      else if (changedFields.length < MAX_CHANGED_FIELDS) changedFields.push(field);
    } else if (before && after === null) {
      if (mode !== 'value' || isEmpty(was)) continue;
      const beforeValue = auditValue(was);
      if (beforeValue !== undefined && changes.length < MAX_CHANGES) changes.push({ field, before: beforeValue });
    }
  }
  return { changes, changedFields };
};

/**
 * The brand a change is filed under: the brand that owns the record, never one it does not belong
 * to. The brand open in the admin decides only among the record's own brands the person works for.
 * A record no brand owns (categories, destinations, uploads) stays with the brand that was open, if
 * the person works for it; otherwise it is filed under no brand.
 */
export const attributeBrand = (params: {
  recordBrands: string[];
  requestTenant?: string;
  actor?: { role?: string; assignedTenants?: unknown[] } | null;
}): string | undefined => {
  const { recordBrands, requestTenant } = params;
  const superAdmin = params.actor?.role === 'super-admin';
  const actorBrands = new Set(uniqueIds(params.actor?.assignedTenants || []));
  const allowed = (brand: string) => superAdmin || actorBrands.has(brand);
  // The open brand comes from a header anyone can set: it counts only for a person who works for it.
  if (!recordBrands.length) return requestTenant && allowed(requestTenant) ? requestTenant : undefined;
  if (requestTenant && recordBrands.includes(requestTenant) && allowed(requestTenant)) return requestTenant;
  return recordBrands.find((brand) => !superAdmin && actorBrands.has(brand)) || recordBrands[0];
};

/** Each verb as done ("Changed tour") and as attempted ("change tour"). */
const VERB_TEXT: Record<AuditVerb, [string, string]> = {
  create: ['Created {subject}', 'create {subject}'],
  update: ['Changed {subject}', 'change {subject}'],
  delete: ['Deleted {subject}', 'delete {subject}'],
  'delete-permanently': ['Permanently deleted {subject}', 'permanently delete {subject}'],
  archive: ['Archived {subject}', 'archive {subject}'],
  unarchive: ['Unarchived {subject}', 'unarchive {subject}'],
  restore: ['Restored {subject}', 'restore {subject}'],
  trash: ['Moved {subject} to the trash', 'move {subject} to the trash'],
  duplicate: ['Duplicated {subject}', 'duplicate {subject}'],
  publish: ['Published {subject}', 'publish {subject}'],
  status: ['Changed the status of {subject}', 'change the status of {subject}'],
  'block-dates': ['Blocked dates on {subject}', 'block dates on {subject}'],
  'unblock-date': ['Reopened a date on {subject}', 'reopen a date on {subject}'],
  'resell-start': ['Started reselling {subject}', 'start reselling {subject}'],
  'resell-stop': ['Stopped reselling {subject}', 'stop reselling {subject}'],
  'reseller-settings': ['Changed reseller settings of {subject}', 'change reseller settings of {subject}'],
  'stop-sale': ['Stopped sales of {subjects}', 'stop sales of {subjects}'],
  departures: ['Changed departures of {subject}', 'change departures of {subject}'],
  cancel: ['Cancelled {subject}', 'cancel {subject}'],
  refund: ['Refunded {subject}', 'refund {subject}'],
  'payment-link': ['Sent a payment link for {subject}', 'send a payment link for {subject}'],
  settlement: ['Changed the settlement of {subject}', 'change the settlement of {subject}'],
  settle: ['Settled {subjects}', 'settle {subjects}'],
  invite: ['Invited {subject}', 'invite {subject}'],
  'invitation-link': ['Created an invitation link for {subject}', 'create an invitation link for {subject}'],
  'reset-password': ['Reset the password of {subject}', 'reset the password of {subject}'],
  'revoke-sessions': ['Signed out {subject} everywhere', 'sign out {subject} everywhere'],
  settings: ['Changed the settings of {subject}', 'change the settings of {subject}'],
  sections: ['Changed the sections of {subject}', 'change the sections of {subject}'],
  'domain-add': ['Added a custom domain to {subject}', 'add a custom domain to {subject}'],
  'domain-check': ['Checked the custom domain of {subject}', 'check the custom domain of {subject}'],
  'domain-remove': ['Removed the custom domain of {subject}', 'remove the custom domain of {subject}'],
  tracking: ['Changed tracking of {subject}', 'change tracking of {subject}'],
  'ai-products': ['Changed AI products of {subject}', 'change AI products of {subject}'],
  seo: ['Changed search settings of {subject}', 'change search settings of {subject}'],
  'payment-settings': ['Changed payment settings of {subject}', 'change payment settings of {subject}'],
  'preview-code': ['Made a new preview code for {subject}', 'make a new preview code for {subject}'],
  menu: ['Changed the menu of {subject}', 'change the menu of {subject}'],
  reply: ['Replied to {subject}', 'reply to {subject}'],
  upload: ['Uploaded {subjects}', 'upload {subjects}'],
  generate: ['Generated {subjects}', 'generate {subjects}'],
  fulfil: ['Fulfilled part of {subject}', 'fulfil part of {subject}'],
  'release-settlement': ['Released a settlement of {subject}', 'release a settlement of {subject}'],
  'mark-settled': ['Marked part of {subject} settled', 'mark part of {subject} settled'],
  'resolve-dispute': ['Resolved a settlement dispute on {subject}', 'resolve a settlement dispute on {subject}'],
  recover: ['Recovered {subject}', 'recover {subject}'],
  retry: ['Retried {subject} processing', 'retry {subject} processing'],
  readiness: ['Changed {subject} readiness', 'change {subject} readiness'],
  'resolve-notification': ['Resolved a failed notification of {subject}', 'resolve a failed notification of {subject}'],
  revoke: ['Revoked {subject}', 'revoke {subject}'],
  test: ['Tested {subject}', 'test {subject}'],
  export: ['Exported {subject}', 'export {subject}'],
};

export const SUBJECT_TEXT: Record<AuditSubject, string> = {
  tour: 'tour', attraction: 'attraction ticket', package: 'package', booking: 'booking', 'team-member': 'team member',
  'customer-account': 'customer account', site: 'site', page: 'page', 'promo-code': 'promo code',
  'special-offer': 'special offer', review: 'review', category: 'category', destination: 'destination', bundle: 'bundle',
  'bundle-order': 'bundle order', 'supplier-offer': 'supplier offer', 'journal-post': 'journal post',
  'tour-translation': 'tour translation', 'destination-translation': 'destination translation', 'api-key': 'API key',
  webhook: 'webhook', message: 'message', rsvp: 'RSVP', image: 'image', 'user-log': 'user log',
};

const SUBJECT_PLURAL: Partial<Record<AuditSubject, string>> = { 'attraction': 'attraction tickets' };

/**
 * The plain English summary kept on the entry: "Changed tour: Giftun Reef Snorkel Day", or for a
 * request that did not go through, "Tried to delete tour: Nile Felucca Sunset (refused)".
 */
export const auditSummary = (verb: AuditVerb, subject: AuditSubject | undefined, label: string | undefined, outcome: 'success' | 'failure', statusCode?: number): string => {
  const what = subject ? SUBJECT_TEXT[subject] : 'record';
  const whats = (subject && SUBJECT_PLURAL[subject]) || `${what}s`;
  const [done, attempt] = VERB_TEXT[verb];
  const phrase = (outcome === 'success' ? done : `Tried to ${attempt}`).replace('{subjects}', whats).replace('{subject}', what);
  const named = label ? `${phrase}: ${label}` : phrase;
  if (outcome === 'success') return named.slice(0, 300);
  return `${named} (${statusCode !== undefined && statusCode >= 500 ? 'failed' : 'refused'})`.slice(0, 300);
};

/** Which record family an entry belongs to for filtering: creations, changes, removals. */
export const auditActionForVerb = (verb: AuditVerb): 'record.create' | 'record.update' | 'record.delete' | 'record.export' => {
  if (verb === 'export') return 'record.export';
  if (['create', 'invite', 'duplicate'].includes(verb)) return 'record.create';
  if (['delete', 'delete-permanently', 'revoke', 'domain-remove'].includes(verb)) return 'record.delete';
  return 'record.update';
};

/** The id the API returned for a record it created (only the id is read from the response). */
export const createdRecordId = (body: unknown): string | undefined => {
  const data = (body as { data?: unknown } | null)?.data as Doc | undefined;
  const nested = Object.values(data || {})
    .filter((value): value is Doc => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !('_bsontype' in (value as object)))
    .map((value) => value._id);
  const candidates = [data?._id, data?.id, (data?.data as Doc | undefined)?._id, (data?.data as Doc | undefined)?.id, ...nested];
  return candidates.map(idString).find(Boolean);
};

export const subjectSpec = (key: SpecKey): SubjectSpec => SPECS[key];
export const AUDIT_SPEC_KEYS = Object.keys(SPECS) as SpecKey[];
