/**
 * User log brand scope: a brand admin reads what happened on their own brands and the sign-ins of
 * their own team, and nothing that happened on another brand, even when the person who did it
 * also works for theirs. A team member shared between two brands is the case that matters: their
 * work for the other brand (its name, the records they touched, where they signed in from) belongs
 * to that brand only.
 */
import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AuditLog } from '../models/AuditLog';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { listAuditLogs } from '../controllers/auditLogs.controller';
import { AuthRequest } from '../types';

jest.setTimeout(120_000);

let mongo: MongoMemoryServer;

const ownBrand = new Types.ObjectId();
const otherBrand = new Types.ObjectId();
const brandAdminId = new Types.ObjectId();
const sharedMemberId = new Types.ObjectId();
const ownOnlyMemberId = new Types.ObjectId();
const otherOnlyMemberId = new Types.ObjectId();
const formerMemberId = new Types.ObjectId();
const superAdminId = new Types.ObjectId();

const brandAdmin = { _id: brandAdminId, role: 'brand-admin', assignedTenants: [ownBrand] };

type Row = { id: string; action: string; path: string | null; brand: { id: string; name: string } | null; actor: { id: string | null } };

const list = async (caller: Record<string, unknown>, query: Record<string, string> = {}) => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  const next = jest.fn();
  await listAuditLogs({ query, user: caller, headers: {}, params: {} } as unknown as AuthRequest, res, next);
  expect(next).not.toHaveBeenCalled();
  return { status: res.status.mock.calls[0][0] as number, body: res.json.mock.calls[0][0] };
};

const entry = (actorId: Types.ObjectId, actorRole: string, action: string, path: string | null, tenantId?: Types.ObjectId) => ({
  _id: new Types.ObjectId(),
  action,
  outcome: 'success',
  actorId,
  actorEmail: `${String(actorId).slice(-6)}@example.test`,
  actorRole,
  ...(path ? { method: 'PATCH', path, resource: 'attractions' } : {}),
  ...(tenantId ? { tenantId } : {}),
  ip: '203.0.113.7',
  createdAt: new Date(),
});

const seen = {
  sharedOnOwn: entry(sharedMemberId, 'manager', 'record.update', '/api/attractions/own-brand-listing', ownBrand),
  sharedOnOther: entry(sharedMemberId, 'manager', 'record.update', '/api/attractions/other-brand-listing', otherBrand),
  sharedUnattributed: entry(sharedMemberId, 'manager', 'record.update', '/api/attractions/unattributed-listing'),
  sharedSignIn: entry(sharedMemberId, 'manager', 'auth.login', null),
  sharedSignInOnOther: entry(sharedMemberId, 'manager', 'auth.login', null, otherBrand),
  ownOnlyUnattributed: entry(ownOnlyMemberId, 'editor', 'record.update', '/api/attractions/own-only-member-listing'),
  otherOnlyOnOther: entry(otherOnlyMemberId, 'manager', 'record.update', '/api/attractions/other-member-listing', otherBrand),
  formerOnOwn: entry(formerMemberId, 'manager', 'record.delete', '/api/attractions/former-member-listing', ownBrand),
  superOnOwn: entry(superAdminId, 'super-admin', 'record.update', '/api/attractions/super-admin-listing', ownBrand),
};

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  mongo = await MongoMemoryServer.create(systemBinary ? { binary: { systemBinary } } : {});
  await mongoose.connect(mongo.getUri('audit_log_brand_scope'));
  await Tenant.collection.insertMany([
    { _id: ownBrand, slug: 'own-brand', domain: 'own-brand.invalid', name: 'Own Brand' },
    { _id: otherBrand, slug: 'other-brand', domain: 'other-brand.invalid', name: 'Other Brand' },
  ]);
  const member = (_id: Types.ObjectId, role: string, assignedTenants: Types.ObjectId[]) => ({
    _id, email: `${String(_id).slice(-6)}@example.test`, password: 'x'.repeat(20), firstName: 'Team', lastName: role, role, status: 'active', assignedTenants, interfaceLocale: 'en',
  });
  await User.collection.insertMany([
    member(brandAdminId, 'brand-admin', [ownBrand]),
    member(sharedMemberId, 'manager', [ownBrand, otherBrand]),
    member(ownOnlyMemberId, 'editor', [ownBrand]),
    member(otherOnlyMemberId, 'manager', [otherBrand]),
    // Moved to the other brand after deleting a listing on ours.
    member(formerMemberId, 'manager', [otherBrand]),
    member(superAdminId, 'super-admin', []),
  ]);
  await AuditLog.collection.insertMany(Object.values(seen));
});

afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

const ids = (rows: Row[]) => new Set(rows.map((row) => row.id));

describe('user log brand scope', () => {
  it("shows a brand admin their brand's activity and their team's sign-ins, never another brand's", async () => {
    const { status, body } = await list(brandAdmin);
    expect(status).toBe(200);
    const rows = body.data.data as Row[];
    const visible = ids(rows);

    expect(visible.has(String(seen.sharedOnOwn._id))).toBe(true);
    expect(visible.has(String(seen.sharedSignIn._id))).toBe(true);
    expect(visible.has(String(seen.ownOnlyUnattributed._id))).toBe(true);
    // A change made on our brand stays in our log after the person moves on.
    expect(visible.has(String(seen.formerOnOwn._id))).toBe(true);

    expect(visible.has(String(seen.sharedOnOther._id))).toBe(false);
    expect(visible.has(String(seen.otherOnlyOnOther._id))).toBe(false);
    // Not attributable to a brand and done by someone who also works elsewhere: it may concern
    // the other brand, so it stays out.
    expect(visible.has(String(seen.sharedUnattributed._id))).toBe(false);
    expect(visible.has(String(seen.superOnOwn._id))).toBe(false);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('Other Brand');
    expect(serialized).not.toContain('other-brand');
    expect(serialized).not.toContain(String(otherBrand));
  });

  it('shows a team sign-in made while another brand was open without naming that brand', async () => {
    const { body } = await list(brandAdmin, { action: 'auth.*' });
    const rows = body.data.data as Row[];
    const signIn = rows.find((row) => row.id === String(seen.sharedSignInOnOther._id));
    expect(signIn).toBeDefined();
    expect(signIn?.brand).toBeNull();
  });

  it('keeps the brand scope when filtering by one person', async () => {
    const { body } = await list(brandAdmin, { actorId: String(sharedMemberId) });
    const visible = ids(body.data.data as Row[]);
    expect(visible.has(String(seen.sharedOnOwn._id))).toBe(true);
    expect(visible.has(String(seen.sharedOnOther._id))).toBe(false);
    expect(visible.has(String(seen.sharedUnattributed._id))).toBe(false);
  });

  it('returns nothing to a brand admin filtering by someone outside their brands', async () => {
    const { body } = await list(brandAdmin, { actorId: String(otherOnlyMemberId) });
    expect(body.data.data).toEqual([]);
  });

  it('keeps the brand scope on the second page', async () => {
    const first = await list(brandAdmin, { limit: '2' });
    const cursor = first.body.data.pagination.nextCursor as string;
    expect(cursor).toBeTruthy();
    const rest = await list(brandAdmin, { limit: '100', cursor });
    const all = [...first.body.data.data, ...rest.body.data.data] as Row[];
    expect(new Set(all.map((row) => row.id)).size).toBe(all.length);
    expect(JSON.stringify(all)).not.toContain('Other Brand');
    expect(ids(all).has(String(seen.sharedOnOther._id))).toBe(false);
  });

  it('shows a super admin everything', async () => {
    const { body } = await list({ _id: superAdminId, role: 'super-admin', assignedTenants: [] }, { limit: '100' });
    expect((body.data.data as Row[]).length).toBe(Object.keys(seen).length);
  });

  it('shows a brand admin with no brand nothing', async () => {
    const { body } = await list({ _id: brandAdminId, role: 'brand-admin', assignedTenants: [] });
    expect(body.data.data).toEqual([]);
  });
});
