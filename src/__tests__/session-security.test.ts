import { Types } from 'mongoose';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import { login, logout, refreshToken as refreshSession } from '../controllers/auth.controller';
import { User } from '../models/User';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../utils/jwt';
import { hashToken } from '../utils/hash';
import { revokeUserSessions } from '../utils/session';
import { AuthRequest, IUser } from '../types';

jest.mock('../utils/jwt', () => ({
  verifyToken: jest.fn(),
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
}));

jest.mock('../models/User', () => ({
  User: {
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

jest.mock('../models/Tenant', () => ({ Tenant: { findById: jest.fn() } }));
jest.mock('../services/email.service', () => ({ sendPasswordResetEmail: jest.fn() }));
jest.mock('../services/notification.service', () => ({
  createAdminNotifications: jest.fn().mockResolvedValue(undefined),
}));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

const requestWithToken = (): AuthRequest => ({
  headers: { authorization: 'Bearer test-token' },
  cookies: {},
} as unknown as AuthRequest);

describe('session revocation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an access token issued before the current session version', async () => {
    (verifyToken as jest.Mock).mockReturnValue({ userId: 'user-id', sessionVersion: 2 });
    (User.findById as jest.Mock).mockResolvedValue({
      _id: new Types.ObjectId(),
      status: 'active',
      tokenVersion: 3,
    });
    const res = response();
    const next = jest.fn();

    await authenticate(requestWithToken(), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Session has been revoked' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a token matching the current session version', async () => {
    const user = { _id: new Types.ObjectId(), status: 'active', tokenVersion: 3 };
    (verifyToken as jest.Mock).mockReturnValue({ userId: 'user-id', sessionVersion: 3 });
    (User.findById as jest.Mock).mockResolvedValue(user);
    const req = requestWithToken();
    const res = response();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(req.user).toBe(user);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not attach a revoked optional session', async () => {
    (verifyToken as jest.Mock).mockReturnValue({ userId: 'user-id', sessionVersion: 1 });
    (User.findById as jest.Mock).mockResolvedValue({ status: 'active', tokenVersion: 2 });
    const req = requestWithToken();
    const next = jest.fn();

    await optionalAuth(req, response(), next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('clears refresh state and advances the session version on logout', async () => {
    const userId = new Types.ObjectId();
    const req = { user: { _id: userId } } as AuthRequest;
    const res = response();

    await logout(req, res, jest.fn());

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(userId, {
      $unset: { refreshToken: 1 },
      $inc: { tokenVersion: 1 },
    });
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
  });

  it('keeps login tokens out of the JSON response and uses short-lived access cookies', async () => {
    const user = {
      _id: new Types.ObjectId(),
      status: 'active',
      comparePassword: jest.fn().mockResolvedValue(true),
      save: jest.fn().mockResolvedValue(undefined),
      toJSON: jest.fn().mockReturnValue({ email: 'operator@example.com' }),
    };
    (User.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });
    (generateAccessToken as jest.Mock).mockReturnValue('access-secret');
    (generateRefreshToken as jest.Mock).mockReturnValue('refresh-secret');
    const res = response();

    await login(
      { body: { email: 'operator@example.com', password: 'valid-password' } } as AuthRequest,
      res,
      jest.fn()
    );

    const responseBody = res.json.mock.calls[0][0];
    expect(JSON.stringify(responseBody)).not.toContain('access-secret');
    expect(JSON.stringify(responseBody)).not.toContain('refresh-secret');
    expect(res.cookie).toHaveBeenCalledWith(
      'accessToken',
      'access-secret',
      expect.objectContaining({ httpOnly: true, maxAge: 15 * 60 * 1000 })
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-secret',
      expect.objectContaining({ httpOnly: true, path: '/api/auth/refresh-token' })
    );
  });

  it('rotates a cookie refresh token without returning either token in JSON', async () => {
    const user = {
      tokenVersion: 2,
      refreshToken: hashToken('current-refresh'),
      save: jest.fn().mockResolvedValue(undefined),
    };
    (verifyToken as jest.Mock).mockReturnValue({ userId: 'user-id', sessionVersion: 2 });
    (User.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(user),
    });
    (generateAccessToken as jest.Mock).mockReturnValue('rotated-access');
    (generateRefreshToken as jest.Mock).mockReturnValue('rotated-refresh');
    const res = response();

    await refreshSession(
      { cookies: { refreshToken: 'current-refresh' }, body: {} } as unknown as AuthRequest,
      res,
      jest.fn()
    );

    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody.data).toBeNull();
    expect(JSON.stringify(responseBody)).not.toContain('rotated-access');
    expect(JSON.stringify(responseBody)).not.toContain('rotated-refresh');
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'rotated-refresh',
      expect.objectContaining({ path: '/api/auth/refresh-token' })
    );
  });

  it('does not accept a refresh token from a browser-readable request body', async () => {
    const res = response();

    await refreshSession(
      { cookies: {}, body: { refreshToken: 'body-token' } } as unknown as AuthRequest,
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(User.findById).not.toHaveBeenCalled();
  });

  it('advances the version and clears refresh state for credential changes', () => {
    const user = { tokenVersion: 4, refreshToken: 'hashed-refresh' } as IUser;

    revokeUserSessions(user);

    expect(user.tokenVersion).toBe(5);
    expect(user.refreshToken).toBeUndefined();
  });
});
