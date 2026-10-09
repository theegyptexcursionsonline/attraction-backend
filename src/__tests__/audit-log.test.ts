/**
 * User log: changes made by admin accounts are recorded after the response, with who, what and
 * from where, never with the request body; what changed is limited to allow-listed fields.
 */
import { EventEmitter } from 'events';
import mongoose, { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog';
import { auditTrail } from '../middleware/audit.middleware';
import { auditPath, auditResource, auditResourceId } from '../services/auditLog.service';
import * as subjects from '../services/auditSubjects';
import {
  AUDIT_SPEC_KEYS,
  attributeBrand,
  auditActionForVerb,
  auditSummary,
  auditValue,
  createdRecordId,
  diffSnapshots,
  matchAuditRoute,
  needsBeforeSnapshot,
  subjectSpec,
  type RecordSnapshot,
} from '../services/auditSubjects';
import { auditCsvHeader, auditCsvRow, cairoDate, cairoTime, changesText, csvCell, deviceText } from '../utils/auditCsv';
import { startOfCairoDay } from '../controllers/auditLogs.controller';
import { generateAccessToken, generateTwoFactorChallenge } from '../utils/jwt';
import jwt from 'jsonwebtoken';
import { AuthRequest, IUser } from '../types';

jest.mock('../models/AuditLog', () => ({ AuditLog: { create: jest.fn().mockResolvedValue({}) } }));

const connected = (state: number) => {
  Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, get: () => state });
};

/** The entry is written after the response, once the "after" picture is read. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const admin = { _id: new Types.ObjectId(), email: 'Ops@Brand.test', firstName: 'Ops', lastName: 'Lead', role: 'manager' };

const exchange = (method: string, url: string, user?: Record<string, unknown>, headers: Record<string, string> = {}) => {
  const req = { method, originalUrl: url, url, headers: { 'user-agent': 'jest', ...headers }, ip: '203.0.113.9', body: { password: 'secret' }, user } as unknown as AuthRequest;
  const res = Object.assign(new EventEmitter(), { statusCode: 200, json: jest.fn() });
  return { req, res };
};

describe('audit trail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    connected(1);
    // No database in these tests: the record is "not read in time" unless a test says otherwise.
    jest.spyOn(subjects, 'takeSnapshot').mockResolvedValue(undefined);
  });

  it('records an admin change with actor, record and outcome but no body', async () => {
    const id = String(new Types.ObjectId());
    const { req, res } = exchange('PATCH', `/api/attractions/${id}?x=1`, admin);
    const next = jest.fn();
    auditTrail(req, res as never, next);
    expect(next).toHaveBeenCalled();
    res.emit('finish');
    await settle();
    const entry = (AuditLog.create as jest.Mock).mock.calls[0][0];
    expect(entry).toMatchObject({
      action: 'record.update', outcome: 'success', actorEmail: 'ops@brand.test', actorName: 'Ops Lead', actorRole: 'manager',
      method: 'PATCH', path: `/api/attractions/${id}`, resource: 'attractions', resourceId: id, ip: '203.0.113.9',
      verb: 'update', summary: 'Changed record',
    });
    expect(JSON.stringify(entry)).not.toContain('secret');
  });

  it('records a refused change as a failure', async () => {
    const { req, res } = exchange('DELETE', '/api/users/abc', { ...admin });
    auditTrail(req, res as never, jest.fn());
    res.statusCode = 403;
    res.emit('finish');
    await settle();
    expect((AuditLog.create as jest.Mock).mock.calls[0][0]).toMatchObject({ action: 'record.delete', outcome: 'failure', statusCode: 403 });
  });

  it('ignores reads, customers, anonymous requests and housekeeping', async () => {
    for (const [method, url, user] of [
      ['GET', '/api/bookings', admin],
      ['POST', '/api/bookings', { ...admin, role: 'customer' }],
      ['POST', '/api/contact', undefined],
      ['PATCH', '/api/notifications/read-all', admin],
      ['POST', `/api/users/wishlist/${new Types.ObjectId()}`, admin],
      ['POST', '/api/promo-codes/validate', admin],
      ['POST', '/api/bundles/red-sea-days/quote', admin],
      ['POST', `/api/packages/${new Types.ObjectId()}/quote`, admin],
      ['POST', '/api/preview/unlock-by-code', admin],
    ] as const) {
      const { req, res } = exchange(method, url, user as never);
      auditTrail(req, res as never, jest.fn());
      res.emit('finish');
    }
    await settle();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it('writes nothing without a database connection', async () => {
    connected(0);
    const { req, res } = exchange('POST', '/api/promo', admin);
    auditTrail(req, res as never, jest.fn());
    res.emit('finish');
    await settle();
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it('masks long tokens and names the area and record', () => {
    const token = 'a'.repeat(48);
    expect(auditPath(`/api/payments/link/${token}?q=1`)).toBe('/api/payments/link/:token');
    expect(auditResource('/api/bundle-orders/admin/x')).toBe('bundle-orders');
    expect(auditResource('/api/admin/attractions/x')).toBe('attractions');
    expect(auditResourceId('/api/users/507f1f77bcf86cd799439011/password')).toBe('507f1f77bcf86cd799439011');
  });

  it('reads the record before the change only for an admin session that verifies', async () => {
    const snapshot = jest.spyOn(subjects, 'takeSnapshot').mockResolvedValue(null);
    const id = String(new Types.ObjectId());
    const tokenFor = (role: string) => generateAccessToken({ _id: new Types.ObjectId(), email: 'qa@brand.test', role, tokenVersion: 0 } as unknown as IUser);

    const challenge = generateTwoFactorChallenge({ _id: new Types.ObjectId(), email: 'qa@brand.test', role: 'manager', tokenVersion: 0 } as unknown as IUser);
    const variants: Array<Record<string, string>> = [
      {},
      { authorization: 'Bearer not-a-token' },
      { authorization: `Bearer ${tokenFor('customer')}` },
      // The password step's challenge is not a session, whatever the role in it.
      { authorization: `Bearer ${challenge}` },
    ];
    for (const headers of variants) {
      const next = jest.fn();
      const { req, res } = exchange('PATCH', `/api/attractions/${id}`, undefined, headers);
      auditTrail(req, res as never, next);
      expect(next).toHaveBeenCalledTimes(1);
    }
    expect(snapshot).not.toHaveBeenCalled();

    const next = jest.fn();
    const { req, res } = exchange('PATCH', `/api/attractions/${id}`, undefined, { authorization: `Bearer ${tokenFor('manager')}` });
    auditTrail(req, res as never, next);
    await settle();
    expect(snapshot).toHaveBeenCalledWith('listing', id, { id });
    expect(next).toHaveBeenCalledTimes(1);

    // A typed access token (audience + kind) is a session too.
    const typed = jwt.sign({ userId: String(new Types.ObjectId()), role: 'brand-admin', sessionVersion: 0, type: 'access' }, process.env.JWT_SECRET as string, { audience: 'attractions-network:access', expiresIn: '5m' });
    const typedNext = jest.fn();
    const typedExchange = exchange('PATCH', `/api/attractions/${id}`, undefined, { authorization: `Bearer ${typed}` });
    auditTrail(typedExchange.req, typedExchange.res as never, typedNext);
    await settle();
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(typedNext).toHaveBeenCalledTimes(1);
  });

  it('reads the record a percent-encoded path names, as Express routes it', async () => {
    const snapshot = jest.spyOn(subjects, 'takeSnapshot').mockResolvedValue(null);
    const token = generateAccessToken({ _id: new Types.ObjectId(), email: 'qa@brand.test', role: 'manager', tokenVersion: 0 } as unknown as IUser);
    const { req, res } = exchange('PATCH', '/api/attractions/%36ac892c8f15bfca71034790b', admin, { authorization: `Bearer ${token}` });
    auditTrail(req, res as never, jest.fn());
    await settle();
    expect(snapshot).toHaveBeenCalledWith('listing', '6ac892c8f15bfca71034790b', { id: '6ac892c8f15bfca71034790b' });
    res.emit('finish');
    await settle();
    expect((AuditLog.create as jest.Mock).mock.calls[0][0]).toMatchObject({ resourceId: '6ac892c8f15bfca71034790b', verb: 'update' });
  });

  it('files the entry under the brand that owns the record, not the brand open in the admin', async () => {
    const own = String(new Types.ObjectId());
    const other = String(new Types.ObjectId());
    const record = (title: string): RecordSnapshot => ({ subject: 'tour', label: title, brands: [other], values: { priceFrom: 900 }, fields: { priceFrom: 'value' } });
    jest.spyOn(subjects, 'takeSnapshot').mockResolvedValue({ ...record('Nile Felucca Sunset'), values: { priceFrom: 950 } });
    const shared = { ...admin, assignedTenants: [new Types.ObjectId(own), new Types.ObjectId(other)] };
    const { req, res } = exchange('PATCH', `/api/attractions/${new Types.ObjectId()}`, shared, { 'x-tenant-id': own });
    auditTrail(req, res as never, jest.fn());
    res.emit('finish');
    await settle();
    const entry = (AuditLog.create as jest.Mock).mock.calls[0][0];
    expect(String(entry.tenantId)).toBe(other);
    expect(entry).toMatchObject({ subject: 'tour', resourceLabel: 'Nile Felucca Sunset', summary: 'Changed tour: Nile Felucca Sunset' });
  });

  it('keeps only the id of a record the request created', async () => {
    const id = new Types.ObjectId();
    const snapshot = jest.spyOn(subjects, 'takeSnapshot').mockResolvedValue({ subject: 'promo-code', label: 'REEF10', brands: [], values: { code: 'REEF10', isActive: true }, fields: { code: 'value', isActive: 'value' } });
    const { req, res } = exchange('POST', '/api/promo-codes', admin);
    auditTrail(req, res as never, jest.fn());
    (res.json as unknown as (body: unknown) => void)({ success: true, data: { _id: id, code: 'REEF10', secretNote: 'never logged' } });
    res.statusCode = 201;
    res.emit('finish');
    await settle();
    expect(snapshot).toHaveBeenCalledWith('promo', String(id), {});
    const entry = (AuditLog.create as jest.Mock).mock.calls[0][0];
    expect(entry).toMatchObject({ action: 'record.create', verb: 'create', resourceId: String(id), resourceLabel: 'REEF10', changes: [{ field: 'code', after: 'REEF10' }, { field: 'isActive', after: true }] });
    expect(JSON.stringify(entry)).not.toContain('never logged');
  });
});

describe('which record a request concerns', () => {
  const id = '507f1f77bcf86cd799439011';
  const other = '507f1f77bcf86cd799439022';

  it.each([
    ['PATCH', `/api/attractions/${id}`, 'listing', 'update'],
    ['PUT', `/api/admin/attractions/${id}`, 'listing', 'update'],
    ['POST', `/api/attractions/${id}/archive`, 'listing', 'archive'],
    ['DELETE', `/api/attractions/${id}/permanent`, 'listing', 'delete-permanently'],
    ['DELETE', `/api/attractions/${id}/block-dates/2026-10-20`, 'listing', 'unblock-date'],
    ['POST', '/api/attractions', 'listing', 'create'],
    ['PUT', `/api/packages/${id}`, 'listing', 'update'],
    ['PATCH', `/api/bookings/admin/${id}`, 'booking', 'update'],
    ['POST', `/api/payments/${id}/refund`, 'booking', 'refund'],
    ['PUT', `/api/payments/gateway/${id}`, 'site', 'payment-settings'],
    ['PUT', `/api/tenants/${id}/finance`, 'siteFinance', 'finance'],
    ['PATCH', `/api/bookings/admin/${id}/attendance`, 'booking', 'attendance'],
    ['POST', '/api/users/invite', 'user', 'invite'],
    ['POST', `/api/users/${id}/revoke-sessions`, 'user', 'revoke-sessions'],
    ['PUT', `/api/tenants/${id}/sections`, 'site', 'sections'],
    ['PUT', '/api/page/admin/menu', 'site', 'menu'],
    ['PATCH', `/api/page/admin/${id}`, 'page', 'update'],
    ['PATCH', `/api/promo-codes/${id}`, 'promo', 'update'],
    ['PATCH', `/api/reviews/${id}/status`, 'review', 'status'],
    ['PUT', `/api/admin/journal/${other}/${id}`, 'journal', 'update'],
    ['PUT', `/api/admin/attraction-translations/${other}/${id}/ar`, 'tourTranslation', 'update'],
    ['POST', `/api/bundle-orders/admin/${id}/components/c-1/fulfil`, 'bundleOrder', 'fulfil'],
    ['DELETE', `/api/api-keys/${id}`, 'apiKey', 'revoke'],
  ])('%s %s -> %s %s', (method, path, spec, verb) => {
    const match = matchAuditRoute(method, path);
    expect(match?.rule.spec).toBe(spec);
    expect(match?.rule.verb).toBe(verb);
  });

  it('takes the record id, dates and translation keys from the path', () => {
    expect(matchAuditRoute('PATCH', `/api/attractions/${id.toUpperCase()}`)?.recordId).toBe(id);
    expect(matchAuditRoute('DELETE', `/api/attractions/${id}/block-dates/2026-10-20`)?.params.date).toBe('2026-10-20');
    expect(matchAuditRoute('PUT', `/api/admin/attraction-translations/${other}/${id}/de`)?.params).toMatchObject({ tenantId: other, attractionId: id, locale: 'de' });
    expect(matchAuditRoute('PATCH', '/api/attractions/not-an-id')).toBeUndefined();
    expect(matchAuditRoute('GET', `/api/attractions/${id}`)).toBeUndefined();
  });

  it('reads before the change only for an existing record', () => {
    expect(needsBeforeSnapshot(matchAuditRoute('PATCH', `/api/attractions/${id}`))).toBe(true);
    expect(needsBeforeSnapshot(matchAuditRoute('POST', '/api/attractions'))).toBe(false);
    expect(needsBeforeSnapshot(matchAuditRoute('POST', '/api/upload/image'))).toBe(false);
    expect(needsBeforeSnapshot(matchAuditRoute('PUT', '/api/page/admin/menu'))).toBe(true);
  });

  it('files creations, changes, removals and reports apart', () => {
    expect(auditActionForVerb('invite')).toBe('record.create');
    expect(auditActionForVerb('archive')).toBe('record.update');
    expect(auditActionForVerb('revoke')).toBe('record.delete');
    expect(auditActionForVerb('export')).toBe('record.export');
  });
});

describe('what changed', () => {
  const fields = { title: 'value', priceFrom: 'value', featured: 'value', description: 'name', images: 'name' } as const;
  const snap = (values: Record<string, unknown>, extra: Partial<RecordSnapshot> = {}): RecordSnapshot =>
    ({ subject: 'tour', label: String(values.title), brands: [], values, fields: { ...fields }, ...extra });

  it('lists before → after for value fields and only the names of the others', () => {
    const { changes, changedFields } = diffSnapshots(
      snap({ title: 'Giftun', priceFrom: 45, featured: false, description: 'Old long text', images: ['a.jpg'] }),
      snap({ title: 'Giftun', priceFrom: 49, featured: true, description: 'New long text', images: ['a.jpg'] }),
    );
    expect(changes).toEqual([{ field: 'priceFrom', before: 45, after: 49 }, { field: 'featured', before: false, after: true }]);
    expect(changedFields).toEqual(['description']);
    expect(JSON.stringify({ changes, changedFields })).not.toContain('long text');
  });

  it('lists what a new record was set to and what a deleted one had', () => {
    expect(diffSnapshots(undefined, snap({ title: 'Giftun', priceFrom: 45, featured: false, description: 'x' }), { created: true }).changes)
      .toEqual([{ field: 'title', after: 'Giftun' }, { field: 'priceFrom', after: 45 }, { field: 'featured', after: false }]);
    expect(diffSnapshots(snap({ title: 'Giftun', priceFrom: 45 }), null).changes)
      .toEqual([{ field: 'title', before: 'Giftun' }, { field: 'priceFrom', before: 45 }]);
  });

  it('claims nothing without a picture from before the change', () => {
    expect(diffSnapshots(undefined, snap({ title: 'Giftun', priceFrom: 49 }))).toEqual({ changes: [], changedFields: [] });
  });

  it('keeps a customer account to role and status even when the other side is a team member', () => {
    const team = snap({ role: 'customer', status: 'active', firstName: 'Guest' }, { fields: { role: 'value', status: 'value', firstName: 'value' } });
    const customer = snap({ role: 'customer', status: 'suspended', firstName: 'Changed' }, { fields: { role: 'value', status: 'value' } });
    expect(diffSnapshots(team, customer).changes).toEqual([{ field: 'status', before: 'active', after: 'suspended' }]);
  });

  it('keeps values short and lists small, and treats objects as name-only', () => {
    expect(auditValue('x'.repeat(500))).toHaveLength(160);
    expect(auditValue(Array.from({ length: 21 }, (_, index) => index))).toBeUndefined();
    expect(auditValue({ nested: true })).toBeUndefined();
    expect(auditValue(new Date('2026-10-09T10:00:00.000Z'))).toBe('2026-10-09T10:00:00.000Z');
    expect(auditValue('')).toBeNull();
    const { changes, changedFields } = diffSnapshots(snap({ title: { en: 'A' } }), snap({ title: { en: 'B' } }));
    expect(changes).toEqual([]);
    expect(changedFields).toEqual(['title']);
  });

  it('caps the number of changes kept on one entry', () => {
    const many = Object.fromEntries(Array.from({ length: 70 }, (_, index) => [`f${index}`, 'value']));
    const before = { subject: 'tour', brands: [], values: Object.fromEntries(Object.keys(many).map((key) => [key, 1])), fields: many } as RecordSnapshot;
    const after = { ...before, values: Object.fromEntries(Object.keys(many).map((key) => [key, 2])) };
    expect(diffSnapshots(before, after).changes).toHaveLength(subjects.MAX_CHANGES);
  });
});

describe('privacy allow-list', () => {
  const NEVER = /password|token|twofactor|2fa|secret|hashedkey|keyprefix|previewaccess|paymentsettings|paymentstatus|stripe|guestdetails|refund|card|cvv|iban|customer(?:email|phone|name|details|contact|note)/i;
  const NO_VALUES = /email|phone|address|street|message|content|comment|author/i;

  it.each(AUDIT_SPEC_KEYS)('%s never names a private field and keeps no contact values', (key) => {
    const spec = subjectSpec(key);
    for (const [field, mode] of Object.entries(spec.fields)) {
      expect(field).not.toMatch(NEVER);
      if (mode === 'value') expect(field).not.toMatch(NO_VALUES);
    }
    for (const field of spec.identity) expect(field).not.toMatch(NEVER);
  });

  it('keeps booked items (pickup hotel and room) off the booking list', () => {
    expect(Object.keys(subjectSpec('booking').fields)).not.toContain('items');
  });

  it('marks only categories and destinations as records no brand owns', () => {
    expect(AUDIT_SPEC_KEYS.filter((key) => subjectSpec(key).global)).toEqual(['category', 'destination']);
  });

  it('never names a customer account and reports only its role and status', () => {
    const spec = subjectSpec('user');
    const customer = { role: 'customer', firstName: 'Private', lastName: 'Guest', email: 'guest@example.test' };
    expect(spec.label?.(customer)).toBeUndefined();
    expect(Object.keys(spec.fieldsFor!(customer))).toEqual(['role', 'status']);
    expect(spec.label?.({ role: 'manager', firstName: 'Operations', lastName: 'Lead' })).toBe('Operations Lead');
  });

  it('reads only the id from a reply, never keys, secrets or links in it', () => {
    const id = new Types.ObjectId();
    expect(createdRecordId({ data: { id, key: 'an_live_secret', secret: 'whsec_x', inviteUrl: 'https://x/accept?token=y' } })).toBe(String(id));
    expect(createdRecordId({ data: { offers: [], createdCount: 2 } })).toBeUndefined();
    expect(createdRecordId({ data: { tenantId: new Types.ObjectId() } })).toBeUndefined();
  });
});

describe('brand attribution', () => {
  const a = String(new Types.ObjectId());
  const b = String(new Types.ObjectId());
  const manager = (brands: string[]) => ({ role: 'manager', assignedTenants: brands.map((id) => new Types.ObjectId(id)) });

  it('keeps the open brand only when the record belongs to it and the person works for it', () => {
    expect(attributeBrand({ recordBrands: [a, b], requestTenant: b, actor: manager([a, b]) })).toBe(b);
    expect(attributeBrand({ recordBrands: [b], requestTenant: a, actor: manager([a, b]) })).toBe(b);
    expect(attributeBrand({ recordBrands: [a, b], requestTenant: b, actor: manager([a]) })).toBe(a);
  });

  it('files an outsider\'s attempt under the brand that owns the record', () => {
    expect(attributeBrand({ recordBrands: [b], requestTenant: a, actor: manager([a]) })).toBe(b);
  });

  it('uses the owner for a super admin with no brand open, and the open brand for records no brand owns', () => {
    expect(attributeBrand({ recordBrands: [a, b], actor: { role: 'super-admin' } })).toBe(a);
    expect(attributeBrand({ recordBrands: [], requestTenant: a, actor: manager([a]) })).toBe(a);
    expect(attributeBrand({ recordBrands: [], actor: manager([a]) })).toBeUndefined();
  });

  it('never files anything under a brand the person does not work for because a header named it', () => {
    expect(attributeBrand({ recordBrands: [], requestTenant: b, actor: manager([a]) })).toBeUndefined();
    expect(attributeBrand({ recordBrands: [], requestTenant: b, actor: { role: 'super-admin' } })).toBe(b);
  });
});

describe('summaries and the CSV report', () => {
  it('writes plain summaries, naming the record and how a refused request ended', () => {
    expect(auditSummary('update', 'tour', 'Giftun Reef Snorkel Day', 'success')).toBe('Changed tour: Giftun Reef Snorkel Day');
    expect(auditSummary('delete', 'tour', 'Nile Felucca Sunset', 'failure', 404)).toBe('Tried to delete tour: Nile Felucca Sunset (refused)');
    expect(auditSummary('update', 'site', undefined, 'failure', 500)).toBe('Tried to change site (failed)');
    expect(auditSummary('upload', 'image', undefined, 'success')).toBe('Uploaded images');
    expect(auditSummary('export', 'user-log', '12 entries', 'success')).toBe('Exported user log: 12 entries');
  });

  it('neutralises cells a spreadsheet would run as formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    for (const value of ['+1', '-1', '@sum', '\tx', '\rx', '  =x']) expect(csvCell(value).startsWith('"\'')).toBe(true);
    expect(csvCell('Giftun "Reef"')).toBe('"Giftun ""Reef"""');
    expect(csvCell(null)).toBe('""');
  });

  it('gives Cairo time in summer and winter', () => {
    expect(cairoTime('2026-10-09T09:46:31.000Z')).toBe('2026-10-09 12:46:31');
    expect(cairoTime('2026-12-01T10:00:00.000Z')).toBe('2026-12-01 12:00:00');
    expect(cairoDate('2026-10-09T22:30:00.000Z')).toBe('2026-10-10');
    expect(startOfCairoDay(new Date('2026-10-09T21:30:00.000Z')).toISOString()).toBe('2026-10-09T21:00:00.000Z');
    expect(startOfCairoDay(new Date('2026-12-01T10:00:00.000Z')).toISOString()).toBe('2026-11-30T22:00:00.000Z');
  });

  it('writes changes, results and devices as people read them', () => {
    expect(changesText([
      { field: 'priceFrom', before: 45, after: 49 },
      { field: 'featured', before: false, after: true },
      { field: 'validFrom', after: '2026-10-01T00:00:00.000Z' },
      { field: 'title', before: 'Old title' },
      { field: 'sectionAccess', before: null, after: ['tours', 'attractions'] },
    ])).toBe('Price from: 45 → 49; Featured: No → Yes; Valid from: 2026-10-01; Title was Old title; Sections: Not set → tours, attractions');
    expect(deviceText('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36')).toBe('Chrome · macOS');
    const row = auditCsvRow({
      id: 'e1', action: 'record.update', outcome: 'failure', actor: { email: 'ops@brand.test', name: 'Ops Lead', role: 'manager' },
      method: 'PATCH', path: '/api/attractions/1', resource: 'attractions', subject: 'tour', resourceLabel: '=cmd', summary: null,
      changes: [], changedFields: ['description'], brand: null, statusCode: 403, ip: '203.0.113.9', userAgent: null, createdAt: '2026-10-09T09:46:31.000Z',
    }, false);
    expect(row).toBe('"2026-10-09 12:46:31","2026-10-09T09:46:31.000Z","Ops Lead","ops@brand.test","Manager","Refused (403)","Changed (attractions)","Tour","\'=cmd","","","Description","203.0.113.9","","e1"\r\n');
    expect(auditCsvHeader(true)).toContain('"Request"');
    expect(auditCsvHeader(false)).not.toContain('Request');
  });
});
