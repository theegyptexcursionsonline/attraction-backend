/**
 * A team member shared between brands: each brand admin sees and changes only their own brands'
 * part of that membership. The Team members screen shows (and sends back) only the caller's
 * brands, so a save must keep the member's other brands, and no read may name them.
 */
import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { getUserById, getUsers, updateUser } from '../controllers/users.controller';
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
const thirdBrand = new Types.ObjectId();
const brandAdminId = new Types.ObjectId();
const sharedId = new Types.ObjectId();
const superAdminId = new Types.ObjectId();

const brandAdmin = { _id: brandAdminId, role: 'brand-admin', assignedTenants: [ownBrand], firstName: 'Brand', lastName: 'Admin' };
const superAdmin = { _id: superAdminId, role: 'super-admin', assignedTenants: [], firstName: 'Super', lastName: 'Admin' };

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
  expect(next).not.toHaveBeenCalled();
  return { status: res.status.mock.calls[0][0] as number, body: res.json.mock.calls[0][0] };
};

const update = (caller: Record<string, unknown>, body: Record<string, unknown>) =>
  call(updateUser, caller, { params: { id: String(sharedId) }, body });

const storedBrands = async () => {
  const user = await User.findById(sharedId).lean();
  return (user?.assignedTenants || []).map(String).sort();
};

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  mongo = await MongoMemoryServer.create(systemBinary ? { binary: { systemBinary } } : {});
  await mongoose.connect(mongo.getUri('team_member_brand_scope'));
  await Tenant.collection.insertMany([
    { _id: ownBrand, slug: 'own-brand', domain: 'own-brand.invalid', name: 'Own Brand' },
    { _id: otherBrand, slug: 'other-brand', domain: 'other-brand.invalid', name: 'Other Brand' },
    { _id: thirdBrand, slug: 'third-brand', domain: 'third-brand.invalid', name: 'Third Brand' },
  ]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await User.collection.deleteMany({});
  await User.collection.insertMany([
    { _id: brandAdminId, email: 'brand-admin@example.test', password: 'x'.repeat(20), firstName: 'Brand', lastName: 'Admin', role: 'brand-admin', status: 'active', assignedTenants: [ownBrand], interfaceLocale: 'en' },
    { _id: sharedId, email: 'shared@example.test', password: 'x'.repeat(20), firstName: 'Shared', lastName: 'Manager', role: 'manager', status: 'active', assignedTenants: [ownBrand, otherBrand], interfaceLocale: 'en', tokenVersion: 0 },
  ]);
});

describe('team member brand scope', () => {
  it('lists a shared member with only the caller\'s brands', async () => {
    const res = respond();
    const next = jest.fn();
    await getUsers({ query: {}, headers: {}, params: {}, user: brandAdmin } as unknown as AuthRequest, res, next);
    expect(next.mock.calls[0]?.[0]?.message ?? null).toBeNull();
    const body = res.json.mock.calls[0][0];
    const shared = body.data.find((user: { email: string }) => user.email === 'shared@example.test');
    expect(shared.assignedTenants.map((tenant: { name: string }) => tenant.name)).toEqual(['Own Brand']);
    expect(JSON.stringify(body)).not.toContain('Other Brand');
    expect(JSON.stringify(body)).not.toContain(String(otherBrand));
  });

  it('shows a shared member\'s detail with only the caller\'s brands', async () => {
    const { status, body } = await call(getUserById, brandAdmin, { params: { id: String(sharedId) } });
    expect(status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('Other Brand');
  });

  it('saves a shared member from the screen (own brands only) and keeps their other brand', async () => {
    const { status, body } = await update(brandAdmin, { firstName: 'Ops', assignedTenants: [String(ownBrand)] });
    expect(status).toBe(200);
    expect(await storedBrands()).toEqual([String(ownBrand), String(otherBrand)].sort());
    expect((await User.findById(sharedId).lean())?.firstName).toBe('Ops');
    // Nothing about their access changed, so they stay signed in.
    expect((await User.findById(sharedId).lean())?.tokenVersion).toBe(0);
    expect(JSON.stringify(body)).not.toContain('Other Brand');
  });

  it('accepts the other brand sent back unchanged by an older screen', async () => {
    const { status } = await update(brandAdmin, { lastName: 'Lead', assignedTenants: [String(ownBrand), String(otherBrand)] });
    expect(status).toBe(200);
    expect(await storedBrands()).toEqual([String(ownBrand), String(otherBrand)].sort());
  });

  it('refuses adding a brand the caller does not manage', async () => {
    const { status } = await update(brandAdmin, { assignedTenants: [String(ownBrand), String(thirdBrand)] });
    expect(status).toBe(403);
    expect(await storedBrands()).toEqual([String(ownBrand), String(otherBrand)].sort());
  });

  it('removes the member from the caller\'s brand only, and signs them out', async () => {
    const { status } = await update(brandAdmin, { assignedTenants: [] });
    expect(status).toBe(200);
    expect(await storedBrands()).toEqual([String(otherBrand)]);
    expect((await User.findById(sharedId).lean())?.tokenVersion).toBe(1);
  });

  it('lets a super admin set the full list', async () => {
    const { status } = await update(superAdmin, { assignedTenants: [String(thirdBrand)] });
    expect(status).toBe(200);
    expect(await storedBrands()).toEqual([String(thirdBrand)]);
  });

  it('shows a super admin every brand of the member', async () => {
    const { body } = await call(getUserById, superAdmin, { params: { id: String(sharedId) } });
    expect(JSON.stringify(body)).toContain('Other Brand');
  });
});
