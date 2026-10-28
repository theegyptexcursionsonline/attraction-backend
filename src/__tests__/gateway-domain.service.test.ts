import mongoose from 'mongoose';
import { DomainClaim } from '../models/DomainClaim';
import { Tenant } from '../models/Tenant';
import { resolveGatewayDomain } from '../services/gatewayDomain.service';

jest.mock('../models/DomainClaim', () => ({ DomainClaim: { findById: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: { findById: jest.fn() } }));

const session = { withTransaction: jest.fn(), endSession: jest.fn() };
const claimant = { tenantId: 'tenant-1', provider:'cloudflare' };
const owner = { _id: 'tenant-1', slug: 'site-one', customDomain: 'site-one.com', status: 'active' };
const query = (value: unknown) => {
  const q = { select: jest.fn(), limit: jest.fn(), maxTimeMS: jest.fn(), session: jest.fn(), lean: jest.fn().mockResolvedValue(value) };
  q.select.mockReturnValue(q); q.limit.mockReturnValue(q); q.maxTimeMS.mockReturnValue(q); q.session.mockReturnValue(q);
  return q;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
  session.withTransaction.mockImplementation(async (fn: () => Promise<unknown>) => fn());
  (DomainClaim.findById as jest.Mock).mockReturnValue(query(claimant));
  (Tenant.findById as jest.Mock).mockReturnValue(query(owner));
});
afterEach(() => jest.restoreAllMocks());

it('resolves a unique active claimant using a snapshot and canonical apex', async () => {
  expect(await resolveGatewayDomain('WWW.Site-One.com.')).toEqual({ id: 'tenant-1', slug: 'site-one', customDomain: 'site-one.com', status: 'active' });
  expect(DomainClaim.findById).toHaveBeenCalledWith('site-one.com');
  expect(Tenant.findById).toHaveBeenCalledWith('tenant-1');
  expect(session.withTransaction).toHaveBeenCalledWith(expect.any(Function), { readConcern: { level: 'snapshot' } });
  expect(session.endSession).toHaveBeenCalled();
});

it.each(['', 'site-one.com/path', 'foxesdemoplatform.com', 'localhost'])('rejects invalid domain %s before database access', async hostname => {
  expect(await resolveGatewayDomain(hostname)).toBeNull();
  expect(mongoose.startSession).not.toHaveBeenCalled();
});

it('rejects missing claims', async () => {
  (DomainClaim.findById as jest.Mock).mockReturnValue(query(null));
  expect(await resolveGatewayDomain('site-one.com')).toBeNull();
  expect(Tenant.findById).not.toHaveBeenCalled();
});

it.each([
  [null], [{ ...owner, _id: 'tenant-2' }], [{ ...owner, status: 'coming_soon' }],
  [{ ...owner, status: 'inactive' }], [{ ...owner, customDomain: null }],
])('rejects absent, conflicting or inactive ownership %#', async tenant => {
  (Tenant.findById as jest.Mock).mockReturnValue(query(tenant));
  expect(await resolveGatewayDomain('site-one.com')).toBeNull();
});

it('rejects a legacy claim until it is explicitly adopted', async () => {
  (DomainClaim.findById as jest.Mock).mockReturnValue(query({tenantId:'tenant-1'}));
  expect(await resolveGatewayDomain('site-one.com')).toBeNull();
  expect(Tenant.findById).not.toHaveBeenCalled();
});

it('propagates transaction errors and still ends the session', async () => {
  session.withTransaction.mockRejectedValue(new Error('database unavailable'));
  await expect(resolveGatewayDomain('site-one.com')).rejects.toThrow('database unavailable');
  expect(session.endSession).toHaveBeenCalled();
});
