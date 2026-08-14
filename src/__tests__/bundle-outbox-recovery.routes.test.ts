import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { verifyToken } from '../utils/jwt';
import { User } from '../models/User';
import bundlesRouter from '../routes/bundles.routes';
import {
  BundleOutboxRecoveryError,
  listBundleOutboxDeadLetters,
  redriveBundleOutboxDeadLetter,
} from '../services/bundleOutbox.service';

jest.mock('../utils/jwt', () => ({ verifyToken: jest.fn() }));
jest.mock('../models/User', () => ({ User: { findById: jest.fn() } }));
jest.mock('../services/bundleOutbox.service', () => {
  class RecoveryError extends Error {
    constructor(readonly statusCode: number, message: string) {
      super(message);
    }
  }
  return {
    BundleOutboxRecoveryError: RecoveryError,
    listBundleOutboxDeadLetters: jest.fn(),
    redriveBundleOutboxDeadLetter: jest.fn(),
  };
});

const app = express();
app.use(express.json());
app.use('/bundles', bundlesRouter);

const userId = new Types.ObjectId();
const tenantId = new Types.ObjectId().toString();
const eventId = new Types.ObjectId().toString();
const operationId = 'outbox-redrive:route-operation-0001';

const authenticateAs = (role: string): void => {
  (verifyToken as jest.Mock).mockReturnValue({ userId: userId.toString(), sessionVersion: 0 });
  (User.findById as jest.Mock).mockResolvedValue({
    _id: userId,
    role,
    status: 'active',
    tokenVersion: 0,
    assignedTenants: [],
  });
};

describe('Bundle outbox recovery route authorization and contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listBundleOutboxDeadLetters as jest.Mock).mockResolvedValue({
      data: [],
      pageInfo: { hasMore: false, nextCursor: null },
    });
    (redriveBundleOutboxDeadLetter as jest.Mock).mockResolvedValue({
      event: { id: eventId, status: 'retry' },
      replayed: false,
    });
  });

  it('requires authentication for both observation and redrive', async () => {
    const [listResponse, redriveResponse] = await Promise.all([
      request(app).get(`/bundles/admin/outbox/dead-letters?tenantId=${tenantId}`),
      request(app)
        .post(`/bundles/admin/outbox/${eventId}/redrive`)
        .send({ tenantId, operationId, reason: 'Provider configuration repaired' }),
    ]);

    expect(listResponse.status).toBe(401);
    expect(redriveResponse.status).toBe(401);
    expect(listBundleOutboxDeadLetters).not.toHaveBeenCalled();
    expect(redriveBundleOutboxDeadLetter).not.toHaveBeenCalled();
  });

  test.each(['brand-admin', 'manager', 'editor', 'viewer'])(
    'rejects %s from delivery recovery operations',
    async (role) => {
      authenticateAs(role);
      const [listResponse, redriveResponse] = await Promise.all([
        request(app)
          .get(`/bundles/admin/outbox/dead-letters?tenantId=${tenantId}`)
          .set('Authorization', 'Bearer token'),
        request(app)
          .post(`/bundles/admin/outbox/${eventId}/redrive`)
          .set('Authorization', 'Bearer token')
          .send({ tenantId, operationId, reason: 'Provider configuration repaired' }),
      ]);

      expect(listResponse.status).toBe(403);
      expect(redriveResponse.status).toBe(403);
      expect(listBundleOutboxDeadLetters).not.toHaveBeenCalled();
      expect(redriveBundleOutboxDeadLetter).not.toHaveBeenCalled();
    }
  );

  it('lets a super-admin inspect one explicitly scoped storefront queue', async () => {
    authenticateAs('super-admin');

    const response = await request(app)
      .get(`/bundles/admin/outbox/dead-letters?tenantId=${tenantId}&limit=25`)
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(listBundleOutboxDeadLetters).toHaveBeenCalledWith({
      storefrontTenantId: tenantId,
      cursor: undefined,
      limit: 25,
    });
  });

  it('validates the tenant, operation id, reason and event id before redrive', async () => {
    authenticateAs('super-admin');

    const response = await request(app)
      .post('/bundles/admin/outbox/not-an-object-id/redrive')
      .set('Authorization', 'Bearer token')
      .send({ tenantId: 'wrong', operationId: 'short', reason: 'x' });

    expect(response.status).toBe(400);
    expect(redriveBundleOutboxDeadLetter).not.toHaveBeenCalled();
  });

  it('queues a tenant-scoped redrive and identifies idempotent replays', async () => {
    authenticateAs('super-admin');
    (redriveBundleOutboxDeadLetter as jest.Mock).mockResolvedValue({
      event: { id: eventId, status: 'retry' },
      replayed: true,
    });

    const response = await request(app)
      .post(`/bundles/admin/outbox/${eventId}/redrive`)
      .set('Authorization', 'Bearer token')
      .send({ tenantId, operationId, reason: 'Provider configuration repaired' });

    expect(response.status).toBe(200);
    expect(response.headers['idempotency-replayed']).toBe('true');
    expect(redriveBundleOutboxDeadLetter).toHaveBeenCalledWith({
      eventId,
      storefrontTenantId: tenantId,
      operationId,
      reason: 'Provider configuration repaired',
      actorId: userId,
    });
  });

  it('maps a cross-tenant or missing event to the same not-found response', async () => {
    authenticateAs('super-admin');
    (redriveBundleOutboxDeadLetter as jest.Mock).mockRejectedValue(
      new BundleOutboxRecoveryError(404, 'Dead-letter delivery item not found')
    );

    const response = await request(app)
      .post(`/bundles/admin/outbox/${eventId}/redrive`)
      .set('Authorization', 'Bearer token')
      .send({ tenantId, operationId, reason: 'Provider configuration repaired' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: 'Dead-letter delivery item not found',
    }));
  });
});
