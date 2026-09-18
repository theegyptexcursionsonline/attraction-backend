import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { spawnSync } from 'child_process';

const mockMessagesCreate = jest.fn();
jest.mock('mailgun.js', () => {
  class MailgunStub {
    client() {
      return { messages: { create: mockMessagesCreate } };
    }
  }
  return { __esModule: true, default: MailgunStub };
});

process.env.MAILGUN_API_KEY = 'key-test';
process.env.MAILGUN_DOMAIN = 'mg.example.test';
process.env.MAILGUN_FROM_EMAIL = 'Attractions <noreply@mg.example.test>';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { env } = require('../config/env');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sweepBookingReminders } = require('../services/bookingReminder.service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Booking } = require('../models/Booking');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Tenant } = require('../models/Tenant');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EmailReceipt } = require('../models/EmailReceipt');

/**
 * The departure reminder and after-trip thank-you only count as shipped if something actually
 * fires them. This exercises the sweeper the server registers, against a real mongod.
 */

const ALPHA = new Types.ObjectId();
const BETA = new Types.ObjectId();
const NOW = new Date('2026-09-18T09:00:00.000Z');
const HOUR = 60 * 60 * 1000;

let mongo: MongoMemoryReplSet;
let consoleSpies: jest.SpyInstance[] = [];

const tenantDoc = (id: Types.ObjectId, name: string, slug: string, color: string, inbox: string) => ({
  _id: id, slug, domain: `${slug}.invalid`, name, status: 'active',
  theme: { primaryColor: color }, contactInfo: { email: inbox },
  defaultLanguage: 'en', defaultCurrency: 'EUR', timezone: 'Africa/Cairo', logo: `/logos/${slug}.png`,
});

const bookingDoc = (tenantId: Types.ObjectId, reference: string, email: string, departure: Date, extra: Record<string, unknown> = {}) => ({
  reference,
  tenantId,
  attractionId: new Types.ObjectId(),
  items: [{ date: departure.toISOString().slice(0, 10), time: '08:00', quantities: { adults: 2, children: 0, infants: 0 }, unitPrice: 50, totalPrice: 100 }],
  guestDetails: { firstName: 'Nadia', lastName: 'Visitor', email, phone: '+20 100 555 1212', country: 'EG' },
  inventoryReservations: [{ date: departure, time: '08:00', guests: 2 }],
  total: 100,
  currency: 'EUR',
  status: 'confirmed',
  paymentStatus: 'succeeded',
  paymentMethod: 'card',
  ...extra,
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
  await mongoose.connect(mongo.getUri('booking_reminders'), { autoIndex: false });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  consoleSpies = (['info', 'log', 'warn', 'error'] as const).map((level) =>
    jest.spyOn(console, level).mockImplementation(() => undefined)
  );
  mockMessagesCreate.mockReset();
  mockMessagesCreate.mockResolvedValue({ id: '<queued@mg.example.test>', status: 200 });
  env.bookingRemindersEnabled = true;
  await Promise.all([
    Tenant.collection.deleteMany({}),
    Booking.collection.deleteMany({}),
    EmailReceipt.collection.deleteMany({}).catch(() => undefined),
  ]);
  await Tenant.collection.insertMany([
    tenantDoc(ALPHA, 'Safari Sahara Hurghada', 'safari-sahara', '#D4A843', 'info@safari-sahara.example'),
    tenantDoc(BETA, 'Makadi Horse Club', 'makadi-horse-club', '#0F3D5E', 'reservations@makadi.example'),
  ]);
});

afterEach(() => consoleSpies.forEach((spy) => spy.mockRestore()));

const recipients = () => mockMessagesCreate.mock.calls.map((call) => call[1].to[0]);
const subjects = () => mockMessagesCreate.mock.calls.map((call) => call[1].subject);

describe('the departure reminder actually fires', () => {
  it('sends to a booking departing tomorrow, and to nobody else', async () => {
    await Booking.collection.insertMany([
      bookingDoc(ALPHA, 'SS-TOMORROW', 'tomorrow@example.com', new Date(NOW.getTime() + 24 * HOUR)),
      bookingDoc(ALPHA, 'SS-NEXT-WEEK', 'next-week@example.com', new Date(NOW.getTime() + 7 * 24 * HOUR)),
      bookingDoc(ALPHA, 'SS-IN-AN-HOUR', 'soon@example.com', new Date(NOW.getTime() + 1 * HOUR)),
    ]);

    const result = await sweepBookingReminders(NOW);

    expect(result.remindersSent).toBe(1);
    expect(recipients()).toEqual(['tomorrow@example.com']);
    expect(subjects()[0]).toContain('Tomorrow');
    const [, mail] = mockMessagesCreate.mock.calls[0];
    expect(mail.text).toContain('SS-TOMORROW');
    expect(mail.html).toContain('SS-TOMORROW');
    expect(mail['h:List-Unsubscribe']).toContain('mailto:info@safari-sahara.example');
  });

  it('sends the thank-you after the trip, not before', async () => {
    await Booking.collection.insertMany([
      bookingDoc(ALPHA, 'SS-YESTERDAY', 'yesterday@example.com', new Date(NOW.getTime() - 24 * HOUR)),
      bookingDoc(ALPHA, 'SS-LAST-MONTH', 'old@example.com', new Date(NOW.getTime() - 30 * 24 * HOUR)),
    ]);

    const result = await sweepBookingReminders(NOW);

    expect(result.thankYousSent).toBe(1);
    expect(recipients()).toEqual(['yesterday@example.com']);
    expect(subjects()[0]).toContain('Thank you');
  });

  it('never mails the same booking twice, however often the sweep runs', async () => {
    await Booking.collection.insertOne(bookingDoc(ALPHA, 'SS-ONCE', 'once@example.com', new Date(NOW.getTime() + 24 * HOUR)));

    await sweepBookingReminders(NOW);
    await sweepBookingReminders(NOW);
    await sweepBookingReminders(new Date(NOW.getTime() + HOUR));

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    expect(await EmailReceipt.countDocuments({ eventType: 'booking.reminder' })).toBe(1);
  });

  it('collapses two sweeps racing each other into one send per booking', async () => {
    await Booking.collection.insertOne(bookingDoc(ALPHA, 'SS-RACE', 'race@example.com', new Date(NOW.getTime() + 24 * HOUR)));
    await Promise.all([sweepBookingReminders(NOW), sweepBookingReminders(NOW), sweepBookingReminders(NOW)]);
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });

  it('stays completely off unless the flag is on', async () => {
    env.bookingRemindersEnabled = false;
    await Booking.collection.insertOne(bookingDoc(ALPHA, 'SS-OFF', 'off@example.com', new Date(NOW.getTime() + 24 * HOUR)));

    expect(await sweepBookingReminders(NOW)).toEqual({ remindersSent: 0, thankYousSent: 0, skipped: 0 });
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });
});

describe('the sweep is tenant-safe', () => {
  it('brands each booking from its own site and never crosses them', async () => {
    await Booking.collection.insertMany([
      bookingDoc(ALPHA, 'SS-A', 'guest-a@example.com', new Date(NOW.getTime() + 24 * HOUR)),
      bookingDoc(BETA, 'MH-B', 'guest-b@example.com', new Date(NOW.getTime() + 24 * HOUR)),
    ]);

    await sweepBookingReminders(NOW);

    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
    const byRecipient = Object.fromEntries(mockMessagesCreate.mock.calls.map((call) => [call[1].to[0], call[1]]));

    expect(byRecipient['guest-a@example.com'].from).toContain('Safari Sahara Hurghada');
    expect(byRecipient['guest-a@example.com'].html).not.toContain('Makadi Horse Club');
    expect(byRecipient['guest-a@example.com'].html).not.toContain('reservations@makadi.example');

    expect(byRecipient['guest-b@example.com'].from).toContain('Makadi Horse Club');
    expect(byRecipient['guest-b@example.com'].html).not.toContain('Safari Sahara Hurghada');
    expect(byRecipient['guest-b@example.com'].html).not.toContain('info@safari-sahara.example');
  });

  it('keeps one site’s receipt from suppressing another site’s identical booking id', async () => {
    const shared = new Types.ObjectId();
    await Booking.collection.insertMany([
      { ...bookingDoc(ALPHA, 'SS-SHARED', 'guest-a@example.com', new Date(NOW.getTime() + 24 * HOUR)), _id: shared },
      bookingDoc(BETA, 'MH-SHARED', 'guest-b@example.com', new Date(NOW.getTime() + 24 * HOUR)),
    ]);
    await sweepBookingReminders(NOW);
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
  });

  it('sends nothing for a booking whose site no longer exists, rather than using the platform brand', async () => {
    await Booking.collection.insertOne(
      bookingDoc(new Types.ObjectId(), 'ORPHAN-1', 'orphan@example.com', new Date(NOW.getTime() + 24 * HOUR))
    );
    const result = await sweepBookingReminders(NOW);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
    expect(result.skipped).toBeGreaterThan(0);
  });
});

describe('the sweep is safe to run', () => {
  it('skips cancelled and unconfirmed bookings', async () => {
    await Booking.collection.insertMany([
      { ...bookingDoc(ALPHA, 'SS-CANCELLED', 'cancelled@example.com', new Date(NOW.getTime() + 24 * HOUR)), status: 'cancelled' },
      { ...bookingDoc(ALPHA, 'SS-PENDING', 'pending@example.com', new Date(NOW.getTime() + 24 * HOUR)), status: 'pending' },
    ]);
    await sweepBookingReminders(NOW);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('leaves bundle component bookings to the bundle order', async () => {
    await Booking.collection.insertOne({
      ...bookingDoc(ALPHA, 'SS-BUNDLE', 'bundle@example.com', new Date(NOW.getTime() + 24 * HOUR)),
      bundleOrderId: new Types.ObjectId(),
    });
    await sweepBookingReminders(NOW);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('skips a booking with no guest address instead of throwing', async () => {
    await Booking.collection.insertMany([
      { ...bookingDoc(ALPHA, 'SS-NOEMAIL', '', new Date(NOW.getTime() + 24 * HOUR)) },
      bookingDoc(ALPHA, 'SS-OK', 'ok@example.com', new Date(NOW.getTime() + 24 * HOUR)),
    ]);
    const result = await sweepBookingReminders(NOW);
    expect(result.remindersSent).toBe(1);
    expect(recipients()).toEqual(['ok@example.com']);
  });

  it('keeps going when one booking’s send fails, and retries it next time', async () => {
    await Booking.collection.insertMany([
      bookingDoc(ALPHA, 'SS-FAIL', 'fail@example.com', new Date(NOW.getTime() + 24 * HOUR)),
      bookingDoc(ALPHA, 'SS-FINE', 'fine@example.com', new Date(NOW.getTime() + 24 * HOUR)),
    ]);
    mockMessagesCreate.mockRejectedValueOnce(new Error('mailgun 502'));

    const first = await sweepBookingReminders(NOW);
    expect(first.remindersSent).toBe(1); // the second one still went

    mockMessagesCreate.mockClear();
    const second = await sweepBookingReminders(NOW);
    expect(second.remindersSent).toBe(1); // the failed one is retried, the sent one is not
    expect(recipients()).toEqual(['fail@example.com']);
  });

  it('never throws out of the sweep', async () => {
    const broken = jest.spyOn(Booking, 'find').mockImplementation(() => {
      throw new Error('database unavailable');
    });
    await expect(sweepBookingReminders(NOW)).resolves.toEqual({ remindersSent: 0, thankYousSent: 0, skipped: 0 });
    broken.mockRestore();
  });
});
