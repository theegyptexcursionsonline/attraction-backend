import { z } from 'zod';

// A public contact link is one mailbox, never a mailto URL or email header.
export const supportEmailSchema = z.string()
  .refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Enter a valid support email')
  .transform(value => value.trim().toLowerCase())
  .pipe(z.union([z.literal(''), z.string().max(254).email('Enter a valid support email')]));

const existingContactFields = ['email', 'phone', 'whatsapp', 'address', 'supportHours'] as const;

export const tenantContactInfoSchema = z.object({
  // Keep the existing fields' model casting/validation unchanged.
  email: z.unknown().optional(),
  phone: z.unknown().optional(),
  whatsapp: z.unknown().optional(),
  address: z.unknown().optional(),
  supportHours: z.unknown().optional(),
  supportEmail: supportEmailSchema.optional(),
});

/** Partial contact saves must not erase fields unknown to an older client. */
export function tenantContactInfoSetPaths(value: z.infer<typeof tenantContactInfoSchema>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value)
    .filter(([, field]) => field !== undefined)
    .map(([key, field]) => [`contactInfo.${key}`, field]));
}

/** Legacy raw records may predate validation; publish only configured contact fields. */
export function publicTenantContactInfo(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = Object.fromEntries(existingContactFields
    .filter(key => source[key] !== undefined)
    .map(key => [key, source[key]]));
  const support = supportEmailSchema.safeParse(source.supportEmail);
  if (support.success && support.data) result.supportEmail = support.data;
  return result;
}
