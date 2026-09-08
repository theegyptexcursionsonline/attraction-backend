import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import pageRoutes from '../routes/page.routes';
import { Tenant } from '../models/Tenant';

jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
  authenticate: (req: any, res: any, next: any) => {
    if (!req.headers['x-role']) return res.status(401).json({ error: 'Authentication required' });
    req.user = { role: req.headers['x-role'], assignedTenants: req.headers['x-assigned'] ? [req.headers['x-assigned']] : [] }; next();
  },
}));
jest.mock('../middleware/tenant.middleware', () => ({
  optionalAdminTenant: (req: any, _res: any, next: any) => { if (req.headers['x-tenant-id']) req.tenant = { _id: new (require('mongoose').Types.ObjectId)(req.headers['x-tenant-id']) }; next(); },
  optionalTenant: (req: any, _res: any, next: any) => { if (req.headers['x-tenant-id']) req.tenant = { _id: new (require('mongoose').Types.ObjectId)(req.headers['x-tenant-id']) }; next(); },
  requireTenant: (req: any, res: any, next: any) => req.tenant ? next() : res.status(400).json({ error: 'Tenant required' }),
}));
jest.mock('../models/Tenant', () => ({ Tenant: { findById: jest.fn(), findOneAndUpdate: jest.fn() } }));
const app = express(); app.use(express.json()); app.use('/page', pageRoutes);
const tenant = new Types.ObjectId().toString();
const navigation = [{ label: 'Tours', href: '/tours', columns: [{ label: 'Desert', links: [{ label: 'Quad', href: '/quad' }] }] }];
beforeEach(() => {
  jest.clearAllMocks();
  (Tenant.findById as jest.Mock).mockReturnValue({ select: () => ({ lean: async () => ({ navigation: [], navigationRevision: 0 }) }) });
  (Tenant.findOneAndUpdate as jest.Mock).mockResolvedValue({ navigation, navigationRevision: 1 });
});

describe('content route permission and validation integration', () => {
  test.each(['super-admin', 'brand-admin', 'manager'])('allows assigned %s to read and save menu', async role => {
    await request(app).get('/page/admin/menu').set('x-role', role).set('x-tenant-id', tenant).set('x-assigned', tenant).expect(200);
    await request(app).put('/page/admin/menu').set('x-role', role).set('x-tenant-id', tenant).set('x-assigned', tenant).send({ navigation, expectedRevision: 0 }).expect(200);
  });
  test.each(['customer', 'viewer', 'editor', 'operator'])('denies %s even if assigned', async role => {
    await request(app).put('/page/admin/menu').set('x-role', role).set('x-tenant-id', tenant).set('x-assigned', tenant).send({ navigation, expectedRevision: 0 }).expect(403);
    expect(Tenant.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('denies expired authentication and cross tenant access', async () => {
    await request(app).get('/page/admin/menu').set('x-tenant-id', tenant).expect(401);
    await request(app).get('/page/admin/menu').set('x-role', 'brand-admin').set('x-tenant-id', tenant).set('x-assigned', new Types.ObjectId().toString()).expect(403);
  });
  test.each([
    { navigation },
    { navigation, expectedRevision: -1 },
    { navigation: [{ label: 'Bad', href: 'javascript:alert(1)' }], expectedRevision: 0 },
    { navigation, expectedRevision: 0, tenantId: new Types.ObjectId().toString() },
  ])('rejects invalid menu contract before DB writes', async payload => {
    await request(app).put('/page/admin/menu').set('x-role', 'super-admin').set('x-tenant-id', tenant).send(payload).expect(400);
    expect(Tenant.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('requires revision for section edits, rejects reserved root URL and empty writes', async () => {
    const id = new Types.ObjectId().toString();
    for (const body of [{ sections: [] }, {}, { slug: 'admin', expectedRevision: 0 }]) {
      await request(app).patch(`/page/admin/${id}`).set('x-role', 'super-admin').set('x-tenant-id', tenant).send(body).expect(400);
    }
    expect(Tenant.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('validates query bounds before fetching sections', async () => {
    await request(app).get(`/page/sections/${new Types.ObjectId()}/tours?limit=101`).set('x-tenant-id', tenant).expect(400);
    await request(app).get(`/page/sections/${new Types.ObjectId()}/tours?cursor=broken`).set('x-tenant-id', tenant).expect(400);
  });
});
