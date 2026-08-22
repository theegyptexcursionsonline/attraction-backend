import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { env } from '../config';
import contentRouter from '../routes/content.routes';
import {
  assertContentReceiverIndexesReady,
  ContentReceiverError,
  findBlogContentForTenant,
  publishBlogContent,
  resolveContentTenant,
} from '../services/contentReceiver.service';

jest.mock('../services/contentReceiver.service', () => {
  const actual = jest.requireActual('../services/contentReceiver.service');
  return {
    ...actual,
    assertContentReceiverIndexesReady: jest.fn(),
    findBlogContentForTenant: jest.fn(),
    publishBlogContent: jest.fn(),
    resolveContentTenant: jest.fn(),
  };
});

const KEY = 'receiver-key';
const IDEMPOTENCY_KEY = '550e8400-e29b-41d4-a716-446655440000';
const tenant = {
  _id: new Types.ObjectId('64b000000000000000000001'),
  slug: 'tenant-a',
  domain: 'tenant-a.foxesnetwork.com',
  defaultLanguage: 'en',
  supportedLanguages: ['en', 'de'],
  status: 'active',
};
const body = {
  tenantId: 'tenant-a',
  defaultLocale: 'en',
  payload: {
    title: 'A valid editorial title',
    slug: 'valid-editorial-title',
    excerpt: 'A sufficiently detailed excerpt.',
    content: '<p>This editorial content is safely longer than fifty characters for validation.</p>',
    status: 'published',
  },
  translations: {},
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/content', contentRouter);
  return app;
};

const authenticated = () => ({ Authorization: `Bearer ${KEY}` });

describe('content receiver routes', () => {
  const originalKey = env.contentEngineApiKey;
  const originalAllowlist = env.contentEngineAllowedTenants;

  beforeEach(() => {
    jest.clearAllMocks();
    env.contentEngineApiKey = KEY;
    env.contentEngineAllowedTenants = ['tenant-a'];
    (assertContentReceiverIndexesReady as jest.Mock).mockResolvedValue(undefined);
    (resolveContentTenant as jest.Mock).mockResolvedValue(tenant);
  });

  afterAll(() => {
    env.contentEngineApiKey = originalKey;
    env.contentEngineAllowedTenants = originalAllowlist;
  });

  it('authenticates before validation, tenant lookup, or mutation', async () => {
    const response = await request(buildApp())
      .post('/api/admin/content/blog')
      .set('Idempotency-Key', IDEMPOTENCY_KEY)
      .send(body);
    expect(response.status).toBe(401);
    expect(resolveContentTenant).not.toHaveBeenCalled();
    expect(publishBlogContent).not.toHaveBeenCalled();
  });

  it('rejects a missing UUID before tenant lookup', async () => {
    const response = await request(buildApp())
      .post('/api/admin/content/blog')
      .set(authenticated())
      .send(body);
    expect(response.status).toBe(400);
    expect(resolveContentTenant).not.toHaveBeenCalled();
  });

  it('publishes a validated request and uses the header UUID as authority', async () => {
    (publishBlogContent as jest.Mock).mockResolvedValue({
      replayed: false,
      result: {
        id: 'post-id',
        slug: 'valid-editorial-title',
        liveUrl: 'https://tenant-a.foxesnetwork.com/blog/valid-editorial-title',
      },
    });
    const response = await request(buildApp())
      .post('/api/admin/content/blog')
      .set({ ...authenticated(), 'Idempotency-Key': IDEMPOTENCY_KEY })
      .send({ ...body, idempotencyKey: 'body-cannot-override-header' });
    expect(response.status).toBe(201);
    expect(resolveContentTenant).toHaveBeenCalledWith('tenant-a');
    expect(publishBlogContent).toHaveBeenCalledWith(
      tenant,
      expect.objectContaining({ idempotencyKey: IDEMPOTENCY_KEY })
    );
    expect(response.body.liveUrl).toMatch(/^https:\/\//);
  });

  it('returns the original completed result for a replay', async () => {
    (publishBlogContent as jest.Mock).mockResolvedValue({
      replayed: true,
      result: {
        id: 'post-id',
        slug: 'valid-editorial-title',
        liveUrl: 'https://tenant-a.foxesnetwork.com/blog/valid-editorial-title',
      },
    });
    const response = await request(buildApp())
      .post('/api/admin/content/blog')
      .set({ ...authenticated(), 'Idempotency-Key': IDEMPOTENCY_KEY })
      .send(body);
    expect(response.status).toBe(200);
    expect(response.headers['idempotency-replayed']).toBe('true');
  });

  it('fails an unallowlisted tenant before the publication service', async () => {
    (resolveContentTenant as jest.Mock).mockRejectedValue(
      new ContentReceiverError(
        'CONTENT_RECEIVER_TARGET_NOT_FOUND',
        'Content receiver target not found',
        404
      )
    );
    const response = await request(buildApp())
      .post('/api/admin/content/blog')
      .set({ ...authenticated(), 'Idempotency-Key': IDEMPOTENCY_KEY })
      .send(body);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('CONTENT_RECEIVER_TARGET_NOT_FOUND');
    expect(publishBlogContent).not.toHaveBeenCalled();
  });

  it('returns Retry-After for a concurrent identical request', async () => {
    (publishBlogContent as jest.Mock).mockRejectedValue(
      new ContentReceiverError(
        'CONTENT_RECEIVER_REQUEST_IN_PROGRESS',
        'An identical content publication is already processing',
        409
      )
    );
    const response = await request(buildApp())
      .post('/api/admin/content/blog')
      .set({ ...authenticated(), 'Idempotency-Key': IDEMPOTENCY_KEY })
      .send(body);
    expect(response.status).toBe(409);
    expect(response.headers['retry-after']).toBe('2');
  });

  it('scopes the slug preflight through the resolved tenant', async () => {
    (findBlogContentForTenant as jest.Mock).mockResolvedValue({
      _id: 'post-id',
      slug: 'shared-slug',
      title: 'Tenant A post',
      status: 'published',
      defaultLocale: 'en',
    });
    const response = await request(buildApp())
      .get('/api/admin/content/blog/shared-slug?tenantId=tenant-a')
      .set(authenticated());
    expect(response.status).toBe(200);
    expect(resolveContentTenant).toHaveBeenCalledWith('tenant-a');
    expect(findBlogContentForTenant).toHaveBeenCalledWith(tenant, 'shared-slug');
  });

  it('returns 404 for an available tenant-scoped slug', async () => {
    (findBlogContentForTenant as jest.Mock).mockResolvedValue(null);
    const response = await request(buildApp())
      .get('/api/admin/content/blog/available-slug?tenantId=tenant-a')
      .set(authenticated());
    expect(response.status).toBe(404);
  });

  it.each(['tour', 'destination', 'category', 'unknown'])(
    'fails closed for unsupported %s capability',
    async (type) => {
      const response = await request(buildApp())
        .post(`/api/admin/content/${type}`)
        .set(authenticated())
        .send({});
      expect(response.status).toBe(422);
      expect(response.body.supportedTypes).toEqual(['blog']);
      expect(resolveContentTenant).not.toHaveBeenCalled();
      expect(publishBlogContent).not.toHaveBeenCalled();
    }
  );

  it('reports blog-only code truth and migration readiness', async () => {
    const response = await request(buildApp())
      .get('/api/admin/content/capabilities')
      .set(authenticated());
    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        supportedTypes: ['blog'],
        unsupportedTypes: ['tour', 'destination', 'category'],
        databaseMigrationReady: true,
        receiverConfigurationReady: true,
      })
    );
  });

  it('reports publication not ready when the guarded index migration is missing', async () => {
    (assertContentReceiverIndexesReady as jest.Mock).mockRejectedValue(new Error('missing'));
    const response = await request(buildApp())
      .get('/api/admin/content/capabilities')
      .set(authenticated());
    expect(response.status).toBe(200);
    expect(response.body.databaseMigrationReady).toBe(false);
    expect(response.body.receiverConfigurationReady).toBe(false);
  });

  it('does not report readiness for a malformed or duplicate tenant allowlist', async () => {
    env.contentEngineAllowedTenants = ['tenant-a', 'tenant-a'];
    const response = await request(buildApp())
      .get('/api/admin/content/capabilities')
      .set(authenticated());
    expect(response.status).toBe(200);
    expect(response.body.tenantAllowlistConfigured).toBe(true);
    expect(response.body.tenantAllowlistValid).toBe(false);
    expect(response.body.configuredTenantCount).toBe(0);
    expect(response.body.receiverConfigurationReady).toBe(false);
  });
});
