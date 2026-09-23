import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import attractionRoutes from '../routes/attractions.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { updateAttractionRequestSchema } from '../utils/validators';

jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
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
app.use(express.json()); app.use('/attractions', attractionRoutes);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ success: false, error: error.message }));
const auth = (req: request.Test, assigned = owner, role = 'brand-admin') => req.set('x-test-role', role).set('x-test-assigned', String(assigned));
const patch = (id: string, body: object, assigned = owner) => auth(request(app).patch(`/attractions/${id}`), assigned).send(body);
let mongo: MongoMemoryReplSet;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('status_cas'));
  await Promise.all([Tenant.init(), Attraction.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  process.env.URL_NAMESPACE_WRITES_READY = 'true';
  await Tenant.collection.deleteMany({}); await Attraction.collection.deleteMany({});
  await Tenant.collection.insertMany([owner, other].map((_id, index) => ({ _id, slug: `status-site-${index}`, name: `Status site ${index}`, domain: `status-site-${index}.invalid`, status: 'active', customPages: [] })));
});
afterEach(() => jest.restoreAllMocks());
const draft = async () => (await auth(request(app).post('/attractions')).send({ title: 'Unfinished cruise', slug: `cruise-${new Types.ObjectId()}`, status: 'draft', tenantIds: [String(owner)] }).expect(201)).body.data;

it('retains expectedStatus in both parsed update branches and rejects invalid values', () => {
  for (const expectedStatus of ['draft', 'active', 'archived']) {
    expect(updateAttractionRequestSchema.parse({ status: 'draft', priceFrom: 0, expectedStatus })).toMatchObject({ expectedStatus, priceFrom: 0 });
    expect(updateAttractionRequestSchema.parse({ seo: { metaTitle: 'Edited title' }, expectedStatus })).toMatchObject({ expectedStatus });
  }
  for (const expectedStatus of ['inactive', '', null, 0, { $ne: 'active' }]) {
    expect(updateAttractionRequestSchema.safeParse({ status: 'draft', expectedStatus }).success).toBe(false);
    expect(updateAttractionRequestSchema.safeParse({ seo: { metaTitle: 'Title' }, expectedStatus }).success).toBe(false);
  }
});
it('saves incomplete drafts with zero price and never persists the guard', async () => {
  const tour = await draft();
  const saved = await patch(tour._id, { status: 'draft', expectedStatus: 'draft', priceFrom: 0, duration: '', description: '' }).expect(200);
  expect(saved.body.data).toMatchObject({ status: 'draft', priceFrom: 0, duration: '', description: '', presentationRevision: 1 });
  expect(saved.body.data.expectedStatus).toBeUndefined();
  expect(await Attraction.collection.findOne({ _id: new Types.ObjectId(tour._id) })).not.toHaveProperty('expectedStatus');
});
it('accepts an explicit guarded active-to-draft transition and preserves legacy saves', async () => {
  const tour = await draft();
  await Attraction.collection.updateOne({ _id: new Types.ObjectId(tour._id) }, { $set: { status: 'active' } });
  await patch(tour._id, { status: 'draft', expectedStatus: 'active', priceFrom: 0 }).expect(200);
  await patch(tour._id, { status: 'draft', priceFrom: 2 }).expect(200);
  expect((await Attraction.findById(tour._id).lean())?.priceFrom).toBe(2);
});
it.each([false, true])('rejects stale lifecycle state without any partial writes (presentation=%s)', async presentation => {
  const tour = await draft();
  await Attraction.collection.updateOne({ _id: new Types.ObjectId(tour._id) }, { $set: { status: 'active' } });
  const before = await Attraction.collection.findOne({ _id: new Types.ObjectId(tour._id) });
  await patch(tour._id, { status: 'draft', expectedStatus: 'draft', priceFrom: 7, ...(presentation ? { seo: { ogImage: 'https://images.invalid/social.jpg' }, expectedPresentationRevision: 0 } : {}) }).expect(409);
  expect(await Attraction.collection.findOne({ _id: new Types.ObjectId(tour._id) })).toEqual(before);
});
it.each([false, true])('atomically rejects publication between preflight and mutation (presentation=%s)', async presentation => {
  const tour = await draft();
  const original = Attraction.findOneAndUpdate.bind(Attraction);
  let storedAfterPublish: unknown;
  jest.spyOn(Attraction, 'findOneAndUpdate').mockImplementationOnce(((...args: Parameters<typeof original>) => {
    expect(args[0]).toMatchObject({ _id: tour._id, status: 'draft', tenantIds: { $in: [String(owner)] } });
    expect(args[1]?.$set).not.toHaveProperty('expectedStatus');
    return (async () => {
      await Attraction.collection.updateOne({ _id: new Types.ObjectId(tour._id) }, { $set: { status: 'active' } });
      storedAfterPublish = await Attraction.collection.findOne({ _id: new Types.ObjectId(tour._id) });
      return original(...args);
    })();
  }) as any);
  await patch(tour._id, { status: 'draft', expectedStatus: 'draft', priceFrom: 7, ...(presentation ? { seo: { ogImage: 'https://images.invalid/social.jpg' }, expectedPresentationRevision: 0 } : {}) }).expect(409);
  expect(await Attraction.collection.findOne({ _id: new Types.ObjectId(tour._id) })).toEqual(storedAfterPublish);
});
it('enforces authentication, authoring roles and tenant scope before revealing lifecycle state', async () => {
  const tour = await draft();
  const changes = { status: 'draft', expectedStatus: 'active', priceFrom: 7 };
  await request(app).patch(`/attractions/${tour._id}`).send(changes).expect(401);
  await auth(request(app).patch(`/attractions/${tour._id}`), owner, 'viewer').send(changes).expect(403);
  await patch(tour._id, changes, other).expect(404);
  await patch(String(new Types.ObjectId()), changes, other).expect(404);
  expect((await Attraction.findById(tour._id).lean())?.status).toBe('draft');
});
it('rejects invalid guards through the endpoint without changing stored fields', async () => {
  const tour = await draft();
  await patch(tour._id, { status: 'draft', expectedStatus: 'inactive', priceFrom: 7 }).expect(400);
  expect((await Attraction.findById(tour._id).lean())?.priceFrom).not.toBe(7);
});
