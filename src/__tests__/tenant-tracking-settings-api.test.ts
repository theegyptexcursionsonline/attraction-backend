import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import tenantRoutes from '../routes/tenants.routes';
import { Tenant } from '../models/Tenant';
import { toPublicTenantDto, updateTenantTrackingSettings } from '../controllers/tenants.controller';
import { publicTrackingSettings, trackingSettingsUpdateSchema, withoutTrackingSettingsFields } from '../utils/trackingSettings';

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
const blank = { googleTagManagerId: '', googleAnalyticsId: '', verificationCodes: [] };
const settings = {
  googleTagManagerId: 'GTM-ABCD1234', googleAnalyticsId: 'G-ABCD1234',
  verificationCodes: [{ provider: 'google', code: 'verification_one' }, { provider: 'google', code: 'verification_two==' }],
};
const body = (expectedRevision = 0, changes: Record<string, unknown> = {}) => ({ expectedRevision, ...settings, ...changes });
const app = express();
app.use(express.json());
app.use('/tenants', tenantRoutes);
app.use((error: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));
const auth = (req: request.Test, role = 'brand-admin', assigned = owner) => req.set('x-test-role', role).set('x-test-assigned', String(assigned));
const patch = (id = owner, role = 'brand-admin') => auth(request(app).patch(`/tenants/${id}/tracking-settings`), role);
const stored = () => Tenant.findById(owner).lean();
let mongo: MongoMemoryReplSet;
let audit: jest.SpyInstance;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('tenant_tracking'));
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

it.each(['brand-admin', 'super-admin'])('allows %s to save and read normalized settings without changing SEO', async role => {
  const response = await patch(owner, role).send(body(0, {
    googleTagManagerId: ' GTM-ABCD1234 ', googleAnalyticsId: ' G-ABCD1234 ',
    verificationCodes: settings.verificationCodes.map(code => ({ ...code, code: ` ${code.code} ` })),
  })).expect(200);
  expect(response.body.data).toEqual({ trackingSettings: settings, trackingSettingsRevision: 1 });
  const tenant = await stored();
  expect(tenant?.seoSettings).toMatchObject({ metaTitle: 'Existing title', keywords: ['cruise'] });
  expect(tenant?.notificationSettings?.bookingEmail).toBe('booking@example.invalid');
  const admin = await auth(request(app).get(`/tenants/${owner}`), role).expect(200);
  expect(admin.body.data).toMatchObject({ trackingSettings: settings, trackingSettingsRevision: 1 });
  const log = JSON.stringify(audit.mock.calls);
  expect(log).toContain('verificationCount');
  expect(log).not.toContain(settings.googleTagManagerId);
  expect(log).not.toContain(settings.verificationCodes[0].code);
});

it('returns empty defaults to legacy admin reads and accepts null/missing revision0', async () => {
  const initial = await auth(request(app).get(`/tenants/${owner}`)).expect(200);
  expect(initial.body.data).toMatchObject({ trackingSettings: blank, trackingSettingsRevision: 0 });
  await Tenant.collection.updateOne({ _id: owner }, { $set: { trackingSettingsRevision: null } });
  await patch().send(body()).expect(200);
  expect((await stored())?.trackingSettingsRevision).toBe(1);
});

it('clears explicitly and preserves tracking across legacy SEO saves', async () => {
  await patch().send(body()).expect(200);
  await auth(request(app).patch(`/tenants/${owner}/settings`)).send({ seoSettings: { metaTitle: 'New title' } }).expect(200);
  expect((await stored())?.trackingSettings).toEqual(settings);
  expect((await stored())?.trackingSettingsRevision).toBe(1);
  const cleared = await patch().send(body(1, blank)).expect(200);
  expect(cleared.body.data).toEqual({ trackingSettings: blank, trackingSettingsRevision: 2 });
});

it('rejects a stale retry and atomically allows just one concurrent save', async () => {
  const results = await Promise.all([
    patch().send(body(0, { googleTagManagerId: 'GTM-FIRST1234' })),
    patch().send(body(0, { googleTagManagerId: 'GTM-SECOND1234' })),
  ]);
  expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  const winner = results.find(result => result.status === 200)!.body.data;
  await patch().send(body()).expect(409);
  expect((await stored())?.trackingSettings).toEqual(winner.trackingSettings);
  expect((await stored())?.trackingSettingsRevision).toBe(1);
  expect(audit).toHaveBeenCalledTimes(1);
});

it.each(['customer', 'manager', 'editor', 'viewer'])('rejects %s even with assigned membership', async role => {
  await patch(owner, role).send(body()).expect(403);
  expect((await stored())?.trackingSettings).toBeUndefined();
});
it('requires authentication and returns the same404 for foreign or missing tenants', async () => {
  await request(app).patch(`/tenants/${owner}/tracking-settings`).send(body()).expect(401);
  const foreign = await patch(other).send(body()).expect(404);
  const missing = await patch(new Types.ObjectId()).send(body()).expect(404);
  expect(foreign.body).toEqual(missing.body);
  await auth(request(app).patch(`/tenants/${owner}/tracking-settings`), 'brand-admin', other).send(body()).expect(404);
  await patch(other, 'super-admin').send(body()).expect(200);
  expect((await stored())?.trackingSettings).toBeUndefined();
});

it('enforces membership inside the handler when mounted without role middleware', async () => {
  const direct = express(); direct.use(express.json());
  direct.patch('/:id', (req: any, _res, next) => { req.user = { role: 'brand-admin', assignedTenants: [other] }; next(); }, updateTenantTrackingSettings);
  await request(direct).patch(`/${owner}`).send(body()).expect(404);
  expect((await stored())?.trackingSettings).toBeUndefined();
});

const invalid = [
  { googleTagManagerId: '<script>alert(1)</script>' }, { googleTagManagerId: 'GTM-ABC' },
  { googleTagManagerId: 'gtm-ABCD1234' }, { googleTagManagerId: 'GTM-' + 'A'.repeat(21) },
  { googleTagManagerId: null }, { googleAnalyticsId: 'UA-12345' }, { googleAnalyticsId: 1234 },
  { googleAnalyticsId: 'G-ABCD?x=1' }, { googleAnalyticsId: 'G-AB\nCD' },
  { verificationCodes: null }, { verificationCodes: 'google=token' },
  { verificationCodes: [{ provider: 'other', code: 'token' }] },
  { verificationCodes: [{ provider: 'google', code: '' }] },
  { verificationCodes: [{ provider: 'google', code: 'a'.repeat(257) }] },
  { verificationCodes: [{ provider: 'google', code: 'a b' }] },
  { verificationCodes: [{ provider: 'google', code: 'a\ncontent=x' }] },
  { verificationCodes: [{ provider: 'google', code: 'a"/><script>' }] },
  { verificationCodes: [{ provider: 'google', code: 'https://other.invalid' }] },
  { verificationCodes: [{ provider: 'google', code: '===value' }] },
  { verificationCodes: [{ provider: 'google', code: 123 }] },
  { verificationCodes: [{ provider: 'google', code: 'value', html: '<meta>' }] },
  { verificationCodes: [{ provider: 'google', code: 'value' }, { provider: 'google', code: ' value ' }] },
  { verificationCodes: Array.from({ length: 9 }, (_, i) => ({ provider: 'google', code: `code${i}` })) },
  { expectedRevision: -1 }, { expectedRevision: 1.5 }, { expectedRevision: '0' },
  { expectedRevision: Number.MAX_SAFE_INTEGER }, { html: '<script>' }, { 'trackingSettings.googleTagManagerId': 'GTM-ABCD1234' },
];
it.each(invalid)('rejects malformed or executable payload %# without partial writes', async invalidFields => {
  await patch().send(body(0, invalidFields)).expect(400);
  expect((await stored())?.trackingSettings).toBeUndefined();
  expect(audit).not.toHaveBeenCalled();
});
it('requires a complete snapshot and permits all four named verification providers', async () => {
  await patch().send({ expectedRevision: 0, googleTagManagerId: settings.googleTagManagerId }).expect(400);
  const codes = ['google', 'bing', 'facebook', 'pinterest'].map(provider => ({ provider, code: 'token_123-abc=' }));
  await patch().send(body(0, { verificationCodes: codes })).expect(200);
  expect((await stored())?.trackingSettings?.verificationCodes).toEqual(codes);
});

it.each([
  { trackingSettings: { ...settings, googleTagManagerId: '<script>malicious</script>' } },
  { trackingSettingsRevision: 999 },
  { 'trackingSettings.googleTagManagerId': 'GTM-BYPASS123' },
  { 'trackingSettingsRevision.value': 999 },
  { $set: { trackingSettings: blank, trackingSettingsRevision: 999 } },
  { $unset: { trackingSettings: 1 } },
  { $inc: { trackingSettingsRevision: 999 } },
  { $rename: { seoSettings: 'trackingSettings' } },
])('ignores generic tracking write attempts while saving unrelated fields %#', async attemptedWrite => {
  await patch().send(body()).expect(200);
  const created = await auth(request(app).post('/tenants'), 'super-admin').send({
    slug: 'created-site', name: 'Created site', domain: 'created-site.invalid',
    logo: 'https://example.invalid/logo.png',
    theme: { primaryColor: '#000000', secondaryColor: '#ffffff', accentColor: '#444444' },
    defaultCurrency: 'USD', defaultLanguage: 'en', supportedLanguages: ['en'], ...attemptedWrite,
  }).expect(201);
  const newTenant = await Tenant.findById(created.body.data._id).lean();
  expect(newTenant?.trackingSettings).toBeUndefined();
  expect(newTenant?.trackingSettingsRevision).toBe(0);
  await auth(request(app).patch(`/tenants/${owner}`), 'super-admin').send({ name: 'Changed', ...attemptedWrite }).expect(200);
  await auth(request(app).patch(`/tenants/${owner}/settings`)).send({ seoSettings: { metaTitle: 'Changed' }, ...attemptedWrite }).expect(200);
  const tenant = await stored();
  expect(tenant?.name).toBe('Changed');
  expect(tenant?.seoSettings?.metaTitle).toBe('Changed');
  expect(tenant?.trackingSettings).toEqual(settings);
  expect(tenant?.trackingSettingsRevision).toBe(1);
});

it.each(['brand-admin', 'super-admin'])('preserves newer tracking settings when an old %s client echoes its GET snapshot', async role => {
  const initial = await auth(request(app).get(`/tenants/${owner}`), role).expect(200);
  // The deployed client spreads the admin read, dropping only menu/AI controls.
  const legacyPayload = { ...initial.body.data, seoSettings: { metaTitle: 'Legacy save' } };
  for (const key of ['navigation', 'navigationRevision', 'aiProducts', 'aiProductsRevision']) delete legacyPayload[key];
  expect(legacyPayload.trackingSettings).toEqual(blank);
  expect(legacyPayload.trackingSettingsRevision).toBe(0);
  await patch().send(body()).expect(200);
  const saved = await auth(request(app).patch(`/tenants/${owner}/settings`), role).send(legacyPayload).expect(200);
  expect(saved.body.data).toMatchObject({
    seoSettings: { metaTitle: 'Legacy save' }, trackingSettings: settings, trackingSettingsRevision: 1,
  });
  const tenant = await stored();
  expect(tenant?.trackingSettings).toEqual(settings);
  expect(tenant?.trackingSettingsRevision).toBe(1);
  // A second ordinary save remains compatible with the newly returned snapshot.
  await auth(request(app).patch(`/tenants/${owner}/settings`), role).send({
    ...legacyPayload, trackingSettings: saved.body.data.trackingSettings,
    trackingSettingsRevision: saved.body.data.trackingSettingsRevision,
    seoSettings: { metaTitle: 'Second legacy save' },
  }).expect(200);
  expect((await stored())?.trackingSettingsRevision).toBe(1);
});

it('strips protected fields without mutating the input or unrelated settings', () => {
  const input = { seoSettings: { metaTitle: 'Kept' }, trackingSettings: settings, trackingSettingsRevision: 8, $set: { trackingSettings: blank } };
  expect(withoutTrackingSettingsFields(input)).toEqual({ seoSettings: input.seoSettings });
  expect(input.trackingSettingsRevision).toBe(8);
  expect(input.trackingSettings).toEqual(settings);
  expect(withoutTrackingSettingsFields(null)).toBeNull();
  expect(withoutTrackingSettingsFields([])).toEqual([]);
});

it('exposes sanitized public settings without revision, provider secrets or unknown attributes', async () => {
  await patch().send(body()).expect(200);
  for (const route of [`/tenants/public/${owner}`, '/tenants/by-slug/cruise-site-0', '/tenants/by-domain/cruise-site-0.invalid']) {
    const result = await request(app).get(route).expect(200);
    // Domain discovery intentionally returns only domain/slug identity, not configuration.
    if (!route.includes('/by-domain/')) expect(result.body.data.trackingSettings).toEqual(settings);
    expect(result.body.data).not.toHaveProperty('trackingSettingsRevision');
  }
  await Tenant.collection.updateOne({ _id: owner }, { $set: { trackingSettings: { ...settings, script: '<script>bad</script>' } } });
  const corrupt = await request(app).get(`/tenants/public/${owner}`).expect(200);
  expect(corrupt.body.data.trackingSettings).toEqual(blank);
  expect(JSON.stringify(corrupt.body.data)).not.toContain('<script>bad');
  expect(toPublicTenantDto({ trackingSettings: { ...settings, googleTagManagerId: 'bad' }, trackingSettingsRevision: 42 }).trackingSettings).toEqual(blank);
  expect(publicTrackingSettings(null)).toEqual(blank);
});

it('applies model guards to direct writes as well as API validation', async () => {
  for (const value of [null, { ...settings, googleTagManagerId: '<script>' }, { ...settings, verificationCodes: [{ provider: 'google', code: 123 }] }]) {
    await expect(Tenant.updateOne({ _id: owner }, { $set: { trackingSettings: value } }, { runValidators: true })).rejects.toThrow();
  }
  await Tenant.updateOne({ _id: owner }, { $set: { trackingSettings: settings } }, { runValidators: true });
  await expect(Tenant.updateOne({ _id: owner }, { $set: { 'trackingSettings.googleTagManagerId': 'bad' } }, { runValidators: true })).rejects.toThrow();
  await expect(Tenant.updateOne({ _id: owner }, { $push: { 'trackingSettings.verificationCodes': settings.verificationCodes[0] } }, { runValidators: true })).rejects.toThrow();
  await expect(Tenant.updateOne({ _id: owner }, { $set: { trackingSettingsRevision: -1 } }, { runValidators: true })).rejects.toThrow();
  expect((await stored())?.trackingSettings).toEqual(settings);
  expect(trackingSettingsUpdateSchema.safeParse(body(0, { verificationCodes: [{ provider: 'google', code: 'a'.repeat(256) }] })).success).toBe(true);
});
