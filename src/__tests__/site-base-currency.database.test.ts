import express from 'express';
import request from '../test/loopbackRequest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import attractionRoutes from '../routes/attractions.routes';
import bookingRoutes from '../routes/bookings.routes';
import tenantRoutes from '../routes/tenants.routes';
import storefrontCommerceRoutes from '../routes/storefrontCommerce.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { IdempotencyKey } from '../models/IdempotencyKey';
import { BundleDefinition } from '../models/BundleDefinition';
import { createBundleDefinition, updateDraftBundleDefinition } from '../services/bundleCatalog.service';
import { NOT_SOLD_IN_SITE_CURRENCY, currencyMatch, soldInSiteCurrency, tourCurrencyProblem } from '../utils/siteCurrency';

/**
 * One base currency per site (client decision, 10 Oct 2026). A site prices, sells and reports in its
 * own currency: a tour is created, moved, published and resold only onto sites that sell in its
 * currency, a site changes currency only once every tour on it matches, and checkout never sells a
 * tour priced in another currency. Nothing is converted.
 */

jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
  authenticate: (req: any, res: any, next: any) => {
    const role = req.header('x-test-role');
    if (!role) return res.status(401).json({ success: false });
    req.user = { _id: new Types.ObjectId(), role, assignedTenants: req.header('x-test-assigned')?.split(',').filter(Boolean) || [] };
    next();
  },
}));
jest.mock('../middleware/rate-limit.middleware', () => {
  const actual = jest.requireActual('../middleware/rate-limit.middleware');
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...actual, bookingLimiter: pass, publicWriteLimiter: pass };
});
jest.mock('../services/email.service', () => ({
  ...jest.requireActual('../services/email.service'),
  sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
  sendAdminBookingNotification: jest.fn().mockResolvedValue(undefined),
  sendBookingPaymentLinkEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/pdf.service', () => ({ generateTicketPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')) }));
jest.mock('../services/notification.service', () => ({
  ...jest.requireActual('../services/notification.service'),
  createAdminNotifications: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/webhook.service', () => ({
  ...jest.requireActual('../services/webhook.service'),
  safeEmitEvent: jest.fn(),
}));
jest.setTimeout(120_000);

describe('the rule', () => {
  const sahara = { id: 'a', name: 'Sahara Trips', currency: 'USD' };
  const redSea = { id: 'b', name: 'Red Sea Trips', currency: 'USD' };
  const nile = { id: 'c', name: 'Nile Trips', currency: 'EGP' };

  it("asks for the sites' currency, names the site, and refuses sites in different currencies", () => {
    expect(tourCurrencyProblem('USD', [])).toBeNull();
    expect(tourCurrencyProblem(' usd ', [sahara])).toBeNull();
    expect(tourCurrencyProblem('USD', [sahara, redSea])).toBeNull();
    expect(tourCurrencyProblem('EUR', [sahara])).toBe('Sahara Trips sells in USD, so this tour must be priced in USD.');
    expect(tourCurrencyProblem(undefined, [sahara])).toBe('Sahara Trips sells in USD, so this tour must be priced in USD.');
    expect(tourCurrencyProblem('EGP', [sahara, redSea])).toBe('These sites sell in USD, so this tour must be priced in USD.');
    expect(tourCurrencyProblem('USD', [sahara, nile])).toBe(
      'These sites sell in different currencies (Sahara Trips: USD, Nile Trips: EGP). A tour can only be on sites that sell in the same currency.',
    );
  });

  it('sells a tour only in its site currency; a site without one sells in USD', () => {
    expect(soldInSiteCurrency('usd', { defaultCurrency: 'USD' })).toBe(true);
    expect(soldInSiteCurrency('EUR', { defaultCurrency: 'USD' })).toBe(false);
    expect(soldInSiteCurrency('USD', {})).toBe(true);
    expect(soldInSiteCurrency('EGP', {})).toBe(false);
    expect(soldInSiteCurrency(undefined, { defaultCurrency: 'USD' })).toBe(false);
    // No site to judge against: the caller decides (every checkout passes its site).
    expect(soldInSiteCurrency('EUR', undefined)).toBe(true);
  });

  it('matches stored codes exactly, ignoring case and spaces, and never builds a pattern from bad input', () => {
    expect(currencyMatch('usd').test(' USD ')).toBe(true);
    expect(currencyMatch('USD').test('USDT')).toBe(false);
    expect(() => currencyMatch('US$')).toThrow();
  });
});

describe('over HTTP against a real database', () => {
  const sahara = new Types.ObjectId(); // sells in USD
  const redSea = new Types.ObjectId(); // sells in USD
  const nile = new Types.ObjectId(); // sells in EGP
  const luxor = new Types.ObjectId(); // sells in EGP
  const app = express();
  app.use(express.json());
  app.use('/attractions', attractionRoutes);
  app.use('/bookings', bookingRoutes);
  app.use('/tenants', tenantRoutes);
  app.use('/storefront-commerce', storefrontCommerceRoutes);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ success: false, error: error.message }));
  const as = (test: request.Test, role: string, ...sites: Types.ObjectId[]) =>
    test.set('x-test-role', role).set('x-test-assigned', sites.map(String).join(','));
  const brandAdmin = (test: request.Test, site: Types.ObjectId) => as(test, 'brand-admin', site).set('x-tenant-id', String(site));
  const superAdmin = (test: request.Test) => as(test, 'super-admin');
  let mongo: MongoMemoryReplSet;

  const futureDate = (days = 10) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const guest = { firstName: 'Egypt Excursions', lastName: 'Online QA', email: 'theegyptexcursionsonline@gmail.com', phone: '+201000000000', country: 'Egypt' };
  const options = (price: number) => [{ id: 'shared', name: 'Shared trip', price, pricingModel: 'per-person' }];
  const tourBody = (overrides: Record<string, unknown> = {}) => ({
    slug: `reef-sail-${new Types.ObjectId()}`, title: 'Reef sail', shortDescription: 'A reef sail', description: 'A complete reef sail',
    category: 'boat-trips', destination: { city: 'Hurghada', country: 'Egypt', coordinates: { lat: 27.25, lng: 33.81 } },
    duration: '4 hours', priceFrom: 50, pricingOptions: options(50), ...overrides,
  });
  const insertTour = async (site: Types.ObjectId, currency: string, overrides: Record<string, unknown> = {}) => {
    const _id = new Types.ObjectId();
    await Attraction.collection.insertOne({
      _id, ...tourBody(), slug: `tour-${_id}`, title: `Tour ${currency}`, status: 'active', tenantIds: [site], ownerTenantId: site, currency,
      availability: { type: 'date-only', advanceBooking: 60 }, entryWindows: [], images: [], highlights: [], inclusions: [], exclusions: [],
      addons: [], itinerary: [], presentationRevision: 0,
      ...overrides,
    });
    return String(_id);
  };
  const stored = (id: string) => Attraction.collection.findOne({ _id: new Types.ObjectId(id) });
  const resellable = { reseller: { enabled: true, type: 'commission', value: 10, allowedTenants: [] } };
  const items = () => [{ optionId: 'shared', date: futureDate(), quantities: { adults: 2, children: 0, infants: 0 } }];
  const book = (siteSlug: string, attractionId: string) =>
    request(app).post(`/bookings?tenant=${siteSlug}`).set('Idempotency-Key', `site-currency-${new Types.ObjectId()}`)
      .send({ attractionId, items: items(), guestDetails: guest, paymentMethod: 'pay-later' });

  beforeAll(async () => {
    const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
    const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
    const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
    await mongoose.connect(mongo.getUri('site_base_currency'));
    await Promise.all([Tenant.init(), Attraction.init(), Availability.init(), Booking.init(), IdempotencyKey.init(), BundleDefinition.init()]);
  });
  afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
  beforeEach(async () => {
    await Promise.all([Tenant, Attraction, Availability, Booking, IdempotencyKey, BundleDefinition].map((model) => (model as typeof Tenant).collection.deleteMany({})));
    const site = (_id: Types.ObjectId, slug: string, name: string, defaultCurrency: string) =>
      ({ _id, slug, name, domain: `${slug}.invalid`, status: 'active', timezone: 'Africa/Cairo', defaultCurrency, customPages: [] });
    await Tenant.collection.insertMany([
      site(sahara, 'sahara-usd', 'Sahara Trips', 'USD'),
      site(redSea, 'red-sea-usd', 'Red Sea Trips', 'USD'),
      site(nile, 'nile-egp', 'Nile Trips', 'EGP'),
      site(luxor, 'luxor-egp', 'Luxor Trips', 'EGP'),
    ]);
  });

  describe('creating a tour', () => {
    it("prices a draft in its site's currency when none is sent, and refuses another one", async () => {
      const draft = await brandAdmin(request(app).post('/attractions'), nile)
        .send({ slug: `draft-${new Types.ObjectId()}`, title: 'Felucca hour', status: 'draft', tenantIds: [String(nile)] }).expect(201);
      expect((await stored(draft.body.data._id))?.currency).toBe('EGP');

      const refused = await brandAdmin(request(app).post('/attractions'), nile)
        .send({ slug: `draft-${new Types.ObjectId()}`, title: 'Felucca hour', status: 'draft', tenantIds: [String(nile)], currency: 'usd' }).expect(400);
      expect(refused.body.error).toBe('Nile Trips sells in EGP, so this tour must be priced in EGP.');
      expect(await Attraction.countDocuments({})).toBe(1);

      const published = await brandAdmin(request(app).post('/attractions'), nile)
        .send(tourBody({ tenantIds: [String(nile)], currency: 'egp', status: 'active' })).expect(201);
      expect((await stored(published.body.data._id))?.currency).toBe('EGP');
    });

    it('refuses one tour on sites that sell in different currencies', async () => {
      const refused = await superAdmin(request(app).post('/attractions'))
        .send({ slug: `draft-${new Types.ObjectId()}`, title: 'Two sites', status: 'draft', tenantIds: [String(sahara), String(nile)] }).expect(400);
      expect(refused.body.error).toBe(
        'These sites sell in different currencies (Sahara Trips: USD, Nile Trips: EGP). A tour can only be on sites that sell in the same currency.',
      );
      await superAdmin(request(app).post('/attractions'))
        .send({ slug: `draft-${new Types.ObjectId()}`, title: 'Two sites', status: 'draft', tenantIds: [String(sahara), String(redSea)] }).expect(201);
    });
  });

  describe('editing a tour', () => {
    it('moves a tour only onto sites that sell in its currency, re-priced in the same save', async () => {
      const tour = await insertTour(sahara, 'USD');
      const patch = (body: Record<string, unknown>) => superAdmin(request(app).patch(`/attractions/${tour}`)).send(body);

      const mixed = await patch({ tenantIds: [String(sahara), String(nile)] }).expect(400);
      expect(mixed.body.error).toMatch(/^These sites sell in different currencies/);
      const elsewhere = await patch({ tenantIds: [String(nile)] }).expect(400);
      expect(elsewhere.body.error).toBe('Nile Trips sells in EGP, so this tour must be priced in EGP.');
      expect((await stored(tour))?.tenantIds.map(String)).toEqual([String(sahara)]);

      await patch({ tenantIds: [String(sahara), String(redSea)] }).expect(200);
      await patch({ tenantIds: [String(nile)], currency: 'EGP', pricingOptions: options(1500) }).expect(200);
      const moved = await stored(tour);
      expect(moved).toMatchObject({ currency: 'EGP', priceFrom: 1500 });
      expect(moved?.tenantIds.map(String)).toEqual([String(nile)]);
    });

    it('lets an older tour in another currency be edited, but not published or sold until it is re-priced', async () => {
      const legacy = await insertTour(sahara, 'EUR', { status: 'draft' });
      const patch = (body: Record<string, unknown>) => brandAdmin(request(app).patch(`/attractions/${legacy}`), sahara).send(body);

      await patch({ description: 'A complete reef sail, updated' }).expect(200);
      const publish = await patch({ status: 'active' }).expect(400);
      expect(publish.body.error).toBe('Sahara Trips sells in USD, so this tour must be priced in USD.');
      expect((await stored(legacy))?.status).toBe('draft');

      await patch({ status: 'active', currency: 'USD', pricingOptions: options(55) }).expect(200);
      expect(await stored(legacy)).toMatchObject({ status: 'active', currency: 'USD', priceFrom: 55 });
    });
  });

  describe('the marketplace', () => {
    it("offers a site only partner tours priced in its own currency, and adds only those", async () => {
      const usdTour = await insertTour(sahara, 'USD', resellable);
      const egpTour = await insertTour(luxor, 'EGP', resellable);
      // Added before the rule: still listed on the site, so it can be removed.
      const legacy = await insertTour(redSea, 'USD', { ...resellable, tenantIds: [redSea, nile] });

      const list = await brandAdmin(request(app).get('/attractions/resellable'), nile).expect(200);
      const listed = list.body.data.map((tour: { id: string; addedToMySite: boolean }) => [tour.id, tour.addedToMySite]);
      expect(listed).toEqual(expect.arrayContaining([[egpTour, false], [legacy, true]]));
      expect(listed.map(([id]: [string]) => id)).not.toContain(usdTour);
      await brandAdmin(request(app).get(`/attractions/resellable/${usdTour}`), nile).expect(404);
      await brandAdmin(request(app).get(`/attractions/resellable/${egpTour}`), nile).expect(200);

      const refused = await brandAdmin(request(app).post(`/attractions/${usdTour}/resell`), nile).expect(409);
      expect(refused.body.error).toBe('Your site sells in EGP, and this tour is priced in USD. Only tours priced in EGP can be added.');
      expect((await stored(usdTour))?.tenantIds.map(String)).toEqual([String(sahara)]);

      await brandAdmin(request(app).post(`/attractions/${egpTour}/resell`), nile).expect(200);
      expect((await stored(egpTour))?.tenantIds.map(String)).toEqual([String(luxor), String(nile)]);
      await brandAdmin(request(app).delete(`/attractions/${legacy}/resell`), nile).expect(200);
      expect((await stored(legacy))?.tenantIds.map(String)).toEqual([String(redSea)]);
    });
  });

  describe("a site's currency", () => {
    it('is set by the platform: a brand admin cannot change it, and resaving the same one is ignored', async () => {
      const settings = (body: Record<string, unknown>) => as(request(app).patch(`/tenants/${sahara}/settings`), 'brand-admin', sahara).send(body);
      const refused = await settings({ defaultCurrency: 'EUR' }).expect(403);
      expect(refused.body.error).toBe("The site's currency is set by Foxes");
      await settings({ defaultCurrency: 'usd', tagline: 'Desert days' }).expect(200);
      expect(await Tenant.collection.findOne({ _id: sahara })).toMatchObject({ defaultCurrency: 'USD', tagline: 'Desert days' });
    });

    it('changes only once every tour on the site, archived and trashed included, is priced in the new one', async () => {
      await insertTour(sahara, 'USD');
      await insertTour(sahara, 'USD', { status: 'archived', trashedAt: new Date() });
      const settings = (body: Record<string, unknown>) => superAdmin(request(app).patch(`/tenants/${sahara}/settings`)).send(body);
      const message = "2 tours on this site are priced in another currency. A site's currency can change only when every tour on it is priced in EGP.";

      expect((await settings({ defaultCurrency: 'EGP' }).expect(409)).body.error).toBe(message);
      expect((await superAdmin(request(app).patch(`/tenants/${sahara}`)).send({ defaultCurrency: 'egp' }).expect(409)).body.error).toBe(message);
      await settings({ defaultCurrency: 'Pounds' }).expect(400);
      expect((await Tenant.collection.findOne({ _id: sahara }))?.defaultCurrency).toBe('USD');

      await Attraction.collection.updateMany({ tenantIds: sahara }, { $set: { currency: 'EGP' } });
      await settings({ defaultCurrency: 'egp' }).expect(200);
      expect((await Tenant.collection.findOne({ _id: sahara }))?.defaultCurrency).toBe('EGP');
      await superAdmin(request(app).patch(`/tenants/${sahara}`)).send({ defaultCurrency: 'EGP' }).expect(200);
    });

    it('is stored upper-cased when a site is created, and an invalid code is refused', async () => {
      const site = (slug: string, defaultCurrency: string) => ({
        slug, name: 'Desert Days', domain: `${slug}.invalid`, logo: 'https://res.cloudinary.com/demo/image/upload/logo.png',
        theme: { primaryColor: '#123456', secondaryColor: '#654321', accentColor: '#abcdef' },
        defaultCurrency, defaultLanguage: 'en', supportedLanguages: ['en'],
      });
      await superAdmin(request(app).post('/tenants')).send(site('desert-days', 'Pounds')).expect(400);
      const created = await superAdmin(request(app).post('/tenants')).send(site('desert-days', 'egp')).expect(201);
      expect((await Tenant.collection.findOne({ _id: new Types.ObjectId(created.body.data._id) }))?.defaultCurrency).toBe('EGP');
    });
  });

  describe('bundles', () => {
    it("are priced in their site's currency when drafted or edited", async () => {
      const actor = { actorType: 'user' as const, actorId: new Types.ObjectId() };
      const draft = {
        storefrontTenantId: String(nile), slug: 'nile-and-pyramids', title: 'Nile and Pyramids', shortDescription: 'Two days',
        description: 'Two days of highlights', images: [], area: 'Cairo', category: 'combos', currency: 'USD',
        customerPricesMinor: { adult: 10000, child: 5000, infant: 0 }, platformFeeReserveMinor: 0, taxReserveMinor: 0, components: [],
        policies: { cancellation: 'Free cancellation', refund: 'Full refund', substitution: 'None', promoStacking: false as const },
      };
      await expect(createBundleDefinition(draft, actor)).rejects.toMatchObject({ code: 'SITE_CURRENCY', message: 'Nile Trips sells in EGP, so this bundle must be priced in EGP.' });
      expect(await BundleDefinition.countDocuments({})).toBe(0);

      const existing = new Types.ObjectId();
      await BundleDefinition.collection.insertOne({ _id: existing, ...draft, storefrontTenantId: nile, currency: 'EGP', version: 1, status: 'draft', revision: 0 });
      await expect(updateDraftBundleDefinition(String(existing), String(nile), { currency: 'USD' }, 0, actor))
        .rejects.toMatchObject({ code: 'SITE_CURRENCY' });
      expect((await BundleDefinition.collection.findOne({ _id: existing }))?.currency).toBe('EGP');
    });
  });

  describe('checkout', () => {
    it('never sells a tour priced in another currency than the site, and leaves nothing behind', async () => {
      const legacy = await insertTour(sahara, 'EUR');
      const refused = await book('sahara-usd', legacy).expect(409);
      expect(refused.body.error).toBe(NOT_SOLD_IN_SITE_CURRENCY);
      expect(await Booking.countDocuments({})).toBe(0);
      expect(await IdempotencyKey.countDocuments({})).toBe(0);

      const quote = await request(app).post('/bookings/quote?tenant=sahara-usd').send({ attractionId: legacy, items: items() }).expect(409);
      expect(quote.body.error).toBe(NOT_SOLD_IN_SITE_CURRENCY);
      const commerce = await request(app).post('/storefront-commerce/checkout?tenant=sahara-usd').send({ attractionId: legacy, items: items() }).expect(409);
      expect(commerce.body.error).toBe(NOT_SOLD_IN_SITE_CURRENCY);

      const matching = await insertTour(sahara, 'USD');
      const booked = await book('sahara-usd', matching).expect(201);
      expect(booked.body.data).toMatchObject({ currency: 'USD' });
    });
  });
});
