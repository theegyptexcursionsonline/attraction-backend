import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import attractionRoutes from '../routes/attractions.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import blogRoutes from '../routes/blog.routes';
import { BlogPost } from '../models/BlogPost';

jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
  optionalAuth: (req: any, _res: any, next: any) => {
    if (req.header('x-test-role')) req.user = { _id: new Types.ObjectId(), role: req.header('x-test-role'), assignedTenants: req.header('x-test-assigned')?.split(',') || [] };
    next();
  },
  authenticate: (req: any, res: any, next: any) => {
    const role = req.header('x-test-role');
    if (!role) return res.status(401).json({ success: false });
    req.user = { _id: new Types.ObjectId(), role, assignedTenants: req.header('x-test-assigned')?.split(',') || [] };
    next();
  },
}));
jest.setTimeout(120_000);
const owner = new Types.ObjectId(), other = new Types.ObjectId();
const app = express();
app.use(express.json()); app.use('/attractions', attractionRoutes); app.use('/blog', blogRoutes);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ success: false, error: error.message }));
const auth = (req: request.Test, assigned = owner, role = 'brand-admin') => req.set('x-test-role', role).set('x-test-assigned', String(assigned));
let mongo: MongoMemoryReplSet;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('catalogue_cursor'));
  await Promise.all([Tenant.init(), Attraction.init(), BlogPost.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  process.env.URL_NAMESPACE_WRITES_READY = 'true';
  await Tenant.collection.deleteMany({}); await Attraction.collection.deleteMany({}); await BlogPost.collection.deleteMany({});
  await Tenant.collection.insertMany([owner, other].map((_id, index) => ({ _id, slug: `status-site-${index}`, name: `Status site ${index}`, domain: `status-site-${index}.invalid`, status: 'active', customPages: [] })));
});
afterEach(() => jest.restoreAllMocks());

const catalogue = (query: Record<string, unknown> = {}, tenant = owner) => request(app).get('/attractions').query({ tenantId: String(tenant), pagination: 'cursor', limit: 24, ...query });
const journal = (query: Record<string, unknown> = {}, tenant = 'status-site-0') => request(app).get('/blog').query({ tenant, pagination: 'cursor', limit: 24, ...query });
async function seedTours() {
  await Attraction.collection.insertMany(Array.from({ length: 57 }, (_, i) => ({ _id: new Types.ObjectId(), slug: `tour-${i}`, title: i === 56 ? 'Unique reef expedition' : `Cruise ${i}`, status: 'active', tenantIds: [owner], category: i === 56 ? 'tail-category' : 'boats', priceFrom: i, rating: i % 4, featured: i % 2 === 0, images: [], destination: { city: i === 56 ? 'Tail port' : 'Hurghada' }, currency: 'EUR', createdAt: new Date('2026-01-01') })));
  await Attraction.collection.insertMany([{ slug: 'private', title: 'Private', status: 'draft', tenantIds: [owner], priceFrom: 1 }, { slug: 'foreign', title: 'Foreign', status: 'active', tenantIds: [other], priceFrom: 1 }]);
}
async function seedPosts() {
  await BlogPost.collection.insertMany(Array.from({ length: 53 }, (_, i) => ({ _id: new Types.ObjectId(), tenantId: 'status-site-0', tenantRef: owner, slug: `post-${i}`, title: i === 52 ? 'Unique reef notes' : `Travel ${i}`, excerpt: 'Published notes', content: 'Full content withheld from list', status: 'published', ...(i % 5 ? { publishedAt: new Date('2026-01-01') } : {}) })));
  await BlogPost.collection.insertMany([{ tenantId: 'status-site-0', tenantRef: owner, slug: 'draft', title: 'Draft', status: 'draft' }, { tenantId: 'status-site-0', tenantRef: other, slug: 'foreign-ref', title: 'Foreign join', status: 'published' }, { tenantId: 'status-site-1', tenantRef: other, slug: 'foreign', title: 'Foreign tenant', status: 'published' }]);
}
it.each(['recommended', 'price-low', 'price-high', 'rating', '-createdAt'])('reaches all57 tours with deterministic forward/backward DB cursors (%s)', async sort => {
  await seedTours();
  const first = (await catalogue({ sort }).expect(200)).body;
  const second = (await catalogue({ sort, cursor: first.pagination.nextCursor }).expect(200)).body;
  const third = (await catalogue({ sort, cursor: second.pagination.nextCursor }).expect(200)).body;
  const rows = [...first.data, ...second.data, ...third.data];
  expect(rows).toHaveLength(57); expect(new Set(rows.map(row => row._id)).size).toBe(57);
  expect(first.pagination.total).toBe(57); expect(first.pagination.previousCursor).toBeNull(); expect(third.pagination.nextCursor).toBeNull();
  const previous = (await catalogue({ sort, cursor: third.pagination.previousCursor }).expect(200)).body;
  expect(previous.data.map((row: any) => row._id)).toEqual(second.data.map((row: any) => row._id));
  if (sort === 'price-low') expect(rows.map(row => row.priceFrom)).toEqual(Array.from({ length: 57 }, (_, i) => i));
  if (sort === 'price-high') expect(rows.map(row => row.priceFrom)).toEqual(Array.from({ length: 57 }, (_, i) => 56 - i));
  expect(rows.every(row => row.tenantIds === undefined && row.status === 'active')).toBe(true);
});
it('filters the full catalogue on the server and refuses changed-filter or foreign-tenant cursors', async () => {
  await seedTours();
  const first = (await catalogue().expect(200)).body;
  for (const filter of [{ search: 'Unique' }, { category: 'tail-category' }, { destination: 'Tail port' }]) {
    const response = (await catalogue(filter).expect(200)).body;
    expect(response.data.map((row: any) => row.slug)).toEqual(['tour-56']);
    await catalogue({ ...filter, cursor: first.pagination.nextCursor }).expect(400);
  }
  await catalogue({ cursor: first.pagination.nextCursor }, other).expect(400);
  await catalogue({ cursor: 'invalid' }).expect(400);
  await catalogue({}, new Types.ObjectId()).expect(404);
  await catalogue({ sort: 'hostile' }).expect(400);
});
it('public cursor reads stay public for signed-in admins, while old page clients retain their response', async () => {
  await seedTours();
  const publicRead = await auth(catalogue({ status: 'draft' })).expect(200);
  expect(publicRead.body.pagination.total).toBe(57); expect(publicRead.body.data.every((row: any) => row.status === 'active' && row.tenantIds === undefined)).toBe(true);
  await auth(catalogue({ scope: 'admin' })).expect(400);
  const legacy = await request(app).get('/attractions').query({ tenantId: String(owner), page: 2, limit: 20 }).expect(200);
  expect(legacy.body.pagination).toMatchObject({ page: 2, total: 57, totalPages: 3 });
});
it.each(['newest', 'oldest'])('reaches the53-post journal tail with tied and missing publication dates (%s)', async sort => {
  await seedPosts();
  const first = (await journal({ sort }).expect(200)).body;
  const second = (await journal({ sort, cursor: first.pagination.nextCursor }).expect(200)).body;
  const third = (await journal({ sort, cursor: second.pagination.nextCursor }).expect(200)).body;
  const rows = [...first.data, ...second.data, ...third.data];
  expect(rows).toHaveLength(53); expect(new Set(rows.map(row => row._id)).size).toBe(53); expect(first.pagination.total).toBe(53);
  expect(rows.every(row => row.content === undefined && row.tenantRef === undefined)).toBe(true);
  expect(third.pagination.nextCursor).toBeNull();
  const previous = (await journal({ sort, cursor: third.pagination.previousCursor }).expect(200)).body;
  expect(previous.data).toEqual(second.data);
});
it('journal search reaches the tail and fails closed on malformed, foreign, unknown or unavailable scope', async () => {
  await seedPosts();
  const first = (await journal().expect(200)).body;
  expect((await journal({ search: 'Unique reef' }).expect(200)).body.data.map((row: any) => row.slug)).toEqual(['post-52']);
  await journal({ search: 'Unique', cursor: first.pagination.nextCursor }).expect(400);
  await journal({ cursor: first.pagination.nextCursor }, 'status-site-1').expect(400);
  await journal({}, 'missing-site').expect(404);
  await journal({ cursor: 'bad' }).expect(400);
  await journal({ limit: -1 }).expect(400);
  const failing = jest.spyOn(BlogPost, 'aggregate').mockRejectedValueOnce(new Error('source unavailable'));
  await journal().expect(500); failing.mockRestore();
  expect((await journal().expect(200)).body.pagination.total).toBe(53);
  const legacy = await request(app).get('/blog').query({ tenant: 'status-site-0' }).expect(200);
  expect(legacy.body.data).toHaveLength(24);
});

it('route-status resolves public canonical identity without shipping tour copy or private fields', async () => {
  await seedTours();
  await Attraction.collection.updateOne({ slug: 'tour-0' }, { $set: { pathSlug: 'clean-cruise', description: 'Long public copy '.repeat(1000) } });
  const route = (slug: string, tenant = owner) => request(app).get(`/attractions/${slug}/route-status`).query({ tenantId: String(tenant) });
  const response = await route('clean-cruise').expect(200);
  expect(response.body.data).toMatchObject({ slug: 'tour-0', pathSlug: 'clean-cruise', status: 'active', bookingTenantSlug: 'status-site-0' });
  expect(Object.keys(response.body.data).sort()).toEqual(['_id', 'bookingTenantSlug', 'pathSlug', 'slug', 'status']);
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(JSON.stringify(response.body).length).toBeLessThan(400);
  await route('private').expect(404); await route('clean-cruise', other).expect(404); await route('missing').expect(404);
  await request(app).get('/attractions/clean-cruise/route-status').expect(400);
  const unavailable = jest.spyOn(Attraction, 'findOne').mockImplementationOnce(() => { throw new Error('unavailable'); });
  await route('clean-cruise').expect(500); unavailable.mockRestore();
  await route('clean-cruise').expect(200);
});


it('exposes truthful article sitemap identity and modification time in both journal list modes',async()=>{
  await seedPosts(); const updatedAt=new Date('2026-09-23T09:30:00.000Z');
  await BlogPost.collection.updateMany({tenantId:'status-site-0'},{$set:{updatedAt}});
  for(const query of [{pagination:'cursor'},{}]) {
    const response=await request(app).get('/blog').query({tenant:'status-site-0',limit:50,...query}).expect(200);
    expect(response.body.data).toHaveLength(50);
    for(const row of response.body.data) {
      expect(row).toMatchObject({tenantId:'status-site-0',status:'published',updatedAt:updatedAt.toISOString()});
      expect(row).not.toHaveProperty('content');expect(row).not.toHaveProperty('tenantRef');
      expect(['draft','foreign','foreign-ref']).not.toContain(row.slug);
    }
  }
});
