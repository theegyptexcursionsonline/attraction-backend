import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';
import statsRoutes from '../routes/stats.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Review } from '../models/Review';
import { Booking } from '../models/Booking';

jest.setTimeout(120_000);
const app = express();
app.use('/stats', statsRoutes);
app.use((_error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ success: false, error: 'Source unavailable' });
});
const a = new Types.ObjectId();
const b = new Types.ObjectId();
const empty = new Types.ObjectId();
const inactive = new Types.ObjectId();
const aTour = new Types.ObjectId();
const sharedTour = new Types.ObjectId();
const bTour = new Types.ObjectId();
const retiredTour = new Types.ObjectId();
const orphanTour = new Types.ObjectId();
const aStats = { totalAttractions: 2, totalDestinations: 2, totalReviews: 2, averageRating: 4, totalBookings: 2 };
const bStats = { totalAttractions: 2, totalDestinations: 2, totalReviews: 2, averageRating: 2, totalBookings: 1 };
const zeroStats = { totalAttractions: 0, totalDestinations: 0, totalReviews: 0, averageRating: 0, totalBookings: 0 };
let mongo: MongoMemoryServer;

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('homepage_stats'));
  await Promise.all([Tenant.init(), Attraction.init(), Review.init(), Booking.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
afterEach(() => jest.restoreAllMocks());
beforeEach(async () => {
  await Promise.all([Tenant, Attraction, Review, Booking].map(model => model.collection.deleteMany({})));
  await Tenant.collection.insertMany([
    { _id: a, name: 'Cruise A', slug: 'cruise-a', domain: 'cruise-a.network.invalid', customDomain: 'cruise-a.invalid', status: 'active' },
    { _id: b, name: 'Cruise B', slug: 'cruise-b', domain: 'cruise-b.invalid', status: 'active' },
    { _id: empty, name: 'Empty cruise', slug: 'cruise-empty', domain: 'cruise-empty.invalid', status: 'active' },
    { _id: inactive, name: 'Inactive cruise', slug: 'cruise-inactive', domain: 'cruise-inactive.invalid', status: 'inactive' },
  ]);
  await Attraction.collection.insertMany([
    { _id: aTour, title: 'A cruise', slug: 'a-cruise', tenantIds: [a], status: 'active', destination: { city: 'Hurghada' } },
    { _id: sharedTour, title: 'Shared cruise', slug: 'shared-cruise', tenantIds: [a, b], status: 'active', destination: { city: 'Makadi' } },
    { _id: bTour, title: 'B cruise', slug: 'b-cruise', tenantIds: [b], status: 'active', destination: { city: 'Luxor' } },
    { _id: retiredTour, title: 'Retired cruise', slug: 'retired-cruise', tenantIds: [a], status: 'archived', destination: { city: 'Aswan' } },
  ]);
  await Review.collection.insertMany([
    { attractionId: aTour, rating: 5, status: 'approved' },
    { attractionId: sharedTour, rating: 3, status: 'approved' },
    { attractionId: bTour, rating: 1, status: 'approved' },
    { attractionId: retiredTour, rating: 5, status: 'approved' },
    { attractionId: orphanTour, rating: 2, status: 'approved' },
    { attractionId: aTour, rating: 1, status: 'pending' },
    { attractionId: aTour, rating: 1, status: 'rejected' },
  ]);
  await Booking.collection.insertMany([
    { tenantId: a, attractionId: aTour, status: 'confirmed', reference: 'QA-A-CONFIRMED' },
    { tenantId: a, attractionId: sharedTour, status: 'completed', reference: 'QA-A-COMPLETED' },
    { tenantId: a, attractionId: aTour, status: 'cancelled', reference: 'QA-A-CANCELLED' },
    // A shared attraction does not make a different seller's booking belong to A.
    { tenantId: b, attractionId: sharedTour, status: 'confirmed', reference: 'QA-B-CONFIRMED' },
  ]);
});

it.each(['cruise-a', String(a), 'cruise-a.invalid', 'cruise-a.network.invalid'])('scopes every aggregate for tenant identifier %s', async tenantId => {
  const result = await request(app).get('/stats/homepage').query({ tenantId }).expect(200);
  expect(result.body.data).toEqual(aStats);
});
it('supports tenant alias and header selection, with header precedence and cache separation', async () => {
  expect((await request(app).get('/stats/homepage?tenant=cruise-a').expect(200)).body.data).toEqual(aStats);
  const selected = await request(app).get('/stats/homepage?tenantId=cruise-b').set('X-Tenant-ID', 'cruise-a').expect(200);
  expect(selected.body.data).toEqual(aStats);
  expect(selected.headers.vary).toContain('X-Tenant-ID');
  expect(selected.headers['cache-control']).toBe('private, max-age=120');
});
it('isolates parallel tenant reads and includes shared-tour reviews exactly once', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => request(app).get('/stats/homepage').query({ tenantId: index % 2 ? 'cruise-b' : 'cruise-a' }).expect(200)));
  results.forEach((result, index) => expect(result.body.data).toEqual(index % 2 ? bStats : aStats));
});
it('returns truthful zeros for an empty tenant, without marketplace or invented rating fallback', async () => {
  expect((await request(app).get('/stats/homepage?tenantId=cruise-empty').expect(200)).body.data).toEqual(zeroStats);
});
it('keeps unselected marketplace totals across all approved reviews', async () => {
  const result = await request(app).get('/stats/homepage').expect(200);
  expect(result.body.data).toEqual({ totalAttractions: 3, totalDestinations: 3, totalReviews: 5, averageRating: 3.2, totalBookings: 3 });
  await Review.collection.deleteMany({});
  const withoutReviews = await request(app).get('/stats/homepage').expect(200);
  expect(withoutReviews.body.data.totalReviews).toBe(0);
  expect(withoutReviews.body.data.averageRating).toBe(0);
});
it.each(['unknown', String(new Types.ObjectId()), 'cruise-inactive', String(inactive)])('fails closed for unavailable tenant %s', async tenantId => {
  const count = jest.spyOn(Attraction, 'countDocuments');
  await request(app).get('/stats/homepage').query({ tenantId }).expect(404);
  await request(app).get('/stats/homepage').set('X-Tenant-ID', tenantId).expect(404);
  expect(count).not.toHaveBeenCalled();
});
it.each(['tenantId=', 'tenant=', 'tenantId=%20', 'tenantId=cruise-a&tenantId=cruise-b', 'tenantId%5B%24ne%5D=missing', 'tenant%5B%5D=cruise-a'])('rejects malformed selector %s without marketplace fallback', async query => {
  const count = jest.spyOn(Attraction, 'countDocuments');
  await request(app).get(`/stats/homepage?${query}`).expect(400);
  expect(count).not.toHaveBeenCalled();
});
it('rejects an empty tenant header', async () => {
  await request(app).get('/stats/homepage').set('X-Tenant-ID', '').expect(400);
});
it('propagates source failure, never publishes partial totals, and recovers on retry', async () => {
  const failedRead = jest.spyOn(Attraction, 'countDocuments').mockRejectedValueOnce(new Error('database unavailable'));
  const failed = await request(app).get('/stats/homepage?tenantId=cruise-a').expect(500);
  expect(failed.body.data).toBeUndefined();
  expect(failed.headers['cache-control']).toBeUndefined();
  failedRead.mockRestore();
  expect((await request(app).get('/stats/homepage?tenantId=cruise-a').expect(200)).body.data).toEqual(aStats);
});
it('does not query global totals when tenant resolution fails', async () => {
  jest.spyOn(Tenant, 'findOne').mockRejectedValueOnce(new Error('tenant database unavailable'));
  const count = jest.spyOn(Attraction, 'countDocuments');
  await request(app).get('/stats/homepage?tenantId=cruise-a').expect(500);
  expect(count).not.toHaveBeenCalled();
});
