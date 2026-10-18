import { Types } from 'mongoose';
import { createInvitationLink } from '../controllers/users.controller';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import { hashToken } from '../utils/hash';
import { sendUserInvitation } from '../services/email.service';
import { AuthRequest } from '../types';

jest.mock('../models/User', () => ({ User: { findById: jest.fn(), updateOne: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: { findById: jest.fn() } }));
jest.mock('../models/Booking', () => ({ Booking: { collection: { name: 'bookings' } } }));
jest.mock('../models/Attraction', () => ({ Attraction: {} }));
jest.mock('../services/email.service', () => ({
  sendUserInvitation: jest.fn(),
  invitationLink: (token: string, tenant: { slug?: string } | null) => `https://shared.example/accept-invitation?token=${token}${tenant?.slug ? `&tenant=${tenant.slug}` : ''}`,
}));

const royal = new Types.ObjectId();
const other = new Types.ObjectId();

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
};

let target: any;
const loadTarget = (overrides: Record<string, unknown> = {}) => {
  target = { _id: new Types.ObjectId(), email: 'qa-invite@example.invalid', role: 'brand-admin', status: 'pending', assignedTenants: [royal], tokenVersion: 2, passwordResetToken: 'old-hash', passwordResetExpires: new Date(0), ...overrides };
  (User.findById as jest.Mock).mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ ...target }) }) });
  (User.updateOne as jest.Mock).mockImplementation(async (_filter, update) => { Object.assign(target, update.$set); return { matchedCount: 1 }; });
};
const siteLookup = (slug = 'royal-cruise-hurghada') => (Tenant.findById as jest.Mock).mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ slug }) }) });

const call = async (user: Record<string, unknown>) => {
  const res = response();
  const next = jest.fn();
  await createInvitationLink({ params: { id: String(target._id) }, user: { _id: new Types.ObjectId(), ...user } } as unknown as AuthRequest, res, next);
  return { res, next, body: res.json.mock.calls[0]?.[0] };
};

describe('invitation link for a pending user', () => {
  beforeEach(() => { jest.clearAllMocks(); siteLookup(); });

  it('issues a fresh 7-day link, replaces the old token, sends no email and is not cacheable', async () => {
    loadTarget();
    const before = Date.now();
    const { res, body } = await call({ role: 'super-admin', assignedTenants: [] });
    expect(res.status).toHaveBeenCalledWith(200);
    const url = new URL(body.data.inviteUrl);
    const token = url.searchParams.get('token')!;
    expect(token).toMatch(/^[a-f0-9]{32,}$/);
    expect(url.searchParams.get('tenant')).toBe('royal-cruise-hurghada');
    expect(target.passwordResetToken).toBe(hashToken(token));
    expect(target.passwordResetToken).not.toBe('old-hash');
    const expires = new Date(body.data.expiresAt).getTime();
    expect(expires - before).toBeGreaterThanOrEqual(7 * 24 * 3600 * 1000 - 1000);
    expect(expires - before).toBeLessThanOrEqual(7 * 24 * 3600 * 1000 + 5000);
    expect(User.updateOne).toHaveBeenCalledTimes(1);
    expect(User.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: target._id, email: target.email, role: target.role, status: 'pending',
      assignedTenants: { $exists: true, $eq: [royal] }, tokenVersion: { $exists: true, $eq: 2 },
      passwordResetToken: { $exists: true, $eq: 'old-hash' }, passwordResetExpires: { $exists: true, $eq: new Date(0) },
    }), { $set: { passwordResetToken: hashToken(token), passwordResetExpires: new Date(body.data.expiresAt) } }, { runValidators: true });
    expect(sendUserInvitation).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(JSON.stringify(body)).not.toContain('old-hash');
  });

  it('each request invalidates the previous link', async () => {
    loadTarget();
    const first = (await call({ role: 'super-admin' })).body.data.inviteUrl;
    const second = (await call({ role: 'super-admin' })).body.data.inviteUrl;
    expect(first).not.toBe(second);
    expect(target.passwordResetToken).toBe(hashToken(new URL(second).searchParams.get('token')!));
  });

  it('refuses a user who already joined', async () => {
    loadTarget({ status: 'active' });
    const { res } = await call({ role: 'super-admin' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it('answers 404 for a missing user', async () => {
    loadTarget();
    (User.findById as jest.Mock).mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    const { res } = await call({ role: 'super-admin' });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('a site admin gets links only for lower roles on their own sites', async () => {
    loadTarget({ role: 'editor' });
    const own = await call({ role: 'brand-admin', assignedTenants: [royal] });
    expect(own.res.status).toHaveBeenCalledWith(200);

    (User.updateOne as jest.Mock).mockClear();
    loadTarget({ role: 'editor', assignedTenants: [other] });
    const foreign = await call({ role: 'brand-admin', assignedTenants: [royal] });
    expect(foreign.res.status).toHaveBeenCalledWith(404);
    expect(User.updateOne).not.toHaveBeenCalled();

    loadTarget({ role: 'brand-admin' });
    const peer = await call({ role: 'brand-admin', assignedTenants: [royal] });
    expect(peer.res.status).toHaveBeenCalledWith(403);
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it('brands the link for the site the admin shares with the invitee', async () => {
    loadTarget({ role: 'viewer', assignedTenants: [other, royal] });
    await call({ role: 'brand-admin', assignedTenants: [royal] });
    expect(Tenant.findById).toHaveBeenCalledWith(String(royal));
  });

  it('passes a database failure to the error handler without saving', async () => {
    loadTarget();
    (User.updateOne as jest.Mock).mockRejectedValue(new Error('db down'));
    const { next, res } = await call({ role: 'super-admin' });
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns conflict without a credential when the authorized account snapshot no longer matches', async () => {
    loadTarget(); (User.updateOne as jest.Mock).mockResolvedValue({ matchedCount: 0 });
    const { res, body } = await call({ role: 'super-admin' });
    expect(res.status).toHaveBeenCalledWith(409); expect(body.data?.inviteUrl).toBeUndefined();
    expect(sendUserInvitation).not.toHaveBeenCalled();
  });
});
