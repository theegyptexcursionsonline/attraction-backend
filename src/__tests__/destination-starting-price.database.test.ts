import express from 'express';
import request from '../test/loopbackRequest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';
import destinationRoutes from '../routes/destinations.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Destination } from '../models/Destination';
import { toDestinationStartingPrice } from '../utils/destinationStartingPrice';

// A destination's "Starting from" price is read through the real router, tenant middleware and
// aggregation, so a pipeline that compares currencies, crosses sites or leaks a withheld price fails here.
jest.setTimeout(120_000);
const app = express();
app.use('/destinations', destinationRoutes);
app.use((_error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ success: false, error: 'Source unavailable' });
});

const eurSite = new Types.ObjectId();
const usdSite = new Types.ObjectId();
const mixedSite = new Types.ObjectId();
const enquirySite = new Types.ObjectId();
const pickupSite = new Types.ObjectId();
let mongo: MongoMemoryServer;

const place = (slug: string, name: string, extra: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(), slug, name, country: 'Egypt', continent: 'Africa', description: `${name} on the Red Sea`,
  shortDescription: name, heroImage: `https://images.invalid/${slug}.jpg`, coordinates: { lat: 27, lng: 33 }, isActive: true, sortOrder: 0, ...extra,
});
let tourNumber = 0;
const tour = (tenantIds: Types.ObjectId[], city: string, fields: Record<string, unknown>) => ({
  _id: new Types.ObjectId(), slug: `qa-tour-${++tourNumber}`, title: `QA tour ${tourNumber}`, tenantIds, ownerTenantId: tenantIds[0],
  status: 'active', destination: { city, country: 'Egypt' }, rating: 0, reviewCount: 0, ...fields,
});
const detail = async (slug: string, tenant?: string) => {
  const response = await request(app).get(`/destinations/${slug}`).query(tenant ? { tenant } : {}).expect(200);
  return response.body.data as Record<string, unknown>;
};

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('destination_starting_price'));
  await Promise.all([Tenant.init(), Attraction.init(), Destination.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
afterEach(() => jest.restoreAllMocks());
beforeEach(async () => {
  tourNumber = 0;
  await Promise.all([Tenant, Attraction, Destination].map((model) => model.collection.deleteMany({})));
  await Tenant.collection.insertMany([
    { _id: eurSite, name: 'Euro Desert Rides', slug: 'eur-site', domain: 'eur-site.invalid', status: 'active', defaultCurrency: 'EUR', designMode: 'savanna' },
    { _id: usdSite, name: 'Dollar Boats', slug: 'usd-site', domain: 'usd-site.invalid', status: 'active', defaultCurrency: 'USD', designMode: 'marine' },
    { _id: mixedSite, name: 'Mixed Reseller', slug: 'mixed-site', domain: 'mixed-site.invalid', status: 'active', defaultCurrency: 'EUR', designMode: 'meridian' },
    { _id: enquirySite, name: 'Enquiry Divers', slug: 'enquiry-site', domain: 'enquiry-site.invalid', status: 'active', defaultCurrency: 'EUR', designMode: 'depth' },
    { _id: pickupSite, name: 'Pickup Cruises', slug: 'pickup-site', domain: 'pickup-site.invalid', status: 'active', defaultCurrency: 'EUR', designMode: 'nautical', pickupDestinationSlugs: ['soma-bay'] },
  ]);
  await Destination.collection.insertMany([
    place('sahl-hasheesh', 'Sahl Hasheesh'),
    place('makadi-bay', 'Makadi Bay'),
    // A stale stored figure on the destination record must never reach the response; its own
    // local-currency travel fact is a different field and passes through untouched.
    place('hurghada', 'Hurghada', { priceFrom: 1, priceCurrency: 'GBP', currency: 'EGP' }),
    place('soma-bay', 'Soma Bay'),
  ]);
  await Attraction.collection.insertMany([
    tour([eurSite], 'Sahl Hasheesh', { priceFrom: 130, currency: 'EUR' }),
    tour([eurSite], 'Sahl Hasheesh', { priceFrom: 120, currency: 'EUR' }),
    tour([eurSite], 'Sahl Hasheesh', { priceFrom: 10, currency: 'EUR', status: 'archived' }),
    tour([eurSite], 'Sahl Hasheesh', { priceFrom: 5, currency: 'EUR', status: 'draft' }),
    tour([eurSite], 'Sahl Hasheesh', { priceFrom: 1, currency: 'EUR', enquiryOnly: true }),
    // Another site's cheaper tour in the same city.
    tour([usdSite], 'Sahl Hasheesh', { priceFrom: 90, currency: 'USD' }),
    // Listed on both sites, priced in euros.
    tour([eurSite, usdSite], 'Makadi Bay', { priceFrom: 35, currency: 'EUR' }),
    tour([eurSite], 'Makadi Bay', { priceFrom: 40, currency: 'eur' }),
    tour([eurSite], 'Makadi Bay', { priceFrom: 0, currency: 'EUR' }),
    tour([eurSite], 'Makadi Bay', { priceFrom: null, currency: 'EUR' }),
    tour([eurSite], 'Makadi Bay', { priceFrom: 5 }),
    tour([eurSite], 'Makadi Bay', { priceFrom: 6, currency: 'EURO' }),
    tour([eurSite], 'Makadi Bay', { priceFrom: 7, currency: 978 }),
    tour([eurSite], 'Makadi Bay', { priceFrom: '3', currency: 'EUR' }),
    tour([mixedSite], 'Makadi Bay', { priceFrom: 20, currency: 'EUR' }),
    tour([mixedSite], 'Makadi Bay', { priceFrom: 15, currency: 'EUR' }),
    tour([mixedSite], 'Makadi Bay', { priceFrom: 14, currency: 'USD' }),
    tour([enquirySite], 'Hurghada', { priceFrom: 25, currency: 'EUR', enquiryOnly: true }),
    tour([enquirySite], 'Hurghada', { currency: 'EUR', enquiryOnly: true }),
    tour([pickupSite], 'Hurghada', { priceFrom: 45, currency: 'EUR', hasHotelPickup: true }),
    tour([pickupSite], 'Hurghada', { priceFrom: 30, currency: 'EUR' }),
  ]);
});

describe('GET /destinations/:slug starting price', () => {
  it('gives a site its own cheapest bookable tour, in that tour\'s currency', async () => {
    const value = await detail('sahl-hasheesh', 'eur-site');
    // Three listed tours (the enquiry-only one is listed, just never priced); retired and draft ones are not.
    expect(value).toMatchObject({ attractionCount: 3, priceFrom: 120, priceCurrency: 'EUR', startingPrices: [{ currency: 'EUR', amount: 120 }] });
  });

  it('never lets another site\'s cheaper tour, or a retired, draft or enquiry-only tour, set the price', async () => {
    expect(await detail('sahl-hasheesh', 'usd-site')).toMatchObject({ priceFrom: 90, priceCurrency: 'USD', startingPrices: [{ currency: 'USD', amount: 90 }] });
    const euro = await detail('sahl-hasheesh', String(eurSite));
    expect(euro.priceFrom).toBe(120);
    expect(euro.startingPrices).toEqual([{ currency: 'EUR', amount: 120 }]);
  });

  it('keeps a resold tour in its own currency rather than the site\'s default', async () => {
    expect(await detail('makadi-bay', 'usd-site')).toMatchObject({ priceFrom: 35, priceCurrency: 'EUR', startingPrices: [{ currency: 'EUR', amount: 35 }] });
  });

  it('folds currency case and ignores unpriced, non-numeric and unknown-currency records', async () => {
    const value = await detail('makadi-bay', 'eur-site');
    expect(value).toMatchObject({ priceFrom: 35, priceCurrency: 'EUR' });
    expect(value.startingPrices).toEqual([{ currency: 'EUR', amount: 35 }]);
  });

  it('omits the single figure when the tours use more than one currency, and lists each currency\'s lowest', async () => {
    const value = await detail('makadi-bay', 'mixed-site');
    expect(value).not.toHaveProperty('priceFrom');
    expect(value).not.toHaveProperty('priceCurrency');
    expect(value.startingPrices).toEqual([{ currency: 'EUR', amount: 15 }, { currency: 'USD', amount: 14 }]);
  });

  it('never compares euros with dollars on the network-wide page', async () => {
    const value = await detail('sahl-hasheesh');
    expect(value).not.toHaveProperty('priceFrom');
    expect(value.startingPrices).toEqual([{ currency: 'EUR', amount: 120 }, { currency: 'USD', amount: 90 }]);
  });

  it('shows no price at all when nothing here is priced, even over a stale stored figure', async () => {
    const value = await detail('hurghada', 'enquiry-site');
    expect(value.attractionCount).toBe(2);
    expect(value).not.toHaveProperty('priceFrom');
    expect(value).not.toHaveProperty('priceCurrency');
    expect(value.startingPrices).toEqual([]);
    expect(value.currency).toBe('EGP');
  });

  it('prices a pickup-served area from the site\'s hotel-pickup tours only', async () => {
    expect(await detail('soma-bay', 'pickup-site')).toMatchObject({ servedByPickup: true, priceFrom: 45, priceCurrency: 'EUR', startingPrices: [{ currency: 'EUR', amount: 45 }] });
  });

  it('isolates parallel reads for different sites', async () => {
    const sites = ['eur-site', 'usd-site', 'mixed-site'];
    const results = await Promise.all(Array.from({ length: 9 }, (_, index) => detail(index % 3 === 2 ? 'makadi-bay' : 'sahl-hasheesh', sites[index % 3])));
    results.forEach((value, index) => {
      if (index % 3 === 0) expect(value).toMatchObject({ priceFrom: 120, priceCurrency: 'EUR' });
      if (index % 3 === 1) expect(value).toMatchObject({ priceFrom: 90, priceCurrency: 'USD' });
      if (index % 3 === 2) expect(value.startingPrices).toEqual([{ currency: 'EUR', amount: 15 }, { currency: 'USD', amount: 14 }]);
    });
  });

  it('still answers a site without tours here like a missing destination', async () => {
    await request(app).get('/destinations/soma-bay').query({ tenant: 'eur-site' }).expect(404);
  });

  it('publishes no price when the read fails, and recovers on retry', async () => {
    const failed = jest.spyOn(Attraction, 'aggregate').mockRejectedValueOnce(new Error('database unavailable'));
    const response = await request(app).get('/destinations/sahl-hasheesh').query({ tenant: 'eur-site' }).expect(500);
    expect(response.body.data).toBeUndefined();
    failed.mockRestore();
    expect(await detail('sahl-hasheesh', 'eur-site')).toMatchObject({ priceFrom: 120, priceCurrency: 'EUR' });
  });
});

describe('toDestinationStartingPrice', () => {
  it('drops rows it cannot state honestly and sorts the rest by currency', () => {
    expect(toDestinationStartingPrice([
      { _id: 'USD', amount: 14 },
      { _id: null, amount: 5 },
      { _id: 'EURO', amount: 6 },
      { _id: 'eu', amount: 7 },
      { _id: 'GBP', amount: Number.NaN },
      { _id: 'CHF', amount: Number.POSITIVE_INFINITY },
      { _id: 'JPY', amount: 0 },
      { _id: 'AED', amount: -3 },
      { _id: 'SAR', amount: '9' },
      { _id: 'EUR', amount: 15 },
    ])).toEqual({ startingPrices: [{ currency: 'EUR', amount: 15 }, { currency: 'USD', amount: 14 }] });
  });

  it('sets the single figure only for exactly one usable currency', () => {
    expect(toDestinationStartingPrice([{ _id: 'EUR', amount: 120 }])).toEqual({ priceFrom: 120, priceCurrency: 'EUR', startingPrices: [{ currency: 'EUR', amount: 120 }] });
    expect(toDestinationStartingPrice([{ _id: 'EUR', amount: 120 }, { _id: 'EURO', amount: 1 }])).toEqual({ priceFrom: 120, priceCurrency: 'EUR', startingPrices: [{ currency: 'EUR', amount: 120 }] });
    expect(toDestinationStartingPrice([])).toEqual({ startingPrices: [] });
  });
});
