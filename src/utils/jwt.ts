import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
import { IUser } from '../types';

export interface TokenPayload extends JwtPayload {
  userId: string;
  email: string;
  role: string;
  sessionVersion: number;
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

export const decodeToken = (token: string): TokenPayload | null => {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
};
