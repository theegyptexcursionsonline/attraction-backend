import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import pageRoutes from '../routes/page.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { createAdminPage, updateAdminPage } from '../controllers/page.controller';
import { pageSlugSchema } from '../utils/siteContent';

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
const app = express(); app.use(express.json()); app.use('/page', pageRoutes);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ success: false, error: error.message }));
const body = (slug = 'fleet/royal-boat') => ({ slug, title: 'Royal Boat', body: '<p>Existing vessel description.</p><table><tbody><tr><th scope="row">Length</th><td>28 m</td></tr></tbody></table>', pageType: 'attraction', parentPath: '/', isPublished: true });
const auth = (req: request.Test, tenant = owner, role = 'brand-admin', assigned = tenant) => req.query({ tenantId: String(tenant) }).set('x-test-role', role).set('x-test-assigned', String(assigned));
const create = (value = body(), tenant = owner) => auth(request(app).post('/page/admin'), tenant).send(value);
const update = (id: string, value: object, tenant = owner) => auth(request(app).patch(`/page/admin/${id}`), tenant).send(value);
const resolve = (slug = 'fleet/royal-boat', tenant = owner) => request(app).get('/page/resolve').query({ slug, tenantId: String(tenant) });
const lifecycle = (id: string, action: string, tenant = owner) => auth(request(app).post(`/page/admin/${id}/${action}`), tenant);
let mongo: MongoMemoryReplSet;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('fleet_pages'));
  await Promise.all([Tenant.init(), Attraction.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  process.env.URL_NAMESPACE_WRITES_READY = 'true';
  await Tenant.collection.deleteMany({}); await Attraction.collection.deleteMany({});
  await Tenant.collection.insertMany([owner, other].map((_id, index) => ({ _id, slug: `fleet-site-${index}`, name: `Fleet site ${index}`, domain: `fleet-site-${index}.invalid`, status: 'active', customPages: [] })));
});
afterEach(() => { jest.restoreAllMocks(); process.env.URL_NAMESPACE_WRITES_READY = 'true'; });

it('creates all five editable canonical paths and resolves their sanitized CMS content', async () => {
  for (const leaf of ['royal-boat', 'royal-1', 'ferrari-boat', 'private-the-boat', 'riva-speed-boat']) {
    const slug = `fleet/${leaf}`;
    const created = await create({ ...body(slug), body: body().body + '<script>unsafe()</script>' }).expect(201);
    expect(created.body.data).toMatchObject({ slug, revision: 0 });
    const publicPage = (await resolve(slug).expect(200)).body.data;
    expect(publicPage.type).toBe('page');
    expect(publicPage.page._id).toBe(created.body.data._id);
    expect(publicPage.page.body).toContain('<th scope="row">Length</th>');
    expect(publicPage.page.body).not.toContain('unsafe');
    expect((await resolve(slug, other).expect(200)).body.data).toEqual({ type: 'none' });
  }
  const sitemap = await request(app).get('/page/sitemap.xml').query({ tenantId: String(owner) }).expect(200);
  expect(sitemap.text).toContain('/fleet/royal-boat</loc>');
});
it.each(['fleet/boat/extra', 'other/boat', '/fleet/boat', 'fleet//boat', 'fleet/../admin', 'fleet/admin', 'fleet/cruises', 'fleet/%2fboat', 'fleet/boat?tenant=other', 'fleet/boat#part', 'fleet/Boat', 'fleet/boat_name', 'fleet/boat\\other', 'fleet/boat\u0000', 'fleet/' + 'a'.repeat(115)])('rejects unsafe or unsupported write path %s', async slug => {
  expect(pageSlugSchema.safeParse(slug).success).toBe(false);
  await create(body(slug)).expect(400);
  expect((await Tenant.findById(owner).lean())?.customPages).toHaveLength(0);
});
it('preserves ordinary root pages and does not reinterpret parentPath', async () => {
  await create({ ...body('fleet'), parentPath: '/other' }).expect(201);
  expect((await resolve('fleet').expect(200)).body.data.type).toBe('page');
  await resolve('other/fleet').expect(400);
});
it('enforces validation inside direct write handlers too', async () => {
  for (const handler of [createAdminPage, updateAdminPage]) {
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const write = jest.spyOn(Tenant, 'findOneAndUpdate');
    await handler({ tenant: { _id: owner }, user: { role: 'brand-admin', assignedTenants: [owner] }, params: { id: String(new Types.ObjectId()) }, body: { ...body('other/boat'), expectedRevision: 0 } } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400); expect(write).not.toHaveBeenCalled(); write.mockRestore();
  }
});
it('supports identical paths on separate tenants and never resolves a similarly named tour', async () => {
  await create().expect(201); await create(body(), other).expect(201);
  await Attraction.collection.insertOne({ slug: 'tour-only', pathSlug: 'fleet/tour-only', title: 'Private tour', status: 'active', tenantIds: [owner] });
  expect((await resolve('fleet/tour-only').expect(200)).body.data).toEqual({ type: 'none' });
  const lookup = jest.spyOn(Attraction, 'findOne');
  await resolve().expect(200); expect(lookup).not.toHaveBeenCalled();
});
it('serializes duplicate creates and page/tour claims without losing a winner', async () => {
  const duplicate = await Promise.all([create(), create()]);
  expect(duplicate.map(result => result.status).sort()).toEqual([201, 409]);
  const results = await Promise.allSettled([
    create(body('fleet/shared')),
    Attraction.create({ title: 'Other claimant', slug: 'global-tour', pathSlug: 'fleet/shared', tenantIds: [owner], status: 'draft' }),
  ]);
  const statuses = results.map((result, index) => result.status === 'rejected' ? result.reason.statusCode : index === 0 ? (result.value as any).status : 201);
  expect(statuses.sort()).toEqual([201, 409]);
});
it('rejects stale CAS saves and atomic conflicting renames', async () => {
  const first = (await create().expect(201)).body.data;
  const saves = await Promise.all([update(first._id, { title: 'Edit one', expectedRevision: 0 }), update(first._id, { title: 'Edit two', expectedRevision: 0 })]);
  expect(saves.map(result => result.status).sort()).toEqual([200, 409]);
  const second = (await create(body('fleet/second')).expect(201)).body.data;
  const renames = await Promise.all([update(first._id, { slug: 'fleet/renamed', expectedRevision: 1 }), update(second._id, { slug: 'fleet/renamed', expectedRevision: 0 })]);
  expect(renames.map(result => result.status).sort()).toEqual([200, 409]);
});
it.each(['archive', 'trash'])('hides %s pages and rejects restoration when the address is reused', async action => {
  const first = (await create().expect(201)).body.data;
  await lifecycle(first._id, action).expect(200);
  expect((await resolve().expect(200)).body.data.type).toBe('none');
  const hidden = await request(app).get('/page/sitemap.xml').query({ tenantId: String(owner) }).expect(200);
  expect(hidden.text).not.toContain('/fleet/royal-boat');
  await create().expect(201);
  await lifecycle(first._id, action === 'archive' ? 'unarchive' : 'restore').expect(409);
});
it('keeps drafts private and lets editors publish and unpublish with fresh revisions', async () => {
  const page = (await create({ ...body(), isPublished: false }).expect(201)).body.data;
  expect((await resolve().expect(200)).body.data.type).toBe('none');
  await update(page._id, { isPublished: true, expectedRevision: 0 }).expect(200);
  expect((await resolve().expect(200)).body.data.type).toBe('page');
  await update(page._id, { isPublished: false, expectedRevision: 1 }).expect(200);
  expect((await resolve().expect(200)).body.data.type).toBe('none');
});
it('requires assigned content roles and scopes page ids across every lifecycle route', async () => {
  await request(app).post('/page/admin').query({ tenantId: String(owner) }).send(body()).expect(401);
  for (const role of ['customer', 'viewer', 'editor']) await auth(request(app).post('/page/admin'), owner, role).send(body()).expect(403);
  await auth(request(app).post('/page/admin'), owner, 'brand-admin', other).send(body()).expect(403);
  const page = (await create().expect(201)).body.data;
  await update(page._id, { title: 'Cross tenant', expectedRevision: 0 }, other).expect(404);
  for (const action of ['archive', 'trash', 'restore', 'unarchive']) await lifecycle(page._id, action, other).expect(404);
  await auth(request(app).delete(`/page/admin/${page._id}/permanent`), other).expect(404);
  expect((await resolve().expect(200)).body.data.page.title).toBe('Royal Boat');
});
it('fails closed for namespace maintenance, unknown tenants and source outages, then recovers', async () => {
  process.env.URL_NAMESPACE_WRITES_READY = 'false'; await create().expect(503);
  process.env.URL_NAMESPACE_WRITES_READY = 'true'; await create().expect(201);
  await resolve('fleet/royal-boat', new Types.ObjectId()).expect(404);
  const lookup = jest.spyOn(Tenant, 'findOne').mockRejectedValueOnce(new Error('temporarily unavailable'));
  await resolve().expect(500); lookup.mockRestore();
  expect((await resolve().expect(200)).body.data.type).toBe('page');
});
