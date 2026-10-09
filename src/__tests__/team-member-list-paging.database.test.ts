/**
 * The Team members screen pages through the database and shows totals counted by the database.
 * The page and the totals must agree with each other and with the caller's scope: a brand admin
 * counts only members of their own brands and never a super admin, a member shared between
 * brands is counted once, customers are never team members, and every member stays reachable
 * by paging, even when many were created in the same instant.
 */
import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { getTeamSummary, getUsers } from '../controllers/users.controller';
import { AuthRequest } from '../types';

jest.setTimeout(120_000);

let mongo: MongoMemoryServer;
const brandA = new Types.ObjectId();
const brandB = new Types.ObjectId();

const brandAdminA = { _id: new Types.ObjectId(), role: 'brand-admin', assignedTenants: [brandA] };
const managerB = { _id: new Types.ObjectId(), role: 'manager', assignedTenants: [brandB] };
const superAdmin = { _id: new Types.ObjectId(), role: 'super-admin', assignedTenants: [] };

const respond = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
};

const call = async (handler: typeof getUsers, caller: Record<string, unknown>, query: Record<string, unknown> = {}) => {
  const res = respond();
  const next = jest.fn();
  await handler({ query, params: {}, body: {}, headers: {}, user: caller } as unknown as AuthRequest, res, next);
  expect(next.mock.calls[0]?.[0]?.message ?? null).toBeNull();
  return { status: res.status.mock.calls[0][0] as number, body: res.json.mock.calls[0][0] };
};

const summary = async (caller: Record<string, unknown>, query: Record<string, unknown> = {}) => call(getTeamSummary, caller, query);
const listTotal = async (caller: Record<string, unknown>, query: Record<string, unknown> = {}) =>
  (await call(getUsers, caller, { page: '1', limit: '1', ...query })).body.pagination.total as number;

const person = (fields: Record<string, unknown>) => ({
  _id: new Types.ObjectId(),
  password: 'x'.repeat(20),
  interfaceLocale: 'en',
  firstName: 'Team',
  lastName: 'Member',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  ...fields,
});

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  mongo = await MongoMemoryServer.create(systemBinary ? { binary: { systemBinary } } : {});
  await mongoose.connect(mongo.getUri('team_member_list_paging'));
  await Tenant.collection.insertMany([
    { _id: brandA, slug: 'brand-a', domain: 'brand-a.invalid', name: 'Brand A' },
    { _id: brandB, slug: 'brand-b', domain: 'brand-b.invalid', name: 'Brand B' },
  ]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

describe('Team members totals (GET /users/summary)', () => {
  beforeEach(async () => {
    await User.collection.deleteMany({});
    await User.collection.insertMany([
      person({ email: 'owner@example.test', role: 'super-admin', status: 'active', assignedTenants: [] }),
      // Legacy seed data tied a super admin to a brand; a brand's own admins must still never count them.
      person({ email: 'legacy-owner@example.test', role: 'super-admin', status: 'active', assignedTenants: [brandA] }),
      person({ email: 'brand-admin-a@example.test', role: 'brand-admin', status: 'active', assignedTenants: [brandA] }),
      person({ email: 'manager-a@example.test', role: 'manager', status: 'active', assignedTenants: [brandA] }),
      person({ email: 'invited-a@example.test', role: 'editor', status: 'pending', assignedTenants: [brandA] }),
      person({ email: 'paused-a@example.test', role: 'viewer', status: 'inactive', assignedTenants: [brandA] }),
      person({ email: 'shared@example.test', role: 'manager', status: 'active', assignedTenants: [brandA, brandB] }),
      person({ email: 'editor-b@example.test', role: 'editor', status: 'active', assignedTenants: [brandB] }),
      person({ email: 'suspended-b@example.test', role: 'viewer', status: 'suspended', assignedTenants: [brandB] }),
      // Travellers are never team members, even when an account is tied to a brand.
      person({ email: 'traveller@example.test', role: 'customer', status: 'active', assignedTenants: [brandA] }),
      person({ email: 'guest@example.test', role: 'guest', status: 'active', assignedTenants: [brandB] }),
    ]);
  });

  it('counts every team member for a super admin, by role and by status', async () => {
    const { status, body } = await summary(superAdmin);
    expect(status).toBe(200);
    expect(body.data).toEqual({
      total: 9,
      byRole: { 'super-admin': 2, 'brand-admin': 1, manager: 2, editor: 2, viewer: 2 },
      byStatus: { active: 6, pending: 1, inactive: 1, suspended: 1 },
    });
  });

  it('counts only a brand admin\'s own brand, once per person, and never a super admin', async () => {
    const { status, body } = await summary(brandAdminA);
    expect(status).toBe(200);
    expect(body.data).toEqual({
      total: 5,
      byRole: { 'brand-admin': 1, manager: 2, editor: 1, viewer: 1 },
      byStatus: { active: 3, pending: 1, inactive: 1, suspended: 0 },
    });
    expect(JSON.stringify(body)).not.toContain('super-admin');
  });

  it('scopes a manager the same way', async () => {
    const { body } = await summary(managerB);
    expect(body.data).toEqual({
      total: 3,
      byRole: { 'brand-admin': 0, manager: 1, editor: 1, viewer: 1 },
      byStatus: { active: 2, pending: 0, inactive: 0, suspended: 1 },
    });
  });

  it('agrees with the list for every role and status filter the screen offers', async () => {
    for (const caller of [superAdmin, brandAdminA, managerB]) {
      const { body } = await summary(caller);
      expect(await listTotal(caller)).toBe(body.data.total);
      for (const [role, count] of Object.entries(body.data.byRole)) {
        expect([caller.role, role, await listTotal(caller, { role })]).toEqual([caller.role, role, count]);
      }
      for (const [state, count] of Object.entries(body.data.byStatus)) {
        expect([caller.role, state, await listTotal(caller, { status: state })]).toEqual([caller.role, state, count]);
      }
    }
  });

  it('counts one site for a super admin who picks it', async () => {
    const { body } = await summary(superAdmin, { tenantId: String(brandB) });
    expect(body.data.total).toBe(3);
    expect(body.data.byRole).toEqual({ 'super-admin': 0, 'brand-admin': 0, manager: 1, editor: 1, viewer: 1 });
  });

  it('refuses another brand\'s site and an invalid site id, like the list does', async () => {
    expect((await summary(brandAdminA, { tenantId: String(brandB) })).status).toBe(403);
    expect((await call(getUsers, brandAdminA, { tenantId: String(brandB) })).status).toBe(403);
    expect((await summary(brandAdminA, { tenantId: 'not-an-id' })).status).toBe(400);
  });

  it('counts nothing for an admin with no brands', async () => {
    const { status, body } = await summary({ _id: new Types.ObjectId(), role: 'brand-admin', assignedTenants: [] });
    expect(status).toBe(200);
    expect(body.data).toEqual({
      total: 0,
      byRole: { 'brand-admin': 0, manager: 0, editor: 0, viewer: 0 },
      byStatus: { active: 0, pending: 0, inactive: 0, suspended: 0 },
    });
  });
});

describe('Team members paging (GET /users)', () => {
  const sameInstant = new Date('2026-10-02T09:00:00Z');
  const members = Array.from({ length: 130 }, (_, index) => person({
    email: `paged-${String(index + 1).padStart(3, '0')}@example.test`,
    firstName: 'Paged',
    lastName: `Member ${String(index + 1).padStart(3, '0')}`,
    role: index % 2 ? 'editor' : 'manager',
    status: 'active',
    assignedTenants: [brandA],
    // An import or a script can create many members in the same millisecond.
    createdAt: sameInstant,
  }));

  beforeEach(async () => {
    await User.collection.deleteMany({});
    await User.collection.insertMany(members.map((member) => ({ ...member })));
  });

  const everyPage = async (caller: Record<string, unknown>, limit: number, query: Record<string, unknown> = {}) => {
    const first = await call(getUsers, caller, { page: '1', limit: String(limit), ...query });
    const pages = [first.body];
    for (let page = 2; page <= first.body.pagination.totalPages; page += 1) {
      pages.push((await call(getUsers, caller, { page: String(page), limit: String(limit), ...query })).body);
    }
    return pages;
  };

  it.each([
    ['a super admin', superAdmin],
    ['a brand admin', brandAdminA],
  ])('lets %s reach every member, each exactly once, down to the last page', async (_who, caller) => {
    const pages = await everyPage(caller, 25);
    expect(pages[0].pagination).toEqual({ page: 1, limit: 25, total: 130, totalPages: 6 });
    expect(pages.map((page) => page.data.length)).toEqual([25, 25, 25, 25, 25, 5]);
    const seen = pages.flatMap((page) => page.data.map((row: { _id: unknown }) => String(row._id)));
    expect(new Set(seen).size).toBe(130);
    expect(new Set(seen)).toEqual(new Set(members.map((member) => String(member._id))));
  });

  it('orders members created in the same instant by id, newest first, so pages never overlap', async () => {
    const pages = await everyPage(superAdmin, 40);
    const seen = pages.flatMap((page) => page.data.map((row: { _id: unknown }) => String(row._id)));
    const newestFirst = members.map((member) => String(member._id)).sort().reverse();
    expect(seen).toEqual(newestFirst);
  });

  it('pages a filtered list to its own tail', async () => {
    const pages = await everyPage(brandAdminA, 25, { role: 'editor' });
    expect(pages[0].pagination.total).toBe(65);
    expect(pages.map((page) => page.data.length)).toEqual([25, 25, 15]);
    expect(pages.flatMap((page) => page.data).every((row: { role: string }) => row.role === 'editor')).toBe(true);
  });

  it('answers a page past the end with no rows and the real total', async () => {
    const { body } = await call(getUsers, superAdmin, { page: '9', limit: '25' });
    expect(body.data).toEqual([]);
    expect(body.pagination).toEqual({ page: 9, limit: 25, total: 130, totalPages: 6 });
  });
});
