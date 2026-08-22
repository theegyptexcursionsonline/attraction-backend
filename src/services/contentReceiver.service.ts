import { randomUUID } from 'node:crypto';
import mongoose, { ClientSession, Types } from 'mongoose';
import { env } from '../config';
import { BlogPost } from '../models/BlogPost';
import {
  ContentPublication,
  ContentPublicationResult,
  IContentPublication,
} from '../models/ContentPublication';
import { Tenant } from '../models/Tenant';
import {
  canonicalBlogUrl,
  ContentBlogPublishRequest,
  ContentLocaleSchema,
  ContentTenantIdSchema,
  contentPublishFingerprint,
} from '../utils/contentReceiverContract';
import { sanitizeRichText, sanitizeTranslations } from '../utils/sanitizeHtml';

const PUBLICATION_LEASE_MS = 30_000;

type IndexInfo = {
  key?: Record<string, number>;
  unique?: boolean;
};

export interface ResolvedContentTenant {
  _id: Types.ObjectId;
  slug: string;
  domain: string;
  customDomain?: string;
  domainMigrated?: boolean;
  customDomainStatus?: string;
  defaultLanguage: string;
  supportedLanguages: string[];
  status: string;
}

export class ContentReceiverError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = 'ContentReceiverError';
  }
}

function configuredTenantAllowlist(): Set<string> {
  const configured = env.contentEngineAllowedTenants;
  if (configured.length === 0) {
    throw new ContentReceiverError(
      'CONTENT_RECEIVER_DISABLED',
      'Content receiver tenant allowlist is not configured',
      503
    );
  }
  const allowed = new Set<string>();
  for (const entry of configured) {
    if (!ContentTenantIdSchema.safeParse(entry).success || allowed.has(entry)) {
      throw new ContentReceiverError(
        'CONTENT_RECEIVER_ALLOWLIST_INVALID',
        'Content receiver tenant allowlist is invalid',
        503
      );
    }
    allowed.add(entry);
  }
  return allowed;
}

export async function resolveContentTenant(tenantId: string): Promise<ResolvedContentTenant> {
  // The exact deployment allowlist is checked before any database audit or
  // mutation. Unknown tenants deliberately share a not-found response.
  if (!configuredTenantAllowlist().has(tenantId)) {
    throw new ContentReceiverError(
      'CONTENT_RECEIVER_TARGET_NOT_FOUND',
      'Content receiver target not found',
      404
    );
  }

  const tenant = await Tenant.findOne({ slug: tenantId, status: 'active' })
    .select(
      '_id slug domain customDomain domainMigrated customDomainStatus defaultLanguage supportedLanguages status'
    )
    .lean();
  if (!tenant) {
    throw new ContentReceiverError(
      'CONTENT_RECEIVER_TARGET_NOT_FOUND',
      'Content receiver target not found',
      404
    );
  }
  return tenant as unknown as ResolvedContentTenant;
}

export function assertTenantLocaleContract(
  tenant: ResolvedContentTenant,
  request: Pick<ContentBlogPublishRequest, 'defaultLocale' | 'translations'>
): void {
  const defaultLocale = tenant.defaultLanguage?.trim();
  const configuredLocales = tenant.supportedLanguages || [];
  const supported = new Set(configuredLocales);
  if (
    !defaultLocale ||
    !ContentLocaleSchema.safeParse(defaultLocale).success ||
    !supported.has(defaultLocale) ||
    supported.size !== configuredLocales.length ||
    request.defaultLocale !== defaultLocale ||
    Array.from(supported).some((locale) => !ContentLocaleSchema.safeParse(locale).success)
  ) {
    throw new ContentReceiverError(
      'CONTENT_RECEIVER_LOCALE_MISMATCH',
      'defaultLocale does not match the target tenant locale contract',
      422
    );
  }

  for (const locale of Object.keys(request.translations)) {
    if (locale === defaultLocale || !supported.has(locale)) {
      throw new ContentReceiverError(
        'CONTENT_RECEIVER_TRANSLATION_NOT_ALLOWED',
        'A translation locale is not enabled for the target tenant',
        422
      );
    }
  }
}

function hasExactIndex(
  indexes: IndexInfo[],
  expected: Record<string, number>,
  requireUnique: boolean
): boolean {
  const expectedEntries = Object.entries(expected);
  return indexes.some((index) => {
    const entries = Object.entries(index.key || {});
    return (
      (!requireUnique || index.unique === true) &&
      entries.length === expectedEntries.length &&
      expectedEntries.every(([key, order], position) => {
        const actual = entries[position];
        return actual?.[0] === key && actual?.[1] === order;
      })
    );
  });
}

export async function assertContentReceiverIndexesReady(): Promise<void> {
  let publicationIndexes: IndexInfo[];
  let blogIndexes: IndexInfo[];
  try {
    [publicationIndexes, blogIndexes] = await Promise.all([
      ContentPublication.collection.indexes() as Promise<IndexInfo[]>,
      BlogPost.collection.indexes() as Promise<IndexInfo[]>,
    ]);
  } catch {
    throw new ContentReceiverError(
      'CONTENT_RECEIVER_MIGRATION_REQUIRED',
      'Content receiver database migration is not ready',
      503
    );
  }

  if (
    !hasExactIndex(publicationIndexes, { idempotencyKey: 1 }, true) ||
    !hasExactIndex(blogIndexes, { tenantId: 1, slug: 1 }, true)
  ) {
    throw new ContentReceiverError(
      'CONTENT_RECEIVER_MIGRATION_REQUIRED',
      'Content receiver database migration is not ready',
      503
    );
  }
}

type PublicationClaim = {
  record: IContentPublication;
  replay?: ContentPublicationResult;
};

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: number }).code === 11000
  );
}

async function claimPublication(
  tenant: ResolvedContentTenant,
  request: ContentBlogPublishRequest,
  requestHash: string,
  now: Date
): Promise<PublicationClaim> {
  const leaseId = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + PUBLICATION_LEASE_MS);
  try {
    const record = await ContentPublication.create({
      scope: 'blog.publish',
      tenantRef: tenant._id,
      tenantId: tenant.slug,
      idempotencyKey: request.idempotencyKey,
      requestHash,
      slug: request.payload.slug,
      status: 'processing',
      leaseId,
      leaseExpiresAt,
      attempts: 1,
    });
    return { record };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }

  const existing = await ContentPublication.findOne({
    idempotencyKey: request.idempotencyKey,
  }).lean();
  if (!existing) {
    throw new ContentReceiverError(
      'CONTENT_RECEIVER_CLAIM_RACE',
      'Content publication claim is not yet readable; retry later',
      503
    );
  }
  if (
    String(existing.tenantRef) !== String(tenant._id) ||
    existing.tenantId !== tenant.slug ||
    existing.requestHash !== requestHash ||
    existing.slug !== request.payload.slug
  ) {
    throw new ContentReceiverError(
      'CONTENT_RECEIVER_IDEMPOTENCY_CONFLICT',
      'Idempotency-Key was already used for a different request',
      409
    );
  }
  if (existing.status === 'completed') {
    if (!existing.result?.id || !existing.result.slug || !existing.result.liveUrl) {
      throw new ContentReceiverError(
        'CONTENT_RECEIVER_RECEIPT_INVALID',
        'Completed content publication receipt is invalid',
        503
      );
    }
    return {
      record: existing as unknown as IContentPublication,
      replay: existing.result,
    };
  }

  const reclaimed = await ContentPublication.findOneAndUpdate(
    {
      _id: existing._id,
      requestHash,
      $or: [
        { status: 'failed_retryable' },
        { status: 'processing', leaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: { status: 'processing', leaseId, leaseExpiresAt },
      $inc: { attempts: 1 },
      $unset: { lastErrorCode: '', lastErrorMessage: '' },
    },
    { new: true }
  );
  if (!reclaimed) {
    throw new ContentReceiverError(
      'CONTENT_RECEIVER_REQUEST_IN_PROGRESS',
      'An identical content publication is already processing',
      409
    );
  }
  return { record: reclaimed };
}

async function markClaimRetryable(record: IContentPublication, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 500) : 'Content publication failed';
  try {
    await ContentPublication.updateOne(
      { _id: record._id, status: 'processing', leaseId: record.leaseId },
      {
        $set: {
          status: 'failed_retryable',
          leaseExpiresAt: new Date(),
          lastErrorCode:
            error instanceof ContentReceiverError ? error.code : 'CONTENT_RECEIVER_WRITE_FAILED',
          lastErrorMessage: message,
        },
      }
    );
  } catch {
    // Preserve the original error. A still-processing record can be reclaimed
    // after its lease expires even when this best-effort failure note cannot land.
  }
}

export interface PublishBlogContentResult {
  result: ContentPublicationResult;
  replayed: boolean;
}

export async function publishBlogContent(
  tenant: ResolvedContentTenant,
  request: ContentBlogPublishRequest,
  now = new Date()
): Promise<PublishBlogContentResult> {
  assertTenantLocaleContract(tenant, request);
  let liveUrl: string;
  try {
    liveUrl = canonicalBlogUrl(tenant, request.payload.slug);
  } catch {
    throw new ContentReceiverError(
      'CONTENT_RECEIVER_CANONICAL_URL_INVALID',
      'Target tenant does not have a valid canonical HTTPS domain',
      422
    );
  }
  await assertContentReceiverIndexesReady();

  const requestHash = contentPublishFingerprint({
    type: 'blog',
    tenantId: request.tenantId,
    defaultLocale: request.defaultLocale,
    payload: request.payload,
    translations: request.translations,
  });
  const claim = await claimPublication(tenant, request, requestHash, now);
  if (claim.replay) return { result: claim.replay, replayed: true };

  let session: ClientSession | undefined;
  let result: ContentPublicationResult | undefined;
  try {
    const activeSession = await mongoose.startSession();
    session = activeSession;
    await activeSession.withTransaction(
      async () => {
        const payload = request.payload;
        const saved = await BlogPost.findOneAndUpdate(
          {
            tenantId: tenant.slug,
            slug: payload.slug,
            $or: [{ tenantRef: tenant._id }, { tenantRef: { $exists: false } }],
          },
          {
            $set: {
              tenantId: tenant.slug,
              tenantRef: tenant._id,
              defaultLocale: request.defaultLocale,
              slug: payload.slug,
              title: payload.title,
              excerpt: payload.excerpt,
              content: sanitizeRichText(payload.content),
              featuredImage: payload.featuredImage,
              category: payload.category,
              tags: payload.tags,
              author: payload.author || 'Editorial Team',
              metaTitle: payload.metaTitle,
              metaDescription: payload.metaDescription,
              readTime: payload.readTime,
              status: 'published',
              featured: payload.featured,
              publishedAt: now,
              translations: sanitizeTranslations(request.translations),
              faqs: payload.faqs,
              lastContentPublicationId: claim.record._id,
            },
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
            runValidators: true,
            session: activeSession,
          }
        );
        if (!saved) throw new Error('CONTENT_RECEIVER_BLOG_UPSERT_EMPTY');

        result = { id: String(saved._id), slug: saved.slug, liveUrl };
        const completed = await ContentPublication.updateOne(
          {
            _id: claim.record._id,
            status: 'processing',
            leaseId: claim.record.leaseId,
          },
          {
            $set: { status: 'completed', result },
            $unset: { lastErrorCode: '', lastErrorMessage: '' },
          },
          { session: activeSession }
        );
        if (completed.modifiedCount !== 1) {
          throw new Error('CONTENT_RECEIVER_RECEIPT_COMPLETION_CONFLICT');
        }
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      }
    );
    if (!result) throw new Error('CONTENT_RECEIVER_TRANSACTION_RETURNED_NO_RESULT');
    return { result, replayed: false };
  } catch (error) {
    await markClaimRetryable(claim.record, error);
    if (isDuplicateKey(error)) {
      throw new ContentReceiverError(
        'CONTENT_RECEIVER_TENANT_CONTENT_CONFLICT',
        'Tenant content ownership conflicts with an existing record',
        409
      );
    }
    if (error instanceof ContentReceiverError) throw error;
    throw new ContentReceiverError(
      'CONTENT_RECEIVER_WRITE_FAILED',
      'Content publication failed safely and may be retried',
      503
    );
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch {
        // Ending a local session must not turn a committed publication into an
        // apparent failure. A replay still reads the completed receipt.
      }
    }
  }
}

export async function findBlogContentForTenant(
  tenant: ResolvedContentTenant,
  slug: string
): Promise<Record<string, unknown> | null> {
  return BlogPost.findOne({
    tenantId: tenant.slug,
    slug,
    $or: [{ tenantRef: tenant._id }, { tenantRef: { $exists: false } }],
  })
    .select('slug title status defaultLocale updatedAt')
    .lean() as unknown as Promise<Record<string, unknown> | null>;
}
