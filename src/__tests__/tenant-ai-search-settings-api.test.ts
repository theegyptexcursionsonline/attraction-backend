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

it('keeps AI Search presentation editable by the site admin while the switch and id stay with Foxes', async () => {
  await Tenant.collection.updateOne({ _id: owner }, { $set: { 'aiSettings.searchWidget.widgetId': widgetId } });
  // An older admin build sends the stored switch and id back with every save: accepted, not rewritten.
  await Tenant.collection.updateOne({ _id: owner }, { $set: { previewAccessCode: 'private-preview-code', 'paymentSettings.stripe.secretKeyEnc': 'private-secret' } });
  const saved = await patch().send(search({ enabled: true, widgetId, placeholder: 'Find a tour' })).expect(200);
  expect(saved.body.data.aiSettings.searchWidget).toMatchObject({ enabled: true, widgetId, placeholder: 'Find a tour' });
  expect(JSON.stringify(saved.body)).not.toMatch(/private-preview-code|private-secret|aiProductsRevision/);
  expect((await stored())?.aiSettings).toMatchObject({ bookingWidget: { welcomeMessage: 'Book your visit' },
    voiceAgent: { enabled: false }, searchWidget: { widgetId, enabled: true, placeholder: 'Find a tour' } });
  expect((await stored())?.aiSettings.searchWidget).not.toHaveProperty('updatedBy');
  for (const change of [{ enabled: false }, { widgetId: 'wgt_zyxwvutsrqponmlkjihgfe' }, { widgetId: '' }, { widgetId: null }]) {
    const refused = await patch().send(search({ ...change, placeholder: 'Changed' })).expect(403);
    expect(refused.body.error).toBe('AI Search and Voice are switched on and off by Foxes');
  }
  for (const change of [{ enabled: true }, { widgetId: '6f1c2b3a4d5e6f708192a3b4' }]) {
    await patch().send({ aiSettings: { voiceAgent: change } }).expect(403);
  }
  expect((await stored())?.aiSettings.searchWidget).toMatchObject({ widgetId, enabled: true, placeholder: 'Find a tour' });
  expect((await stored())?.aiSettings.voiceAgent).toEqual({ enabled: false });
  const read = await request(app).get(`/tenants/public/${owner}`).expect(200);
  expect(read.body.data.aiSettings.searchWidget).toMatchObject({ enabled: true, widgetId, placeholder: 'Find a tour' });
});

it('refuses switch changes from a super admin on the settings and full update routes, pointing to the AI products card', async () => {
  for (const path of ['settings', '']) {
    const refused = await patch(owner, 'super-admin', path).send(search({ widgetId })).expect(400);
    expect(refused.body.error).toMatch(/AI products card/);
  }
  await patch(owner, 'super-admin', '').send(search({ enabled: true })).expect(400);
  await patch(owner, 'super-admin').send(search({ enabled: true, placeholder: 'Unchanged switch' })).expect(200);
  expect((await stored())?.aiSettings.searchWidget).toMatchObject({ enabled: true, placeholder: 'Unchanged switch' });
  expect((await stored())?.aiSettings.searchWidget.widgetId).toBeUndefined();
});

it('lets a site admin choose where search appears, defaulting to browsing pages only', async () => {
  await Tenant.collection.updateOne({ _id: owner }, { $set: { 'aiSettings.searchWidget.widgetId': widgetId } });
  let read = await request(app).get(`/tenants/public/${owner}`).expect(200);
  // Existing sites carry no choice; the storefront treats that as browsing pages only.
  expect(read.body.data.aiSettings.searchWidget.displayPages).toBeUndefined();
  await patch().send(search({ displayPages: 'all' })).expect(200);
  expect((await stored())?.aiSettings.searchWidget).toMatchObject({ widgetId, displayPages: 'all', placeholder: 'Search experiences' });
  read = await request(app).get(`/tenants/public/${owner}`).expect(200);
  expect(read.body.data.aiSettings.searchWidget.displayPages).toBe('all');
  await patch().send(search({ displayPages: 'browse' })).expect(200);
  expect((await stored())?.aiSettings.searchWidget.displayPages).toBe('browse');
  await patch(other).send(search({ displayPages: 'all' })).expect(404);
});

it('preserves independently updated search/voice/booking fields under concurrent requests and retries', async () => {
  await Promise.all([
    patch().send(search({ maxSuggestions: 8 })).expect(200),
    patch().send({ aiSettings: { voiceAgent: { buttonPosition: 'header' } } }).expect(200),
    patch().send(search({ placeholder: 'Find a tour' })).expect(200),
  ]);
  await patch().send(search({ maxSuggestions: 8 })).expect(200);
  expect((await stored())?.aiSettings).toMatchObject({ bookingWidget: { welcomeMessage: 'Book your visit' },
    voiceAgent: { enabled: false, buttonPosition: 'header' }, searchWidget: { placeholder: 'Find a tour', maxSuggestions: 8 } });
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
  await patch().set('x-test-assigned', '').send(search({ placeholder: 'Hijack' })).expect(404);
  await patch(other, 'super-admin').send(search({ placeholder: 'Other site' })).expect(200);
});

it.each([
  null, [], 'invalid', { searchWidget: null }, { searchWidget: [] },
  { searchWidget: { widgetId: 123 } }, { searchWidget: { widgetId: true } },
  { searchWidget: { widgetId: 'wgt_short' } }, { searchWidget: { widgetId: 'wgt_abc"><script>' } },
  { searchWidget: { widgetId: 'wgt_' + 'a'.repeat(65) } },
  { searchWidget: { widgetId: { $ne: null } } }, { searchWidget: { enabled: 'false' } },
  { searchWidget: { clientId: String(other) } }, { searchWidget: { allowedDomains: ['other.invalid'] } },
  { searchWidget: { apiKey: 'private' } }, { searchWidget: { maxSuggestions: 21 } },
  { searchWidget: { displayPages: 'tour' } }, { searchWidget: { displayPages: ['all'] } }, { searchWidget: { displayPages: { $ne: 'browse' } } },
])('rejects malformed or authorization-bearing AI settings: %j', async aiSettings => {
  await patch().send({ aiSettings }).expect(400);
  expect((await stored())?.aiSettings.searchWidget.widgetId).toBeUndefined();
});

it('persists validated AI presentation settings through the super-admin update, and create leaves the product off', async () => {
  await patch(owner, 'super-admin', '').send(search({ placeholder: 'Full update' })).expect(200);
  expect((await stored())?.aiSettings.searchWidget.placeholder).toBe('Full update');
  await patch(owner, 'super-admin', '').send(search({ widgetId: 'broken' })).expect(400);
  const created = await request(app).post('/tenants').set('x-test-role', 'super-admin').send({
    slug: 'new-widget-site', name: 'New widget site', domain: 'new-widget-site.invalid',
    logo: 'https://images.invalid/logo.png', theme: { primaryColor: '#000000', secondaryColor: '#222222', accentColor: '#444444' },
    defaultCurrency: 'USD', defaultLanguage: 'en', supportedLanguages: ['en'], ...search({ widgetId }),
  }).expect(201);
  // A new site never goes live from the create form: the id and switch are set in the audited AI products card.
  expect((await Tenant.findById(created.body.data._id).lean())?.aiSettings.searchWidget.widgetId).toBeUndefined();
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
  await patch().send(search({ placeholder: 'After retry' })).expect(500);
  failedWrite.mockRestore();
  expect((await stored())?.aiSettings.searchWidget.placeholder).toBe('Search experiences');
  await patch().send(search({ placeholder: 'After retry' })).expect(200);
  expect((await stored())?.aiSettings.searchWidget.placeholder).toBe('After retry');
});

it('stores a private booking notifications email that never reaches the public site', async () => {
  await Tenant.collection.updateOne({ _id: owner }, { $set: { contactInfo: { email: 'support@qa-site.invalid', phone: '+20100000000' } } });
  await patch().send({ notificationSettings: { bookingEmail: ' Reservations@QA-Site.invalid ' } }).expect(200);
  expect((await stored())?.notificationSettings).toEqual({ bookingEmail: 'reservations@qa-site.invalid' });
  expect((await stored())?.contactInfo?.email).toBe('support@qa-site.invalid');
  const read = await request(app).get(`/tenants/public/${owner}`).expect(200);
  expect(read.body.data.notificationSettings).toBeUndefined();
  expect(JSON.stringify(read.body)).not.toContain('reservations@qa-site.invalid');
  const bySlug = await request(app).get('/tenants/by-slug/widget-site-0').expect(200);
  expect(JSON.stringify(bySlug.body)).not.toContain('reservations@qa-site.invalid');

  for (const body of [{ bookingEmail: 'nope' }, { bookingEmail: 'a@b.io', cc: 'c@d.io' }, 'a@b.io']) {
    const rejected = await patch().send({ notificationSettings: body }).expect(400);
    expect(rejected.body.success).toBe(false);
  }
  expect((await stored())?.notificationSettings?.bookingEmail).toBe('reservations@qa-site.invalid');

  // Another site's admin cannot set it; the record is indistinguishable from a missing one.
  await patch(other).send({ notificationSettings: { bookingEmail: 'hijack@qa-site.invalid' } }).expect(404);
  expect((await Tenant.findById(other).lean())?.notificationSettings?.bookingEmail).toBeUndefined();

  await patch().send({ notificationSettings: { bookingEmail: '' } }).expect(200);
  expect((await stored())?.notificationSettings?.bookingEmail).toBe('');
});

describe('private notification copy settings', () => {
  const copies = {
    bookingCcEmails: ['booking-copy@qa-site.invalid'],
    contactCcEmails: ['contact-copy@qa-site.invalid'],
  };

  it('normalizes both lists, keeps public support details unchanged, and hides all notification recipients publicly', async () => {
    await Tenant.collection.updateOne({ _id: owner }, { $set: { contactInfo: { email: 'support@qa-site.invalid' } } });
    const saved = await patch().send({ notificationSettings: {
      bookingEmail: 'reservations@qa-site.invalid',
      bookingCcEmails: [' Booking-Copy@QA-Site.invalid ', 'booking-copy@qa-site.invalid'],
      contactCcEmails: [' Contact-Copy@QA-Site.invalid ', 'contact-copy@qa-site.invalid'],
    } }).expect(200);
    expect(saved.body.data.notificationSettings).toEqual({ bookingEmail: 'reservations@qa-site.invalid', ...copies });
    expect((await stored())?.notificationSettings).toEqual({ bookingEmail: 'reservations@qa-site.invalid', ...copies });
    expect((await stored())?.contactInfo?.email).toBe('support@qa-site.invalid');
    for (const url of [`/tenants/public/${owner}`, '/tenants/by-slug/widget-site-0']) {
      const read = await request(app).get(url).expect(200);
      expect(read.body.data.notificationSettings).toBeUndefined();
      expect(JSON.stringify(read.body)).not.toMatch(/booking-copy@|contact-copy@|reservations@/);
      expect(read.body.data.contactInfo.email).toBe('support@qa-site.invalid');
    }
  });

  it('preserves copies through old-client single-inbox saves and independent concurrent changes', async () => {
    await patch().send({ notificationSettings: { bookingEmail: 'primary@qa-site.invalid', ...copies } }).expect(200);
    await patch().send({ notificationSettings: { bookingEmail: 'replacement@qa-site.invalid' } }).expect(200);
    expect((await stored())?.notificationSettings).toEqual({ bookingEmail: 'replacement@qa-site.invalid', ...copies });
    await patch().send({ notificationSettings: { bookingEmail: '' } }).expect(200);
    expect((await stored())?.notificationSettings).toEqual({ bookingEmail: '', ...copies });
    await Promise.all([
      patch().send({ notificationSettings: { bookingCcEmails: ['new-booking@qa-site.invalid'] } }).expect(200),
      patch().send({ notificationSettings: { contactCcEmails: ['new-contact@qa-site.invalid'] } }).expect(200),
    ]);
    await patch().send({ notificationSettings: { bookingCcEmails: ['new-booking@qa-site.invalid'] } }).expect(200);
    expect((await stored())?.notificationSettings).toEqual({ bookingEmail: '',
      bookingCcEmails: ['new-booking@qa-site.invalid'], contactCcEmails: ['new-contact@qa-site.invalid'],
    });
    await patch().send({ notificationSettings: { bookingCcEmails: [] } }).expect(200);
    expect((await stored())?.notificationSettings).toEqual({ bookingEmail: '',
      bookingCcEmails: [], contactCcEmails: ['new-contact@qa-site.invalid'],
    });
    await patch().send({ notificationSettings: { contactCcEmails: [] } }).expect(200);
    expect((await stored())?.notificationSettings).toEqual({ bookingEmail: '', bookingCcEmails: [], contactCcEmails: [] });
  });

  it.each(['bookingCcEmails', 'contactCcEmails'])('validates %s atomically before any recipient or contact setting changes', async field => {
    await patch().send({ notificationSettings: { bookingEmail: 'primary@qa-site.invalid', ...copies } }).expect(200);
    const before = (await stored())?.notificationSettings;
    const invalid: unknown[] = [null, 'copy@qa-site.invalid', {}, [''], [12], ['nope'],
      ['one@qa-site.invalid,two@qa-site.invalid'], ['one@qa-site.invalid\r\nBcc: two@qa-site.invalid'],
      [`${'a'.repeat(250)}@qa-site.invalid`], Array.from({ length: 6 }, (_, i) => `copy${i}@qa-site.invalid`),
    ];
    for (const value of invalid) {
      await patch().send({ notificationSettings: { bookingEmail: 'changed@qa-site.invalid', [field]: value } }).expect(400);
      expect((await stored())?.notificationSettings).toEqual(before);
    }
    const five = Array.from({ length: 5 }, (_, i) => `copy${i}@qa-site.invalid`);
    await patch().send({ notificationSettings: { [field]: five } }).expect(200);
    expect((await stored())?.notificationSettings).toMatchObject({ [field]: five });
  });

  it('enforces authentication, role and tenant boundaries for copy recipients', async () => {
    await request(app).patch(`/tenants/${owner}/settings`).send({ notificationSettings: copies }).expect(401);
    for (const role of ['manager', 'editor', 'viewer', 'customer', 'operator', 'agent']) {
      await patch(owner, role).send({ notificationSettings: copies }).expect(403);
    }
    await patch().set('x-test-assigned', '').send({ notificationSettings: copies }).expect(404);
    for (const target of [other, new Types.ObjectId()]) {
      await patch(target).query({ tenantId: String(owner) }).send({ tenantId: String(owner), notificationSettings: copies }).expect(404);
    }
    expect((await stored())?.notificationSettings?.bookingCcEmails).toBeUndefined();
    expect((await Tenant.findById(other).lean())?.notificationSettings?.contactCcEmails).toBeUndefined();
    await patch(other, 'super-admin').send({ notificationSettings: copies }).expect(200);
    expect((await Tenant.findById(other).lean())?.notificationSettings).toMatchObject(copies);
  });
});
