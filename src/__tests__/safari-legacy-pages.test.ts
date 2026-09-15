import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Attraction } from '../models/Attraction';
import { SAFARI_TENANT_ID, SAFARI_QUAD_PAGE_ID } from '../utils/safariLegacyPages';
import { LEGACY_URL_FAMILIES, legacyUrlFamily, resolveLegacyPage } from '../utils/legacyUrls';
import { buildParentRepairPlan, applyParentRepair } from '../scripts/repair-safari-parent-pages';
import manifest from '../data/safari-sahara-quad-catalog.json';
const page = { _id: SAFARI_QUAD_PAGE_ID, slug: 'quad-biking', title: 'Quad tours', status: 'active', isPublished: true, revision: 2, body: '<p>Safe<script>alert(1)</script></p>', sections: [{ id: 'content', type: 'content', body: '<p>Content<script>alert(2)</script></p>' }] };
// Production today (16 Sep): the editor rebuilt the page on its WordPress address with a new id.
const rebuilt = { ...page, _id: '6aa2c2c4aed8540632bb2f1e', slug: 'hurghada-quad-biking' };
const OTHER_TENANT = '000000000000000000000000';

describe('legacy URL families', () => {
  test('interim and WordPress addresses reach the page rebuilt on the old address', () => {
    for (const slug of ['quad-biking', 'hurghada-quad-biking-tours']) {
      const result = resolveLegacyPage(SAFARI_TENANT_ID, slug, [rebuilt], false);
      expect(result).toMatchObject({ type: 'page', redirectTo: '/hurghada-quad-biking', page: { slug: 'hurghada-quad-biking' } });
      expect(JSON.stringify(result)).not.toContain('<script');
    }
    const jeep = { ...page, _id: '6aa2c34aaed8540632bb331b', slug: 'hurghada-jeep-safari' };
    expect(resolveLegacyPage(SAFARI_TENANT_ID, 'jeep-buggy-safari', [jeep], false)?.redirectTo).toBe('/hurghada-jeep-safari');
    const polaris = { ...page, _id: '6aa2c04daed8540632bb21bd', slug: 'polaris-rzr-safari-hurghada' };
    expect(resolveLegacyPage(SAFARI_TENANT_ID, 'polaris-rzr-safari', [polaris], false)?.redirectTo).toBe('/polaris-rzr-safari-hurghada');
  });

  test('the old WordPress address still reaches the interim page when that is what is live', () => {
    expect(resolveLegacyPage(SAFARI_TENANT_ID, 'hurghada-quad-biking', [page], false)?.redirectTo).toBe('/quad-biking');
  });

  test('prefers the earliest live family address when several are live', () => {
    expect(resolveLegacyPage(SAFARI_TENANT_ID, 'hurghada-quad-biking-tours', [page, rebuilt], false)?.redirectTo).toBe('/hurghada-quad-biking');
  });

  test('follows a family page through a later rename by id', () => {
    const renamed = { ...rebuilt, slug: 'quad-bikes-hurghada' };
    expect(resolveLegacyPage(SAFARI_TENANT_ID, 'hurghada-quad-biking', [renamed], false)?.redirectTo).toBe('/quad-bikes-hurghada');
  });

  test.each([
    ['another site', OTHER_TENANT, 'quad-biking', [rebuilt], false],
    ['a tour still on the old address', SAFARI_TENANT_ID, 'quad-biking', [rebuilt], true],
    ['a draft being rebuilt on the old address', SAFARI_TENANT_ID, 'quad-biking', [rebuilt, { ...page, _id: 'draft', isPublished: false }], false],
    ['an unpublished target', SAFARI_TENANT_ID, 'quad-biking', [{ ...rebuilt, isPublished: false }], false],
    ['an archived target', SAFARI_TENANT_ID, 'quad-biking', [{ ...rebuilt, status: 'archived' }], false],
    ['a target with an unsafe address', SAFARI_TENANT_ID, 'quad-biking', [{ ...rebuilt, slug: 'x/../admin' }], false],
    ['no family member live', SAFARI_TENANT_ID, 'quad-biking', [], false],
    ['an address outside every family', SAFARI_TENANT_ID, 'about-us', [rebuilt], false],
  ])('%s fails closed', (_name, tenant, slug, pages, held) => {
    expect(resolveLegacyPage(tenant as string, slug as string, pages as any[], held as boolean)).toBeNull();
  });

  test('an archived page on the old address does not hold it', () => {
    expect(resolveLegacyPage(SAFARI_TENANT_ID, 'quad-biking', [rebuilt, { ...page, status: 'archived' }], false)?.redirectTo).toBe('/hurghada-quad-biking');
  });

  test.each(['__proto__', 'constructor', 'toString', 'Quad-Biking', ''])('rejects non-address key %s', slug => {
    expect(legacyUrlFamily(SAFARI_TENANT_ID, slug)).toBeNull();
    expect(legacyUrlFamily(slug, 'quad-biking')).toBeNull();
  });

  test('families are well formed: unique safe addresses, ids, never shared between families', () => {
    for (const families of Object.values(LEGACY_URL_FAMILIES)) {
      const seen = new Set<string>();
      for (const family of families) {
        expect(family.slugs.length).toBeGreaterThan(1);
        for (const slug of family.slugs) {
          expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
          expect(seen.has(slug)).toBe(false);
          seen.add(slug);
        }
        family.pageIds.forEach(id => expect(id).toMatch(/^[a-f0-9]{24}$/));
      }
    }
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
