import { Request } from 'express';
import { Document, Types } from 'mongoose';

// User Types
export type AdminRole = 'super-admin' | 'brand-admin' | 'manager' | 'editor' | 'viewer';
export type CustomerRole = 'customer' | 'guest';
export type UserRole = AdminRole | CustomerRole;
export type UserStatus = 'active' | 'inactive' | 'pending' | 'suspended';

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  role: UserRole;
  status: UserStatus;
  phone?: string;
  country?: string;
  language?: string;
  currency?: string;
  assignedTenants: Types.ObjectId[];
  wishlist: Types.ObjectId[];
  loyaltyPoints?: number;
  totalBookings?: number;
  totalSpent?: number;
  refreshToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// Tenant Types
export type TenantStatus = 'active' | 'inactive' | 'pending' | 'suspended' | 'coming_soon';

export interface ITenant extends Document {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  domain: string;
  customDomain?: string;
  // True once the customDomain is confirmed to serve the Attractions build (not an
  // old WordPress site). Gates whether transactional email links use the brand domain.
  domainMigrated?: boolean;
  logo: string;
  logoDark?: string;
  favicon?: string;
  heroImages?: string[];
  tagline?: string;
  description?: string;
  theme: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
  fonts?: {
    heading: string;
    body: string;
  };
  designMode?: 'default' | 'luxury' | 'minimal' | 'nautical' | 'equestrian' | 'marine' | 'desert' | 'safari' | 'travel' | 'stable' | 'sunmarine' | 'rittal' | 'speedboat' | 'ancient' | 'pyramid' | 'skyride' | 'temple' | 'ranch' | 'reef' | 'obelisk' | 'dune' | 'savanna' | 'expedition' | 'dolphin' | 'safarisahara' | 'quadtour';
  defaultCurrency: string;
  defaultLanguage: string;
  supportedLanguages: string[];
  timezone?: string;
  contactInfo?: {
    email: string;
    phone: string;
    whatsapp?: string;
    address?: string;
    supportHours?: string;
  };
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
    tiktok?: string;
  };
  pricingSettings?: {
    enableResidentPricing?: boolean;
  };
  aiSettings: {
    bookingWidget: {
      enabled: boolean;
      position: string;
      primaryColor?: string;
      welcomeMessage?: string;
      languages: string[];
      autoOpen: boolean;
    };
    voiceAgent: {
      enabled: boolean;
      languages: string[];
      buttonPosition: string;
    };
    searchWidget: {
      enabled: boolean;
      placeholder?: string;
      showPopularSearches: boolean;
      maxSuggestions: number;
    };
  };
  navigation?: {
    label: string;
    href: string;
  }[];
  seoSettings?: {
    metaTitle: string;
    metaDescription: string;
    keywords: string[];
    ogImage?: string;
  };
  paymentSettings?: {
    stripeAccountId?: string;
    enabledGateways: string[];
    ownPaymentGateway?: boolean;
  };
  status: TenantStatus;
  previewAccessCode?: string;
  previewAccessCodeUpdatedAt?: Date;
  flatUrls?: boolean;
  customPages?: Array<{
    slug: string;
    title: string;
    metaTitle?: string;
    metaDescription?: string;
    body: string;
    sortOrder?: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

// Attraction Types
export type AttractionStatus = 'active' | 'draft' | 'archived';
export type Badge = 'bestseller' | 'free-cancellation' | 'skip-line' | 'instant-confirm';

export interface IAttraction extends Document {
  _id: Types.ObjectId;
  slug: string;
  pathSlug?: string;
  title: string;
  shortDescription: string;
  description: string;
  images: string[];
  category: string;
  subcategory?: string;
  destination: {
    city: string;
    country: string;
    coordinates: {
      lat: number;
      lng: number;
    };
  };
  duration: string;
  languages: string[];
  rating: number;
  reviewCount: number;
  priceFrom: number;
  currency: string;
  pricingOptions: Array<{
    id: string;
    name: string;
    description: string;
    price: number;
    originalPrice?: number;
    residentPrice?: number;
  }>;
  addons: Array<{
    id: string;
    name: string;
    description?: string;
    price: number;
  }>;
  entryWindows: Array<{
    label: string;
    startTime: string;
    endTime: string;
  }>;
  itinerary: Array<{
    time: string;
    duration: string;
    title: string;
    description: string;
  }>;
  whatToBring: string[];
  accessibility: string[];
  gettingThere: Array<{
    mode: string;
    description: string;
  }>;
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  meetingPoint: {
    address: string;
    instructions: string;
    mapUrl: string;
  };
  cancellationPolicy: string;
  instantConfirmation: boolean;
  mobileTicket: boolean;
  hasHotelPickup: boolean;
  badges: Badge[];
  availability: {
    type: 'time-slots' | 'date-only' | 'flexible';
    advanceBooking: number;
  };
  seo: {
    metaTitle: string;
    metaDescription: string;
    keywords?: string[];
  };
  tenantIds: Types.ObjectId[];
  // Supplier that owns/fulfils this attraction (the tenant that may mark it
  // resellable). Other tenants resell it under their own brand.
  ownerTenantId?: Types.ObjectId;
  reseller: {
    enabled: boolean;
    // Commission % the reseller charges on the total the customer pays. The
    // supplier (tour owner) receives the rest, minus the payment processing fee.
    value: number;
    // Empty = any tenant may resell (open marketplace). Otherwise restricted.
    allowedTenants: Types.ObjectId[];
  };
  status: AttractionStatus;
  featured: boolean;
  sortOrder: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Booking Types
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'refunded';
export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded';

export interface IBooking extends Document {
  _id: Types.ObjectId;
  reference: string;
  userId?: Types.ObjectId;
  tenantId: Types.ObjectId;
  attractionId: Types.ObjectId;
  items: Array<{
    optionId: string;
    optionName: string;
    date: string;
    time?: string;
    quantities: {
      adults: number;
      children: number;
      infants: number;
    };
    unitPrice: number;
    totalPrice: number;
    category?: 'foreigner' | 'resident';
    addons?: Array<{
      id: string;
      name: string;
      price: number;
    }>;
    hotelPickup?: {
      hotelName: string;
      roomNumber?: string;
      pickupTime?: string;
    };
  }>;
  guestDetails: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    country: string;
    specialRequests?: string;
  };
  subtotal: number;
  fees: number;
  discount: number;
  total: number;
  currency: string;
  promoCode?: string;
  paymentMethod?: string;
  paymentStatus: PaymentStatus;
  status: BookingStatus;
  stripePaymentIntentId?: string;
  ticketPdfUrl?: string;
  specialOfferId?: Types.ObjectId;
  // Reseller revenue split — only populated when this booking was sold by one
  // tenant for an attraction owned by a different tenant (isResale). Internal
  // accounting only; the customer still pays `total`.
  supplierTenantId?: Types.ObjectId;
  sellerTenantId?: Types.ObjectId;
  isResale?: boolean;
  revenueBreakdown?: {
    // Reseller commission % applied to the total the customer paid.
    commissionPercent: number;
    // What the reseller (seller) earns = total * commissionPercent / 100.
    sellerEarnings: number;
    // Payment processing fee deducted from the supplier's share.
    paymentFee: number;
    // What the supplier (tour owner) nets = total - sellerEarnings - paymentFee.
    supplierEarnings: number;
  };
  // Manual settlement of the supplier's resale earnings (resale bookings only).
  settlementStatus?: 'pending' | 'settled';
  settledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Category Types
export interface ICategory extends Document {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  icon: string;
  description?: string;
  parentId?: Types.ObjectId;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Destination Types
export interface IDestination extends Document {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  country: string;
  continent: string;
  description: string;
  shortDescription: string;
  images: string[];
  heroImage: string;
  highlights: string[];
  bestTimeToVisit: string;
  timezone: string;
  language: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  tags: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// Review Types
export interface IReview extends Document {
  _id: Types.ObjectId;
  attractionId: Types.ObjectId;
  userId?: Types.ObjectId;
  author: string;
  avatar?: string;
  rating: number;
  title: string;
  content: string;
  helpful: number;
  verified: boolean;
  country: string;
  images?: string[];
  adminReply?: {
    content: string;
    author: string;
    repliedAt: Date;
  };
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

// Notification Types
export type NotificationType = 'booking' | 'review' | 'user' | 'system' | 'alert';
export type NotificationStatus = 'unread' | 'read' | 'archived';

export interface INotification extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tenantId?: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  data?: Record<string, unknown>;
  status: NotificationStatus;
  createdAt: Date;
  updatedAt: Date;
}

// API Key Types
// Programmatic, tenant-scoped credentials. The plaintext key is shown ONCE on
// creation; only its sha256 hash is stored at rest. Resolving an ApiKey yields
// the owning tenant — keys are never resolvable across tenants.
export type ApiKeyScope = 'read' | 'write' | '*';

export interface IApiKey extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  label: string;
  // sha256(plaintext) — unique. The plaintext is never persisted.
  hashedKey: string;
  // Non-secret display fragment, e.g. "fxs_att_a1b2…". Safe to show in lists.
  keyPrefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt?: Date;
  revoked: boolean;
  revokedAt?: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Outbound Webhook Types
export type WebhookEventType =
  | 'booking.created'
  | 'booking.confirmed'
  | 'booking.cancelled'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'ticket.issued'
  | 'ping'
  | '*';

export interface IWebhookEndpoint extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  url: string;
  // Per-endpoint HMAC secret used to sign X-Foxes-Signature. Shown once on
  // create; the receiver stores it to verify. Tenant-scoped.
  secret: string;
  description?: string;
  // Subscribed event types. '*' = all events.
  events: WebhookEventType[];
  enabled: boolean;
  // Consecutive delivery failures; the endpoint auto-disables past a threshold.
  consecutiveFailures: number;
  disabledAt?: Date;
  lastDeliveryAt?: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed';

export interface IWebhookDelivery extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  endpointId: Types.ObjectId;
  // Foxes event id (shared across all endpoint deliveries of one emit).
  eventId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attempts: number;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Inbound webhook idempotency ledger. A unique (provider, eventId) pair ensures
// a provider event (e.g. a Stripe event id) is only ever processed once.
export interface IWebhookEvent extends Document {
  _id: Types.ObjectId;
  provider: string;
  eventId: string;
  eventType?: string;
  tenantId?: Types.ObjectId;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Extended Request with User, Tenant, and (for programmatic access) ApiKey
export interface AuthRequest extends Request {
  user?: IUser;
  tenant?: ITenant;
  apiKey?: IApiKey;
}

// Pagination
export interface PaginationOptions {
  page: number;
  limit: number;
  sort?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// API Response
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  errors?: Array<{ field: string; message: string }>;
}
