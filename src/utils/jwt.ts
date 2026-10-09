import { randomUUID } from 'crypto';
import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
import { IUser } from '../types';

/**
 * Every token here is signed with the same secret, so each names its kind twice — an audience and
 * a `type` — and each verifier demands both. An access token authenticates API requests; a refresh
 * token is only ever exchanged at /auth/refresh-token; a two-factor challenge only completes a
 * sign-in at /auth/2fa/*. Without this, the challenge the password step returns would open the
 * admin API with no second factor, and a refresh token would be a week-long bearer credential.
 * Signing and verifying both go through the kind, so the two claims cannot drift apart.
 */
type TokenKind = 'access' | 'refresh' | 'two-factor-challenge';

const AUDIENCE: Record<TokenKind, string> = {
  access: 'attractions-network:access',
  refresh: 'attractions-network:refresh',
  'two-factor-challenge': 'attractions-network:two-factor',
};

const ALGORITHM: jwt.Algorithm = 'HS256';

export interface TokenPayload extends JwtPayload {
  userId: string;
  email: string;
  role: string;
  sessionVersion: number;
}

export interface TwoFactorChallengePayload extends TokenPayload {
  type: 'two-factor-challenge';
  rememberMe: boolean;
}

/**
 * Tokens issued before tokens were typed carry neither an audience nor a type. They are never
 * access tokens: an old access token gets a 401 and the client refreshes. Until this date the
 * refresh endpoint still exchanges an old refresh token, so a release signs nobody out. Such a
 * token is honoured only where it matches the hash stored on the account. An old access token
 * never matches: the two old kinds carried the same claims and differed only in lifetime
 * (JWT_ACCESS_EXPIRY vs JWT_REFRESH_EXPIRY, 4h vs 7d by default), so they never signed to the same
 * string. After the date it is refused like any other token (that session signs in again), and
 * the branch that reads it can be deleted.
 */
export const LEGACY_REFRESH_ACCEPTED_UNTIL = Date.parse('2026-11-09T00:00:00.000Z');

const sessionClaims = (user: IUser) => ({
  userId: user._id.toString(),
  email: user.email,
  role: user.role,
  sessionVersion: user.tokenVersion || 0,
});

const signKind = (kind: TokenKind, claims: object, options: SignOptions): string =>
  jwt.sign({ ...claims, type: kind }, env.jwtSecret, { ...options, audience: AUDIENCE[kind], algorithm: ALGORITHM });

const verifyKind = <T extends TokenPayload>(token: string, kind: TokenKind, now = Date.now()): T => {
  const payload = jwt.verify(token, env.jwtSecret, {
    audience: AUDIENCE[kind],
    algorithms: [ALGORITHM],
    clockTimestamp: Math.floor(now / 1000),
  });
  if (typeof payload === 'string' || payload.type !== kind) throw new Error(`Not a ${kind} token`);
  return payload as T;
};

export const generateAccessToken = (user: IUser): string =>
  signKind('access', sessionClaims(user), { expiresIn: env.jwtAccessExpiry as SignOptions['expiresIn'] });

// A unique id per refresh token: rotation must always store a new hash, or a token rotated
// within the same second would come back byte-identical and the spent one would still match.
export const generateRefreshToken = (user: IUser): string =>
  signKind('refresh', sessionClaims(user), {
    expiresIn: env.jwtRefreshExpiry as SignOptions['expiresIn'],
    jwtid: randomUUID(),
  });

export const generateTwoFactorChallenge = (user: IUser, rememberMe = false): string =>
  signKind('two-factor-challenge', { ...sessionClaims(user), rememberMe }, { expiresIn: '10m' });

/** An access token: the only kind that authenticates an API request. */
export const verifyToken = (token: string): TokenPayload => {
  try {
    return verifyKind(token, 'access');
  } catch {
    throw new Error('Invalid or expired token');
  }
};

/** A refresh token: accepted by /auth/refresh-token and nowhere else. */
export const verifyRefreshToken = (token: string, now = Date.now()): TokenPayload => {
  try {
    return verifyKind(token, 'refresh', now);
  } catch {
    // Not a typed refresh token; it may still be one issued before tokens were typed.
  }
  if (now < LEGACY_REFRESH_ACCEPTED_UNTIL) {
    try {
      const payload = jwt.verify(token, env.jwtSecret, {
        algorithms: [ALGORITHM],
        clockTimestamp: Math.floor(now / 1000),
      });
      if (typeof payload !== 'string' && payload.aud === undefined && payload.type === undefined) {
        return payload as TokenPayload;
      }
    } catch {
      // Refused below.
    }
  }
  throw new Error('Invalid or expired refresh token');
};

export const verifyTwoFactorChallenge = (token: string): TwoFactorChallengePayload =>
  verifyKind<TwoFactorChallengePayload>(token, 'two-factor-challenge');
