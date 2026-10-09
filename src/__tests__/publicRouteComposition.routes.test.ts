import express from 'express';
import request from '../test/loopbackRequest';
import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { composePublicRoute } from '../services/publicRouteComposition.service';
import { InvalidPublicCursor } from '../utils/publicCursor';

let mockUser: Record<string, unknown> | null = null;
jest.mock('../utils/jwt', () => ({ verifyToken: jest.fn(() => ({ userId: 'user-1' })) }));
jest.mock('../models/User', () => ({ User: { findById: jest.fn(() => Promise.resolve(mockUser)) } }));
jest.mock('../models/Tenant', () => ({ Tenant: { findOne: jest.fn() } }));
jest.mock('../services/publicRouteComposition.service', () => ({ composePublicRoute: jest.fn() }));

import router from '../routes/publicRouteComposition.routes';
const app = express();
app.use('/public', router);
const owner = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
const tenant = { _id: owner, slug: 'grand-rock-safari', customDomain: 'grandrocksafari.com', status: 'active', designMode: 'savanna' };
const query = { tenantSlug: tenant.slug, domain: tenant.customDomain, route: 'home', locale: 'ar' };
const payload = { seed: { tenant, featured: [], destinations: [], facts: {}, collection: [], pagination: null, stats: {} }, receipt: { tenantId: String(owner), locale: 'ar', route: 'home' } };
const get = (params: object = query) => request(app).get('/public/route-composition').query(params).set('X-Tenant-ID', tenant.slug);

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  (Tenant.findOne as jest.Mock).mockResolvedValue(tenant);
  (composePublicRoute as jest.Mock).mockResolvedValue(payload);
});

describe('public route composition owner and snapshot boundary', () => {
  test('anonymous page read returns the actual composition without shared caching', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.vary).toContain('X-Tenant-ID');
    expect(response.body.data).toEqual(JSON.parse(JSON.stringify(payload)));
    expect(composePublicRoute).toHaveBeenCalledWith(query);
  });

  test.each([
    { ...query, tenantSlug: 'other-site' }, { ...query, domain: 'other.example' },
    { ...query, locale: 'xx' }, { ...query, locale: ['ar', 'en'] },
    { ...query, search: 'anything' }, { ...query, cursor: 'abc' },
    { ...query, route: 'bookings' }, { ...query, tenant: tenant.slug },
  ])('rejects malformed, duplicate, private or foreign request before reading data: %j', async params => {
    const response = await get(params);
    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(composePublicRoute).not.toHaveBeenCalled();
  });

  test('requires explicit tenant context instead of falling back to a global catalogue', async () => {
    const response = await request(app).get('/public/route-composition').query(query);
    expect(response.status).toBe(400);
    expect(composePublicRoute).not.toHaveBeenCalled();
  });

  test.each([
    { ...tenant, slug: 'other-site' }, { ...tenant, customDomain: 'other.example' },
    { ...tenant, status: 'pending' }, { ...tenant, designMode: 'luxury' },
  ])('rejects mismatched or unpublished tenant context: %j', async context => {
    (Tenant.findOne as jest.Mock).mockResolvedValue(context);
    expect((await get()).status).toBe(404);
    expect(composePublicRoute).not.toHaveBeenCalled();
  });

  test('an administrator of another website cannot read through this route', async () => {
    mockUser = { _id: 'user-1', status: 'active', role: 'viewer', tokenVersion: 0, assignedTenants: [new Types.ObjectId()] };
    const response = await get().set('Authorization', 'Bearer scoped-token');
    expect(response.status).toBe(403);
    expect(composePublicRoute).not.toHaveBeenCalled();
  });

  test('context reassignment during the snapshot never adopts another owner', async () => {
    (composePublicRoute as jest.Mock).mockResolvedValue({ ...payload, receipt: { ...payload.receipt, tenantId: 'bbbbbbbbbbbbbbbbbbbbbbbb' } });
    const response = await get();
    expect(response.status).toBe(503);
    expect(response.body.data).toBeUndefined();
  });

  test('failure never publishes partial content or database error details; retry can recover', async () => {
    (composePublicRoute as jest.Mock).mockRejectedValueOnce(new Error('private database connection detail'));
    const failed = await get();
    expect(failed.status).toBe(503);
    expect(failed.body.data).toBeUndefined();
    expect(JSON.stringify(failed.body)).not.toContain('private database');
    expect((await get()).status).toBe(200);
  });

  test('cross-language or cross-route cursor fails as a recoverable bad page link', async () => {
    (composePublicRoute as jest.Mock).mockRejectedValue(new InvalidPublicCursor());
    const response = await get({ ...query, route: 'safaris', cursor: 'abc' });
    expect(response.status).toBe(400);
    expect(response.body.data).toBeUndefined();
  });
});
