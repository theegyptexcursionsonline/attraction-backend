import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import attractionRoutes from '../routes/attractions.routes';
import bookingRoutes from '../routes/bookings.routes';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { createAttractionSchema } from '../utils/validators';
import { DEPARTURE_SCHEDULE_CONFLICT_MESSAGE, departureScheduleConflict } from '../utils/departureAvailability';
import { toOctoProduct } from '../octo/mappers';

/**
 * PLATFORM-ISSUES #1024: `availability.type` alone decides whether a booking carries a departure.
 * A tour sold by the day is booked without a time, so its writes must not also list departure
 * times (the storefront used to ask for one and found none: "No departures are scheduled").
 */

jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
  authenticate: (req: any, res: any, next: any) => {
    const role = req.header('x-test-role');
    if (!role) return res.status(401).json({ success: false });
    req.user = { _id: new Types.ObjectId(), role, assignedTenants: req.header('x-test-assigned')?.split(',') || [] };
    next();
  },
}));
jest.mock('../middleware/rate-limit.middleware', () => {
  const actual = jest.requireActual('../middleware/rate-limit.middleware');
  return { ...actual, bookingLimiter: (_req: unknown, _res: unknown, next: () => void) => next() };
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

const windows = [
  { label: 'Morning sail', startTime: '09:00', endTime: '13:30' },
  { label: 'Sunset sail', startTime: '14:00', endTime: '19:00' },
];
const publishable = () => ({
  slug: 'reef-sail',
  title: 'Reef sail',
  shortDescription: 'A reef sail',
  description: 'A complete reef sail',
  category: 'boat-trips',
  destination: { city: 'Hurghada', country: 'Egypt', coordinates: { lat: 27.25, lng: 33.81 } },
  duration: '4 hours',
  priceFrom: 50,
  currency: 'EUR',
  pricingOptions: [{ id: 'shared', name: 'Shared sail', price: 50 }],
});
const issues = (result: ReturnType<typeof createAttractionSchema.safeParse>) =>
  result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));

describe('departureScheduleConflict', () => {
  it.each([
    ['date-only with a window', { availability: { type: 'date-only' }, entryWindows: windows }, true],
    ['flexible with an option slot', { availability: { type: 'flexible' }, pricingOptions: [{ timeSlots: [{ startTime: '08:00' }] }] }, true],
    ['date-only with no times', { availability: { type: 'date-only' }, entryWindows: [], pricingOptions: [{ timeSlots: [] }] }, false],
    ['date-only whose windows have no start yet', { availability: { type: 'date-only' }, entryWindows: [{ startTime: ' ' }, { startTime: null }] }, false],
    ['time-slots with windows', { availability: { type: 'time-slots' }, entryWindows: windows }, false],
    ['no type (the model default is time-slots)', { entryWindows: windows }, false],
    ['enquiry-only', { enquiryOnly: true, availability: { type: 'date-only' }, entryWindows: windows }, false],
  ])('%s → %p', (_name, source, expected) => {
    expect(departureScheduleConflict(source)).toBe(expected);
  });
});

describe('publish contract', () => {
  it('refuses a tour sold by date that lists departure windows, naming the availability type', () => {
    const result = createAttractionSchema.safeParse({ ...publishable(), availability: { type: 'date-only', advanceBooking: 30 }, entryWindows: windows });
    expect(issues(result)).toContainEqual({ path: 'availability.type', message: DEPARTURE_SCHEDULE_CONFLICT_MESSAGE });
  });

  it('refuses option time slots on a flexible tour', () => {
    const result = createAttractionSchema.safeParse({
      ...publishable(),
      availability: { type: 'flexible', advanceBooking: 2 },
      pricingOptions: [{ id: 'shared', name: 'Shared sail', price: 50, timeSlots: [{ id: 'am', label: 'Morning', startTime: '09:00' }] }],
    });
    expect(issues(result).map((issue) => issue.path)).toContain('availability.type');
  });

  it('accepts the consistent shapes: departures sold by time slot, days sold without times, defaults', () => {
    expect(createAttractionSchema.safeParse({ ...publishable(), availability: { type: 'time-slots', advanceBooking: 30 }, entryWindows: windows }).success).toBe(true);
    expect(createAttractionSchema.safeParse({ ...publishable(), availability: { type: 'date-only', advanceBooking: 30 } }).success).toBe(true);
    expect(createAttractionSchema.safeParse({ ...publishable(), entryWindows: windows }).success).toBe(true);
  });
});

describe('OCTO keeps a day-sold tour all-day even with legacy windows', () => {
  it('maps date-only with windows to OPENING_HOURS and never exposes the windows as start times', () => {
    const product = toOctoProduct({
      _id: 'prod', slug: 'reef-sail', title: 'Reef sail', currency: 'EUR', priceFrom: 50,
      availability: { type: 'date-only' }, entryWindows: windows,
      pricingOptions: [{ id: 'adult', name: 'Adult', price: 50 }],
    }, { _id: 'tenant', slug: 'site' });
    expect(product.availabilityType).toBe('OPENING_HOURS');
    expect(product.options[0].availabilityLocalStartTimes).toEqual(['00:00']);
  });
});

describe('writes over HTTP', () => {
  const site = new Types.ObjectId();
  const app = express();
  app.use(express.json());
  app.use('/attractions', attractionRoutes);
  app.use('/bookings', bookingRoutes);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ success: false, error: error.message }));
  const staff = (test: request.Test, role = 'brand-admin') => test.set('x-test-role', role).set('x-test-assigned', String(site));
  let mongo: MongoMemoryReplSet;

  // A record exactly as older seeds stored it: sold by the day, with two published windows.
  const insertLegacyTour = async (overrides: Record<string, unknown> = {}) => {
    const _id = new Types.ObjectId();
    await Attraction.collection.insertOne({
      _id, ...publishable(), slug: `reef-sail-${_id}`, status: 'active', tenantIds: [site], ownerTenantId: site,
      availability: { type: 'date-only', advanceBooking: 30 }, entryWindows: windows,
      pricingOptions: [{ id: 'shared', name: 'Shared sail', price: 50, pricingModel: 'per-person' }],
      images: [], highlights: [], inclusions: [], exclusions: [], addons: [], itinerary: [], presentationRevision: 0,
      ...overrides,
    });
    return String(_id);
  };
  const stored = (id: string) => Attraction.collection.findOne({ _id: new Types.ObjectId(id) });

  beforeAll(async () => {
    const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
    const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
    const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
    await mongoose.connect(mongo.getUri('departure_schedule'));
    await Promise.all([Tenant.init(), Attraction.init(), Availability.init(), Booking.init()]);
  });
  afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
  beforeEach(async () => {
    process.env.URL_NAMESPACE_WRITES_READY = 'true';
    await Promise.all([Tenant, Attraction, Availability, Booking].map((model) => (model as typeof Tenant).collection.deleteMany({})));
    await Tenant.collection.insertOne({ _id: site, slug: 'day-sold-site', name: 'Day sold site', domain: 'day-sold-site.invalid', status: 'active', timezone: 'Africa/Cairo', customPages: [] });
  });

  it('refuses to create the pair, as a draft too, and creates the consistent tour', async () => {
    const draft = await staff(request(app).post('/attractions')).send({
      title: 'Reef sail draft', slug: `draft-${new Types.ObjectId()}`, status: 'draft', tenantIds: [String(site)],
      availability: { type: 'date-only', advanceBooking: 30 },
      pricingOptions: [{ id: 'shared', name: 'Shared', timeSlots: [{ startTime: '09:00' }] }],
    }).expect(400);
    expect(draft.body.error).toBe(DEPARTURE_SCHEDULE_CONFLICT_MESSAGE);

    const published = await staff(request(app).post('/attractions')).send({
      ...publishable(), slug: `published-${new Types.ObjectId()}`, tenantIds: [String(site)],
      availability: { type: 'date-only', advanceBooking: 30 }, entryWindows: windows,
    }).expect(400);
    expect(JSON.stringify(published.body)).toContain(DEPARTURE_SCHEDULE_CONFLICT_MESSAGE);
    expect(await Attraction.countDocuments({})).toBe(0);

    await staff(request(app).post('/attractions')).send({
      ...publishable(), slug: `fixed-${new Types.ObjectId()}`, tenantIds: [String(site)],
      availability: { type: 'time-slots', advanceBooking: 30 }, entryWindows: windows,
    }).expect(201);
  });

  it('refuses an edit that would write the pair and leaves the record untouched', async () => {
    const id = await insertLegacyTour({ availability: { type: 'time-slots', advanceBooking: 30 } });
    const before = await stored(id);
    const response = await staff(request(app).patch(`/attractions/${id}`)).send({ availability: { type: 'date-only', advanceBooking: 30 } }).expect(400);
    expect(response.body.error).toBe(DEPARTURE_SCHEDULE_CONFLICT_MESSAGE);
    expect(await stored(id)).toEqual(before);
  });

  it('makes an older record holding the pair choose before its schedule or prices change', async () => {
    const id = await insertLegacyTour();
    await staff(request(app).patch(`/attractions/${id}`))
      .send({ pricingOptions: [{ id: 'shared', name: 'Shared sail', price: 55 }] }).expect(400);
    expect((await stored(id))?.pricingOptions[0].price).toBe(50);

    // Unrelated fields still save, so nobody is locked out of the record.
    await staff(request(app).patch(`/attractions/${id}`)).send({ duration: '5 hours' }).expect(200);
    expect((await stored(id))?.duration).toBe('5 hours');

    // Republishing is a publish: the full contract, including the schedule rule, applies.
    const republish = await staff(request(app).patch(`/attractions/${id}`)).send({ status: 'active' }).expect(400);
    expect(republish.body.error).toContain(DEPARTURE_SCHEDULE_CONFLICT_MESSAGE);
  });

  it('accepts either resolution: sell by time slot, or drop the times', async () => {
    const departures = await insertLegacyTour();
    await staff(request(app).patch(`/attractions/${departures}`)).send({ availability: { type: 'time-slots', advanceBooking: 30 } }).expect(200);
    expect((await stored(departures))?.availability.type).toBe('time-slots');

    const byDay = await insertLegacyTour();
    await staff(request(app).patch(`/attractions/${byDay}`))
      .send({ entryWindows: [], pricingOptions: [{ id: 'shared', name: 'Shared sail', price: 55, timeSlots: [] }] }).expect(200);
    expect(await stored(byDay)).toMatchObject({ entryWindows: [], availability: { type: 'date-only' } });

    const enquiry = await insertLegacyTour();
    await staff(request(app).patch(`/attractions/${enquiry}`)).send({ enquiryOnly: true }).expect(200);
  });

  it('never reveals a tour outside the editor’s sites through the schedule check', async () => {
    const id = await insertLegacyTour({ tenantIds: [new Types.ObjectId()], ownerTenantId: undefined });
    await staff(request(app).patch(`/attractions/${id}`)).send({ availability: { type: 'date-only', advanceBooking: 30 } }).expect(403);
  });

  it('books an older day-sold tour with windows without a time, against the whole day', async () => {
    const id = await insertLegacyTour();
    const date = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

    // The storefront reads the day as available and receives no departures to choose from.
    const day = await request(app).get(`/attractions/${id}/availability?date=${date}&tenant=day-sold-site`).expect(200);
    const days = day.body.data.availability as Array<{ date: string; timeSlots?: unknown }>;
    expect(days.find((entry) => entry.date === date)).toEqual({ date, available: true, spotsLeft: 25 });
    expect(days.some((entry) => entry.timeSlots !== undefined)).toBe(false);

    const booking = await request(app).post('/bookings?tenant=day-sold-site')
      .set('Idempotency-Key', `departures-${new Types.ObjectId()}`)
      .send({
        attractionId: id,
        items: [{ optionId: 'shared', date, quantities: { adults: 2, children: 0, infants: 0 } }],
        guestDetails: { firstName: 'Egypt Excursions', lastName: 'Online QA', email: 'theegyptexcursionsonline@gmail.com', phone: '+201000000000', country: 'Egypt' },
        paymentMethod: 'pay-later',
      }).expect(201);
    expect(booking.body.data.items[0].time).toBeUndefined();
    expect(booking.body.data.total).toBe(105); // 2 × 50 + the 5% service fee, from the catalogue

    const inventory = await Availability.collection.findOne({ attractionId: new Types.ObjectId(id) });
    expect(inventory).toMatchObject({ allDayCapacity: 25, allDayBooked: 2, timeSlots: [] });
  });

  // The day pool is what a by-date reservation draws on; the calendar must say exactly that.
  const dayOf = async (id: string, date: string) => {
    const response = await request(app).get(`/attractions/${id}/availability?date=${date}&tenant=day-sold-site`).expect(200);
    return (response.body.data.availability as Array<{ date: string }>).find((entry) => entry.date === date);
  };
  const bookByDate = (id: string, date: string, adults: number) => request(app).post('/bookings?tenant=day-sold-site')
    .set('Idempotency-Key', `departures-${new Types.ObjectId()}`)
    .send({
      attractionId: id,
      items: [{ optionId: 'shared', date, quantities: { adults, children: 0, infants: 0 } }],
      guestDetails: { firstName: 'Egypt Excursions', lastName: 'Online QA', email: 'theegyptexcursionsonline@gmail.com', phone: '+201000000000', country: 'Egypt' },
      paymentMethod: 'pay-later',
    });

  it('reports the seats left in a day-sold day, and a full or unusable day as closed, as the reservation does', async () => {
    const id = await insertLegacyTour();
    const attractionId = new Types.ObjectId(id);
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const utc = (date: string) => new Date(`${date}T00:00:00.000Z`);
    await Availability.collection.insertMany([
      { attractionId, date: utc(day(11)), timeSlots: [], allDayCapacity: 10, allDayBooked: 7, isBlocked: false },
      { attractionId, date: utc(day(12)), timeSlots: [], allDayCapacity: 0, allDayBooked: 0, isBlocked: false },
      // Older bundle fixture: a slot but no day pool. A by-date reservation cannot use it.
      { attractionId, date: utc(day(13)), timeSlots: [{ time: '08:00', capacity: 8, booked: 0 }], allDayBooked: 0, isBlocked: false },
      // Older all-day row without a stored pool: the reservation gives it the default of 25.
      { attractionId, date: utc(day(14)), timeSlots: [], allDayBooked: 4, isBlocked: false },
    ]);

    expect(await dayOf(id, day(11))).toEqual({ date: day(11), available: true, spotsLeft: 3 });
    expect(await dayOf(id, day(12))).toEqual({ date: day(12), available: false, spotsLeft: 0 });
    expect(await dayOf(id, day(13))).toEqual({ date: day(13), available: false, spotsLeft: 0 });
    expect(await dayOf(id, day(14))).toEqual({ date: day(14), available: true, spotsLeft: 21 });

    // The reservation agrees with each answer.
    await bookByDate(id, day(11), 4).expect(409);
    await bookByDate(id, day(11), 3).expect(201);
    await bookByDate(id, day(12), 1).expect(409);
    await bookByDate(id, day(13), 1).expect(409);
    await bookByDate(id, day(14), 21).expect(201);
    expect(await dayOf(id, day(14))).toEqual({ date: day(14), available: false, spotsLeft: 0 });
  });

  it('still requires a departure for a tour sold by time slot', async () => {
    const id = await insertLegacyTour({ availability: { type: 'time-slots', advanceBooking: 30 } });
    const date = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const response = await request(app).post('/bookings?tenant=day-sold-site')
      .set('Idempotency-Key', `departures-${new Types.ObjectId()}`)
      .send({
        attractionId: id,
        items: [{ optionId: 'shared', date, quantities: { adults: 2, children: 0, infants: 0 } }],
        guestDetails: { firstName: 'Egypt Excursions', lastName: 'Online QA', email: 'theegyptexcursionsonline@gmail.com', phone: '+201000000000', country: 'Egypt' },
        paymentMethod: 'pay-later',
      }).expect(400);
    expect(response.body.error).toBe('Select an available time slot for this tour');
    expect(await Booking.countDocuments({})).toBe(0);
  });
});
