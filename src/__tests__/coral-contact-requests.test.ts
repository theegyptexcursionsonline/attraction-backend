import express from 'express';
import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from '../test/loopbackRequest';
import contactRoutes from '../routes/contact.routes';
import { ContactMessage } from '../models/ContactMessage';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { generateAccessToken } from '../utils/jwt';
import { coralRequestDateIsPast } from '../controllers/contactRequests.controller';
import { sendContactFormEmail, sendEnquiryReceivedEmail } from '../services/email.service';

// Request persistence and real auth/RBAC run against MongoDB. All outbound mail functions
// are traps; the Coral route must not even attempt delivery, whatever the provider state.
jest.mock('../services/email.service', () => ({
  sendContactFormEmail: jest.fn(),
  sendEnquiryReceivedEmail: jest.fn(),
}));

jest.setTimeout(90_000);
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/contact', contactRoutes);
app.use((_error: Error, _req: any, res: any, _next: any) => res.status(500).json({ success: false, error: 'Request could not be saved' }));

const coralId = new Types.ObjectId();
const otherId = new Types.ObjectId();
const referencePattern = /^MSG-[0-9A-HJKMNP-TV-Z]{6}$/;
const mail = sendContactFormEmail as jest.Mock;
const acknowledgement = sendEnquiryReceivedEmail as jest.Mock;
let mongo: MongoMemoryServer;

const submission = (overrides: Record<string, unknown> = {}) => ({
  requestId: randomUUID(), experience: 'horse-riding',
  travelDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
  adults: 2, children: 1, pickupArea: 'hurghada', hotel: 'Selected hotel',
  name: 'Egypt Excursions Online QA', email: 'theegyptexcursionsonline@gmail.com',
  phone: '+20 100 000 0000', notes: 'Please confirm the arrangements.', locale: 'en', ...overrides,
});

const submit = (body: unknown, tenant: string | null = 'coral-safari-hurghada') => {
  const call = request(app).post('/contact/requests');
  if (tenant) call.set('X-Tenant-ID', tenant);
  return call.send(body as object);
};

const principal = async (role: string, assigned: Types.ObjectId[] = [coralId]) => {
  const user = User.hydrate({
    _id: new Types.ObjectId(), role, status: 'active', assignedTenants: assigned,
    email: 'theegyptexcursionsonline@gmail.com', firstName: 'QA', lastName: 'Operator', tokenVersion: 0,
  });
  await User.collection.insertOne(user.toObject());
  return `Bearer ${generateAccessToken(user)}`;
};

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('coral_requests'), { autoIndex: false });
});

beforeEach(async () => {
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  mail.mockReset().mockResolvedValue({ status: 'sent' });
  acknowledgement.mockReset().mockResolvedValue({ status: 'sent' });
  await Promise.all([Tenant.collection.deleteMany({}), ContactMessage.collection.deleteMany({}), User.collection.deleteMany({})]);
  await Tenant.collection.insertMany([
    { _id: coralId, slug: 'coral-safari-hurghada', name: 'Coral Safari', domain: 'coralsafarihurghada.com', status: 'active',
      contactInfo: { email: 'theegyptexcursionsonline@gmail.com' }, notificationSettings: { contactCcEmails: ['theegyptexcursionsonline@gmail.com'] } },
    { _id: otherId, slug: 'other-site', name: 'Another site', domain: 'other-site.invalid', status: 'active', contactInfo: { email: 'theegyptexcursionsonline@gmail.com' } },
    { _id: new Types.ObjectId(), slug: 'coral-safari-hurghada-other', name: 'Coral Safari', domain: 'lookalike.invalid', status: 'active' },
  ]);
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

it('publishes exactly the three request types and four pickup choices without inventory or private fields', async () => {
  const response = await request(app).get('/contact/request-options').set('X-Tenant-ID', 'coral-safari-hurghada').expect(200);
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.body.data).toEqual({
    requestOnly: true,
    experiences: [{ id: 'horse-riding', title: 'Horse riding' }, { id: 'quad-safari', title: 'Quad safari' }, { id: 'camel-riding', title: 'Camel riding' }],
    pickupAreas: [{ id: 'hurghada', name: 'Hurghada' }, { id: 'sahl-hasheesh', name: 'Sahl Hasheesh' }, { id: 'soma-bay', name: 'Soma Bay' }, { id: 'makadi-bay', name: 'Makadi Bay' }],
  });
  expect(await ContactMessage.countDocuments()).toBe(0);
  expect(mail).not.toHaveBeenCalled();
  expect(acknowledgement).not.toHaveBeenCalled();
});

it('does not expose request options for another, unknown, missing or inactive tenant', async () => {
  await request(app).get('/contact/request-options').expect(400);
  for (const tenant of ['other-site', 'no-such-site', 'coral-safari-hurghada-other']) {
    await request(app).get('/contact/request-options').set('X-Tenant-ID', tenant).expect(404);
  }
  await Tenant.collection.updateOne({ _id: coralId }, { $set: { status: 'inactive' } });
  await request(app).get('/contact/request-options').set('X-Tenant-ID', 'coral-safari-hurghada').expect(404);
});

it('fails closed before its first write if its uniqueness indexes cannot be created, then recovers', async () => {
  const indexes = jest.spyOn(ContactMessage, 'createIndexes').mockRejectedValueOnce(new Error('indexes unavailable'));
  const body = submission();
  await submit(body).expect(500);
  expect(await ContactMessage.countDocuments()).toBe(0);
  expect(mail).not.toHaveBeenCalled();
  expect(acknowledgement).not.toHaveBeenCalled();
  indexes.mockRestore();
  await submit(body).expect(201);
});

it.each(['horse-riding', 'quad-safari', 'camel-riding'])('stores the %s preference with a receipt, without a booking, payment or notification', async experience => {
  const body = submission({ experience });
  const response = await submit(body).expect(201);
  expect(response.body.data).toEqual({ reference: expect.stringMatching(referencePattern), received: true, kind: 'booking-request', status: 'received' });
  expect(response.body.message).toContain('not yet confirmed');
  const stored = await ContactMessage.findOne({ tenantId: coralId }).lean();
  expect(stored).toMatchObject({
    name: body.name, email: body.email, phone: body.phone, travelDate: body.travelDate, guests: 3,
    status: 'new', delivery: { status: 'skipped', reason: 'tenant_store_only' },
    requestDetails: { kind: 'booking-request', experience, adults: 2, children: 1, pickupArea: 'hurghada', hotel: body.hotel },
  });
  expect(stored?.message).toContain('No payment taken.');
  expect(stored?.message).toContain('Selected hotel');
  expect(stored).not.toHaveProperty('tourSlug');
  expect(stored).not.toHaveProperty('requestFingerprint');
  expect(mail).not.toHaveBeenCalled();
  expect(acknowledgement).not.toHaveBeenCalled();
  const collections = (await mongoose.connection.db!.listCollections().toArray()).map(row => row.name);
  expect(collections).not.toEqual(expect.arrayContaining(['bookings']));
  expect(collections).not.toEqual(expect.arrayContaining(['emailreceipts']));
  expect(collections.filter(name => /payment|inventory|hold|order/i.test(name))).toEqual([]);
});

it.each(['hurghada', 'sahl-hasheesh', 'soma-bay', 'makadi-bay'])('accepts only the named pickup areas: %s', async pickupArea => {
  await submit(submission({ pickupArea, adults: 60, children: 0, notes: undefined, phone: undefined })).expect(201);
  expect(await ContactMessage.findOne({ tenantId: coralId }).lean()).toMatchObject({ guests: 60, requestDetails: { pickupArea } });
});

it('returns the same receipt for a normalized retry, including optional blanks', async () => {
  const body = submission({ phone: undefined, notes: undefined });
  const first = await submit(body).expect(201);
  const retry = await submit({ ...body, name: ` ${body.name} `, email: body.email.toUpperCase(), phone: '', notes: '' }).expect(200);
  expect(retry.body.data).toEqual(first.body.data);
  expect(await ContactMessage.countDocuments({ tenantId: coralId })).toBe(1);
  expect(mail).not.toHaveBeenCalled();
  expect(acknowledgement).not.toHaveBeenCalled();
});

it.each([
  { experience: 'quad-safari' }, { travelDate: '2099-01-01' }, { adults: 3 }, { children: 0 },
  { pickupArea: 'soma-bay' }, { hotel: 'Another selected hotel' }, { email: 'qa@booking.example' },
  { phone: '+20 100 000 0001' }, { notes: 'Changed request' }, { locale: 'ar' }, { name: 'QA Guest' },
])('rejects a changed replay without overwriting the original: %j', async changes => {
  const body = submission();
  await submit(body).expect(201);
  const first = await ContactMessage.findOne({ tenantId: coralId }).lean();
  await submit({ ...body, ...changes }).expect(409);
  expect(await ContactMessage.findOne({ tenantId: coralId }).lean()).toEqual(first);
  expect(await ContactMessage.countDocuments()).toBe(1);
  expect(mail).not.toHaveBeenCalled();
  expect(acknowledgement).not.toHaveBeenCalled();
});

it('collapses concurrent retries into one row and returns its receipt to each caller', async () => {
  const body = submission();
  const replies = await Promise.all(Array.from({ length: 8 }, () => submit(body)));
  expect(replies.map(row => row.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 201]);
  expect(new Set(replies.map(row => row.body.data.reference)).size).toBe(1);
  expect(await ContactMessage.countDocuments()).toBe(1);
  expect(mail).not.toHaveBeenCalled();
  expect(acknowledgement).not.toHaveBeenCalled();
});

it('resolves concurrent conflicting submissions to one saved request and a conflict', async () => {
  const body = submission();
  const replies = await Promise.all([submit(body), submit({ ...body, hotel: 'A different hotel' })]);
  expect(replies.map(row => row.status).sort()).toEqual([201, 409]);
  expect(await ContactMessage.countDocuments()).toBe(1);
});

it('does not confuse a generic message with a structured request sharing its key', async () => {
  const body = submission();
  await request(app).post('/contact').set('X-Tenant-ID', 'coral-safari-hurghada').send({ requestId: body.requestId, name: body.name, email: body.email, message: 'General question' }).expect(201);
  await submit(body).expect(409);
  expect(await ContactMessage.countDocuments()).toBe(1);
  expect(mail).not.toHaveBeenCalled();
  expect(acknowledgement).not.toHaveBeenCalled();
});

it.each([
  { experience: 't1092945' }, { experience: 'another-sites-tour' }, { experience: { $ne: null } },
  { pickupArea: 'el-gouna' }, { pickupArea: { $ne: null } }, { hotel: '' }, { hotel: 'x'.repeat(161) }, { hotel: 'Hotel\nAnother line' },
  { travelDate: '2026-02-30' }, { travelDate: '2000-01-01' }, { travelDate: 'tomorrow' },
  { adults: 0 }, { adults: 61 }, { adults: 1.5 }, { adults: '2' }, { adults: 60, children: 1 }, { children: -1 },
  { children: 0.5 }, { children: 60 }, { name: '' }, { email: 'invalid' }, { phone: 'not a phone' },
  { requestId: undefined }, { requestId: 'invalid' }, { notes: 'x'.repeat(4001) }, { locale: 'unknown' },
  { tenantId: String(otherId) }, { tourSlug: 'forged-tour' }, { price: 0 }, { sendEmail: true },
  { notificationSettings: { enabled: true } }, { website: {} },
])('rejects invalid or forged request data without persistence or delivery: %j', async changes => {
  await submit(submission(changes)).expect(400);
  expect(await ContactMessage.countDocuments()).toBe(0);
  expect(mail).not.toHaveBeenCalled();
  expect(acknowledgement).not.toHaveBeenCalled();
});

it('uses Cairo calendar days rather than server/UTC midnight', () => {
  expect(coralRequestDateIsPast('2026-11-01', new Date('2026-11-01T21:59:59Z'))).toBe(false);
  expect(coralRequestDateIsPast('2026-11-01', new Date('2026-11-01T22:00:00Z'))).toBe(true);
  expect(coralRequestDateIsPast('2026-11-02', new Date('2026-11-01T22:00:00Z'))).toBe(false);
});

it('never stores or delivers a honeypot submission and applies the public submission limit', async () => {
  for (let i = 0; i < 20; i++) {
    await request(app).post('/contact/requests').set('X-Tenant-ID', 'coral-safari-hurghada').set('X-Forwarded-For', '203.0.113.20').send({ website: 'filled' }).expect(201);
  }
  await request(app).post('/contact/requests').set('X-Tenant-ID', 'coral-safari-hurghada').set('X-Forwarded-For', '203.0.113.20').send({ website: 'filled' }).expect(429);
  expect(await ContactMessage.countDocuments()).toBe(0);
  expect(mail).not.toHaveBeenCalled();
  expect(acknowledgement).not.toHaveBeenCalled();
});

it('requires the resolved exact Coral tenant, including when its id or domain identifies it', async () => {
  await submit(submission(), null).expect(400);
  for (const tenant of ['no-such-site', 'other-site', 'coral-safari-hurghada-other']) await submit(submission(), tenant).expect(404);
  expect(await ContactMessage.countDocuments()).toBe(0);
  await submit(submission(), String(coralId)).expect(201);
  await submit(submission(), 'coralsafarihurghada.com').expect(201);
  await Tenant.collection.updateOne({ _id: coralId }, { $set: { status: 'pending' } });
  await submit(submission()).expect(404);
  expect(mail).not.toHaveBeenCalled();
  expect(acknowledgement).not.toHaveBeenCalled();
});

it('returns no success on database failure, and the unchanged retry can then save once', async () => {
  const body = submission();
  const create = jest.spyOn(ContactMessage, 'create').mockRejectedValueOnce(new Error('database unavailable') as never);
  await submit(body).expect(500);
  expect(await ContactMessage.countDocuments()).toBe(0);
  expect(mail).not.toHaveBeenCalled();
  expect(acknowledgement).not.toHaveBeenCalled();
  create.mockRestore();
  await submit(body).expect(201);
  expect(await ContactMessage.countDocuments()).toBe(1);
});

it('keeps generic Coral enquiries store-only even with forged delivery flags, and leaves other sites unchanged', async () => {
  const body = { requestId: randomUUID(), name: 'Egypt Excursions Online QA', email: 'theegyptexcursionsonline@gmail.com', message: 'General question', sendEmail: true, delivery: { status: 'sent' }, notificationSettings: { enabled: true } };
  await request(app).post('/contact').set('X-Tenant-ID', 'coral-safari-hurghada').send(body).expect(201);
  await request(app).post('/contact').set('X-Tenant-ID', 'coral-safari-hurghada').send(body).expect(200);
  expect(await ContactMessage.findOne({ tenantId: coralId }).lean()).toMatchObject({ delivery: { status: 'skipped', reason: 'tenant_store_only' } });
  expect(mail).not.toHaveBeenCalled();
  expect(acknowledgement).not.toHaveBeenCalled();
  await request(app).post('/contact').set('X-Tenant-ID', 'other-site').send(body).expect(201);
  expect(mail).toHaveBeenCalledTimes(1);
  expect(acknowledgement).toHaveBeenCalledTimes(1);
});

it('exposes structured details only through the assigned operator inbox and preserves status handling', async () => {
  await submit(submission()).expect(201);
  const stored = await ContactMessage.findOne({ tenantId: coralId }).lean();
  const authorized = await principal('brand-admin');
  const own = await request(app).get('/contact/messages').query({ tenantId: String(coralId) }).set('Authorization', authorized).expect(200);
  expect(own.body.data.messages[0].requestDetails).toEqual({ kind: 'booking-request', experience: 'horse-riding', adults: 2, children: 1, pickupArea: 'hurghada', hotel: 'Selected hotel' });
  expect(own.body.data.messages[0]).not.toHaveProperty('requestFingerprint');
  await request(app).patch(`/contact/messages/${stored!._id}`).set('Authorization', authorized).send({ status: 'handled' }).expect(200);
  const foreign = await principal('brand-admin', [otherId]);
  await request(app).get('/contact/messages').query({ tenantId: String(coralId) }).set('Authorization', foreign).expect(403);
  await request(app).patch(`/contact/messages/${stored!._id}`).set('Authorization', foreign).send({ status: 'archived' }).expect(404);
  await request(app).get('/contact/messages').query({ tenantId: String(otherId) }).set('Authorization', foreign).expect(200).expect(response => expect(response.body.data.messages).toEqual([]));
  expect(mail).not.toHaveBeenCalled();
  expect(acknowledgement).not.toHaveBeenCalled();
});

it.each([['manager', 200], ['super-admin', 200], ['editor', 403], ['viewer', 403], ['customer', 403]] as const)('enforces %s inbox role access', async (role, status) => {
  await submit(submission()).expect(201);
  await request(app).get('/contact/messages').query({ tenantId: String(coralId) }).set('Authorization', await principal(role)).expect(status);
});

it('rejects signed-out and revoked-session access to request personal data', async () => {
  await submit(submission()).expect(201);
  await request(app).get('/contact/messages').query({ tenantId: String(coralId) }).expect(401);
  const token = await principal('brand-admin');
  await User.collection.updateMany({}, { $inc: { tokenVersion: 1 } });
  await request(app).get('/contact/messages').query({ tenantId: String(coralId) }).set('Authorization', token).expect(401);
});
