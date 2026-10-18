/* Real Node crypto integration: Jest's CJS VM cannot load otplib's ESM dependency.
 * Only the disposable database URI supplied by the parent test is used. */
require('ts-node').register({ transpileOnly: true });
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { generate } = require('otplib');
const { User } = require('../../models/User');
const { Tenant } = require('../../models/Tenant');
const factors = require('../../utils/twoFactor');
const { encryptSecret } = require('../../utils/secretCrypto');
const { hashToken } = require('../../utils/hash');
const { revokeUserSessions } = require('../../utils/session');
const { verifyToken } = require('../../utils/jwt');
const { authenticate } = require('../../middleware/auth.middleware');
require('../../services/email.service').sendWelcomeEmail = async () => ({ status: 'sent' });
require('../../services/notification.service').createAdminNotifications = async () => {};
require('../../services/auditLog.service').recordAudit = () => {};
const auth = require('../../controllers/auth.controller');
const PASSWORD = 'LocalFixturePassword123!';
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const RECOVERY = 'AN-1234-ABCD';
const realNow = Date.now;
const restores = [];
const results = [];
let user;
const response = () => ({ statusCode: undefined, cookies: {}, status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; }, cookie(name, value) { this.cookies[name] = value; }, clearCookie() {}, locals: {} });
const call = async (handler, body) => { const res = response(); await handler({ body, headers: {}, query: {}, rawHeaders: [] }, res, err => { throw err; }); return res; };
const login = async () => { const res = await call(auth.login, { email: user.email, password: PASSWORD }); assert.equal(res.statusCode, 202); return res.body.data.challengeToken; };
const setup = token => call(auth.setupTwoFactor, { challengeToken: token });
const code = secret => generate({ secret, period: 30 });
const raw = () => User.collection.findOne({ _id: user._id });
const verify = (token, tokenCode) => call(auth.verifyTwoFactorLogin, { challengeToken: token, code: tokenCode });
const confirm = (token, tokenCode) => call(auth.confirmTwoFactorSetup, { challengeToken: token, code: tokenCode });
const noGrant = res => { assert.notEqual(res.statusCode, 200); assert.deepEqual(res.cookies, {}); };
const readAccess = async token => { const res = response(); let admitted = false;
  await authenticate({ headers: { authorization: `Bearer ${token}` }, rawHeaders: [], cookies: {} }, res, () => { admitted = true; }); return admitted; };
const enroll = async () => { await User.collection.updateOne({ _id: user._id }, { $set: {
  twoFactorEnabled: true, twoFactorSecretEnc: encryptSecret(SECRET), twoFactorRecoveryCodeHashes: [hashToken(RECOVERY)],
} }); };
const replaceAfter = (object, key, action) => { const original = object[key]; object[key] = async (...args) => { const result = await original(...args); await action(result); return result; }; restores.push(() => { object[key] = original; }); };
const queryAfter = (modelName, op, action) => { const prototype = (modelName === 'Tenant' ? Tenant : User).Query.prototype; const original = prototype.exec; let used = false;
  prototype.exec = async function(...args) { const result = await original.apply(this, args);
    if (!used && this.model.modelName === modelName && this.op === op) { used = true; await action(result); } return result; };
  restores.push(() => { prototype.exec = original; }); };
const run = async (name, work) => { if (process.env.TEST_CASE && process.env.TEST_CASE !== name) return; try {
  await User.collection.deleteMany({}); await Tenant.collection.deleteMany({});
  const tenant = new mongoose.Types.ObjectId(); await Tenant.collection.insertOne({ _id: tenant, name: 'QA', slug: 'qa-mfa', enabledSections: ['tours'] });
  user = await User.create({ email: 'qa-mfa@example.invalid', firstName: 'QA', lastName: 'MFA', password: PASSWORD,
    status: 'active', role: 'manager', assignedTenants: [tenant] });
  await work(); results.push(name);
} catch (error) { throw new Error(name + ': ' + error.message); }
finally { while(restores.length) restores.pop()(); Date.now = realNow; } };

(async () => {
  assert.match(process.env.TEST_MONGO_URI || '', /^mongodb:\/\/127\.0\.0\.1:/);
  await mongoose.connect(process.env.TEST_MONGO_URI); await User.init();
  await run('same challenge setup is idempotent and fresh login supersedes its pending secret', async () => {
    const token = await login(); const [a, b] = await Promise.all([setup(token), setup(token)]);
    assert.equal(a.statusCode, 200); assert.equal(b.statusCode, 200); assert.equal(a.body.data.manualSecret, b.body.data.manualSecret);
    const next = await login(); assert.notEqual(next, token); assert.equal((await raw()).twoFactorPendingSecretEnc, undefined);
    noGrant(await setup(token)); noGrant(await confirm(next, await code(a.body.data.manualSecret)));
    const current = await setup(next); assert.equal(current.statusCode, 200); assert.notEqual(current.body.data.manualSecret, a.body.data.manualSecret);
    const accepted = await confirm(next, await code(current.body.data.manualSecret)); assert.equal(accepted.statusCode, 200);
    assert.equal((await raw()).tokenVersion, 1); assert.equal((await raw()).twoFactorChallengeHash, undefined);
    assert.equal(verifyToken(accepted.cookies.accessToken).mfaVerified, true); assert.equal(await readAccess(accepted.cookies.accessToken), true);
  });
  await run('enrollment revokes previously issued sessions and advances legacy null once', async () => {
    await enroll(); const prior = await verify(await login(), RECOVERY); assert.equal(prior.statusCode, 200);
    await User.collection.updateOne({ _id: user._id }, { $set: { twoFactorEnabled: false, tokenVersion: null }, $unset: { twoFactorSecretEnc: 1 } });
    const token = await login(), prepared = await setup(token); assert.equal(prepared.statusCode, 200);
    const accepted = await confirm(token, await code(prepared.body.data.manualSecret)); assert.equal(accepted.statusCode, 200);
    assert.equal((await raw()).tokenVersion, 1); assert.equal(await readAccess(prior.cookies.accessToken), false);
    assert.equal(await readAccess(accepted.cookies.accessToken), true);
  });
  await run('a consumed challenge cannot mint another session in a later unused TOTP step', async () => {
    await enroll(); const token = await login(), first = await verify(token, await code(SECRET)); assert.equal(first.statusCode, 200);
    Date.now = () => realNow() + 30_000; const second = await verify(token, await code(SECRET)); assert.equal(second.statusCode, 401); noGrant(second);
  });
  await run('concurrent authenticator verification consumes one challenge once', async () => {
    await enroll(); const token = await login(), current = await code(SECRET);
    const values = await Promise.all([verify(token, current), verify(token, current)]);
    assert.equal(values.filter(value => value.statusCode === 200).length, 1); values.filter(value => value.statusCode !== 200).forEach(noGrant);
  });
  await run('setup never discloses a secret after revocation while rendering QR', async () => {
    const token = await login(); replaceAfter(factors, 'createTwoFactorSetup', async () => {
      const current = await User.findById(user._id); await revokeUserSessions(current); await current.save();
    });
    const result = await setup(token); noGrant(result); assert.equal(result.body.data, undefined);
    assert.equal((await raw()).twoFactorPendingSecretEnc, undefined); assert.equal((await raw()).tokenVersion, 1);
  });
  for (const change of ['rotation', 'expiry', 'context']) await run('confirmation refuses pending setup ' + change + ' during real verification', async () => {
    const token = await login(), prepared = await setup(token); assert.equal(prepared.statusCode, 200);
    replaceAfter(factors, 'verifyTwoFactorCode', async result => { assert.equal(result.valid, true);
      await User.collection.updateOne({ _id: user._id }, { $set: change === 'rotation' ? { twoFactorPendingSecretEnc: encryptSecret('KRSXG5DSNFXGOIDB') }
        : change === 'expiry' ? { twoFactorSetupExpires: new Date(realNow() - 1) } : { assignedTenants: [new mongoose.Types.ObjectId()] } }); });
    const result = await confirm(token, await code(prepared.body.data.manualSecret)); noGrant(result);
    assert.equal((await raw()).twoFactorEnabled, false); assert.equal((await raw()).tokenVersion, 0);
  });
  for (const flow of ['verify', 'confirm']) await run(flow + ' refuses a TOTP proof expired after asynchronous crypto', async () => {
    if(flow === 'verify') await enroll(); const token = await login();
    const secret = flow === 'verify' ? SECRET : (await setup(token)).body.data.manualSecret;
    replaceAfter(factors, 'verifyTwoFactorCode', result => { assert.equal(result.valid, true); Date.now = () => factors.twoFactorProofDeadline(result.timeStep); });
    const result = await (flow === 'verify' ? verify : confirm)(token, await code(secret)); noGrant(result);
    assert.equal((await raw()).twoFactorChallengeHash, hashToken(token)); assert.equal((await raw()).refreshToken, undefined);
  });
  for (const boundary of ['claim', 'sections']) await run('TOTP proof cannot outlive ' + boundary + ' response work', async () => {
    await enroll(); const token = await login(), current = await code(SECRET);
    let deadline; replaceAfter(factors, 'verifyTwoFactorCode', result => { assert.equal(result.valid, true); deadline = factors.twoFactorProofDeadline(result.timeStep); });
    queryAfter(boundary === 'claim' ? 'User' : 'Tenant', boundary === 'claim' ? 'findOneAndUpdate' : 'find', () => { Date.now = () => deadline; });
    const result = await verify(token, current); noGrant(result); assert.equal((await raw()).twoFactorChallengeHash, undefined);
  });
  await run('expired pending setup is refused even after the final asynchronous state read', async () => {
    const token = await login(); const prepared = await setup(token); assert.equal(prepared.statusCode, 200);
    const expires = realNow() + 5_000; await User.collection.updateOne({ _id: user._id }, { $set: { twoFactorSetupExpires: new Date(expires) } });
    let reads = 0; const prototype = User.Query.prototype, original = prototype.exec;
    prototype.exec = async function(...args) { const value = await original.apply(this, args);
      if(this.model.modelName === 'User' && this.op === 'findOne' && ++reads === 2) Date.now = () => expires; return value; };
    restores.push(() => { prototype.exec = original; });
    const result = await setup(token); assert.equal(reads, 2); noGrant(result); assert.equal(result.body.data, undefined);
  });
  await run('setup helper reuses exact encrypted secret and rejects invalid ciphertext', async () => {
    const original = await factors.createTwoFactorSetup(user.email);
    const repeated = await factors.createTwoFactorSetup(user.email, { encryptedSecret: original.encryptedSecret, expiresAt: original.expiresAt });
    assert.equal(repeated.manualSecret, original.manualSecret); assert.equal(repeated.encryptedSecret, original.encryptedSecret);
    assert.equal(repeated.expiresAt.getTime(), original.expiresAt.getTime());
    await assert.rejects(factors.createTwoFactorSetup(user.email, { encryptedSecret: 'invalid-ciphertext', expiresAt: original.expiresAt }));
    for(const invalid of [-1, NaN, Infinity, 1.1, Number.MAX_SAFE_INTEGER]) assert.throws(() => factors.twoFactorProofDeadline(invalid));
    assert.equal(factors.twoFactorProofDeadline(100), 102 * 30_000);
  });
  process.stdout.write('RESULT ' + JSON.stringify(results) + '\n'); await mongoose.disconnect();
})().catch(async error => { process.stderr.write(error.message + '\n'); await mongoose.disconnect(); process.exitCode = 1; });
