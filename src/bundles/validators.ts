import { z } from 'zod';
import { BUNDLE_STATUSES, SUPPLY_OFFER_STATUSES } from './domain';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
const currency = z.string().trim().length(3).transform((value) => value.toUpperCase());
const minor = z.number().int().nonnegative().safe();
const positiveMinor = z.number().int().positive().safe();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const dateTime = z.string().datetime({ offset: true });

export const guestPricesSchema = z.object({
  adult: minor,
  child: minor,
  infant: minor,
}).refine((value) => value.adult + value.child + value.infant > 0, {
  message: 'At least one guest price must be greater than zero',
});

export const guestQuantitiesSchema = z.object({
  adults: z.number().int().nonnegative().max(50),
  children: z.number().int().nonnegative().max(50),
  infants: z.number().int().nonnegative().max(50),
}).refine((value) => value.adults + value.children + value.infants > 0, {
  message: 'At least one guest is required',
});

const supplyOfferFieldsSchema = z.object({
  supplierTenantId: objectId,
  attractionId: objectId,
  currency,
  supplierNetPricesMinor: guestPricesSchema,
  optionIds: z.array(z.string().trim().min(1).max(120)).min(1).max(30),
  entryWindowLabels: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  capacityPerDeparture: z.number().int().positive().max(10000),
  validTravelFrom: dateTime,
  validTravelTo: dateTime,
  salesStartsAt: dateTime.optional(),
  salesEndsAt: dateTime.optional(),
  blackoutDates: z.array(dateTime).max(366).default([]),
  leadTimeHours: z.number().int().nonnegative().max(8760),
  cancellationPolicy: z.string().trim().min(1).max(1000),
  termsVersion: z.string().trim().min(1).max(80),
});

export const createSupplyOfferSchema = supplyOfferFieldsSchema.superRefine((value, ctx) => {
  if (new Date(value.validTravelFrom) >= new Date(value.validTravelTo)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validTravelTo'], message: 'Travel end must follow travel start' });
  }
  if (value.salesStartsAt && value.salesEndsAt && new Date(value.salesStartsAt) >= new Date(value.salesEndsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['salesEndsAt'], message: 'Sales end must follow sales start' });
  }
});

export const updateSupplyOfferSchema = supplyOfferFieldsSchema
  .omit({ supplierTenantId: true, attractionId: true })
  .partial()
  .extend({ revision: z.number().int().nonnegative() })
  .superRefine((value, ctx) => {
    if (
      value.supplierNetPricesMinor &&
      value.supplierNetPricesMinor.adult +
        value.supplierNetPricesMinor.child +
        value.supplierNetPricesMinor.infant ===
        0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['supplierNetPricesMinor'],
        message: 'At least one guest price must be greater than zero',
      });
    }
  });

export const bundleCommandSchema = z.object({
  revision: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(500).optional(),
});

const bundleComponentSchema = z.object({
  componentId: z.string().trim().min(1).max(80),
  supplyOfferId: objectId,
  dayNumber: z.number().int().positive().max(14),
  startTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  sortOrder: z.number().int().nonnegative().max(20),
});

const bundlePoliciesSchema = z.object({
  cancellation: z.string().trim().min(1).max(1000),
  refund: z.string().trim().min(1).max(1000),
  substitution: z.string().trim().min(1).max(1000),
  promoStacking: z.literal(false).default(false),
});

const bundleFieldsSchema = z.object({
  storefrontTenantId: objectId,
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(2).max(160),
  shortDescription: z.string().trim().min(2).max(300),
  description: z.string().trim().min(2).max(5000),
  images: z.array(z.string().url()).max(12).default([]),
  area: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(120),
  currency,
  customerPricesMinor: guestPricesSchema,
  platformFeeReserveMinor: minor,
  taxReserveMinor: minor,
  components: z.array(bundleComponentSchema).min(3).max(4),
  policies: bundlePoliciesSchema,
});

const validateBundleComponents = (
  components: z.infer<typeof bundleComponentSchema>[],
  ctx: z.RefinementCtx
): void => {
  const unique = <T extends string | number>(values: T[], path: string, message: string) => {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['components'], message: `${path}: ${message}` });
    }
  };
  unique(components.map((item) => item.componentId), 'componentId', 'Every component identifier must be unique');
  unique(components.map((item) => item.supplyOfferId), 'supplyOfferId', 'Every supplier offer must be unique');
  unique(components.map((item) => item.sortOrder), 'sortOrder', 'Every itinerary position must be unique');
};

export const createBundleSchema = bundleFieldsSchema.superRefine((value, ctx) => {
  validateBundleComponents(value.components, ctx);
});

export const updateBundleSchema = bundleFieldsSchema
  .omit({ storefrontTenantId: true, slug: true, components: true })
  .partial()
  .extend({ revision: z.number().int().nonnegative() });

export const replaceBundleComponentsSchema = z.object({
  revision: z.number().int().nonnegative(),
  components: z.array(bundleComponentSchema).min(3).max(4),
}).superRefine((value, ctx) => validateBundleComponents(value.components, ctx));

export const createBundleQuoteSchema = z.object({
  storefrontTenantId: objectId,
  quantities: guestQuantitiesSchema,
  selections: z.array(z.object({
    componentId: z.string().trim().min(1).max(80),
    optionId: z.string().trim().min(1).max(120),
    date: isoDate,
    time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  })).min(3).max(4),
});

export const createBundleOrderSchema = z.object({
  quoteId: objectId,
  guestDetails: z.object({
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(320),
    phone: z.string().trim().min(5).max(40),
    country: z.string().trim().min(2).max(120),
    specialRequests: z.string().trim().max(1000).optional(),
  }),
});

export const createBundlePaymentIntentSchema = z.object({
  orderId: objectId,
});

export const confirmBundlePaymentSchema = z.object({
  orderId: objectId,
});

export const refundBundleOrderSchema = z.object({
  operationId: z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  amountMinor: positiveMinor,
  reason: z.string().trim().min(3).max(500),
});

export const bundleSettlementPaidSchema = z.object({
  operationId: z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/),
});

export const cancelBundleOrderSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const recoverBundleOrderSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const bundleIdParamsSchema = z.object({ id: objectId });
export const bundleReferenceParamsSchema = z.object({
  reference: z.string().trim().min(6).max(80).regex(/^[A-Za-z0-9-]+$/),
});
export const bundleComponentParamsSchema = z.object({
  id: objectId,
  componentId: z.string().trim().min(1).max(80),
});
export const supplyOfferTransitionParamsSchema = z.object({
  id: objectId,
  status: z.enum(SUPPLY_OFFER_STATUSES),
});
export const bundleTransitionParamsSchema = z.object({
  id: objectId,
  status: z.enum(BUNDLE_STATUSES),
});

const queryBoolean = z.preprocess((value) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}, z.boolean());

export const listBundlesQuerySchema = z.object({
  area: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminBundleListQuerySchema = z.object({
  tenantId: objectId.optional(),
  status: z.string().trim().max(40).optional(),
  cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const supplyOfferListQuerySchema = z.object({
  tenantId: objectId.optional(),
  allSuppliers: queryBoolean.optional(),
  status: z.string().trim().max(40).optional(),
  cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const bundleOrderListQuerySchema = z.object({
  tenantId: objectId.optional(),
  status: z.string().trim().max(60).optional(),
  cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
