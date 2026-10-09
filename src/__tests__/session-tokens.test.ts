/**
 * The three sign-in token kinds (utils/jwt.ts) share one signing secret, so each verifier must
 * accept exactly its own kind: an access token for API requests, a refresh token for
 * /auth/refresh-token only, a two-factor challenge for /auth/2fa/* only. Refresh tokens issued
 * before tokens were typed stay exchangeable for a bounded window so a release signs nobody out.
 * The clock is pinned in every test, so nothing here changes meaning on a later date.
 */
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env';
import {
  LEGACY_REFRESH_ACCEPTED_UNTIL,
  generateAccessToken,
  generateRefreshToken,
  generateTwoFactorChallenge,
  verifyRefreshToken,
  verifyToken,
  verifyTwoFactorChallenge,
} from '../utils/jwt';
import { refreshToken as refreshSession } from '../controllers/auth.controller';
import { User } from '../models/User';
import { hashToken } from '../utils/hash';
import { AuthRequest, IUser } from '../types';

jest.mock('../models/User', () => ({ User: { findById: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: { findById: jest.fn() } }));
jest.mock('../services/email.service', () => ({
  sendPasswordChangedEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
}));
jest.mock('../services/notification.service', () => ({ createAdminNotifications: jest.fn() }));

const DAY = 24 * 60 * 60 * 1000;
const INSIDE_WINDOW = LEGACY_REFRESH_ACCEPTED_UNTIL - 20 * DAY;

const account = { _id: new Types.ObjectId(), email: 'qa-tokens@example.invalid', role: 'brand-admin', tokenVersion: 2 } as unknown as IUser;
const claims = { userId: String(account._id), email: account.email, role: account.role, sessionVersion: 2 };
const legacy = (expiresIn: jwt.SignOptions['expiresIn'] = '7d') => jwt.sign(claims, env.jwtSecret, { expiresIn });
const accepts = (verify: (token: string) => unknown, token: string): boolean => {
  try {
    verify(token);
    return true;
  } catch {
    return false;
  }
};

let clock: { mockRestore(): void } | undefined;
const at = (time: number) => {
  clock?.mockRestore();
  clock = jest.spyOn(Date, 'now').mockReturnValue(time);
};
afterEach(() => {
  clock?.mockRestore();
  clock = undefined;
});

describe('sign-in token kinds', () => {
  it('each verifier accepts exactly its own kind', () => {
    at(INSIDE_WINDOW);
    const tokens = {
      access: generateAccessToken(account),
      refresh: generateRefreshToken(account),
      challenge: generateTwoFactorChallenge(account),
      legacy: legacy(),
    };
    const table = Object.fromEntries(Object.entries(tokens).map(([kind, token]) => [kind, {
      verifyToken: accepts(verifyToken, token),
      verifyRefreshToken: accepts(verifyRefreshToken, token),
      verifyTwoFactorChallenge: accepts(verifyTwoFactorChallenge, token),
    }]));
    expect(table).toEqual({
      access: { verifyToken: true, verifyRefreshToken: false, verifyTwoFactorChallenge: false },
      refresh: { verifyToken: false, verifyRefreshToken: true, verifyTwoFactorChallenge: false },
      challenge: { verifyToken: false, verifyRefreshToken: false, verifyTwoFactorChallenge: true },
      legacy: { verifyToken: false, verifyRefreshToken: true, verifyTwoFactorChallenge: false },
    });
  });

  it('names its kind twice — audience and type — and a token must carry both to pass', () => {
    at(INSIDE_WINDOW);
    expect(jwt.decode(generateAccessToken(account))).toMatchObject({ ...claims, aud: 'attractions-network:access', type: 'access' });
    expect(jwt.decode(generateRefreshToken(account))).toMatchObject({ ...claims, aud: 'attractions-network:refresh', type: 'refresh' });
    expect(jwt.decode(generateTwoFactorChallenge(account, true))).toMatchObject({
      ...claims, aud: 'attractions-network:two-factor', type: 'two-factor-challenge', rememberMe: true,
    });

    const signed = (extra: Record<string, unknown>, audience?: string) =>
      jwt.sign({ ...claims, ...extra }, env.jwtSecret, { expiresIn: '1h', ...(audience ? { audience } : {}) });
    for (const token of [
      signed({}, 'attractions-network:access'),
      signed({ type: 'access' }),
      signed({ type: 'refresh' }, 'attractions-network:access'),
      signed({ type: 'access' }, 'attractions-network:refresh'),
      signed({ type: 'access' }, 'attractions-network:two-factor'),
      signed({ type: 'two-factor-challenge' }, 'attractions-network:access'),
    ]) {
      expect(accepts(verifyToken, token)).toBe(false);
    }
    for (const token of [
      signed({}, 'attractions-network:refresh'),
      signed({ type: 'refresh' }),
      signed({ type: 'access' }, 'attractions-network:refresh'),
      signed({ type: 'refresh' }, 'attractions-network:access'),
    ]) {
      expect(accepts(verifyRefreshToken, token)).toBe(false);
    }
    expect(accepts(verifyToken, signed({ type: 'access' }, 'attractions-network:access'))).toBe(true);
  });

  it('refuses tampering, another secret, expiry, an unsigned token and other algorithms', () => {
    at(INSIDE_WINDOW);
    const access = generateAccessToken(account);
    const [header, , signature] = access.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ ...jwt.decode(access) as object, role: 'super-admin' })).toString('base64url');
    const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${access.split('.')[1]}.`;
    const options = { expiresIn: '1h' as const, audience: 'attractions-network:access' };
    for (const token of [
      `${header}.${forgedBody}.${signature}`,
      jwt.sign({ ...claims, type: 'access' }, 'another-secret-of-at-least-thirty-two-chars', options),
      jwt.sign({ ...claims, type: 'access' }, env.jwtSecret, { ...options, algorithm: 'HS512' }),
      jwt.sign({ ...claims, type: 'access', exp: Math.floor(INSIDE_WINDOW / 1000) - 1 }, env.jwtSecret, { audience: options.audience }),
      unsigned,
      'not-a-token',
    ]) {
      expect(accepts(verifyToken, token)).toBe(false);
    }
  });

  it('keeps the challenge short-lived and the access token shorter-lived than the refresh token', () => {
    // Load-bearing for the legacy window: untyped access and refresh tokens differed only in
    // lifetime, so equal lifetimes would let an old access token match the stored refresh hash.
    at(INSIDE_WINDOW);
    const life = (token: string) => {
      const { iat, exp } = jwt.decode(token) as { iat: number; exp: number };
      return exp - iat;
    };
    expect(life(generateTwoFactorChallenge(account))).toBe(600);
    expect(life(generateAccessToken(account))).toBeLessThan(life(generateRefreshToken(account)));
  });

  it('never mints the same refresh token twice, so a rotated-out one can never match the stored hash', () => {
    at(INSIDE_WINDOW);
    expect(generateRefreshToken(account)).not.toBe(generateRefreshToken(account));
  });
});

describe('one place signs and verifies sign-in tokens', () => {
  // A verifier written anywhere else would not check the audience and type, which is how the
  // two-factor challenge became a session. Every token must go through utils/jwt.ts.
  const sourceFiles = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['__tests__', 'test'].includes(entry.name) ? [] : sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
  const root = path.resolve(__dirname, '..');
  const relative = (file: string) => path.relative(root, file).split(path.sep).join('/');
  const files = sourceFiles(root);

  it('imports jsonwebtoken only in utils/jwt.ts', () => {
    expect(files.length).toBeGreaterThan(100);
    const importers = files.filter((file) => /from ['"]jsonwebtoken['"]|require\(['"]jsonwebtoken['"]\)/.test(fs.readFileSync(file, 'utf8')));
    expect(importers.map(relative)).toEqual(['utils/jwt.ts']);
  });

  it('exchanges refresh tokens and two-factor challenges only in the auth controller', () => {
    // verifyToken accepts access tokens only, so any module may read a session with it. The other
    // two kinds must stay at their one endpoint, or they become bearer credentials again.
    const users = (name: string) => files
      .filter((file) => relative(file) !== 'utils/jwt.ts' && new RegExp(`\\b${name}\\b`).test(fs.readFileSync(file, 'utf8')))
      .map(relative);
    expect(users('verifyRefreshToken')).toEqual(['controllers/auth.controller.ts']);
    expect(users('verifyTwoFactorChallenge')).toEqual(['controllers/auth.controller.ts']);
  });
});

describe('refresh tokens issued before tokens were typed', () => {
  it('are exchangeable until the window closes and never act as an access token', () => {
    at(INSIDE_WINDOW);
    const inside = legacy();
    expect(verifyRefreshToken(inside)).toMatchObject(claims);
    expect(accepts(verifyToken, inside)).toBe(false);

    // Long-lived on purpose: still unexpired after the window, so only the window can refuse it.
    const longLived = legacy('400d');
    at(LEGACY_REFRESH_ACCEPTED_UNTIL - 1);
    expect(accepts(verifyRefreshToken, longLived)).toBe(true);
    at(LEGACY_REFRESH_ACCEPTED_UNTIL);
    expect(accepts(verifyRefreshToken, longLived)).toBe(false);
    at(LEGACY_REFRESH_ACCEPTED_UNTIL + 30 * DAY);
    expect(accepts(verifyRefreshToken, longLived)).toBe(false);
    // A typed refresh token is not affected by the window.
    expect(accepts(verifyRefreshToken, generateRefreshToken(account))).toBe(true);
  });
});

describe('POST /auth/refresh-token', () => {
  const response = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    return res;
  };
  const storedAccount = (presented: string) => ({
    ...account,
    _id: account._id,
    refreshToken: hashToken(presented),
    save: jest.fn().mockResolvedValue(undefined),
  });
  const exchange = async (presented: string) => {
    const stored = storedAccount(presented);
    (User.findById as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue(stored) });
    const res = response();
    const next = jest.fn();
    await refreshSession(
      { cookies: { refreshToken: presented }, body: {}, headers: {}, rawHeaders: [] } as unknown as AuthRequest,
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    const cookies: Record<string, string> = Object.fromEntries((res.cookie.mock.calls as Array<[string, string]>).map(([name, value]) => [name, value]));
    return { status: res.status.mock.calls[0][0] as number, body: res.json.mock.calls[0][0], cookies, stored };
  };

  it('rotates a typed refresh token into typed tokens', async () => {
    at(INSIDE_WINDOW);
    const { status, cookies, stored } = await exchange(generateRefreshToken(account));
    expect(status).toBe(200);
    expect(accepts(verifyToken, cookies.accessToken)).toBe(true);
    expect(jwt.decode(cookies.refreshToken)).toMatchObject({ aud: 'attractions-network:refresh', type: 'refresh' });
    expect(stored.refreshToken).toBe(hashToken(cookies.refreshToken));
    expect(stored.save).toHaveBeenCalledTimes(1);
  });

  it('renews a pre-release session into typed tokens inside the window, and signs it out after', async () => {
    at(INSIDE_WINDOW);
    const renewed = await exchange(legacy('400d'));
    expect(renewed.status).toBe(200);
    expect(accepts(verifyToken, renewed.cookies.accessToken)).toBe(true);
    expect(accepts(verifyRefreshToken, renewed.cookies.refreshToken)).toBe(true);

    const longLived = legacy('400d');
    at(LEGACY_REFRESH_ACCEPTED_UNTIL + DAY);
    const closed = await exchange(longLived);
    expect(closed.status).toBe(401);
    expect(closed.body).toMatchObject({ success: false, error: 'Invalid refresh token' });
    expect(closed.cookies).toEqual({});
    expect(closed.stored.save).not.toHaveBeenCalled();
  });

  it.each([
    ['an access token', () => generateAccessToken(account)],
    ['a two-factor challenge', () => generateTwoFactorChallenge(account)],
  ])('refuses %s even when the stored hash matches it', async (_label, mint) => {
    at(INSIDE_WINDOW);
    const { status, cookies, stored } = await exchange(mint());
    expect(status).toBe(401);
    expect(cookies).toEqual({});
    expect(stored.save).not.toHaveBeenCalled();
  });
});
