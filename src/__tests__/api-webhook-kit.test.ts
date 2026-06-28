import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';

import { ApiKey } from '../models/ApiKey';
import { Tenant } from '../models/Tenant';
import { WebhookEndpoint } from '../models/WebhookEndpoint';
import { WebhookDelivery } from '../models/WebhookDelivery';
import { WebhookEvent } from '../models/WebhookEvent';

import { authenticateApiKey, requireScope } from '../middleware/apiKey.middleware';
import {
  buildSignatureHeader,
  verifySignatureHeader,
  runDeliveryWithRetry,
  emitEvent,
  recordInboundEvent,
} from '../services/webhook.service';
import { getWebhookEndpoint } from '../controllers/webhooks.controller';
import { hashToken, generateApiKey } from '../utils/hash';
import { AuthRequest } from '../types';

jest.mock('../models/ApiKey', () => ({ ApiKey: { findOne: jest.fn(), updateOne: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: { findOne: jest.fn(), findById: jest.fn() } }));
jest.mock('../models/WebhookEndpoint', () => ({ WebhookEndpoint: { find: jest.fn(), findById: jest.fn() } }));
jest.mock('../models/WebhookDelivery', () => ({ WebhookDelivery: { create: jest.fn() } }));
jest.mock('../models/WebhookEvent', () => ({ WebhookEvent: { create: jest.fn() } }));

const TENANT_A = new Types.ObjectId().toHexString();
const TENANT_B = new Types.ObjectId().toHexString();

// ---------------------------------------------------------------------------
// API key auth middleware (+ tenant isolation)
// ---------------------------------------------------------------------------
describe('API key authentication & tenant isolation', () => {
  const keyA = generateApiKey();
  const keyAReadOnly = generateApiKey();

  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.get('/whoami', authenticateApiKey, requireScope('read'), (req, res) => {
      const r = req as AuthRequest;
      res.json({ tenantId: String(r.tenant?._id), scopes: r.apiKey?.scopes });
    });
    app.post('/write', authenticateApiKey, requireScope('write'), (_req, res) => {
      res.json({ ok: true });
    });
    return app;
  };

  beforeEach(() => {
    (ApiKey.updateOne as jest.Mock).mockResolvedValue({});
    (ApiKey.findOne as jest.Mock).mockImplementation(async (q: { hashedKey: string }) => {
      if (q.hashedKey === hashToken(keyA)) {
        return { _id: new Types.ObjectId(), tenantId: TENANT_A, scopes: ['read', 'write'], revoked: false };
      }
      if (q.hashedKey === hashToken(keyAReadOnly)) {
        return { _id: new Types.ObjectId(), tenantId: TENANT_A, scopes: ['read'], revoked: false };
      }
      return null; // unknown / revoked
    });
    (Tenant.findOne as jest.Mock).mockImplementation(async (q: { _id: string }) => ({
      _id: q._id,
      status: 'active',
    }));
  });

  it('resolves the tenant from a valid key', async () => {
    const res = await request(buildApp()).get('/whoami').set('x-api-key', keyA);
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(TENANT_A);
    expect(res.body.scopes).toEqual(['read', 'write']);
  });

  it('accepts the key via Bearer token too', async () => {
    const res = await request(buildApp()).get('/whoami').set('Authorization', `Bearer ${keyA}`);
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(TENANT_A);
  });

  it('rejects a missing key with 401', async () => {
    const res = await request(buildApp()).get('/whoami');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid/revoked key with 401', async () => {
    const res = await request(buildApp()).get('/whoami').set('x-api-key', 'fxs_att_not-a-real-key');
    expect(res.status).toBe(401);
  });

  it('enforces scopes (read-only key cannot write)', async () => {
    const res = await request(buildApp()).post('/write').set('x-api-key', keyAReadOnly);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/scope/i);
  });

  it('NEGATIVE: a tenant-A key cannot be coerced to act on tenant B', async () => {
    // Attacker presents a valid tenant-A key but tries to override tenant via header.
    const res = await request(buildApp())
      .get('/whoami')
      .set('x-api-key', keyA)
      .set('x-tenant-id', TENANT_B);

    expect(res.status).toBe(200);
    // The middleware resolves the tenant from the KEY, never the header.
    expect(res.body.tenantId).toBe(TENANT_A);
    expect(res.body.tenantId).not.toBe(TENANT_B);
  });
});

// ---------------------------------------------------------------------------
// Webhook signing + delivery retry/backoff
// ---------------------------------------------------------------------------
describe('Webhook HMAC signing & verification', () => {
  it('produces a verifiable t=...,v1=... signature', () => {
    const secret = 'whsec_test';
    const body = JSON.stringify({ id: 'evt_1', type: 'ping' });
    const now = 1_700_000_000_000;
    const header = buildSignatureHeader(secret, body, now);
    expect(header).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(verifySignatureHeader(secret, body, header, 300, now)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const secret = 'whsec_test';
    const now = 1_700_000_000_000;
    const header = buildSignatureHeader(secret, '{"a":1}', now);
    expect(verifySignatureHeader(secret, '{"a":2}', header, 300, now)).toBe(false);
  });

  it('rejects a stale timestamp (replay)', () => {
    const secret = 'whsec_test';
    const body = '{"a":1}';
    const header = buildSignatureHeader(secret, body, 1_700_000_000_000);
    // verify 10 minutes later with a 5-minute tolerance
    expect(verifySignatureHeader(secret, body, header, 300, 1_700_000_600_000)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const body = '{"a":1}';
    const now = 1_700_000_000_000;
    const header = buildSignatureHeader('whsec_right', body, now);
    expect(verifySignatureHeader('whsec_wrong', body, header, 300, now)).toBe(false);
  });
});

describe('Webhook delivery retry & backoff', () => {
  const makeDelivery = () => ({
    _id: new Types.ObjectId(),
    eventId: 'evt_x',
    eventType: 'booking.created' as const,
    payload: { hello: 'world' },
    tenantId: TENANT_A,
    attempts: 0,
    status: 'pending' as const,
    save: jest.fn().mockResolvedValue(undefined),
  });
  const makeEndpoint = () => ({
    url: 'https://example.test/hook',
    secret: 'whsec_x',
    consecutiveFailures: 0,
    enabled: true,
    save: jest.fn().mockResolvedValue(undefined),
  });

  it('delivers on first success and signs the request', async () => {
    const delivery = makeDelivery();
    const endpoint = makeEndpoint();
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });

    const ok = await runDeliveryWithRetry(delivery as never, endpoint as never, {
      fetchImpl: fetchImpl as never,
      sleep: async () => {},
    });

    expect(ok).toBe(true);
    expect(delivery.status).toBe('success');
    expect(delivery.attempts).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers['X-Foxes-Signature']).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(init.headers['X-Foxes-Event']).toBe('booking.created');
  });

  it('retries on failure then succeeds', async () => {
    const delivery = makeDelivery();
    const endpoint = makeEndpoint();
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'err' })
      .mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'err' })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'ok' });
    const sleep = jest.fn().mockResolvedValue(undefined);

    const ok = await runDeliveryWithRetry(delivery as never, endpoint as never, {
      fetchImpl: fetchImpl as never,
      sleep,
      backoffMs: [0, 1, 1, 1, 1],
    });

    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(delivery.attempts).toBe(3);
    expect(delivery.status).toBe('success');
    expect(sleep).toHaveBeenCalled(); // backed off between attempts
  });

  it('marks failed and bumps endpoint failure streak after exhausting attempts', async () => {
    const delivery = makeDelivery();
    const endpoint = makeEndpoint();
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'err' });

    const ok = await runDeliveryWithRetry(delivery as never, endpoint as never, {
      fetchImpl: fetchImpl as never,
      sleep: async () => {},
      maxAttempts: 3,
      backoffMs: [0, 0, 0],
    });

    expect(ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(delivery.status).toBe('failed');
    expect(endpoint.consecutiveFailures).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// emitEvent tenant scoping
// ---------------------------------------------------------------------------
describe('emitEvent tenant scoping', () => {
  it('selects only the tenant\'s subscribed endpoints and stamps deliveries with that tenant', async () => {
    const endpointId = new Types.ObjectId();
    (WebhookEndpoint.find as jest.Mock).mockResolvedValue([
      { _id: endpointId, tenantId: TENANT_A, url: 'https://a.test', secret: 's' },
    ]);
    (WebhookDelivery.create as jest.Mock).mockImplementation(async (doc) => ({ _id: new Types.ObjectId(), ...doc }));
    const runner = jest.fn().mockResolvedValue(true);

    const eventId = await emitEvent(TENANT_A, 'booking.created', { foo: 'bar' }, { runner });

    expect(eventId).toMatch(/^evt_[a-f0-9]{32}$/);
    // Selection query is tenant-scoped + subscription-aware.
    const findArg = (WebhookEndpoint.find as jest.Mock).mock.calls[0][0];
    expect(String(findArg.tenantId)).toBe(TENANT_A);
    expect(findArg.enabled).toBe(true);
    expect(findArg.events).toEqual({ $in: ['booking.created', '*'] });
    // Delivery stamped with the same tenant.
    const createArg = (WebhookDelivery.create as jest.Mock).mock.calls[0][0];
    expect(String(createArg.tenantId)).toBe(TENANT_A);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('returns null and never delivers when the tenant has no matching endpoints', async () => {
    (WebhookEndpoint.find as jest.Mock).mockResolvedValue([]);
    const runner = jest.fn();
    const eventId = await emitEvent(TENANT_B, 'payment.succeeded', {}, { runner });
    expect(eventId).toBeNull();
    expect(runner).not.toHaveBeenCalled();
    expect(WebhookDelivery.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Inbound idempotency
// ---------------------------------------------------------------------------
describe('Inbound webhook idempotency', () => {
  it('records a new event, then reports a duplicate on the same id', async () => {
    const store = new Set<string>();
    (WebhookEvent.create as jest.Mock).mockImplementation(async (doc: { provider: string; eventId: string }) => {
      const k = `${doc.provider}:${doc.eventId}`;
      if (store.has(k)) {
        const err = new Error('E11000 duplicate key') as Error & { code: number };
        err.code = 11000;
        throw err;
      }
      store.add(k);
      return doc;
    });

    const first = await recordInboundEvent('stripe', 'evt_123', { eventType: 'payment_intent.succeeded' });
    const second = await recordInboundEvent('stripe', 'evt_123', { eventType: 'payment_intent.succeeded' });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Webhook endpoint management — cross-tenant isolation (controller-level)
// ---------------------------------------------------------------------------
describe('Webhook endpoint management tenant isolation', () => {
  const mockRes = () => {
    const res: Record<string, unknown> & { body?: unknown; statusCode?: number } = {};
    res.statusCode = 200;
    res.status = jest.fn((c: number) => {
      res.statusCode = c;
      return res;
    });
    res.json = jest.fn((b: unknown) => {
      res.body = b;
      return res;
    });
    res.setHeader = jest.fn();
    return res;
  };

  it('NEGATIVE: a tenant-A admin gets 404 for a tenant-B endpoint', async () => {
    (WebhookEndpoint.findById as jest.Mock).mockResolvedValue({
      _id: new Types.ObjectId(),
      tenantId: TENANT_B, // belongs to another tenant
    });

    const req = {
      params: { id: new Types.ObjectId().toHexString() },
      query: {},
      user: { role: 'brand-admin', assignedTenants: [{ toString: () => TENANT_A }] },
    } as unknown as AuthRequest;
    const res = mockRes();

    await getWebhookEndpoint(req, res as never, jest.fn());

    expect(res.statusCode).toBe(404);
    expect((res.body as { error?: string }).error).toMatch(/not found/i);
  });

  it('allows a tenant-A admin to read their own endpoint', async () => {
    const ownId = new Types.ObjectId();
    (WebhookEndpoint.findById as jest.Mock).mockResolvedValue({
      _id: ownId,
      tenantId: TENANT_A,
    });

    const req = {
      params: { id: ownId.toHexString() },
      query: {},
      user: { role: 'brand-admin', assignedTenants: [{ toString: () => TENANT_A }] },
    } as unknown as AuthRequest;
    const res = mockRes();

    await getWebhookEndpoint(req, res as never, jest.fn());

    expect(res.statusCode).toBe(200);
    expect((res.body as { success?: boolean }).success).toBe(true);
  });
});
