import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { issueAccountRecovery, RECOVERY_ISSUER_FIELDS, AccountRecoveryMode } from '../services/accountRecovery.service';
import { forgotPassword } from '../controllers/auth.controller';
import { createInvitationLink } from '../controllers/users.controller';
import { revokeUserSessions } from '../utils/session';
import { hashToken } from '../utils/hash';
import { sendPasswordResetEmail, sendUserInvitation } from '../services/email.service';
import { IUser } from '../types';

jest.mock('../services/email.service', () => ({ ...jest.requireActual('../services/email.service'),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ status: 'sent' }),
  sendUserInvitation: jest.fn().mockResolvedValue({ status: 'sent' }),
}));
jest.setTimeout(120_000);
let mongo: MongoMemoryServer, user: IUser;
const own = new Types.ObjectId(), other = new Types.ObjectId();
const oldHash = hashToken('local-old-recovery');
const current = () => User.findById(user._id).select(RECOVERY_ISSUER_FIELDS).lean();
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn(), cookie: jest.fn() });
const callIssuer = async (mode: AccountRecoveryMode) => {
  const res = response(), next = jest.fn();
  const req = mode === 'reset' ? { body: { email: user.email } } : {
    params: { id: String(user._id) }, user: { _id: new Types.ObjectId(), role: 'brand-admin', assignedTenants: [own] },
  };
  await (mode === 'reset' ? forgotPassword : createInvitationLink)(req as never, res as never, next);
  return { res, next, body: res.json.mock.calls[0]?.[0] };
};
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('recovery_issuance')); await User.init();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  jest.restoreAllMocks(); jest.clearAllMocks(); jest.spyOn(console, 'info').mockImplementation(() => undefined);
  await User.deleteMany({});
  user = await User.create({ email: 'qa-issuance@example.invalid', firstName: 'QA', lastName: 'Recovery', password: 'LocalFixturePassword123!',
    role: 'manager', status: 'active', assignedTenants: [own], tokenVersion: 2 });
  await User.collection.updateOne({ _id: user._id }, { $set: { passwordResetToken: oldHash, passwordResetExpires: new Date(Date.now() + 60000) } });
});

it.each([true, false])('revocation unsets capabilities issued since an initially empty read (selected=%s)', async selected => {
  await User.collection.updateOne({ _id: user._id }, { $unset: { passwordResetToken: 1, passwordResetExpires: 1, refreshToken: 1 } });
  const query = User.findById(user._id); if (selected) query.select('+passwordResetToken +passwordResetExpires +refreshToken');
  const stale = (await query)!;
  await User.collection.updateOne({ _id: user._id }, { $set: { passwordResetToken: oldHash, passwordResetExpires: new Date(Date.now() + 60000), refreshToken: hashToken('local-new-refresh') } });
  await revokeUserSessions(stale);
  expect(stale.getChanges()).toMatchObject({ $unset: { refreshToken: 1, passwordResetToken: 1, passwordResetExpires: 1 }, $inc: { tokenVersion: 1 } });
  await stale.save();
  const stored = (await User.collection.findOne({ _id: user._id }))!;
  expect(stored.tokenVersion).toBe(3); expect(stored.passwordResetToken).toBeUndefined(); expect(stored.passwordResetExpires).toBeUndefined(); expect(stored.refreshToken).toBeUndefined();
});

it.each(['reset', 'invitation'] as const)('late %s issuance cannot recreate authority after revocation', async mode => {
  if (mode === 'invitation') await User.collection.updateOne({ _id: user._id }, { $set: { status: 'pending' } });
  const original = User.updateOne;
  jest.spyOn(User, 'updateOne').mockImplementationOnce((...args) => (async () => {
    const fresh = (await User.findById(user._id))!; await revokeUserSessions(fresh); await fresh.save();
    return Reflect.apply(original, User, args);
  })() as never);
  const { res, next, body } = await callIssuer(mode);
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(mode === 'reset' ? 200 : 409);
  expect(body.data?.inviteUrl).toBeUndefined(); expect(sendPasswordResetEmail).not.toHaveBeenCalled(); expect(sendUserInvitation).not.toHaveBeenCalled();
  expect((await current())!.tokenVersion).toBe(3); expect((await current())!.passwordResetToken).toBeUndefined();
});

it.each(['reset', 'invitation'] as const)('guards all original %s issuer context and capability fields', async mode => {
  if (mode === 'invitation') await User.collection.updateOne({ _id: user._id }, { $set: { status: 'pending' } });
  const baseline = (await current())!;
  for (const change of [{ role: 'super-admin' }, { status: 'suspended' }, { assignedTenants: [other] },
    { email: 'qa-reassigned@example.invalid' }, { tokenVersion: 3 }, { passwordResetToken: hashToken('newer-token') }, { passwordResetExpires: new Date(0) }]) {
    await User.collection.updateOne({ _id: user._id }, { $set: { email: baseline.email, role: baseline.role, status: baseline.status, assignedTenants: baseline.assignedTenants,
      tokenVersion: baseline.tokenVersion, passwordResetToken: baseline.passwordResetToken, passwordResetExpires: baseline.passwordResetExpires, ...change } });
    expect(await issueAccountRecovery(baseline, mode)).toBeNull();
    const stored = (await current())!; expect(stored.passwordResetToken).toBe('passwordResetToken' in change ? change.passwordResetToken : oldHash);
  }
});

it.each(['reset', 'invitation'] as const)('one %s issuer wins a shared snapshot; a fresh later request can replace it', async mode => {
  if (mode === 'invitation') await User.collection.updateOne({ _id: user._id }, { $set: { status: 'pending' } });
  const snapshot = (await current())!, salt = jest.spyOn(bcrypt, 'genSalt');
  const issued = (await Promise.all(Array.from({ length: 4 }, () => issueAccountRecovery(snapshot, mode)))).filter(value => value !== null);
  expect(issued).toHaveLength(1); expect((await current())!.passwordResetToken).toBe(hashToken(issued[0]!.token));
  const replacement = (await issueAccountRecovery((await current())!, mode))!;
  expect(replacement.token).not.toBe(issued[0]!.token); expect((await current())!.passwordResetToken).toBe(hashToken(replacement.token));
  expect((await current())!.tokenVersion).toBe(2); expect(salt).not.toHaveBeenCalled();
});

it.each(['reset', 'invitation'] as const)('supports a legacy %s issuer with absent epoch, membership and capability fields', async mode => {
  await User.collection.updateOne({ _id: user._id }, { $set: { status: mode === 'reset' ? 'active' : 'pending' },
    $unset: { tokenVersion: 1, assignedTenants: 1, passwordResetToken: 1, passwordResetExpires: 1 } });
  const snapshot = (await current())!; expect(snapshot.tokenVersion).toBeUndefined(); expect(snapshot.assignedTenants).toBeUndefined();
  const issued = (await issueAccountRecovery(snapshot, mode))!;
  expect(issued).not.toBeNull(); expect((await current())!.passwordResetToken).toBe(hashToken(issued.token));
  expect((await User.collection.findOne({ _id: user._id }))!.tokenVersion).toBeUndefined();
});

it.each(['reset', 'invitation'] as const)('a failed %s issuer write preserves the old capability and returns no credential', async mode => {
  if (mode === 'invitation') await User.collection.updateOne({ _id: user._id }, { $set: { status: 'pending' } });
  jest.spyOn(User, 'updateOne').mockRejectedValueOnce(new Error('local database unavailable'));
  const { res, next } = await callIssuer(mode);
  expect(next).toHaveBeenCalledWith(expect.any(Error)); expect(res.json).not.toHaveBeenCalled();
  expect((await current())!.passwordResetToken).toBe(oldHash); expect(sendPasswordResetEmail).not.toHaveBeenCalled(); expect(sendUserInvitation).not.toHaveBeenCalled();
  const retry = await callIssuer(mode); expect(retry.next).not.toHaveBeenCalled(); expect(retry.res.status).toHaveBeenCalledWith(200);
});

it.each(['pending', 'inactive', 'suspended'] as const)('does not issue reset authority to a %s account or reveal its state', async status => {
  await User.collection.updateOne({ _id: user._id }, { $set: { status } });
  const { res, next, body } = await callIssuer('reset');
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(200); expect(body.message).toBe('If the email exists, a password reset link will be sent');
  expect(sendPasswordResetEmail).not.toHaveBeenCalled(); expect((await current())!.passwordResetToken).toBe(oldHash);
});

it('returns the same generic response for an unknown reset account', async () => {
  await User.deleteMany({}); const { res, next, body } = await callIssuer('reset');
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(200); expect(body.message).toBe('If the email exists, a password reset link will be sent');
  expect(sendPasswordResetEmail).not.toHaveBeenCalled();
});

it.each(['active', 'inactive', 'suspended'] as const)('does not issue an invitation for a %s account', async status => {
  await User.collection.updateOne({ _id: user._id }, { $set: { status } });
  expect(await issueAccountRecovery((await current())!, 'invitation')).toBeNull();
  expect((await current())!.passwordResetToken).toBe(oldHash);
});
