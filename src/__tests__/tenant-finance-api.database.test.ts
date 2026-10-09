import express from 'express';
import request from '../test/loopbackRequest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import tenantRoutes from '../routes/tenants.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { TenantFinanceRevision } from '../models/TenantFinanceRevision';
import { initialFinanceFees } from '../utils/financeSettings';
import { updateTenantSettings } from '../controllers/tenants.controller';
import { fenceFinancePolicy, loadFinancePolicy } from '../services/tenantFinance.service';
import { AuthRequest } from '../types';

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
const site = new Types.ObjectId();
const other = new Types.ObjectId();
const app = express();
app.use(express.json());
app.use('/tenants', tenantRoutes);
app.use((error: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));
const auth = (test: request.Test, role = 'brand-admin') => test.set('x-test-role', role).set('x-test-assigned', String(site));
const get = (id = site, role = 'brand-admin') => auth(request(app).get(`/tenants/${id}/finance`), role);
const put = (body: object, id = site, role = 'brand-admin') => auth(request(app).put(`/tenants/${id}/finance`), role).send(body);
const body = (expectedRevision = 0) => ({ expectedRevision, fees: initialFinanceFees() });
let mongo: MongoMemoryReplSet;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('tenant_finance'));
  await TenantFinanceRevision.init();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await Promise.all([Tenant.collection.deleteMany({}), Attraction.collection.deleteMany({}), TenantFinanceRevision.deleteMany({})]);
  await Tenant.collection.insertMany([site, other].map((_id, index) => ({ _id, slug: `finance-site-${index}`, name: `Finance site ${index}`, domain: `finance-site-${index}.invalid`, status: 'active', defaultCurrency: 'USD' })));
  await Attraction.collection.insertOne({ tenantIds: [site], currency: 'EUR', status: 'active' });
});
afterEach(() => jest.restoreAllMocks());

describe('versioned website Finance settings', () => {
  it('reads effective legacy defaults without activating or changing a site', async () => {
    const result = await get().expect(200);
    expect(result.body.data).toEqual({ configured: false, revision: 0, fees: initialFinanceFees(), saleCurrencies: ['EUR', 'USD'], basis: 'discounted_service_amount', fixedFeeUnit: 'booking' });
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect((await Tenant.findById(site).lean())?.financeSettings).toBeUndefined();
  });

  it.each(['brand-admin', 'super-admin'])('saves a complete snapshot and immutable audit revision for %s', async role => {
    const result = await put(body(), site, role).expect(200);
    expect(result.body.data).toMatchObject({ configured: true, revision: 1 });
    expect((await Tenant.findById(site).lean())?.financeSettings).toEqual({ version: 1, fees: initialFinanceFees() });
    const audit = await TenantFinanceRevision.findOne({ tenantId: site, revision: 1 }).lean();
    expect(audit?.fees).toEqual(initialFinanceFees());
    expect(String(audit?.actorId)).toBe('000000000000000000000001');
  });

  it('makes an explicit all-off policy distinct from missing configuration', async () => {
    const settings = body(); settings.fees.booking.enabled = false;
    const result = await put(settings).expect(200);
    expect(result.body.data).toMatchObject({ configured: true, revision: 1, fees: { booking: { enabled: false } } });
  });

  it('allows one concurrent editor and refuses stale revisions without a second audit', async () => {
    const results = await Promise.all([put(body()), put(body())]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    await put(body()).expect(409);
    expect(await TenantFinanceRevision.countDocuments({ tenantId: site })).toBe(1);
  });

  it('requires a currency-specific fixed amount for every sale currency', async () => {
    const settings = body();
    settings.fees.booking = { enabled: true, type: 'fixed', payer: 'customer', fixedAmounts: { USD: 5 } };
    await put(settings).expect(400);
    settings.fees.booking.fixedAmounts.EUR = 4;
    await put(settings).expect(200);
  });

  it.each(['customer', 'manager', 'editor', 'viewer'])('refuses %s despite membership', async role => {
    await get(site, role).expect(403);
    await put(body(), site, role).expect(403);
    expect(await TenantFinanceRevision.countDocuments({})).toBe(0);
  });

  it('requires authentication and makes foreign and missing sites indistinguishable', async () => {
    await request(app).get(`/tenants/${site}/finance`).expect(401);
    await request(app).put(`/tenants/${site}/finance`).send(body()).expect(401);
    const foreign = await get(other).expect(404);
    const missing = await get(new Types.ObjectId()).expect(404);
    expect(foreign.body).toEqual(missing.body);
    await put(body(), other).expect(404);
  });

  it('keeps business-paid policy fields out of the public tenant response', async () => {
    await put(body()).expect(200);
    const result = await request(app).get('/tenants/by-slug/finance-site-0').expect(200);
    expect(result.body.data).not.toHaveProperty('financeSettings');
    expect(result.body.data).not.toHaveProperty('financeRevision');
  });

  it('prevents a general settings request from overwriting Finance', async () => {
    await put(body()).expect(200);
    const res: any = {}; res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res);
    const next = jest.fn();
    await updateTenantSettings({ user: { role: 'brand-admin', assignedTenants: [site] }, params: { id: String(site) }, body: { financeSettings: null, financeRevision: 90, tagline: 'Updated tagline' } } as unknown as AuthRequest, res, next);
    expect(next).not.toHaveBeenCalled();
    expect((await Tenant.findById(site).lean())?.financeRevision).toBe(1);
    expect((await Tenant.findById(site).lean())?.tagline).toBe('Updated tagline');
  });

  it('rolls back the policy write if its audit cannot be persisted', async () => {
    jest.spyOn(TenantFinanceRevision, 'create').mockRejectedValue(new Error('audit unavailable') as never);
    await put(body()).expect(500);
    expect((await Tenant.findById(site).lean())?.financeSettings).toBeUndefined();
  });

  it('refuses a booking fence after the policy changed', async () => {
    const oldPolicy = await loadFinancePolicy(site);
    await put(body()).expect(200);
    await expect(fenceFinancePolicy(oldPolicy)).rejects.toThrow('Website fees changed');
    await expect(fenceFinancePolicy(await loadFinancePolicy(site))).resolves.toBeUndefined();
  });
});
