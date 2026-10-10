import { spawnSync } from 'child_process';
import express, { NextFunction, Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from '../test/loopbackRequest';
import { Booking } from '../models/Booking';
import { getAllBookings, getBookingStats } from '../controllers/bookings.controller';
import { getAdminStats } from '../controllers/stats.controller';
import { CARD_PAYMENT_WINDOW_MS, incompleteBookingClause, isIncompleteBooking } from '../utils/incompleteBooking';
import { AuthRequest } from '../types';

// Client, 9 Oct 2026: "only we need to add In-complete … in case customer tried to do booking but no
// payment". A card checkout nobody paid is counted as In-complete, never as a booking or a cancellation.

let mockUser: Record<string, unknown> = {};
jest.mock('../middleware/auth.middleware', () => {
  const actual = jest.requireActual('../middleware/auth.middleware');
  const pass = (req: Request & { user?: unknown }, _res: Response, next: NextFunction) => { req.user = mockUser; next(); };
  return { ...actual, authenticate: pass, requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next() };
});
jest.mock('../middleware/tenant.middleware', () => ({
  ...jest.requireActual('../middleware/tenant.middleware'),
  optionalTenant: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bookingRoutes = require('../routes/bookings.routes').default;

jest.setTimeout(120_000);

let mongo: MongoMemoryServer;
const siteA = new Types.ObjectId();
const siteB = new Types.ObjectId();
const superAdmin = { role: 'super-admin', assignedTenants: [] };
const brandAdminA = { role: 'brand-admin', assignedTenants: [siteA] };
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

const response = () => {
  const res: any = {};
  res.setHeader = jest.fn();
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const stats = async (user: unknown = superAdmin) => {
  const res = response();
  const next = jest.fn();
  await getBookingStats({ user } as AuthRequest, res, next);
  expect(next).not.toHaveBeenCalled();
  return res.json.mock.calls[0][0].data;
};

const list = async (status?: string, user: unknown = superAdmin) => {
  const res = response();
  const next = jest.fn();
  await getAllBookings({ user, query: { page: '1', limit: '100', ...(status ? { status } : {}) } } as unknown as AuthRequest, res, next);
  expect(next).not.toHaveBeenCalled();
  return res.json.mock.calls[0][0] as { data: Array<{ reference: string; incomplete: boolean }>; pagination: { total: number } };
};

const refs = (rows: Array<{ reference: string }>) => rows.map((row) => row.reference).sort();

const seed = async (reference: string, fields: Record<string, unknown>) => {
  await Booking.collection.insertOne({
    _id: new Types.ObjectId(), reference, tenantId: siteA, attractionId: new Types.ObjectId(), status: 'confirmed',
    paymentStatus: 'succeeded', paymentMethod: 'card', currency: 'EUR', total: 100, subtotal: 100, items: [],
    createdAt: minutesAgo(600), updatedAt: minutesAgo(600), ...fields,
  });
};

// One of each kind of booking the Bookings page sees.
const seedAll = async () => {
  await seed('PAID', {});
  await seed('CHECKOUT-OPEN', { status: 'pending', paymentStatus: 'pending', createdAt: minutesAgo(5) });
  await seed('CHECKOUT-PAST-WINDOW', { status: 'pending', paymentStatus: 'pending', createdAt: minutesAgo(40) });
  await seed('CHECKOUT-EXPIRED', { status: 'cancelled', paymentStatus: 'failed', inventoryReleasedAt: minutesAgo(500) });
  await seed('CHECKOUT-CANCELLED-UNPAID', { status: 'cancelled', paymentStatus: 'pending' });
  await seed('CHECKOUT-PROCESSING-PAST-WINDOW', { status: 'pending', paymentStatus: 'processing', createdAt: minutesAgo(45) });
  await seed('PAID-THEN-REFUNDED', { status: 'cancelled', paymentStatus: 'refunded' });
  await seed('PAY-LATER', { paymentMethod: 'pay-later', paymentStatus: 'pending' });
  await seed('CASH-CANCELLED', { paymentMethod: 'cash', status: 'cancelled', paymentStatus: 'pending' });
  await seed('OTHER-SITE-EXPIRED', { tenantId: siteB, status: 'cancelled', paymentStatus: 'failed' });
};

const INCOMPLETE = ['CHECKOUT-CANCELLED-UNPAID', 'CHECKOUT-EXPIRED', 'CHECKOUT-PAST-WINDOW', 'CHECKOUT-PROCESSING-PAST-WINDOW', 'OTHER-SITE-EXPIRED'];

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  mongo = await MongoMemoryServer.create(systemBinary ? { binary: { systemBinary } } : {});
  await mongoose.connect(mongo.getUri('incomplete_bookings'));
});
beforeEach(async () => { await Booking.collection.deleteMany({}); });
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

describe('In-complete bookings', () => {
  it('counts unpaid card checkouts on their own, never as bookings or cancellations', async () => {
    await seedAll();
    expect(await stats()).toMatchObject({
      totalBookings: 5, // paid, the open checkout, paid-then-refunded, pay-later, cash cancelled
      confirmedBookings: 2,
      pendingBookings: 1, // only the checkout still inside its payment window
      cancelledBookings: 2, // paid-then-refunded and the cash cancellation
      refundedBookings: 1,
      incompleteBookings: 5,
    });
  });

  it("counts only the admin's own sites", async () => {
    await seedAll();
    expect(await stats(brandAdminA)).toMatchObject({ incompleteBookings: 4, cancelledBookings: 2, totalBookings: 5 });
  });

  it('lists In-complete and real cancellations through the filter, and flags each row', async () => {
    await seedAll();
    const incomplete = await list('incomplete');
    expect(refs(incomplete.data)).toEqual(INCOMPLETE);
    expect(incomplete.data.every((row) => row.incomplete)).toBe(true);
    expect(incomplete.pagination.total).toBe(5);

    expect(refs((await list('cancelled')).data)).toEqual(['CASH-CANCELLED', 'PAID-THEN-REFUNDED']);

    const all = await list();
    expect(all.pagination.total).toBe(10);
    expect(refs(all.data.filter((row) => row.incomplete))).toEqual(INCOMPLETE);
    expect(all.data.find((row) => row.reference === 'CHECKOUT-OPEN')?.incomplete).toBe(false);

    expect(refs((await list('incomplete', brandAdminA)).data)).toEqual(INCOMPLETE.filter((reference) => reference !== 'OTHER-SITE-EXPIRED'));
  });

  it('keeps the menu badge equal to the Bookings page total', async () => {
    await seedAll();
    await seed('BUNDLE-COMPONENT', { bundleOrderId: new Types.ObjectId() });
    for (const user of [superAdmin, brandAdminA]) {
      const res = response();
      const next = jest.fn();
      await getAdminStats({ user } as AuthRequest, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.json.mock.calls[0][0].data.totalBookings).toBe((await stats(user)).totalBookings);
    }
  });

  it('leaves In-complete as soon as a late payment confirms the booking', async () => {
    await seedAll();
    await Booking.collection.updateOne({ reference: 'CHECKOUT-PAST-WINDOW' }, { $set: { status: 'confirmed', paymentStatus: 'succeeded' } });
    expect(await stats()).toMatchObject({ incompleteBookings: 4, confirmedBookings: 3, totalBookings: 6 });
    expect((await list()).data.find((row) => row.reference === 'CHECKOUT-PAST-WINDOW')?.incomplete).toBe(false);
  });

  it('turns an open checkout In-complete only once its payment window has passed', () => {
    const now = new Date('2026-10-10T10:00:00.000Z');
    const at = (ms: number) => new Date(now.getTime() - ms);
    const checkout = { paymentMethod: 'card', paymentStatus: 'pending', status: 'pending' };
    expect(isIncompleteBooking({ ...checkout, createdAt: at(CARD_PAYMENT_WINDOW_MS - 1000) }, now)).toBe(false);
    expect(isIncompleteBooking({ ...checkout, createdAt: at(CARD_PAYMENT_WINDOW_MS + 1000) }, now)).toBe(true);
    expect(isIncompleteBooking({ ...checkout, createdAt: 'not a date' }, now)).toBe(false);
    expect(isIncompleteBooking({ ...checkout, paymentMethod: 'pay-later', createdAt: at(CARD_PAYMENT_WINDOW_MS * 4) }, now)).toBe(false);
    expect(isIncompleteBooking({ paymentMethod: 'card', paymentStatus: 'succeeded', status: 'cancelled' }, now)).toBe(false);
    // The query and the row rule draw the window at the same moment.
    const clause = incompleteBookingClause(now) as { $or: Array<{ createdAt?: { $lt: Date } }> };
    expect(clause.$or[1].createdAt?.$lt.toISOString()).toBe(at(CARD_PAYMENT_WINDOW_MS).toISOString());
  });

  it('accepts the In-complete filter on the admin route and still refuses an unknown status', async () => {
    await seedAll();
    mockUser = superAdmin;
    const app = express();
    app.use('/api/bookings', bookingRoutes);
    const accepted = await request(app).get('/api/bookings/admin').query({ status: 'incomplete', limit: '100' }).expect(200);
    expect(accepted.body.pagination.total).toBe(5);
    await request(app).get('/api/bookings/admin').query({ status: 'abandoned' }).expect(400);
  });
});
