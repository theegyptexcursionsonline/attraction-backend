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
    id: z.string(),
    name: z.string(),
    description: z.string().optional().default(''),
    price: z.number().positive(),
    originalPrice: z.number().positive().optional(),
  })).min(1),
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

export const updateAttractionSchema = createAttractionSchema.partial();

// Booking Validators
export const createBookingSchema = z.object({
  attractionId: z.string().min(1, 'Attraction ID is required'),
  items: z.array(z.object({
    optionId: z.string(),
    optionName: z.string().optional(),
    date: z.string(),
    time: z.string().optional(),
    quantities: z.object({
      adults: z.number().int().min(0),
      children: z.number().int().min(0),
      infants: z.number().int().min(0).optional().default(0),
    }),
    unitPrice: z.number().optional(),
    totalPrice: z.number().optional(),
    addons: z.array(z.object({
      id: z.string(),
      name: z.string(),
      price: z.number(),
    })).optional().default([]),
  })).min(1),
  guestDetails: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    country: z.string().min(1),
    specialRequests: z.string().optional(),
  }),
  promoCode: z.string().optional(),
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
});

// Payment Validators
export const createPaymentIntentSchema = z.object({
  bookingId: z.string().min(1, 'Booking ID is required'),
  guestEmail: z.string().email().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAttractionInput = z.infer<typeof createAttractionSchema>;
export type UpdateAttractionInput = z.infer<typeof updateAttractionSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateDestinationInput = z.infer<typeof createDestinationSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
