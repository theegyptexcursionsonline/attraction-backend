import { Types } from 'mongoose';
import { getTravelers, getUsers } from '../controllers/users.controller';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import { Booking } from '../models/Booking';
import { AuthRequest } from '../types';

jest.mock('../models/User', () => ({
  User: {
    collection: { name: 'users' },
    aggregate: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));
jest.mock('../models/Tenant', () => ({ Tenant: { find: jest.fn() } }));
jest.mock('../models/Booking', () => ({ Booking: { collection: { name: 'bookings' }, aggregate: jest.fn() } }));
jest.mock('../models/Attraction', () => ({ Attraction: {} }));
jest.mock('../services/email.service', () => ({ sendUserInvitation: jest.fn() }));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
};

const installAggregate = (rows: unknown[]) => {
  (Booking.aggregate as jest.Mock).mockReturnValue({ allowDiskUse: jest.fn().mockResolvedValue(rows) });
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

  it('scopes a site team list to the requested tenant', async () => {
    const tenantId = new Types.ObjectId();
    const lean = jest.fn().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ lean });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    const populate = jest.fn().mockReturnValue({ sort });
    const select = jest.fn().mockReturnValue({ populate });
    (User.find as jest.Mock).mockReturnValue({ select });
    (User.countDocuments as jest.Mock).mockResolvedValue(0);
    const res = response();

    await getUsers(request({ query: { tenantId: tenantId.toString() } }), res, jest.fn());

    expect(User.find).toHaveBeenCalledWith(expect.objectContaining({
      assignedTenants: tenantId,
      role: { $in: ['super-admin', 'brand-admin', 'manager', 'editor', 'viewer'] },
    }));
    expect(User.countDocuments).toHaveBeenCalledWith(expect.objectContaining({ assignedTenants: tenantId }));
  });

  it('rejects a delegated admin requesting another site team', async () => {
    const assignedTenant = new Types.ObjectId();
    const otherTenant = new Types.ObjectId();
    const res = response();

    await getUsers(request({
      query: { tenantId: otherTenant.toString() },
      user: { role: 'brand-admin', assignedTenants: [assignedTenant] },
    }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(User.find).not.toHaveBeenCalled();
  });

  it('rejects an invalid site id before querying team records', async () => {
    const res = response();

    await getUsers(request({ query: { tenantId: 'not-an-object-id' } }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(User.find).not.toHaveBeenCalled();
  });

  it('returns no traveler PII when a delegated admin has no assigned tenants', async () => {
    const res = response();
    await getTravelers(request({ user: { role: 'manager', assignedTenants: [] } }), res, jest.fn());

    expect(Booking.aggregate).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ data: [], pagination: expect.objectContaining({ hasMore: false }) }),
    }));
  });

  it('builds the directory from bookings scoped to the assigned brands, without bundle children', async () => {
    const tenantId = new Types.ObjectId();
    installAggregate([]);
    const res = response();

    await getTravelers(request({ user: { role: 'manager', assignedTenants: [tenantId] } }), res, jest.fn());

    const pipeline = (Booking.aggregate as jest.Mock).mock.calls[0][0];
    expect(pipeline[0]).toEqual({ $match: expect.objectContaining({
      bundleOrderId: { $exists: false },
      tenantId: { $in: [tenantId] },
    }) });
    // Account holders without a booking on the brand are a super admin view only.
    expect(JSON.stringify(pipeline)).not.toContain('$unionWith');
  });

  it('lists guest-checkout travellers and accounts without bookings for a super admin', async () => {
    installAggregate([]);
    await getTravelers(request(), response(), jest.fn());

    const pipeline = (Booking.aggregate as jest.Mock).mock.calls[0][0];
    expect(pipeline[0].$match).not.toHaveProperty('tenantId');
    expect(JSON.stringify(pipeline)).toContain('$unionWith');
  });

  it('refuses a brand filter outside the caller brands', async () => {
    const res = response();
    await getTravelers(request({
      query: { tenantId: new Types.ObjectId().toString() },
      user: { role: 'brand-admin', assignedTenants: [new Types.ObjectId()] },
    }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(Booking.aggregate).not.toHaveBeenCalled();
  });

  it('maps guest travellers, brands, latest activity and spend per currency', async () => {
    const tenantId = new Types.ObjectId();
    const bookingId = new Types.ObjectId();
    installAggregate([{
      _id: 'traveler@example.test',
      bookingCount: 2,
      lastActivityAt: new Date('2026-08-05T00:00:00Z'),
      firstSeenAt: new Date('2026-08-01T00:00:00Z'),
      brands: [tenantId],
      spending: [{ currency: 'USD', total: 120 }, { currency: 'EUR', total: 30 }],
      guest: { firstName: 'Sample', lastName: 'Traveler', phone: '+100', country: 'DE' },
      latest: {
        _id: bookingId, reference: 'BOOK-100', tenantId, status: 'confirmed', total: 70, currency: 'USD',
        createdAt: new Date('2026-08-05T00:00:00Z'), items: [{ date: '2026-08-10', time: '09:00' }],
      },
    }]);
    const lean = jest.fn().mockResolvedValue([{ _id: tenantId, name: 'Sample Brand', slug: 'sample-brand' }]);
    (Tenant.find as jest.Mock).mockReturnValue({ select: jest.fn().mockReturnValue({ lean }) });
    const res = response();

    await getTravelers(request(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        data: [expect.objectContaining({
          id: 'guest:traveler@example.test',
          hasAccount: false,
          status: 'guest',
          firstName: 'Sample',
          phone: '+100',
          bookingCount: 2,
          brands: [{ id: tenantId.toString(), name: 'Sample Brand', slug: 'sample-brand' }],
          spendingByCurrency: [{ currency: 'USD', total: 120 }, { currency: 'EUR', total: 30 }],
          latestBooking: expect.objectContaining({ reference: 'BOOK-100', travelDate: '2026-08-10' }),
        })],
      }),
    }));
  });

  it('rejects malformed cursors without querying bookings', async () => {
    const res = response();
    await getTravelers(request({ query: { cursor: 'not-a-cursor' } }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Booking.aggregate).not.toHaveBeenCalled();
  });
});
