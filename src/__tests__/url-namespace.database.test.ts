import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Tenant } from '../models/Tenant';
import { auditTenantUrlNamespace } from '../services/urlNamespaceAudit.service';
import { Attraction } from '../models/Attraction';

jest.setTimeout(120_000);
let mongo: MongoMemoryReplSet;
let site: Types.ObjectId;
let otherSite: Types.ObjectId;
const fixtureSite = (slug: string) => ({ slug, name: slug, domain: `${slug}.invalid`, logo: '/logo.png', theme: { primaryColor: '#000', secondaryColor: '#fff', accentColor: '#999' }, defaultCurrency: 'USD', defaultLanguage: 'en', supportedLanguages: ['en'] });
const tourData = (slug: string, pathSlug: string, tenant = site) => ({ slug, pathSlug, title: 'Tour', status: 'draft' as const, tenantIds: [tenant] });
const addPage = (slug: string, tenant = site) => Tenant.findOneAndUpdate({ _id: tenant }, { $push: { customPages: { _id: new Types.ObjectId(), slug, title: 'Page', body: '<p>Content</p>' } } }, { new: true, runValidators: true });
const status = (result: PromiseSettledResult<unknown>) => result.status === 'fulfilled' ? 200 : result.reason.statusCode;

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const localVersion = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: localVersion || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('url_namespace'));
  await Promise.all([Tenant.init(), Attraction.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  process.env.URL_NAMESPACE_WRITES_READY = 'true';
  // Raw writes are isolated fixtures representing legacy data, never application writer paths.
  await Tenant.collection.deleteMany({}); await Attraction.collection.deleteMany({});
  const tenants = await Tenant.create([fixtureSite('site'), fixtureSite('other-site')]);
  site = tenants[0]._id; otherSite = tenants[1]._id;
});
afterEach(() => { process.env.URL_NAMESPACE_WRITES_READY = 'true'; });

it('serializes simultaneous page/tour claims so exactly one owner wins', async () => {
  const results = await Promise.allSettled([addPage('shared-path'), Attraction.create(tourData('tour-global', 'shared-path'))]);
  expect(results.map(status).sort()).toEqual([200, 409]);
  const count = await Attraction.countDocuments({ tenantIds: site, pathSlug: 'shared-path' });
  const tenant = await Tenant.findById(site).lean();
  expect(count + (tenant?.customPages || []).filter(page => page.slug === 'shared-path').length).toBe(1);
});
it('serializes cross-collection renames and leaves the rejected owner unchanged', async () => {
  const page = await addPage('page-before');
  const pageId = (page!.customPages![0] as any)._id;
  const tour = await Attraction.create(tourData('global-tour', 'tour-before'));
  const results = await Promise.allSettled([
    Tenant.updateOne({ _id: site, 'customPages._id': pageId }, { $set: { 'customPages.$.slug': 'shared-path' } }),
    Attraction.findByIdAndUpdate(tour._id, { $set: { pathSlug: 'shared-path' } }, { new: true }),
  ]);
  expect(results.map(status).sort()).toEqual([200, 409]);
  const tenant = await Tenant.findById(site).lean(); const stored = await Attraction.findById(tour._id).lean();
  expect([tenant!.customPages![0].slug, stored!.pathSlug].filter(path => path === 'shared-path')).toHaveLength(1);
  expect([tenant!.customPages![0].slug, stored!.pathSlug].filter(path => path?.endsWith('before'))).toHaveLength(1);
});
it('allows the same path on distinct tenants and rejects a conflicting reseller assignment', async () => {
  await addPage('local-path');
  const tour = await Attraction.create(tourData('other-global', 'local-path', otherSite));
  await expect(Attraction.updateOne({ _id: tour._id }, { $addToSet: { tenantIds: site } })).rejects.toMatchObject({ statusCode: 409 });
  expect((await Attraction.findById(tour._id).lean())!.tenantIds.map(String)).toEqual([String(otherSite)]);
});
it('protects both global slug and pathSlug aliases', async () => {
  const tour = await Attraction.create(tourData('public-alias', 'short-alias'));
  await expect(addPage('public-alias')).rejects.toMatchObject({ statusCode: 409 });
  await expect(addPage('short-alias')).rejects.toMatchObject({ statusCode: 409 });
  await addPage('page-url');
  await expect(Attraction.updateOne({ _id: tour._id }, { slug: 'page-url' })).rejects.toMatchObject({ statusCode: 409 });
});
it('protects document save and restores document state after abort', async () => {
  await addPage('taken');
  const tour = new Attraction(tourData('global-save', 'taken'));
  await expect(tour.save()).rejects.toMatchObject({ statusCode: 409 });
  expect(tour.isNew).toBe(true);
  tour.pathSlug = 'available';
  await tour.save();
  tour.pathSlug = 'taken';
  await expect(tour.save()).rejects.toMatchObject({ statusCode: 409 });
  expect(tour.isModified('pathSlug')).toBe(true);
  expect((await Attraction.findById(tour._id).lean())!.pathSlug).toBe('available');
});
it('makes create arrays, spread create and insertMany atomic on collision', async () => {
  for (const method of ['array', 'spread', 'insertMany']) {
    const docs = [tourData(`${method}-one`, `${method}-same`), tourData(`${method}-two`, `${method}-same`)];
    const write = method === 'array' ? Attraction.create(docs) : method === 'spread' ? Attraction.create(...docs) : Attraction.insertMany(docs);
    await expect(write).rejects.toMatchObject({ statusCode: 409 });
    expect(await Attraction.countDocuments({ slug: { $in: docs.map(doc => doc.slug) } })).toBe(0);
  }
});
it('rolls back an entire bulkWrite when any path conflicts', async () => {
  await addPage('taken');
  const [one, two] = await Attraction.create([tourData('bulk-one', 'before-one'), tourData('bulk-two', 'before-two')]);
  await expect(Attraction.bulkWrite([
    { updateOne: { filter: { _id: one._id }, update: { $set: { pathSlug: 'available' } } } },
    { updateOne: { filter: { _id: two._id }, update: { $set: { pathSlug: 'taken' } } } },
  ])).rejects.toMatchObject({ statusCode: 409 });
  expect((await Attraction.findById(one._id).lean())!.pathSlug).toBe('before-one');
  expect((await Attraction.findById(two._id).lean())!.pathSlug).toBe('before-two');
});
it('guards updateMany and whole-record replacements', async () => {
  await addPage('taken');
  const [one, two] = await Attraction.create([tourData('many-one', 'one'), tourData('many-two', 'two')]);
  await expect(Attraction.updateMany({ _id: { $in: [one._id, two._id] } }, { $set: { pathSlug: 'taken' } })).rejects.toMatchObject({ statusCode: 409 });
  await expect(Attraction.replaceOne({ _id: one._id }, tourData('replacement', 'taken'))).rejects.toMatchObject({ statusCode: 409 });
  const tenant = await Tenant.findById(site);
  tenant!.customPages!.push({ slug: 'one', title: 'Conflicting page', body: 'Content' });
  await expect(tenant!.save()).rejects.toMatchObject({ statusCode: 409 });
});
it('guards query upserts and bulk upserts without losing unrelated records', async () => {
  await addPage('taken');
  await expect(Attraction.findOneAndUpdate({ slug: 'upsert-one' }, { $set: tourData('upsert-one', 'taken') }, { upsert: true, new: true })).rejects.toMatchObject({ statusCode: 409 });
  await expect(Attraction.bulkWrite([{ updateOne: { filter: { slug: 'bulk-upsert' }, update: { $set: tourData('bulk-upsert', 'taken') }, upsert: true } }])).rejects.toMatchObject({ statusCode: 409 });
  expect(await Attraction.countDocuments()).toBe(0);
});
it('rejects whole positional page replacement with an occupied URL', async () => {
  await addPage('before'); await Attraction.create(tourData('other-global', 'taken'));
  await expect(Tenant.updateOne({ _id: site }, { $set: { 'customPages.0': { slug: 'taken', title: 'Page', body: 'Content' } } })).rejects.toMatchObject({ statusCode: 409 });
  expect((await Tenant.findById(site).lean())!.customPages![0].slug).toBe('before');
});
it('pauses namespace writes but permits reads, content, lifecycle and ordinary settings changes', async () => {
  const tour = await Attraction.create(tourData('existing-global', 'existing-path')); await addPage('existing-page');
  process.env.URL_NAMESPACE_WRITES_READY = 'false';
  await expect(addPage('new-page')).rejects.toMatchObject({ statusCode: 503 });
  await expect(Attraction.updateOne({ _id: tour._id }, { $set: { pathSlug: 'new-path' } })).rejects.toMatchObject({ statusCode: 503 });
  await expect(Attraction.create(tourData('new-global', 'new-path'))).rejects.toMatchObject({ statusCode: 503 });
  await Attraction.updateOne({ _id: tour._id }, { $set: { title: 'Updated title', status: 'archived' } });
  await Tenant.updateOne({ _id: site }, { $set: { name: 'Updated site', 'customPages.0.body': 'Updated content', 'customPages.0.status': 'archived' } });
  expect((await Attraction.findById(tour._id).lean())!.title).toBe('Updated title');
  expect((await Tenant.findById(site).lean())!.customPages![0].body).toBe('Updated content');
});
it('fails closed on pipelines and aggregation-write side doors', async () => {
  await expect(Attraction.updateMany({}, [{ $set: { pathSlug: 'unsafe' } }])).rejects.toMatchObject({ statusCode: 400 });
  await expect(Tenant.aggregate([{ $match: {} }, { $merge: { into: 'tenants' } }])).rejects.toMatchObject({ statusCode: 400 });
  await expect(Attraction.insertMany([tourData('unordered', 'unordered')], { ordered: false })).rejects.toMatchObject({ statusCode: 400 });
});
it('participates in outer transactions and rolls back associated changes', async () => {
  await addPage('taken');
  await expect(mongoose.connection.transaction(async session => {
    await Tenant.updateOne({ _id: site }, { $set: { name: 'Must roll back' } }, { session });
    await Attraction.create([tourData('outer-global', 'taken')], { session });
  })).rejects.toMatchObject({ statusCode: 409 });
  expect((await Tenant.findById(site).lean())!.name).toBe('site');
});
it('retains legacy conflicts until deliberately repaired, without blocking ordinary edits', async () => {
  await addPage('legacy-path');
  const id = new Types.ObjectId();
  await Attraction.collection.insertOne({ _id: id, ...tourData('legacy-global', 'legacy-path') });
  const audit = await auditTenantUrlNamespace('site', 1, 1);
  expect(audit.pagination.total).toBe(1); expect(audit.collisions[0].path).toBe('legacy-path');
  expect((await auditTenantUrlNamespace('other-site')).pagination.total).toBe(0);
  await expect(auditTenantUrlNamespace('missing-site')).rejects.toThrow('Website not found');
  await expect(auditTenantUrlNamespace('site', 0)).rejects.toThrow('positive page');
  await Attraction.updateOne({ _id: id }, { $set: { title: 'Updated title' } });
  await Attraction.updateOne({ _id: id }, { $set: { pathSlug: 'repaired-path' } });
  expect((await Attraction.findById(id).lean())!.pathSlug).toBe('repaired-path');
});
it('releases paths atomically when their owning page or tour is removed', async () => {
  const tour = await Attraction.create(tourData('remove-global', 'reusable'));
  await Attraction.deleteOne({ _id: tour._id });
  await addPage('reusable');
  await Tenant.updateOne({ _id: site }, { $pull: { customPages: { slug: 'reusable' } } });
  await Attraction.create(tourData('new-owner-global', 'reusable'));
});
it('reports unsupported transaction configuration without persisting the attempted URL', async () => {
  const transaction = jest.spyOn(mongoose.connection, 'transaction').mockRejectedValueOnce(Object.assign(new Error('Transactions unavailable'), { code: 20 }));
  await expect(addPage('blocked')).rejects.toMatchObject({ statusCode: 503 });
  transaction.mockRestore();
  expect((await Tenant.findById(site).lean())!.customPages).toHaveLength(0);
});
it('protects insertOne, the save alias and bulkSave', async () => {
  await addPage('taken');
  await expect(Attraction.insertOne(tourData('insert-one', 'taken'))).rejects.toMatchObject({ statusCode: 409 });
  await expect((new Attraction(tourData('save-alias', 'taken')) as any).$save()).rejects.toMatchObject({ statusCode: 409 });
  const one = await Attraction.create(tourData('bulk-save-one', 'available-one'));
  one.pathSlug = 'taken';
  await expect(Attraction.bulkSave([one])).rejects.toMatchObject({ statusCode: 409 });
  expect((await Attraction.findById(one._id).lean())!.pathSlug).toBe('available-one');
});
it('does not execute an already awaited namespace query twice', async () => {
  const query = addPage('single-execution');
  await query;
  await expect(query.exec()).rejects.toThrow('Query was already executed');
  expect((await Tenant.findById(site).lean())!.customPages).toHaveLength(1);
});
it('rejects repeated page identity in a namespace array', async () => {
  const id = new Types.ObjectId();
  await expect(Tenant.updateOne({ _id: site }, { $push: { customPages: { $each: [{ _id: id, slug: 'repeat', title: 'A', body: 'a' }, { _id: id, slug: 'repeat', title: 'B', body: 'b' }] } } })).rejects.toMatchObject({ statusCode: 409 });
});

it('does not audit one tour with identical slug and pathSlug as a collision', async () => {
  await Attraction.create(tourData('identical-path', 'identical-path'));
  expect((await auditTenantUrlNamespace('site')).pagination.total).toBe(0);
});
it('does not silently treat a trailing spread-create document as options', async () => {
  // Mongoose accepts options only with an array first argument; a spread tail is another document.
  await expect(Attraction.create(tourData('spread-options', 'spread-options'), { ordered: true } as any)).rejects.toMatchObject({ name: 'ValidationError' });
  expect(await Attraction.countDocuments({ slug: 'spread-options' })).toBe(0);
});
it('blocks aggregation output through the cursor entry point as well as exec', async () => {
  const cursor = Tenant.aggregate([{ $match: {} }, { $merge: { into: 'tenants' } }]).cursor();
  await expect(cursor.next()).rejects.toMatchObject({ statusCode: 400 });
  await cursor.close().catch(() => undefined);
});
it('rejects lean batch inserts that bypass URL normalization without persisting records', async () => {
  await expect(Attraction.insertMany([tourData('UPPERCASE', 'UPPERCASE')], { lean: true })).rejects.toMatchObject({ statusCode: 400 });
  expect(await Attraction.countDocuments({})).toBe(0);
  await expect(Tenant.insertMany([{ ...fixtureSite('lean-site'), customPages: [{ slug: 'UPPERCASE', title: 'Page' }] }], { lean: true })).rejects.toMatchObject({ statusCode: 400 });
  expect(await Tenant.countDocuments({ slug: 'lean-site' })).toBe(0);
});
