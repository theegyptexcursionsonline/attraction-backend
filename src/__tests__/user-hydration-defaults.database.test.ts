import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../models/User';
import { revokeUserSessions } from '../utils/session';
import { IUser } from '../types';

jest.setTimeout(120_000);
let mongo: MongoMemoryServer, user: IUser;
const tenant = new Types.ObjectId();
const raw = () => User.collection.findOne({ _id: user._id });
const missing = async (...fields: string[]) => {
  await User.collection.updateOne({ _id: user._id }, { $unset: Object.fromEntries(fields.map(field => [field, 1])) });
  return (await User.findById(user._id))!;
};
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('user_hydration_defaults')); await User.init();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await User.deleteMany({});
  user = await User.create({ email: 'qa-defaults@example.invalid', firstName: 'QA', lastName: 'Defaults', password: 'LocalFixturePassword123!', role: 'customer', status: 'active' });
});

it('does not persist untouched hydration defaults over current security state or membership', async () => {
  const stale = await missing('tokenVersion', 'twoFactorEnabled', 'role', 'status', 'assignedTenants');
  expect(stale.$isDefault('tokenVersion')).toBe(true); expect(stale.$isDefault('twoFactorEnabled')).toBe(true);
  await User.collection.updateOne({ _id: user._id }, { $set: { tokenVersion: 3, twoFactorEnabled: true, role: 'manager', status: 'suspended', assignedTenants: [tenant] } });
  stale.firstName = 'Updated'; await stale.save();
  expect(await raw()).toMatchObject({ firstName: 'Updated', tokenVersion: 3, twoFactorEnabled: true, role: 'manager', status: 'suspended', assignedTenants: [tenant] });
});

it('does not materialize missing legacy fields during an unrelated existing-document save', async () => {
  const stale = await missing('tokenVersion', 'twoFactorEnabled', 'assignedTenants');
  stale.lastLogin = new Date(); await stale.save();
  const stored = (await raw())!;
  expect(stored).not.toHaveProperty('tokenVersion'); expect(stored).not.toHaveProperty('twoFactorEnabled'); expect(stored).not.toHaveProperty('assignedTenants');
});

it('preserves an explicit assignment even when it equals the hydration default', async () => {
  const stale = await missing('twoFactorEnabled', 'assignedTenants', 'currency');
  await User.collection.updateOne({ _id: user._id }, { $set: { twoFactorEnabled: true, assignedTenants: [tenant], currency: 'EUR' } });
  stale.twoFactorEnabled = false; stale.assignedTenants = []; stale.currency = 'USD';
  expect(stale.isDirectModified('twoFactorEnabled')).toBe(true); expect(stale.isDirectModified('assignedTenants')).toBe(true);
  await stale.save(); expect(await raw()).toMatchObject({ twoFactorEnabled: false, assignedTenants: [], currency: 'USD' });
});

it('persists model defaults for a newly created account', async () => {
  expect(await raw()).toMatchObject({ tokenVersion: 0, twoFactorEnabled: false, assignedTenants: [], interfaceLocale: 'en', language: 'en', currency: 'USD' });
});

it('retains intentional atomic revocation increments while suppressing unrelated defaults', async () => {
  const stale = await missing('tokenVersion', 'twoFactorEnabled');
  await User.collection.updateOne({ _id: user._id }, { $set: { tokenVersion: 3, twoFactorEnabled: true } });
  await revokeUserSessions(stale); await stale.save();
  expect(await raw()).toMatchObject({ tokenVersion: 4, twoFactorEnabled: true });
});

it('retains password save-hook hashing and increments without disabling concurrent MFA', async () => {
  const stale = await missing('tokenVersion', 'twoFactorEnabled');
  await User.collection.updateOne({ _id: user._id }, { $set: { tokenVersion: 3, twoFactorEnabled: true } });
  stale.password = 'LocalFixtureNewPassword123!'; await stale.save();
  expect(await raw()).toMatchObject({ tokenVersion: 4, twoFactorEnabled: true });
  expect(await (await User.findById(user._id).select('+password'))!.comparePassword('LocalFixtureNewPassword123!')).toBe(true);
});

it('preserves explicit stored null and false values during an unrelated update', async () => {
  await mongoose.connection.collection('users').updateOne({ _id: user._id }, { $set: { tokenVersion: null, twoFactorEnabled: false } });
  const current = (await User.findById(user._id))!; current.firstName = 'Updated'; await current.save();
  expect(await raw()).toMatchObject({ tokenVersion: null, twoFactorEnabled: false });
});


it('clears challenge and pending enrollment created after a stale security document was read', async () => {
  const stale = (await User.findById(user._id))!;
  await User.collection.updateOne({ _id: user._id }, { $set: {
    twoFactorChallengeHash: 'local-challenge-hash', twoFactorChallengeExpires: new Date(Date.now() + 60_000),
    twoFactorPendingSecretEnc: 'local-encrypted-pending', twoFactorSetupExpires: new Date(Date.now() + 60_000),
  } });
  await revokeUserSessions(stale); await stale.save();
  const stored = (await raw())!;
  for (const field of ['twoFactorChallengeHash', 'twoFactorChallengeExpires', 'twoFactorPendingSecretEnc', 'twoFactorSetupExpires']) {
    expect(stored).not.toHaveProperty(field);
  }
});
