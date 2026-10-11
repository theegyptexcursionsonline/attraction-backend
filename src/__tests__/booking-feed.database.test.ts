import { createHmac } from 'crypto';
import { spawnSync } from 'child_process';
import express from 'express';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from '../test/loopbackRequest';
import bookingFeedRoutes from '../routes/bookingFeed.routes';
import { Booking } from '../models/Booking';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { feedQuery, parseFeedRequest } from '../utils/bookingFeed';

/**
 * GET /api/internal/booking-feed against a real database: the booking API's signed read of every
 * Attraction Network site's bookings (owner decision D2). One signed consumer; changes paged to the
 * tail, bundle services included, unpaid card checkouts left out, a service-day window, and nothing
 * about a guest in a log.
 */

jest.setTimeout(120_000);

const SECRET = 'atn-feed-test-secret-0123456789-abcdefghij';
const PATH = '/api/internal/booking-feed';

/** Written independently of the feed's own helper: parameters sorted by name then value, percent-encoded. */
function sign(query: string, { t = Math.floor(Date.now() / 1000), secret = SECRET, method = 'GET' } = {}) {
  const canonical = [...new URLSearchParams(query).entries()]
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${method} ${PATH}?${canonical}`).digest('hex')}`;
}

const app = express();
app.use('/api/internal', bookingFeedRoutes);
const get = (query: string, signature: string | null = sign(query)) => {
  const call = request(app).get(query ? `${PATH}?${query}` : PATH);
  return signature === null ? call : call.set('x-foxes-feed-signature', signature);
};

let mongo: MongoMemoryServer;
const siteOne = new Types.ObjectId('6710000000000000000000a1');
const siteTwo = new Types.ObjectId('6710000000000000000000a2');
const tour = new Types.ObjectId('6710000000000000000000b1');
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 10, 8, minutes));
const id = (n: number) => new Types.ObjectId(`6710000000000000000001${String(n).padStart(2, '0')}`);

const row = (n: number, overrides: Record<string, unknown> = {}) => ({
  _id: id(n),
  reference: `ATT-QAFEED-${String(n).padStart(4, '0')}`,
  tenantId: siteOne,
  attractionId: tour,
  items: [{ optionId: 'sunset', optionName: 'Sunset ride', date: '2026-10-20', time: '17:30', quantities: { adults: 2, children: 0, infants: 0 }, unitPrice: 60, totalPrice: 120 }],
  guestDetails: { firstName: 'Egypt Excursions Online', lastName: 'QA', email: 'theegyptexcursionsonline@gmail.com', phone: '+201000000000', country: 'EG' },
  subtotal: 120, fees: 0, discount: 0, total: 120, currency: 'USD',
  paymentMethod: 'card', paymentStatus: 'succeeded', status: 'confirmed',
  createdAt: at(n), updatedAt: at(n),
  ...overrides,
});

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('booking_feed'));
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

beforeEach(async () => {
  process.env.BOOKING_FEED_SECRET = SECRET;
  await Promise.all([Booking.collection.deleteMany({}), Tenant.collection.deleteMany({}), Attraction.collection.deleteMany({})]);
  await Tenant.collection.insertMany([
    { _id: siteOne, slug: 'makadi-horse-club', name: 'Makadi Horse Club', domain: 'makadi-feed.example.test', timezone: 'Africa/Cairo' },
    { _id: siteTwo, slug: 'hurghada-dolphins', name: 'Hurghada Dolphins', domain: 'dolphins-feed.example.test', timezone: 'Africa/Cairo' },
  ]);
  await Attraction.collection.insertOne({ _id: tour, title: 'Sunset Horse Ride', tenantIds: [siteOne, siteTwo] });
  await Booking.collection.insertMany([
    row(1),
    row(2, {
      tenantId: siteTwo, paymentMethod: 'pay-later', paymentStatus: 'pending', total: 200,
      items: [
        { optionId: 'a', optionName: 'Dolphin swim', date: '2026-10-20', time: '08:00', quantities: { adults: 2, children: 0, infants: 0 }, unitPrice: 50, totalPrice: 100 },
        { optionId: 'b', optionName: 'Snorkel trip', date: '2026-11-15', time: '09:00', quantities: { adults: 2, children: 0, infants: 0 }, unitPrice: 50, totalPrice: 100 },
      ],
    }),
    // An open card checkout: not a booking for operations until it is paid.
    row(3, { status: 'pending', paymentMethod: 'card', paymentStatus: 'pending' }),
    // A bundle's service: kept on the supplier's site, sold on another; the model hides these from generic reads.
    row(4, { tenantId: siteTwo, sellerTenantId: siteOne, supplierTenantId: siteTwo, isResale: true, bundleOrderId: new Types.ObjectId(), bundleComponentId: 'c1' }),
    row(5, { status: 'cancelled', paymentStatus: 'refunded', refundedAmount: 120 }),
  ]);
});
afterEach(() => jest.restoreAllMocks());

const refs = (body: { data: { items: Array<{ externalRef: string }> } }) => body.data.items.map((item) => item.externalRef);

describe('who may read the feed', () => {
  it('answers 503 and reads nothing while no secret is set', async () => {
    delete process.env.BOOKING_FEED_SECRET;
    const find = jest.spyOn(Booking.collection, 'find');
    const response = await get('limit=10');
    expect([response.status, response.body, response.headers['cache-control']]).toEqual([503, { success: false, error: 'Not configured' }, 'no-store']);
    expect(find).not.toHaveBeenCalled();
  });

  it('answers 401 without saying why to a missing, wrong, stale or reused signature', async () => {
    const now = Math.floor(Date.now() / 1000);
    const attempts = [
      get('limit=10', null),
      get('limit=10', 'Bearer something'),
      get('limit=10', sign('limit=10', { secret: `${SECRET}-other` })),
      get('limit=10', sign('limit=10', { t: now - 301 })),
      get('limit=10', sign('limit=10', { method: 'POST' })),
      // Signed for one page size, sent with another.
      get('limit=11', sign('limit=10')),
    ];
    for (const response of await Promise.all(attempts)) {
      expect([response.status, response.body, response.headers['cache-control']]).toEqual([401, { success: false, error: 'Unauthorized' }, 'no-store']);
    }
  });

  it('refuses a signed request with bad parameters, naming only the field', async () => {
    for (const [query, field] of [['page=2', 'page'], ['limit=500', 'limit'], ['serviceFrom=2026-10-01', 'serviceTo'], ['cursor=bad', 'cursor']]) {
      const response = await get(query);
      expect([response.status, response.body]).toEqual([400, { success: false, error: 'Invalid request', field }]);
    }
  });
});

describe('changes', () => {
  it('pages every site to the tail: services numbered, a bundle service on the site it was sold on, an open card checkout left out', async () => {
    const seen: string[] = [];
    const pages: number[] = [];
    let query = 'limit=2&since=2026-10-10T00:00:00.000Z';
    for (let guard = 0; guard < 10; guard += 1) {
      const response = await get(query);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.data.items.length).toBeLessThanOrEqual(2);
      seen.push(...refs(response.body));
      pages.push(response.body.data.items.length);
      if (!response.body.data.hasMore) break;
      query = `limit=2&cursor=${response.body.data.nextCursor}`;
    }
    expect(seen).toEqual(['ATT-QAFEED-0001', 'ATT-QAFEED-0002/1', 'ATT-QAFEED-0002/2', 'ATT-QAFEED-0004', 'ATT-QAFEED-0005']);
    // The two-service booking does not fit beside the first one, so it starts the next page whole.
    expect(pages).toEqual([1, 2, 2]);
  });

  it('sends what operations needs for each kind of booking', async () => {
    const response = await get('limit=100&since=2026-10-10T00:00:00.000Z');
    const byRef = new Map<string, Record<string, any>>(response.body.data.items.map((item: Record<string, any>) => [item.externalRef, item]));
    expect(byRef.get('ATT-QAFEED-0001')).toMatchObject({
      source: 'atn', sourceSite: 'makadi-horse-club', status: 'confirmed', paymentStatus: 'paid', collect: null,
      tour: { name: 'Sunset Horse Ride', code: String(tour), option: 'Sunset ride' }, serviceDate: '2026-10-20', serviceTime: '17:30',
      guests: { total: 2, breakdown: [{ label: 'Adults', count: 2 }] }, amount: { value: '120.00', currency: 'USD' },
      customer: { name: 'Egypt Excursions Online QA', email: 'theegyptexcursionsonline@gmail.com', phone: '+201000000000', locale: null },
    });
    expect(byRef.get('ATT-QAFEED-0002/2')).toMatchObject({
      sourceSite: 'hurghada-dolphins', status: 'confirmed', paymentStatus: 'unpaid', serviceDate: '2026-11-15',
      amount: { value: '100.00', currency: 'USD' }, collect: { value: '100.00', currency: 'USD' }, sourceBookingId: String(id(2)),
    });
    expect(byRef.get('ATT-QAFEED-0004')).toMatchObject({ sourceSite: 'makadi-horse-club', status: 'confirmed' });
    expect(byRef.get('ATT-QAFEED-0005')).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded' });
    expect(byRef.has('ATT-QAFEED-0003')).toBe(false);
  });

  it('leaves a change of the last ten seconds for the next read, and sends it from the stored position once settled', async () => {
    const first = await get('limit=100&since=2026-10-10T00:00:00.000Z');
    const cursor = first.body.data.nextCursor;
    await Booking.collection.insertOne(row(6, { createdAt: new Date(), updatedAt: new Date(Date.now() - 5_000) }));
    const early = await get(`limit=100&cursor=${cursor}`);
    expect([refs(early.body), early.body.data.nextCursor]).toEqual([[], cursor]);
    await Booking.collection.updateOne({ _id: id(6) }, { $set: { updatedAt: new Date(Date.now() - 11_000) } });
    const settled = await get(`limit=100&cursor=${cursor}`);
    expect(refs(settled.body)).toEqual(['ATT-QAFEED-0006']);
  });

  it('sends a checkout once it is paid, at its new position', async () => {
    const first = await get('limit=100&since=2026-10-10T00:00:00.000Z');
    await Booking.collection.updateOne({ _id: id(3) }, { $set: { status: 'confirmed', paymentStatus: 'succeeded', updatedAt: new Date(Date.now() - 60_000) } });
    const next = await get(`limit=100&cursor=${first.body.data.nextCursor}`);
    expect(refs(next.body)).toEqual(['ATT-QAFEED-0003']);
  });
});

describe('service-day window', () => {
  it('sends only the services inside the window, paging by booking to the tail', async () => {
    const seen: string[] = [];
    let query = 'limit=1&serviceFrom=2026-10-20&serviceTo=2026-10-20';
    for (let guard = 0; guard < 10; guard += 1) {
      const response = await get(query);
      expect(response.status).toBe(200);
      seen.push(...refs(response.body));
      if (!response.body.data.hasMore) break;
      query = `limit=1&serviceFrom=2026-10-20&serviceTo=2026-10-20&cursor=${response.body.data.nextCursor}`;
    }
    expect(seen).toEqual(['ATT-QAFEED-0001', 'ATT-QAFEED-0002/1', 'ATT-QAFEED-0004', 'ATT-QAFEED-0005']);
    const november = await get('limit=100&serviceFrom=2026-11-01&serviceTo=2026-11-30');
    expect(refs(november.body)).toEqual(['ATT-QAFEED-0002/2']);
  });

  it('does not take one service after the start and another before the end for one inside the window', async () => {
    await Booking.collection.insertOne(row(7, {
      items: [
        { optionId: 'a', optionName: 'Early', date: '2026-09-01', quantities: { adults: 1 }, totalPrice: 60 },
        { optionId: 'b', optionName: 'Late', date: '2026-12-01', quantities: { adults: 1 }, totalPrice: 60 },
      ],
    }));
    // A plain range on the array would match this booking (September ≤ end, December ≥ start).
    expect(await Booking.collection.countDocuments({ _id: id(7), 'items.date': { $gte: '2026-10-01', $lte: '2026-10-31' } })).toBe(1);
    const { filter } = feedQuery(parseFeedRequest(new URLSearchParams('serviceFrom=2026-10-01&serviceTo=2026-10-31')), new Date());
    const read = await Booking.collection.find(filter).project({ reference: 1 }).toArray();
    expect(read.map((booking) => booking.reference)).toEqual(['ATT-QAFEED-0001', 'ATT-QAFEED-0002', 'ATT-QAFEED-0003', 'ATT-QAFEED-0004', 'ATT-QAFEED-0005']);
  });
});

describe('failure', () => {
  it('answers 503 and logs only an error name, never the booking or the guest', async () => {
    const logs: unknown[] = [];
    for (const level of ['error', 'warn', 'log', 'info'] as const) jest.spyOn(console, level).mockImplementation((...args) => { logs.push(args); });
    jest.spyOn(Booking.collection, 'find').mockImplementation(() => {
      throw Object.assign(new Error('read failed for theegyptexcursionsonline@gmail.com ATT-QAFEED-0001'), { name: 'MongoServerError' });
    });
    const response = await get('limit=10');
    expect([response.status, response.body]).toEqual([503, { success: false, error: 'Feed unavailable' }]);
    expect(JSON.stringify(logs)).toContain('MongoServerError');
    expect(JSON.stringify(logs)).not.toMatch(/theegyptexcursionsonline|ATT-QAFEED|\+20/);
  });
});
