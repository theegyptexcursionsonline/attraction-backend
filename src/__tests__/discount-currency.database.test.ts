import express from 'express';
import request from '../test/loopbackRequest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import attractionRoutes from '../routes/attractions.routes';
import bookingRoutes from '../routes/bookings.routes';
import promoRoutes from '../routes/promo.routes';
import specialOfferRoutes from '../routes/specialOffers.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { PromoCode } from '../models/PromoCode';
import { SpecialOffer } from '../models/SpecialOffer';
import { priceBookingSelection } from '../services/bookingPricing.service';
import {
  evaluatePromo,
  normalizeCurrencyCode,
  offerAppliesToCurrency,
  offerClaimFilter,
  promoClaimFilter,
} from '../utils/discountCurrency';
import { createPromoCodeSchema, createSpecialOfferSchema, updatePromoCodeSchema } from '../utils/validators';

/**
 * PLATFORM-ISSUES #1046: a discount amount is money in one currency.
 * Promo codes and fixed special offers apply only to tours priced in their
 * currency; nothing converts. The admin must state that currency, checkout and
 * the cart preview apply one rule, and a tour's currency cannot silently
 * re-denominate its prices.
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

describe('currency rules (pure)', () => {
  it('normalizes only real three-letter codes and never guesses', () => {
    expect(normalizeCurrencyCode(' usd ')).toBe('USD');
    expect(normalizeCurrencyCode('EGP')).toBe('EGP');
    expect(normalizeCurrencyCode('US Dollar')).toBeNull();
    expect(normalizeCurrencyCode('$')).toBeNull();
    expect(normalizeCurrencyCode(undefined)).toBeNull();
  });

  it('applies a percentage offer in any currency and a fixed one only in its own', () => {
    expect(offerAppliesToCurrency({ discountType: 'percentage' }, 'EUR')).toBe(true);
    expect(offerAppliesToCurrency({ discountType: 'fixed', currency: 'USD' }, 'usd')).toBe(true);
    expect(offerAppliesToCurrency({ discountType: 'fixed', currency: 'EGP' }, 'USD')).toBe(false);
    expect(offerAppliesToCurrency({ discountType: 'fixed' }, 'USD')).toBe(false);
    expect(offerAppliesToCurrency({ discountType: 'fixed', currency: 'USD' }, 'nonsense')).toBe(false);
  });

  it('evaluates a code in its own currency: amount, minimum and cap', () => {
    const fixed = { discountType: 'fixed' as const, discountValue: 50, currency: 'EGP', minOrderAmount: 0 };
    expect(evaluatePromo(fixed, { tourCurrency: 'USD', subtotal: 200 })).toEqual({ ok: false, reason: 'currency', promoCurrency: 'EGP', tourCurrency: 'USD' });
    expect(evaluatePromo(fixed, { tourCurrency: 'EGP', subtotal: 200 })).toEqual({ ok: true, discount: 50, currency: 'EGP' });
    expect(evaluatePromo({ ...fixed, currency: undefined }, { tourCurrency: 'EGP', subtotal: 200 })).toMatchObject({ ok: false, reason: 'currency', promoCurrency: null });
    expect(evaluatePromo({ ...fixed, minOrderAmount: 500 }, { tourCurrency: 'EGP', subtotal: 200 })).toEqual({ ok: false, reason: 'minimum', minimum: 500, currency: 'EGP' });
    const capped = { discountType: 'percentage' as const, discountValue: 10, currency: 'USD', minOrderAmount: 1, maxDiscount: 4 };
    expect(evaluatePromo(capped, { tourCurrency: 'USD', subtotal: 200 })).toEqual({ ok: true, discount: 4, currency: 'USD', maxDiscount: 4 });
    // A percentage code is still written in a currency (its minimum and cap are money).
    expect(evaluatePromo(capped, { tourCurrency: 'EUR', subtotal: 200 })).toMatchObject({ ok: false, reason: 'currency' });
  });

  it('requires an explicit currency on promo and fixed-offer writes, and strips server-owned fields', () => {
    const promo = { code: ' summer-10 ', description: 'Summer', discountType: 'fixed', discountValue: 10, validFrom: '2026-10-01', validUntil: '2026-10-31' };
    expect(createPromoCodeSchema.safeParse(promo).success).toBe(false);
    const parsed = createPromoCodeSchema.parse({ ...promo, currency: ' usd ', usageCount: 99 });
    expect(parsed).toMatchObject({ code: 'SUMMER-10', currency: 'USD', minOrderAmount: 0, usageLimit: 100, isActive: true });
    expect(parsed).not.toHaveProperty('usageCount');
    expect(createPromoCodeSchema.safeParse({ ...promo, currency: 'Dollars' }).success).toBe(false);
    expect(createPromoCodeSchema.safeParse({ ...promo, currency: 'USD', maxDiscount: 5 }).success).toBe(false);
    expect(createPromoCodeSchema.safeParse({ ...promo, code: 'SUMMER 10', currency: 'USD' }).success).toBe(false);
    expect(createPromoCodeSchema.safeParse({ ...promo, currency: 'USD', discountType: 'percentage', discountValue: 120 }).success).toBe(false);
    // An edit keeps every field it does not send (no defaults on PATCH).
    expect(updatePromoCodeSchema.parse({ isActive: false })).toEqual({ isActive: false });

    const offer = { attractionId: new Types.ObjectId().toHexString(), title: 'Family savings', discountType: 'fixed', discountValue: 10, validFrom: '2026-10-01', validUntil: '2026-10-31' };
    expect(createSpecialOfferSchema.safeParse(offer).success).toBe(false);
    expect(createSpecialOfferSchema.parse({ ...offer, currency: 'usd' }).currency).toBe('USD');
    expect(createSpecialOfferSchema.safeParse({ ...offer, discountType: 'percentage' }).success).toBe(true);
  });
});

describe('over HTTP against a real database', () => {
  const usdSite = new Types.ObjectId();
  const egpSite = new Types.ObjectId();
  const eurSite = new Types.ObjectId();
  const app = express();
  app.use(express.json());
  app.use('/attractions', attractionRoutes);
  app.use('/bookings', bookingRoutes);
  app.use('/promo-codes', promoRoutes);
  app.use('/special-offers', specialOfferRoutes);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ success: false, error: error.message }));
  const as = (test: request.Test, role: string, ...sites: Types.ObjectId[]) =>
    test.set('x-test-role', role).set('x-test-assigned', sites.map(String).join(','));
  const brandAdmin = (test: request.Test, site: Types.ObjectId) => as(test, 'brand-admin', site);
  let mongo: MongoMemoryReplSet;

  const futureDate = (days = 10) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const guest = { firstName: 'Egypt Excursions', lastName: 'Online QA', email: 'theegyptexcursionsonline@gmail.com', phone: '+201000000000', country: 'Egypt' };

  const insertTour = async (site: Types.ObjectId, currency: string, price: number, overrides: Record<string, unknown> = {}) => {
    const _id = new Types.ObjectId();
    await Attraction.collection.insertOne({
      _id, slug: `tour-${_id}`, title: `Tour ${currency}`, shortDescription: 'A tour', description: 'A complete tour',
      category: 'boat-trips', destination: { city: 'Hurghada', country: 'Egypt' }, duration: '4 hours',
      status: 'active', tenantIds: [site], ownerTenantId: site, currency, priceFrom: price,
      availability: { type: 'date-only', advanceBooking: 60 },
      pricingOptions: [{ id: 'shared', name: 'Shared trip', price, pricingModel: 'per-person' }],
      entryWindows: [], images: [], highlights: [], inclusions: [], exclusions: [], addons: [], itinerary: [], presentationRevision: 0,
      ...overrides,
    });
    return String(_id);
  };
  const insertPromo = async (fields: Record<string, unknown>) => {
    await PromoCode.collection.insertOne({
      description: 'Seasonal code', minOrderAmount: 0, usageCount: 0, usageLimit: 100, isActive: true,
      validFrom: new Date(Date.now() - 86_400_000), validUntil: new Date(Date.now() + 30 * 86_400_000),
      createdAt: new Date(), updatedAt: new Date(),
      ...fields,
    });
  };
  const insertOffer = async (attractionId: string, fields: Record<string, unknown>) => {
    const _id = new Types.ObjectId();
    await SpecialOffer.collection.insertOne({
      _id, attractionId: new Types.ObjectId(attractionId), title: 'Seasonal offer', description: '',
      usageCount: 0, usageLimit: 100, isActive: true,
      validFrom: new Date(Date.now() - 86_400_000), validUntil: new Date(Date.now() + 30 * 86_400_000),
      ...fields,
    });
    return String(_id);
  };
  const book = (siteSlug: string, attractionId: string, extra: Record<string, unknown> = {}) =>
    request(app).post(`/bookings?tenant=${siteSlug}`)
      .set('Idempotency-Key', `discount-currency-${new Types.ObjectId()}`)
      .send({
        attractionId,
        items: [{ optionId: 'shared', date: futureDate(), quantities: { adults: 2, children: 0, infants: 0 } }],
        guestDetails: guest,
        paymentMethod: 'pay-later',
        ...extra,
      });
  const usageOf = async (code: string) => (await PromoCode.collection.findOne({ code }))?.usageCount;

  beforeAll(async () => {
    const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
    const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
    const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
    await mongoose.connect(mongo.getUri('discount_currency'));
    await Promise.all([Tenant.init(), Attraction.init(), Availability.init(), Booking.init(), PromoCode.init(), SpecialOffer.init()]);
  });
  afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
  beforeEach(async () => {
    await Promise.all([Tenant, Attraction, Availability, Booking, PromoCode, SpecialOffer].map((model) => (model as typeof Tenant).collection.deleteMany({})));
    await Tenant.collection.insertMany([
      { _id: usdSite, slug: 'red-sea-usd', name: 'Red Sea Trips', domain: 'red-sea-usd.invalid', status: 'active', timezone: 'Africa/Cairo', defaultCurrency: 'USD', customPages: [] },
      { _id: egpSite, slug: 'nile-egp', name: 'Nile Trips', domain: 'nile-egp.invalid', status: 'active', timezone: 'Africa/Cairo', defaultCurrency: 'EGP', customPages: [] },
      { _id: eurSite, slug: 'riviera-eur', name: 'Riviera Trips', domain: 'riviera-eur.invalid', status: 'active', timezone: 'Africa/Cairo', defaultCurrency: 'EUR', customPages: [] },
    ]);
  });

  describe('checkout', () => {
    it('refuses an EGP fixed promo on a USD tour and books nothing', async () => {
      const usdTour = await insertTour(usdSite, 'USD', 100);
      // As the old admin form saved it: "Fixed Amount ($)" 50, stored as EGP by the schema default.
      await insertPromo({ code: 'SAVE50', tenantId: usdSite, discountType: 'fixed', discountValue: 50, currency: 'EGP' });

      const refused = await book('red-sea-usd', usdTour, { promoCode: 'save50' }).expect(400);
      expect(refused.body.error).toBe('This promo code applies only to bookings priced in EGP');
      expect(await Booking.countDocuments({})).toBe(0);
      expect(await usageOf('SAVE50')).toBe(0);
    });

    it('applies the same EGP amount on an EGP tour, in EGP, and claims the code once', async () => {
      const egpTour = await insertTour(egpSite, 'EGP', 1000);
      await insertPromo({ code: 'NILE50', discountType: 'fixed', discountValue: 50, currency: 'EGP' });

      const booked = await book('nile-egp', egpTour, { promoCode: 'NILE50' }).expect(201);
      expect(booked.body.data).toMatchObject({ currency: 'EGP', subtotal: 2000, fees: 100, discount: 50, total: 2050, promoCode: 'NILE50' });
      expect(await usageOf('NILE50')).toBe(1);
    });

    it('applies a USD code on a USD tour and refuses a code without a usable currency', async () => {
      const usdTour = await insertTour(usdSite, 'USD', 100);
      await insertPromo({ code: 'REEF20', tenantId: usdSite, discountType: 'fixed', discountValue: 20, currency: 'USD' });
      await insertPromo({ code: 'BLANK', tenantId: usdSite, discountType: 'percentage', discountValue: 10, currency: '' });

      const booked = await book('red-sea-usd', usdTour, { promoCode: 'REEF20' }).expect(201);
      expect(booked.body.data).toMatchObject({ currency: 'USD', subtotal: 200, fees: 10, discount: 20, total: 190 });
      const blank = await book('red-sea-usd', usdTour, { promoCode: 'BLANK' }).expect(400);
      expect(blank.body.error).toBe('This promo code has no currency set, so it cannot be used yet');
    });

    it('discounts a fixed offer in the tour currency and never applies one in another currency', async () => {
      const usdTour = await insertTour(usdSite, 'USD', 100);
      const offerId = await insertOffer(usdTour, { discountType: 'fixed', discountValue: 15, currency: 'USD' });
      // Higher value but in EGP: it must neither win the sort nor apply.
      await insertOffer(usdTour, { discountType: 'fixed', discountValue: 500, currency: 'EGP' });

      const booked = await book('red-sea-usd', usdTour).expect(201);
      expect(booked.body.data).toMatchObject({ currency: 'USD', subtotal: 200, discount: 15, total: 195 });
      expect(String((await Booking.findOne({}))?.specialOfferId)).toBe(offerId);
      expect((await SpecialOffer.findById(offerId))?.usageCount).toBe(1);
    });

    it('never applies a fixed offer saved without a currency, and still applies percentage offers', async () => {
      const usdTour = await insertTour(usdSite, 'USD', 100);
      await insertOffer(usdTour, { discountType: 'fixed', discountValue: 50 });
      const percentage = await insertOffer(usdTour, { discountType: 'percentage', discountValue: 10 });

      const booked = await book('red-sea-usd', usdTour).expect(201);
      expect(booked.body.data).toMatchObject({ discount: 20, total: 190 });
      expect(String((await Booking.findOne({}))?.specialOfferId)).toBe(percentage);

      const price = await priceBookingSelection((await Attraction.findById(usdTour))!, (await Tenant.findById(usdSite))!,
        [{ optionId: 'shared', date: futureDate(), quantities: { adults: 2, children: 0, infants: 0 } }] as never);
      expect(price.discount).toBe(20);
    });

    it('claims only the exact terms a booking was priced with', async () => {
      const usdTour = await insertTour(usdSite, 'USD', 100);
      const offerId = await insertOffer(usdTour, { discountType: 'fixed', discountValue: 15, currency: 'USD' });
      await insertPromo({ code: 'CAP10', tenantId: usdSite, discountType: 'percentage', discountValue: 10, maxDiscount: 4, currency: 'USD', minOrderAmount: 100 });
      const now = new Date();
      const stale = (await SpecialOffer.findById(offerId).lean())!;
      const stalePromo = (await PromoCode.findOne({ code: 'CAP10' }).lean())!;

      // Unchanged terms claim.
      expect(await SpecialOffer.findOneAndUpdate(offerClaimFilter(stale, 'USD', now), { $inc: { usageCount: 1 } })).not.toBeNull();
      expect(await PromoCode.findOneAndUpdate(promoClaimFilter(stalePromo, 'USD', 200, now), { $inc: { usageCount: 1 } })).not.toBeNull();

      // Any change in amount, currency, minimum or cap fails the claim closed.
      await SpecialOffer.updateOne({ _id: offerId }, { $set: { discountValue: 40 } });
      expect(await SpecialOffer.findOneAndUpdate(offerClaimFilter(stale, 'USD', now), { $inc: { usageCount: 1 } })).toBeNull();
      await SpecialOffer.updateOne({ _id: offerId }, { $set: { discountValue: 15, currency: 'EUR' } });
      expect(await SpecialOffer.findOneAndUpdate(offerClaimFilter(stale, 'USD', now), { $inc: { usageCount: 1 } })).toBeNull();
      expect(await SpecialOffer.findOneAndUpdate(offerClaimFilter({ ...stale, currency: 'EUR' }, 'not a code', now), { $inc: { usageCount: 1 } })).toBeNull();
      await PromoCode.updateOne({ code: 'CAP10' }, { $unset: { maxDiscount: 1 } });
      expect(await PromoCode.findOneAndUpdate(promoClaimFilter(stalePromo, 'USD', 200, now), { $inc: { usageCount: 1 } })).toBeNull();
      await PromoCode.updateOne({ code: 'CAP10' }, { $set: { maxDiscount: 4, minOrderAmount: 500 } });
      expect(await PromoCode.findOneAndUpdate(promoClaimFilter(stalePromo, 'USD', 200, now), { $inc: { usageCount: 1 } })).toBeNull();
      expect(await PromoCode.findOneAndUpdate(promoClaimFilter(stalePromo, 'EUR', 200, now), { $inc: { usageCount: 1 } })).toBeNull();
    });
  });

  describe('storefront reads', () => {
    it('shows only offers checkout would apply, on the tour and on the deals list', async () => {
      const usdTour = await insertTour(usdSite, 'USD', 100);
      await insertOffer(usdTour, { discountType: 'fixed', discountValue: 500, currency: 'EGP' });
      await insertOffer(usdTour, { discountType: 'fixed', discountValue: 300 });
      const applicable = await insertOffer(usdTour, { discountType: 'fixed', discountValue: 12, currency: 'USD' });

      const one = await request(app).get(`/special-offers/attraction/${usdTour}?tenant=red-sea-usd`).expect(200);
      expect(one.body.data).toMatchObject({ _id: applicable, discountType: 'fixed', discountValue: 12, currency: 'USD' });
      const active = await request(app).get('/special-offers/active?tenant=red-sea-usd').expect(200);
      expect(active.body.data.map((offer: { _id: string }) => offer._id)).toEqual([applicable]);
      expect(active.body.data[0].attractionId.currency).toBe('USD');

      // A tour of another site is invisible to this site.
      const egpTour = await insertTour(egpSite, 'EGP', 1000);
      await request(app).get(`/special-offers/attraction/${egpTour}?tenant=red-sea-usd`).expect(404);
    });

    it('previews a code per tour with the same rule as checkout', async () => {
      const usdTour = await insertTour(usdSite, 'USD', 100);
      const egpTour = await insertTour(egpSite, 'EGP', 1000);
      await insertPromo({ code: 'SAVE50', discountType: 'fixed', discountValue: 50, currency: 'EGP', minOrderAmount: 100 });
      const preview = (site: string, body: Record<string, unknown>) =>
        request(app).post(`/promo-codes/validate?tenant=${site}`).send({ code: 'SAVE50', subtotal: 200, ...body });

      const refused = await preview('red-sea-usd', { attractionId: usdTour }).expect(400);
      expect(refused.body.error).toBe('This promo code applies only to bookings priced in EGP');
      const accepted = await preview('nile-egp', { attractionId: egpTour, subtotal: 2000 }).expect(200);
      expect(accepted.body.data).toMatchObject({ valid: true, currency: 'EGP', discount: 50, discountType: 'fixed' });
      const minimum = await preview('nile-egp', { attractionId: egpTour, subtotal: 80 }).expect(400);
      expect(minimum.body.error).toBe('Minimum order amount is EGP 100');

      // Another site's tour reads exactly like a missing one.
      const foreign = await preview('red-sea-usd', { attractionId: egpTour }).expect(404);
      const missing = await preview('red-sea-usd', { attractionId: new Types.ObjectId().toHexString() }).expect(404);
      expect(foreign.body.error).toBe(missing.body.error);
      await preview('red-sea-usd', { attractionId: 'not-an-id' }).expect(400);

      // Clients that predate per-tour checks are judged in the site's currency,
      // but only when the site sells in exactly one; otherwise they must name the tour.
      await preview('red-sea-usd', {}).expect(400);
      await preview('nile-egp', { subtotal: 2000 }).expect(200);
      await insertTour(egpSite, 'USD', 30);
      const unnamed = await preview('nile-egp', { subtotal: 2000 }).expect(400);
      expect(unnamed.body.error).toBe('Choose the tour this promo code is for');
      await preview('nile-egp', { attractionId: egpTour, subtotal: 2000 }).expect(200);
    });
  });

  describe('admin promo codes', () => {
    const create = (test: request.Test, body: Record<string, unknown>) => test.send({
      code: 'REEF10', description: 'Reef season', discountType: 'fixed', discountValue: 10,
      validFrom: new Date().toISOString(), validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(), ...body,
    });

    it('creates a site code only in a currency the site sells in', async () => {
      await insertTour(usdSite, 'USD', 100);
      const refused = await create(brandAdmin(request(app).post('/promo-codes'), usdSite).set('X-Tenant-ID', String(usdSite)), { currency: 'EGP' }).expect(400);
      expect(refused.body.error).toBe("This site sells in USD. Enter the code's amounts in USD.");
      await create(brandAdmin(request(app).post('/promo-codes'), usdSite), {}).expect(400);

      const created = await create(brandAdmin(request(app).post('/promo-codes'), usdSite), { currency: 'usd', usageCount: 40 }).expect(201);
      expect(created.body.data).toMatchObject({ code: 'REEF10', currency: 'USD', usageCount: 0, tenantId: String(usdSite) });
      await create(brandAdmin(request(app).post('/promo-codes'), usdSite), { currency: 'USD' }).expect(409);
    });

    it("keeps codes inside the caller's sites and roles", async () => {
      await create(brandAdmin(request(app).post('/promo-codes'), usdSite).set('X-Tenant-ID', String(egpSite)), { currency: 'EGP' }).expect(403);
      await brandAdmin(request(app).get('/promo-codes/currency-options'), usdSite).set('X-Tenant-ID', String(egpSite)).expect(403);
      for (const role of ['editor', 'viewer']) {
        await create(as(request(app).post('/promo-codes'), role, usdSite), { currency: 'USD' }).expect(403);
        await as(request(app).get('/promo-codes/currency-options'), role, usdSite).expect(403);
        await as(request(app).patch(`/promo-codes/${new Types.ObjectId()}`), role, usdSite).send({ isActive: false }).expect(403);
      }
      await request(app).get('/promo-codes/currency-options').expect(401);

      await insertPromo({ code: 'NILE5', tenantId: egpSite, discountType: 'fixed', discountValue: 5, currency: 'EGP' });
      const foreign = (await PromoCode.findOne({ code: 'NILE5' }))!;
      await brandAdmin(request(app).patch(`/promo-codes/${foreign._id}`), usdSite).send({ isActive: false }).expect(404);
      await brandAdmin(request(app).patch(`/promo-codes/${foreign._id}`), usdSite).send({ discountValue: 1, currency: 'USD' }).expect(404);
      expect((await PromoCode.findById(foreign._id))?.discountValue).toBe(5);
    });

    it('tells the form which site and currencies a new code gets', async () => {
      await insertTour(usdSite, 'USD', 100);
      await insertTour(eurSite, 'EUR', 90);
      const mine = await brandAdmin(request(app).get('/promo-codes/currency-options'), usdSite).expect(200);
      expect(mine.body.data).toEqual({ site: { id: String(usdSite), name: 'Red Sea Trips', slug: 'red-sea-usd' }, currencies: ['USD'], defaultCurrency: 'USD' });
      const selected = await as(request(app).get('/promo-codes/currency-options'), 'super-admin').set('X-Tenant-ID', String(egpSite)).expect(200);
      expect(selected.body.data).toMatchObject({ site: { slug: 'nile-egp' }, currencies: ['EGP'], defaultCurrency: 'EGP' });
      const everywhere = await as(request(app).get('/promo-codes/currency-options'), 'super-admin').expect(200);
      expect(everywhere.body.data).toEqual({ site: null, currencies: ['EGP', 'EUR', 'USD'], defaultCurrency: 'USD' });

      // A code valid on every site must use a currency some site sells in.
      await create(as(request(app).post('/promo-codes'), 'super-admin'), { currency: 'GBP' }).expect(400);
      const global = await create(as(request(app).post('/promo-codes'), 'super-admin'), { code: 'EVERYWHERE', currency: 'EUR' }).expect(201);
      expect(global.body.data.tenantId).toBeUndefined();
    });

    it('requires the currency on any edit to an amount, and lets a code be paused without one', async () => {
      await insertTour(usdSite, 'USD', 100);
      // The production shape found on 1 Oct: a USD site's code saved as EGP.
      await insertPromo({ code: 'FOXES10', tenantId: usdSite, discountType: 'percentage', discountValue: 10, minOrderAmount: 1, maxDiscount: 4, currency: 'EGP' });
      const id = String((await PromoCode.findOne({ code: 'FOXES10' }))!._id);
      const edit = (body: Record<string, unknown>) => brandAdmin(request(app).patch(`/promo-codes/${id}`), usdSite).send(body);

      await edit({ isActive: false }).expect(200);
      expect((await PromoCode.findById(id))?.currency).toBe('EGP');
      expect((await edit({ discountValue: 12 }).expect(400)).body.error).toBe("Confirm the currency of this code's amounts");
      await edit({ discountValue: 12, currency: 'EGP' }).expect(400);
      const fixed = await edit({ discountValue: 12, currency: 'USD' }).expect(200);
      expect(fixed.body.data).toMatchObject({ currency: 'USD', discountValue: 12, maxDiscount: 4, minOrderAmount: 1, isActive: false });

      // Switching to a fixed amount drops the percentage cap; a percentage above 100 is refused on the merged code.
      const switched = await edit({ discountType: 'fixed', discountValue: 5, currency: 'USD' }).expect(200);
      expect(switched.body.data.maxDiscount).toBeUndefined();
      await edit({ discountType: 'percentage', currency: 'USD' }).expect(200);
      await edit({ discountValue: 150, currency: 'USD' }).expect(400);
      const listed = await brandAdmin(request(app).get('/promo-codes'), usdSite).expect(200);
      expect(listed.body.data[0]).toMatchObject({ code: 'FOXES10', siteCurrencies: ['USD'] });
    });
  });

  describe('admin special offers', () => {
    const offerBody = (extra: Record<string, unknown>) => ({
      title: 'Family savings', description: '', discountType: 'fixed', discountValue: 10,
      validFrom: new Date().toISOString(), validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(), ...extra,
    });

    it('stamps a fixed amount with its tour currency and refuses any other', async () => {
      const usdTour = await insertTour(usdSite, 'USD', 100);
      const refused = await brandAdmin(request(app).post('/special-offers'), usdSite).send(offerBody({ attractionId: usdTour, currency: 'EGP' })).expect(400);
      expect(refused.body.error).toBe('This tour is priced in USD, not EGP. Enter the fixed amount in USD.');
      await brandAdmin(request(app).post('/special-offers'), usdSite).send(offerBody({ attractionId: usdTour })).expect(400);

      const created = await brandAdmin(request(app).post('/special-offers'), usdSite).send(offerBody({ attractionId: usdTour, currency: 'USD' })).expect(201);
      expect(created.body.data).toMatchObject({ currency: 'USD', discountType: 'fixed', discountValue: 10 });
      const percentage = await brandAdmin(request(app).post('/special-offers'), usdSite)
        .send(offerBody({ attractionId: usdTour, discountType: 'percentage', discountValue: 20, currency: 'EGP' })).expect(201);
      expect(percentage.body.data.currency).toBeUndefined();
    });

    it('puts one fixed amount only on tours priced in one currency', async () => {
      const usdA = await insertTour(usdSite, 'USD', 100);
      const usdB = await insertTour(usdSite, 'USD', 80);
      const eur = await insertTour(usdSite, 'EUR', 90);
      const mixed = await as(request(app).post('/special-offers/bulk'), 'super-admin').send(offerBody({ attractionIds: [usdA, eur], currency: 'USD' })).expect(400);
      expect(mixed.body.error).toBe('The selected tours are priced in EUR, USD. A fixed amount needs tours priced in one currency; select tours in one currency or use a percentage.');
      expect(await SpecialOffer.countDocuments({})).toBe(0);

      const created = await brandAdmin(request(app).post('/special-offers/bulk'), usdSite).send(offerBody({ attractionIds: [usdA, usdB], currency: 'USD' })).expect(201);
      expect(created.body.data.createdCount).toBe(2);
      expect(await SpecialOffer.countDocuments({ currency: 'USD', discountType: 'fixed' })).toBe(2);
    });

    it('restates the currency on amount edits only, and keeps other sites out', async () => {
      const usdTour = await insertTour(usdSite, 'USD', 100);
      const legacy = await insertOffer(usdTour, { discountType: 'fixed', discountValue: 10 });
      const edit = (body: Record<string, unknown>, site = usdSite) => brandAdmin(request(app).patch(`/special-offers/${legacy}`), site).send(body);

      await edit({ isActive: false }).expect(200);
      expect((await SpecialOffer.collection.findOne({ _id: new Types.ObjectId(legacy) }))?.currency).toBeUndefined();
      await edit({ discountValue: 12 }).expect(400);
      await edit({ discountValue: 12, currency: 'EUR' }).expect(400);
      expect((await edit({ discountValue: 12, currency: 'USD' }).expect(200)).body.data.currency).toBe('USD');
      const percentage = await edit({ discountType: 'percentage', discountValue: 15 }).expect(200);
      expect(percentage.body.data.currency).toBeUndefined();
      await edit({ discountValue: 150 }).expect(400);

      // Another site's admin sees nothing to edit and cannot place an offer on this tour.
      await edit({ isActive: true }, egpSite).expect(404);
      await brandAdmin(request(app).post('/special-offers'), egpSite).send(offerBody({ attractionId: usdTour, currency: 'USD' })).expect(403);
      await as(request(app).patch(`/special-offers/${legacy}`), 'editor', usdSite).send({ isActive: true }).expect(403);
    });
  });

  describe('changing a tour currency', () => {
    it('must restate the prices and waits for upcoming bookings sold in the old currency', async () => {
      const tour = await insertTour(usdSite, 'USD', 100, { addons: [{ id: 'lunch', name: 'Lunch', price: 15, pricingType: 'per_unit' }] });
      const patch = (body: Record<string, unknown>) => brandAdmin(request(app).patch(`/attractions/${tour}`), usdSite).send(body);
      const prices = { pricingOptions: [{ id: 'shared', name: 'Shared trip', price: 90, pricingModel: 'per-person' }], addons: [{ id: 'lunch', name: 'Lunch', price: 14, pricingType: 'per_unit' }] };

      // The editor re-sends the same currency on every save: untouched.
      await patch({ currency: 'usd', duration: '5 hours' }).expect(200);
      expect((await Attraction.findById(tour))?.currency).toBe('USD');

      const bare = await patch({ currency: 'EUR' }).expect(400);
      expect(bare.body.error).toBe('Changing the currency re-prices this tour. Save its prices in EUR in the same change.');
      await patch({ currency: 'EUR', pricingOptions: prices.pricingOptions }).expect(400);
      await patch({ currency: 'Euros', ...prices }).expect(400);

      await book('red-sea-usd', tour).expect(201);
      const waiting = await patch({ currency: 'EUR', ...prices }).expect(400);
      expect(waiting.body.error).toBe('This tour has 1 upcoming booking sold in USD. Change its currency once it is completed or cancelled, or duplicate the tour and price the copy in EUR.');
      expect((await Attraction.findById(tour))?.currency).toBe('USD');

      await Booking.updateMany({}, { $set: { status: 'cancelled' } });
      await patch({ currency: 'EUR', ...prices }).expect(200);
      expect((await Attraction.findById(tour))?.currency).toBe('EUR');
    });

    it('counts a starting price as a price, and waits for live fixed-amount offers', async () => {
      // An older record priced only by its starting price.
      const tour = await insertTour(usdSite, 'USD', 100, { pricingOptions: [], priceFrom: 60 });
      const patch = (body: Record<string, unknown>) => brandAdmin(request(app).patch(`/attractions/${tour}`), usdSite).send(body);
      await patch({ currency: 'EUR' }).expect(400);
      await patch({ currency: 'EUR', pricingOptions: [] }).expect(400);

      const offer = await insertOffer(tour, { discountType: 'fixed', discountValue: 10, currency: 'USD' });
      const waiting = await patch({ currency: 'EUR', priceFrom: 55 }).expect(400);
      expect(waiting.body.error).toBe("This tour has 1 live fixed-amount offer in USD. End it or switch it to a percentage before changing the tour's currency.");
      expect((await Attraction.findById(tour))?.currency).toBe('USD');

      await SpecialOffer.updateOne({ _id: offer }, { $set: { validUntil: new Date(Date.now() - 86_400_000) } });
      await patch({ currency: 'EUR', priceFrom: 55 }).expect(200);
      expect(await Attraction.findById(tour).lean()).toMatchObject({ currency: 'EUR', priceFrom: 55 });
    });
  });
});
