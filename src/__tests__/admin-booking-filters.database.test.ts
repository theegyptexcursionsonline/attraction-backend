import { spawnSync } from 'child_process';
import express, { NextFunction, Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from '../test/loopbackRequest';
import { Booking } from '../models/Booking';
import { adminBookingFiltersSchema, adminBookingFilterClauses } from '../utils/adminBookingFilters';

let mockUser: Record<string, unknown> = {};
let mockTenant: unknown;
jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
  authenticate: (req: Request & { user?: unknown }, _res: Response, next: NextFunction) => { req.user = mockUser; next(); },
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.mock('../middleware/tenant.middleware', () => ({
  ...jest.requireActual('../middleware/tenant.middleware'),
  optionalTenant: (req: Request & { tenant?: unknown }, _res: Response, next: NextFunction) => { req.tenant = mockTenant; next(); },
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const routes = require('../routes/bookings.routes').default;
const app = express(); app.use('/bookings', routes);
const a = new Types.ObjectId(), b = new Types.ObjectId(), product = new Types.ObjectId();
let mongo: MongoMemoryServer;
jest.setTimeout(120000);
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  mongo = await MongoMemoryServer.create(located.status === 0 ? { binary: { systemBinary: located.stdout.trim() } } : {});
  await mongoose.connect(mongo.getUri('booking_filters'));
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => { await Booking.collection.deleteMany({}); mockUser = { role: 'super-admin', assignedTenants: [] }; mockTenant = undefined; });
const seed = (reference: string, fields: Record<string, unknown> = {}) => Booking.collection.insertOne({
  _id: new Types.ObjectId(), reference, tenantId: a, attractionId: product, status: 'confirmed',
  paymentStatus: 'succeeded', paymentMethod: 'card', total: 100, currency: 'EUR',
  items: [{ date: '2026-10-20' }], createdAt: new Date('2026-10-11T12:00:00Z'), ...fields,
});
const list = (query: Record<string, string> = {}) => request(app).get('/bookings/admin').query(query);
const refs = (result: any) => result.body.data.map((row: any) => row.reference).sort();

it.each([
  { activityFrom: '2026-02-30' }, { purchaseTo: '2026-13-01' }, { activityTo: 'x' },
  { activityFrom: '2026-10-21', activityTo: '2026-10-20' },
  { purchaseFrom: '2026-10-12', purchaseTo: '2026-10-11' },
  { startDate: 'invalid' }, { startDate: '2026-10-12T00:00:00Z', endDate: '2026-10-11T00:00:00Z' },
  { purchaseFrom: '2026-10-11', startDate: '2026-10-11T00:00:00Z' },
  { productId: 'invalid' }, { brandId: '.*' }, { brandId: { $ne: '' } },
])('rejects malformed or ambiguous filters %j', async query => {
  expect(adminBookingFiltersSchema.safeParse(query).success).toBe(false);
  await list(query as unknown as Record<string, string>).expect(400);
});
it('applies product, selling brand, purchase, activity and status together before pagination', async () => {
  await seed('MATCH'); await seed('OTHER-PRODUCT', { attractionId: new Types.ObjectId() });
  await seed('OTHER-BRAND', { tenantId: b }); await seed('OTHER-DAY', { items: [{ date: '2026-10-21' }] });
  await seed('OTHER-PURCHASE', { createdAt: new Date('2026-10-12T00:00:00Z') });
  await seed('OTHER-STATUS', { status: 'completed' });
  const result = await list({ productId: String(product), brandId: String(a), purchaseFrom: '2026-10-11', purchaseTo: '2026-10-11', activityFrom: '2026-10-20', activityTo: '2026-10-20', status: 'confirmed' }).expect(200);
  expect(refs(result)).toEqual(['MATCH']); expect(result.body.pagination.total).toBe(1);
});
it('includes both UTC purchase boundaries and supports open-ended dates', async () => {
  await seed('START', { createdAt: new Date('2026-10-11T00:00:00.000Z') });
  await seed('END', { createdAt: new Date('2026-10-11T23:59:59.999Z') });
  await seed('OUTSIDE', { createdAt: new Date('2026-10-12T00:00:00Z') });
  expect(refs(await list({ purchaseFrom: '2026-10-11', purchaseTo: '2026-10-11' }).expect(200))).toEqual(['END', 'START']);
  expect(refs(await list({ purchaseFrom: '2026-10-12' }).expect(200))).toEqual(['OUTSIDE']);
  expect(refs(await list({ startDate: '2026-10-11T00:00:00Z', endDate: '2026-10-11T23:59:59.999Z' }).expect(200))).toEqual(['END', 'START']);
});
it('requires both activity bounds on one item and excludes missing dates', async () => {
  await seed('SPANNING', { items: [{ date: '2026-10-01' }, { date: '2026-10-30' }] });
  await seed('MISSING', { items: [] }); await seed('MATCH');
  expect(refs(await list({ activityFrom: '2026-10-20', activityTo: '2026-10-20' }).expect(200))).toEqual(['MATCH']);
  expect(refs(await list({ activityFrom: '2026-10-25' }).expect(200))).toEqual(['SPANNING']);
  expect(refs(await list({ activityTo: '2026-10-02' }).expect(200))).toEqual(['SPANNING']);
});
it('cannot widen assigned-site or selected-site scope or probe a hidden reseller', async () => {
  await seed('OWN'); await seed('FOREIGN', { tenantId: b });
  await seed('RESALE', { tenantId: b, sellerTenantId: b, supplierTenantId: a, isResale: true });
  mockUser = { role: 'viewer', assignedTenants: [a] };
  expect(refs(await list().expect(200))).toEqual(['OWN', 'RESALE']);
  expect(refs(await list({ brandId: String(b) }).expect(200))).toEqual([]);
  expect(refs(await list({ brandId: String(new Types.ObjectId()) }).expect(200))).toEqual([]);
  expect(refs(await list({ brandId: String(a) }).expect(200))).toEqual(['OWN']);
  mockUser = { role: 'super-admin', assignedTenants: [] }; mockTenant = { _id: a };
  expect(refs(await list({ brandId: String(b) }).expect(200))).toEqual([]);
  mockUser = { role: 'viewer', assignedTenants: [] }; mockTenant = undefined;
  expect(refs(await list({ productId: String(product) }).expect(200))).toEqual([]);
});
it('keeps the last filtered page reachable with a stable order', async () => {
  for (let i = 0; i < 23; i++) await seed(`ROW-${String(i).padStart(2, '0')}`);
  await seed('EXCLUDED', { attractionId: new Types.ObjectId() });
  const first = await list({ productId: String(product), page: '1', limit: '20' }).expect(200);
  const tail = await list({ productId: String(product), page: '2', limit: '20' }).expect(200);
  expect(first.body.data).toHaveLength(20); expect(tail.body.data).toHaveLength(3);
  expect(new Set([...refs(first), ...refs(tail)]).size).toBe(23);
  expect(tail.body.pagination.total).toBe(23);
});
it('does not add constraints for empty optional filters', () => {
  expect(adminBookingFilterClauses({}, 'viewer', [a])).toEqual([]);
});
