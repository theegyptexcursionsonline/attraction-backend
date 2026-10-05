import express from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import tenantRoutes from '../routes/tenants.routes';
import { Tenant } from '../models/Tenant';
import { publicTenantContactInfo, supportEmailSchema, tenantContactInfoSchema, tenantContactInfoSetPaths } from '../utils/tenantContactInfo';
import { bookingNotificationEmail } from '../utils/notificationRecipients';

// Exercise the real roles, validators, controllers, projection and database.
// Authentication has separate coverage; no external service is called here.
jest.mock('../middleware/auth.middleware', () => ({
  ...jest.requireActual('../middleware/auth.middleware'),
  authenticate: (req: any, res: any, next: any) => {
    const role = req.header('x-test-role');
    if (!role) return res.status(401).json({ success: false });
    req.user = { role, assignedTenants: req.header('x-test-assigned')?.split(',').filter(Boolean) || [] };
    next();
  },
}));

jest.setTimeout(120_000);
const app = express();
app.use(express.json());
app.use('/tenants', tenantRoutes);
app.use((error: Error, _req: any, res: any, _next: any) => res.status(500).json({ error: error.message }));
const owner = new Types.ObjectId();
const other = new Types.ObjectId();
const createBody = {
  slug: 'new-contact-site', name: 'QA contact site', domain: 'new-contact-site.invalid',
  logo: 'https://assets.example.invalid/logo.png',
  theme: { primaryColor: '#000000', secondaryColor: '#222222', accentColor: '#444444' },
  defaultCurrency: 'USD', defaultLanguage: 'en', supportedLanguages: ['en'],
};
let mongo: MongoMemoryReplSet;

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('tenant_support_email'));
  await Tenant.init();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await Tenant.collection.deleteMany({});
  await Tenant.collection.insertMany([owner, other].map((_id, index) => ({
    _id, slug: `contact-site-${index}`, domain: `contact-site-${index}.invalid`, name: `QA contact site ${index}`, status: 'active',
    contactInfo: { email: `booking-${index}@qa.invalid`, phone: '+20000000000' },
    notificationSettings: { bookingEmail: `private-${index}@qa.invalid` },
  })));
});

const patch = (id = owner, role = 'brand-admin', path = 'settings') => request(app)
  .patch(`/tenants/${id}${path ? `/${path}` : ''}`).set('x-test-role', role).set('x-test-assigned', String(owner));
const stored = (id = owner) => Tenant.findById(id).lean();

it('normalizes the optional mailbox in the schema/model and never changes notification recipients', () => {
  expect(supportEmailSchema.parse(' Support@QA.invalid ')).toBe('support@qa.invalid');
  expect(tenantContactInfoSchema.parse({ email: 'booking@qa.invalid' })).not.toHaveProperty('supportEmail');
  expect(tenantContactInfoSetPaths({ supportEmail: 'support@qa.invalid' })).toEqual({ 'contactInfo.supportEmail': 'support@qa.invalid' });
  const tenant = new Tenant({ ...createBody, contactInfo: { email: 'booking@qa.invalid', supportEmail: ' Support@QA.invalid ' } });
  expect(tenant.validateSync()).toBeUndefined();
  expect(tenant.contactInfo?.supportEmail).toBe('support@qa.invalid');
  expect(bookingNotificationEmail(tenant)).toBe('booking@qa.invalid');
  expect(new Tenant(createBody).toObject().contactInfo?.supportEmail).toBeUndefined();
});

it('creates a tenant with both public mailboxes through the normal create validator', async () => {
  const response = await request(app).post('/tenants').set('x-test-role', 'super-admin')
    .send({ ...createBody, contactInfo: { email: 'booking@qa.invalid', supportEmail: ' Support@QA.invalid ' } }).expect(201);
  expect((await Tenant.findById(response.body.data._id).lean())?.contactInfo).toMatchObject({ email: 'booking@qa.invalid', supportEmail: 'support@qa.invalid' });
});

it.each(['settings', ''])('persists and publicly reads one tenant’s support mailbox via %s updates', async path => {
  await patch(owner, path ? 'brand-admin' : 'super-admin', path)
    .send({ contactInfo: { supportEmail: ' Support@QA.invalid ' } }).expect(200);
  expect((await stored())?.contactInfo).toMatchObject({ email: 'booking-0@qa.invalid', phone: '+20000000000', supportEmail: 'support@qa.invalid' });
  for (const url of [`/tenants/public/${owner}`, '/tenants/by-slug/contact-site-0']) {
    const read = await request(app).get(url).expect(200);
    expect(read.body.data.contactInfo).toMatchObject({ email: 'booking-0@qa.invalid', supportEmail: 'support@qa.invalid' });
    expect(read.body.data.notificationSettings).toBeUndefined();
    expect(JSON.stringify(read.body)).not.toMatch(/private-0@|booking-1@/);
  }
  const foreign = await request(app).get(`/tenants/public/${other}`).expect(200);
  expect(foreign.body.data.contactInfo).not.toHaveProperty('supportEmail');
  const list = await request(app).get('/tenants/public').expect(200);
  expect(list.body.data.find((row: any) => row._id === String(owner)).contactInfo.supportEmail).toBe('support@qa.invalid');
  expect(list.body.data.find((row: any) => row._id === String(other)).contactInfo).not.toHaveProperty('supportEmail');
});

it.each(['settings', ''])('preserves supportEmail through old-client saves and clears it explicitly via %s', async path => {
  const role = path ? 'brand-admin' : 'super-admin';
  await patch(owner, role, path).send({ contactInfo: { supportEmail: 'support@qa.invalid' } }).expect(200);
  await patch(owner, role, path).send({ contactInfo: { email: 'new-bookings@qa.invalid', phone: '+20000000001' } }).expect(200);
  expect((await stored())?.contactInfo?.supportEmail).toBe('support@qa.invalid');
  await patch(owner, role, path).send({ contactInfo: { supportEmail: '  ' } }).expect(200);
  expect((await stored())?.contactInfo?.supportEmail).toBe('');
  const read = await request(app).get(`/tenants/public/${owner}`).expect(200);
  expect(read.body.data.contactInfo).not.toHaveProperty('supportEmail');
  expect(read.body.data.contactInfo.email).toBe('new-bookings@qa.invalid');
});

it.each([
  null, 123, true, [], { $ne: null }, 'invalid', 'mailto:help@qa.invalid',
  'help@qa.invalid?subject=test', 'help@qa.invalid,other@qa.invalid',
  'Support <help@qa.invalid>', 'help@qa.invalid\r\nBcc:other@qa.invalid',
  '\nhelp@qa.invalid', 'help@qa.invalid\u0000', `${'a'.repeat(250)}@qa.invalid`,
])('rejects malformed support mailboxes on all write routes without mutation: %j', async supportEmail => {
  const contactInfo = { supportEmail };
  await patch().send({ contactInfo }).expect(400);
  await patch(owner, 'super-admin', '').send({ contactInfo }).expect(400);
  await request(app).post('/tenants').set('x-test-role', 'super-admin').send({ ...createBody, contactInfo }).expect(400);
  expect((await stored())?.contactInfo?.supportEmail).toBeUndefined();
  expect(await Tenant.countDocuments({ slug: createBody.slug })).toBe(0);
  expect(new Tenant({ ...createBody, contactInfo }).validateSync()?.errors['contactInfo.supportEmail']).toBeDefined();
});

it('omits absent/invalid legacy support fields and unknown contact keys from public projections', async () => {
  expect(publicTenantContactInfo(undefined)).toEqual({});
  expect(publicTenantContactInfo([])).toEqual({});
  for (const supportEmail of [null, 123, '', 'bad', 'help@qa.invalid\r\nBcc:other@qa.invalid']) {
    await Tenant.collection.updateOne({ _id: owner }, { $set: { 'contactInfo.supportEmail': supportEmail, 'contactInfo.privateNote': 'private-contact-note' } });
    const response = await request(app).get(`/tenants/public/${owner}`).expect(200);
    expect(response.body.data.contactInfo).toEqual({ email: 'booking-0@qa.invalid', phone: '+20000000000' });
    expect(JSON.stringify(response.body)).not.toContain('private-contact-note');
  }
});

it('preserves independent contact edits under concurrency, duplicate saves and a failed-write retry', async () => {
  await Promise.all([
    patch().send({ contactInfo: { supportEmail: 'support@qa.invalid' } }).expect(200),
    patch().send({ contactInfo: { phone: '+20000000002' } }).expect(200),
  ]);
  await patch().send({ contactInfo: { supportEmail: 'support@qa.invalid' } }).expect(200);
  expect((await stored())?.contactInfo).toMatchObject({ email: 'booking-0@qa.invalid', phone: '+20000000002', supportEmail: 'support@qa.invalid' });
  const failure = jest.spyOn(Tenant, 'findOneAndUpdate').mockRejectedValueOnce(new Error('database unavailable'));
  await patch().send({ contactInfo: { supportEmail: 'after-retry@qa.invalid' } }).expect(500);
  failure.mockRestore();
  expect((await stored())?.contactInfo?.supportEmail).toBe('support@qa.invalid');
  await patch().send({ contactInfo: { supportEmail: 'after-retry@qa.invalid' } }).expect(200);
  expect((await stored())?.contactInfo?.supportEmail).toBe('after-retry@qa.invalid');
});

it('keeps foreign/missing targets indistinguishable and refuses unassigned/unauthenticated writes', async () => {
  for (const id of [other, new Types.ObjectId()]) {
    const response = await patch(id).query({ tenantId: String(owner) })
      .send({ contactInfo: { supportEmail: 'hijack@qa.invalid' }, tenantId: String(owner) }).expect(404);
    expect(response.body.error).toBe('Tenant not found');
  }
  await patch().set('x-test-assigned', '').send({ contactInfo: { supportEmail: 'hijack@qa.invalid' } }).expect(404);
  await request(app).patch(`/tenants/${owner}/settings`).send({ contactInfo: { supportEmail: 'hijack@qa.invalid' } }).expect(401);
  expect((await stored(other))?.contactInfo?.supportEmail).toBeUndefined();
  expect((await stored())?.contactInfo?.supportEmail).toBeUndefined();
});

it.each(['customer', 'operator', 'agent', 'viewer', 'editor', 'manager'])('denies support-email writes by %s', async role => {
  await patch(owner, role).send({ contactInfo: { supportEmail: 'hijack@qa.invalid' } }).expect(403);
  expect((await stored())?.contactInfo?.supportEmail).toBeUndefined();
});
