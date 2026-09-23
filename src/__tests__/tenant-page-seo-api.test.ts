import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import tenantRoutes from '../routes/tenants.routes';
import { Tenant } from '../models/Tenant';
import { updateTenantPageSeo } from '../controllers/tenants.controller';
import { pageSeoUpdateSchema, publicPageSeo, withoutPageSeoFields } from '../utils/pageSeo';
// Keep actual authorization middleware/controllers and real Mongo writes. No external sends.
jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
  authenticate: (req: any, res: any, next: any) => {
    const role = req.header('x-test-role');
    if (!role) return res.status(401).json({ success: false });
    req.user = { _id: new Types.ObjectId('000000000000000000000001'), role, assignedTenants: req.header('x-test-assigned')?.split(',').filter(Boolean) || [] };
    next();
  },
}));
jest.setTimeout(120_000);
const owner = new Types.ObjectId();
const other = new Types.ObjectId();
const blank = { version: 1, pages: {} };
const fields = { title: 'Cruise holidays', description: 'Explore available voyages.', heading: 'Choose your voyage', ogImage: 'https://images.example.invalid/cover.jpg' };
const settings = { version: 1, pages: { cruises: fields } };
const body = (expectedRevision = 0, changes: Record<string, unknown> = {}) => ({ expectedRevision, pages: settings.pages, ...changes });
const app = express();
app.use(express.json());
app.use('/tenants', tenantRoutes);
app.use((error: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));
const auth = (req: request.Test, role = 'brand-admin', assigned = owner) => req.set('x-test-role', role).set('x-test-assigned', String(assigned));
const patch = (id = owner, role = 'brand-admin') => auth(request(app).patch(`/tenants/${id}/page-seo`), role);
const stored = () => Tenant.findById(owner).lean();
let mongo: MongoMemoryReplSet;
let audit: jest.SpyInstance;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('tenant_page_seo'));
  await Tenant.init();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  audit = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  await Tenant.collection.deleteMany({});
  await Tenant.collection.insertMany([owner, other].map((_id, index) => ({
    _id, name: `Cruise site ${index}`, slug: `cruise-site-${index}`, domain: `cruise-site-${index}.invalid`,
    customDomain: `cruise-site-${index}.invalid`, status: 'active',
    seoSettings: { metaTitle: 'Existing title', metaDescription: 'Existing description', keywords: ['cruise'] },
    notificationSettings: { bookingEmail: 'booking@example.invalid' },
  })));
});
afterEach(() => audit.mockRestore());


it.each(['brand-admin', 'super-admin'])('saves normalized page settings with %s and preserves existing fields', async role => {
  const response = await patch(owner, role).send(body(0, { pages: { cruises: { ...fields, title: ' Cruise holidays ' } } })).expect(200);
  expect(response.body.data).toEqual({ pageSeo: settings, pageSeoRevision: 1 });
  expect((await stored())?.seoSettings?.metaTitle).toBe('Existing title');
  expect((await stored())?.notificationSettings?.bookingEmail).toBe('booking@example.invalid');
  const admin = await auth(request(app).get(`/tenants/${owner}`), role).expect(200);
  expect(admin.body.data).toMatchObject({ pageSeo: settings, pageSeoRevision: 1 });
  expect(JSON.stringify(audit.mock.calls)).not.toContain(fields.title);
});
it('uses empty legacy defaults and clears explicitly', async () => {
  const initial = await auth(request(app).get(`/tenants/${owner}`)).expect(200);
  expect(initial.body.data).toMatchObject({ pageSeo: blank, pageSeoRevision: 0 });
  await Tenant.collection.updateOne({ _id: owner }, { $set: { pageSeoRevision: null } });
  await patch().send(body()).expect(200);
  await patch().send(body(1, { pages: {} })).expect(200);
  expect((await stored())?.pageSeo).toEqual(blank);
});
it('allows one concurrent writer and rejects stale retries', async () => {
  const responses = await Promise.all([patch().send(body()), patch().send(body(0, { pages: { about: fields } }))]);
  expect(responses.map(value => value.status).sort()).toEqual([200, 409]);
  await patch().send(body()).expect(409);
  expect((await stored())?.pageSeoRevision).toBe(1);
});
it.each(['customer', 'manager', 'editor', 'viewer'])('rejects %s despite membership', async role => {
  await patch(owner, role).send(body()).expect(403);
  expect((await stored())?.pageSeo).toBeUndefined();
});
it('requires authentication and hides other tenants', async () => {
  await request(app).patch(`/tenants/${owner}/page-seo`).send(body()).expect(401);
  const foreign = await patch(other).send(body()).expect(404);
  const missing = await patch(new Types.ObjectId()).send(body()).expect(404);
  expect(foreign.body).toEqual(missing.body);
  await patch(other, 'super-admin').send(body()).expect(200);
});
it('enforces role and membership inside the handler', async () => {
  const direct = express(); direct.use(express.json());
  direct.patch('/:id', (req: any, _res, next) => { req.user = { role: 'brand-admin', assignedTenants: [other] }; next(); }, updateTenantPageSeo);
  await request(direct).patch(`/${owner}`).send(body()).expect(404);
});
it.each([
  { pages: { checkout: fields } }, { pages: { '/about': fields } }, { pages: { home: { ...fields, html: '<script>' } } },
  { pages: { home: { ...fields, title: '<script>' } } }, { pages: { home: { ...fields, heading: 'a'.repeat(161) } } },
  { pages: { home: { ...fields, description: 12 } } }, { pages: { home: { title: 'Incomplete' } } },
  { pages: { home: { ...fields, ogImage: 'javascript:alert(1)' } } }, { pages: { home: { ...fields, ogImage: 'https://user:pass@example.invalid/a.jpg' } } },
  { pages: { home: { ...fields, ogImage: 'https://example.invalid/%0a.png' } } }, { pages: { home: { ...fields, ogImage: 'https://example.invalid/a.jpg#fragment' } } },
  { expectedRevision: -1 }, { expectedRevision: '0' }, { expectedRevision: Number.MAX_SAFE_INTEGER }, { slug: 'changed' }, { pages: null },
])('rejects invalid or executable values %# without writes', async change => {
  await patch().send(body(0, change)).expect(400);
  expect((await stored())?.pageSeo).toBeUndefined();
});
it.each([
  { pageSeo: blank, pageSeoRevision: 999 }, { 'pageSeo.pages.home': fields }, { $set: { pageSeo: blank } }, { 'pageSeoRevision.value': 999 },
])('ignores stale generic writes while preserving unrelated saves %#', async change => {
  await patch().send(body()).expect(200);
  await auth(request(app).patch(`/tenants/${owner}/settings`)).send({ seoSettings: { metaTitle: 'Changed' }, ...change }).expect(200);
  await auth(request(app).patch(`/tenants/${owner}`), 'super-admin').send({ name: 'Changed name', ...change }).expect(200);
  expect((await stored())?.pageSeo).toEqual(settings);
  expect((await stored())?.pageSeoRevision).toBe(1);
});
it('exposes only validated public settings without revision and keeps tenant isolation', async () => {
  await patch().send(body()).expect(200);
  const result = await request(app).get(`/tenants/public/${owner}`).expect(200);
  expect(result.body.data.pageSeo).toEqual(settings);
  expect(result.body.data).not.toHaveProperty('pageSeoRevision');
  const unrelated = await request(app).get(`/tenants/public/${other}`).expect(200);
  expect(unrelated.body.data.pageSeo).toBeUndefined();
  await Tenant.collection.updateOne({ _id: owner }, { $set: { pageSeo: { version: 1, pages: { home: { ...fields, title: '<script>' } } } } });
  const corrupt = await request(app).get(`/tenants/public/${owner}`).expect(200);
  expect(corrupt.body.data.pageSeo).toEqual(blank);
});
it('guards direct model writes and preserves input objects', async () => {
  await expect(Tenant.updateOne({ _id: owner }, { $set: { pageSeo: { version: 2, pages: {} } } }, { runValidators: true })).rejects.toThrow();
  await expect(Tenant.updateOne({ _id: owner }, { $set: { 'pageSeo.pages.home': fields } }, { runValidators: true })).rejects.toThrow();
  await expect(Tenant.updateOne({ _id: owner }, { $unset: { pageSeo: 1 } }, { runValidators: true })).rejects.toThrow();
  expect(pageSeoUpdateSchema.safeParse(body()).success).toBe(true);
  expect(publicPageSeo(null)).toEqual(blank);
  const original = { name: 'Kept', pageSeo: settings };
  expect(withoutPageSeoFields(original)).toEqual({ name: 'Kept' });
  expect(original.pageSeo).toEqual(settings);
});
