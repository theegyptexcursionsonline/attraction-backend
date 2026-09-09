import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Attraction } from '../models/Attraction';
import { safariLegacyPage, SAFARI_TENANT_ID, SAFARI_QUAD_PAGE_ID } from '../utils/safariLegacyPages';
import { buildParentRepairPlan, applyParentRepair } from '../scripts/repair-safari-parent-pages';
import manifest from '../data/safari-sahara-quad-catalog.json';
const page = { _id: SAFARI_QUAD_PAGE_ID, slug: 'quad-biking', title: 'Quad tours', status: 'active', isPublished: true, revision: 2, body: '<p>Safe<script>alert(1)</script></p>', sections: [{ id: 'content', type: 'content', body: '<p>Content<script>alert(2)</script></p>' }] };
const owner = { _id: '69fc40483ac583b3163b9989', status: 'archived' };
describe('Safari legacy page compatibility', () => {
  test('keeps old client shape, follows target ID rename, sanitizes', () => {
    const result = safariLegacyPage(SAFARI_TENANT_ID, 'hurghada-quad-biking', [{ ...page, slug: 'renamed-quads' }], [owner]);
    expect(result).toMatchObject({ type: 'page', redirectTo: '/renamed-quads' });
    expect(JSON.stringify(result)).not.toContain('<script');
  });
  test.each([
    ['other site', '000000000000000000000000', [page], [owner]],
    ['active owner', SAFARI_TENANT_ID, [page], [{ ...owner, status: 'active' }]],
    ['wrong retired owner', SAFARI_TENANT_ID, [page], [{ ...owner, _id: 'wrong' }]],
    ['missing retired owner', SAFARI_TENANT_ID, [page], []],
    ['duplicate owners', SAFARI_TENANT_ID, [page], [owner, owner]],
    ['unpublished target', SAFARI_TENANT_ID, [{ ...page, isPublished: false }], [owner]],
    ['archived target', SAFARI_TENANT_ID, [{ ...page, status: 'archived' }], [owner]],
    ['explicit unpublished source page', SAFARI_TENANT_ID, [page, { slug: 'hurghada-quad-biking', isPublished: false }], [owner]],
    ['redirect chain', SAFARI_TENANT_ID, [{ ...page, slug: 'hurghada-jeep-safari' }], [owner]],
  ])('%s fails closed', (_name, tenant, pages, owners) => {
    expect(safariLegacyPage(tenant as string, 'hurghada-quad-biking', pages as any[], owners as any[])).toBeNull();
  });
  test.each(['__proto__', 'constructor', 'toString'])('rejects inherited mapping key %s', slug => {
    expect(safariLegacyPage(SAFARI_TENANT_ID, slug, [page], [])).toBeNull();
  });
  test('ownerless removed page only aliases while unclaimed', () => {
    expect(safariLegacyPage(SAFARI_TENANT_ID, 'hurghada-quad-biking-tours', [page], [])?.redirectTo).toBe('/quad-biking');
    expect(safariLegacyPage(SAFARI_TENANT_ID, 'hurghada-quad-biking-tours', [page], [owner])).toBeNull();
  });
});

jest.setTimeout(120000);
describe('parent repair guarded transaction', () => {
  let mongo: MongoMemoryReplSet;
  const tenant = { _id: new Types.ObjectId(SAFARI_TENANT_ID), slug: 'safari-sahara-hurghada', customPages: [{ ...page, _id: new Types.ObjectId(page._id) }] };
  const tours = () => manifest.tours.map(t => ({ _id: new Types.ObjectId(t.targetId), slug: t.target.pathSlug, tenantIds: [tenant._id], status: 'active', updatedAt: new Date('2026-09-08T00:00:00Z'), parentPage: { label: 'Old', path: '/hurghada-quad-biking-tours' } }));
  beforeAll(async () => { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await mongoose.connect(mongo.getUri()); });
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
  beforeEach(async () => { await mongoose.connection.db!.dropDatabase(); await mongoose.connection.db!.collection('tenants').insertOne(tenant); await mongoose.connection.db!.collection('attractions').insertMany(tours()); });
  test('repairs all eight and retry leaves timestamps untouched', async () => {
    const db = mongoose.connection.db!, session = await mongoose.startSession();
    try {
      const plan = buildParentRepairPlan(tenant, tours());
      expect(await applyParentRepair(db, session, plan)).toBe(8);
      const before = await db.collection('attractions').find({}).toArray();
      expect(await applyParentRepair(db, session, plan)).toBe(0);
      expect(await db.collection('attractions').find({}).toArray()).toEqual(before);
    } finally { await session.endSession(); }
  });
  test('concurrent edit aborts without modifying other tours', async () => {
    const db = mongoose.connection.db!, session = await mongoose.startSession(), plan = buildParentRepairPlan(tenant, tours());
    await db.collection('attractions').updateOne({ _id: tours()[0]._id }, { $set: { updatedAt: new Date() } });
    try { await expect(applyParentRepair(db, session, plan)).rejects.toThrow('Content changed');
      expect(await db.collection('attractions').countDocuments({ 'parentPage.path': '/hurghada-quad-biking-tours' })).toBe(8);
    } finally { await session.endSession(); }
  });
  test('guarded model failure rolls back earlier parent writes', async () => {
    const db = mongoose.connection.db!, session = await mongoose.startSession(), plan = buildParentRepairPlan(tenant, tours());
    const original = Attraction.updateOne.bind(Attraction);
    let writes = 0;
    const spy = jest.spyOn(Attraction, 'updateOne').mockImplementation(((...args: any[]) => {
      if (++writes === 2) throw new Error('Simulated write failure');
      return (original as any)(...args);
    }) as any);
    try {
      await expect(applyParentRepair(db, session, plan)).rejects.toThrow('Simulated write failure');
      expect(await db.collection('attractions').countDocuments({ 'parentPage.path': '/hurghada-quad-biking-tours' })).toBe(8);
    } finally { spy.mockRestore(); await session.endSession(); }
  });
  test('scoped database read refuses missing cross-tenant source', async () => {
    const db = mongoose.connection.db!, session = await mongoose.startSession(), plan = buildParentRepairPlan(tenant, tours());
    await db.collection('attractions').updateOne({ _id: tours()[0]._id }, { $set: { tenantIds: [new Types.ObjectId()] } });
    try { await expect(applyParentRepair(db, session, plan)).rejects.toThrow('exactly eight'); } finally { await session.endSession(); }
  });
  test('rejects unknown edited parent and cross-tenant tour', () => {
    const changed = tours(); changed[0].parentPage.path = '/other';
    expect(() => buildParentRepairPlan(tenant, changed)).toThrow('Parent link');
    const cross = tours(); cross[0].tenantIds = [new Types.ObjectId()];
    expect(() => buildParentRepairPlan(tenant, cross)).toThrow('ownership');
    expect(() => buildParentRepairPlan({ ...tenant, customPages: [{ ...page, isPublished: false }] }, tours())).toThrow('not published');
  });
});
