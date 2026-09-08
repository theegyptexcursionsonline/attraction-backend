/** Explicit local integration check: starts its own disposable MongoDB (pinned downloadable fallback for CI), never reads application DB configuration. */
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import assert from 'assert/strict';
import mongoose, { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Category } from '../models/Category';
import { createAdminPage, updateAdminPage, updateAdminMenu, getPageSection } from '../controllers/page.controller';

export async function runSiteContentDatabaseIntegration() {
  const previousReady = process.env.URL_NAMESPACE_WRITES_READY;
  process.env.URL_NAMESPACE_WRITES_READY = 'true';
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const localVersion = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: localVersion || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  try {
    await mongoose.connect(mongo.getUri('site_content_integration'));
    const owner = new Types.ObjectId(), other = new Types.ObjectId();
    const site = { slug: 'site', name: 'Site', domain: 'site.invalid', logo: '/logo.png', theme: { primaryColor: '#000', secondaryColor: '#fff', accentColor: '#999' }, defaultCurrency: 'USD', defaultLanguage: 'en', supportedLanguages: ['en'] };
    await Tenant.create({ ...site, _id: owner });
    await Tenant.create({ ...site, _id: other, slug: 'other', domain: 'other.invalid' });
    const call = async (handler: any, body: any, id?: string, extra: any = {}) => {
      const response: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json(value: any) { this.payload = value; return this; } };
      let thrown: unknown;
      await handler({ tenant: { _id: owner }, user: { role: 'brand-admin', assignedTenants: [owner] }, body, params: { id, ...extra.params }, query: extra.query || {} }, response, (error: unknown) => { thrown = error; });
      if (thrown && typeof (thrown as any).statusCode === 'number') { response.statusCode = (thrown as any).statusCode; response.payload = { success: false, error: (thrown as Error).message }; }
      else if (thrown) throw thrown;
      return response;
    };
    const page = { slug: 'desert', title: 'Desert', body: '<p>Original</p>', pageType: 'category', parentPath: '/' };
    const created = await Promise.all([call(createAdminPage, page), call(createAdminPage, page)]);
    assert.deepEqual(created.map(r => r.statusCode).sort(), [201, 409]);
    const firstId = String(created.find(r => r.statusCode === 201)!.payload.data._id);
    const edits = await Promise.all([call(updateAdminPage, { title: 'First', expectedRevision: 0 }, firstId), call(updateAdminPage, { title: 'Second', expectedRevision: 0 }, firstId)]);
    assert.deepEqual(edits.map(r => r.statusCode).sort(), [200, 409]);
    const navigation = [{ label: 'Desert', href: '/desert', columns: [{ label: 'Explore', links: [{ label: 'Desert', href: '/desert' }] }] }];
    const menus = await Promise.all([call(updateAdminMenu, { navigation, expectedRevision: 0 }), call(updateAdminMenu, { navigation: [], expectedRevision: 0 })]);
    assert.deepEqual(menus.map(r => r.statusCode).sort(), [200, 409]);
    const persisted = await Tenant.findById(owner).lean(); assert.equal(persisted?.customPages?.length, 1); assert.equal(persisted?.customPages?.[0].body, '<p>Original</p>', 'Partial title update preserves body'); assert.equal(persisted?.navigationRevision, 1);
    const secondPage = await call(createAdminPage, { ...page, slug: 'second' });
    const renames = await Promise.all([call(updateAdminPage, { slug: 'same-target', expectedRevision: 1 }, firstId), call(updateAdminPage, { slug: 'same-target', expectedRevision: 0 }, String(secondPage.payload.data._id))]);
    assert.deepEqual(renames.map(r => r.statusCode).sort(), [200, 409]);
    const draft = await call(createAdminPage, { ...page, slug: 'draft', body: '', isPublished: false }); assert.equal(draft.statusCode, 201);
    const published = await call(updateAdminPage, { isPublished: true, expectedRevision: 0 }, String(draft.payload.data._id)); assert.equal(published.statusCode, 400);
    const foreignId = new Types.ObjectId();
    await Attraction.collection.insertOne({ _id: foreignId, slug: 'foreign', title: 'Foreign', status: 'active', tenantIds: [other] });
    const rejected = await call(createAdminPage, { ...page, slug: 'forbidden', sections: [{ id: 'tours', type: 'tours', layout: 'vertical', attractionIds: [String(foreignId)] }] }); assert.equal(rejected.statusCode, 400);
    const category = await Category.create({ slug: 'desert', name: 'Desert', icon: 'sun' });
    const ownIds = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
    await Attraction.collection.insertMany(ownIds.map((_id, index) => ({ _id, slug: `owned-${index}`, title: 'Owned', status: 'active', category: 'desert', tenantIds: [owner] })));
    const mixed = await call(createAdminPage, { ...page, slug: 'mixed', body: '', sections: [{ id: 'tours', type: 'tours', layout: 'horizontal', categoryIds: [String(category._id)] }] });
    assert.equal(mixed.statusCode, 201); assert.deepEqual(mixed.payload.data.sections[0].categoryIds.map(String), ['desert']);
    const results = await call(getPageSection, {}, undefined, { params: { pageId: String(mixed.payload.data._id), sectionId: 'tours' }, query: { limit: 2 } });
    assert.equal(results.payload.data.items.length, 2); assert.ok(results.payload.data.nextCursor);
    const tail = await call(getPageSection, {}, undefined, { params: { pageId: String(mixed.payload.data._id), sectionId: 'tours' }, query: { limit: 2, cursor: results.payload.data.nextCursor } });
    assert.equal(tail.payload.data.items.length, 1); assert.equal(tail.payload.data.nextCursor, null);
    const selectedOrder = [ownIds[2], ownIds[0], ownIds[1]];
    const curated = await call(createAdminPage, { ...page, slug: 'curated', body: '', sections: [{ id: 'tours', type: 'tours', layout: 'vertical', attractionIds: selectedOrder.map(String) }] });
    assert.equal(curated.statusCode, 201);
    const curatedFirst = await call(getPageSection, {}, undefined, { params: { pageId: String(curated.payload.data._id), sectionId: 'tours' }, query: { limit: 2 } });
    assert.deepEqual(curatedFirst.payload.data.items.map((item: { _id: Types.ObjectId }) => String(item._id)), selectedOrder.slice(0, 2).map(String));
    assert.equal(curatedFirst.payload.data.nextCursor, String(selectedOrder[1]));
    const curatedTail = await call(getPageSection, {}, undefined, { params: { pageId: String(curated.payload.data._id), sectionId: 'tours' }, query: { limit: 2, cursor: curatedFirst.payload.data.nextCursor } });
    assert.deepEqual(curatedTail.payload.data.items.map((item: { _id: Types.ObjectId }) => String(item._id)), [String(selectedOrder[2])]);
    assert.equal(curatedTail.payload.data.nextCursor, null);
    const crossPage = await call(createAdminPage, { ...page, slug: 'cross-page', sections: [{ id: 'pages', type: 'pages', layout: 'vertical', pageIds: [String(new Types.ObjectId())] }] }); assert.equal(crossPage.statusCode, 400);
    console.log('PASS real MongoDB integration: duplicate creation, rename collision, page/menu stale edits, draft publication, scoped tour/page references, category normalization, ordered selection and cursor tail.');
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
    if (previousReady === undefined) delete process.env.URL_NAMESPACE_WRITES_READY; else process.env.URL_NAMESPACE_WRITES_READY = previousReady;
  }
}
if (require.main === module) runSiteContentDatabaseIntegration().catch(error => { console.error(error instanceof Error ? error.message : 'Integration failed'); process.exitCode = 1; });
