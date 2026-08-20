import { z } from 'zod';

// Auth Validators
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().optional(),
  country: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
  avatar: z.string().url().optional(),
  language: z.string().optional(),
  currency: z.string().optional(),
});

// Attraction Validators
export const createAttractionSchema = z.object({
  slug: z.string().min(1, 'Slug is required'),
  pathSlug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'URL slug may contain lowercase letters, numbers, and hyphens only').optional(),
  parentPage: z.object({
    label: z.string().trim().min(1).max(80),
    path: z.string().trim().regex(/^\/(?!\/)[a-z0-9/_-]*$/, 'Parent page must be a local path'),
  }).optional(),
  title: z.string().min(1, 'Title is required'),
  shortDescription: z.string().min(1, 'Short description is required'),
  description: z.string().min(1, 'Description is required'),
  images: z.array(z.string()).optional().default([]),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional(),
  destination: z.object({
    city: z.string().min(1),
    country: z.string().min(1),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
  }),
  duration: z.string().min(1),
  languages: z.array(z.string()).optional().default(['English']),
  priceFrom: z.number().positive(),
  currency: z.string().min(1),
  pricingOptions: z.array(z.object({
    id: z.string().trim().min(1, 'Pricing option ID is required'),
    name: z.string().trim().min(1, 'Pricing option name is required'),
    description: z.string().optional().default(''),
    price: z.number().finite().positive('Adult price must be greater than zero'),
    childPrice: z.number().finite().min(0, 'Child price cannot be negative').optional(),
    infantPrice: z.number().finite().min(0, 'Infant price cannot be negative').optional(),
    discountPercentage: z.number().finite().min(0).max(99.99, 'Discount must be below 100%').optional(),
    timeSlots: z.array(z.object({
      id: z.string().trim().min(1, 'Time-slot ID is required'),
      label: z.string().trim().min(1, 'Time-slot label is required'),
      startTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must use 24-hour HH:mm format'),
      endTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'End time must use 24-hour HH:mm format'),
      adultPrice: z.number().finite().min(0, 'Adult slot price cannot be negative').optional(),
      childPrice: z.number().finite().min(0, 'Child slot price cannot be negative').optional(),
      infantPrice: z.number().finite().min(0, 'Infant slot price cannot be negative').optional(),
    })).max(48, 'A pricing option cannot contain more than 48 time slots').superRefine((slots, ctx) => {
      const ids = new Set<string>();
      const starts = new Set<string>();
      slots.forEach((slot, index) => {
        if (ids.has(slot.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'id'], message: 'Time-slot IDs must be unique within an option' });
        if (starts.has(slot.startTime)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'startTime'], message: 'Start times must be unique within an option' });
        if (slot.endTime <= slot.startTime) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'endTime'], message: 'End time must be after start time' });
        ids.add(slot.id);
        starts.add(slot.startTime);
      });
    }).optional().default([]),
    originalPrice: z.number().positive().optional(),
  })).min(1),
  entryWindows: z.array(z.object({
    label: z.string().min(1),
    startTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must use 24-hour HH:mm format'),
    endTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must use 24-hour HH:mm format'),
    price: z.number().positive().optional(),
  })).optional().default([]),
  highlights: z.array(z.string()).optional().default([]),
  inclusions: z.array(z.string()).optional().default([]),
  exclusions: z.array(z.string()).optional().default([]),
  meetingPoint: z.object({
    address: z.string().optional().default(''),
    instructions: z.string().optional().default(''),
    mapUrl: z.string().optional().default(''),
  }).optional(),
  cancellationPolicy: z.string().optional().default('Free cancellation up to 24 hours before'),
  instantConfirmation: z.boolean().optional().default(true),
  mobileTicket: z.boolean().optional().default(true),
  badges: z.array(z.enum(['bestseller', 'free-cancellation', 'skip-line', 'instant-confirm'])).optional().default([]),
  availability: z.object({
    type: z.enum(['time-slots', 'date-only', 'flexible']),
    advanceBooking: z.number().int().positive(),
  }).optional().default({ type: 'time-slots', advanceBooking: 30 }),
  seo: z.object({
    metaTitle: z.string().optional().default(''),
    metaDescription: z.string().optional().default(''),
    keywords: z.array(z.string()).optional(),
  }).optional(),
  itinerary: z.array(z.object({
    time: z.string(),
    duration: z.string(),
    title: z.string(),
    description: z.string().optional().default(''),
  })).optional().default([]),
  whatToBring: z.array(z.string()).optional().default([]),
  accessibility: z.array(z.string()).optional().default([]),
  gettingThere: z.array(z.object({
    mode: z.string(),
    description: z.string(),
  })).optional().default([]),
  tenantIds: z.array(z.string()).optional().default([]),
  addons: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional().default(''),
    price: z.number().min(0),
  })).optional().default([]),
  status: z.enum(['active', 'draft', 'archived']).optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

// A draft is work in progress: the author may save at any stage with nothing
// but a title (client request, ATN row 109). `.partial()` alone is not enough —
// it only makes TOP-LEVEL keys optional, so a submitted-but-blank
// `destination.city` and an empty `pricingOptions` array still failed and the
// save was rejected with an unnamed "Invalid input" (ATN rows 81 / 114).
// These overrides relax the nested publish constraints; the publish schema
// keeps enforcing the full contract, and any pricing option the author DID
// supply is still validated in full so bad money data can never reach a draft.
const draftRelaxedFields = {
  destination: z.object({
    city: z.string().optional().default(''),
    country: z.string().optional().default(''),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),
  }).optional(),
  pricingOptions: z.array(createAttractionSchema.shape.pricingOptions.element).optional(),
  priceFrom: z.number().nonnegative().optional(),
  duration: z.string().optional(),
  category: z.string().optional(),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  currency: z.string().optional(),
};

export const createAttractionDraftSchema = createAttractionSchema.partial().extend({
  slug: z.string().trim().min(1, 'Slug is required'),
  title: z.string().trim().min(1, 'Title is required'),
  tenantIds: z.array(z.string()).optional().default([]),
  status: z.literal('draft'),
  ...draftRelaxedFields,
});

// Editing an existing draft hits PATCH, which used the same shallow
// `.partial()` — so the SECOND save of a draft failed exactly like the first
// one did. The draft branch has to be relaxed on both verbs.
export const updateAttractionDraftSchema = createAttractionSchema.partial().extend({
  status: z.literal('draft'),
  ...draftRelaxedFields,
});

export const createAttractionRequestSchema = z.union([
  createAttractionDraftSchema,
  createAttractionSchema,
]);

export const updateAttractionSchema = createAttractionSchema.partial();

export const updateAttractionRequestSchema = z.union([
  updateAttractionDraftSchema,
  updateAttractionSchema,
]);

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId');
const specialOfferFields = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().default(''),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().finite().positive().max(10_000_000),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date(),
  usageLimit: z.number().int().positive().max(1_000_000).optional().default(100),
  isActive: z.boolean().optional().default(true),
});

const validateSpecialOfferDates = (
  value: { validFrom?: Date; validUntil?: Date; discountType?: 'percentage' | 'fixed'; discountValue?: number },
  ctx: z.RefinementCtx
) => {
  if (value.validFrom && value.validUntil && value.validUntil <= value.validFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validUntil'], message: 'Valid until must be after valid from' });
  }
  if (value.discountType === 'percentage' && value.discountValue !== undefined && value.discountValue > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'Percentage discount cannot exceed 100' });
  }
};

export const createSpecialOfferSchema = specialOfferFields
  .extend({ attractionId: objectIdSchema })
  .superRefine(validateSpecialOfferDates);

export const createSpecialOffersBulkSchema = specialOfferFields
  .extend({ attractionIds: z.array(objectIdSchema).min(1).max(100) })
  .superRefine((value, ctx) => {
    validateSpecialOfferDates(value, ctx);
    if (new Set(value.attractionIds).size !== value.attractionIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['attractionIds'], message: 'Tour selections must be unique' });
    }
  });

export const updateSpecialOfferSchema = specialOfferFields.partial().superRefine(validateSpecialOfferDates);

// Booking Validators
const isoDateSchema = z.string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Date must be a valid calendar date');

const timeSchema = z.string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must use 24-hour HH:mm format');

const quantitiesSchema = z.object({
  adults: z.number().int().min(0).max(50),
  children: z.number().int().min(0).max(50),
  infants: z.number().int().min(0).max(50).optional().default(0),
}).refine(
  ({ adults, children }) => adults + children > 0,
  { message: 'At least one adult or child is required' }
).refine(
  ({ adults, children, infants }) => adults + children + infants <= 50,
  { message: 'A booking cannot contain more than 50 guests' }
);

export const createBookingSchema = z.object({
  attractionId: z.string()
    .trim()
    .regex(/^[a-f\d]{24}$/i, 'Attraction ID must be a valid MongoDB ObjectId'),
  tenantId: z.string()
    .trim()
    .regex(/^[a-f\d]{24}$/i, 'Tenant ID must be a valid MongoDB ObjectId')
    .optional(),
  items: z.array(z.object({
    optionId: z.string().trim().min(1).max(100),
    optionName: z.string().trim().max(200).optional(),
    date: isoDateSchema,
    time: timeSchema.optional(),
    category: z.enum(['foreigner', 'resident']).optional(),
    quantities: quantitiesSchema,
    unitPrice: z.number().finite().min(0).max(10_000_000).optional(),
    totalPrice: z.number().finite().min(0).max(100_000_000).optional(),
    addons: z.array(z.object({
      id: z.string().trim().min(1).max(100),
      name: z.string().trim().min(1).max(200),
      price: z.number().finite().min(0).max(10_000_000),
    })).max(20).optional().default([]),
    hotelPickup: z.object({
      hotelName: z.string().trim().min(1).max(200),
      roomNumber: z.string().trim().max(50).optional(),
      pickupTime: timeSchema.optional(),
    }).optional(),
  })).min(1).max(10),
  guestDetails: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    phone: z.string().trim().min(5).max(40),
    country: z.string().trim().min(1).max(100),
    specialRequests: z.string().trim().max(2000).optional(),
  }),
  promoCode: z.string().trim().min(1).max(64).optional(),
  paymentMethod: z.enum(['card', 'pay-later', 'cash']).optional().default('pay-later'),
});

// Category Validators
export const createCategorySchema = z.object({
  slug: z.string().min(1, 'Slug is required'),
  name: z.string().min(1, 'Name is required'),
  icon: z.string().min(1, 'Icon is required'),
  description: z.string().optional(),
  parentId: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

// Destination Validators
export const createDestinationSchema = z.object({
  slug: z.string().min(1, 'Slug is required'),
  name: z.string().min(1, 'Name is required'),
  country: z.string().min(1, 'Country is required'),
  continent: z.string().min(1, 'Continent is required'),
  description: z.string().min(1, 'Description is required'),
  shortDescription: z.string().min(1, 'Short description is required'),
  images: z.array(z.string().url()).min(1),
  heroImage: z.string().url(),
  highlights: z.array(z.string()),
  bestTimeToVisit: z.string(),
  timezone: z.string(),
  language: z.string(),
  coordinates: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  tags: z.array(z.string()),
});

export const updateDestinationSchema = createDestinationSchema.partial();

// Tenant Validators
export const createTenantSchema = z.object({
  slug: z.string().min(1, 'Slug is required'),
  name: z.string().min(1, 'Name is required'),
  domain: z.string().min(1, 'Domain is required'),
  logo: z.string().url(),
  heroImages: z.array(z.string().url()).optional(),
  theme: z.object({
    primaryColor: z.string(),
    secondaryColor: z.string(),
    accentColor: z.string(),
  }),
  defaultCurrency: z.string().min(1),
  defaultLanguage: z.string().min(1),
  supportedLanguages: z.array(z.string()),
});

export const updateTenantSchema = createTenantSchema.partial();

// Query Validators
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().optional(),
});

export const attractionFiltersSchema = z.object({
  category: z.string().optional(),
  destination: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  rating: z.coerce.number().optional(),
  badges: z.string().optional(), // comma-separated
  search: z.string().optional(),
  status: z.enum(['active', 'draft', 'archived']).optional(),
  lifecycle: z.enum(['archive', 'trash']).optional(),
  /** Admin surfaces send scope=admin so a silently expired session 401s instead of degrading to the public catalog. */
  scope: z.enum(['admin']).optional(),
});

// Payment Validators
export const createPaymentIntentSchema = z.object({
  bookingId: z.string().min(1, 'Booking ID is required'),
  guestEmail: z.string().email().optional(),
  guestAccessToken: z.string().min(32).max(128).optional(),
});

export const generateAiImageJobSchema = z.object({
  prompt: z.string().trim().min(10, 'Prompt must be at least 10 characters').max(1200),
  size: z.enum(['1024x1024', '1024x1536', '1536x1024', 'auto']).default('1536x1024'),
  quality: z.enum(['low', 'medium', 'high', 'auto']).default('high'),
  folder: z.string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9/_-]*$/, 'Invalid image folder')
    .refine((folder) => !folder.includes('..'), 'Invalid image folder')
    .default('ai-generated'),
});

export const imageGenerationJobParamsSchema = z.object({
  jobId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid image generation job id'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAttractionInput = z.infer<typeof createAttractionSchema>;
export type UpdateAttractionInput = z.infer<typeof updateAttractionSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateDestinationInput = z.infer<typeof createDestinationSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
