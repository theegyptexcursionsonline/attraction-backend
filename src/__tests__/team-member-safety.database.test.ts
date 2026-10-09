/**
 * Team members safety: the platform always keeps one active super admin, an invitation can be
 * withdrawn by whoever may manage the invitee (a brand admin only for their own brands), pending
 * rows say when their invitation expires, and the access email describes what actually changed.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { deleteUser, getUsers, updateUser, withdrawInvitation } from '../controllers/users.controller';
import { sendAccessChangedEmail } from '../services/email.service';
import { AuthRequest } from '../types';

jest.mock('../services/email.service', () => ({
  sendAccessChangedEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: jest.fn(),
  sendUserInvitation: jest.fn(),
  invitationLink: jest.fn(),
}));
jest.setTimeout(120_000);

let mongo: MongoMemoryServer;
const ownBrand = new Types.ObjectId();
const otherBrand = new Types.ObjectId();
const ownerId = new Types.ObjectId();
const secondOwnerId = new Types.ObjectId();
const brandAdminId = new Types.ObjectId();
const memberId = new Types.ObjectId();
const inviteId = new Types.ObjectId();
const sharedInviteId = new Types.ObjectId();
const otherInviteId = new Types.ObjectId();

const owner = { _id: ownerId, role: 'super-admin', status: 'active', assignedTenants: [], firstName: 'Platform', lastName: 'Owner' };
const brandAdmin = { _id: brandAdminId, role: 'brand-admin', status: 'active', assignedTenants: [ownBrand], firstName: 'Brand', lastName: 'Admin' };

const respond = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
};

const call = async (handler: typeof updateUser, caller: Record<string, unknown>, extra: Record<string, unknown>) => {
  const res = respond();
  const next = jest.fn();
  await handler({ params: {}, body: {}, query: {}, headers: {}, user: caller, ...extra } as unknown as AuthRequest, res, next);
  expect(next.mock.calls[0]?.[0]?.message ?? null).toBeNull();
  return { status: res.status.mock.calls[0][0] as number, body: res.json.mock.calls[0][0] };
};

const update = (caller: Record<string, unknown>, id: Types.ObjectId, body: Record<string, unknown>) =>
  call(updateUser, caller, { params: { id: String(id) }, body });
const withdraw = (caller: Record<string, unknown>, id: Types.ObjectId | string) =>
  call(withdrawInvitation, caller, { params: { id: String(id) } });
const stored = (id: Types.ObjectId) => User.findById(id).lean();

/** The access email is sent detached from the response; wait for it (or for it not to come). */
const emailCalls = async (expected: number) => {
  const mock = sendAccessChangedEmail as jest.Mock;
  for (let i = 0; i < 50 && mock.mock.calls.length < expected; i += 1) await new Promise((r) => setTimeout(r, 20));
  if (expected === 0) await new Promise((r) => setTimeout(r, 150));
  return mock.mock.calls;
};

const member = (id: Types.ObjectId, email: string, fields: Record<string, unknown>) => ({
  _id: id, email, password: 'x'.repeat(20), firstName: 'Team', lastName: 'Member', interfaceLocale: 'en', tokenVersion: 0, ...fields,
});

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  mongo = await MongoMemoryServer.create(systemBinary ? { binary: { systemBinary } } : {});
  await mongoose.connect(mongo.getUri('team_member_safety'));
  await Tenant.collection.insertMany([
    { _id: ownBrand, slug: 'own-brand', domain: 'own-brand.invalid', name: 'Own Brand' },
    { _id: otherBrand, slug: 'other-brand', domain: 'other-brand.invalid', name: 'Other Brand', enabledSections: ['tours'] },
  ]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  jest.restoreAllMocks();
  (sendAccessChangedEmail as jest.Mock).mockClear();
  await User.collection.deleteMany({});
  await User.collection.insertMany([
    member(ownerId, 'owner@example.test', { role: 'super-admin', status: 'active', assignedTenants: [], lastLogin: new Date() }),
    member(brandAdminId, 'brand-admin@example.test', { role: 'brand-admin', status: 'active', assignedTenants: [ownBrand], lastLogin: new Date() }),
    member(memberId, 'member@example.test', { role: 'manager', status: 'active', assignedTenants: [ownBrand], lastLogin: new Date(), passwordResetExpires: new Date(Date.now() + 3_600_000) }),
    member(inviteId, 'invite@example.test', { role: 'manager', status: 'pending', assignedTenants: [ownBrand], passwordResetToken: 'hash', passwordResetExpires: new Date(Date.now() + 5 * 86_400_000) }),
    member(sharedInviteId, 'shared-invite@example.test', { role: 'editor', status: 'pending', assignedTenants: [ownBrand, otherBrand], passwordResetToken: 'hash', passwordResetExpires: new Date(Date.now() + 86_400_000) }),
    member(otherInviteId, 'other-invite@example.test', { role: 'editor', status: 'pending', assignedTenants: [otherBrand], passwordResetToken: 'hash', passwordResetExpires: new Date(Date.now() - 86_400_000) }),
  ]);
});

describe('the last active super admin', () => {
  const LAST_OWNER = 'Keep at least one active super admin: make someone else a super admin first.';

  it('cannot demote themselves', async () => {
    const { status, body } = await update(owner, ownerId, { role: 'brand-admin' });
    expect(status).toBe(409);
    expect(body.error ?? body.message).toBe(LAST_OWNER);
    expect((await stored(ownerId))?.role).toBe('super-admin');
    expect((await stored(ownerId))?.tokenVersion).toBe(0);
  });

  it('cannot deactivate or suspend themselves', async () => {
    for (const next of ['inactive', 'suspended', 'pending']) {
      const { status } = await update(owner, ownerId, { status: next });
      expect(status).toBe(409);
    }
    expect((await stored(ownerId))?.status).toBe('active');
  });

  it('does not count a super admin who has not joined', async () => {
    await User.collection.insertOne(member(secondOwnerId, 'second-owner@example.test', { role: 'super-admin', status: 'pending', assignedTenants: [] }));
    expect((await update(owner, ownerId, { status: 'inactive' })).status).toBe(409);
  });

  it('can step down once another active super admin exists', async () => {
    await User.collection.insertOne(member(secondOwnerId, 'second-owner@example.test', { role: 'super-admin', status: 'active', assignedTenants: [] }));
    expect((await update(owner, ownerId, { role: 'brand-admin', assignedTenants: [String(ownBrand)] })).status).toBe(200);
    expect((await stored(ownerId))?.role).toBe('brand-admin');
  });

  it('may still have a name change saved', async () => {
    expect((await update(owner, ownerId, { firstName: 'Owner QA', role: 'super-admin', status: 'active' })).status).toBe(200);
    expect((await stored(ownerId))?.firstName).toBe('Owner QA');
  });

  it('is restored when two owners removed each other at the same moment', async () => {
    await User.collection.insertOne(member(secondOwnerId, 'second-owner@example.test', { role: 'super-admin', status: 'active', assignedTenants: [] }));
    // The check before saving saw another owner; by the time the save landed there was none.
    const counts = jest.spyOn(User, 'countDocuments');
    counts.mockResolvedValueOnce(1 as never).mockResolvedValueOnce(0 as never);
    const { status, body } = await update(owner, secondOwnerId, { status: 'inactive' });
    expect(status).toBe(409);
    expect(body.error ?? body.message).toBe(LAST_OWNER);
    const restored = await stored(secondOwnerId);
    expect(restored?.role).toBe('super-admin');
    expect(restored?.status).toBe('active');
    expect(await emailCalls(0)).toHaveLength(0);
  });

  it('cannot be removed (defensive: the route already refuses deleting yourself)', async () => {
    const staleCaller = { ...owner, _id: new Types.ObjectId() };
    const { status } = await call(deleteUser, staleCaller, { params: { id: String(ownerId) } });
    expect(status).toBe(409);
    expect(await stored(ownerId)).not.toBeNull();
  });

  it('lets a super admin remove another super admin while one stays', async () => {
    await User.collection.insertOne(member(secondOwnerId, 'second-owner@example.test', { role: 'super-admin', status: 'active', assignedTenants: [] }));
    expect((await call(deleteUser, owner, { params: { id: String(secondOwnerId) } })).status).toBe(200);
    expect(await stored(secondOwnerId)).toBeNull();
  });
});

describe('withdrawing an invitation', () => {
  it('deletes a pending invitee who never joined', async () => {
    const { status, body } = await withdraw(owner, inviteId);
    expect(status).toBe(200);
    expect(body.data).toEqual({ id: String(inviteId), accountRemoved: true });
    expect(await stored(inviteId)).toBeNull();
  });

  it('refuses someone who has joined — deactivate them instead', async () => {
    expect((await withdraw(owner, memberId)).status).toBe(409);
    expect(await stored(memberId)).not.toBeNull();
    // Pending again after having signed in (set back by an admin): still a joined account.
    await User.updateOne({ _id: memberId }, { $set: { status: 'pending' } });
    const { status, body } = await withdraw(owner, memberId);
    expect(status).toBe(409);
    expect(body.error ?? body.message).toBe('This person has already joined. Deactivate them instead.');
  });

  it('hides an invitee on another brand from a brand admin', async () => {
    expect((await withdraw(brandAdmin, otherInviteId)).status).toBe(404);
    expect(await stored(otherInviteId)).not.toBeNull();
  });

  it('removes only the brand admin\'s own brands from an invitee shared with another brand', async () => {
    const { status, body } = await withdraw(brandAdmin, sharedInviteId);
    expect(status).toBe(200);
    expect(body.data).toEqual({ id: String(sharedInviteId), accountRemoved: false });
    expect(JSON.stringify(body)).not.toContain('Other Brand');
    const left = await stored(sharedInviteId);
    expect(left?.status).toBe('pending');
    expect((left?.assignedTenants || []).map(String)).toEqual([String(otherBrand)]);
  });

  it('lets a brand admin delete an invitee who is only on their brands', async () => {
    expect((await withdraw(brandAdmin, inviteId)).status).toBe(200);
    expect(await stored(inviteId)).toBeNull();
  });

  it('refuses a brand admin withdrawing a fellow brand admin\'s invitation', async () => {
    await User.updateOne({ _id: inviteId }, { $set: { role: 'brand-admin' } });
    expect((await withdraw(brandAdmin, inviteId)).status).toBe(403);
    expect(await stored(inviteId)).not.toBeNull();
  });

  it('lets a super admin withdraw any invitation, every brand at once', async () => {
    const { status, body } = await withdraw(owner, sharedInviteId);
    expect(status).toBe(200);
    expect(body.data.accountRemoved).toBe(true);
    expect(await stored(sharedInviteId)).toBeNull();
  });

  it('treats travellers and unknown ids as not found', async () => {
    const customerId = new Types.ObjectId();
    await User.collection.insertOne(member(customerId, 'guest@example.test', { role: 'customer', status: 'pending', assignedTenants: [] }));
    expect((await withdraw(owner, customerId)).status).toBe(404);
    expect((await withdraw(owner, new Types.ObjectId())).status).toBe(404);
    expect((await withdraw(owner, 'not-an-id')).status).toBe(404);
  });

  it('is a DELETE behind the admin role gate, so the User log records it as a removal', () => {
    const routes = fs.readFileSync(path.resolve(__dirname, '../routes/users.routes.ts'), 'utf8');
    expect(routes).toMatch(/router\.delete\(\s*'\/:id\/invitation',\s*authenticate,\s*requireRole\('super-admin', 'brand-admin'\),\s*withdrawInvitation\s*\)/);
  });
});

describe('invitation expiry on the Team list', () => {
  it('is shown for pending rows only', async () => {
    const res = respond();
    const next = jest.fn();
    await getUsers({ query: {}, headers: {}, params: {}, user: owner } as unknown as AuthRequest, res, next);
    expect(next).not.toHaveBeenCalled();
    const rows: Array<Record<string, unknown>> = res.json.mock.calls[0][0].data;
    const byEmail = (email: string) => rows.find((row) => row.email === email)!;
    expect(new Date(byEmail('invite@example.test').invitationExpiresAt as string).getTime()).toBeGreaterThan(Date.now() + 4 * 86_400_000);
    expect(new Date(byEmail('other-invite@example.test').invitationExpiresAt as string).getTime()).toBeLessThan(Date.now());
    // An active member's password-reset expiry is never exposed.
    expect(byEmail('member@example.test')).not.toHaveProperty('invitationExpiresAt');
    expect(JSON.stringify(rows)).not.toContain('passwordResetExpires');
  });

  it('is null for a pending invitee whose link was used up', async () => {
    await User.updateOne({ _id: inviteId }, { $unset: { passwordResetExpires: 1, passwordResetToken: 1 } });
    const res = respond();
    await getUsers({ query: { status: 'pending' }, headers: {}, params: {}, user: brandAdmin } as unknown as AuthRequest, res, jest.fn());
    const row = res.json.mock.calls[0][0].data.find((user: { email: string }) => user.email === 'invite@example.test');
    expect(row.invitationExpiresAt).toBeNull();
  });
});

describe('the access email', () => {
  it('is sent for a sections-only change, names the sections and does not claim a sign-out', async () => {
    const { status } = await update(owner, memberId, { sectionAccess: ['tours', 'packages'] });
    expect(status).toBe(200);
    expect((await stored(memberId))?.tokenVersion).toBe(0);
    const calls = await emailCalls(1);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('member@example.test');
    expect(calls[0][1]).toMatchObject({ role: 'manager', status: 'active', siteNames: ['Own Brand'], sectionNames: ['Tours', 'Packages'], signedOut: false });
  });

  it('says the person was signed out when a role change revoked their sessions', async () => {
    expect((await update(owner, memberId, { role: 'editor' })).status).toBe(200);
    expect((await stored(memberId))?.tokenVersion).toBe(1);
    const calls = await emailCalls(1);
    expect(calls).toHaveLength(1);
    // Every section the member's brand has on.
    expect(calls[0][1]).toMatchObject({ role: 'editor', signedOut: true, sectionNames: null });
  });

  it('lists only the sections the member\'s brands have on', async () => {
    await User.updateOne({ _id: memberId }, { $set: { assignedTenants: [otherBrand] } });
    expect((await update(owner, memberId, { role: 'viewer' })).status).toBe(200);
    expect((await emailCalls(1))[0][1]).toMatchObject({ sectionNames: ['Tours'], siteNames: ['Other Brand'] });
  });

  it('is not sent for a name change', async () => {
    expect((await update(owner, memberId, { firstName: 'Renamed' })).status).toBe(200);
    expect(await emailCalls(0)).toHaveLength(0);
  });
});
