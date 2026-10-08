/**
 * Giving team members section access: a brand admin can re-save a member and give or keep only
 * sections they may use; a super admin can give anything.
 */
import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { updateUser } from '../controllers/users.controller';
import { AuthRequest } from '../types';

jest.mock('../services/email.service', () => ({
  sendAccessChangedEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: jest.fn(),
  sendUserInvitation: jest.fn(),
  invitationLink: jest.fn(),
}));
jest.setTimeout(120_000);

let mongo: MongoMemoryServer;
const brand = new Types.ObjectId();
const brandAdminId = new Types.ObjectId();
const memberId = new Types.ObjectId();

const call = async (caller: Record<string, unknown>, body: Record<string, unknown>) => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  const next = jest.fn();
  await updateUser({ params: { id: String(memberId) }, body, user: caller, headers: {}, query: {} } as unknown as AuthRequest, res, next);
  expect(next).not.toHaveBeenCalled();
  return { status: res.status.mock.calls[0][0] as number, body: res.json.mock.calls[0][0] };
};
const brandAdmin = () => ({ _id: brandAdminId, role: 'brand-admin', assignedTenants: [brand], firstName: 'Brand', lastName: 'Admin' });
const stored = async () => (await User.findById(memberId).lean())?.sectionAccess;

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  mongo = await MongoMemoryServer.create(systemBinary ? { binary: { systemBinary } } : {});
  await mongoose.connect(mongo.getUri('team_section_access'));
  await Tenant.collection.insertOne({ _id: brand, slug: 'tours-only', domain: 'tours-only.invalid', name: 'Tours Only', enabledSections: ['tours', 'attractions'] });
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await User.collection.deleteMany({});
  await User.collection.insertOne({ _id: memberId, email: 'member@example.test', password: 'x'.repeat(20), firstName: 'Mem', lastName: 'Ber', role: 'manager', status: 'active', assignedTenants: [brand], interfaceLocale: 'en' });
});

it('lets a brand admin on a limited brand edit a member without touching their sections', async () => {
  const result = await call(brandAdmin(), { firstName: 'Renamed', sectionAccess: null });
  expect(result.status).toBe(200);
  expect((await User.findById(memberId).lean())?.firstName).toBe('Renamed');
  expect(await stored()).toBeUndefined();
});

it('lets a brand admin give only sections they can use', async () => {
  expect((await call(brandAdmin(), { sectionAccess: ['packages'] })).status).toBe(403);
  expect((await call(brandAdmin(), { sectionAccess: ['tours'] })).status).toBe(200);
  expect(await stored()).toEqual(['tours']);
  // Restoring "every section" is a super admin decision when the caller's own access is limited.
  expect((await call(brandAdmin(), { sectionAccess: null })).status).toBe(403);
});

it('keeps sections a super admin gave when a brand admin narrows the rest', async () => {
  await User.updateOne({ _id: memberId }, { $set: { sectionAccess: ['tours', 'bundles'] } });
  expect((await call(brandAdmin(), { sectionAccess: ['bundles'] })).status).toBe(200);
  expect(await stored()).toEqual(['bundles']);
});

it('lets a super admin give any section or restore every section', async () => {
  const superAdmin = { _id: new Types.ObjectId(), role: 'super-admin', assignedTenants: [], firstName: 'Super', lastName: 'Admin' };
  expect((await call(superAdmin, { sectionAccess: ['bundles', 'packages'] })).status).toBe(200);
  expect(await stored()).toEqual(['packages', 'bundles']);
  expect((await call(superAdmin, { sectionAccess: null })).status).toBe(200);
  expect(await stored()).toBeUndefined();
});
