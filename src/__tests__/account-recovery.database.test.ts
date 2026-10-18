import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { consumeAccountRecovery } from '../services/accountRecovery.service';
import { resetPassword, acceptInvitation, changePassword, forgotPassword } from '../controllers/auth.controller';
import { setUserPassword, updateUser, revokeUserSessionsById } from '../controllers/users.controller';
import { revokeUserSessions } from '../utils/session';
import { hashToken } from '../utils/hash';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import { authenticate } from '../middleware/auth.middleware';
import { generateBookingAccessToken, verifyBookingAccessToken } from '../utils/bookingAccess';
import { sendPasswordChangedEmail, sendPasswordResetEmail } from '../services/email.service';
import { IUser } from '../types';

jest.mock('../services/email.service', () => ({ ...jest.requireActual('../services/email.service'),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue({ status: 'sent' }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ status: 'sent' }),
  sendAccessChangedEmail: jest.fn().mockResolvedValue({ status: 'sent' }),
  sendUserInvitation: jest.fn().mockResolvedValue({ status: 'sent' }),
}));
jest.setTimeout(120_000);
const TOKEN = 'local-fixture-recovery-capability';
const OLD = 'LocalFixtureOldPassword123!';
const NEXT = 'LocalFixtureNewPassword123!';
const tenantA = new Types.ObjectId(), tenantB = new Types.ObjectId();
let mongo: MongoMemoryServer, user: IUser;
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn(), cookie: jest.fn(), clearCookie: jest.fn() });
const invoke = async (mode: 'reset' | 'invitation', password = NEXT, token = TOKEN) => {
  const res = response(); const next = jest.fn();
  await (mode === 'reset' ? resetPassword : acceptInvitation)({ body: { token, password } } as never, res as never, next);
  await new Promise(resolve => setImmediate(resolve));
  expect(next).not.toHaveBeenCalled();
  return { status: res.status.mock.calls[0]?.[0], res };
};
const current = () => User.findById(user._id).select('+password +passwordResetToken +passwordResetExpires +refreshToken');
const statusOf = async (access: string) => {
  const res = response(), next = jest.fn();
  await authenticate({ headers: { authorization: `Bearer ${access}` }, rawHeaders: [] } as never, res as never, next);
  return next.mock.calls.length ? 200 : res.status.mock.calls[0]?.[0];
};
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('account_recovery')); await User.init();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  jest.restoreAllMocks(); jest.clearAllMocks();
  await User.deleteMany({});
  user = await User.create({ email: 'qa-recovery@example.invalid', firstName: 'QA', lastName: 'Recovery', password: OLD,
    role: 'customer', status: 'active', assignedTenants: [tenantA], tokenVersion: 2 });
  await User.updateOne({ _id: user._id }, { $set: { passwordResetToken: hashToken(TOKEN), passwordResetExpires: new Date(Date.now() + 60_000), refreshToken: hashToken(generateRefreshToken(user)) } });
});

it.each(['reset', 'invitation'] as const)('spends one %s capability under concurrent requests and sends one notice', async mode => {
  if (mode === 'invitation') await User.updateOne({ _id: user._id }, { $set: { status: 'pending', role: 'brand-admin' } });
  const results = await Promise.all(Array.from({ length: 4 }, (_, i) => invoke(mode, NEXT + i)));
  expect(results.map(row => row.status).sort()).toEqual([200, 400, 400, 400]);
  const stored = (await current())!; const winner = results.findIndex(row => row.status === 200);
  expect(await stored.comparePassword(NEXT + winner)).toBe(true);
  expect(stored.tokenVersion).toBe(3); expect(stored.status).toBe('active');
  expect(stored.passwordResetToken).toBeUndefined(); expect(stored.passwordResetExpires).toBeUndefined(); expect(stored.refreshToken).toBeUndefined();
  expect(sendPasswordChangedEmail).toHaveBeenCalledTimes(1);
  expect(results.every(row => row.res.cookie.mock.calls.length === 0)).toBe(true);
  expect((await invoke(mode)).status).toBe(400);
});

it('does no expensive hashing for random, expired or revoked-state capabilities', async () => {
  const salt = jest.spyOn(bcrypt, 'genSalt');
  expect(await consumeAccountRecovery('random-local-token', NEXT, 'reset')).toEqual({ kind: 'invalid' });
  await User.updateOne({ _id: user._id }, { $set: { passwordResetExpires: new Date(0) } });
  expect(await consumeAccountRecovery(TOKEN, NEXT, 'reset')).toEqual({ kind: 'invalid' });
  await User.updateOne({ _id: user._id }, { $set: { passwordResetExpires: new Date(Date.now() + 60000), status: 'suspended' } });
  expect(await consumeAccountRecovery(TOKEN, NEXT, 'reset')).toEqual({ kind: 'invalid' });
  expect(salt).not.toHaveBeenCalled();
});

it.each(['reset', 'invitation'] as const)('rechecks %s account identity and membership after hashing', async mode => {
  if (mode === 'invitation') await User.updateOne({ _id: user._id }, { $set: { status: 'pending', role: 'brand-admin' } });
  const baseline = await current();
  for (const change of [{ role: 'viewer' }, { status: 'suspended' }, { assignedTenants: [tenantB] }, { email: 'qa-changed@example.invalid' }]) {
    await User.collection.updateOne({ _id: user._id }, { $set: { role: baseline!.role, status: baseline!.status, email: baseline!.email, assignedTenants: [tenantA] } });
    const original = bcrypt.genSalt;
    const salt = jest.spyOn(bcrypt, 'genSalt').mockImplementationOnce((async (...args: unknown[]) => {
      await User.collection.updateOne({ _id: user._id }, { $set: change }); return Reflect.apply(original, bcrypt, args);
    }) as typeof bcrypt.genSalt);
    expect((await invoke(mode)).status).toBe(400); salt.mockRestore();
    expect(await (await current())!.comparePassword(OLD)).toBe(true);
    expect((await current())!.passwordResetToken).toBe(hashToken(TOKEN));
  }
  expect(sendPasswordChangedEmail).not.toHaveBeenCalled();
});

it.each(['replace', 'expire'])('does not spend a capability changed during hashing: %s', async change => {
  const original = bcrypt.genSalt;
  jest.spyOn(bcrypt, 'genSalt').mockImplementationOnce((async (...args: unknown[]) => {
    await User.updateOne({ _id: user._id }, { $set: change === 'replace' ? { passwordResetToken: hashToken('new-capability') } : { passwordResetExpires: new Date(0) } });
    return Reflect.apply(original, bcrypt, args);
  }) as typeof bcrypt.genSalt);
  expect((await invoke('reset')).status).toBe(400);
  expect(await (await current())!.comparePassword(OLD)).toBe(true); expect((await current())!.tokenVersion).toBe(2);
  expect(sendPasswordChangedEmail).not.toHaveBeenCalled();
});

it('retains the capability after a failed atomic write and retries without partial state', async () => {
  const write = jest.spyOn(User, 'findOneAndUpdate').mockRejectedValueOnce(new Error('database unavailable'));
  await expect(consumeAccountRecovery(TOKEN, NEXT, 'reset')).rejects.toThrow('database unavailable');
  expect(await (await current())!.comparePassword(OLD)).toBe(true); expect((await current())!.passwordResetToken).toBe(hashToken(TOKEN));
  write.mockRestore(); expect((await invoke('reset')).status).toBe(200);
});

it('increments the current database epoch after concurrent revocations, hashing once and minting no session', async () => {
  const oldAccess = generateAccessToken(user); const guestToken = generateBookingAccessToken(String(user._id), 'QA-BOOKING');
  const original = bcrypt.genSalt;
  const salt = jest.spyOn(bcrypt, 'genSalt').mockImplementationOnce((async (...args: unknown[]) => {
    await User.collection.updateOne({ _id: user._id }, { $inc: { tokenVersion: 2 } }); return Reflect.apply(original, bcrypt, args);
  }) as typeof bcrypt.genSalt);
  const result = await invoke('reset'); expect(result.status).toBe(200);
  expect((await current())!.tokenVersion).toBe(5); expect(salt).toHaveBeenCalledTimes(1);
  expect(await statusOf(oldAccess)).toBe(401); expect(result.res.cookie).not.toHaveBeenCalled();
  expect(verifyBookingAccessToken(guestToken, String(user._id), 'QA-BOOKING')).toBe(true);
});

it('supports a legacy account with absent epoch and membership fields', async () => {
  await User.collection.updateOne({ _id: user._id }, { $unset: { tokenVersion: 1, assignedTenants: 1 } });
  expect((await invoke('reset')).status).toBe(200); expect((await current())!.tokenVersion).toBe(1);
});

it('uses atomic deltas for stale security documents and never revives an intermediate session', async () => {
  const first = (await User.findById(user._id))!, stale = (await User.findById(user._id))!;
  await revokeUserSessions(first); expect(first.getChanges()).toHaveProperty('$inc.tokenVersion', 1); await first.save();
  const intermediate = generateAccessToken((await User.findById(user._id))!); expect(await statusOf(intermediate)).toBe(200);
  await revokeUserSessions(stale); expect(stale.getChanges()).toHaveProperty('$inc.tokenVersion', 1); await stale.save();
  expect((await current())!.tokenVersion).toBe(4); expect(stale.tokenVersion).toBe(3);
  expect(await statusOf(intermediate)).toBe(401);
  expect((await current())!.refreshToken).toBeUndefined(); expect((await current())!.passwordResetToken).toBeUndefined();
});

it('keeps password save-hook increments atomic for two stale password changes', async () => {
  const first = (await User.findById(user._id))!, stale = (await User.findById(user._id))!;
  first.password = NEXT + 'first'; await first.save();
  const intermediate = generateAccessToken((await User.findById(user._id))!);
  stale.password = NEXT + 'last'; await stale.save();
  expect((await current())!.tokenVersion).toBe(4); expect(await (await current())!.comparePassword(NEXT + 'last')).toBe(true);
  expect(await statusOf(intermediate)).toBe(401);
});

it('invalidates an invitation when its established security context is reassigned', async () => {
  await User.updateOne({ _id: user._id }, { $set: { status: 'pending', role: 'brand-admin' } });
  const changed = (await User.findById(user._id))!; changed.role = 'manager'; changed.assignedTenants = [tenantB];
  await revokeUserSessions(changed); await changed.save();
  const salt = jest.spyOn(bcrypt, 'genSalt'); expect((await invoke('invitation')).status).toBe(400); expect(salt).not.toHaveBeenCalled();
  expect((await current())!.status).toBe('pending');
});

it('allows ordinary forgot-password issuance to set a fresh capability without revoking or hashing', async () => {
  const salt = jest.spyOn(bcrypt, 'genSalt'); const res = response(), next = jest.fn();
  await forgotPassword({ body: { email: user.email } } as never, res as never, next);
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(200); expect(salt).not.toHaveBeenCalled();
  expect((await current())!.tokenVersion).toBe(2); expect((await current())!.passwordResetToken).not.toBe(hashToken(TOKEN));
  expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
});

it('admin password setting hashes and revokes exactly once through the real model hook', async () => {
  await User.updateOne({ _id: user._id }, { $set: { status: 'pending', role: 'brand-admin' } });
  const salt = jest.spyOn(bcrypt, 'genSalt'); jest.spyOn(console, 'info').mockImplementation(() => undefined);
  const res = response(), next = jest.fn();
  await setUserPassword({ params: { id: String(user._id) }, body: { password: NEXT }, user: { _id: new Types.ObjectId(), role: 'super-admin' } } as never, res as never, next);
  await new Promise(resolve => setImmediate(resolve));
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(200); expect(salt).toHaveBeenCalledTimes(1);
  const stored = (await current())!; expect(stored.status).toBe('active'); expect(stored.tokenVersion).toBe(3); expect(await stored.comparePassword(NEXT)).toBe(true);
  expect(stored.passwordResetToken).toBeUndefined(); expect(stored.refreshToken).toBeUndefined(); expect(res.cookie).not.toHaveBeenCalled();
});

it('change-password revokes through the real hook without issuing a stale-epoch session', async () => {
  const res = response(), next = jest.fn();
  await changePassword({ body: { currentPassword: OLD, newPassword: NEXT }, user } as never, res as never, next);
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(200); expect(res.cookie).not.toHaveBeenCalled();
  expect((await current())!.tokenVersion).toBe(3); expect((await current())!.passwordResetToken).toBeUndefined();
});

it.each(['context', 'revoke'])('existing admin %s mutation invalidates old recovery capabilities', async kind => {
  await User.updateOne({ _id: user._id }, { $set: { role: 'brand-admin' } });
  const res = response(), next = jest.fn();
  const req = { params: { id: String(user._id) }, body: { role: 'viewer' }, user: { _id: new Types.ObjectId(), role: 'super-admin', assignedTenants: [] }, headers: {}, query: {} };
  await (kind === 'context' ? updateUser : revokeUserSessionsById)(req as never, res as never, next);
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(200);
  expect((await current())!.tokenVersion).toBe(3); expect((await current())!.passwordResetToken).toBeUndefined(); expect((await current())!.refreshToken).toBeUndefined();
});

it('persists a revocation delta for legacy documents with no stored epoch', async () => {
  await User.collection.updateOne({ _id: user._id }, { $unset: { tokenVersion: 1 } });
  const legacy = (await User.findById(user._id))!;
  await revokeUserSessions(legacy); await legacy.save();
  expect((await current())!.tokenVersion).toBe(1);
  expect((await current())!.passwordResetToken).toBeUndefined();
});

const nullEpoch = () => mongoose.connection.collection('users').updateOne({ _id: user._id }, { $set: { tokenVersion: null } });

it.each(['reset', 'invitation'] as const)('consumes one legacy-null %s capability and increments once', async mode => {
  await nullEpoch();
  if (mode === 'invitation') await User.updateOne({ _id: user._id }, { $set: { status: 'pending', role: 'brand-admin' } });
  const oldAccess = generateAccessToken((await User.findById(user._id))!);
  const results = await Promise.all([invoke(mode, NEXT + 'first'), invoke(mode, NEXT + 'second')]);
  expect(results.map(row => row.status).sort()).toEqual([200, 400]);
  expect((await current())!.tokenVersion).toBe(1); expect((await current())!.passwordResetToken).toBeUndefined();
  expect(sendPasswordChangedEmail).toHaveBeenCalledTimes(1); expect(await statusOf(oldAccess)).toBe(401);
  expect(results.every(row => row.res.cookie.mock.calls.length === 0)).toBe(true);
});

it('does not normalize or hash for invalid, expired or disabled legacy-null recovery', async () => {
  await nullEpoch(); const write = jest.spyOn(User, 'updateOne'), salt = jest.spyOn(bcrypt, 'genSalt');
  expect(await consumeAccountRecovery('invalid-local-token', NEXT, 'reset')).toEqual({ kind: 'invalid' });
  await User.collection.updateOne({ _id: user._id }, { $set: { passwordResetExpires: new Date(0) } });
  expect(await consumeAccountRecovery(TOKEN, NEXT, 'reset')).toEqual({ kind: 'invalid' });
  await User.collection.updateOne({ _id: user._id }, { $set: { status: 'suspended', passwordResetExpires: new Date(Date.now() + 60000) } });
  expect(await consumeAccountRecovery(TOKEN, NEXT, 'reset')).toEqual({ kind: 'invalid' });
  expect(write).not.toHaveBeenCalled(); expect(salt).not.toHaveBeenCalled(); expect((await current())!.tokenVersion).toBeNull();
});

it('keeps a failed null normalization fail-closed and permits a fresh recovery retry', async () => {
  await nullEpoch(); const salt = jest.spyOn(bcrypt, 'genSalt');
  jest.spyOn(User, 'updateOne').mockRejectedValueOnce(new Error('local normalization unavailable'));
  await expect(consumeAccountRecovery(TOKEN, NEXT, 'reset')).rejects.toThrow('local normalization unavailable');
  expect(salt).not.toHaveBeenCalled(); expect((await current())!.tokenVersion).toBeNull(); expect((await current())!.passwordResetToken).toBe(hashToken(TOKEN));
  expect(await (await current())!.comparePassword(OLD)).toBe(true); expect(sendPasswordChangedEmail).not.toHaveBeenCalled();
  expect((await invoke('reset')).status).toBe(200); expect((await current())!.tokenVersion).toBe(1);
});

it('rechecks expiry if the capability expires while its null encoding is normalized', async () => {
  await nullEpoch(); const original = User.updateOne;
  jest.spyOn(User, 'updateOne').mockImplementationOnce((...args) => (async () => {
    await User.collection.updateOne({ _id: user._id }, { $set: { passwordResetExpires: new Date(0) } });
    return Reflect.apply(original, User, args);
  })() as never);
  expect((await invoke('reset')).status).toBe(400);
  expect((await current())!.tokenVersion).toBe(0); expect((await current())!.passwordResetToken).toBe(hashToken(TOKEN));
  expect(await (await current())!.comparePassword(OLD)).toBe(true); expect(sendPasswordChangedEmail).not.toHaveBeenCalled();
});

it('never lowers an advanced numeric epoch while normalizing a stale null document', async () => {
  await nullEpoch(); const stale = (await User.findById(user._id))!;
  await User.collection.updateOne({ _id: user._id }, { $set: { tokenVersion: 4 } });
  const intermediate = generateAccessToken((await User.findById(user._id))!); expect(await statusOf(intermediate)).toBe(200);
  const writes = jest.spyOn(User, 'updateOne'); await revokeUserSessions(stale); await stale.save();
  expect(writes).toHaveBeenCalledWith({ _id: user._id, tokenVersion: { $type: 10 } }, { $set: { tokenVersion: 0 } });
  expect((await current())!.tokenVersion).toBe(5); expect(stale.tokenVersion).toBe(1); expect(await statusOf(intermediate)).toBe(401);
});

it('preserves two independent increments from stale null documents', async () => {
  await nullEpoch(); const first = (await User.findById(user._id))!, stale = (await User.findById(user._id))!;
  await Promise.all([revokeUserSessions(first), revokeUserSessions(stale)]); await first.save();
  const intermediate = generateAccessToken((await User.findById(user._id))!); expect(await statusOf(intermediate)).toBe(200);
  await stale.save(); expect((await current())!.tokenVersion).toBe(2); expect(await statusOf(intermediate)).toBe(401);
  expect((await current())!.passwordResetToken).toBeUndefined(); expect((await current())!.refreshToken).toBeUndefined();
});

it.each(['password', 'context', 'revoke'] as const)('awaits null normalization in the existing %s caller before committing security effects', async kind => {
  await nullEpoch(); await User.collection.updateOne({ _id: user._id }, { $set: { role: 'brand-admin' } });
  let release!: () => void, entered!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const original = User.updateOne;
  jest.spyOn(User, 'updateOne').mockImplementationOnce((...args) => (async () => { entered(); await blocked; return Reflect.apply(original, User, args); })() as never);
  const salt = jest.spyOn(bcrypt, 'genSalt'), save = jest.spyOn(User.prototype, 'save');
  const res = response(), next = jest.fn();
  const req = { params: { id: String(user._id) }, body: kind === 'password' ? { password: NEXT } : { role: 'viewer' },
    user: { _id: new Types.ObjectId(), role: 'super-admin', assignedTenants: [] }, headers: {}, query: {} };
  const pending = (kind === 'password' ? setUserPassword : kind === 'context' ? updateUser : revokeUserSessionsById)(req as never, res as never, next);
  try {
    await started; await new Promise(resolve => setImmediate(resolve));
    expect(res.json).not.toHaveBeenCalled(); expect((await current())!.tokenVersion).toBeNull();
    expect(salt).not.toHaveBeenCalled(); if (kind !== 'password') expect(save).not.toHaveBeenCalled();
  } finally { release(); await pending; }
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(200); expect(res.cookie).not.toHaveBeenCalled();
  expect((await current())!.tokenVersion).toBe(1); expect((await current())!.passwordResetToken).toBeUndefined(); expect((await current())!.refreshToken).toBeUndefined();
  if (kind === 'password') { expect(salt).toHaveBeenCalledTimes(1); expect(await (await current())!.comparePassword(NEXT)).toBe(true); }
});
