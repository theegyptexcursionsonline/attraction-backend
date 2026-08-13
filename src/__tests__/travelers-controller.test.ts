import { Types } from 'mongoose';
import { getTravelers, getUsers } from '../controllers/users.controller';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import { AuthRequest } from '../types';

jest.mock('../models/User', () => ({
  User: {
    aggregate: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));
jest.mock('../models/Tenant', () => ({ Tenant: { find: jest.fn() } }));
jest.mock('../models/Booking', () => ({ Booking: { collection: { name: 'bookings' } } }));
jest.mock('../models/Attraction', () => ({ Attraction: {} }));
jest.mock('../services/email.service', () => ({ sendUserInvitation: jest.fn() }));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
};

const request = (overrides: Record<string, unknown> = {}): AuthRequest => ({
  query: {},
  user: { role: 'super-admin', assignedTenants: [] },
  ...overrides,
} as unknown as AuthRequest);

describe('traveler directory', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps the Team endpoint staff-only for a super admin', async () => {
    const lean = jest.fn().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ lean });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    const populate = jest.fn().mockReturnValue({ sort });
    const select = jest.fn().mockReturnValue({ populate });
    (User.find as jest.Mock).mockReturnValue({ select });
    (User.countDocuments as jest.Mock).mockResolvedValue(0);
    const res = response();

    await getUsers(request(), res, jest.fn());

    expect(User.find).toHaveBeenCalledWith({
      role: { $in: ['super-admin', 'brand-admin', 'manager', 'editor', 'viewer'] },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns no traveler PII when a delegated admin has no assigned tenants', async () => {
    const res = response();
    await getTravelers(request({ user: { role: 'manager', assignedTenants: [] } }), res, jest.fn());

    expect(User.aggregate).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ data: [], pagination: expect.objectContaining({ hasMore: false }) }),
    }));
  });

  it('injects assigned tenant scope into the booking lookup before returning travelers', async () => {
    const tenantId = new Types.ObjectId();
    (User.aggregate as jest.Mock).mockResolvedValue([]);
    const res = response();

    await getTravelers(request({ user: { role: 'manager', assignedTenants: [tenantId] } }), res, jest.fn());

    const pipeline = (User.aggregate as jest.Mock).mock.calls[0][0];
    const serialized = JSON.stringify(pipeline);
    expect(serialized).toContain(tenantId.toString());
    expect(serialized).toContain('customer');
    expect(serialized).toContain('guest');
    expect(serialized).toContain('guestDetails.email');
    expect(serialized).toContain('bundleOrderId');
    expect(serialized).toContain('$exists');
    const lookup = pipeline.find((stage: Record<string, unknown>) => '$lookup' in stage) as {
      $lookup: { pipeline: Array<Record<string, unknown>> };
    };
    expect(lookup.$lookup.pipeline[0]).toEqual({ $match: { bundleOrderId: { $exists: false } } });
  });

  it('maps booking brands, latest activity, and currency-safe spend summaries', async () => {
    const travelerId = new Types.ObjectId();
    const tenantId = new Types.ObjectId();
    const bookingId = new Types.ObjectId();
    (User.aggregate as jest.Mock).mockResolvedValue([{
      _id: travelerId,
      email: 'traveler@example.test',
      firstName: 'Sample',
      lastName: 'Traveler',
      status: 'active',
      createdAt: new Date('2026-08-01T00:00:00Z'),
      bookingRollup: [{
        summary: [{ count: 2 }],
        brands: [{ _id: tenantId }],
        spending: [{ _id: 'USD', total: 120 }],
        latest: [{
          _id: bookingId,
          reference: 'BOOK-100',
          tenantId,
          status: 'confirmed',
          total: 70,
          currency: 'USD',
          createdAt: new Date('2026-08-05T00:00:00Z'),
          items: [{ date: '2026-08-10', time: '09:00' }],
        }],
      }],
    }]);
    const lean = jest.fn().mockResolvedValue([{ _id: tenantId, name: 'Sample Brand', slug: 'sample-brand' }]);
    const select = jest.fn().mockReturnValue({ lean });
    (Tenant.find as jest.Mock).mockReturnValue({ select });
    const res = response();

    await getTravelers(request(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        data: [expect.objectContaining({
          bookingCount: 2,
          brands: [{ id: tenantId.toString(), name: 'Sample Brand', slug: 'sample-brand' }],
          spendingByCurrency: [{ currency: 'USD', total: 120 }],
          latestBooking: expect.objectContaining({ reference: 'BOOK-100', travelDate: '2026-08-10' }),
        })],
      }),
    }));
  });

  it('rejects malformed cursors without querying customers', async () => {
    const res = response();
    await getTravelers(request({ query: { cursor: 'not-an-object-id' } }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(User.aggregate).not.toHaveBeenCalled();
  });
});
