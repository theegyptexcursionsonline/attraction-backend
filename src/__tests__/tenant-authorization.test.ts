import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { optionalTenant, resolveTenant } from '../middleware/tenant.middleware';
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
});
