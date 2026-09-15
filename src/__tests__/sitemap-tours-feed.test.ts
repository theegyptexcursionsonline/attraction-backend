import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import pageRoutes from '../routes/page.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';

// Real route, tenant middleware, query validation, controller and MongoDB reads.
jest.setTimeout(180_000);

const app = express();
app.use(express.json());
app.use('/page', pageRoutes);
app.use((error: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));

const site = new Types.ObjectId();
const other = new Types.ObjectId();
let mongo: MongoMemoryReplSet;

const tour = (slug: string, tenantIds: Types.ObjectId[], extra: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(), slug, title: slug, tenantIds, status: 'active', updatedAt: new Date('2026-09-10T00:00:00Z'), ...extra,
});

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary
    ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1]
    : undefined;
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) },
  });
  await mongoose.connect(mongo.getUri('sitemap_tours'), { autoIndex: false });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

let siteTours: ReturnType<typeof tour>[];

beforeEach(async () => {
  await Tenant.collection.deleteMany({});
  await Attraction.collection.deleteMany({});
  await Tenant.collection.insertMany([
    { _id: site, slug: 'owner-site', domain: 'owner-site.invalid', name: 'Owner', status: 'active' },
    { _id: other, slug: 'other-site', domain: 'other-site.invalid', name: 'Other', status: 'active' },
    { _id: new Types.ObjectId(), slug: 'pending-site', domain: 'pending-site.invalid', name: 'Pending', status: 'pending' },
  ]);
  siteTours = [
    tour('quad-one', [site], { pathSlug: 'quad-one-flat', parentPage: { label: 'Quads', path: '/quad-biking' } }),
    tour('quad-two', [site]),
    tour('shared-cruise', [site, other]),
    tour('jeep-three', [site]),
    tour('jeep-four', [site]),
  ];
  await Attraction.collection.insertMany([
    ...siteTours,
    tour('draft-tour', [site], { status: 'draft' }),
    tour('archived-tour', [site], { status: 'archived', archivedAt: new Date() }),
    tour('trashed-but-active-flag', [site], { trashedAt: new Date() }),
    tour('other-only', [other]),
  ]);
});

const readAll = async (tenant: string, limit: number) => {
  const slugs: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const response: request.Response = await request(app)
      .get('/page/sitemap/tours')
      .query({ limit, ...(cursor ? { cursor } : {}) })
      .set('X-Tenant-ID', tenant);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, max-age=60');
    slugs.push(...response.body.data.items.map((item: { slug: string }) => item.slug));
    cursor = response.body.data.nextCursor;
    pages += 1;
  } while (cursor && pages < 20);
  return { slugs, pages };
};

describe('GET /page/sitemap/tours', () => {
  it('reads every live tour of the site to the tail, once each, in small pages', async () => {
    const { slugs, pages } = await readAll('owner-site', 2);
    expect(pages).toBe(3);
    expect(slugs).toEqual(siteTours.map(t => t.slug));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('returns only the URL fields', async () => {
    const response = await request(app).get('/page/sitemap/tours').set('X-Tenant-ID', 'owner-site');
    expect(response.body.data.nextCursor).toBeNull();
    expect(response.body.data.items[0]).toEqual({
      id: String(siteTours[0]._id), slug: 'quad-one', pathSlug: 'quad-one-flat', parentPath: '/quad-biking', updatedAt: '2026-09-10T00:00:00.000Z',
    });
    expect(Object.keys(response.body.data.items[1]).sort()).toEqual(['id', 'slug', 'updatedAt']);
  });

  it('never includes another site\'s tours, drafts, archive or trash', async () => {
    const { slugs } = await readAll('other-site', 500);
    expect(slugs).toEqual(['shared-cruise', 'other-only']);
    const own = await readAll('owner-site', 500);
    expect(own.slugs).not.toEqual(expect.arrayContaining(['draft-tour']));
    expect(own.slugs.some(slug => ['draft-tour', 'archived-tour', 'trashed-but-active-flag', 'other-only'].includes(slug))).toBe(false);
  });

  it('fails closed without a public site', async () => {
    expect((await request(app).get('/page/sitemap/tours')).status).toBe(400);
    expect((await request(app).get('/page/sitemap/tours').set('X-Tenant-ID', 'pending-site')).status).toBe(404);
    expect((await request(app).get('/page/sitemap/tours').set('X-Tenant-ID', 'no-such-site')).status).toBe(404);
  });

  it('rejects malformed paging instead of widening the read', async () => {
    const bad = ['cursor=nope', 'cursor[$gt]=0', 'limit=0', 'limit=501', 'limit=abc'];
    for (const query of bad) {
      const response = await request(app).get(`/page/sitemap/tours?${query}`).set('X-Tenant-ID', 'owner-site');
      expect(response.status).toBe(400);
    }
  });
});
