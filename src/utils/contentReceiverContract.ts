import crypto from 'node:crypto';
import { z } from 'zod';

export const ContentTenantIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'tenantId must be an exact lowercase tenant slug');

export const ContentLocaleSchema = z
  .string()
  .min(2)
  .max(35)
  .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, 'invalid locale');

const FaqSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    answer: z.string().trim().min(1).max(4000),
  })
  .strict();

const HttpsUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === 'https:', 'URL must use HTTPS');

export const ContentSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const ContentBlogPayloadSchema = z
  .object({
    title: z.string().trim().min(5).max(200),
    slug: ContentSlugSchema,
    excerpt: z.string().trim().min(10).max(1000),
    content: z.string().min(50).max(500_000),
    featuredImage: HttpsUrlSchema.optional(),
    category: z.string().trim().min(1).max(100).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
    author: z.string().trim().min(1).max(120).optional(),
    metaTitle: z.string().trim().min(1).max(200).optional(),
    metaDescription: z.string().trim().min(1).max(500).optional(),
    readTime: z.number().int().min(1).max(240).optional(),
    status: z.literal('published'),
    featured: z.boolean().default(false),
    faqs: z.array(FaqSchema).max(10).default([]),
  })
  .strict();

export const ContentBlogTranslationSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    slug: ContentSlugSchema.optional(),
    excerpt: z.string().trim().min(1).max(1000).optional(),
    content: z.string().min(1).max(500_000).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
    metaTitle: z.string().trim().min(1).max(200).optional(),
    metaDescription: z.string().trim().min(1).max(500).optional(),
    faqs: z.array(FaqSchema).max(10).optional(),
  })
  .strict();

export const ContentBlogPublishRequestSchema = z
  .object({
    tenantId: ContentTenantIdSchema,
    defaultLocale: ContentLocaleSchema,
    payload: ContentBlogPayloadSchema,
    translations: z.record(ContentLocaleSchema, ContentBlogTranslationSchema).default({}),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export type ContentBlogPublishRequest = z.infer<typeof ContentBlogPublishRequestSchema>;

export interface ContentTenantCanonicalConfig {
  domain: string;
  customDomain?: string;
  domainMigrated?: boolean;
  customDomainStatus?: string;
}

function canonicalOrigin(value: string): string {
  const raw = value.trim();
  if (!raw || /[/?#@]/.test(raw)) {
    throw new Error('Tenant canonical domain is invalid');
  }
  const url = new URL(`https://${raw}`);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (url.port && url.port !== '443') ||
    !url.hostname.includes('.')
  ) {
    throw new Error('Tenant canonical domain is invalid');
  }
  return `https://${url.hostname}`;
}

export function canonicalBlogUrl(
  tenant: ContentTenantCanonicalConfig,
  slug: string
): string {
  const host =
    tenant.domainMigrated === true &&
    tenant.customDomainStatus === 'ready' &&
    tenant.customDomain
      ? tenant.customDomain
      : tenant.domain;
  const result = new URL(`/blog/${slug}`, `${canonicalOrigin(host)}/`).toString();
  const parsed = new URL(result);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.search
  ) {
    throw new Error('Canonical blog URL violates the receiver contract');
  }
  return result;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value instanceof Date ? value.toISOString() : value;
}

export function contentPublishFingerprint(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}
