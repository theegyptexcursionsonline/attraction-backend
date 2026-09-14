import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import contactRoutes from '../routes/contact.routes';
import { Tenant } from '../models/Tenant';
import { ContactMessage } from '../models/ContactMessage';
import { env } from '../config/env';

// The real routes, validators, controllers, email renderer and MongoDB writes run
// here. Only two things are replaced: authentication (covered elsewhere) and the
// Mailgun transport, which is a jest.fn — nothing in this file can send email.
jest.mock('mailgun.js', () => {
  const create = jest.fn();
  class MailgunStub {
    client() {
      return { messages: { create } };
    }
  }
  return { __esModule: true, default: MailgunStub, mockMessagesCreate: create };
});

jest.mock('../config/env', () => {
  const actual = jest.requireActual('../config/env');
  return {
    ...actual,
    env: {
      ...actual.env,
      mailgunApiKey: 'test-only-not-a-key',
      mailgunDomain: 'mg.example.test',
      mailgunFromEmail: 'Sites <noreply@mg.example.test>',
    },
  };
});

jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
  authenticate: (req: any, res: any, next: any) => {
    const role = req.header('x-test-role');
    if (!role) return res.status(401).json({ success: false, error: 'Authentication required' });
    const userId = req.header('x-test-user');
    req.user = {
      ...(userId ? { _id: new (jest.requireActual('mongoose').Types.ObjectId)(userId) } : {}),
      role,
      assignedTenants: req.header('x-test-assigned')?.split(',').filter(Boolean) || [],
    };
    next();
  },
}));

const mockMessagesCreate: jest.Mock = jest.requireMock('mailgun.js').mockMessagesCreate;

jest.setTimeout(180_000);

const app = express();
app.use(express.json());
app.use('/contact', contactRoutes);
app.use((error: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));

const owner = new Types.ObjectId();
const other = new Types.ObjectId();
const quiet = new Types.ObjectId(); // a live site with no contact inbox configured
const adminUser = new Types.ObjectId();
const REFERENCE = /^MSG-[0-9A-HJKMNP-TV-Z]{6}$/;

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
  // autoIndex off: the contact route must build the indexes its idempotency
  // guarantee depends on by itself, whatever the connection settings.
  await mongoose.connect(mongo.getUri('contact_messages'), { autoIndex: false });
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
  await Tenant.collection.deleteMany({});
  await ContactMessage.collection.deleteMany({}).catch(() => undefined);
  await Tenant.collection.insertMany([
    { _id: owner, slug: 'owner-site', domain: 'owner-site.invalid', name: 'Owner Site', status: 'active', contactInfo: { email: 'Help@Owner-Site.example' }, theme: { primaryColor: '#123456' } },
    { _id: other, slug: 'other-site', domain: 'other-site.invalid', name: 'Other Site', status: 'active', contactInfo: { email: 'hello@other-site.example' } },
    { _id: quiet, slug: 'quiet-site', domain: 'quiet-site.invalid', name: 'Quiet Site', status: 'active', contactInfo: { phone: '+20 100 000 0000' } },
    { _id: new Types.ObjectId(), slug: 'pending-site', domain: 'pending-site.invalid', name: 'Pending Site', status: 'pending', contactInfo: { email: 'p@pending.example' } },
  ]);
});

afterEach(() => {
  consoleSpies.forEach((spy) => spy.mockRestore());
});

const fullEnquiry = (overrides: Record<string, unknown> = {}) => ({
  requestId: randomUUID(),
  name: 'Nadia Visitor',
  email: 'Nadia.Visitor@Example.COM',
  phone: '+20 (100) 555-0101',
  tourSlug: 'sunset-horse-ride',
  tourTitle: 'Sunset Horse Ride',
  travelDate: '2026-10-05',
  guests: 3,
  message: 'Is hotel pickup included?\nWe have a child aged 6.',
  pagePath: '/tours/sunset-horse-ride?ref=home',
  locale: 'en',
  website: '',
  ...overrides,
});

const submit = (body: unknown, tenant: string | null = 'owner-site') => {
  const req = request(app).post('/contact');
  return tenant ? req.set('X-Tenant-ID', tenant).send(body as object) : req.send(body as object);
};

const asRole = (role: string, assigned: Types.ObjectId[] = [owner]) => ({
  'x-test-role': role,
  'x-test-assigned': assigned.map(String).join(','),
  'x-test-user': String(adminUser),
});

const list = (query: Record<string, unknown>, role = 'brand-admin', assigned: Types.ObjectId[] = [owner]) =>
  request(app).get('/contact/messages').query(query).set(asRole(role, assigned));

const patchStatus = (id: unknown, body: unknown, role = 'brand-admin', assigned: Types.ObjectId[] = [owner]) =>
  request(app).patch(`/contact/messages/${id}`).set(asRole(role, assigned)).send(body as object);

let seedCounter = 0;
const seedMessages = async (tenantId: Types.ObjectId, count: number, status: 'new' | 'handled' | 'archived' = 'new') => {
  const docs = Array.from({ length: count }, () => {
    seedCounter += 1;
    return {
      tenantId,
      reference: `MSG-${String(seedCounter).padStart(6, '0')}`,
      name: `Visitor ${seedCounter}`,
      email: `visitor${seedCounter}@example.com`,
      message: `Seeded message ${seedCounter}`,
      status,
      ...(status === 'handled' ? { handledAt: new Date('2026-09-01T10:00:00Z'), handledBy: adminUser } : {}),
      delivery: { status: 'sent', attemptedAt: new Date(), sentAt: new Date() },
    };
  });
  const inserted = await ContactMessage.insertMany(docs);
  return inserted.map((doc) => doc._id);
};

const indexList = async () => ContactMessage.collection.indexes().catch(() => [] as Array<Record<string, unknown>>);

// ---------------------------------------------------------------------------
// Index bootstrap — runs first, against a collection that does not exist yet.
// ---------------------------------------------------------------------------

it('builds its own unique indexes before the first write and recovers after a failed attempt', async () => {
  expect((await indexList()).map((index) => index.name)).not.toContain('tenantId_1_requestId_1');

  const failedBuild = jest.spyOn(ContactMessage, 'createIndexes').mockRejectedValueOnce(new Error('index build unavailable'));
  await submit(fullEnquiry()).expect(500);
  failedBuild.mockRestore();
  expect(await ContactMessage.countDocuments({})).toBe(0);
  expect(mockMessagesCreate).not.toHaveBeenCalled();

  await submit(fullEnquiry()).expect(201);
  expect(await indexList()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        key: { tenantId: 1, requestId: 1 },
        unique: true,
        partialFilterExpression: { requestId: { $type: 'string' } },
      }),
      expect.objectContaining({ key: { tenantId: 1, reference: 1 }, unique: true }),
      expect.objectContaining({ key: { tenantId: 1, status: 1, _id: -1 } }),
    ])
  );
});

describe('POST /contact', () => {
  it('stores the enquiry before emailing the site inbox, then records the sent outcome', async () => {
    const body = fullEnquiry();
    let storedAtSendTime: any = null;
    mockMessagesCreate.mockImplementationOnce(async () => {
      storedAtSendTime = await ContactMessage.findOne({ tenantId: owner, requestId: body.requestId }).lean();
      return { id: 'queued', status: 200 };
    });

    const response = await submit(body).expect(201);
    expect(response.body).toEqual({
      success: true,
      data: { reference: expect.stringMatching(REFERENCE), received: true },
      message: 'Message received',
    });
    const { reference } = response.body.data;

    expect(storedAtSendTime).toMatchObject({ reference, delivery: { status: 'pending' } });

    const stored = await ContactMessage.findOne({ reference }).lean();
    expect(stored).toMatchObject({
      tenantId: owner,
      requestId: body.requestId,
      reference,
      name: 'Nadia Visitor',
      email: 'nadia.visitor@example.com',
      phone: '+20 (100) 555-0101',
      tourSlug: 'sunset-horse-ride',
      tourTitle: 'Sunset Horse Ride',
      travelDate: '2026-10-05',
      guests: 3,
      message: 'Is hotel pickup included?\nWe have a child aged 6.',
      pagePath: '/tours/sunset-horse-ride?ref=home',
      locale: 'en',
      status: 'new',
      delivery: { status: 'sent' },
    });
    expect(stored?.delivery.sentAt).toBeInstanceOf(Date);
    expect(stored?.delivery.attemptedAt).toBeInstanceOf(Date);
    expect(stored?.delivery.reason).toBeUndefined();
    expect(stored).not.toHaveProperty('website');

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    const [domain, mail] = mockMessagesCreate.mock.calls[0];
    expect(domain).toBe('mg.example.test');
    expect(mail.to).toEqual(['help@owner-site.example']);
    expect(mail.subject).toBe(`New enquiry ${reference}: Sunset Horse Ride`);
    expect(mail['h:Reply-To']).toBe('nadia.visitor@example.com');
    expect(mail.from).toBe('Owner Site <noreply@mg.example.test>');
    for (const field of [
      reference, 'Nadia Visitor', 'nadia.visitor@example.com', '+20 (100) 555-0101', 'Sunset Horse Ride',
      '2026-10-05', '>3<', 'Is hotel pickup included?<br>We have a child aged 6.', '/tours/sunset-horse-ride?ref=home', '#123456',
    ]) {
      expect(mail.html).toContain(field);
    }
  });

  it('escapes visitor markup in the operator email and strips header injection from the subject', async () => {
    const attack = '<img src=x onerror="alert(1)">';
    const response = await submit(
      fullEnquiry({ name: attack, tourTitle: 'Tour\r\nBcc: victim@example.com', message: attack, pagePath: attack })
    ).expect(400);
    // Control characters in single-line fields are rejected outright.
    expect(response.body.errors.map((e: any) => e.field)).toContain('tourTitle');

    await submit(fullEnquiry({ name: attack, tourTitle: attack, message: attack, pagePath: attack })).expect(201);
    const mail = mockMessagesCreate.mock.calls[0][1];
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it('still accepts the legacy first/last name shape and stores it', async () => {
    const response = await submit({
      firstName: 'Guest',
      lastName: 'User',
      email: 'guest@example.com',
      subject: 'Private tour',
      message: 'Please share availability.',
    }).expect(201);
    const { reference } = response.body.data;
    expect(reference).toMatch(REFERENCE);
    const stored = await ContactMessage.findOne({ reference }).lean();
    expect(stored).toMatchObject({
      tenantId: owner, name: 'Guest User', email: 'guest@example.com', subject: 'Private tour',
      message: 'Please share availability.', delivery: { status: 'sent' },
    });
    expect(stored?.requestId).toBeUndefined();
    expect(mockMessagesCreate.mock.calls[0][1].subject).toBe(`New enquiry ${reference}: Private tour`);

    // Legacy forms keep their required fields.
    await submit({ firstName: 'Guest', lastName: 'User', email: 'guest@example.com', message: 'No subject' }).expect(400);
    await submit({ firstName: 'G'.repeat(80), lastName: 'U'.repeat(80), email: 'guest@example.com', subject: 'Long', message: 'Hi' }).expect(400);
    expect(await ContactMessage.countDocuments({})).toBe(1);
    // A blank "name" alongside first/last name is still the legacy shape.
    await submit({ name: '', firstName: 'Second', lastName: 'Guest', email: 'second@example.com', subject: 'Hi', message: 'Hello' }).expect(201);
    expect(await ContactMessage.countDocuments({ name: 'Second Guest' })).toBe(1);
  });

  it('ignores server-owned fields a visitor tries to set', async () => {
    const response = await submit(
      fullEnquiry({
        reference: 'MSG-HACKED', status: 'handled', handledAt: '2026-01-01', handledBy: String(adminUser),
        delivery: { status: 'sent', sentAt: '2026-01-01' }, createdAt: '2000-01-01',
      })
    ).expect(201);
    expect(response.body.data.reference).not.toBe('MSG-HACKED');
    const stored = await ContactMessage.findOne({ reference: response.body.data.reference }).lean();
    expect(stored).toMatchObject({ tenantId: owner, status: 'new', delivery: { status: 'sent' } });
    expect(stored).not.toHaveProperty('handledAt');
    expect(stored).not.toHaveProperty('handledBy');
    expect(stored?.createdAt.getUTCFullYear()).toBeGreaterThan(2000);
  });

  it('treats blank optional fields as absent and accepts numeric-string guests', async () => {
    const response = await submit(
      fullEnquiry({ requestId: '', phone: '', tourSlug: null, tourTitle: '  ', travelDate: '', guests: '4', pagePath: '', locale: '' })
    ).expect(201);
    const stored = await ContactMessage.findOne({ reference: response.body.data.reference }).lean();
    expect(stored?.guests).toBe(4);
    for (const absent of ['requestId', 'phone', 'tourSlug', 'tourTitle', 'travelDate', 'pagePath', 'locale']) {
      expect(stored).not.toHaveProperty(absent);
    }
    expect(mockMessagesCreate.mock.calls[0][1].subject).toBe(`New enquiry ${response.body.data.reference}: Website message`);
  });

  it('returns the same reference for a sequential retry with the same requestId, storing and emailing once', async () => {
    const body = fullEnquiry();
    const first = await submit(body).expect(201);
    const retry = await submit(body).expect(200);
    const retryWithEditedText = await submit({ ...body, message: 'Edited while retrying' }).expect(200);

    expect(retry.body).toEqual({ success: true, data: { reference: first.body.data.reference, received: true }, message: 'Message received' });
    expect(retryWithEditedText.body.data.reference).toBe(first.body.data.reference);
    expect(await ContactMessage.countDocuments({ tenantId: owner, requestId: body.requestId })).toBe(1);
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent double-submits with the same requestId into one message and one email', async () => {
    const body = fullEnquiry();
    const responses = await Promise.all(Array.from({ length: 6 }, () => submit(body)));

    const references = new Set(responses.map((response) => response.body.data?.reference));
    expect(references.size).toBe(1);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 200, 200, 200, 201]);
    expect(await ContactMessage.countDocuments({ requestId: body.requestId })).toBe(1);
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });

  it('scopes the idempotency key to the site, so the same key on another site is a separate message', async () => {
    const body = fullEnquiry();
    const onOwner = await submit(body, 'owner-site').expect(201);
    const onOther = await submit(body, 'other-site').expect(201);
    expect(onOther.body.data.reference).not.toBe(onOwner.body.data.reference);
    expect(await ContactMessage.countDocuments({ requestId: body.requestId })).toBe(2);
    expect(mockMessagesCreate.mock.calls.map((call) => call[1].to[0])).toEqual([
      'help@owner-site.example',
      'hello@other-site.example',
    ]);
  });

  it('answers a filled honeypot exactly like success while storing and sending nothing', async () => {
    for (const body of [fullEnquiry({ website: 'https://spam.example' }), { website: 'x', email: 'not-an-email' }]) {
      const response = await submit(body).expect(201);
      expect(response.body).toEqual({
        success: true,
        data: { reference: expect.stringMatching(REFERENCE), received: true },
        message: 'Message received',
      });
    }
    expect(await ContactMessage.countDocuments({})).toBe(0);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['a malformed email', { email: 'not-an-email' }],
    ['an email with spaces', { email: 'nadia visitor@example.com' }],
    ['a message over 5000 characters', { message: 'x'.repeat(5001) }],
    ['a whitespace-only message', { message: '   ' }],
    ['a missing message', { message: undefined }],
    ['a missing name', { name: undefined }],
    ['a name over 120 characters', { name: 'n'.repeat(121) }],
    ['zero guests', { guests: 0 }],
    ['61 guests', { guests: 61 }],
    ['fractional guests', { guests: 2.5 }],
    ['non-numeric guests', { guests: 'three' }],
    ['an impossible travel date', { travelDate: '2026-02-30' }],
    ['a non-ISO travel date', { travelDate: '05/10/2026' }],
    ['phone letters', { phone: 'call me maybe' }],
    ['phone over 40 characters', { phone: '1'.repeat(41) }],
    ['a non-UUID requestId', { requestId: 'retry-1' }],
    ['an operator object in place of text', { email: { $gt: '' } }],
    ['a page path over 300 characters', { pagePath: `/${'p'.repeat(300)}` }],
    ['a locale over 10 characters', { locale: 'en-GB-oxendict' }],
    ['a tour title over 200 characters', { tourTitle: 't'.repeat(201) }],
    ['a non-string honeypot value', { website: { url: 'x' } }],
  ])('rejects %s with 400 and stores nothing', async (_label, overrides) => {
    const response = await submit(fullEnquiry(overrides)).expect(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid contact form data');
    expect(Array.isArray(response.body.errors)).toBe(true);
    expect(await ContactMessage.countDocuments({})).toBe(0);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('rejects unknown, unpublished and missing site context, and never trusts a tenant in the body', async () => {
    const unknown = await submit(fullEnquiry(), 'no-such-site').expect(404);
    expect(unknown.body.error).toBe('Tenant not found');
    await submit(fullEnquiry(), 'pending-site').expect(404);
    const missing = await submit(fullEnquiry({ tenantId: String(owner), tenant: 'owner-site' }), null).expect(400);
    expect(missing.body.error).toBe('Tenant context required');
    expect(await ContactMessage.countDocuments({})).toBe(0);

    const response = await submit(fullEnquiry({ tenantId: String(other) }), 'owner-site').expect(201);
    expect((await ContactMessage.findOne({ reference: response.body.data.reference }).lean())?.tenantId).toEqual(owner);
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    expect(mockMessagesCreate.mock.calls[0][1].to).toEqual(['help@owner-site.example']);
  });

  it('keeps the message and records provider_error when the mail provider throws', async () => {
    mockMessagesCreate.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden: domain mg.example.test rejected help@owner-site.example'), { status: 401 })
    );
    const response = await submit(fullEnquiry()).expect(201);
    const stored = await ContactMessage.findOne({ reference: response.body.data.reference }).lean();
    expect(stored?.delivery).toMatchObject({ status: 'failed', reason: 'provider_error' });
    expect(stored?.delivery.attemptedAt).toBeInstanceOf(Date);
    expect(stored?.delivery.sentAt).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain('Forbidden');

    const errorLog = consoleSpies[2].mock.calls.find((call) => String(call[0]).includes('notification failed'));
    expect(errorLog).toBeDefined();
    expect(JSON.stringify(errorLog)).toContain('"status":401');
    expect(JSON.stringify(errorLog)).not.toContain('help@owner-site.example');
  });

  it('keeps the message and records no_recipient when the site has no valid contact inbox', async () => {
    const response = await submit(fullEnquiry(), 'quiet-site').expect(201);
    const stored = await ContactMessage.findOne({ reference: response.body.data.reference }).lean();
    expect(stored).toMatchObject({ tenantId: quiet, delivery: { status: 'failed', reason: 'no_recipient' } });
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('keeps the message and records skipped when the mail provider is not configured', async () => {
    const configuredDomain = env.mailgunDomain;
    env.mailgunDomain = '';
    try {
      const response = await submit(fullEnquiry()).expect(201);
      const stored = await ContactMessage.findOne({ reference: response.body.data.reference }).lean();
      expect(stored?.delivery).toMatchObject({ status: 'skipped', reason: 'provider_not_configured' });
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    } finally {
      env.mailgunDomain = configuredDomain;
    }
  });

  it('does not acknowledge an enquiry the database failed to store, and a retry succeeds', async () => {
    const body = fullEnquiry();
    const failedWrite = jest.spyOn(ContactMessage, 'create').mockRejectedValueOnce(new Error('database unavailable'));
    await submit(body).expect(500);
    failedWrite.mockRestore();
    expect(await ContactMessage.countDocuments({})).toBe(0);
    expect(mockMessagesCreate).not.toHaveBeenCalled();

    await submit(body).expect(201);
    expect(await ContactMessage.countDocuments({ requestId: body.requestId })).toBe(1);
  });

  it('still answers 201 when only the delivery bookkeeping write fails, leaving the message visibly pending', async () => {
    const failedBookkeeping = jest.spyOn(ContactMessage, 'updateOne').mockRejectedValueOnce(new Error('write concern timeout'));
    const response = await submit(fullEnquiry()).expect(201);
    failedBookkeeping.mockRestore();
    const stored = await ContactMessage.findOne({ reference: response.body.data.reference }).lean();
    expect(stored?.delivery.status).toBe('pending');
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });

  it('retries with a fresh reference when a random reference collides', async () => {
    await ContactMessage.create({ tenantId: owner, reference: 'MSG-AAAAAA', name: 'Existing', email: 'e@example.com', message: 'Existing' });
    const crypto = jest.requireActual('crypto');
    const randomInt = jest.spyOn(crypto, 'randomInt');
    // First reference: all 'A' (index 10) → collides. Afterwards real randomness.
    for (let index = 0; index < 6; index += 1) randomInt.mockImplementationOnce(() => 10);
    try {
      const response = await submit(fullEnquiry()).expect(201);
      expect(response.body.data.reference).not.toBe('MSG-AAAAAA');
      expect(randomInt).toHaveBeenCalledTimes(12); // one colliding reference, then a fresh one
      expect(await ContactMessage.countDocuments({ tenantId: owner })).toBe(2);
    } finally {
      randomInt.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Admin inbox
// ---------------------------------------------------------------------------

describe('GET /contact/messages', () => {
  it.each([
    ['brand-admin assigned to the site', 200, 'brand-admin', [owner]],
    ['manager assigned to the site', 200, 'manager', [owner]],
    ['super-admin without assignments', 200, 'super-admin', []],
    ['brand-admin of another site', 403, 'brand-admin', [other]],
    ['brand-admin with no assignments', 403, 'brand-admin', []],
    ['manager of another site', 403, 'manager', [other]],
    ['editor assigned to the site', 403, 'editor', [owner]],
    ['viewer assigned to the site', 403, 'viewer', [owner]],
    ['customer', 403, 'customer', [owner]],
  ] as const)('%s → %i', async (_label, expected, role, assigned) => {
    await seedMessages(owner, 2);
    const response = await list({ tenantId: String(owner) }, role, [...assigned]).expect(expected);
    if (expected === 200) {
      expect(response.body.data.messages).toHaveLength(2);
    } else {
      expect(response.body.data).toBeUndefined();
      expect(response.body.error).toBe(role === 'editor' || role === 'viewer' || role === 'customer'
        ? 'Insufficient permissions'
        : 'Access denied to this tenant');
    }
  });

  it('rejects unauthenticated reads', async () => {
    await request(app).get('/contact/messages').query({ tenantId: String(owner) }).expect(401);
  });

  it('filters by status, reports counts for the site only, and never leaks another site', async () => {
    await seedMessages(owner, 3, 'new');
    await seedMessages(owner, 2, 'handled');
    await seedMessages(owner, 1, 'archived');
    const foreign = await seedMessages(other, 4, 'new');

    const byDefault = await list({ tenantId: String(owner) }).expect(200);
    expect(byDefault.body.data.messages).toHaveLength(3);
    expect(byDefault.body.data.messages.every((m: any) => m.status === 'new')).toBe(true);
    expect(byDefault.body.data.counts).toEqual({ new: 3, handled: 2, archived: 1 });
    expect(byDefault.body.data.nextCursor).toBeNull();

    const handled = await list({ tenantId: String(owner), status: 'handled' }).expect(200);
    expect(handled.body.data.messages.map((m: any) => m.status)).toEqual(['handled', 'handled']);
    const archived = await list({ tenantId: String(owner), status: 'archived' }).expect(200);
    expect(archived.body.data.messages).toHaveLength(1);
    const all = await list({ tenantId: String(owner), status: 'all' }).expect(200);
    expect(all.body.data.messages).toHaveLength(6);

    const foreignIds = new Set(foreign.map(String));
    for (const response of [byDefault, handled, archived, all]) {
      expect(response.body.data.messages.some((m: any) => foreignIds.has(m.id))).toBe(false);
    }
    const otherInbox = await list({ tenantId: String(other) }, 'super-admin', []).expect(200);
    expect(otherInbox.body.data.counts).toEqual({ new: 4, handled: 0, archived: 0 });
  });

  it('pages newest-first through the database until the tail, with nextCursor null on the last page', async () => {
    const ids = (await seedMessages(owner, 45)).map(String);
    await seedMessages(owner, 3, 'handled'); // other statuses never bleed into the page
    const expectedOrder = [...ids].sort().reverse();

    const seen: string[] = [];
    let cursor: string | null | undefined;
    const pageSizes: number[] = [];
    do {
      const response = await list({ tenantId: String(owner), limit: 20, ...(cursor ? { cursor } : {}) }).expect(200);
      pageSizes.push(response.body.data.messages.length);
      seen.push(...response.body.data.messages.map((m: any) => m.id));
      cursor = response.body.data.nextCursor;
    } while (cursor);

    expect(pageSizes).toEqual([20, 20, 5]);
    expect(seen).toEqual(expectedOrder);
    expect(new Set(seen).size).toBe(45);
  });

  it('declares and honours every query field (limit, cursor, status, tenantId case)', async () => {
    const ids = (await seedMessages(owner, 5)).map(String).sort().reverse();
    const firstTwo = await list({ tenantId: String(owner).toUpperCase(), limit: '2' }).expect(200);
    expect(firstTwo.body.data.messages.map((m: any) => m.id)).toEqual(ids.slice(0, 2));
    expect(firstTwo.body.data.nextCursor).toBe(ids[1]);

    const rest = await list({ tenantId: String(owner), limit: '50', cursor: firstTwo.body.data.nextCursor }).expect(200);
    expect(rest.body.data.messages.map((m: any) => m.id)).toEqual(ids.slice(2));
    expect(rest.body.data.nextCursor).toBeNull();

    const exactPage = await list({ tenantId: String(owner), limit: 5 }).expect(200);
    expect(exactPage.body.data.messages).toHaveLength(5);
    expect(exactPage.body.data.nextCursor).toBeNull();

    const defaultLimit = await seedMessages(owner, 20);
    expect(defaultLimit).toHaveLength(20);
    const byDefault = await list({ tenantId: String(owner) }).expect(200);
    expect(byDefault.body.data.messages).toHaveLength(20);
    expect(byDefault.body.data.nextCursor).not.toBeNull();
  });

  it.each([
    ['missing tenantId', {}],
    ['malformed tenantId', { tenantId: 'owner-site' }],
    ['operator tenantId', { 'tenantId[$ne]': 'x' }],
    ['unknown status', { tenantId: String(owner), status: 'deleted' }],
    ['limit 0', { tenantId: String(owner), limit: 0 }],
    ['limit 51', { tenantId: String(owner), limit: 51 }],
    ['non-numeric limit', { tenantId: String(owner), limit: 'ten' }],
    ['malformed cursor', { tenantId: String(owner), cursor: 'abc' }],
  ])('rejects %s with 400', async (_label, query) => {
    const response = await list(query).expect(400);
    expect(response.body.error).toBe('Query validation failed');
  });

  it('returns the documented message shape', async () => {
    const created = await submit(fullEnquiry()).expect(201);
    const response = await list({ tenantId: String(owner) }).expect(200);
    const [message] = response.body.data.messages;
    expect(Object.keys(message).sort()).toEqual([
      'createdAt', 'delivery', 'email', 'guests', 'handledAt', 'id', 'locale', 'message', 'name', 'pagePath',
      'phone', 'reference', 'status', 'subject', 'tourSlug', 'tourTitle', 'travelDate',
    ]);
    expect(message).toMatchObject({
      reference: created.body.data.reference,
      name: 'Nadia Visitor',
      email: 'nadia.visitor@example.com',
      phone: '+20 (100) 555-0101',
      subject: null,
      tourSlug: 'sunset-horse-ride',
      tourTitle: 'Sunset Horse Ride',
      travelDate: '2026-10-05',
      guests: 3,
      pagePath: '/tours/sunset-horse-ride?ref=home',
      locale: 'en',
      status: 'new',
      handledAt: null,
      delivery: { status: 'sent', reason: null, sentAt: expect.any(String) },
      createdAt: expect.any(String),
    });
    expect(Object.keys(message.delivery).sort()).toEqual(['reason', 'sentAt', 'status']);
    expect(JSON.stringify(response.body)).not.toMatch(/requestId|tenantId|handledBy|__v/);
  });
});

describe('PATCH /contact/messages/:id', () => {
  it('moves a message through handled, archived and back to new, setting and clearing handled metadata', async () => {
    const [id] = await seedMessages(owner, 1);

    const handled = await patchStatus(id, { status: 'handled' }).expect(200);
    expect(handled.body.data).toMatchObject({ id: String(id), status: 'handled', handledAt: expect.any(String) });
    let stored = await ContactMessage.findById(id).lean();
    expect(stored?.handledBy).toEqual(adminUser);
    const handledAt = stored?.handledAt?.toISOString();

    const again = await patchStatus(id, { status: 'handled' }).expect(200);
    expect(again.body.data.handledAt).toBe(handledAt);

    const archived = await patchStatus(id, { status: 'archived' }, 'manager').expect(200);
    expect(archived.body.data).toMatchObject({ status: 'archived', handledAt });

    const reopened = await patchStatus(id, { status: 'new' }).expect(200);
    expect(reopened.body.data).toMatchObject({ status: 'new', handledAt: null });
    stored = await ContactMessage.findById(id).lean();
    expect(stored).not.toHaveProperty('handledAt');
    expect(stored).not.toHaveProperty('handledBy');

    const list200 = await list({ tenantId: String(owner) }).expect(200);
    expect(Object.keys(reopened.body.data).sort()).toEqual(Object.keys(list200.body.data.messages[0]).sort());
  });

  it('stamps handled metadata once under concurrent identical updates', async () => {
    const [id] = await seedMessages(owner, 1);
    const responses = await Promise.all(Array.from({ length: 5 }, () => patchStatus(id, { status: 'handled' })));
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const stamps = new Set(responses.map((r) => r.body.data.handledAt));
    expect(stamps.size).toBe(1);
    expect((await ContactMessage.findById(id).lean())?.handledAt?.toISOString()).toBe([...stamps][0]);
  });

  it('returns an indistinguishable 404 for foreign, missing and malformed ids without writing', async () => {
    const [foreignId] = await seedMessages(other, 1);
    const foreign = await patchStatus(foreignId, { status: 'handled', tenantId: String(other) }).expect(404);
    const missing = await patchStatus(new Types.ObjectId(), { status: 'handled' }).expect(404);
    const malformed = await patchStatus('not-an-id', { status: 'handled' }).expect(404);
    const unassigned = await patchStatus(foreignId, { status: 'handled' }, 'brand-admin', []).expect(404);
    for (const response of [foreign, missing, malformed, unassigned]) {
      expect(response.body).toEqual({ success: false, error: 'Message not found' });
    }
    const untouched = await ContactMessage.findById(foreignId).lean();
    expect(untouched?.status).toBe('new');
    expect(untouched).not.toHaveProperty('handledAt');

    await patchStatus(foreignId, { status: 'handled' }, 'super-admin', []).expect(200);
    expect((await ContactMessage.findById(foreignId).lean())?.status).toBe('handled');
  });

  it.each([
    ['an unknown status', { status: 'deleted' }],
    ['a missing status', {}],
    ['an operator object', { status: { $ne: 'new' } }],
    ['a non-string status', { status: 1 }],
  ])('rejects %s with 400 and no write', async (_label, body) => {
    const [id] = await seedMessages(owner, 1);
    await patchStatus(id, body).expect(400);
    expect((await ContactMessage.findById(id).lean())?.status).toBe('new');
  });

  it.each(['editor', 'viewer', 'customer'])('rejects the %s role with 403 and no write', async (role) => {
    const [id] = await seedMessages(owner, 1);
    await patchStatus(id, { status: 'handled' }, role).expect(403);
    expect((await ContactMessage.findById(id).lean())?.status).toBe('new');
  });

  it('rejects unauthenticated updates', async () => {
    const [id] = await seedMessages(owner, 1);
    await request(app).patch(`/contact/messages/${id}`).send({ status: 'handled' }).expect(401);
    expect((await ContactMessage.findById(id).lean())?.status).toBe('new');
  });
});
