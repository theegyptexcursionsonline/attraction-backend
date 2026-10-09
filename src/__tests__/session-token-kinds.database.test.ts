/**
 * A sign-in token opens only its own door.
 *
 * The password step of an admin sign-in answers with a two-factor challenge in the response body.
 * Until that challenge is exchanged for a session at /auth/2fa/*, it must open nothing: before this
 * contract, the API accepted it wherever it accepted a session, so an admin's password alone opened
 * every admin API for ten minutes at a time — including for accounts that had not enrolled 2FA yet.
 * A refresh token is the same story with a longer life: it exists only to be exchanged at
 * /auth/refresh-token, never to authenticate a request.
 *
 * Everything here runs through the real app against a real database with real tokens. The route
 * sweep walks Express itself, so a route added later is covered without editing this file.
 */
import crypto from 'crypto';
import http from 'http';
import path from 'path';
import { execFile, spawnSync } from 'child_process';
import { promisify } from 'util';
import jwt from 'jsonwebtoken';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from '../test/loopbackRequest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import { AuditLog } from '../models/AuditLog';
import { User } from '../models/User';
import { env } from '../config/env';
import { generateAccessToken, generateRefreshToken, generateTwoFactorChallenge } from '../utils/jwt';
import { hashToken } from '../utils/hash';
import { encryptSecret } from '../utils/secretCrypto';
import { AuthRequest, IUser } from '../types';

jest.setTimeout(240_000);

const PASSWORD = 'FixturePasswordOnlyForLocalTests123!';
const RECOVERY_CODE = 'AN-1A2B-3C4D';
const OBJECT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

let mongo: MongoMemoryServer;
let server: http.Server;
let enrolledAdmin: IUser;
let unenrolledAdmin: IUser;
let customer: IUser;
let suspendedAdmin: IUser;
let activeAdmin: IUser;

/** What the API issued before tokens were typed: same secret, no audience, no type. */
const legacyToken = (user: IUser, expiresIn: jwt.SignOptions['expiresIn']) =>
  jwt.sign(
    { userId: String(user._id), email: user.email, role: user.role, sessionVersion: user.tokenVersion || 0 },
    env.jwtSecret,
    { expiresIn }
  );

const fresh = async (user: IUser): Promise<IUser> => (await User.findById(user._id))!;

const cookieValue = (response: request.Response, name: string): string | undefined => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  const line = (raw || []).find((cookie) => cookie.startsWith(`${name}=`));
  return line ? decodeURIComponent(line.slice(name.length + 1).split(';')[0]) : undefined;
};

const login = (email: string) =>
  request(server).post('/api/auth/login').send({ email, password: PASSWORD });

const me = (bearer: string) => request(server).get('/api/auth/me').set('Authorization', `Bearer ${bearer}`);

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  mongo = await MongoMemoryServer.create(systemBinary ? { binary: { systemBinary } } : {});
  await mongoose.connect(mongo.getUri('session_token_kinds'));
  const account = (email: string, role: string, extra: Record<string, unknown> = {}) => ({
    email, password: PASSWORD, firstName: 'QA', lastName: role, role, status: 'active', ...extra,
  });
  [enrolledAdmin, unenrolledAdmin, customer, suspendedAdmin, activeAdmin] = await User.create([
    account('qa-enrolled-admin@example.invalid', 'super-admin', {
      twoFactorEnabled: true,
      twoFactorSecretEnc: encryptSecret('JBSWY3DPEHPK3PXP'),
      twoFactorRecoveryCodeHashes: [hashToken(RECOVERY_CODE)],
    }),
    account('qa-unenrolled-admin@example.invalid', 'brand-admin'),
    account('qa-customer@example.invalid', 'customer'),
    account('qa-suspended-admin@example.invalid', 'super-admin', { status: 'suspended' }),
    account('qa-active-admin@example.invalid', 'super-admin'),
  ]);
  // Bound to 127.0.0.1 (see src/test/loopbackRequest.ts): a wildcard listener can lose its requests to
  // another process's bind on the same port.
  server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('the password step of an admin sign-in', () => {
  it('returns a challenge that is refused as a session everywhere, by header and by cookie', async () => {
    const response = await login(enrolledAdmin.email).expect(202);
    expect(response.body.data.requiresTwoFactor).toBe(true);
    expect(response.headers['set-cookie']).toBeUndefined();
    const { challengeToken } = response.body.data as { challengeToken: string };

    const asBearer = await me(challengeToken);
    expect(asBearer.status).toBe(401);
    expect(asBearer.body).toMatchObject({ success: false, error: 'Invalid or expired token' });

    const asCookie = await request(server).get('/api/auth/me').set('Cookie', `accessToken=${challengeToken}`);
    expect(asCookie.status).toBe(401);

    // The admin surface the bypass actually exposed.
    expect((await request(server).get('/api/users').set('Authorization', `Bearer ${challengeToken}`)).status).toBe(401);
    expect((await request(server).get('/api/audit-logs').set('Authorization', `Bearer ${challengeToken}`)).status).toBe(401);
    expect((await request(server).get('/api/api-keys').set('Authorization', `Bearer ${challengeToken}`)).status).toBe(401);
  });

  it('opens nothing for an admin who still has to enrol two-factor authentication', async () => {
    const response = await login(unenrolledAdmin.email).expect(202);
    expect(response.body.data.requiresTwoFactorSetup).toBe(true);
    const { challengeToken } = response.body.data as { challengeToken: string };

    expect((await me(challengeToken)).status).toBe(401);
    expect((await request(server).get('/api/tenants/admin/portfolio-stats').set('Authorization', `Bearer ${challengeToken}`)).status).toBe(401);
  });

  it('is exchanged for a working session by /auth/2fa/verify, and the session cookies are typed', async () => {
    const { challengeToken } = (await login(enrolledAdmin.email).expect(202)).body.data as { challengeToken: string };

    const verified = await request(server)
      .post('/api/auth/2fa/verify')
      .send({ challengeToken, code: RECOVERY_CODE.toLowerCase() })
      .expect(200);
    const accessToken = cookieValue(verified, 'accessToken')!;
    const refreshToken = cookieValue(verified, 'refreshToken')!;
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
    expect(JSON.stringify(verified.body)).not.toContain(accessToken);

    expect(jwt.decode(accessToken)).toMatchObject({ aud: 'attractions-network:access', type: 'access' });
    expect(jwt.decode(refreshToken)).toMatchObject({ aud: 'attractions-network:refresh', type: 'refresh' });

    const session = await me(accessToken).expect(200);
    expect(session.body.data.email).toBe(enrolledAdmin.email);
    expect((await request(server).get('/api/users').set('Authorization', `Bearer ${accessToken}`)).status).toBe(200);

    // The recovery code is spent; the same challenge cannot mint a second session with it.
    expect((await request(server).post('/api/auth/2fa/verify').send({ challengeToken, code: RECOVERY_CODE })).status).toBe(401);
  });
});

describe('a refresh token', () => {
  const sessionFor = async (user: IUser) => {
    const current = await fresh(user);
    const refreshToken = generateRefreshToken(current);
    await User.collection.updateOne({ _id: current._id }, { $set: { refreshToken: hashToken(refreshToken) } });
    return { refreshToken, accessToken: generateAccessToken(current) };
  };

  it('is refused as a bearer credential and as an access cookie', async () => {
    const { refreshToken, accessToken } = await sessionFor(customer);
    expect((await me(accessToken)).status).toBe(200);

    const asBearer = await me(refreshToken);
    expect(asBearer.status).toBe(401);
    expect(asBearer.body.error).toBe('Invalid or expired token');
    expect((await request(server).get('/api/auth/me').set('Cookie', `accessToken=${refreshToken}`)).status).toBe(401);
  });

  it('is rotated by /auth/refresh-token, and the spent one is refused', async () => {
    const { refreshToken } = await sessionFor(customer);

    const rotated = await request(server).post('/api/auth/refresh-token').set('Cookie', `refreshToken=${refreshToken}`).expect(200);
    const nextAccess = cookieValue(rotated, 'accessToken')!;
    const nextRefresh = cookieValue(rotated, 'refreshToken')!;
    expect(jwt.decode(nextAccess)).toMatchObject({ aud: 'attractions-network:access', type: 'access' });
    expect(jwt.decode(nextRefresh)).toMatchObject({ aud: 'attractions-network:refresh', type: 'refresh' });
    expect((await me(nextAccess)).status).toBe(200);

    expect((await request(server).post('/api/auth/refresh-token').set('Cookie', `refreshToken=${refreshToken}`)).status).toBe(401);
  });

  it('is the only kind /auth/refresh-token exchanges, even where the stored hash would match', async () => {
    // The stored hash normally stops any other token on its own. Pinning the hash to the wrong kind
    // isolates the second wall: the endpoint itself refuses an access token and a challenge.
    for (const minted of [generateAccessToken(await fresh(customer)), generateTwoFactorChallenge(await fresh(enrolledAdmin))]) {
      const owner = jwt.decode(minted) as { userId: string };
      await User.collection.updateOne({ _id: new Types.ObjectId(owner.userId) }, { $set: { refreshToken: hashToken(minted) } });
      const response = await request(server).post('/api/auth/refresh-token').set('Cookie', `refreshToken=${minted}`);
      expect(response.status).toBe(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });
});

describe('tokens issued before tokens were typed', () => {
  it('never authenticate a request: an old access token is refreshed, an old refresh token is not a session', async () => {
    const current = await fresh(customer);
    const oldAccess = legacyToken(current, '4h');
    const oldRefresh = legacyToken(current, '7d');
    expect((await me(oldAccess)).status).toBe(401);
    expect((await me(oldRefresh)).status).toBe(401);
  });
});

describe('every authenticated route', () => {
  type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
  type GuardedRoute = { method: Method; path: string; guard: 'authenticate' | 'optionalAuth' };
  const EVERY_METHOD: Method[] = ['get', 'post', 'put', 'patch', 'delete'];

  type Layer = {
    route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: unknown }> };
    handle: unknown & { stack?: Layer[] };
    regexp: RegExp & { fast_slash?: boolean };
    keys: Array<{ name: string }>;
  };

  /** Express 4 keeps a mount path only as a regular expression; rebuild the literal path from it. */
  const mountPath = (layer: Layer): string => {
    if (layer.regexp.fast_slash) return '';
    let key = 0;
    return layer.regexp.source
      .replace(/^\^/, '')
      .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
      .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, () => `:${layer.keys[key++].name}`)
      .replace(/\\\//g, '/');
  };

  /** Every route of the real app with the identity guard in its chain, router-level guards included. */
  const guardedRoutes = (): GuardedRoute[] => {
    const routes: GuardedRoute[] = [];
    const walk = (stack: Layer[], prefix: string, inherited: unknown[]) => {
      const chain = [...inherited];
      for (const layer of stack) {
        if (layer.route) {
          const handles = [...chain, ...layer.route.stack.map((entry) => entry.handle)];
          const guard = handles.includes(authenticate) ? 'authenticate' : handles.includes(optionalAuth) ? 'optionalAuth' : null;
          if (!guard) continue;
          for (const method of Object.keys(layer.route.methods)) {
            // router.all() reports `_all`: sweep it under every method rather than skip it.
            for (const each of method === '_all' ? EVERY_METHOD : [method as Method]) {
              routes.push({ method: each, path: prefix + layer.route.path, guard });
            }
          }
        } else if (layer.handle.stack) {
          walk(layer.handle.stack, prefix + mountPath(layer), chain);
        } else if (layer.regexp.fast_slash) {
          chain.push(layer.handle);
        }
      }
    };
    walk((app as unknown as { _router: { stack: Layer[] } })._router.stack, '', []);
    return routes;
  };

  const concrete = (routePath: string) => routePath.replace(/:[A-Za-z0-9_]+/g, OBJECT_ID);
  const family = (routePath: string) => routePath.split('/').slice(2, routePath.startsWith('/api/admin/') ? 4 : 3).join('/');
  // A route that validates its input before the sign-in check needs a valid request to reach it.
  const reachingQuery: Record<string, Record<string, string>> = {
    'get /api/public/route-composition': { tenantSlug: 'grand-rock-safari', domain: 'grandrocksafari.com', route: 'home', locale: 'en' },
  };
  const send = (route: GuardedRoute, headers: Record<string, string>) => {
    let pending = request(server)[route.method](concrete(route.path)).query(reachingQuery[`${route.method} ${route.path}`] || {});
    for (const [name, value] of Object.entries(headers)) pending = pending.set(name, value);
    return pending;
  };

  const routes = guardedRoutes();
  const protectedRoutes = routes.filter((route) => route.guard === 'authenticate');
  const optionalRoutes = routes.filter((route) => route.guard === 'optionalAuth');

  // Two bundle routes answer 503 before their guard while the feature is off. The sweep must reach
  // the guard whatever a local .env says, so the features are on for this block and restored after.
  const bundleFlags = { bundleDiscoveryEnabled: env.bundleDiscoveryEnabled, bundleCheckoutEnabled: env.bundleCheckoutEnabled, bundleRecoveryEnabled: env.bundleRecoveryEnabled };
  beforeAll(() => {
    env.bundleDiscoveryEnabled = true;
    env.bundleCheckoutEnabled = true;
    env.bundleRecoveryEnabled = true;
  });
  afterAll(() => {
    Object.assign(env, bundleFlags);
  });

  it('finds the whole API, so the sweep can never pass by finding nothing', () => {
    expect(protectedRoutes.length).toBeGreaterThanOrEqual(200);
    expect(optionalRoutes.length).toBeGreaterThanOrEqual(40);
    const families = new Set(protectedRoutes.map((route) => family(route.path)));
    for (const expected of [
      'auth', 'users', 'audit-logs', 'api-keys', 'webhooks', 'tenants', 'attractions', 'bookings', 'payments',
      'upload', 'promo-codes', 'special-offers', 'bundles', 'bundle-orders', 'bundle-supply-offers', 'packages',
      'page', 'preview', 'notifications', 'reviews', 'rsvps', 'contact', 'categories', 'destinations', 'stats',
      'admin/users', 'admin/tenants', 'admin/attractions', 'admin/bookings', 'admin/journal',
      'admin/attraction-translations', 'admin/destination-translations', 'admin/categories', 'admin/destinations',
    ]) {
      expect(families).toContain(expected);
    }
    expect(protectedRoutes.map((route) => `${route.method} ${route.path}`)).toEqual(
      expect.arrayContaining(['get /api/auth/me', 'get /api/users/', 'get /api/audit-logs/', 'post /api/api-keys/'])
    );
  });

  it('accepts an access token and refuses every other kind, before any handler runs', async () => {
    // A suspended account makes `authenticate` itself answer on every route: a token it accepted
    // reaches the account check (403), a token it refused never gets that far (401). No handler
    // ever runs, so the sweep is side-effect free on every method.
    const account = await fresh(suspendedAdmin);
    const tokens = {
      access: generateAccessToken(account),
      challenge: generateTwoFactorChallenge(account),
      refresh: generateRefreshToken(account),
      legacyAccess: legacyToken(account, '4h'),
      legacyRefresh: legacyToken(account, '7d'),
    };
    const failures: string[] = [];
    for (const route of protectedRoutes) {
      const [access, challenge, refresh, legacyAccess, legacyRefresh, challengeCookie, refreshCookie] = await Promise.all([
        send(route, { Authorization: `Bearer ${tokens.access}` }),
        send(route, { Authorization: `Bearer ${tokens.challenge}` }),
        send(route, { Authorization: `Bearer ${tokens.refresh}` }),
        send(route, { Authorization: `Bearer ${tokens.legacyAccess}` }),
        send(route, { Authorization: `Bearer ${tokens.legacyRefresh}` }),
        send(route, { Cookie: `accessToken=${tokens.challenge}` }),
        send(route, { Cookie: `accessToken=${tokens.refresh}` }),
      ]);
      const label = `${route.method.toUpperCase()} ${route.path}`;
      if (access.status !== 403 || access.body.error !== 'Account is not active') failures.push(`${label} access → ${access.status}`);
      for (const [kind, response] of Object.entries({ challenge, refresh, legacyAccess, legacyRefresh, challengeCookie, refreshCookie })) {
        if (response.status !== 401 || response.body.error !== 'Invalid or expired token') failures.push(`${label} ${kind} → ${response.status}`);
      }
    }
    expect({ routes: protectedRoutes.length, refused: failures.length, first: failures.slice(0, 12) }).toEqual({
      routes: protectedRoutes.length, refused: 0, first: [],
    });
  });

  it('never signs anyone in on an optional-sign-in route with a challenge or a refresh token', async () => {
    // These routes also serve guests, so a refused token falls back to a guest request. Asserting
    // the account in X-Expected-Principal turns "not signed in as them" into an immediate 409
    // before any handler runs; a token that signed the request in would have passed straight on.
    const failures: string[] = [];
    for (const route of optionalRoutes) {
      const account = await fresh(activeAdmin);
      const principal = { 'X-Expected-Principal': String(account._id) };
      const kinds = {
        challenge: generateTwoFactorChallenge(account),
        refresh: generateRefreshToken(account),
        legacyRefresh: legacyToken(account, '7d'),
      };
      for (const [kind, token] of Object.entries(kinds)) {
        const response = await send(route, { ...principal, Authorization: `Bearer ${token}` });
        if (response.status !== 409 || response.body.error !== 'Sign-in session changed') {
          failures.push(`${route.method.toUpperCase()} ${route.path} ${kind} → ${response.status}`);
        }
      }
    }
    expect({ routes: optionalRoutes.length, signedIn: failures.length, first: failures.slice(0, 12) }).toEqual({
      routes: optionalRoutes.length, signedIn: 0, first: [],
    });
  });

  it('signs a request in on an optional-sign-in route only with an access token', async () => {
    const probe = express();
    probe.use(cookieParser());
    probe.get('/whoami', optionalAuth, (req, res) => res.json({ user: (req as AuthRequest).user ? String((req as AuthRequest).user!._id) : null }));
    const account = await fresh(activeAdmin);
    const ask = async (headers: Record<string, string>) => {
      let pending = request(probe).get('/whoami');
      for (const [name, value] of Object.entries(headers)) pending = pending.set(name, value);
      return (await pending.expect(200)).body.user;
    };
    expect(await ask({ Authorization: `Bearer ${generateAccessToken(account)}` })).toBe(String(account._id));
    expect(await ask({ Cookie: `accessToken=${generateAccessToken(account)}` })).toBe(String(account._id));
    for (const token of [generateTwoFactorChallenge(account), generateRefreshToken(account), legacyToken(account, '4h'), legacyToken(account, '7d'), 'not-a-token']) {
      expect(await ask({ Authorization: `Bearer ${token}` })).toBeNull();
      expect(await ask({ Cookie: `accessToken=${token}` })).toBeNull();
    }
  });

  it('cannot sign an admin out of all their sessions with only their password', async () => {
    // /auth/logout runs on optional sign-in and revokes every session of the signed-in account.
    const before = (await fresh(enrolledAdmin)).tokenVersion || 0;
    const { challengeToken } = (await login(enrolledAdmin.email).expect(202)).body.data as { challengeToken: string };
    await request(server).post('/api/auth/logout').set('Authorization', `Bearer ${challengeToken}`).expect(200);
    expect((await fresh(enrolledAdmin)).tokenVersion || 0).toBe(before);

    await request(server).post('/api/auth/logout').set('Authorization', `Bearer ${generateAccessToken(await fresh(enrolledAdmin))}`).expect(200);
    expect((await fresh(enrolledAdmin)).tokenVersion || 0).toBe(before + 1);
  });
});

describe('Foxes Passport single sign-on', () => {
  // The portal's assertion proves an email, not this platform's second factor. It may open a
  // customer account; a team account always signs in here with its password and two-factor code.
  const PASSPORT_SECRET = 'test-passport-secret-at-least-32-characters';
  const assertionFor = (email: string) => {
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
      sub: 'portal-account', email, org: null, role: 'owner', mfa: true, aud: 'attraction', iat: now, exp: now + 120,
    })).toString('base64url');
    return `${payload}.${crypto.createHmac('sha256', PASSPORT_SECRET).update(payload).digest('base64url')}`;
  };
  const passport = (email: string) => request(server).post('/api/auth/passport').send({ assertion: assertionFor(email) });
  let previousSecret: string;
  beforeAll(() => {
    previousSecret = env.foxesPassportSecret;
    env.foxesPassportSecret = PASSPORT_SECRET;
  });
  afterAll(() => {
    env.foxesPassportSecret = previousSecret;
  });

  it.each([
    ['a super admin', () => enrolledAdmin],
    ['a brand admin who has not enrolled two-factor yet', () => unenrolledAdmin],
  ])('never signs %s in, even when the portal vouches for its own second factor', async (_label, target) => {
    const before = await User.findById(target()._id).select('+refreshToken');
    const failuresBefore = await AuditLog.countDocuments({ actorId: target()._id, action: 'auth.login_failed' });
    const response = await passport(target().email);

    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/\/login\?error=use_password_sign_in$/);
    expect(response.headers['set-cookie']).toBeUndefined();
    const after = await User.findById(target()._id).select('+refreshToken');
    expect(after!.refreshToken).toBe(before!.refreshToken);
    expect(after!.lastLogin?.getTime()).toBe(before!.lastLogin?.getTime());

    // The refusal is in the admin's own User log, like a wrong password (written after the response).
    let logged = 0;
    for (let attempt = 0; attempt < 100 && logged === 0; attempt += 1) {
      logged = (await AuditLog.countDocuments({ actorId: target()._id, action: 'auth.login_failed' })) - failuresBefore;
      if (logged === 0) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(logged).toBe(1);
  });

  it('still signs an existing customer in, with a typed session', async () => {
    const response = await passport(customer.email).expect(200);
    const accessToken = cookieValue(response, 'accessToken')!;
    expect(jwt.decode(accessToken)).toMatchObject({ aud: 'attractions-network:access', type: 'access' });
    expect((await me(accessToken)).body.data.email).toBe(customer.email);
  });

  it('still opens a new customer account for a first-time email, never a team role', async () => {
    const email = 'qa-passport-newcomer@example.invalid';
    const response = await passport(email).expect(200);
    expect(cookieValue(response, 'accessToken')).toBeTruthy();
    expect((await User.findOne({ email }))!.role).toBe('customer');
  });
});

describe('the authenticator-app sign-in, end to end', () => {
  it('turns a password + current code into a session, and a password alone into nothing', async () => {
    // otplib ships ESM that Jest cannot load in-process, so this leg runs the real app in a child
    // process against the same database (the pattern two-factor.test.ts uses). The child runs
    // asynchronously: a blocked parent stops draining the in-memory mongod's log pipe and stalls it.
    const script = `
      require('ts-node').register({ transpileOnly: true });
      const mongoose = require('mongoose');
      const request = require('./src/test/loopbackRequest').default;
      const { generate, generateSecret } = require('otplib');
      const app = require('./src/app').default;
      const { User } = require('./src/models/User');
      const { encryptSecret } = require('./src/utils/secretCrypto');
      const cookie = (res, name) => { const line = (res.headers['set-cookie'] || []).find((c) => c.startsWith(name + '=')); return line ? decodeURIComponent(line.slice(name.length + 1).split(';')[0]) : null; };
      (async () => {
        await mongoose.connect(process.env.TEST_MONGO_URI);
        const secret = generateSecret();
        const password = process.env.TEST_PASSWORD;
        await User.create([
          { email: 'qa-totp-admin@example.invalid', password, firstName: 'QA', lastName: 'Totp', role: 'manager', status: 'active', twoFactorEnabled: true, twoFactorSecretEnc: encryptSecret(secret) },
          { email: 'qa-totp-enrol@example.invalid', password, firstName: 'QA', lastName: 'Enrol', role: 'editor', status: 'active' },
        ]);
        const out = {};
        const signIn = await request(app).post('/api/auth/login').send({ email: 'qa-totp-admin@example.invalid', password });
        out.passwordStep = signIn.status;
        out.challengeAsSession = (await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + signIn.body.data.challengeToken)).status;
        const verified = await request(app).post('/api/auth/2fa/verify').send({ challengeToken: signIn.body.data.challengeToken, code: await generate({ secret }) });
        out.verify = verified.status;
        out.sessionAfterVerify = (await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + cookie(verified, 'accessToken'))).status;

        const enrol = await request(app).post('/api/auth/login').send({ email: 'qa-totp-enrol@example.invalid', password });
        out.enrolPasswordStep = enrol.status;
        out.enrolRequired = enrol.body.data.requiresTwoFactorSetup === true;
        out.enrolChallengeAsSession = (await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + enrol.body.data.challengeToken)).status;
        const setup = await request(app).post('/api/auth/2fa/setup').send({ challengeToken: enrol.body.data.challengeToken });
        out.setup = setup.status;
        const confirmed = await request(app).post('/api/auth/2fa/confirm').send({ challengeToken: enrol.body.data.challengeToken, code: await generate({ secret: setup.body.data.manualSecret }) });
        out.confirm = confirmed.status;
        out.recoveryCodes = (confirmed.body.data.recoveryCodes || []).length;
        out.sessionAfterEnrol = (await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + cookie(confirmed, 'accessToken'))).status;
        process.stdout.write('RESULT ' + JSON.stringify(out) + '\\n');
        await mongoose.disconnect();
        process.exit(0);
      })().catch((error) => { console.error(error); process.exit(1); });
    `;
    const result = await promisify(execFile)(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_MONGO_URI: mongo.getUri('session_token_kinds_totp'),
        TEST_PASSWORD: PASSWORD,
        MAILGUN_API_KEY: '',
        MAILGUN_DOMAIN: '',
      },
    }).catch((error: { stdout?: string; stderr?: string; code?: number }) => {
      throw new Error(`child run failed (${error.code}): ${(error.stderr || '').slice(-2000)}`);
    });
    const line = result.stdout.split('\n').find((entry) => entry.startsWith('RESULT '));
    if (!line) throw new Error(`child run printed no result: ${result.stderr.slice(-2000)}`);
    expect(JSON.parse(line.slice('RESULT '.length))).toEqual({
      passwordStep: 202,
      challengeAsSession: 401,
      verify: 200,
      sessionAfterVerify: 200,
      enrolPasswordStep: 202,
      enrolRequired: true,
      enrolChallengeAsSession: 401,
      setup: 200,
      confirm: 200,
      recoveryCodes: 8,
      sessionAfterEnrol: 200,
    });
  });
});
