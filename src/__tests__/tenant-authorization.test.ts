import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { optionalAdminTenant, optionalTenant, resolveTenant } from '../middleware/tenant.middleware';
import { AuthRequest } from '../types';

jest.mock('../models/Tenant', () => ({
  Tenant: { findOne: jest.fn() },
}));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const adminRequest = (tenantId: Types.ObjectId, requestedTenantId: string): AuthRequest =>
  ({
    headers: { 'x-tenant-id': requestedTenantId },
    query: {},
    user: {
      role: 'brand-admin',
      assignedTenants: [tenantId],
    },
  } as unknown as AuthRequest);

describe('tenant resolution authorization', () => {
  beforeEach(() => jest.clearAllMocks());

  test.each([
    ['resolveTenant', resolveTenant],
    ['optionalTenant', optionalTenant],
  ])('%s rejects an explicit unassigned tenant with 403', async (_name, middleware) => {
    const assignedTenantId = new Types.ObjectId();
    const requestedTenantId = new Types.ObjectId();
    (Tenant.findOne as jest.Mock).mockResolvedValue({ _id: requestedTenantId });
    const req = adminRequest(assignedTenantId, requestedTenantId.toString());
    const res = response();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Access denied to this tenant',
      errors: undefined,
    });
    expect(req.tenant).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a non-super admin to resolve an assigned tenant', async () => {
    const tenantId = new Types.ObjectId();
    const tenant = { _id: tenantId };
    (Tenant.findOne as jest.Mock).mockResolvedValue(tenant);
    const req = adminRequest(tenantId, tenantId.toString());
    const res = response();
    const next = jest.fn();

    await optionalTenant(req, res, next);

    expect(req.tenant).toBe(tenant);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('lets an assigned administrator inspect an inactive tenant without widening access', async () => {
    const tenantId = new Types.ObjectId();
    const tenant = { _id: tenantId, status: 'inactive' };
    (Tenant.findOne as jest.Mock).mockResolvedValue(tenant);
    const req = adminRequest(tenantId, tenantId.toString());
    const res = response();
    const next = jest.fn();

    await optionalAdminTenant(req, res, next);

    expect(Tenant.findOne).toHaveBeenCalledWith(expect.objectContaining({
      status: { $in: expect.arrayContaining(['inactive', 'suspended', 'pending']) },
    }));
    expect(req.tenant).toBe(tenant);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['resolveTenant', resolveTenant],
    ['optionalTenant', optionalTenant],
  ])('%s resolves the public tenant query alias', async (_name, middleware) => {
    const tenantId = new Types.ObjectId();
    const tenant = { _id: tenantId };
    (Tenant.findOne as jest.Mock).mockResolvedValue(tenant);
    const req = {
      headers: {},
      query: { tenant: '  makadi-horse-club  ' },
    } as unknown as AuthRequest;
    const res = response();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(Tenant.findOne).toHaveBeenCalledWith(expect.objectContaining({
      $or: expect.arrayContaining([{ slug: 'makadi-horse-club' }]),
    }));
    expect(req.tenant).toBe(tenant);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('keeps the explicit tenant header authoritative over query aliases', async () => {
    const tenantId = new Types.ObjectId();
    (Tenant.findOne as jest.Mock).mockResolvedValue({ _id: tenantId });
    const req = {
      headers: { 'x-tenant-id': 'header-tenant' },
      query: { tenantId: 'legacy-query-tenant', tenant: 'public-query-tenant' },
    } as unknown as AuthRequest;
    const res = response();
    const next = jest.fn();

    await resolveTenant(req, res, next);

    expect(Tenant.findOne).toHaveBeenCalledWith(expect.objectContaining({
      $or: expect.arrayContaining([{ slug: 'header-tenant' }]),
    }));
    expect(Tenant.findOne).not.toHaveBeenCalledWith(expect.objectContaining({
      $or: expect.arrayContaining([{ slug: 'public-query-tenant' }]),
    }));
    expect(next).toHaveBeenCalledTimes(1);
  });
});
