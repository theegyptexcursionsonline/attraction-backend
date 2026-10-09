import express from 'express';
import request from '../test/loopbackRequest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import tenantRoutes from '../routes/tenants.routes';
import { Tenant } from '../models/Tenant';
import { updateTenantSeoSettings } from '../controllers/tenantSeoSettings.controller';
import { adminSiteSeo, dropUnrevisionedSeoWrites, seoSettingsUpdateSchema } from '../utils/seoSettings';

// Real authorization middleware/controllers and real Mongo writes; only the identity is injected.
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
const legacy = { metaTitle: 'Existing title', metaDescription: 'Existing description', keywords: ['safari'] };
const snapshot = {
  metaTitle: 'Grand Rock Safari | Makadi Bay quad and buggy trips',
  metaDescription: 'Quad, buggy, horse and boat trips from Makadi Bay with hotel pickup.',
  keywords: ['makadi bay safari', 'quad biking hurghada'],
  ogImage: 'https://res.cloudinary.com/demo/image/upload/grand-rock/share.jpg',
  searchVisibility: 'visible' as const,
};
const body = (expectedRevision = 0, changes: Record<string, unknown> = {}) => ({ expectedRevision, seoSettings: { ...snapshot, ...changes } });

const app = express();
app.use(express.json());
app.use('/tenants', tenantRoutes);
app.use((error: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));
const auth = (req: request.Test, role = 'brand-admin', assigned: Types.ObjectId = owner) => req.set('x-test-role', role).set('x-test-assigned', String(assigned));
const patch = (id = owner, role = 'brand-admin') => auth(request(app).patch(`/tenants/${id}/seo-settings`), role);
const read = (id = owner, role = 'brand-admin') => auth(request(app).get(`/tenants/${id}/seo-settings`), role);
const stored = (id = owner) => Tenant.findById(id).lean();

let mongo: MongoMemoryReplSet;
let info: jest.SpyInstance;
let warn: jest.SpyInstance;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('tenant_seo_settings'));
  await Tenant.init();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  await Tenant.collection.deleteMany({});
  await Tenant.collection.insertMany([owner, other].map((_id, index) => ({
    _id, name: `Safari site ${index}`, slug: `safari-site-${index}`, domain: `safari-site-${index}.invalid`,
    customDomain: `safari-site-${index}.invalid`, status: 'active', flatUrls: index === 0,
    defaultLanguage: 'en', supportedLanguages: ['en', 'ar'],
    seoSettings: legacy, notificationSettings: { bookingEmail: 'booking@example.invalid' },
  })));
});
afterEach(() => { info.mockRestore(); warn.mockRestore(); });

describe('site SEO editor', () => {
  it('shows a legacy site as visible with its existing text and revision 0', async () => {
    const response = await read().expect(200);
    expect(response.body.data).toEqual({
      seoSettings: { ...legacy, ogImage: '', searchVisibility: 'visible' },
      seoSettingsRevision: 0,
      site: { slug: 'safari-site-0', name: 'Safari site 0', status: 'active', customDomain: 'safari-site-0.invalid', flatUrls: true, defaultLanguage: 'en', supportedLanguages: ['en', 'ar'] },
    });
  });

  it.each(['brand-admin', 'super-admin'])('saves the whole snapshot for %s and bumps the revision', async role => {
    const response = await patch(owner, role).send(body(0, { metaTitle: `  ${snapshot.metaTitle}  ` })).expect(200);
    expect(response.body.data.seoSettings).toEqual(snapshot);
    expect(response.body.data.seoSettingsRevision).toBe(1);
    const site = await stored();
    expect(site?.seoSettings).toEqual(snapshot);
    expect(site?.notificationSettings?.bookingEmail).toBe('booking@example.invalid');
    // The audit line names the change, never the text.
    expect(JSON.stringify(info.mock.calls)).not.toContain(snapshot.metaTitle);
  });

  it('hides a site from search engines and shows that publicly', async () => {
    await patch().send(body(0, { searchVisibility: 'hidden' })).expect(200);
    const site = await request(app).get('/tenants/by-slug/safari-site-0').set('X-Tenant-ID', 'safari-site-0').expect(200);
    expect(site.body.data.seoSettings.searchVisibility).toBe('hidden');
    expect(site.body.data).not.toHaveProperty('seoSettingsRevision');
    const neighbour = await request(app).get('/tenants/by-slug/safari-site-1').set('X-Tenant-ID', 'safari-site-1').expect(200);
    expect(neighbour.body.data.seoSettings.searchVisibility).toBeUndefined();
    expect(info.mock.calls.flat()).toContainEqual(expect.objectContaining({ searchVisibility: 'hidden', visibilityChanged: true }));
  });

  it('clears the share image and treats an empty one as none', async () => {
    await patch().send(body(0)).expect(200);
    await patch().send(body(1, { ogImage: '' })).expect(200);
    expect((await stored())?.seoSettings).not.toHaveProperty('ogImage');
  });

  it('treats a missing revision on an older site as the first snapshot', async () => {
    await Tenant.collection.updateOne({ _id: owner }, { $set: { seoSettingsRevision: null } });
    await patch().send(body(0)).expect(200);
    expect((await stored())?.seoSettingsRevision).toBe(1);
  });

  it('allows one of two concurrent editors and refuses the stale retry', async () => {
    const responses = await Promise.all([patch().send(body(0)), patch().send(body(0, { searchVisibility: 'hidden' }))]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const conflict = responses.find(response => response.status === 409)!;
    expect(conflict.body.error).toMatch(/changed since you opened them/);
    await patch().send(body(0)).expect(409);
    expect((await stored())?.seoSettingsRevision).toBe(1);
  });

  it.each(['customer', 'manager', 'editor', 'viewer'])('refuses %s even when assigned to the site', async role => {
    await patch(owner, role).send(body()).expect(403);
    await read(owner, role).expect(403);
    expect((await stored())?.seoSettings).toEqual(legacy);
  });

  it('requires sign-in and hides other sites exactly like missing ones', async () => {
    await request(app).patch(`/tenants/${owner}/seo-settings`).send(body()).expect(401);
    await request(app).get(`/tenants/${owner}/seo-settings`).expect(401);
    const foreign = await patch(other).send(body()).expect(404);
    const missing = await patch(new Types.ObjectId()).send(body()).expect(404);
    expect(foreign.body).toEqual(missing.body);
    const foreignRead = await read(other).expect(404);
    const missingRead = await read(new Types.ObjectId()).expect(404);
    expect(foreignRead.body).toEqual(missingRead.body);
    expect((await stored(other))?.seoSettings).toEqual(legacy);
    await patch(other, 'super-admin').send(body()).expect(200);
  });

  it('enforces membership inside the handler, not only in the route', async () => {
    const direct = express(); direct.use(express.json());
    direct.patch('/:id', (req: any, _res, next) => { req.user = { _id: new Types.ObjectId(), role: 'brand-admin', assignedTenants: [other] }; next(); }, updateTenantSeoSettings);
    await request(direct).patch(`/${owner}`).send(body()).expect(404);
    expect((await stored())?.seoSettings).toEqual(legacy);
  });

  it.each([
    { metaTitle: 'a'.repeat(71) }, { metaDescription: 'a'.repeat(201) }, { metaTitle: '<script>alert(1)</script>' },
    { metaDescription: 'line\nbreak' }, { keywords: Array.from({ length: 21 }, (_v, i) => `keyword ${i}`) },
    { keywords: ['quad', 'Quad'] }, { keywords: [''] }, { keywords: ['a'.repeat(61)] }, { keywords: 'quad' },
    { ogImage: 'http://res.cloudinary.com/a.jpg' }, { ogImage: 'javascript:alert(1)' }, { ogImage: 'https://user:pass@example.invalid/a.jpg' },
    { ogImage: 'https://example.invalid/a.jpg#x' }, { searchVisibility: 'noindex' }, { searchVisibility: undefined }, { canonical: 'https://x.invalid' },
  ])('refuses invalid value %# without writing', async change => {
    await patch().send(body(0, change)).expect(400);
    expect((await stored())?.seoSettings).toEqual(legacy);
  });

  it.each([{ expectedRevision: -1 }, { expectedRevision: '0' }, { expectedRevision: Number.MAX_SAFE_INTEGER }, { slug: 'changed' }])('refuses malformed request %#', async change => {
    await patch().send({ ...body(0), ...change }).expect(400);
  });
});

describe('general settings saves can no longer overwrite site SEO', () => {
  it.each([
    { seoSettings: { metaTitle: 'Stale echo', metaDescription: '', keywords: [], searchVisibility: 'visible' } },
    { 'seoSettings.searchVisibility': 'visible' },
    { 'seoSettings.metaTitle': 'Stale echo' },
  ])('keeps the editor snapshot when a settings save echoes %#', async change => {
    await patch().send(body(0, { searchVisibility: 'hidden' })).expect(200);
    await auth(request(app).patch(`/tenants/${owner}/settings`)).send({ tagline: 'Desert rides', ...change }).expect(200);
    await auth(request(app).patch(`/tenants/${owner}`), 'super-admin').send({ name: 'Renamed site', ...change }).expect(200);
    const site = await stored();
    expect(site?.seoSettings).toEqual({ ...snapshot, searchVisibility: 'hidden' });
    expect(site?.tagline).toBe('Desert rides');
    expect(site?.name).toBe('Renamed site');
    // A whole-object echo reaches the model and is dropped there; dotted paths never get that far.
    if ('seoSettings' in change) expect(warn).toHaveBeenCalled();
  });

  it('lets onboarding scripts that upsert a whole site set SEO', async () => {
    await Tenant.findOneAndUpdate({ slug: 'new-site' }, { $set: { name: 'New site', domain: 'new-site.invalid', seoSettings: { ...legacy, searchVisibility: 'hidden' } } }, { upsert: true });
    expect((await Tenant.findOne({ slug: 'new-site' }).lean())?.seoSettings?.searchVisibility).toBe('hidden');
  });

  it('drops direct un-revisioned model writes, including renames and unsets', async () => {
    await Tenant.updateOne({ _id: owner }, { $set: { 'seoSettings.searchVisibility': 'hidden' } });
    await Tenant.updateOne({ _id: owner }, { $unset: { seoSettings: 1 } });
    await Tenant.updateOne({ _id: owner }, { $rename: { tagline: 'seoSettings.metaTitle' } });
    await Tenant.updateMany({}, { seoSettings: { metaTitle: 'Bulk' } });
    expect((await stored())?.seoSettings).toEqual(legacy);
  });
});

describe('helpers', () => {
  it('reads any stored shape into a complete editor view', () => {
    expect(adminSiteSeo(undefined)).toEqual({ metaTitle: '', metaDescription: '', keywords: [], ogImage: '', searchVisibility: 'visible' });
    expect(adminSiteSeo({ metaTitle: 7, keywords: ['ok', 3], searchVisibility: 'weird' })).toEqual({ metaTitle: '', metaDescription: '', keywords: ['ok'], ogImage: '', searchVisibility: 'visible' });
  });

  it('leaves revisioned updates alone and reports what it dropped', () => {
    const revisioned = { $set: { seoSettings: snapshot, seoSettingsRevision: 2 } };
    expect(dropUnrevisionedSeoWrites(revisioned)).toBe(false);
    expect(revisioned.$set.seoSettings).toBe(snapshot);
    const echo: Record<string, any> = { $set: { name: 'x', seoSettings: snapshot } };
    expect(dropUnrevisionedSeoWrites(echo)).toBe(true);
    expect(echo).toEqual({ $set: { name: 'x' } });
    expect(seoSettingsUpdateSchema.safeParse(body()).success).toBe(true);
  });
});
