/**
 * User log detail, end to end on a real replica set: real routes, real sessions, the audit
 * middleware reading each record before and after the change. Proves the record name, the safe
 * before → after values, that private fields are never read or stored, that a change is filed
 * under the brand that owns the record, and that the CSV report holds exactly what the list shows.
 */
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { auditTrail } from '../middleware/audit.middleware';
import attractionRoutes from '../routes/attractions.routes';
import bookingRoutes from '../routes/bookings.routes';
import promoRoutes from '../routes/promo.routes';
import userRoutes from '../routes/users.routes';
import auditLogRoutes from '../routes/auditLogs.routes';
import attractionTranslationRoutes from '../routes/attractionTranslations.routes';
import { AuditLog } from '../models/AuditLog';
import { Attraction } from '../models/Attraction';
import { Booking } from '../models/Booking';
import { PromoCode } from '../models/PromoCode';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { takeSnapshot } from '../services/auditSubjects';
import { generateAccessToken } from '../utils/jwt';
import { IUser } from '../types';

jest.setTimeout(180_000);

const app = express();
app.use(express.json());
app.use('/api', auditTrail);
app.use('/api/attractions', attractionRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/promo-codes', promoRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/admin/attraction-translations', attractionTranslationRoutes);
app.use((error: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(error.statusCode || 500).json({ success: false, error: error.message });
});

let mongo: MongoMemoryReplSet;
const red = new Types.ObjectId();
const nile = new Types.ObjectId();
const giftun = new Types.ObjectId();
const felucca = new Types.ObjectId();
const booking = new Types.ObjectId();
const ids = { super: new Types.ObjectId(), redAdmin: new Types.ObjectId(), ops: new Types.ObjectId(), nileDesk: new Types.ObjectId() };
const tokens: Record<keyof typeof ids, string> = { super: '', redAdmin: '', ops: '', nileDesk: '' };
const PASSWORD_HASH = '$2a$12$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
const TWO_FACTOR_SECRET = 'enc:v1:private-two-factor-secret';
const GUEST = { firstName: 'Private', lastName: 'Traveller', email: 'theegyptexcursionsonline+guest@gmail.com', phone: '+20 100 000 0042', country: 'Egypt' };

const as = (who: keyof typeof ids, brand?: Types.ObjectId) => ({
  Authorization: `Bearer ${tokens[who]}`,
  ...(brand ? { 'x-tenant-id': String(brand) } : {}),
});

const tour = (_id: Types.ObjectId, slug: string, title: string, owner: Types.ObjectId, price: number) => ({
  _id, slug, title, shortDescription: 'Two reef stops and lunch on board.', description: 'A fixture tour for the user log.',
  category: 'boat-trips', destination: { city: 'Hurghada', country: 'Egypt', coordinates: { lat: 27.2, lng: 33.8 } }, duration: '6 hours',
  status: 'active', tenantIds: [owner], ownerTenantId: owner, currency: 'USD', priceFrom: price, listingType: 'tour',
  images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'], availability: { type: 'date-only', advanceBooking: 60 },
  pricingOptions: [{ id: 'shared', name: 'Shared boat', description: 'A seat on the shared boat.', price, pricingModel: 'per-person', minParticipants: 1, maxParticipants: 12, timeSlots: [] }],
  highlights: ['Two reef stops'], inclusions: ['Lunch'], exclusions: [], addons: [], itinerary: [], entryWindows: [], languages: ['English'],
  rating: 4.8, reviewCount: 0, enquiryOnly: false, featured: false, sortOrder: 0, presentationRevision: 0,
  meetingPoint: { address: 'Hurghada Marina', instructions: 'Marina gate', mapUrl: '' }, cancellationPolicy: 'Free cancellation up to 24 hours before.',
});

/** Entries are written after the response; wait for them. */
const entries = async (filter: Record<string, unknown>, count = 1) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await AuditLog.find(filter).sort({ _id: -1 }).lean();
    if (rows.length >= count) return rows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`expected ${count} user-log entries for ${JSON.stringify(filter)}`);
};

const list = async (who: keyof typeof ids, query: Record<string, string> = {}) =>
  (await request(app).get('/api/audit-logs').query({ limit: '100', ...query }).set(as(who)).expect(200)).body.data;

const exportCsv = (who: keyof typeof ids, query: Record<string, string> = {}) =>
  request(app).get('/api/audit-logs/export').query(query).set(as(who)).buffer(true).parse((res, done) => {
    let text = '';
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => { text += chunk; });
    res.on('end', () => done(null, text));
  });

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('audit_log_detail'));
  await Promise.all([Tenant.init(), User.init(), Attraction.init(), Booking.init(), PromoCode.init(), AuditLog.init()]);
  await Tenant.collection.insertMany([
    { _id: red, slug: 'red-sea-qa', name: 'Red Sea QA Trips', domain: 'red-sea-qa.invalid', status: 'active', defaultCurrency: 'USD', customPages: [] },
    { _id: nile, slug: 'nile-qa', name: 'Nile QA Trips', domain: 'nile-qa.invalid', status: 'active', defaultCurrency: 'USD', customPages: [] },
  ]);
  const member = (_id: Types.ObjectId, role: string, assignedTenants: Types.ObjectId[], firstName: string, lastName: string) => ({
    _id, email: `${firstName.toLowerCase()}.${role}@qa.invalid`, password: PASSWORD_HASH, firstName, lastName, role, status: 'active',
    assignedTenants, interfaceLocale: 'en', tokenVersion: 0, twoFactorEnabled: true, twoFactorSecretEnc: TWO_FACTOR_SECRET,
  });
  await User.collection.insertMany([
    member(ids.super, 'super-admin', [], 'Platform', 'Owner'),
    member(ids.redAdmin, 'brand-admin', [red], 'Red', 'Admin'),
    member(ids.ops, 'manager', [red, nile], 'Operations', 'Lead'),
    member(ids.nileDesk, 'manager', [nile], 'Nile', 'Desk'),
  ]);
  for (const key of Object.keys(ids) as Array<keyof typeof ids>) {
    tokens[key] = generateAccessToken((await User.findById(ids[key]))! as unknown as IUser);
  }
  await Attraction.collection.insertMany([
    tour(giftun, 'giftun-reef-qa', 'Giftun Reef Snorkel Day', red, 45),
    tour(felucca, 'nile-felucca-qa', 'Nile Felucca Sunset', nile, 900),
  ]);
  await Booking.collection.insertOne({
    _id: booking, reference: 'QA-UL-0001', tenantId: red, attractionId: giftun, status: 'pending', paymentStatus: 'pending', paymentMethod: 'cash',
    total: 135, subtotal: 135, currency: 'USD', guestDetails: { ...GUEST, specialRequests: 'Window seat please' },
    items: [{ attractionId: giftun, optionName: 'Shared boat', date: new Date('2026-10-20'), time: '09:00', guests: 3, quantities: { adults: 2, children: 1, infants: 0 }, price: 135 }],
    createdAt: new Date(), updatedAt: new Date(),
  });
});

afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

describe('user log detail', () => {
  it('names the tour and keeps safe before → after values, never the long text', async () => {
    await request(app).patch(`/api/attractions/${giftun}`).set(as('redAdmin', red))
      .send({ priceFrom: 49, featured: true, shortDescription: 'Two reef stops, lunch on board and snorkel gear included.' }).expect(200);
    const [entry] = await entries({ resourceId: String(giftun), actorId: ids.redAdmin });
    expect(entry).toMatchObject({
      action: 'record.update', outcome: 'success', subject: 'tour', verb: 'update', resourceLabel: 'Giftun Reef Snorkel Day',
      summary: 'Changed tour: Giftun Reef Snorkel Day',
    });
    expect(String(entry.tenantId)).toBe(String(red));
    expect(entry.changes).toEqual(expect.arrayContaining([{ field: 'priceFrom', before: 45, after: 49 }, { field: 'featured', before: false, after: true }]));
    expect(entry.changedFields).toEqual(expect.arrayContaining(['shortDescription']));
    expect(JSON.stringify(entry)).not.toContain('snorkel gear');
  });

  it("files a shared member's change under the brand that owns the record, never naming it to the other brand", async () => {
    await request(app).patch(`/api/attractions/${felucca}`).set(as('ops', red)).send({ priceFrom: 950 }).expect(200);
    const [entry] = await entries({ resourceId: String(felucca), actorId: ids.ops });
    expect(String(entry.tenantId)).toBe(String(nile));
    expect(entry).toMatchObject({ resourceLabel: 'Nile Felucca Sunset', changes: [{ field: 'priceFrom', before: 900, after: 950 }] });

    const redView = await list('redAdmin');
    expect(redView.data.some((row: { id: string }) => row.id === String(entry._id))).toBe(false);
    for (const forbidden of ['Nile Felucca Sunset', 'Nile QA Trips', 'nile-qa', String(nile), String(felucca)]) expect(JSON.stringify(redView)).not.toContain(forbidden);

    const superView = await list('super');
    const seen = superView.data.find((row: { id: string }) => row.id === String(entry._id));
    expect(seen).toMatchObject({ resourceLabel: 'Nile Felucca Sunset', brand: { name: 'Nile QA Trips' } });
  });

  it("files an outsider's refused attempt under the record's brand, out of the outsider's own log", async () => {
    const response = await request(app).delete(`/api/attractions/${felucca}`).set(as('redAdmin', red));
    expect(response.status).toBeGreaterThanOrEqual(400);
    const [entry] = await entries({ resourceId: String(felucca), actorId: ids.redAdmin });
    expect(entry).toMatchObject({ outcome: 'failure', action: 'record.delete', resourceLabel: 'Nile Felucca Sunset', summary: 'Tried to delete tour: Nile Felucca Sunset (refused)' });
    expect(String(entry.tenantId)).toBe(String(nile));
    expect(JSON.stringify(await list('redAdmin'))).not.toContain('Nile Felucca Sunset');
    expect(await Attraction.exists({ _id: felucca, status: 'active' })).toBeTruthy();
  });

  it('never names another brand\'s tour through a translation path', async () => {
    await request(app).put(`/api/admin/attraction-translations/${red}/${felucca}/ar`).set(as('redAdmin', red)).send({ content: { title: 'x' } });
    const [entry] = await entries({ subject: 'tour-translation', actorId: ids.redAdmin });
    expect(entry.resourceLabel).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain('Nile Felucca Sunset');
  });

  it("records a team member's section change without reading their password, tokens or 2FA", async () => {
    await request(app).patch(`/api/users/${ids.ops}`).set(as('redAdmin', red)).send({ sectionAccess: ['tours'] }).expect(200);
    const [entry] = await entries({ resourceId: String(ids.ops), actorId: ids.redAdmin });
    expect(entry).toMatchObject({ subject: 'team-member', resourceLabel: 'Operations Lead', changes: [{ field: 'sectionAccess', before: null, after: ['tours'] }] });
    expect(String(entry.tenantId)).toBe(String(red));
    // The member's own address is compared in memory, never kept; their secrets are never read.
    for (const secret of [PASSWORD_HASH, TWO_FACTOR_SECRET, 'operations.manager@qa.invalid']) expect(JSON.stringify(entry)).not.toContain(secret);
    const stored = JSON.stringify(await AuditLog.find({}).lean());
    for (const secret of [PASSWORD_HASH, TWO_FACTOR_SECRET]) expect(stored).not.toContain(secret);

    const snapshot = await takeSnapshot('user', String(ids.ops));
    expect(Object.keys(snapshot!.values).sort()).toEqual(['assignedTenants', 'email', 'firstName', 'interfaceLocale', 'lastName', 'role', 'sectionAccess', 'status']);
    expect(JSON.stringify(snapshot)).not.toContain(PASSWORD_HASH);
    expect(JSON.stringify(snapshot)).not.toContain(TWO_FACTOR_SECRET);
  });

  it('names a booking by its reference only, never by the guest', async () => {
    await request(app).patch(`/api/bookings/admin/${booking}`).set(as('redAdmin', red)).send({ status: 'confirmed' }).expect(200);
    const [entry] = await entries({ resourceId: String(booking) });
    expect(entry).toMatchObject({ subject: 'booking', resourceLabel: 'QA-UL-0001', summary: 'Changed booking: QA-UL-0001', changes: [{ field: 'status', before: 'pending', after: 'confirmed' }] });
    const stored = JSON.stringify(entry);
    for (const value of [GUEST.email, GUEST.phone, GUEST.firstName, GUEST.lastName, 'Window seat']) expect(stored).not.toContain(value);
    const snapshot = await takeSnapshot('booking', String(booking));
    expect(JSON.stringify(snapshot)).not.toContain(GUEST.email);
  });

  it('names a new record from the database and lists what it was set to', async () => {
    const created = await request(app).post('/api/promo-codes').set(as('redAdmin', red)).send({
      code: 'REEF10', description: 'Ten percent off reef days', discountType: 'percentage', discountValue: 10, currency: 'USD',
      validFrom: '2026-10-01T00:00:00.000Z', validUntil: '2026-12-31T00:00:00.000Z', tenantId: String(red),
    }).expect(201);
    const id = String(created.body.data._id || created.body.data.id);
    const [entry] = await entries({ resourceId: id });
    expect(entry).toMatchObject({ action: 'record.create', subject: 'promo-code', verb: 'create', resourceLabel: 'REEF10', summary: 'Created promo code: REEF10' });
    expect(entry.changes).toEqual(expect.arrayContaining([{ field: 'code', after: 'REEF10' }, { field: 'discountValue', after: 10 }]));
    expect(String(entry.tenantId)).toBe(String(red));
  });

  it("hides routes and record ids from a brand admin's list and counts what the filters match", async () => {
    const redView = await list('redAdmin');
    expect(redView.data.length).toBeGreaterThan(0);
    for (const row of redView.data) { expect(row.path).toBeNull(); expect(row.resourceId).toBeNull(); expect(row.method).toBeNull(); }
    expect(redView.stats).toEqual({ total: redView.data.length, today: redView.data.length, needsAttention: redView.data.filter((row: { outcome: string }) => row.outcome === 'failure').length });
    const superView = await list('super');
    expect(superView.data.every((row: { path: string | null }) => typeof row.path === 'string')).toBe(true);
    const tours = await list('redAdmin', { subject: 'tour' });
    expect(tours.data.every((row: { subject: string }) => row.subject === 'tour')).toBe(true);
    expect((await list('redAdmin', { search: 'REEF10' })).data.map((row: { resourceLabel: string }) => row.resourceLabel)).toEqual(['REEF10']);
  });

  it('reports the filtered view as CSV in the same brand scope, with Cairo and UTC times and formula-safe cells', async () => {
    await request(app).patch(`/api/attractions/${giftun}`).set(as('redAdmin', red)).send({ title: '=HYPERLINK("http://example.invalid")' }).expect(200);
    await entries({ resourceLabel: '=HYPERLINK("http://example.invalid")' });

    const listed = await list('redAdmin');
    const response = await exportCsv('redAdmin').expect(200);
    expect(response.headers['content-type']).toMatch(/^text\/csv/);
    expect(response.headers['content-disposition']).toMatch(/^attachment; filename="user-log-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const csv = response.body as string;
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('"Time (Cairo)","Time (UTC)","Who","Email","Role","Result","Summary","Record type","Record","Brand","Changes","Also changed","IP address","Device","Event ID"');
    expect(lines.length - 1).toBe(listed.data.length);
    for (const forbidden of ['Nile Felucca Sunset', 'Nile QA Trips', String(nile), '/api/']) expect(csv).not.toContain(forbidden);
    expect(csv).toContain('"\'=HYPERLINK(""http://example.invalid"")"');
    expect(csv).toContain('Price from: 45 → 49; Featured: No → Yes');
    expect(lines[1]).toMatch(/^"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}","\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z",/);

    const [logged] = await entries({ action: 'record.export', actorId: ids.redAdmin });
    expect(logged).toMatchObject({
      outcome: 'success', subject: 'user-log', verb: 'export',
      summary: `Exported user log: ${listed.data.length} entries`, changes: [{ field: 'entryCount', after: listed.data.length }],
    });
    expect(logged.resourceLabel).toBeUndefined();
    expect(String(logged.tenantId)).toBe(String(red));
  });

  it('applies the list filters to the report and adds the request column only for a super admin', async () => {
    const promos = (await exportCsv('redAdmin', { subject: 'promo-code' }).expect(200)).body as string;
    const rows = promos.slice(1).trim().split('\r\n').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('REEF10');
    const full = (await exportCsv('super').expect(200)).body as string;
    expect(full.slice(1).split('\r\n')[0]).toMatch(/,"Request"$/);
    expect(full).toContain('Nile Felucca Sunset');
  });

  it('refuses a report above the limit instead of cutting it short, and logs the refusal', async () => {
    process.env.AUDIT_EXPORT_MAX = '1';
    try {
      const response = await request(app).get('/api/audit-logs/export').set(as('redAdmin')).expect(400);
      expect(response.body).toMatchObject({ success: false, code: 'EXPORT_TOO_LARGE', limit: 1 });
      expect(response.body.count).toBeGreaterThan(1);
    } finally {
      delete process.env.AUDIT_EXPORT_MAX;
    }
    const [refused] = await entries({ action: 'record.export', outcome: 'failure' });
    expect(refused).toMatchObject({ statusCode: 400, verb: 'export' });
    expect(refused.summary).toMatch(/^Tried to export user log: \d+ entries \(refused\)$/);
    expect(refused.changes?.[0]).toMatchObject({ field: 'entryCount' });
  });

  it('gives a brand admin with no brand an empty report, and refuses other roles', async () => {
    await User.updateOne({ _id: ids.redAdmin }, { $set: { assignedTenants: [] } });
    try {
      const csv = (await exportCsv('redAdmin').expect(200)).body as string;
      expect(csv.slice(1).trim().split('\r\n')).toHaveLength(1);
    } finally {
      await User.updateOne({ _id: ids.redAdmin }, { $set: { assignedTenants: [red] } });
    }
    await request(app).get('/api/audit-logs/export').set(as('ops')).expect(403);
    await request(app).get('/api/audit-logs/export').expect(401);
  });
});
