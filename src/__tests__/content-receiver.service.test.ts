import mongoose, { Types } from 'mongoose';
import { env } from '../config';
import { BlogPost } from '../models/BlogPost';
import { ContentPublication } from '../models/ContentPublication';
import { Tenant } from '../models/Tenant';
import {
  assertContentReceiverIndexesReady,
  assertTenantLocaleContract,
  ContentReceiverError,
  findBlogContentForTenant,
  publishBlogContent,
  ResolvedContentTenant,
  resolveContentTenant,
} from '../services/contentReceiver.service';
import { ContentBlogPublishRequestSchema } from '../utils/contentReceiverContract';

jest.mock('../models/BlogPost', () => ({
  BlogPost: {
    collection: { indexes: jest.fn() },
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

jest.mock('../models/ContentPublication', () => ({
  ContentPublication: {
    collection: { indexes: jest.fn() },
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
}));

jest.mock('../models/Tenant', () => ({
  Tenant: { findOne: jest.fn() },
}));

const TENANT_ID = new Types.ObjectId('64b000000000000000000001');
const RECEIPT_ID = new Types.ObjectId('64b000000000000000000002');
const NOW = new Date('2026-08-22T12:00:00.000Z');
const tenant: ResolvedContentTenant = {
  _id: TENANT_ID,
  slug: 'tenant-a',
  domain: 'tenant-a.foxesnetwork.com',
  defaultLanguage: 'en',
  supportedLanguages: ['en', 'de'],
  status: 'active',
};
const request = ContentBlogPublishRequestSchema.parse({
  tenantId: 'tenant-a',
  defaultLocale: 'en',
  idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
  payload: {
    title: 'A valid editorial title',
    slug: 'valid-editorial-title',
    excerpt: 'A sufficiently detailed excerpt.',
    content:
      '<p>This editorial content is safely longer than fifty characters for validation.</p><script>alert(1)</script>',
    status: 'published',
    tags: ['travel'],
    faqs: [{ question: 'Is it safe?', answer: 'Yes.' }],
  },
  translations: {
    de: {
      title: 'Ein gültiger redaktioneller Titel',
      content: '<p>Ein sicherer übersetzter Inhalt.</p><script>alert(2)</script>',
    },
  },
});

const uniqueIndexes = () => {
  (ContentPublication.collection.indexes as jest.Mock).mockResolvedValue([
    { key: { _id: 1 }, name: '_id_' },
    { key: { idempotencyKey: 1 }, unique: true, name: 'idempotencyKey_1' },
  ]);
  (BlogPost.collection.indexes as jest.Mock).mockResolvedValue([
    { key: { _id: 1 }, name: '_id_' },
    { key: { tenantId: 1, slug: 1 }, unique: true, name: 'tenantId_1_slug_1' },
  ]);
};

describe('content receiver service', () => {
  const originalAllowlist = env.contentEngineAllowedTenants;
  const startSession = jest.spyOn(mongoose, 'startSession');
  let session: {
    withTransaction: jest.Mock;
    endSession: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    env.contentEngineAllowedTenants = ['tenant-a'];
    uniqueIndexes();

    session = {
      withTransaction: jest.fn(async (work: () => Promise<void>) => work()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    startSession.mockResolvedValue(session as never);

    (ContentPublication.create as jest.Mock).mockImplementation(async (input) => ({
      _id: RECEIPT_ID,
      ...input,
    }));
    (ContentPublication.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
    (BlogPost.findOneAndUpdate as jest.Mock).mockResolvedValue({
      _id: new Types.ObjectId('64b000000000000000000003'),
      slug: request.payload.slug,
    });
  });

  afterAll(() => {
    env.contentEngineAllowedTenants = originalAllowlist;
    startSession.mockRestore();
  });

  it('fails closed before a database lookup when the allowlist is missing or malformed', async () => {
    env.contentEngineAllowedTenants = [];
    await expect(resolveContentTenant('tenant-a')).rejects.toMatchObject({
      code: 'CONTENT_RECEIVER_DISABLED',
      statusCode: 503,
    });
    env.contentEngineAllowedTenants = ['Tenant-A'];
    await expect(resolveContentTenant('tenant-a')).rejects.toMatchObject({
      code: 'CONTENT_RECEIVER_ALLOWLIST_INVALID',
      statusCode: 503,
    });
    expect(Tenant.findOne).not.toHaveBeenCalled();
  });

  it('does not query or write for an unallowlisted tenant', async () => {
    await expect(resolveContentTenant('tenant-b')).rejects.toMatchObject({
      code: 'CONTENT_RECEIVER_TARGET_NOT_FOUND',
      statusCode: 404,
    });
    expect(Tenant.findOne).not.toHaveBeenCalled();
    expect(ContentPublication.create).not.toHaveBeenCalled();
    expect(BlogPost.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('joins an allowlisted slug to an exact active tenant in the database query', async () => {
    const lean = jest.fn().mockResolvedValue(tenant);
    const select = jest.fn().mockReturnValue({ lean });
    (Tenant.findOne as jest.Mock).mockReturnValue({ select });
    await expect(resolveContentTenant('tenant-a')).resolves.toEqual(tenant);
    expect(Tenant.findOne).toHaveBeenCalledWith({ slug: 'tenant-a', status: 'active' });
  });

  it('returns the same not-found result for an absent or inactive allowed tenant', async () => {
    const lean = jest.fn().mockResolvedValue(null);
    (Tenant.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ lean }),
    });
    await expect(resolveContentTenant('tenant-a')).rejects.toMatchObject({
      code: 'CONTENT_RECEIVER_TARGET_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('enforces exact default and non-default translation locales', () => {
    expect(() => assertTenantLocaleContract(tenant, request)).not.toThrow();
    expect(() =>
      assertTenantLocaleContract(tenant, { ...request, defaultLocale: 'de' })
    ).toThrow(ContentReceiverError);
    expect(() =>
      assertTenantLocaleContract(
        { ...tenant, supportedLanguages: ['de'] },
        request
      )
    ).toThrow('defaultLocale');
    expect(() =>
      assertTenantLocaleContract(tenant, {
        ...request,
        translations: { en: request.translations.de },
      })
    ).toThrow('translation locale');
    expect(() =>
      assertTenantLocaleContract(tenant, {
        ...request,
        translations: { fr: request.translations.de },
      })
    ).toThrow('translation locale');
  });

  it('fails closed unless both exact unique indexes exist', async () => {
    await expect(assertContentReceiverIndexesReady()).resolves.toBeUndefined();
    (ContentPublication.collection.indexes as jest.Mock).mockResolvedValue([
      { key: { idempotencyKey: 1 }, unique: false },
    ]);
    await expect(assertContentReceiverIndexesReady()).rejects.toMatchObject({
      code: 'CONTENT_RECEIVER_MIGRATION_REQUIRED',
      statusCode: 503,
    });
  });

  it('claims before effects and commits the tenant-scoped upsert with its receipt', async () => {
    const published = await publishBlogContent(tenant, request, NOW);
    expect(published).toEqual({
      replayed: false,
      result: {
        id: '64b000000000000000000003',
        slug: request.payload.slug,
        liveUrl: `https://tenant-a.foxesnetwork.com/blog/${request.payload.slug}`,
      },
    });
    expect(ContentPublication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'blog.publish',
        tenantRef: TENANT_ID,
        tenantId: 'tenant-a',
        idempotencyKey: request.idempotencyKey,
        slug: request.payload.slug,
        status: 'processing',
      })
    );
    expect((ContentPublication.create as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (BlogPost.findOneAndUpdate as jest.Mock).mock.invocationCallOrder[0]
    );
    expect(BlogPost.findOneAndUpdate).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-a',
        slug: request.payload.slug,
        $or: [{ tenantRef: TENANT_ID }, { tenantRef: { $exists: false } }],
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          tenantId: 'tenant-a',
          tenantRef: TENANT_ID,
          defaultLocale: 'en',
          status: 'published',
          lastContentPublicationId: RECEIPT_ID,
        }),
      }),
      expect.objectContaining({ session, upsert: true, runValidators: true })
    );
    const blogUpdate = (BlogPost.findOneAndUpdate as jest.Mock).mock.calls[0][1].$set;
    expect(blogUpdate.content).not.toContain('<script');
    expect(blogUpdate.translations.de.content).not.toContain('<script');
    expect(ContentPublication.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: RECEIPT_ID,
        status: 'processing',
        leaseId: expect.any(String),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'completed', result: published.result }),
      }),
      { session }
    );
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('replays the exact completed result without starting a transaction or touching content', async () => {
    (ContentPublication.create as jest.Mock).mockRejectedValue({ code: 11000 });
    (ContentPublication.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: RECEIPT_ID,
        scope: 'blog.publish',
        tenantRef: TENANT_ID,
        tenantId: 'tenant-a',
        idempotencyKey: request.idempotencyKey,
        requestHash: expect.any(String),
        slug: request.payload.slug,
        status: 'completed',
        result: {
          id: 'post-id',
          slug: request.payload.slug,
          liveUrl: `https://tenant-a.foxesnetwork.com/blog/${request.payload.slug}`,
        },
      }),
    });
    // Replace the matcher placeholder with the fingerprint from the first claim.
    (ContentPublication.create as jest.Mock).mockImplementationOnce(async (input) => {
      (ContentPublication.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: RECEIPT_ID,
          tenantRef: TENANT_ID,
          tenantId: 'tenant-a',
          requestHash: input.requestHash,
          slug: request.payload.slug,
          status: 'completed',
          result: {
            id: 'post-id',
            slug: request.payload.slug,
            liveUrl: `https://tenant-a.foxesnetwork.com/blog/${request.payload.slug}`,
          },
        }),
      });
      throw { code: 11000 };
    });
    await expect(publishBlogContent(tenant, request, NOW)).resolves.toEqual({
      replayed: true,
      result: {
        id: 'post-id',
        slug: request.payload.slug,
        liveUrl: `https://tenant-a.foxesnetwork.com/blog/${request.payload.slug}`,
      },
    });
    expect(startSession).not.toHaveBeenCalled();
    expect(BlogPost.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects UUID reuse for a different request before content effects', async () => {
    (ContentPublication.create as jest.Mock).mockRejectedValue({ code: 11000 });
    (ContentPublication.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: RECEIPT_ID,
        tenantRef: TENANT_ID,
        tenantId: 'tenant-a',
        requestHash: 'different-request',
        slug: request.payload.slug,
        status: 'completed',
      }),
    });
    await expect(publishBlogContent(tenant, request, NOW)).rejects.toMatchObject({
      code: 'CONTENT_RECEIVER_IDEMPOTENCY_CONFLICT',
      statusCode: 409,
    });
    expect(startSession).not.toHaveBeenCalled();
    expect(BlogPost.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a concurrent active lease without duplicating the write', async () => {
    (ContentPublication.create as jest.Mock).mockImplementationOnce(async (input) => {
      (ContentPublication.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: RECEIPT_ID,
          tenantRef: TENANT_ID,
          tenantId: 'tenant-a',
          requestHash: input.requestHash,
          slug: request.payload.slug,
          status: 'processing',
          leaseExpiresAt: new Date(NOW.getTime() + 10_000),
        }),
      });
      throw { code: 11000 };
    });
    (ContentPublication.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
    await expect(publishBlogContent(tenant, request, NOW)).rejects.toMatchObject({
      code: 'CONTENT_RECEIVER_REQUEST_IN_PROGRESS',
      statusCode: 409,
    });
    expect(ContentPublication.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: RECEIPT_ID,
        $or: expect.arrayContaining([
          { status: 'processing', leaseExpiresAt: { $lte: NOW } },
        ]),
      }),
      expect.any(Object),
      { new: true }
    );
    expect(BlogPost.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('reclaims an expired lease and retries the same transaction safely', async () => {
    let requestHash = '';
    (ContentPublication.create as jest.Mock).mockImplementationOnce(async (input) => {
      requestHash = input.requestHash;
      (ContentPublication.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: RECEIPT_ID,
          tenantRef: TENANT_ID,
          tenantId: 'tenant-a',
          requestHash: input.requestHash,
          slug: request.payload.slug,
          status: 'processing',
          leaseExpiresAt: new Date(NOW.getTime() - 1),
        }),
      });
      throw { code: 11000 };
    });
    (ContentPublication.findOneAndUpdate as jest.Mock).mockImplementation(
      async (_filter, update) => ({
        _id: RECEIPT_ID,
        tenantRef: TENANT_ID,
        tenantId: 'tenant-a',
        requestHash,
        slug: request.payload.slug,
        status: 'processing',
        leaseId: update.$set.leaseId,
        leaseExpiresAt: update.$set.leaseExpiresAt,
      })
    );
    await expect(publishBlogContent(tenant, request, NOW)).resolves.toMatchObject({
      replayed: false,
    });
    expect(ContentPublication.findOneAndUpdate).toHaveBeenCalled();
    expect(BlogPost.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('marks a transaction failure retryable and never returns a false success', async () => {
    session.withTransaction.mockImplementation(async (work: () => Promise<void>) => {
      await work();
      throw new Error('simulated transaction abort');
    });
    await expect(publishBlogContent(tenant, request, NOW)).rejects.toMatchObject({
      code: 'CONTENT_RECEIVER_WRITE_FAILED',
      statusCode: 503,
    });
    expect(ContentPublication.updateOne).toHaveBeenLastCalledWith(
      expect.objectContaining({
        _id: RECEIPT_ID,
        status: 'processing',
        leaseId: expect.any(String),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'failed_retryable',
          lastErrorCode: 'CONTENT_RECEIVER_WRITE_FAILED',
        }),
      })
    );
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('marks the claim retryable when a database session cannot start', async () => {
    startSession.mockRejectedValueOnce(new Error('sessions unavailable'));
    await expect(publishBlogContent(tenant, request, NOW)).rejects.toMatchObject({
      code: 'CONTENT_RECEIVER_WRITE_FAILED',
      statusCode: 503,
    });
    expect(BlogPost.findOneAndUpdate).not.toHaveBeenCalled();
    expect(ContentPublication.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: RECEIPT_ID, status: 'processing' }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'failed_retryable' }),
      })
    );
    expect(session.endSession).not.toHaveBeenCalled();
  });

  it('fails before claiming when locale, canonical URL, or migration readiness is invalid', async () => {
    await expect(
      publishBlogContent(tenant, { ...request, defaultLocale: 'de' }, NOW)
    ).rejects.toMatchObject({ code: 'CONTENT_RECEIVER_LOCALE_MISMATCH' });
    await expect(
      publishBlogContent({ ...tenant, domain: 'http://unsafe.example' }, request, NOW)
    ).rejects.toMatchObject({ code: 'CONTENT_RECEIVER_CANONICAL_URL_INVALID' });
    (ContentPublication.collection.indexes as jest.Mock).mockResolvedValue([]);
    await expect(publishBlogContent(tenant, request, NOW)).rejects.toMatchObject({
      code: 'CONTENT_RECEIVER_MIGRATION_REQUIRED',
    });
    expect(ContentPublication.create).not.toHaveBeenCalled();
    expect(BlogPost.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('scopes preflight queries to both the exact tenant slug and tenant join', async () => {
    const lean = jest.fn().mockResolvedValue(null);
    const select = jest.fn().mockReturnValue({ lean });
    (BlogPost.findOne as jest.Mock).mockReturnValue({ select });
    await expect(findBlogContentForTenant(tenant, 'shared-slug')).resolves.toBeNull();
    expect(BlogPost.findOne).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      slug: 'shared-slug',
      $or: [{ tenantRef: TENANT_ID }, { tenantRef: { $exists: false } }],
    });
  });
});
