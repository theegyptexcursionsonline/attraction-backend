import { z } from 'zod';
import { paginationSchema, regexSearchSchema } from './validators';

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Use a valid calendar date');
const timestamp = z.union([calendarDay, z.string().datetime({ offset: true })]);
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');

export const adminBookingFiltersSchema = paginationSchema.merge(z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'refunded', 'incomplete']).optional(),
  startDate: timestamp.optional(),
  endDate: timestamp.optional(),
  purchaseFrom: calendarDay.optional(),
  purchaseTo: calendarDay.optional(),
  activityFrom: calendarDay.optional(),
  activityTo: calendarDay.optional(),
  productId: objectId.optional(),
  brandId: objectId.optional(),
  search: regexSearchSchema,
})).superRefine((value, ctx) => {
  for (const [from, to] of [
    ['purchaseFrom', 'purchaseTo'], ['activityFrom', 'activityTo'],
  ] as const) {
    if (value[from] && value[to] && value[from]! > value[to]!) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [to], message: 'End date must be on or after start date' });
    }
  }
  if (value.startDate && value.endDate && Date.parse(value.startDate) > Date.parse(value.endDate)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'End date must be on or after start date' });
  }
  if ((value.purchaseFrom || value.purchaseTo) && (value.startDate || value.endDate)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['purchaseFrom'], message: 'Use one purchase date range' });
  }
});

/** Add filters as intersections; a filter must never replace the caller's tenant scope. */
export function adminBookingFilterClauses(
  filters: Record<string, unknown>, role: string | undefined, scope: unknown[],
): Record<string, unknown>[] {
  const clauses: Record<string, unknown>[] = [];
  if (filters.productId) clauses.push({ attractionId: filters.productId });
  if (filters.brandId) {
    // Hidden reseller identities must not be discoverable by probing brand IDs.
    const permitted = role === 'super-admin' || scope.map(String).includes(String(filters.brandId));
    clauses.push(permitted ? { tenantId: filters.brandId } : { _id: { $in: [] } });
  }
  if (filters.purchaseFrom || filters.purchaseTo) {
    clauses.push({ createdAt: {
      ...(filters.purchaseFrom ? { $gte: new Date(`${filters.purchaseFrom}T00:00:00.000Z`) } : {}),
      ...(filters.purchaseTo ? { $lte: new Date(`${filters.purchaseTo}T23:59:59.999Z`) } : {}),
    } });
  }
  if (filters.activityFrom || filters.activityTo) {
    // Both bounds must match the same booked activity, not separate items.
    clauses.push({ items: { $elemMatch: { date: {
      ...(filters.activityFrom ? { $gte: filters.activityFrom } : {}),
      ...(filters.activityTo ? { $lte: filters.activityTo } : {}),
    } } } });
  }
  return clauses;
}
