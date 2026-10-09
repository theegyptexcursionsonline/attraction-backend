import express from 'express';
import request from '../test/loopbackRequest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import tenantRoutes from '../routes/tenants.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { TenantFinanceRevision } from '../models/TenantFinanceRevision';
import { initialFinanceFees, initialFinanceLocks } from '../utils/financeSettings';
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
    expect(result.body.data).toEqual({ configured: false, revision: 0, fees: initialFinanceFees(), locks: initialFinanceLocks(), canLock: false, saleCurrencies: ['EUR', 'USD'], basis: 'discounted_service_amount', fixedFeeUnit: 'booking' });
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect((await Tenant.findById(site).lean())?.financeSettings).toBeUndefined();
  });

  it.each(['brand-admin', 'super-admin'])('saves a complete snapshot and immutable audit revision for %s', async role => {
    const result = await put(body(), site, role).expect(200);
    expect(result.body.data).toMatchObject({ configured: true, revision: 1 });
    expect((await Tenant.findById(site).lean())?.financeSettings).toEqual({ version: 1, fees: initialFinanceFees(), locks: initialFinanceLocks() });
    const audit = await TenantFinanceRevision.findOne({ tenantId: site, revision: 1 }).lean();
    expect(audit?.fees).toEqual(initialFinanceFees());
    expect(audit?.locks).toEqual(initialFinanceLocks());
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

it.each(['manager', 'editor', 'viewer'])('does not bypass private Finance reads through generic tenant routes for %s', async role => {
  await put(body()).expect(200);
  const list = await auth(request(app).get('/tenants'), role).expect(200);
  const detail = await auth(request(app).get(`/tenants/${site}`), role).expect(200);
  for (const value of [...list.body.data, detail.body.data]) {
    expect(value).not.toHaveProperty('financeSettings'); expect(value).not.toHaveProperty('financeRevision');
  }
});

describe('fees a super admin locks for a website (client request, 10 Oct 2026)', () => {
  const locked = { transaction: false, booking: true, payout: true };
  const lockAsSuperAdmin = async () => {
    const result = await put({ ...body(), locks: locked }, site, 'super-admin').expect(200);
    expect(result.body.data).toMatchObject({ revision: 1, locks: locked, canLock: true });
  };

  it('shows the locks to the site admin, who cannot change them', async () => {
    await lockAsSuperAdmin();
    const read = await get().expect(200);
    expect(read.body.data).toMatchObject({ locks: locked, canLock: false });
    expect((await get(site, 'super-admin').expect(200)).body.data.canLock).toBe(true);
  });

  it.each([
    ['its percentage', (fees: ReturnType<typeof initialFinanceFees>) => { fees.booking = { ...fees.booking, percentage: 3 } as typeof fees.booking; }],
    ['who pays', (fees: ReturnType<typeof initialFinanceFees>) => { fees.booking = { ...fees.booking, payer: 'business' }; }],
    ['whether it is on', (fees: ReturnType<typeof initialFinanceFees>) => { fees.payout = { ...fees.payout, enabled: true }; }],
  ])('refuses a site admin who changes a locked fee (%s), changing nothing', async (_label, change) => {
    await lockAsSuperAdmin();
    const fees = initialFinanceFees();
    change(fees);
    const refused = await put({ expectedRevision: 1, fees }).expect(403);
    expect(refused.body.code).toBe('FINANCE_FEE_LOCKED');
    expect((await Tenant.findById(site).lean())?.financeRevision).toBe(1);
    expect(await TenantFinanceRevision.countDocuments({ tenantId: site })).toBe(1);
  });

  it('lets the site admin set their own tax, keeping the locked fees and the locks', async () => {
    await lockAsSuperAdmin();
    const fees = initialFinanceFees();
    fees.tax = { enabled: true, type: 'percentage', payer: 'customer', percentage: 14 };
    const saved = await put({ expectedRevision: 1, fees }).expect(200);
    expect(saved.body.data).toMatchObject({ revision: 2, locks: locked, fees: { tax: { enabled: true, percentage: 14 }, booking: { percentage: 5 } } });
    expect((await TenantFinanceRevision.findOne({ tenantId: site, revision: 2 }).lean())?.locks).toEqual(locked);
  });

  it('refuses any lock change from a site admin, even one that changes nothing', async () => {
    await lockAsSuperAdmin();
    const refused = await put({ expectedRevision: 1, fees: initialFinanceFees(), locks: locked }).expect(403);
    expect(refused.body.code).toBe('FINANCE_LOCKS_SUPER_ADMIN_ONLY');
    await put({ expectedRevision: 1, fees: initialFinanceFees(), locks: initialFinanceLocks() }).expect(403);
  });

  it('never lets tax be locked', async () => {
    await put({ ...body(), locks: { ...locked, tax: true } }, site, 'super-admin').expect(400);
    expect((await Tenant.findById(site).lean())?.financeSettings).toBeUndefined();
  });

  it('lets the super admin change a locked fee and unlock it for the site admin', async () => {
    await lockAsSuperAdmin();
    const fees = initialFinanceFees();
    fees.booking = { enabled: true, type: 'percentage', payer: 'customer', percentage: 6 };
    await put({ expectedRevision: 1, fees, locks: initialFinanceLocks() }, site, 'super-admin').expect(200);
    fees.booking = { enabled: true, type: 'percentage', payer: 'customer', percentage: 4 };
    await put({ expectedRevision: 2, fees }).expect(200);
  });

  it('treats a locked fixed fee resent with its currencies in another order as unchanged', async () => {
    const fees = initialFinanceFees();
    fees.booking = { enabled: true, type: 'fixed', payer: 'customer', fixedAmounts: { EUR: 4, USD: 5 } };
    await put({ expectedRevision: 0, fees, locks: locked }, site, 'super-admin').expect(200);
    const resent = initialFinanceFees();
    resent.booking = { enabled: true, type: 'fixed', payer: 'customer', fixedAmounts: { USD: 5, EUR: 4 } };
    resent.tax = { enabled: true, type: 'percentage', payer: 'customer', percentage: 2 };
    await put({ expectedRevision: 1, fees: resent }).expect(200);
  });

  it('reads settings saved before locks existed as nothing locked', async () => {
    await Tenant.collection.updateOne({ _id: site }, { $set: { financeSettings: { version: 1, fees: initialFinanceFees() }, financeRevision: 1 } });
    expect((await get().expect(200)).body.data).toMatchObject({ configured: true, revision: 1, locks: initialFinanceLocks() });
    const fees = initialFinanceFees();
    fees.booking = { enabled: true, type: 'percentage', payer: 'customer', percentage: 7 };
    await put({ expectedRevision: 1, fees }).expect(200);
  });

  it('keeps a lock race safe: a site admin edit against a revision the super admin has since locked is refused', async () => {
    await put(body(), site, 'super-admin').expect(200);
    await put({ expectedRevision: 1, fees: initialFinanceFees(), locks: locked }, site, 'super-admin').expect(200);
    const fees = initialFinanceFees();
    fees.booking = { enabled: true, type: 'percentage', payer: 'customer', percentage: 1 };
    await put({ expectedRevision: 1, fees }).expect(409);
    await put({ expectedRevision: 2, fees }).expect(403);
  });
});
