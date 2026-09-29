import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import attractionRoutes from '../routes/attractions.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { catalogSearchFilter, InvalidCatalogSearch, singularStem } from '../utils/catalogSearch';

jest.setTimeout(120_000);
const site = new Types.ObjectId(), otherSite = new Types.ObjectId();
const app = express();
app.use(express.json()); app.use('/attractions', attractionRoutes);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ success: false, error: error.message }));
let mongo: MongoMemoryReplSet;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('storefront_search'));
  await Promise.all([Tenant.init(), Attraction.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

let clock = Date.parse('2026-06-01T00:00:00Z');
const tour = (slug: string, title: string, city: string, extra: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(), slug, title, shortDescription: `${title} with hotel pickup`, description: 'A guided tour across the desert',
  status: 'active', tenantIds: [site], category: 'safari', priceFrom: 20, rating: 4, featured: false, images: [], destination: { city }, currency: 'EUR',
  createdAt: new Date((clock += 60_000)), ...extra,
});
beforeEach(async () => {
  await Tenant.collection.deleteMany({}); await Attraction.collection.deleteMany({});
  await Tenant.collection.insertMany([site, otherSite].map((_id, index) => ({ _id, slug: `search-site-${index}`, name: `Search site ${index}`, domain: `search-site-${index}.invalid`, status: 'active', customPages: [] })));
  // Newest last, so the date order puts the wanted tour BELOW the noise, as it did live.
  await Attraction.collection.insertMany([
    tour('makadi-horse', 'Makadi Bay Horse Riding Tour', 'Makadi Bay'),
    tour('makadi-buggy', 'Makadi Bay Spider Buggy Tour', 'Makadi Bay'),
    tour('makadi-quad', 'Makadi Bay Quad Tour (4x4)', 'Makadi Bay'),
    tour('marsa-horse', 'Marsa Alam Horse Riding Tour', 'Marsa Alam'),
    tour('marsa-buggy', 'Marsa Alam Spider Buggy Tour', 'Marsa Alam'),
    tour('makadi-camel', 'Makadi Bay Camel Ride', 'Makadi Bay'),
    tour('makadi-draft-horse', 'Makadi Bay Horse Riding Sunset', 'Makadi Bay', { status: 'draft' }),
    tour('foreign-horse', 'Makadi Bay Horse Riding Tour', 'Makadi Bay', { tenantIds: [otherSite] }),
  ]);
});

const list = (query: Record<string, unknown>, tenant = site) => request(app).get('/attractions').query({ tenantId: String(tenant), limit: 24, ...query });
const slugs = (body: any) => body.data.map((row: any) => row.slug);

describe('storefront catalogue search', () => {
  it.each([{}, { pagination: 'cursor' }])('requires every typed word instead of any one of them (%o)', async (mode) => {
    const body = (await list({ ...mode, search: 'Makadi Bay horse riding' }).expect(200)).body;
    expect(slugs(body)).toEqual(['makadi-horse']);
    expect(body.pagination.total).toBe(1);
    expect(slugs((await list({ ...mode, search: 'horse riding tour' }).expect(200)).body).sort()).toEqual(['makadi-horse', 'marsa-horse']);
    expect(slugs((await list({ ...mode, search: 'Marsa Alam buggy' }).expect(200)).body)).toEqual(['marsa-buggy']);
  });

  it('matches part-words, any letter case, and the city', async () => {
    expect(slugs((await list({ search: 'bugg' }).expect(200)).body).sort()).toEqual(['makadi-buggy', 'marsa-buggy']);
    expect(slugs((await list({ search: 'CAMEL ri' }).expect(200)).body)).toEqual(['makadi-camel']);
    expect(slugs((await list({ search: 'marsa' }).expect(200)).body).sort()).toEqual(['marsa-buggy', 'marsa-horse']);
  });

  it('finds a singular title from a plural the shopper types', async () => {
    await Attraction.collection.insertMany([
      tour('khufu', 'The Great Pyramid of Khufu — Egyptologist-Led Tour', 'Giza'),
      tour('karnak', 'Karnak Temple at Dawn — Private Tour', 'Luxor'),
    ]);
    expect(slugs((await list({ search: 'Giza pyramids tour' }).expect(200)).body)).toEqual(['khufu']);
    expect(slugs((await list({ search: 'Makadi horses' }).expect(200)).body)).toEqual(['makadi-horse']);
    expect(slugs((await list({ search: 'Marsa buggies' }).expect(200)).body)).toEqual(['marsa-buggy']);
  });

  it('matches special characters literally and never as a pattern', async () => {
    expect(slugs((await list({ search: '(4x4)' }).expect(200)).body)).toEqual(['makadi-quad']);
    for (const text of ['.', '.*', '^Makadi', 'Tour$', '[', 'a|b', '\\']) {
      const body = (await list({ search: text }).expect(200)).body;
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    }
    await Attraction.collection.updateOne({ slug: 'makadi-camel' }, { $set: { description: 'Sunset ride. Tea included' } });
    expect(slugs((await list({ search: 'ride.' }).expect(200)).body)).toEqual(['makadi-camel']);
  });

  it('treats blank search as no filter and refuses a repeated or over-long search', async () => {
    expect((await list({ search: '   ' }).expect(200)).body.pagination.total).toBe(6);
    await request(app).get(`/attractions?tenantId=${site}&search=horse&search=buggy`).expect(400);
    await list({ search: '🐎'.repeat(129) }).expect(400);
    await list({ search: '🐎'.repeat(128) }).expect(200);
    await list({ pagination: 'cursor', search: 'x'.repeat(129) }).expect(400);
  });

  it('never returns another site\'s or an unpublished tour for the same words', async () => {
    const body = (await list({ search: 'Makadi Bay horse riding' }).expect(200)).body;
    expect(slugs(body)).toEqual(['makadi-horse']);
    const foreign = (await list({ search: 'Makadi Bay horse riding' }, otherSite).expect(200)).body;
    expect(slugs(foreign)).toEqual(['foreign-horse']);
    expect(slugs((await list({ search: 'Sunset' }).expect(200)).body)).toEqual([]);
  });

  it('pages a searched catalogue by cursor to its tail and binds the cursor to the words', async () => {
    await Attraction.collection.insertMany(Array.from({ length: 29 }, (_, i) => tour(`reef-${i}`, `Giftun Reef Snorkel Trip ${i}`, 'Hurghada', { priceFrom: i })));
    await Attraction.collection.insertMany(Array.from({ length: 10 }, (_, i) => tour(`reef-noise-${i}`, `Giftun Island Beach Day ${i}`, 'Hurghada')));
    for (const sort of ['-createdAt', 'price-low', 'recommended']) {
      const query = { pagination: 'cursor', limit: 12, sort, search: 'giftun reef snork' };
      const first = (await list(query).expect(200)).body;
      const second = (await list({ ...query, cursor: first.pagination.nextCursor }).expect(200)).body;
      const third = (await list({ ...query, cursor: second.pagination.nextCursor }).expect(200)).body;
      const rows = [...first.data, ...second.data, ...third.data];
      expect(first.pagination.total).toBe(29);
      expect(new Set(rows.map((row: any) => row.slug)).size).toBe(29);
      expect(rows.every((row: any) => row.slug.startsWith('reef-') && !row.slug.startsWith('reef-noise'))).toBe(true);
      expect(third.pagination.nextCursor).toBeNull();
      const back = (await list({ ...query, cursor: third.pagination.previousCursor }).expect(200)).body;
      expect(slugs(back)).toEqual(slugs(second));
      await list({ ...query, search: 'giftun reef', cursor: first.pagination.nextCursor }).expect(400);
      await list({ ...query, search: undefined, cursor: first.pagination.nextCursor }).expect(400);
    }
  });

  it('applies the same all-words search on the English presentation of a site', async () => {
    const body = (await list({ locale: 'en', pagination: 'cursor', search: 'Makadi Bay horse riding' }).expect(200)).body;
    expect(slugs(body)).toEqual(['makadi-horse']);
    expect(slugs((await list({ locale: 'en', search: 'bugg' }).expect(200)).body).sort()).toEqual(['makadi-buggy', 'marsa-buggy']);
  });
});

describe('singularStem', () => {
  it.each([
    ['pyramids', 'pyramid'], ['Horses', 'Horse'], ['tours', 'tour'], ['beaches', 'beach'], ['boxes', 'box'],
    ['glasses', 'glass'], ['activities', 'activit'], ['cruises', 'cruise'],
    ['glass', 'glass'], ['bus', 'bus'], ['Giza', 'Giza'], ['bugg', 'bugg'], ['(4x4)', '(4x4)'],
  ])('%s -> %s', (word, stem) => expect(singularStem(word)).toBe(stem));
});

describe('catalogSearchFilter', () => {
  it('returns no filter for absent or blank text and refuses anything that is not bounded text', () => {
    expect(catalogSearchFilter(undefined)).toBeNull();
    expect(catalogSearchFilter('  \t ')).toBeNull();
    expect(() => catalogSearchFilter(['a', 'b'])).toThrow(InvalidCatalogSearch);
    expect(() => catalogSearchFilter({ $gt: '' })).toThrow(InvalidCatalogSearch);
    expect(() => catalogSearchFilter('a'.repeat(129))).toThrow(InvalidCatalogSearch);
  });

  it('builds one escaped clause per word and ignores words past the eighth', () => {
    const filter = catalogSearchFilter('a b c d e f g h i j (x)')!;
    expect(filter.$and).toHaveLength(8);
    const single = catalogSearchFilter('(x).')!.$and[0] as any;
    expect(single.$or.map((clause: any) => Object.keys(clause)[0])).toEqual(['title', 'shortDescription', 'description', 'destination.city']);
    expect(single.$or[0].title.source).toBe('\\(x\\)\\.');
    expect(single.$or[0].title.flags).toBe('i');
  });
});
