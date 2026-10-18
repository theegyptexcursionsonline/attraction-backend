import express from 'express';
import request from '../test/loopbackRequest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import attractions from '../routes/attractions.routes';
import destinations from '../routes/destinations.routes';
import categories from '../routes/categories.routes';
import { Attraction } from '../models/Attraction';
import { Destination } from '../models/Destination';
import { Category } from '../models/Category';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { encryptSecret } from '../utils/secretCrypto';
import { generateAccessToken } from '../utils/jwt';

jest.setTimeout(120_000);
const app = express();
app.use('/attractions', attractions); app.use('/destinations', destinations); app.use('/categories', categories);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ success: false, error: error.message }));
const site = new Types.ObjectId(), other = new Types.ObjectId();
let mongo: MongoMemoryReplSet;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('catalogue_regression'));
  await Promise.all([Tenant.init(), Attraction.init(), Destination.init(), Category.init(), User.init()]);
  await Tenant.collection.insertMany([site, other].map((_id, i) => ({ _id, slug: `catalogue-${i}`, domain: `catalogue-${i}.invalid`, name: `Catalogue ${i}`, status: 'active', customPages: [] })));
  const names = Array.from({ length: 155 }, (_, i) => `Catalogue ${i}`);
  names[151] = 'الأقصر'; names[152] = 'München'; names[153] = 'Москва'; names[154] = 'Literal (.*)';
  await Destination.collection.insertMany(names.map((name, i) => ({ _id: new Types.ObjectId(), name, slug: `city-${i}`, country: 'Egypt', isActive: true, sortOrder: i })));
  await Category.collection.insertMany(names.map((name, i) => ({ _id: new Types.ObjectId(), name, slug: `theme-${i}`, isActive: true, sortOrder: i })));
  await Attraction.collection.insertMany(names.map((name, i) => ({
    _id: new Types.ObjectId(), title: `${name} tour`, slug: `tour-${i}`, status: 'active', tenantIds: [i === 150 ? other : site],
    category: `theme-${i}`, destination: { city: name }, priceFrom: 20, currency: 'EUR', images: [],
    shortDescription: name, description: name, createdAt: new Date(2026, 0, 1, 0, i),
  })));
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

it.each(['attractions', 'destinations', 'categories'])('pages the entire %s tail beyond 100 without duplicates; scopes cursors to the query and tenant', async collection => {
  const seen: string[] = [];
  let cursor: string | undefined;
  let firstCursor = '';
  for (let page = 0; page < 20; page++) {
    const response = await request(app).get(`/${collection}`).query({ pagination: 'cursor', limit: 17, ...(cursor ? { cursor } : {}) }).expect(200);
    expect(response.body.data.length).toBeLessThanOrEqual(17);
    expect(response.body.pagination.total).toBe(155);
    seen.push(...response.body.data.map((row: any) => row._id));
    cursor = response.body.pagination.nextCursor;
    if (!firstCursor) firstCursor = cursor!;
    if (!cursor) break;
  }
  expect(seen).toHaveLength(155); expect(new Set(seen).size).toBe(155);
  await request(app).get(`/${collection}`).query({ pagination: 'cursor', cursor: firstCursor, search: 'Catalogue' }).expect(400);
  await request(app).get(`/${collection}`).query({ pagination: 'cursor', cursor: firstCursor, tenantId: String(site) }).expect(400);
  const scoped = await request(app).get(`/${collection}`).query({ pagination: 'cursor', tenantId: String(site), search: 'Catalogue 150' }).expect(200);
  expect(scoped.body.data).toEqual([]);
  expect((await request(app).get(`/${collection}`).query({ pagination: 'cursor', tenantId: String(other), search: 'Catalogue 150' }).expect(200)).body.data).toHaveLength(1);
});

it.each(['attractions', 'destinations', 'categories'])('searches Unicode and literal hostile text in MongoDB for %s', async collection => {
  for (const search of ['الأقصر', 'München', 'Москва', '(.*)']) {
    const response = await request(app).get(`/${collection}`).query({ pagination: 'cursor', search, limit: 5 }).expect(200);
    expect(response.body.pagination.total).toBe(1); expect(response.body.data).toHaveLength(1);
  }
  expect((await request(app).get(`/${collection}`).query({ pagination: 'cursor', search: '^Catalogue' }).expect(200)).body.data).toEqual([]);
  for (const query of ['search=a&search=b', 'tenantId=a&tenantId=b', 'tenantId[$ne]=x', 'tenant=', 'limit=101', `search=${'x'.repeat(129)}`]) {
    await request(app).get(`/${collection}?pagination=cursor&${query}`).expect(400);
  }
});

it.each(['destinations', 'categories'])('counts only active, unarchived tours for %s and never exposes an empty taxonomy hit', async collection => {
  const title = 'Unavailable only';
  await Destination.collection.insertOne({ name: title, slug: `unavailable-${collection}`, isActive: true, sortOrder: 999 });
  await Category.collection.insertOne({ name: title, slug: `unavailable-${collection}`, isActive: true, sortOrder: 999 });
  await Attraction.collection.insertMany(['draft', 'archived', 'trashed'].map((state, i) => ({
    title, slug: `${collection}-${state}`, status: state === 'draft' ? 'draft' : 'active', tenantIds: [site],
    category: `unavailable-${collection}`, destination: { city: title },
    ...(i === 1 ? { archivedAt: new Date() } : i === 2 ? { trashedAt: new Date() } : {}),
  })));
  expect((await request(app).get(`/${collection}`).query({ pagination: 'cursor', search: title }).expect(200)).body.data).toEqual([]);
});

it('reads a specific inactive destination beyond the old list window only as a global administrator', async () => {
  const destination = await Destination.findOne({ slug: 'city-154' }).lean();
  await Destination.updateOne({ _id: destination!._id }, { $set: { isActive: false } });
  const url = `/destinations/admin/${destination!._id}`;
  await request(app).get(url).expect(401);
  for (const role of ['customer', 'viewer', 'editor', 'manager', 'brand-admin', 'super-admin']) {
    const _id = new Types.ObjectId();
    await User.collection.insertOne({ _id, email: 'theegyptexcursionsonline@gmail.com', role, status: 'active', assignedTenants: [site], tokenVersion: 0, twoFactorEnabled: role !== 'customer', ...(role !== 'customer' ? { twoFactorSecretEnc: encryptSecret('JBSWY3DPEHPK3PXP') } : {}) });
    const user = await User.findById(_id);
    const token = generateAccessToken(user!, { mfaVerified: role !== 'customer' });
    const response = await request(app).get(url).set('Authorization', `Bearer ${token}`).expect(role === 'super-admin' ? 200 : 403);
    if (role === 'super-admin') {
      expect(response.body.data._id).toBe(String(destination!._id)); expect(response.body.data.isActive).toBe(false);
      expect(response.headers['cache-control']).toBe('private, no-store');
      await request(app).get('/destinations/admin/not-an-id').set('Authorization', `Bearer ${token}`).expect(404);
      await request(app).get(`/destinations/admin/${new Types.ObjectId()}`).set('Authorization', `Bearer ${token}`).expect(404);
      const failure = Object.assign(new Error('Temporarily unavailable'), { statusCode: 503 });
      const lookup = jest.spyOn(Destination, 'findOne').mockReturnValueOnce({ lean: () => Promise.reject(failure) } as any);
      await request(app).get(url).set('Authorization', `Bearer ${token}`).expect(503);
      lookup.mockRestore();
      await User.updateOne({ _id }, { $inc: { tokenVersion: 1 } });
      await request(app).get(url).set('Authorization', `Bearer ${token}`).expect(401);
    }
    await User.deleteOne({ _id });
  }
});
