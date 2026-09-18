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

// The provider must look configured, or every send short-circuits before the receipt logic.
process.env.MAILGUN_API_KEY = 'key-test';
process.env.MAILGUN_DOMAIN = 'mg.example.test';
process.env.MAILGUN_FROM_EMAIL = 'Attractions <noreply@mg.example.test>';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendEmailOnce, deliverEmail } = require('../services/email.service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EmailReceipt } = require('../models/EmailReceipt');

/**
 * The send-once guarantee is the unique (tenantId, dedupeKey) index, so these run against a real
 * mongod. `autoIndex` is deliberately OFF on the connection: the sender must build the index it
 * depends on by itself, exactly as it must in production, or the guard is a coin flip.
 */

const TENANT_A = new Types.ObjectId();
const TENANT_B = new Types.ObjectId();
const tenantA = { _id: TENANT_A, name: 'Safari Sahara', slug: 'safari-sahara', theme: { primaryColor: '#D4A843' } } as never;

let mongo: MongoMemoryReplSet;
let consoleSpies: jest.SpyInstance[] = [];

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
  await mongoose.connect(mongo.getUri('email_receipts'), { autoIndex: false });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  consoleSpies = (['info', 'warn', 'error'] as const).map((level) =>
    jest.spyOn(console, level).mockImplementation(() => undefined)
  );
  mockMessagesCreate.mockReset();
  mockMessagesCreate.mockResolvedValue({ id: '<queued@mg.example.test>', status: 200 });
  await EmailReceipt.collection.deleteMany({}).catch(() => undefined);
});

afterEach(() => consoleSpies.forEach((spy) => spy.mockRestore()));

const message = (to = 'guest@example.com') => ({
  to,
  subject: 'Tomorrow · SS-10421',
  html: '<p>See you tomorrow</p>',
  text: 'See you tomorrow',
  tenant: tenantA,
});

describe('event-triggered email is sent once per event', () => {
  it('sends the first time and suppresses every retry of the same event', async () => {
    const claim = { dedupeKey: 'booking.reminder:bk-1', eventType: 'booking.reminder', tenantId: TENANT_A };

    expect(await sendEmailOnce(claim, message())).toEqual({ status: 'sent' });
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await sendEmailOnce(claim, message())).toEqual({ status: 'duplicate' });
    }
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    expect(await EmailReceipt.countDocuments({ dedupeKey: claim.dedupeKey })).toBe(1);
  });

  it('builds its unique index itself, even though autoIndex is off', async () => {
    await sendEmailOnce({ dedupeKey: 'booking.reminder:bk-idx', eventType: 'booking.reminder', tenantId: TENANT_A }, message());
    const names = (await EmailReceipt.collection.indexes()).map((index: { name?: string }) => index.name);
    expect(names).toContain('tenantId_1_dedupeKey_1');
  });

  it('collapses concurrent sweeps of the same booking into one send', async () => {
    const claim = { dedupeKey: 'booking.reminder:bk-race', eventType: 'booking.reminder', tenantId: TENANT_A };
    const results = await Promise.all(Array.from({ length: 8 }, () => sendEmailOnce(claim, message())));

    expect(results.filter((result) => result.status === 'sent')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'duplicate')).toHaveLength(7);
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });

  it('scopes the receipt to the tenant, so one site cannot suppress another site’s mail', async () => {
    const key = 'booking.reminder:shared-id';
    expect(await sendEmailOnce({ dedupeKey: key, eventType: 'booking.reminder', tenantId: TENANT_A }, message())).toEqual({ status: 'sent' });
    expect(await sendEmailOnce({ dedupeKey: key, eventType: 'booking.reminder', tenantId: TENANT_B }, message())).toEqual({ status: 'sent' });
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
    expect(await EmailReceipt.countDocuments({ dedupeKey: key })).toBe(2);
  });

  it('keeps different events on the same booking independent', async () => {
    await sendEmailOnce({ dedupeKey: 'booking.reminder:bk-2', eventType: 'booking.reminder', tenantId: TENANT_A }, message());
    await sendEmailOnce({ dedupeKey: 'booking.thankyou:bk-2', eventType: 'booking.thankyou', tenantId: TENANT_A }, message());
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
  });

  it('releases the claim when the provider fails, so the next sweep retries', async () => {
    const claim = { dedupeKey: 'booking.reminder:bk-3', eventType: 'booking.reminder', tenantId: TENANT_A };
    mockMessagesCreate.mockRejectedValueOnce(new Error('mailgun 502'));

    expect(await sendEmailOnce(claim, message())).toEqual({ status: 'failed' });
    expect(await EmailReceipt.countDocuments({ dedupeKey: claim.dedupeKey })).toBe(0);

    expect(await sendEmailOnce(claim, message())).toEqual({ status: 'sent' });
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
  });

  it('records the outcome without ever storing the recipient address', async () => {
    await sendEmailOnce({ dedupeKey: 'booking.reminder:bk-4', eventType: 'booking.reminder', tenantId: TENANT_A }, message('nadia.visitor@example.com'));
    const receipt = await EmailReceipt.findOne({ dedupeKey: 'booking.reminder:bk-4' }).lean();
    expect(receipt).toMatchObject({ status: 'sent', eventType: 'booking.reminder' });
    expect(receipt?.sentAt).toBeInstanceOf(Date);
    expect(receipt?.recipientHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(receipt)).not.toContain('nadia.visitor@example.com');
  });
});

describe('a send never breaks the operation that triggered it', () => {
  it('returns failed instead of throwing when the provider throws', async () => {
    mockMessagesCreate.mockRejectedValueOnce(new Error('mailgun exploded'));
    await expect(deliverEmail('booking.confirmation', message())).resolves.toEqual({ status: 'failed' });
  });

  it('returns failed instead of throwing when the recipient is unusable', async () => {
    await expect(deliverEmail('booking.confirmation', message('not-an-address'))).resolves.toEqual({ status: 'failed' });
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('never writes the full address into a log line', async () => {
    mockMessagesCreate.mockRejectedValueOnce(new Error('mailgun exploded'));
    await deliverEmail('booking.confirmation', message('nadia.visitor@example.com'));
    const logged = JSON.stringify((console.error as jest.Mock).mock.calls);
    expect(logged).toContain('booking.confirmation');
    expect(logged).not.toContain('nadia.visitor@example.com');
  });

  it('suppresses the send rather than double-mailing when the receipt store is unavailable', async () => {
    const broken = jest.spyOn(EmailReceipt, 'create').mockRejectedValueOnce(new Error('replica set unavailable'));
    await expect(
      sendEmailOnce({ dedupeKey: 'booking.reminder:bk-5', eventType: 'booking.reminder', tenantId: TENANT_A }, message())
    ).resolves.toEqual({ status: 'failed' });
    expect(mockMessagesCreate).not.toHaveBeenCalled();
    broken.mockRestore();
  });
});
