import { createHmac } from 'crypto';
import { spawnSync } from 'child_process';
import express from 'express';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from '../test/loopbackRequest';
import bookingFeedRoutes from '../routes/bookingFeed.routes';
import { Tenant } from '../models/Tenant';

/**
 * GET /api/internal/booking-feed/sites against a real database: the booking API's signed list of
 * network sites, so operations can give a person access to a site before its first booking.
 */

jest.setTimeout(120_000);

const SECRET = 'atn-feed-test-secret-0123456789-abcdefghij';
const PATH = '/api/internal/booking-feed/sites';

function sign({ t = Math.floor(Date.now() / 1000), secret = SECRET, path = PATH, query = '' } = {}) {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.GET ${path}?${query}`).digest('hex')}`;
}

const app = express();
app.use('/api/internal', bookingFeedRoutes);

let mongo: MongoMemoryServer;

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('booking_feed_sites'));
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

beforeEach(async () => {
  process.env.BOOKING_FEED_SECRET = SECRET;
  await Tenant.collection.deleteMany({});
  const site = (n: number, slug: string, name: string, status?: string) => ({
    _id: new Types.ObjectId(`6710000000000000000000c${n}`), slug, name, domain: `${slug}.example.test`, ...(status ? { status } : {}),
    customDomain: `${slug}.com`, accessCode: 'secret-code',
  });
  await Tenant.collection.insertMany([
    site(1, 'makadi-horse-club', 'Makadi Horse Club', 'active'),
    site(2, 'giftun-island', ' Giftun Island ', 'coming_soon'),
    site(3, 'new-site', 'New Site', 'pending'),
    site(4, 'closed-site', 'Closed Site', 'inactive'),
    site(5, 'paused-site', 'Paused Site', 'suspended'),
    site(6, 'old-record', 'Old Record'),
    site(7, 'Bad Slug!', 'Bad', 'active'),
  ]);
});

describe('GET /api/internal/booking-feed/sites', () => {
  it('lists sites that sell or soon will, by slug, with name and status only', async () => {
    const res = await request(app).get(PATH).set('x-foxes-feed-signature', sign());
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data.sites).toEqual([
      { slug: 'giftun-island', name: 'Giftun Island', status: 'coming_soon' },
      { slug: 'makadi-horse-club', name: 'Makadi Horse Club', status: 'active' },
      { slug: 'new-site', name: 'New Site', status: 'pending' },
      { slug: 'old-record', name: 'Old Record', status: null },
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/example\.test|secret-code|\.com/);
  });

  it('refuses an unsigned, wrongly signed, stale or other-path signature', async () => {
    expect((await request(app).get(PATH)).status).toBe(401);
    expect((await request(app).get(PATH).set('x-foxes-feed-signature', sign({ secret: 'another-secret-0123456789-abcdefghijkl' }))).status).toBe(401);
    expect((await request(app).get(PATH).set('x-foxes-feed-signature', sign({ t: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);
    expect((await request(app).get(PATH).set('x-foxes-feed-signature', sign({ path: '/api/internal/booking-feed' }))).status).toBe(401);
  });

  it('takes no parameters', async () => {
    const res = await request(app).get(`${PATH}?limit=5`).set('x-foxes-feed-signature', sign({ query: 'limit=5' }));
    expect(res.status).toBe(400);
  });

  it('answers 503 without a secret, reading nothing', async () => {
    delete process.env.BOOKING_FEED_SECRET;
    const res = await request(app).get(PATH).set('x-foxes-feed-signature', sign());
    expect(res.status).toBe(503);
  });
});
