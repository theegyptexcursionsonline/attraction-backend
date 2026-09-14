import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import tenantRoutes from '../routes/tenants.routes';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { updateTenantAiProducts } from '../controllers/tenants.controller';
import { aiProductState, planAiProductsUpdate, publicAiSettings, splitAiProductControls } from '../utils/aiSettings';

// Authentication has its own coverage; the real role middleware, controller and MongoDB
// writes run here so the revision guard is exercised against a real database.
const actorId = new Types.ObjectId();
jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
  authenticate: (req: any, res: any, next: any) => {
    const role = req.header('x-test-role');
    if (!role) return res.status(401).json({ success: false });
    req.user = { _id: req.header('x-test-user'), role, assignedTenants: req.header('x-test-assigned')?.split(',').filter(Boolean) || [] };
    next();
  },
}));

jest.setTimeout(120_000);
const app = express();
app.use(express.json());
app.use('/tenants', tenantRoutes);
app.use((error: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));

const site = new Types.ObjectId();
const otherSite = new Types.ObjectId();
const searchId = 'wgt_abcdefghijklmnopqrstuv';
const voiceId = '6f1c2b3a4d5e6f708192a3b4';
let mongo: MongoMemoryReplSet;

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('tenant_ai_products'));
  await Tenant.init();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  jest.restoreAllMocks();
  await Tenant.collection.deleteMany({});
  await User.collection.deleteMany({});
  await User.collection.insertOne({ _id: actorId, email: 'qa-super@qa-site.invalid', firstName: 'QA', lastName: 'Operator', role: 'super-admin' });
  // Records as they exist today: no revision field, and search's switch never stored.
  await Tenant.collection.insertMany([site, otherSite].map((_id, i) => ({
    _id, slug: `ai-products-${i}`, domain: `ai-products-${i}.invalid`, name: `AI products ${i}`, status: 'active',
    aiSettings: { voiceAgent: { enabled: false, languages: ['en'] }, searchWidget: { placeholder: 'Search tours', displayPages: 'browse' } },
  })));
});

const aiProducts = (body: unknown, { id = String(site), role = 'super-admin' }: { id?: string; role?: string } = {}) => request(app)
  .patch(`/tenants/${id}/ai-products`).set('x-test-role', role).set('x-test-user', String(actorId)).set('x-test-assigned', String(site)).send(body as object);
const stored = () => Tenant.findById(site).lean();
const publicRead = async (id = site) => (await request(app).get(`/tenants/public/${id}`).expect(200)).body.data.aiSettings;

describe('PATCH /tenants/:id/ai-products', () => {
  it('lets a super admin switch search and voice on and off, stamping who changed them and publishing only live products', async () => {
    const log = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const on = await aiProducts({ expectedRevision: 0, search: { enabled: true, widgetId: `  ${searchId}  ` } }).expect(200);
    expect(on.body.data).toMatchObject({
      revision: 1,
      search: { enabled: true, widgetId: searchId, live: true, updatedBy: String(actorId), updatedByName: 'QA Operator' },
      voice: { enabled: false, widgetId: null, live: false, updatedBy: null, updatedAt: null },
    });
    expect(new Date(on.body.data.search.updatedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(log).toHaveBeenCalledWith('[tenants] ai product updated', expect.objectContaining({
      actorId: String(actorId), tenantId: String(site), tenantSlug: 'ai-products-0', product: 'search',
      before: { enabled: false, widgetId: null }, after: { enabled: true, widgetId: searchId }, revision: 1,
    }));
    expect((await stored())?.aiSettings.searchWidget).toMatchObject({ enabled: true, widgetId: searchId, placeholder: 'Search tours' });
    expect(await publicRead()).toMatchObject({ searchWidget: { enabled: true, widgetId: searchId, placeholder: 'Search tours' } });
    expect(JSON.stringify(await publicRead())).not.toMatch(/updatedBy|updatedAt|qa-super/);

    await aiProducts({ expectedRevision: 1, voice: { enabled: true, widgetId: voiceId.toUpperCase() } }).expect(200);
    expect((await publicRead()).voiceAgent).toEqual({ enabled: true, widgetId: voiceId, languages: ['en'] });

    const off = await aiProducts({ expectedRevision: 2, search: { enabled: false }, voice: { enabled: false, widgetId: null } }).expect(200);
    expect(off.body.data).toMatchObject({ revision: 3, search: { enabled: false, widgetId: searchId, live: false }, voice: { enabled: false, widgetId: null } });
    const published = await publicRead();
    expect(published.searchWidget).toEqual({ placeholder: 'Search tours', displayPages: 'browse' });
    expect(published.voiceAgent).toEqual({ languages: ['en'] });
    expect((await stored())?.aiSettings.voiceAgent).not.toHaveProperty('widgetId');
    expect((await stored())?.aiProductsRevision).toBe(3);
    // Another site is untouched.
    expect((await Tenant.findById(otherSite).lean())?.aiSettings.searchWidget).toEqual({ placeholder: 'Search tours', displayPages: 'browse' });
  });

  it('shows change history to super admins only on the admin tenant read', async () => {
    await aiProducts({ expectedRevision: 0, search: { enabled: true, widgetId: searchId } }).expect(200);
    const superRead = await request(app).get(`/tenants/${site}`).set('x-test-role', 'super-admin').expect(200);
    expect(superRead.body.data.aiProductsRevision).toBe(1);
    expect(superRead.body.data.aiSettings.searchWidget.updatedBy).toBe(String(actorId));
    expect(superRead.body.data.aiProducts).toMatchObject({ revision: 1, search: { live: true, updatedByName: 'QA Operator' } });
    for (const role of ['brand-admin', 'manager', 'editor', 'viewer']) {
      const read = await request(app).get(`/tenants/${site}`).set('x-test-role', role).set('x-test-assigned', String(site)).expect(200);
      expect(read.body.data.aiSettings.searchWidget).toMatchObject({ enabled: true, widgetId: searchId });
      expect(JSON.stringify(read.body.data)).not.toMatch(/updatedBy|aiProductsRevision|aiProducts|qa-super/);
      expect(read.body.data.aiSettings.searchWidget).not.toHaveProperty('updatedAt');
    }
  });

  it.each(['brand-admin', 'manager', 'editor', 'viewer', 'customer'])('refuses the %s role without a write', async role => {
    await aiProducts({ expectedRevision: 0, search: { enabled: true, widgetId: searchId } }, { role }).expect(403);
    expect((await stored())?.aiSettings.searchWidget).toEqual({ placeholder: 'Search tours', displayPages: 'browse' });
    expect((await stored())?.aiProductsRevision).toBeUndefined();
  });

  it('refuses signed-out requests and direct handler calls without a super admin', async () => {
    await request(app).patch(`/tenants/${site}/ai-products`).send({ expectedRevision: 0, search: { enabled: false } }).expect(401);
    for (const user of [undefined, { role: 'brand-admin', assignedTenants: [site] }]) {
      const response: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await updateTenantAiProducts({ params: { id: String(site) }, body: { expectedRevision: 0, search: { enabled: false } }, user } as any, response, jest.fn());
      expect(response.status).toHaveBeenCalledWith(user ? 403 : 401);
    }
  });

  it.each([
    [{}], [{ expectedRevision: 0 }], [{ search: { enabled: false } }], [{ expectedRevision: '0', search: { enabled: false } }],
    [{ expectedRevision: -1, search: { enabled: false } }], [{ expectedRevision: 1.5, search: { enabled: false } }],
    [{ expectedRevision: 0, search: { enabled: 'true', widgetId: searchId } }],
    [{ expectedRevision: 0, search: { enabled: true, widgetId: 'wgt_short' } }],
    [{ expectedRevision: 0, search: { enabled: true, widgetId: voiceId } }],
    [{ expectedRevision: 0, voice: { enabled: true, widgetId: searchId } }],
    [{ expectedRevision: 0, voice: { enabled: true, widgetId: `${voiceId}"><script>` } }],
    [{ expectedRevision: 0, search: { widgetId: { $ne: null } } }],
    [{ expectedRevision: 0, search: { enabled: true, widgetId: searchId, placeholder: 'x' } }],
    [{ expectedRevision: 0, search: { enabled: true, widgetId: searchId, updatedBy: String(new Types.ObjectId()) } }],
    [{ expectedRevision: 0, booking: { enabled: true } }],
    [{ expectedRevision: 0, search: { enabled: true, widgetId: searchId }, tenantId: String(otherSite) }],
    // A product can only be on with a valid id.
    [{ expectedRevision: 0, search: { enabled: true } }],
    [{ expectedRevision: 0, voice: { enabled: true, widgetId: '' } }],
  ])('rejects %j with 400 and no write', async body => {
    const response = await aiProducts(body).expect(400);
    expect(response.body.success).toBe(false);
    expect((await stored())?.aiSettings.searchWidget).toEqual({ placeholder: 'Search tours', displayPages: 'browse' });
    expect((await stored())?.aiProductsRevision).toBeUndefined();
  });

  it('refuses to clear the id of a product that stays on', async () => {
    await aiProducts({ expectedRevision: 0, search: { enabled: true, widgetId: searchId } }).expect(200);
    const refused = await aiProducts({ expectedRevision: 1, search: { widgetId: null } }).expect(400);
    expect(refused.body.error).toBe('AI Search needs a valid widget ID before it can be switched on');
    await aiProducts({ expectedRevision: 1, search: { enabled: false, widgetId: null } }).expect(200);
  });

  it('answers 409 on a stale revision, including two admins saving from the same revision at once', async () => {
    await aiProducts({ expectedRevision: 0, search: { enabled: true, widgetId: searchId } }).expect(200);
    const stale = await aiProducts({ expectedRevision: 0, search: { enabled: false } }).expect(409);
    expect(stale.body.error).toBe('AI products were changed by someone else. Reload and try again.');
    await aiProducts({ expectedRevision: 5, search: { enabled: false } }).expect(409);
    expect((await stored())?.aiSettings.searchWidget.enabled).toBe(true);

    const results = await Promise.all([
      aiProducts({ expectedRevision: 1, search: { enabled: false } }),
      aiProducts({ expectedRevision: 1, voice: { enabled: true, widgetId: voiceId } }),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await stored())?.aiProductsRevision).toBe(2);
  });

  it('answers 409 when the guarded write matches nothing, never acknowledging a lost update', async () => {
    jest.spyOn(Tenant, 'updateOne').mockResolvedValueOnce({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null } as any);
    await aiProducts({ expectedRevision: 0, search: { enabled: true, widgetId: searchId } }).expect(409);
    expect((await stored())?.aiSettings.searchWidget.enabled).toBeUndefined();
  });

  it('returns the current state without bumping the revision when nothing changes', async () => {
    await aiProducts({ expectedRevision: 0, search: { enabled: true, widgetId: searchId } }).expect(200);
    const same = await aiProducts({ expectedRevision: 1, search: { enabled: true, widgetId: searchId } }).expect(200);
    expect(same.body.data).toMatchObject({ revision: 1, search: { live: true } });
    expect((await stored())?.aiProductsRevision).toBe(1);
  });

  it('keeps missing and malformed tenants indistinguishable', async () => {
    for (const id of ['not-an-id', String(new Types.ObjectId())]) {
      const response = await aiProducts({ expectedRevision: 0, search: { enabled: true, widgetId: searchId } }, { id }).expect(404);
      expect(response.body.error).toBe('Tenant not found');
    }
  });

  it('does not acknowledge a failed database write', async () => {
    jest.spyOn(Tenant, 'updateOne').mockRejectedValueOnce(new Error('database unavailable'));
    await aiProducts({ expectedRevision: 0, search: { enabled: true, widgetId: searchId } }).expect(500);
    expect((await stored())?.aiProductsRevision).toBeUndefined();
    await aiProducts({ expectedRevision: 0, search: { enabled: true, widgetId: searchId } }).expect(200);
  });
});

describe('sites that predate the explicit search switch', () => {
  it('stay live publicly when a widget id exists and the switch was never stored', async () => {
    await Tenant.collection.updateOne({ _id: site }, { $set: { 'aiSettings.searchWidget.widgetId': searchId } });
    expect((await stored())?.aiSettings.searchWidget).not.toHaveProperty('enabled');
    expect((await publicRead()).searchWidget).toEqual({ enabled: true, widgetId: searchId, placeholder: 'Search tours', displayPages: 'browse' });
    const bySlug = await request(app).get('/tenants/by-slug/ai-products-0').expect(200);
    expect(bySlug.body.data.aiSettings.searchWidget).toMatchObject({ enabled: true, widgetId: searchId });
    const list = await request(app).get('/tenants/public').expect(200);
    expect(list.body.data.find((tenant: any) => tenant.slug === 'ai-products-0').aiSettings.searchWidget).toMatchObject({ enabled: true, widgetId: searchId });
    // The admin sees the same effective state and can switch it off from revision 0.
    const admin = await request(app).get(`/tenants/${site}`).set('x-test-role', 'super-admin').expect(200);
    expect(admin.body.data.aiSettings.searchWidget.enabled).toBe(true);
    expect(admin.body.data.aiProducts).toMatchObject({ revision: 0, search: { enabled: true, live: true } });
    await aiProducts({ expectedRevision: 0, search: { enabled: false } }).expect(200);
    expect((await publicRead()).searchWidget).not.toHaveProperty('widgetId');
  });

  it('stay off when no widget id exists, and an explicit switch always wins', () => {
    expect(aiProductState({ searchWidget: {} }, 'search')).toEqual({ enabled: false, widgetId: null });
    expect(aiProductState({ searchWidget: { enabled: false, widgetId: searchId } }, 'search')).toEqual({ enabled: false, widgetId: searchId });
    expect(aiProductState({ searchWidget: { enabled: true, widgetId: 'wgt_bad' } }, 'search')).toEqual({ enabled: true, widgetId: null });
    // Voice never defaulted on; seed data that set enabled without an id publishes nothing.
    expect(aiProductState({ voiceAgent: { widgetId: voiceId } }, 'voice')).toEqual({ enabled: false, widgetId: voiceId });
    expect(publicAiSettings({ voiceAgent: { enabled: true, languages: ['en'] }, searchWidget: { enabled: true } })).toEqual({ voiceAgent: { languages: ['en'] }, searchWidget: {} });
    expect(publicAiSettings({ searchWidget: { widgetId: searchId, updatedBy: String(actorId), updatedAt: new Date() } })).toEqual({ searchWidget: { enabled: true, widgetId: searchId } });
  });
});

describe('AI product control helpers', () => {
  it('plans only real changes', () => {
    expect(planAiProductsUpdate({ searchWidget: { enabled: true, widgetId: searchId } }, { expectedRevision: 0, search: { enabled: true } })).toEqual({ changes: [] });
    expect(planAiProductsUpdate({}, { expectedRevision: 0, voice: { widgetId: voiceId } })).toEqual({ changes: [
      { product: 'voice', before: { enabled: false, widgetId: null }, after: { enabled: false, widgetId: voiceId } },
    ] });
  });

  it('drops unchanged switches from a settings body and reports changed ones', () => {
    const current = { searchWidget: { widgetId: searchId }, voiceAgent: { enabled: false } };
    expect(splitAiProductControls(current, { searchWidget: { enabled: true, widgetId: searchId, placeholder: 'x' }, voiceAgent: { enabled: false, languages: [] } }))
      .toEqual({ settings: { searchWidget: { placeholder: 'x' }, voiceAgent: { languages: [] } }, changed: [] });
    expect(splitAiProductControls(current, { searchWidget: { widgetId: '' }, voiceAgent: { enabled: true } }).changed).toEqual(['search', 'voice']);
    expect(splitAiProductControls({}, { searchWidget: { widgetId: '' }, bookingWidget: { enabled: true } }))
      .toEqual({ settings: { searchWidget: {}, bookingWidget: { enabled: true } }, changed: [] });
  });
});
