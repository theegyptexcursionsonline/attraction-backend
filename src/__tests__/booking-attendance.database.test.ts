import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Booking } from '../models/Booking';
import { Tenant } from '../models/Tenant';
import { BookingAttendanceRevision } from '../models/BookingAttendanceRevision';
import { updateBookingAttendance } from '../controllers/bookingAttendance.controller';
import { getAllBookings, getBookingStats, bookingResponse } from '../controllers/bookings.controller';
import { attendanceEligibility } from '../utils/bookingAttendance';
import { AuthRequest } from '../types';

jest.setTimeout(120_000);
const site = new Types.ObjectId(), other = new Types.ObjectId(), actor = new Types.ObjectId();
let mongo: MongoMemoryReplSet;
const response = () => { const res: any = {}; res.setHeader = jest.fn(); res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res); return res; };
const seed = async (overrides: Record<string, unknown> = {}) => {
  const _id = new Types.ObjectId();
  await Booking.collection.insertOne({ _id, reference: `ATTENDANCE-${_id}`, tenantId: site, attractionId: new Types.ObjectId(), status: 'confirmed', paymentStatus: 'succeeded',
    items: [{ date: '2020-01-01', time: '09:00', optionId: 'adult', optionName: 'Adult', quantities: { adults: 1 }, unitPrice: 100, totalPrice: 100 }],
    subtotal: 100, discount: 0, fees: 5, total: 105, currency: 'EUR', paymentMethod: 'card', inventoryReserved: true,
    financeSnapshot: { version: 1, totalMinor: 10500, lines: [] }, paymentIntentId: 'preserved', refundStatus: 'none', ...overrides });
  return _id;
};
const call = async (id: unknown, body: unknown = { attendanceStatus: 'no-show', expectedRevision: 0 }, user: unknown = { _id: actor, role: 'brand-admin', assignedTenants: [site] }, active?: unknown) => {
  const res = response(), next = jest.fn();
  await updateBookingAttendance({ params: { id: String(id) }, body, user, ...(active ? { tenant: { _id: active } } : {}) } as unknown as AuthRequest, res, next);
  return { status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0], next };
};
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('booking_attendance')); await BookingAttendanceRevision.init();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => { await Promise.all([Booking.collection.deleteMany({}), Tenant.collection.deleteMany({}), BookingAttendanceRevision.deleteMany({})]); await Tenant.collection.insertOne({ _id: site, timezone: 'Africa/Cairo' }); });
afterEach(() => jest.restoreAllMocks());

it('marks and clears attendance, preserving every monetary, inventory and lifecycle field', async () => {
  const id = await seed(); const before = await Booking.collection.findOne({ _id: id });
  const first = await call(id); expect(first.status).toBe(200); expect(first.next).not.toHaveBeenCalled();
  expect(first.body.data).toMatchObject({ attendanceStatus: 'no-show', attendanceRevision: 1, status: 'confirmed', paymentStatus: 'succeeded' });
  expect((await call(id)).status).toBe(200); expect(await BookingAttendanceRevision.countDocuments()).toBe(1);
  expect((await call(id, { attendanceStatus: 'not-recorded', expectedRevision: 1 })).status).toBe(200);
  const after = await Booking.collection.findOne({ _id: id });
  for (const [key, value] of Object.entries(before!)) expect(after![key]).toEqual(value);
  expect(await BookingAttendanceRevision.countDocuments()).toBe(2);
});
it('permits undo after refund/cancellation or an invalid historical departure', async () => {
  const id = await seed({ status: 'cancelled', paymentStatus: 'refunded', cancellationRequestedAt: new Date(), attendanceStatus: 'no-show', attendanceRevision: 4, items: [] });
  expect((await call(id, { attendanceStatus: 'not-recorded', expectedRevision: 4 })).status).toBe(200);
  expect((await Booking.findById(id).lean())?.status).toBe('cancelled');
});
it.each(['pending', 'cancelled', 'refunded'])('refuses marking lifecycle %s', async status => { expect((await call(await seed({ status }))).status).toBe(409); });
it('refuses cancellation intent, future/malformed dates and a later item', async () => {
  for (const overrides of [{ cancellationRequestedAt: new Date() }, { items: [{ date: '2999-01-01' }] }, { items: [{ date: '2020-02-31' }] }, { items: [] }, { items: [{ date: '2020-01-01' }, { date: '2999-01-01' }] }]) {
    expect((await call(await seed(overrides))).status).toBe(409);
  }
});
it('uses the tenant clock and requires a date-only travel day to finish', () => {
  const now = new Date('2026-01-01T09:00:00Z');
  expect(attendanceEligibility({ status: 'confirmed', items: [{ date: '2026-01-01', time: '10:59' }] }, 'Africa/Cairo', now).canMarkNoShow).toBe(true);
  expect(attendanceEligibility({ status: 'confirmed', items: [{ date: '2026-01-01', time: '11:01' }] }, 'Africa/Cairo', now).canMarkNoShow).toBe(false);
  expect(attendanceEligibility({ status: 'confirmed', items: [{ date: '2026-01-01' }] }, 'Africa/Cairo', now).canMarkNoShow).toBe(false);
});
it('enforces identity, role, seller, active tenant and bundle boundaries', async () => {
  const id = await seed();
  expect((await call(id, undefined, null)).status).toBe(401);
  for (const role of ['customer', 'editor', 'viewer']) expect((await call(id, undefined, { _id: actor, role, assignedTenants: [site] })).status).toBe(403);
  expect((await call(id, undefined, { _id: actor, role: 'manager', assignedTenants: [other] })).status).toBe(404);
  expect((await call(id, undefined, undefined, other)).status).toBe(404);
  expect((await call('bad-id')).status).toBe(404);
  expect((await call(await seed({ tenantId: other, supplierTenantId: site, isResale: true }))).status).toBe(404);
  expect((await call(await seed({ bundleOrderId: new Types.ObjectId() }))).status).toBe(404);
});
it('refuses extra mutation fields and stale revisions', async () => {
  const id = await seed({ attendanceRevision: 2 });
  expect((await call(id)).status).toBe(409);
  expect((await call(id, { attendanceStatus: 'no-show', expectedRevision: 2, paymentStatus: 'refunded' })).status).toBe(400);
});
it('allows a single atomic winner and persists its audit exactly once', async () => {
  const id = await seed(); const results = await Promise.all([call(id), call(id)]);
  expect(results.every(result => [200, 409].includes(result.status))).toBe(true);
  expect(await BookingAttendanceRevision.countDocuments()).toBe(1);
  expect((await Booking.findById(id).lean())?.attendanceRevision).toBe(1);
});
it('rolls back a mutation when its immutable audit cannot be saved', async () => {
  const id = await seed(); jest.spyOn(BookingAttendanceRevision, 'create').mockRejectedValue(new Error('audit unavailable') as never);
  const result = await call(id); expect(result.next).toHaveBeenCalled();
  expect((await Booking.findById(id).lean())?.attendanceStatus).toBeUndefined();
});
it('guards a cancellation begun after attendance was read', async () => {
  const id = await seed(); const original = Booking.collection.findOneAndUpdate.bind(Booking.collection);
  jest.spyOn(Booking.collection, 'findOneAndUpdate').mockImplementationOnce((...args: any[]) => {
    return (async () => { await Booking.collection.updateOne({ _id: id }, { $set: { cancellationRequestedAt: new Date() } }); return original(...args as Parameters<typeof original>); })() as any;
  });
  expect((await call(id)).status).toBe(409); expect(await BookingAttendanceRevision.countDocuments()).toBe(0);
});
it('never exposes administrative actor metadata in guest booking responses', async () => {
  const id = await seed({ attendanceRecordedBy: actor, attendanceRecordedAt: new Date(), attendanceRevision: 1 });
  const result = bookingResponse((await Booking.findById(id))!);
  expect(result).not.toHaveProperty('attendanceRecordedBy'); expect(result).not.toHaveProperty('attendanceRecordedAt'); expect(result).not.toHaveProperty('attendanceRevision'); expect(result).not.toHaveProperty('financeSnapshot');
});
it('counts completed refunds once across lifecycle and payment axes, excluding partial and failed refunds', async () => {
  await seed({ status: 'cancelled', paymentStatus: 'refunded' }); await seed({ status: 'refunded', paymentStatus: 'refunded' });
  await seed({ status: 'confirmed', paymentStatus: 'succeeded', refundedAmount: 20 }); await seed({ status: 'cancelled', paymentStatus: 'succeeded', refundStatus: 'failed' });
  const res = response(), next = jest.fn();
  await getBookingStats({ user: { role: 'super-admin' } } as unknown as AuthRequest, res, next);
  expect(res.json.mock.calls[0][0].data).toMatchObject({ refundedBookings: 2, cancelledBookings: 2 });
  const list = response();
  await getAllBookings({ user: { role: 'super-admin' }, query: { status: 'refunded' } } as unknown as AuthRequest, list, next);
  expect(next).not.toHaveBeenCalled(); expect(list.json.mock.calls[0][0].data).toHaveLength(2);
});

it('hides selling-site configured expenses and attendance controls from supplier-only readers', async () => {
  await seed({ tenantId: other, supplierTenantId: site, sellerTenantId: other, isResale: true, attendanceStatus: 'no-show', revenueBreakdown: { sellerEarnings: 20, supplierEarnings: 77.1, paymentFee: 2.9, configuredBusinessFees: 3, sellerNetAfterConfiguredFees: 17 } });
  const res = response(), next = jest.fn();
  await getAllBookings({ user: { role: 'brand-admin', assignedTenants: [site] }, query: {} } as unknown as AuthRequest, res, next);
  expect(next).not.toHaveBeenCalled(); const row = res.json.mock.calls[0][0].data[0];
  expect(row.attendanceEligibility).toMatchObject({ canMarkNoShow: false, canUndoNoShow: false });
  expect(row).not.toHaveProperty('financeSnapshot'); expect(row.revenueBreakdown).not.toHaveProperty('configuredBusinessFees'); expect(row.revenueBreakdown).not.toHaveProperty('sellerNetAfterConfiguredFees');
});

it('accepts a valid Cairo daylight-saving transition day even when local midnight did not exist', () => {
  const now = new Date('2026-04-25T12:00:00Z');
  for (const item of [{ date: '2026-04-24', time: '09:00' }, { date: '2026-04-24' }]) {
    expect(attendanceEligibility({ status: 'completed', items: [item] }, 'Africa/Cairo', now).canMarkNoShow).toBe(true);
  }
});
