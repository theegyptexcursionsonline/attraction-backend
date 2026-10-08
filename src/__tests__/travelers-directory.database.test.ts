/**
 * The traveller directory against a real database: guest checkouts (no account) appear, accounts
 * without bookings appear for a super admin only, and a brand admin sees only their brand's
 * bookings in each row.
 */
import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Booking } from '../models/Booking';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { getTravelerDetail, getTravelers } from '../controllers/users.controller';
import { AuthRequest } from '../types';

jest.setTimeout(120_000);
let mongo: MongoMemoryServer;
const brandA = new Types.ObjectId();
const brandB = new Types.ObjectId();

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const call = async (handler: typeof getTravelers, query: Record<string, unknown>, user: Record<string, unknown>) => {
  const res = response();
  const next = jest.fn();
  await handler({ query, user } as unknown as AuthRequest, res, next);
  expect(next).not.toHaveBeenCalled();
  return { status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0] };
};

const booking = (tenantId: Types.ObjectId, email: string, total: number, currency: string, createdAt: string, firstName = 'Guest') => ({
  tenantId, reference: `R-${new Types.ObjectId()}`, attractionId: new Types.ObjectId(), status: 'confirmed', paymentStatus: 'paid',
  total, subtotal: total, currency, createdAt: new Date(createdAt),
  guestDetails: { firstName, lastName: 'Lead', email, phone: '+20 100', country: 'EG', specialRequests: 'Vegetarian' },
  items: [{ optionId: 'o', optionName: 'Morning', date: '2026-11-01', time: '08:00', quantities: { adults: 2, children: 1, infants: 0 }, unitPrice: 10, totalPrice: total }],
});

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  mongo = await MongoMemoryServer.create(systemBinary ? { binary: { systemBinary } } : {});
  await mongoose.connect(mongo.getUri('travelers_directory'));
  await Tenant.collection.insertMany([
    { _id: brandA, slug: 'brand-a', domain: 'a.invalid', name: 'Brand A' },
    { _id: brandB, slug: 'brand-b', domain: 'b.invalid', name: 'Brand B' },
  ]);
  await Booking.collection.insertMany([
    booking(brandA, 'walkin@example.test', 100, 'USD', '2026-09-01T00:00:00Z', 'Walk'),
    booking(brandB, 'walkin@example.test', 50, 'EUR', '2026-09-03T00:00:00Z', 'Walker'),
    booking(brandA, 'walkin@example.test', 20, 'USD', '2026-08-01T00:00:00Z', 'Walk'),
    booking(brandB, 'member@example.test', 75, 'USD', '2026-09-02T00:00:00Z', 'Member'),
    { ...booking(brandA, 'bundle@example.test', 999, 'USD', '2026-09-04T00:00:00Z'), bundleOrderId: new Types.ObjectId() },
  ]);
  await User.collection.insertMany([
    { email: 'member@example.test', firstName: 'Mem', lastName: 'Ber', role: 'customer', status: 'active', password: 'x', createdAt: new Date('2026-07-01T00:00:00Z') },
    { email: 'browser@example.test', firstName: 'Just', lastName: 'Browsing', role: 'customer', status: 'active', password: 'x', createdAt: new Date('2026-06-01T00:00:00Z') },
  ]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

it('shows a super admin guest checkouts, account holders and accounts without bookings, newest first', async () => {
  const { body } = await call(getTravelers, {}, { role: 'super-admin', assignedTenants: [] });
  const rows = body.data.data;
  expect(rows.map((row: { email: string }) => row.email)).toEqual(['walkin@example.test', 'member@example.test', 'browser@example.test']);
  const walkin = rows[0];
  expect(walkin).toMatchObject({ hasAccount: false, status: 'guest', firstName: 'Walker', bookingCount: 3 });
  expect(walkin.spendingByCurrency).toEqual(expect.arrayContaining([{ currency: 'USD', total: 120 }, { currency: 'EUR', total: 50 }]));
  expect(walkin.brands.map((brand: { name: string }) => brand.name).sort()).toEqual(['Brand A', 'Brand B']);
  expect(walkin.latestBooking).toMatchObject({ currency: 'EUR', brand: { name: 'Brand B' } });
  expect(rows[1]).toMatchObject({ hasAccount: true, status: 'active', firstName: 'Mem', bookingCount: 1 });
  expect(rows[2]).toMatchObject({ hasAccount: true, bookingCount: 0, latestBooking: null });
});

it('limits a brand admin to their brand bookings', async () => {
  const { body } = await call(getTravelers, {}, { role: 'brand-admin', assignedTenants: [brandA] });
  expect(body.data.data).toHaveLength(1);
  expect(body.data.data[0]).toMatchObject({ email: 'walkin@example.test', bookingCount: 2, spendingByCurrency: [{ currency: 'USD', total: 120 }] });
});

it('filters guests and pages with a cursor', async () => {
  const guests = await call(getTravelers, { status: 'guest' }, { role: 'super-admin', assignedTenants: [] });
  expect(guests.body.data.data.map((row: { email: string }) => row.email)).toEqual(['walkin@example.test']);
  const first = await call(getTravelers, { limit: '2' }, { role: 'super-admin', assignedTenants: [] });
  expect(first.body.data.pagination).toEqual({ limit: 2, hasMore: true, nextCursor: '2' });
  const second = await call(getTravelers, { limit: '2', cursor: '2' }, { role: 'super-admin', assignedTenants: [] });
  expect(second.body.data.data.map((row: { email: string }) => row.email)).toEqual(['browser@example.test']);
});

it('returns full traveller details with every scoped booking', async () => {
  const { body } = await call(getTravelerDetail, { email: 'walkin@example.test' }, { role: 'super-admin', assignedTenants: [] });
  expect(body.data.bookings).toHaveLength(3);
  expect(body.data.bookings[0]).toMatchObject({ brand: { name: 'Brand B' }, specialRequests: 'Vegetarian', guests: { adults: 2, children: 1, infants: 0 } });
  expect(body.data.contacts.map((contact: { firstName: string }) => contact.firstName)).toEqual(['Walker', 'Walk']);

  const scoped = await call(getTravelerDetail, { email: 'member@example.test' }, { role: 'brand-admin', assignedTenants: [brandA] });
  expect(scoped.status).toBe(404);
});
