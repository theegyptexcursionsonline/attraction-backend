import { acceptInvitation } from '../controllers/auth.controller';
import { User } from '../models/User';
import { AuthRequest } from '../types';

jest.mock('../models/User', () => ({
  User: {
    findOne: jest.fn(),
  },
}));
jest.mock('../models/Tenant', () => ({ Tenant: {} }));
jest.mock('../services/email.service', () => ({
  sendPasswordResetEmail: jest.fn(),
}));
jest.mock('../services/notification.service', () => ({
  createAdminNotifications: jest.fn().mockResolvedValue(undefined),
}));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const request = (token = 'invitation-token'): AuthRequest =>
  ({
    body: { token, password: 'Accepted-Password-123!' },
  } as AuthRequest);

describe('team invitation acceptance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('activates a pending account and consumes the invitation token', async () => {
    const invitedUser = {
      status: 'pending',
      password: 'temporary-password',
      passwordResetToken: 'hashed-token',
      passwordResetExpires: new Date(Date.now() + 60_000),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const select = jest.fn().mockResolvedValue(invitedUser);
    (User.findOne as jest.Mock).mockReturnValue({ select });
    const res = response();

    await acceptInvitation(request(), res, jest.fn());

    expect(invitedUser.status).toBe('active');
    expect(invitedUser.password).toBe('Accepted-Password-123!');
    expect(invitedUser.passwordResetToken).toBeUndefined();
    expect(invitedUser.passwordResetExpires).toBeUndefined();
    expect(invitedUser.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects unknown, expired, or already consumed invitation tokens', async () => {
    const select = jest.fn().mockResolvedValue(null);
    (User.findOne as jest.Mock).mockReturnValue({ select });
    const res = response();

    await acceptInvitation(request('expired-or-replayed-token'), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Invalid or expired invitation token',
      })
    );
  });

  it('does not let an active account use a password-reset token as an invitation', async () => {
    const activeUser = {
      status: 'active',
      save: jest.fn(),
    };
    const select = jest.fn().mockResolvedValue(activeUser);
    (User.findOne as jest.Mock).mockReturnValue({ select });
    const res = response();

    await acceptInvitation(request('active-account-reset-token'), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(activeUser.save).not.toHaveBeenCalled();
  });
});
