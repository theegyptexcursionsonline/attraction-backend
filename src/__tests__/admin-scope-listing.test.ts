/**
 * The attractions listing is a public-optional route also used by the admin
 * Tours list. When an admin session silently expired, the request degraded to
 * the PUBLIC branch: no 401, no tenant filter — HTTP 200 with the whole
 * network's catalog. With "All Assigned Sites" selected (no tenant header)
 * that rendered every brand's tours in the admin (client report 2026-08-20).
 * Admin surfaces now send scope=admin, and the controller fails closed.
 */
import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { getAttractions } from '../controllers/attractions.controller';
import { AuthRequest } from '../types';

jest.mock('../models/Attraction', () => ({
  Attraction: {
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
};

const listRequest = (overrides: Record<string, unknown> = {}): AuthRequest =>
  ({
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  } as unknown as AuthRequest);

const installFindChain = (rows: unknown[] = []) => {
  const chain: any = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.sort = jest.fn().mockReturnValue(chain);
  chain.skip = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.lean = jest.fn().mockResolvedValue(rows);
  (Attraction.find as jest.Mock).mockReturnValue(chain);
  (Attraction.countDocuments as jest.Mock).mockResolvedValue(rows.length);
  return chain;
};

describe('admin-scope listing fails closed', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 for scope=admin with no user instead of the public catalog', async () => {
    const req = listRequest({ query: { scope: 'admin' } });
    const res = response();

    await getAttractions(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(Attraction.find).not.toHaveBeenCalled();
  });

  it('returns 401 for scope=admin when only a customer session exists', async () => {
    const req = listRequest({
      query: { scope: 'admin' },
      user: { role: 'customer', assignedTenants: [] },
    });
    const res = response();

    await getAttractions(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(Attraction.find).not.toHaveBeenCalled();
  });

  it('bounds the aggregate (no tenant) admin listing to the caller assigned tenants', async () => {
    const assigned = [new Types.ObjectId(), new Types.ObjectId()];
    installFindChain([]);
    const req = listRequest({
      query: { scope: 'admin' },
      user: { role: 'brand-admin', assignedTenants: assigned },
    });
    const res = response();

    await getAttractions(req, res, jest.fn());

    expect(Attraction.find).toHaveBeenCalledWith(
      expect.objectContaining({ tenantIds: { $in: assigned } })
    );
  });

  it('keeps the public listing (no scope) active-only and unauthenticated-safe', async () => {
    installFindChain([]);
    const req = listRequest({ query: {} });
    const res = response();

    await getAttractions(req, res, jest.fn());

    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(Attraction.find).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' })
    );
  });
});
