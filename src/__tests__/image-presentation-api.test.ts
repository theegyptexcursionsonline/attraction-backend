import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import tenantsRoutes from '../routes/tenants.routes';
import destinationsRoutes from '../routes/destinations.routes';
import { Destination } from '../models/Destination';
import { toPublicAttractionDto } from '../controllers/attractions.controller';
import attractionRoutes from '../routes/attractions.routes';
import { toPublicTenantDto } from '../controllers/tenants.controller';
import { imageAltSchema, secureImageUrlSchema, imageAltTextsSchema, resolveImageAltTexts } from '../utils/imagePresentation';
import pageRoutes from '../routes/page.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';

jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
  authenticate: (req: any, res: any, next: any) => {
    const role = req.header('x-test-role');
    if (!role) return res.status(401).json({ success: false });
    req.user = { _id: new Types.ObjectId(), role, assignedTenants: req.header('x-test-assigned')?.split(',') || [] };
    next();
  },
}));
jest.setTimeout(120_000);
const owner = new Types.ObjectId(), other = new Types.ObjectId();
const app = express(); app.use(express.json()); app.use('/page', pageRoutes); app.use('/attractions', attractionRoutes); app.use('/tenants', tenantsRoutes); app.use('/destinations', destinationsRoutes);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ success: false, error: error.message }));
const body = (slug = 'fleet/royal-boat') => ({ slug, title: 'Royal Boat', body: '<p>Existing vessel description.</p><table><tbody><tr><th scope="row">Length</th><td>28 m</td></tr></tbody></table>', pageType: 'attraction', parentPath: '/', isPublished: true });
const auth = (req: request.Test, tenant = owner, role = 'brand-admin', assigned = tenant) => req.query({ tenantId: String(tenant) }).set('x-test-role', role).set('x-test-assigned', String(assigned));
const createPage = (value: Record<string, unknown> = body(), tenant = owner) => auth(request(app).post('/page/admin'), tenant).send(value);
const updatePage = (id: string, value: object, tenant = owner) => auth(request(app).patch(`/page/admin/${id}`), tenant).send(value);
const resolvePage = (slug = 'fleet/royal-boat', tenant = owner) => request(app).get('/page/resolve').query({ slug, tenantId: String(tenant) });
const lifecycle = (id: string, action: string, tenant = owner) => auth(request(app).post(`/page/admin/${id}/${action}`), tenant);
let mongo: MongoMemoryReplSet;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('image_seo'));
  await Promise.all([Tenant.init(), Attraction.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  process.env.URL_NAMESPACE_WRITES_READY = 'true';
  await Tenant.collection.deleteMany({}); await Attraction.collection.deleteMany({}); await Destination.collection.deleteMany({});
  await Tenant.collection.insertMany([owner, other].map((_id, index) => ({ _id, slug: `fleet-site-${index}`, name: `Fleet site ${index}`, domain: `fleet-site-${index}.invalid`, status: 'active', customPages: [] })));
});
afterEach(() => { jest.restoreAllMocks(); process.env.URL_NAMESPACE_WRITES_READY = 'true'; });

const imageA = 'https://images.invalid/boat-a.jpg', imageB = 'https://images.invalid/boat-b.jpg';
const draft = async (tenant = owner) => {
  const response = await auth(request(app).post('/attractions'), tenant).send({ title: 'Boat cruise', slug: `boat-${new Types.ObjectId()}`, status: 'draft', tenantIds: [String(tenant)], images: [imageA, imageB] }).expect(201);
  return response.body.data;
};
const updateTour = (id: string, changes: object, tenant = owner) => auth(request(app).patch(`/attractions/${id}`), tenant).send(changes);
it('creates, reads and clears per-image descriptions and social image settings', async () => {
  const page = await draft();
  const saved = await updateTour(page._id, { imageAltTexts: [{ url: imageA, alt: '  Boat at the marina  ' }], seo: { ogImage: imageB }, expectedPresentationRevision: 0 }).expect(200);
  expect(saved.body.data).toMatchObject({ imageAltTexts: [{ url: imageA, alt: 'Boat at the marina' }], seo: { ogImage: imageB }, presentationRevision: 1 });
  const cleared = await updateTour(page._id, { imageAltTexts: [], seo: { ogImage: '' }, expectedPresentationRevision: 1 }).expect(200);
  expect(cleared.body.data).toMatchObject({ imageAltTexts: [], seo: { ogImage: '' }, presentationRevision: 2 });
});
it('preserves omitted settings on old SEO saves and preserves description identity across gallery reorder', async () => {
  const page = await draft();
  await updateTour(page._id, { imageAltTexts: [{ url: imageA, alt: 'Boat A' }, { url: imageB, alt: 'Boat B' }], seo: { ogImage: imageB, metaTitle: 'Title' }, expectedPresentationRevision: 0 }).expect(200);
  const oldSave = await updateTour(page._id, { seo: { metaDescription: 'Description' }, images: [imageB, imageA] }).expect(200);
  expect(oldSave.body.data).toMatchObject({ presentationRevision: 2, seo: { ogImage: imageB, metaTitle: 'Title', metaDescription: 'Description' }, imageAltTexts: [{ url: imageA, alt: 'Boat A' }, { url: imageB, alt: 'Boat B' }] });
  const removed = await updateTour(page._id, { images: [imageB] }).expect(200);
  expect(removed.body.data.imageAltTexts).toEqual([{ url: imageB, alt: 'Boat B' }]);
  const blank = await updateTour(page._id, { imageAltTexts: [{ url: imageB, alt: ' ' }], expectedPresentationRevision: 3 }).expect(200);
  expect(blank.body.data.imageAltTexts).toEqual([]);
});
it('rejects invalid mappings, hostile URLs/text and missing or stale revisions without partial writes', async () => {
  const page = await draft();
  for (const changes of [
    { imageAltTexts: [{ url: imageA, alt: 'Description' }] },
    { imageAltTexts: [{ url: 'https://images.invalid/not-in-gallery.jpg', alt: 'Unrelated' }], expectedPresentationRevision: 0 },
    { imageAltTexts: [{ url: imageA, alt: '<script>x</script>' }], expectedPresentationRevision: 0 },
    { imageAltTexts: [{ url: imageA, alt: 'x' }, { url: imageA, alt: 'y' }], expectedPresentationRevision: 0 },
    { seo: { ogImage: 'https://name:password@images.invalid/image.jpg' }, expectedPresentationRevision: 0 },
    { seo: { ogImage: 'javascript:alert(1)' }, expectedPresentationRevision: 0 },
  ]) await updateTour(page._id, { ...changes, title: 'Must not persist' }).expect(400);
  await updateTour(page._id, { title: 'A valid legacy title' }).expect(200);
  await updateTour(page._id, { title: 'Stale modern title', seo: { ogImage: imageA }, expectedPresentationRevision: 0 }).expect(409);
  const stored = await Attraction.findById(page._id).lean();
  expect(stored?.title).toBe('A valid legacy title'); expect(stored?.seo?.ogImage).toBeUndefined();
});
it('serializes concurrent modern and legacy saves with gallery pruning in the same update', async () => {
  const page = await draft();
  await updateTour(page._id, { imageAltTexts: [{ url: imageA, alt: 'Boat A' }], expectedPresentationRevision: 0 }).expect(200);
  const responses = await Promise.all([
    updateTour(page._id, { images: [imageB], expectedPresentationRevision: 1 }),
    updateTour(page._id, { seo: { ogImage: imageA }, expectedPresentationRevision: 1 }),
  ]);
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  const stored = await Attraction.findById(page._id).lean();
  expect(stored?.presentationRevision).toBe(2);
  expect(stored?.imageAltTexts).toEqual(stored?.images.includes(imageA) ? [{ url: imageA, alt: 'Boat A' }] : []);
  // Old clients advance the revision too; a previously loaded modern form fails safely.
  await updateTour(page._id, { seo: { metaTitle: 'Legacy title' } }).expect(200);
  await updateTour(page._id, { imageAltTexts: [], expectedPresentationRevision: 2 }).expect(409);
});
it('treats records predating presentation revisions as revision zero', async () => {
  const page = await draft(); await Attraction.collection.updateOne({ _id: new Types.ObjectId(page._id) }, { $unset: { presentationRevision: 1 } });
  const saved = await updateTour(page._id, { seo: { ogImage: imageA }, expectedPresentationRevision: 0 }).expect(200);
  expect(saved.body.data.presentationRevision).toBe(1);
});
it('requires assigned authoring roles and hides foreign tour IDs on image updates', async () => {
  const page = await draft();
  await request(app).patch(`/attractions/${page._id}`).send({ imageAltTexts: [], expectedPresentationRevision: 0 }).expect(401);
  await auth(request(app).patch(`/attractions/${page._id}`), owner, 'viewer').send({ imageAltTexts: [], expectedPresentationRevision: 0 }).expect(403);
  await updateTour(page._id, { imageAltTexts: [], expectedPresentationRevision: 0 }, other).expect(404);
  expect((await Attraction.findById(page._id).lean())?.presentationRevision).toBe(0);
});
it('supports CMS image fields through existing CAS and records genuine mutation dates', async () => {
  const created = (await createPage({ ...body(), heroImage: imageA, heroImageAlt: 'Boat hero', ogImage: imageB }).expect(201)).body.data;
  expect(created.updatedAt).toBeDefined();
  const before = new Date(created.updatedAt).getTime();
  const saved = (await updatePage(created._id, { title: 'Edited boat', expectedRevision: 0 }).expect(200)).body.data;
  expect(saved).toMatchObject({ heroImageAlt: 'Boat hero', ogImage: imageB }); expect(new Date(saved.updatedAt).getTime()).toBeGreaterThanOrEqual(before);
  await updatePage(created._id, { heroImageAlt: 'Stale', expectedRevision: 0 }).expect(409);
  await updatePage(created._id, { ogImage: 'http://images.invalid/a.jpg', expectedRevision: 1 }).expect(400);
  await updatePage(created._id, { heroImageAlt: '', ogImage: '', expectedRevision: 1 }).expect(200);
  const publicPage = (await resolvePage().expect(200)).body.data.page;
  expect(publicPage).toMatchObject({ heroImageAlt: '', ogImage: '', revision: 2 });
  await lifecycle(created._id, 'archive').expect(200);
  const site = await Tenant.findById(owner).lean();
  expect(site?.customPages?.[0].updatedAt).toBeInstanceOf(Date);
  expect(toPublicTenantDto(site).updatedAt).toBeInstanceOf(Date);
});
it('bounds plain text and URL validation, removes blank overrides, and prunes only absent images', () => {
  for (const value of ['<img>', 'a\u0000b', 'a\nb', 'a'.repeat(301)]) expect(imageAltSchema.safeParse(value).success).toBe(false);
  for (const value of ['http://images.invalid/a', '//images.invalid/a', 'https://images.invalid/%0d%0a', 'https://a:b@images.invalid/a']) expect(secureImageUrlSchema.safeParse(value).success).toBe(false);
  expect(imageAltTextsSchema.safeParse(Array.from({ length: 11 }, (_, i) => ({ url: `https://images.invalid/${i}`, alt: 'A' }))).success).toBe(false);
  expect(resolveImageAltTexts([imageB], undefined, [{ url: imageA, alt: 'A' }, { url: imageB, alt: 'B' }])).toEqual([{ url: imageB, alt: 'B' }]);
});

it('preserves versioned CMS fields when old tenant clients echo a stale page snapshot', async () => {
  const page = (await createPage({ ...body(), heroImageAlt: 'New description', ogImage: imageA }).expect(201)).body.data;
  const before = (await Tenant.findById(owner).lean())?.customPages;
  await auth(request(app).patch(`/tenants/${owner}`), owner, 'super-admin').send({ name: 'Updated site name', customPages: [{ ...page, heroImageAlt: undefined, ogImage: undefined, updatedAt: undefined }] }).expect(200);
  const after = await Tenant.findById(owner).lean();
  expect(after?.name).toBe('Updated site name'); expect(after?.customPages).toEqual(before);
  await auth(request(app).patch(`/tenants/${owner}`), owner, 'super-admin').send({ 'customPages.0.ogImage': imageB }).expect(400);
  expect((await Tenant.findById(owner).lean())?.customPages).toEqual(before);
});
it('preserves actual destination timestamps and public image descriptions without manufacturing dates', async () => {
  const updatedAt = new Date('2026-08-01T10:00:00Z');
  await Destination.collection.insertOne({ name: 'Hurghada', slug: 'hurghada', country: 'Egypt', isActive: true, updatedAt });
  await Attraction.collection.insertOne({ slug: 'destination-source', title: 'Cruise', status: 'active', tenantIds: [owner], destination: { city: 'Hurghada' } });
  const response = await request(app).get('/destinations').query({ tenantId: String(owner), includeCount: 'false' }).expect(200);
  expect(response.body.data[0].updatedAt).toBe(updatedAt.toISOString());
  expect(toPublicAttractionDto({ images: [imageA], imageAltTexts: [{ url: imageA, alt: 'Boat' }], seo: { ogImage: imageB } })).toMatchObject({ imageAltTexts: [{ url: imageA, alt: 'Boat' }], seo: { ogImage: imageB } });
  expect(toPublicTenantDto({ _id: owner }).updatedAt).toBeUndefined();
});
it('rejects a legacy gallery write racing a modern save after both read the same revision', async () => {
  const page = await draft();
  const original = Attraction.findOneAndUpdate.bind(Attraction);
  let writes = 0; let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  jest.spyOn(Attraction, 'findOneAndUpdate').mockImplementation(((...args: Parameters<typeof original>) => {
    writes += 1; if (writes === 2) release();
    return barrier.then(() => original(...args));
  }) as any);
  const results = await Promise.all([
    updateTour(page._id, { images: [imageB] }),
    updateTour(page._id, { imageAltTexts: [{ url: imageA, alt: 'A' }], expectedPresentationRevision: 0 }),
  ]);
  expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  const stored = await Attraction.findById(page._id).lean();
  expect(stored?.presentationRevision).toBe(1);
  expect(stored?.imageAltTexts).toEqual(stored?.images.includes(imageA) ? [{ url: imageA, alt: 'A' }] : []);
});

it('uses stored content dates in the API sitemap and omits unknown lastmod values', async () => {
  const page = (await createPage().expect(201)).body.data;
  const date = new Date('2026-07-14T13:00:00Z');
  await Tenant.collection.updateOne({ _id: owner }, { $set: { updatedAt: date, 'customPages.0.updatedAt': date } });
  let response = await request(app).get('/page/sitemap.xml').query({ tenantId: String(owner) }).expect(200);
  expect(response.text.match(/<lastmod>2026-07-14<\/lastmod>/g)).toHaveLength(2);
  await Tenant.collection.updateOne({ _id: owner }, { $unset: { updatedAt: 1, 'customPages.0.updatedAt': 1 } });
  response = await request(app).get('/page/sitemap.xml').query({ tenantId: String(owner) }).expect(200);
  expect(response.text).not.toContain('<lastmod>');
  expect(response.text).toContain(page.slug);
});
