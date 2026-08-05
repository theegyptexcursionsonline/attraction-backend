import express from 'express';
import request from 'supertest';

let mockRole = 'brand-admin';
const mockConfigure = jest.fn((_req, res) => res.status(200).json({ success: true }));
const mockResolve = jest.fn((_req, res) => res.status(200).json({ success: true }));

jest.mock('../utils/jwt', () => ({ verifyToken: jest.fn(() => ({ userId: 'user-1' })) }));
jest.mock('../models/User', () => ({
  User: {
    findById: jest.fn(() => Promise.resolve({
      _id: 'user-1',
      role: mockRole,
      status: 'active',
      tokenVersion: 0,
      assignedTenants: [],
    })),
  },
}));
jest.mock('../controllers/tenants.controller', () => new Proxy(
  { __esModule: true },
  {
    get: (target, prop: string | symbol) => {
      if (prop === '__esModule') return true;
      if (prop === 'configureCustomDomain') return mockConfigure;
      if (prop === 'getTenantByCustomDomain') return mockResolve;
      return (_req: unknown, res: express.Response) => res.status(200).json({ success: true });
    },
  }
));

import tenantRoutes from '../routes/tenants.routes';

describe('custom-domain route authorization', () => {
  const app = express();
  app.use(express.json());
  app.use('/tenants', tenantRoutes);

  beforeEach(() => {
    jest.clearAllMocks();
    mockRole = 'brand-admin';
  });

  it('allows public hostname resolution without authentication', async () => {
    const result = await request(app).get('/tenants/by-domain/future-domain.com');
    expect(result.status).toBe(200);
    expect(mockResolve).toHaveBeenCalledTimes(1);
  });

  it('blocks brand admins from mutating provider domains', async () => {
    const result = await request(app)
      .post('/tenants/tenant-1/custom-domain')
      .set('Authorization', 'Bearer test-token')
      .send({ domain: 'future-domain.com' });

    expect(result.status).toBe(403);
    expect(result.body.error).toBe('Super admin access required');
    expect(mockConfigure).not.toHaveBeenCalled();
  });

  it('allows an authenticated super admin to configure a domain', async () => {
    mockRole = 'super-admin';
    const result = await request(app)
      .post('/tenants/tenant-1/custom-domain')
      .set('Authorization', 'Bearer test-token')
      .send({ domain: 'future-domain.com' });

    expect(result.status).toBe(200);
    expect(mockConfigure).toHaveBeenCalledTimes(1);
  });
});
