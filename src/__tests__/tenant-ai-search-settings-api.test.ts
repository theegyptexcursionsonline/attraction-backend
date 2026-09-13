import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import tenantRoutes from '../routes/tenants.routes';
import { Tenant } from '../models/Tenant';
import { aiSearchWidgetIdError, updateTenant, updateTenantSettings } from '../controllers/tenants.controller';

// Authentication itself has separate coverage. Keep the real role middleware,
// route validators, controllers and MongoDB writes for this settings contract.
jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
  authenticate: (req: any, res: any, next: any) => {
    const role = req.header('x-test-role');
    if (!role) return res.status(401).json({ success: false });
    req.user = { role, assignedTenants: req.header('x-test-assigned')?.split(',').filter(Boolean) || [] };
    next();
  },
}));

jest.setTimeout(120_000);
const app = express();
app.use(express.json());
app.use('/tenants', tenantRoutes);
app.use((error: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));
const owner = new Types.ObjectId();
const other = new Types.ObjectId();
const widgetId = 'wgt_abcdefghijklmnopqrstuv';
let mongo: MongoMemoryReplSet;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('tenant_ai_settings'));
  await Tenant.init();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await Tenant.collection.deleteMany({});
  await Tenant.collection.insertMany([owner, other].map((_id, i) => ({
    _id, slug: `widget-site-${i}`, domain: `widget-site-${i}.invalid`, name: `Widget site ${i}`, status: 'active',
    aiSettings: { bookingWidget: { enabled: false, welcomeMessage: 'Book your visit' }, voiceAgent: { enabled: false },
      searchWidget: { enabled: true, placeholder: 'Search experiences', maxSuggestions: 6, showPopularSearches: true } },
  })));
});
const patch = (id = owner, role = 'brand-admin', path = 'settings') => request(app)
  .patch(`/tenants/${id}${path ? `/${path}` : ''}`).set('x-test-role', role).set('x-test-assigned', String(owner));
const search = (fields: unknown) => ({ aiSettings: { searchWidget: fields } });
const stored = () => Tenant.findById(owner).lean();

it('saves, reads publicly, replaces, disables and clears the widget without removing sibling integrations', async () => {
  await patch().send(search({ widgetId: `  ${widgetId}  ` })).expect(200);
  expect((await stored())?.aiSettings).toMatchObject({ bookingWidget: { welcomeMessage: 'Book your visit' },
    voiceAgent: { enabled: false }, searchWidget: { widgetId, enabled: true, placeholder: 'Search experiences' } });
  const read = await request(app).get(`/tenants/public/${owner}`).expect(200);
  expect(read.body.data.aiSettings.searchWidget.widgetId).toBe(widgetId);
  const replacement = 'wgt_zyxwvutsrqponmlkjihgfe';
  await patch().send(search({ widgetId: replacement })).expect(200);
  await patch().send(search({ enabled: false })).expect(200);
  expect((await stored())?.aiSettings.searchWidget).toMatchObject({ widgetId: replacement, enabled: false });
  for (const clear of ['', '   ', null]) {
    await patch().send(search({ widgetId: replacement })).expect(200);
    await patch().send(search({ widgetId: clear })).expect(200);
    expect((await stored())?.aiSettings.searchWidget.widgetId).toBe('');
  }
});

it('preserves independently updated search/voice/booking fields under concurrent requests and retries', async () => {
  await Promise.all([
    patch().send(search({ widgetId })).expect(200),
    patch().send({ aiSettings: { voiceAgent: { enabled: true } } }).expect(200),
    patch().send(search({ placeholder: 'Find a tour' })).expect(200),
  ]);
  await patch().send(search({ widgetId })).expect(200);
  expect((await stored())?.aiSettings).toMatchObject({ bookingWidget: { welcomeMessage: 'Book your visit' },
    voiceAgent: { enabled: true }, searchWidget: { widgetId, placeholder: 'Find a tour', maxSuggestions: 6 } });
});

it.each(['manager', 'editor', 'viewer', 'customer', 'operator', 'agent'])('rejects the %s role without a write', async role => {
  await patch(owner, role).send(search({ widgetId })).expect(403);
  expect((await stored())?.aiSettings.searchWidget.widgetId).toBeUndefined();
});
it('rejects unauthenticated settings writes', async () => {
  await request(app).patch(`/tenants/${owner}/settings`).send(search({ widgetId })).expect(401);
});
it('keeps foreign and missing tenants indistinguishable and ignores body/query tenant overrides', async () => {
  for (const target of [other, new Types.ObjectId()]) {
    const response = await patch(target).query({ tenantId: String(owner) }).send({ ...search({ widgetId }), tenantId: String(owner) }).expect(404);
    expect(response.body.error).toBe('Tenant not found');
  }
  expect((await Tenant.findById(other).lean())?.aiSettings.searchWidget.widgetId).toBeUndefined();
});
it('denies unassigned brand administrators and permits the super administrator', async () => {
  await patch().set('x-test-assigned', '').send(search({ widgetId })).expect(404);
  await patch(other, 'super-admin').send(search({ widgetId })).expect(200);
});

it.each([
  null, [], 'invalid', { searchWidget: null }, { searchWidget: [] },
  { searchWidget: { widgetId: 123 } }, { searchWidget: { widgetId: true } },
  { searchWidget: { widgetId: 'wgt_short' } }, { searchWidget: { widgetId: 'wgt_abc"><script>' } },
  { searchWidget: { widgetId: 'wgt_' + 'a'.repeat(65) } },
  { searchWidget: { widgetId: { $ne: null } } }, { searchWidget: { enabled: 'false' } },
  { searchWidget: { clientId: String(other) } }, { searchWidget: { allowedDomains: ['other.invalid'] } },
  { searchWidget: { apiKey: 'private' } }, { searchWidget: { maxSuggestions: 21 } },
])('rejects malformed or authorization-bearing AI settings: %j', async aiSettings => {
  await patch().send({ aiSettings }).expect(400);
  expect((await stored())?.aiSettings.searchWidget.widgetId).toBeUndefined();
});

it('persists validated AI settings through the super-admin update and create route validators', async () => {
  await patch(owner, 'super-admin', '').send(search({ widgetId })).expect(200);
  expect((await stored())?.aiSettings.searchWidget.widgetId).toBe(widgetId);
  await patch(owner, 'super-admin', '').send(search({ widgetId: 'broken' })).expect(400);
  const created = await request(app).post('/tenants').set('x-test-role', 'super-admin').send({
    slug: 'new-widget-site', name: 'New widget site', domain: 'new-widget-site.invalid',
    logo: 'https://images.invalid/logo.png', theme: { primaryColor: '#000000', secondaryColor: '#222222', accentColor: '#444444' },
    defaultCurrency: 'USD', defaultLanguage: 'en', supportedLanguages: ['en'], ...search({ widgetId }),
  }).expect(201);
  expect((await Tenant.findById(created.body.data._id).lean())?.aiSettings.searchWidget.widgetId).toBe(widgetId);
});

it('keeps the full update super-admin only and enforces role checks even on direct handler calls', async () => {
  await patch(owner, 'brand-admin', '').send(search({ widgetId })).expect(403);
  for (const handler of [updateTenantSettings, updateTenant]) {
    const response: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await handler({ params: { id: String(owner) }, body: search({ widgetId }), user: { role: 'viewer', assignedTenants: [owner] } } as any, response, jest.fn());
    expect(response.status).toHaveBeenCalledWith(403);
  }
});

it('publishes only safe AI configuration even for legacy raw records with extra fields', async () => {
  await Tenant.collection.updateOne({ _id: owner }, { $set: {
    'aiSettings.searchWidget.widgetId': widgetId,
    'aiSettings.searchWidget.apiKey': 'private', 'aiSettings.searchWidget.clientId': String(other),
    'aiSettings.searchWidget.allowedDomains': ['other.invalid'], 'aiSettings.secret': 'private',
    'aiSettings.voiceAgent.secret': 'private',
  } });
  const read = await request(app).get(`/tenants/public/${owner}`).expect(200);
  expect(read.body.data.aiSettings.searchWidget.widgetId).toBe(widgetId);
  expect(JSON.stringify(read.body.data.aiSettings)).not.toMatch(/private|clientId|allowedDomains|secret|apiKey/);
});
it('allows unchanged legacy settings without an ID, but rejects arbitrary settings objects', () => {
  expect(aiSearchWidgetIdError({ searchWidget: { enabled: true } })).toBeNull();
  expect(aiSearchWidgetIdError(undefined)).toBeNull();
  expect(aiSearchWidgetIdError({ searchWidget: { token: 'private' } })).not.toBeNull();
});

it('returns 404 for malformed tenant identifiers without mutating configuration', async () => {
  for (const suffix of ['/settings', '']) {
    await request(app).patch(`/tenants/not-an-id${suffix}`).set('x-test-role', 'super-admin').send(search({ widgetId })).expect(404);
  }
  expect((await stored())?.aiSettings.searchWidget.widgetId).toBeUndefined();
});

it('does not acknowledge a failed database write, and a fresh retry can succeed', async () => {
  const failedWrite = jest.spyOn(Tenant, 'findOneAndUpdate').mockRejectedValueOnce(new Error('database unavailable'));
  await patch().send(search({ widgetId })).expect(500);
  failedWrite.mockRestore();
  expect((await stored())?.aiSettings.searchWidget.widgetId).toBeUndefined();
  await patch().send(search({ widgetId })).expect(200);
  expect((await stored())?.aiSettings.searchWidget.widgetId).toBe(widgetId);
});
