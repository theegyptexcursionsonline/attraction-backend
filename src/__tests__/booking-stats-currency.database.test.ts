import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Booking } from '../models/Booking';
import { getBookingStats } from '../controllers/bookings.controller';
import { getPortfolioStats, getTenantStats } from '../controllers/tenants.controller';
import { AuthRequest } from '../types';

jest.setTimeout(120_000);

let mongo: MongoMemoryServer;
const siteA = new Types.ObjectId();
const siteB = new Types.ObjectId();
const superAdmin = { role: 'super-admin', assignedTenants: [] };
const brandAdmin = { role: 'brand-admin', assignedTenants: [siteA] };

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const stats = async (user: unknown = superAdmin, tenantId?: Types.ObjectId) => {
  const res = response();
  const next = jest.fn();
  await getBookingStats({ user, ...(tenantId ? { tenant: { _id: tenantId } } : {}) } as AuthRequest, res, next);
  expect(next).not.toHaveBeenCalled();
  return { status: res.status.mock.calls[0][0], ...res.json.mock.calls[0][0] };
};

const seed = async (rows: Array<Record<string, unknown>>) => {
  // Raw inserts intentionally allow malformed historical currency values that the
  // report must handle without relabelling them or changing the saved bookings.
  await Booking.collection.insertMany(rows.map((row) => {
    const id = new Types.ObjectId();
    return { _id: id, reference: `CURRENCY-${id}`, tenantId: siteA, status: 'confirmed', paymentStatus: 'succeeded', total: 10, ...row };
  }));
};

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  mongo = await MongoMemoryServer.create(systemBinary ? { binary: { systemBinary } } : {});
  await mongoose.connect(mongo.getUri('booking_stats_currency'));
});

beforeEach(async () => { await Booking.deleteMany({}); });
afterEach(() => { jest.restoreAllMocks(); });
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

describe('booking statistics preserve the currency of every amount', () => {
  it('keeps USD and EUR separate and refuses a combined scalar', async () => {
    await seed([
      { currency: 'USD', total: 50 },
      { currency: 'EUR', total: 30, paymentStatus: 'pending', paymentMethod: 'pay-later' },
      { currency: 'USD', total: 40, status: 'completed' },
    ]);
    const { data, status } = await stats();
    expect(status).toBe(200);
    expect(data).toMatchObject({ totalBookings: 3, confirmedBookings: 2, completedBookings: 1,
      currency: null, totalRevenue: null, bookedRevenue: null, collectedRevenue: null });
    expect(data.currencyTotals).toEqual([
      { currency: 'EUR', bookedRevenue: 30, collectedRevenue: 0 },
      { currency: 'USD', bookedRevenue: 90, collectedRevenue: 90 },
    ]);
  });

  it('identifies a singleton EUR total without a USD assumption or conversion', async () => {
    await seed([{ currency: 'EUR', total: 99.01 }, { currency: ' eur ', total: 0.1 }, { currency: 'eur', total: 0.2 }]);
    const { data } = await stats();
    expect(data).toMatchObject({ currency: 'EUR', totalRevenue: 99.31, bookedRevenue: 99.31, collectedRevenue: 99.31 });
    expect(data.currencyTotals).toEqual([{ currency: 'EUR', bookedRevenue: 99.31, collectedRevenue: 99.31 }]);
  });

  it('keeps the original booking and collection status rules', async () => {
    await seed([
      { currency: 'USD', total: 10, status: 'confirmed', paymentStatus: 'pending' },
      { currency: 'USD', total: 20, status: 'completed', paymentStatus: 'succeeded' },
      { currency: 'USD', total: 30, status: 'pending', paymentStatus: 'succeeded' },
      { currency: 'USD', total: 40, status: 'cancelled', paymentStatus: 'succeeded' },
      { currency: 'USD', total: 50, status: 'refunded', paymentStatus: 'refunded' },
      { currency: 'USD', total: 60, status: 'confirmed', paymentStatus: 'failed' },
    ]);
    const { data } = await stats();
    expect(data).toMatchObject({ totalBookings: 6, confirmedBookings: 2, completedBookings: 1, pendingBookings: 1,
      cancelledBookings: 1, refundedBookings: 1, bookedRevenue: 90, collectedRevenue: 20 });
    expect(data.currencyTotals).toEqual([{ currency: 'USD', bookedRevenue: 90, collectedRevenue: 20 }]);
  });

  it('returns zero counts and no currency when there are no bookings', async () => {
    const { data } = await stats();
    expect(data).toEqual({ totalBookings: 0, confirmedBookings: 0, pendingBookings: 0, completedBookings: 0,
      cancelledBookings: 0, refundedBookings: 0, incompleteBookings: 0, currency: null, currencyTotals: [],
      totalRevenue: 0, bookedRevenue: 0, collectedRevenue: 0 });
  });

  it('marks missing and malformed historical currency without borrowing the site default', async () => {
    await seed([{ total: 4 }, { currency: null, total: 5 }, { currency: '$', total: 6 },
      { currency: { code: 'EUR' }, total: 7 }, { currency: ['USD'], total: 8 }, { currency: 'EUR', total: 9 }]);
    const { data } = await stats();
    expect(data).toMatchObject({ currency: null, totalRevenue: null, bookedRevenue: null, collectedRevenue: null });
    expect(data.currencyTotals).toEqual([
      { currency: 'EUR', bookedRevenue: 9, collectedRevenue: 9 },
      { currency: null, bookedRevenue: 30, collectedRevenue: 30 },
    ]);
    expect(await Booking.collection.countDocuments({ currency: { $exists: false } })).toBe(1);
  });

  it('does not expose a scalar when the only currency is unknown', async () => {
    await seed([{ currency: '', total: 12 }]);
    const { data } = await stats();
    expect(data).toMatchObject({ currency: null, totalRevenue: null, bookedRevenue: null, collectedRevenue: null });
    expect(data.currencyTotals).toEqual([{ currency: null, bookedRevenue: 12, collectedRevenue: 12 }]);
  });

  it('excludes bundle component allocations from counts and totals', async () => {
    await seed([{ currency: 'USD', total: 10 }, { currency: 'EUR', total: 200, bundleOrderId: new Types.ObjectId() }]);
    const { data } = await stats();
    expect(data).toMatchObject({ totalBookings: 1, currency: 'USD', bookedRevenue: 10 });
    expect(data.currencyTotals).toEqual([{ currency: 'USD', bookedRevenue: 10, collectedRevenue: 10 }]);
  });

  it.each(['brand-admin', 'manager', 'editor', 'viewer'])('scopes %s totals to assigned sites', async (role) => {
    await seed([{ currency: 'USD', total: 10 }, { tenantId: siteB, currency: 'EUR', total: 500 }]);
    const { data } = await stats({ ...brandAdmin, role });
    expect(data).toMatchObject({ totalBookings: 1, currency: 'USD', bookedRevenue: 10 });
    expect(data.currencyTotals).toHaveLength(1);
  });

  it('intersects the active site with assignments inside the database queries', async () => {
    await seed([{ currency: 'USD', total: 10 }, { tenantId: siteB, currency: 'EUR', total: 500 }]);
    expect((await stats(brandAdmin, siteA)).data.bookedRevenue).toBe(10);
    const denied = (await stats(brandAdmin, siteB)).data;
    expect(denied.totalBookings).toBe(0);
    expect(denied.currencyTotals).toEqual([]);
    expect((await stats({ role: 'brand-admin', assignedTenants: [] })).data.totalBookings).toBe(0);
  });

  it('allows a super admin to select one site or view separate totals across sites', async () => {
    await seed([{ currency: 'USD', total: 10 }, { tenantId: siteB, currency: 'EUR', total: 500 }]);
    expect((await stats(superAdmin)).data.currencyTotals).toHaveLength(2);
    expect((await stats(superAdmin, siteB)).data).toMatchObject({ totalBookings: 1, currency: 'EUR', bookedRevenue: 500 });
  });

  it('rejects absent or customer identity before reading any money', async () => {
    const read = jest.spyOn(Booking, 'aggregate');
    expect((await stats(null)).status).toBe(401);
    expect((await stats({ role: 'customer', assignedTenants: [siteA] })).status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });

  it('propagates a database failure instead of reporting zero revenue', async () => {
    const error = new Error('database unavailable');
    jest.spyOn(Booking, 'countDocuments').mockRejectedValue(error);
    jest.spyOn(Booking, 'aggregate').mockRejectedValue(error);
    const res = response();
    const next = jest.fn();
    await getBookingStats({ user: superAdmin } as unknown as AuthRequest, res, next);
    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
  });
});


describe('portfolio revenue keeps each currency across all authorized websites', () => {
  const portfolio = async (user: unknown = superAdmin, tenantId?: Types.ObjectId) => {
    const res = response(); const next = jest.fn();
    await getPortfolioStats({ user, ...(tenantId ? { tenant: { _id: tenantId } } : {}) } as AuthRequest, res, next);
    expect(next).not.toHaveBeenCalled();
    return { status: res.status.mock.calls[0][0], ...res.json.mock.calls[0][0] };
  };
  it('separates currencies across all assigned sites even when one site is selected', async () => {
    await seed([{ currency: 'USD', total: 105 }, { tenantId: siteB, currency: 'EUR', total: 210 }]);
    const { data } = await portfolio({ role: 'brand-admin', assignedTenants: [siteA, siteB] }, siteA);
    expect(data).toMatchObject({ totalBookings: 2, currency: null, totalRevenue: null, bookedRevenue: null, collectedRevenue: null });
    expect(data.currencyTotals).toEqual([{ currency: 'EUR', bookedRevenue: 210, collectedRevenue: 210 }, { currency: 'USD', bookedRevenue: 105, collectedRevenue: 105 }]);
    expect((await portfolio(brandAdmin, siteB)).data).toMatchObject({ totalBookings: 1, currency: 'USD', bookedRevenue: 105 });
  });
  it('preserves portfolio collection/status rules and the model bundle-child exclusion', async () => {
    await seed([{ currency: 'EUR', total: 10 }, { currency: 'EUR', total: 20, status: 'cancelled' },
      { currency: 'EUR', total: 30, status: 'pending' }, { currency: 'EUR', total: 40, bundleOrderId: new Types.ObjectId() },
      { currency: 'EUR', total: 50, paymentStatus: 'pending' }]);
    expect((await portfolio()).data).toMatchObject({ totalBookings: 4, currency: 'EUR', bookedRevenue: 60, collectedRevenue: 60 });
  });
  it('returns empty zero, known EUR and unknown currency without assuming dollars', async () => {
    expect((await portfolio()).data).toEqual({ totalBookings: 0, currency: null, currencyTotals: [], totalRevenue: 0, bookedRevenue: 0, collectedRevenue: 0 });
    await seed([{ currency: ' eur ', total: 0.1 }, { currency: 'EUR', total: 0.2 }]);
    expect((await portfolio()).data).toMatchObject({ currency: 'EUR', bookedRevenue: 0.3 });
    await seed([{ total: 12 }]);
    const mixed = (await portfolio()).data;
    expect(mixed.totalRevenue).toBeNull(); expect(mixed.currencyTotals[1]).toEqual({ currency: null, bookedRevenue: 12, collectedRevenue: 12 });
    expect((await portfolio({ role: 'manager', assignedTenants: [] })).data.currencyTotals).toEqual([]);
  });
  it.each([null, { role: 'customer' }, { role: 'viewer' }, { role: 'editor' }])('rejects unauthorized portfolio identity %s', async (user) => {
    const read = jest.spyOn(Booking, 'aggregate'); expect((await portfolio(user)).status).toBe(403); expect(read).not.toHaveBeenCalled();
  });
  it('propagates failed reads without returning zero money', async () => {
    const error = new Error('database unavailable'); jest.spyOn(Booking, 'aggregate').mockRejectedValue(error);
    const res = response(); const next = jest.fn(); await getPortfolioStats({ user: superAdmin } as unknown as AuthRequest, res, next);
    expect(next).toHaveBeenCalledWith(error); expect(res.json).not.toHaveBeenCalled();
  });
});


describe('one website analytics reports native money within its requested period', () => {
  const analytics = async (user: unknown = brandAdmin, id = String(siteA), period = '30d') => {
    const res = response(); const next = jest.fn();
    await getTenantStats({ user, params: { id }, query: { period } } as unknown as AuthRequest, res, next);
    expect(next).not.toHaveBeenCalled();
    return { status: res.status.mock.calls[0][0], ...res.json.mock.calls[0][0] };
  };
  const ago = (days: number) => new Date(Date.now() - days * 86400000);
  it('groups overview and each day by currency without adding unlike amounts', async () => {
    const date = ago(1);
    await seed([{ currency: 'USD', total: 105, createdAt: date }, { currency: 'EUR', total: 210, createdAt: date },
      { currency: 'EUR', total: 20, createdAt: ago(2), status: 'cancelled' }, { currency: 'EUR', total: 30, createdAt: ago(2), paymentStatus: 'pending' },
      { tenantId: siteB, currency: 'GBP', total: 999, createdAt: date }, { currency: 'GBP', total: 888, createdAt: ago(31) }]);
    const { data } = await analytics();
    expect(data.overview).toMatchObject({ totalBookings: 4, confirmedBookings: 3, currency: null, totalRevenue: null, bookedRevenue: null, collectedRevenue: null });
    expect(data.overview.currencyTotals).toEqual([{ currency: 'EUR', bookingCount: 3, bookedRevenue: 240, collectedRevenue: 230 }, { currency: 'USD', bookingCount: 1, bookedRevenue: 105, collectedRevenue: 105 }]);
    expect(data.dailyData).toHaveLength(2);
    expect(data.dailyData[0]).toMatchObject({ date: ago(2).toISOString().slice(0,10), bookings: 2, currency: 'EUR', revenue: 30,
      currencyTotals: [{ currency: 'EUR', bookedRevenue: 30, collectedRevenue: 20 }] });
    expect(data.dailyData[1]).toMatchObject({ bookings: 2, currency: null, revenue: null });
    expect(data.dailyData[1].currencyTotals).toHaveLength(2);
  });
  it.each([['7d', 1], ['30d', 2], ['90d', 3]])('keeps the %s period boundary', async (period, count) => {
    await seed([1, 8, 31, 91].map(days => ({ currency: 'EUR', createdAt: ago(days), total: 10 })));
    expect((await analytics(brandAdmin, String(siteA), period as string)).data.overview).toMatchObject({ totalBookings: count, currency: 'EUR', bookedRevenue: Number(count) * 10 });
  });
  it('keeps missing currency explicit and returns a distinct empty state', async () => {
    const empty = (await analytics()).data;
    expect(empty.overview).toMatchObject({ currency: null, currencyTotals: [], totalRevenue: 0 }); expect(empty.dailyData).toEqual([]);
    await seed([{ createdAt: ago(1), total: 5 }, { currency: '$', createdAt: ago(1), total: 7 }]);
    const { data } = await analytics();
    expect(data.overview).toMatchObject({ currency: null, totalRevenue: null, currencyTotals: [{ currency: null, bookedRevenue: 12, collectedRevenue: 12 }] });
    expect(data.dailyData[0]).toMatchObject({ currency: null, revenue: null, currencyTotals: [{ currency: null, bookedRevenue: 12, collectedRevenue: 12 }] });
  });
  it.each(['brand-admin', 'manager', 'editor', 'viewer'])('enforces website membership for %s', async role => {
    const actor = { role, assignedTenants: [siteA] };
    expect((await analytics(actor)).status).toBe(200);
    const read = jest.spyOn(Booking, 'aggregate');
    expect((await analytics(actor, String(siteB))).status).toBe(403); expect(read).not.toHaveBeenCalled();
  });
  it('rejects absent/customer/malformed identity before reading money and allows super admin', async () => {
    expect((await analytics(null)).status).toBe(401);
    expect((await analytics({ role: 'customer', assignedTenants: [siteA] })).status).toBe(403);
    expect((await analytics(superAdmin, 'bad-id')).status).toBe(404);
    expect((await analytics(superAdmin, String(siteB))).status).toBe(200);
  });
  it('propagates a database failure without a successful zero response', async () => {
    const error = new Error('database unavailable'); jest.spyOn(Booking, 'aggregate').mockRejectedValue(error);
    const res = response(); const next = jest.fn(); await getTenantStats({ user: brandAdmin, params: { id: String(siteA) }, query: {} } as unknown as AuthRequest, res, next);
    expect(next).toHaveBeenCalledWith(error); expect(res.json).not.toHaveBeenCalled();
  });
});
