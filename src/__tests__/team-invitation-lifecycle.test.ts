import bcrypt from 'bcryptjs';
import { acceptInvitation } from '../controllers/auth.controller';
import { User } from '../models/User';
import { hashToken } from '../utils/hash';
import { AuthRequest } from '../types';

jest.mock('../models/User', () => ({ User: { findOne: jest.fn(), findOneAndUpdate: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: {} }));
jest.mock('../services/email.service', () => ({ sendPasswordResetEmail: jest.fn(), sendPasswordChangedEmail: jest.fn().mockResolvedValue({ status: 'sent' }) }));
jest.mock('../services/notification.service', () => ({ createAdminNotifications: jest.fn().mockResolvedValue(undefined) }));
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const request = (token = 'invitation-token') => ({ body: { token, password: 'Accepted-Password-123!' } } as AuthRequest);
const preflight = (value: unknown) => (User.findOne as jest.Mock).mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }) });

describe('team invitation acceptance', () => {
  beforeEach(() => jest.clearAllMocks());
  it('atomically activates the same pending identity and consumes its invitation', async () => {
    const invited = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', email: 'qa-invited@example.invalid', role: 'brand-admin', status: 'pending', assignedTenants: ['bbbbbbbbbbbbbbbbbbbbbbbb'] };
    preflight(invited);
    (User.findOneAndUpdate as jest.Mock).mockResolvedValue({ ...invited, status: 'active', assignedTenants: [] });
    const res = response(), next = jest.fn(); await acceptInvitation(request(), res as never, next);
    expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(200);
    const [filter, update, options] = (User.findOneAndUpdate as jest.Mock).mock.calls[0];
    expect(filter).toMatchObject({ ...invited, passwordResetToken: hashToken('invitation-token'), passwordResetExpires: { $gt: expect.any(Date) } });
    expect(update).toMatchObject({ $set: { status: 'active' }, $inc: { tokenVersion: 1 }, $unset: { passwordResetToken: 1, passwordResetExpires: 1, refreshToken: 1 } });
    expect(await bcrypt.compare('Accepted-Password-123!', update.$set.password)).toBe(true);
    expect(options).toEqual({ new: true, runValidators: true });
  });
  it('rejects unknown, expired or consumed tokens before any password write', async () => {
    preflight(null); const res = response(); await acceptInvitation(request('expired-or-replayed-token'), res as never, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400); expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Invalid or expired invitation token' }));
  });
  it('does not use an active account reset token as an invitation', async () => {
    preflight({ status: 'active' }); const res = response(); await acceptInvitation(request('active-account-reset-token'), res as never, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400); expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('refuses a capability lost between preflight and the atomic write', async () => {
    preflight({ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', email: 'qa-invited@example.invalid', role: 'brand-admin', status: 'pending', assignedTenants: [] });
    (User.findOneAndUpdate as jest.Mock).mockResolvedValue(null); const res = response(); await acceptInvitation(request(), res as never, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
