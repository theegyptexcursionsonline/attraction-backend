import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
import { IUser } from '../types';

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

export const generateAccessToken = (user: IUser): string => {
  const payload: TokenPayload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    sessionVersion: user.tokenVersion || 0,
  };

  const options: SignOptions = {
    expiresIn: env.jwtAccessExpiry as jwt.SignOptions['expiresIn'],
  };

  return jwt.sign(payload, env.jwtSecret, options);
};

export const generateRefreshToken = (user: IUser): string => {
  const payload: TokenPayload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    sessionVersion: user.tokenVersion || 0,
  };

  const options: SignOptions = {
    expiresIn: env.jwtRefreshExpiry as jwt.SignOptions['expiresIn'],
  };

  return jwt.sign(payload, env.jwtSecret, options);
};

export const verifyToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, env.jwtSecret) as TokenPayload;
  } catch {
    throw new Error('Invalid or expired token');
  }
};

export const generateTwoFactorChallenge = (user: IUser, rememberMe = false): string =>
  jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      sessionVersion: user.tokenVersion || 0,
      type: 'two-factor-challenge',
      rememberMe,
    } satisfies Omit<TwoFactorChallengePayload, keyof JwtPayload>,
    env.jwtSecret,
    { expiresIn: '10m', audience: 'attractions-network:two-factor' }
  );

export const verifyTwoFactorChallenge = (token: string): TwoFactorChallengePayload => {
  const payload = jwt.verify(token, env.jwtSecret, {
    audience: 'attractions-network:two-factor',
  }) as TwoFactorChallengePayload;
  if (payload.type !== 'two-factor-challenge') throw new Error('Invalid two-factor challenge');
  return payload;
};

export const decodeToken = (token: string): TokenPayload | null => {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
};
