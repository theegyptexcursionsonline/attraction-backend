import crypto from 'crypto';
import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import * as auth from '../controllers/auth.controller';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { generateAccessToken, generateRefreshToken, generateTwoFactorChallenge, verifyToken, verifyRefreshToken } from '../utils/jwt';
import { hashToken } from '../utils/hash';
import { encryptSecret } from '../utils/secretCrypto';
import { revokeUserSessions } from '../utils/session';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { IUser } from '../types';

jest.mock('../services/email.service', () => ({ ...jest.requireActual('../services/email.service'),
  sendWelcomeEmail: jest.fn().mockResolvedValue({ status: 'sent' }), sendPasswordChangedEmail: jest.fn().mockResolvedValue({ status: 'sent' }),
}));
jest.mock('../services/notification.service', () => ({ createAdminNotifications: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/auditLog.service', () => ({ recordAudit: jest.fn() }));
jest.setTimeout(120_000);
const PASSWORD = 'LocalFixturePassword123!';
const NEXT = 'LocalFixtureNextPassword123!';
const RECOVERY = ['AN-1234-ABCD', 'AN-5678-EFAB'];
const SECRET = 'JBSWY3DPEHPK3PXP';
const site = new Types.ObjectId(), other = new Types.ObjectId();
let mongo: MongoMemoryServer, user: IUser;
const passportKeyBefore = env.foxesPassportSecret;
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn(), cookie: jest.fn(), clearCookie: jest.fn(), redirect: jest.fn(), locals: {} });
const request = (extra: Record<string, unknown> = {}) => ({ body: {}, cookies: {}, headers: {}, rawHeaders: [], query: {}, ...extra });
const call = async (handler: Function, extra: Record<string, unknown> = {}) => {
  const res = response(), next = jest.fn(); await handler(request(extra), res, next); await new Promise(resolve => setImmediate(resolve));
  return { res, next, status: res.status.mock.calls[0]?.[0] ?? (res.redirect.mock.calls.length ? 302 : undefined), body: res.json.mock.calls[0]?.[0],
    cookies: Object.fromEntries(res.cookie.mock.calls.map(([key, value]) => [key, value])) as Record<string, string> };
};
const access = async (token: string, optional = false) => {
  const req = request({ headers: { authorization: `Bearer ${token}` } }) as never;
  const res = response(), next = jest.fn(); await (optional ? optionalAuth : authenticate)(req, res as never, next);
  return { status: next.mock.calls.length ? 200 : res.status.mock.calls[0]?.[0], attached: !!(req as { user?: unknown }).user };
};
const raw = () => User.collection.findOne({ _id: user._id });
const login = () => call(auth.login, { body: { email: user.email, password: PASSWORD } });
const setEpoch = async (kind: 'missing' | 'null' | 'explicit') => {
  await mongoose.connection.collection('users').updateOne({ _id: user._id }, kind === 'missing'
    ? { $unset: { tokenVersion: 1, twoFactorEnabled: 1 } }
    : { $set: { tokenVersion: kind === 'null' ? null : 0, twoFactorEnabled: false } });
};
const enrolled = async (role: 'manager' | 'customer' = 'manager') => {
  await User.collection.updateOne({ _id: user._id }, { $set: { role, twoFactorEnabled: true, twoFactorSecretEnc: encryptSecret(SECRET),
    twoFactorRecoveryCodeHashes: RECOVERY.map(hashToken), assignedTenants: [site] } });
};
const verifiedSession = async () => {
  const step = await login(); expect(step.status).toBe(202);
  const verified = await call(auth.verifyTwoFactorLogin, { body: { challengeToken: step.body.data.challengeToken, code: RECOVERY[0] } });
  expect(verified.status).toBe(200); return verified;
};
const passportAssertion = () => {
  const now = Math.floor(Date.now() / 1000), claims = { sub: 'qa-local', email: user.email, org: null, role: 'customer', aud: 'attraction', iat: now, exp: now + 120 };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', env.foxesPassportSecret).update(payload).digest('base64url');
};

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' }); const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('auth_admission')); await User.init(); env.foxesPassportSecret = 'local-fixture-passport-signing-key-only';
});
afterAll(async () => { env.foxesPassportSecret = passportKeyBefore; await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  jest.restoreAllMocks(); jest.clearAllMocks(); await User.deleteMany({}); await Tenant.collection.deleteMany({});
  user = await User.create({ email: 'qa-admission@example.invalid', firstName: 'QA', lastName: 'Admission', password: PASSWORD, role: 'customer', status: 'active' });
  await Tenant.collection.insertOne({ _id: site, name: 'QA Site', slug: 'qa-admission', domain: 'qa-admission.invalid', status: 'active', enabledSections: ['tours'] } as never);
});

it.each(['missing', 'null', 'explicit'] as const)('keeps ordinary customer login and one-use refresh compatible with %s epoch', async kind => {
  await setEpoch(kind); const signed = await login(); expect(signed.status).toBe(200); expect(signed.next).not.toHaveBeenCalled();
  expect((await access(signed.cookies.accessToken)).status).toBe(200); expect(verifyToken(signed.cookies.accessToken).mfaVerified).toBe(false);
  const responses = await Promise.all(Array.from({ length: 4 }, () => call(auth.refreshToken, { cookies: { refreshToken: signed.cookies.refreshToken } })));
  expect(responses.map(row => row.status).sort()).toEqual([200, 401, 401, 401]);
  const winner = responses.find(row => row.status === 200)!; expect((await access(winner.cookies.accessToken)).status).toBe(200);
  expect((await raw())!.refreshToken === hashToken(winner.cookies.refreshToken)).toBe(true);
  expect(responses.filter(row => row.status !== 200).every(row => row.res.cookie.mock.calls.length === 0)).toBe(true);
  const stored = (await raw())!; if (kind === 'missing') expect(stored).not.toHaveProperty('tokenVersion');
  else expect(stored.tokenVersion).toBe(kind === 'null' ? null : 0);
});

it('admits ordinary signup and Passport only with a current customer authority', async () => {
  await User.deleteMany({});
  const signed = await call(auth.register, { body: { email: user.email, password: PASSWORD, firstName: 'QA', lastName: 'Admission' } });
  expect(signed.status).toBe(201); expect((await access(signed.cookies.accessToken)).status).toBe(200);
  const sso = await call(auth.passportLogin, { body: { assertion: passportAssertion() } });
  expect(sso.status).toBe(200); expect((await access(sso.cookies.accessToken)).status).toBe(200);
  expect(verifyToken(sso.cookies.accessToken).mfaVerified).toBe(false);
});

it('issues factor proof only after local verification and carries it through refresh', async () => {
  await enrolled(); const signed = await verifiedSession();
  expect(verifyToken(signed.cookies.accessToken).mfaVerified).toBe(true); expect(verifyRefreshToken(signed.cookies.refreshToken).mfaVerified).toBe(true);
  expect((await access(signed.cookies.accessToken)).status).toBe(200);
  const refreshed = await call(auth.refreshToken, { cookies: { refreshToken: signed.cookies.refreshToken } });
  expect(refreshed.status).toBe(200); expect(verifyToken(refreshed.cookies.accessToken).mfaVerified).toBe(true);
});

it.each(['customer', 'manager'] as const)('requires an enabled %s factor for password, Passport, refresh and both readers', async role => {
  await enrolled(role); const current = (await User.findById(user._id))!;
  const unprovenAccess = generateAccessToken(current), unprovenRefresh = generateRefreshToken(current);
  await User.collection.updateOne({ _id: user._id }, { $set: { refreshToken: hashToken(unprovenRefresh) } });
  expect((await access(unprovenAccess)).status).toBe(401); expect((await access(unprovenAccess, true)).attached).toBe(false);
  expect((await login()).status).toBe(202);
  const refreshed = await call(auth.refreshToken, { cookies: { refreshToken: unprovenRefresh } }); expect(refreshed.status).toBe(401); expect(refreshed.res.cookie).not.toHaveBeenCalled();
  const sso = await call(auth.passportLogin, { body: { assertion: passportAssertion() } }); expect(sso.status).toBe(302); expect(sso.res.cookie).not.toHaveBeenCalled();
  const signed = await verifiedSession(); expect((await access(signed.cookies.accessToken)).status).toBe(200);
});

it('keeps non-factor legacy refresh compatibility but refuses required-factor legacy proof', async () => {
  const legacy = (account: IUser) => jwt.sign({ userId: String(account._id), email: account.email, role: account.role, sessionVersion: 0, mfaVerified: true }, env.jwtSecret, { expiresIn: '5m' });
  const plain = legacy(user); await User.collection.updateOne({ _id: user._id }, { $set: { refreshToken: hashToken(plain) } });
  const allowed = await call(auth.refreshToken, { cookies: { refreshToken: plain } }); expect(allowed.status).toBe(200); expect(verifyToken(allowed.cookies.accessToken).mfaVerified).toBe(false);
  await enrolled(); const current = (await User.findById(user._id))!, required = legacy(current);
  await User.collection.updateOne({ _id: user._id }, { $set: { refreshToken: hashToken(required) } });
  const denied = await call(auth.refreshToken, { cookies: { refreshToken: required } }); expect(denied.status).toBe(401); expect(denied.res.cookie).not.toHaveBeenCalled();
});

it('does not refresh an unenrolled staff account even with an old proof-marked token', async () => {
  await User.collection.updateOne({ _id: user._id }, { $set: { role: 'manager' } });
  const current = (await User.findById(user._id))!, token = generateRefreshToken(current, { mfaVerified: true });
  await User.collection.updateOne({ _id: user._id }, { $set: { refreshToken: hashToken(token) } });
  expect((await call(auth.refreshToken, { cookies: { refreshToken: token } })).status).toBe(401);
  expect((await access(generateAccessToken(current, { mfaVerified: true }))).status).toBe(401);
});

it('spends one challenge even with two different valid recovery codes', async () => {
  await enrolled(); const step = await login(), token = step.body.data.challengeToken;
  const results = await Promise.all(RECOVERY.map(code => call(auth.verifyTwoFactorLogin, { body: { challengeToken: token, code } })));
  expect(results.filter(row => row.status === 200)).toHaveLength(1); expect(results.filter(row => row.status !== 200).every(row => row.res.cookie.mock.calls.length === 0)).toBe(true);
  expect((await raw())!.twoFactorRecoveryCodeHashes).toHaveLength(1); expect((await raw())!.twoFactorChallengeHash).toBeUndefined();
  const unused = RECOVERY.find(code => (results[RECOVERY.indexOf(code)].status !== 200))!;
  expect((await call(auth.verifyTwoFactorLogin, { body: { challengeToken: token, code: unused } })).status).toBe(401);
});


// Run the real database query first, then hold its stale result while a competing
// security writer commits. This reproduces the actual async admission boundary.
const afterQuery = (model: string, operation: string, action: () => Promise<void> | void) => {
  const prototype = ((model === 'Tenant' ? Tenant : User) as unknown as { Query: { prototype: typeof mongoose.Query.prototype } }).Query.prototype;
  const original = prototype.exec;
  let intercepted = false;
  return jest.spyOn(prototype, 'exec').mockImplementation(async function (this: mongoose.Query<unknown, unknown>) {
    const result = await original.call(this);
    const query = this as unknown as { model: { modelName: string }; op: string };
    if (!intercepted && query.model.modelName === model && query.op === operation) { intercepted = true; await action(); }
    return result;
  });
};

it.each(['login', 'refresh', 'passport'] as const)('does not admit %s after its account snapshot loses a revocation race', async flow => {
  await setEpoch('missing'); const signed = await login();
  afterQuery('User', 'findOne', async () => {
    await User.collection.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 },
      $set: { role: 'manager', twoFactorEnabled: true, twoFactorSecretEnc: encryptSecret(SECRET) }, $unset: { refreshToken: 1 } });
  });
  const result = flow === 'login' ? await login() : flow === 'refresh'
    ? await call(auth.refreshToken, { cookies: { refreshToken: signed.cookies.refreshToken } })
    : await call(auth.passportLogin, { body: { assertion: passportAssertion() } });
  expect(result.res.cookie).not.toHaveBeenCalled(); expect(result.status).toBe(flow === 'passport' ? 302 : flow === 'refresh' ? 401 : 409);
  const stored = (await raw())!; expect(stored.tokenVersion).toBe(1); expect(stored.twoFactorEnabled).toBe(true); expect(stored.role).toBe('manager');
  expect(stored.refreshToken).toBeUndefined(); expect((await access(signed.cookies.accessToken)).status).toBe(401);
});

it.each([
  ['status', { status: 'suspended' }], ['email', { email: 'qa-moved@example.invalid' }], ['role', { role: 'viewer' }],
  ['memberships', { assignedTenants: [other] }], ['section access', { sectionAccess: ['packages'] }],
  ['credential', { password: 'a-different-encrypted-password' }], ['factor', { twoFactorEnabled: true, twoFactorSecretEnc: 'changed-encrypted-factor' }],
] as const)('binds native password admission to the original %s', async (_name, change) => {
  afterQuery('User', 'findOne', async () => { await User.collection.updateOne({ _id: user._id }, { $set: change }); });
  const result = await login(); expect(result.status).toBe(409); expect(result.res.cookie).not.toHaveBeenCalled();
  expect((await raw())!.refreshToken).toBeUndefined();
});

it.each(['signup', 'passport'] as const)('does not report %s success when the created account is revoked before session admission', async flow => {
  await User.deleteMany({}); const original = User.create.bind(User);
  jest.spyOn(User, 'create').mockImplementationOnce((async (...args: Parameters<typeof User.create>) => {
    const created = await original(...args) as unknown as IUser;
    await User.collection.updateOne({ _id: created._id }, { $inc: { tokenVersion: 1 }, $set: { status: 'suspended' } }); return created;
  }) as typeof User.create);
  const result = flow === 'signup' ? await call(auth.register, { body: { email: user.email, password: PASSWORD, firstName: 'QA', lastName: 'Admission' } })
    : await call(auth.passportLogin, { body: { assertion: passportAssertion() } });
  expect(result.status).toBe(flow === 'signup' ? 409 : 302); expect(result.res.cookie).not.toHaveBeenCalled();
});

it('preserves an unused refresh grant on failed admission and permits one retry', async () => {
  const signed = await login(); jest.spyOn(User, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error('local write failure'); });
  const failed = await call(auth.refreshToken, { cookies: { refreshToken: signed.cookies.refreshToken } });
  expect(failed.next).toHaveBeenCalledTimes(1); expect(failed.res.cookie).not.toHaveBeenCalled();
  expect((await raw())!.refreshToken).toBe(hashToken(signed.cookies.refreshToken));
  const retry = await call(auth.refreshToken, { cookies: { refreshToken: signed.cookies.refreshToken } }); expect(retry.status).toBe(200);
});

it('does not replay a consumed refresh when the write committed but its response was lost', async () => {
  const signed = await login(); afterQuery('User', 'findOneAndUpdate', () => { throw new Error('local result loss'); });
  const lost = await call(auth.refreshToken, { cookies: { refreshToken: signed.cookies.refreshToken } });
  expect(lost.next).toHaveBeenCalledTimes(1); expect(lost.res.cookie).not.toHaveBeenCalled();
  const retry = await call(auth.refreshToken, { cookies: { refreshToken: signed.cookies.refreshToken } });
  expect(retry.status).toBe(401); expect(retry.res.cookie).not.toHaveBeenCalled();
});

it('preserves an unused challenge and recovery code on failed admission but never after committed response loss', async () => {
  await enrolled(); const step = await login(), token = step.body.data.challengeToken;
  jest.spyOn(User, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error('local write failure'); });
  const failed = await call(auth.verifyTwoFactorLogin, { body: { challengeToken: token, code: RECOVERY[0] } });
  expect(failed.status).toBe(503); expect(failed.res.cookie).not.toHaveBeenCalled();
  expect((await raw())!.twoFactorRecoveryCodeHashes).toHaveLength(2); expect((await raw())!.twoFactorChallengeHash).toBe(hashToken(token));
  afterQuery('User', 'findOneAndUpdate', () => { throw new Error('local committed result loss'); });
  const lost = await call(auth.verifyTwoFactorLogin, { body: { challengeToken: token, code: RECOVERY[0] } });
  expect(lost.status).toBe(503); expect(lost.res.cookie).not.toHaveBeenCalled();
  expect((await raw())!.twoFactorRecoveryCodeHashes).toHaveLength(1); expect((await raw())!.twoFactorChallengeHash).toBeUndefined();
  expect((await call(auth.verifyTwoFactorLogin, { body: { challengeToken: token, code: RECOVERY[1] } })).status).toBe(401);
});

it.each(['read', 'claim'] as const)('refuses a refresh that expires after its asynchronous %s', async boundary => {
  const signed = await login(), expiry = verifyRefreshToken(signed.cookies.refreshToken).exp! * 1000;
  afterQuery('User', boundary === 'read' ? 'findOne' : 'findOneAndUpdate', () => { jest.spyOn(Date, 'now').mockReturnValue(expiry); });
  const result = await call(auth.refreshToken, { cookies: { refreshToken: signed.cookies.refreshToken } });
  expect(result.status).toBe(401); expect(result.res.cookie).not.toHaveBeenCalled();
  if (boundary === 'read') expect((await raw())!.refreshToken).toBe(hashToken(signed.cookies.refreshToken));
  else expect((await raw())!.refreshToken).not.toBe(hashToken(signed.cookies.refreshToken));
});

it.each(['read', 'claim'] as const)('refuses a Passport assertion that expires after its asynchronous %s', async boundary => {
  const assertion = passportAssertion(), expiry = JSON.parse(Buffer.from(assertion.split('.')[0], 'base64url').toString()).exp * 1000;
  afterQuery('User', boundary === 'read' ? 'findOne' : 'findOneAndUpdate', () => { jest.spyOn(Date, 'now').mockReturnValue(expiry); });
  const result = await call(auth.passportLogin, { body: { assertion } });
  expect(result.status).toBe(302); expect(result.res.cookie).not.toHaveBeenCalled();
});

it.each(['read', 'claim', 'sections'] as const)('refuses factor admission that expires after asynchronous %s', async boundary => {
  await enrolled(); const step = await login(), token = step.body.data.challengeToken, expiry = (jwt.decode(token) as jwt.JwtPayload).exp! * 1000;
  afterQuery(boundary === 'sections' ? 'Tenant' : 'User', boundary === 'read' ? 'findOne' : boundary === 'claim' ? 'findOneAndUpdate' : 'find',
    () => { jest.spyOn(Date, 'now').mockReturnValue(expiry); });
  const result = await call(auth.verifyTwoFactorLogin, { body: { challengeToken: token, code: RECOVERY[0] } });
  expect([401, 409]).toContain(result.status); expect(result.res.cookie).not.toHaveBeenCalled();
  expect((await raw())!.twoFactorRecoveryCodeHashes).toHaveLength(boundary === 'read' ? 2 : 1);
});

it.each(['missing', 'null', 'explicit'] as const)('revokes %s epochs monotonically on concurrent logout and clears cookies', async kind => {
  await setEpoch(kind); const signed = await login(); const authenticated = (await User.findById(user._id))!;
  const results = await Promise.all([call(auth.logout, { user: authenticated }), call(auth.logout, { user: authenticated })]);
  expect(results.map(result => result.status)).toEqual([200, 200]); expect(results.every(result => result.res.clearCookie.mock.calls.length === 2)).toBe(true);
  expect((await raw())!.tokenVersion).toBe(2); expect((await raw())!.refreshToken).toBeUndefined();
  expect((await access(signed.cookies.accessToken)).status).toBe(401);
});

it('clears browser cookies but reports database revocation failure instead of success', async () => {
  const signed = await login(); jest.spyOn(User, 'findByIdAndUpdate').mockImplementationOnce(() => { throw new Error('local revocation failure'); });
  const result = await call(auth.logout, { user }); expect(result.next).toHaveBeenCalledTimes(1); expect(result.status).toBeUndefined();
  expect(result.res.clearCookie.mock.calls.map(([name]) => name)).toEqual(['accessToken', 'refreshToken']);
  errorHandler(result.next.mock.calls[0][0], request() as never, result.res as never, jest.fn());
  expect(result.res.status).toHaveBeenCalledWith(500); expect((await raw())!.refreshToken).toBe(hashToken(signed.cookies.refreshToken));
});

it.each(['missing', 'null', 'explicit'] as const)('changes a password once with %s epoch, keeps the active factor, and never mints a stale grant', async kind => {
  await setEpoch(kind); await enrolled();
  const current = (await User.findById(user._id))!;
  const responses = await Promise.all(Array.from({ length: 2 }, () => call(auth.changePassword, { user: current, body: { currentPassword: PASSWORD, newPassword: NEXT } })));
  expect(responses.map(result => result.status).sort()).toEqual([200, 409]); expect(responses.every(result => result.res.cookie.mock.calls.length === 0)).toBe(true);
  const stored = (await raw())!; expect(stored.tokenVersion).toBe(1); expect(stored.twoFactorEnabled).toBe(true); expect(stored.twoFactorSecretEnc).toBeTruthy();
  expect(await bcrypt.compare(NEXT, stored.password!)).toBe(true); expect(await bcrypt.compare(PASSWORD, stored.password!)).toBe(false);
});

it('rejects a password write when a security change occurs during verification', async () => {
  afterQuery('User', 'findOne', async () => { const current = (await User.findById(user._id))!; await revokeUserSessions(current); current.role = 'manager'; await current.save(); });
  const result = await call(auth.changePassword, { user, body: { currentPassword: PASSWORD, newPassword: NEXT } });
  expect(result.status).toBe(409); expect((await raw())!.tokenVersion).toBe(1); expect(await bcrypt.compare(PASSWORD, (await raw())!.password!)).toBe(true);
});


it.each([
  ['status', { status: 'suspended' }], ['email', { email: 'qa-reassigned@example.invalid' }], ['role', { role: 'editor' }],
  ['tenant', { assignedTenants: [other] }], ['sections', { sectionAccess: ['bundles'] }],
  ['password', { password: 'changed-password-hash' }], ['factor', { twoFactorSecretEnc: 'changed-factor' }], ['epoch', { tokenVersion: 1 }],
] as const)('refuses a challenge after its original %s context changes even without relying on revocation', async (_name, value) => {
  await enrolled(); const token = (await login()).body.data.challengeToken;
  await User.collection.updateOne({ _id: user._id }, { $set: value });
  const result = await call(auth.verifyTwoFactorLogin, { body: { challengeToken: token, code: RECOVERY[0] } });
  expect(result.status).toBe(401); expect(result.res.cookie).not.toHaveBeenCalled();
  expect((await raw())!.twoFactorRecoveryCodeHashes).toHaveLength(2);
});

it('refuses a signed challenge without its current durable receipt', async () => {
  await enrolled(); const current = (await User.findById(user._id).select('+password +twoFactorSecretEnc'))!;
  const token = generateTwoFactorChallenge(current);
  const result = await call(auth.verifyTwoFactorLogin, { body: { challengeToken: token, code: RECOVERY[0] } });
  expect(result.status).toBe(401); expect(result.res.cookie).not.toHaveBeenCalled(); expect((await raw())!.twoFactorRecoveryCodeHashes).toHaveLength(2);
});

it.each([undefined, false, 'true', 1])('refuses required-factor native grants with non-verified proof %s', async proof => {
  await enrolled('customer');
  const mint = (type: 'access' | 'refresh') => jwt.sign({ userId: String(user._id), email: user.email, role: 'customer', sessionVersion: 0, type,
    ...(proof === undefined ? {} : { mfaVerified: proof }) }, env.jwtSecret, { audience: `attractions-network:${type}`, expiresIn: '5m' });
  const accessToken = mint('access'), refreshToken = mint('refresh');
  expect((await access(accessToken)).status).toBe(401); expect((await access(accessToken, true)).attached).toBe(false);
  await User.collection.updateOne({ _id: user._id }, { $set: { refreshToken: hashToken(refreshToken) } });
  const result = await call(auth.refreshToken, { cookies: { refreshToken } }); expect(result.status).toBe(401); expect(result.res.cookie).not.toHaveBeenCalled();
});

it('does not refresh an inactive customer or a mismatched stored grant', async () => {
  const signed = await login();
  await User.collection.updateOne({ _id: user._id }, { $set: { status: 'suspended' } });
  expect((await call(auth.refreshToken, { cookies: { refreshToken: signed.cookies.refreshToken } })).status).toBe(401);
  await User.collection.updateOne({ _id: user._id }, { $set: { status: 'active', refreshToken: hashToken('a-different-grant') } });
  expect((await call(auth.refreshToken, { cookies: { refreshToken: signed.cookies.refreshToken } })).status).toBe(401);
});
