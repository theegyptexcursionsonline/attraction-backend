import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { setUserPassword } from '../controllers/users.controller';
import { User } from '../models/User';
import { AuthRequest } from '../types';

jest.mock('../models/User', () => ({ User: { findById: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: { findById: jest.fn() } }));
jest.mock('../models/Booking', () => ({ Booking: { collection: { name: 'bookings' } } }));
jest.mock('../models/Attraction', () => ({ Attraction: {} }));
jest.mock('../services/email.service', () => ({ sendUserInvitation: jest.fn(), invitationLink: jest.fn() }));

let caller: Record<string, unknown> | null = null;
jest.mock('../middleware/auth.middleware', () => {
  const actual = jest.requireActual('../middleware/auth.middleware');
  return {
    ...actual,
    authenticate: (req: any, res: any, next: any) => {
      if (!caller) { res.status(401).json({ success: false, error: 'Authentication required' }); return; }
      req.user = caller; next();
    },
  };
});

let target: any;
const loadTarget = (overrides: Record<string, unknown> = {}) => {
  target = { _id: new Types.ObjectId(), role: 'brand-admin', status: 'pending', tokenVersion: 3, refreshToken: 'rt', password: 'old', passwordResetToken: 'invite-hash', passwordResetExpires: new Date(Date.now() + 1e6), save: jest.fn().mockResolvedValue(undefined), ...overrides };
  (User.findById as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue(target) });
};
const superAdmin = () => ({ _id: new Types.ObjectId(), role: 'super-admin', assignedTenants: [] });
const GOOD = 'Harbour-Light-2026';

const app = () => {
  const a = express();
  a.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  a.use('/api/users', require('../routes/users.routes').default);
  return a;
};

describe('super admin sets a team member password', () => {
  beforeEach(() => { jest.clearAllMocks(); caller = superAdmin(); loadTarget(); });

  it('sets the password, activates a pending member, voids invitation links and signs out sessions', async () => {
    const res = await request(app()).post(`/api/users/${target._id}/password`).send({ password: GOOD });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: String(target._id), status: 'active', activated: true });
    expect(target.password).toBe(GOOD);
    expect(target.status).toBe('active');
    expect(target.passwordResetToken).toBeUndefined();
    expect(target.passwordResetExpires).toBeUndefined();
    expect(target.refreshToken).toBeUndefined();
    expect(target.tokenVersion).toBe(4);
    expect(target.save).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(res.body)).not.toContain(GOOD);
  });

  it('keeps an active member active', async () => {
    loadTarget({ status: 'active', role: 'editor' });
    const res = await request(app()).post(`/api/users/${target._id}/password`).send({ password: GOOD });
    expect(res.status).toBe(200);
    expect(res.body.data.activated).toBe(false);
  });

  it.each([
    ['too short', 'Short1abc'],
    ['no number', 'OnlyLettersHereOk'],
    ['no letter', '123456789012345'],
    ['too long', `a1${'x'.repeat(130)}`],
  ])('rejects a weak password (%s) before touching the user', async (_label, password) => {
    const res = await request(app()).post(`/api/users/${target._id}/password`).send({ password });
    expect(res.status).toBe(400);
    expect(User.findById).not.toHaveBeenCalled();
  });

  it('requires sign-in and a super admin', async () => {
    caller = null;
    expect((await request(app()).post(`/api/users/${target._id}/password`).send({ password: GOOD })).status).toBe(401);
    for (const role of ['brand-admin', 'manager', 'customer']) {
      caller = { _id: new Types.ObjectId(), role, assignedTenants: [] };
      expect((await request(app()).post(`/api/users/${target._id}/password`).send({ password: GOOD })).status).toBe(403);
    }
    expect(target.save).not.toHaveBeenCalled();
  });

  it('refuses super admins, travellers, suspended members, missing users and the caller', async () => {
    for (const [overrides, status] of [[{ role: 'super-admin' }, 403], [{ role: 'customer' }, 403], [{ status: 'suspended' }, 409], [{ status: 'inactive' }, 409]] as const) {
      loadTarget(overrides);
      expect((await request(app()).post(`/api/users/${target._id}/password`).send({ password: GOOD })).status).toBe(status);
      expect(target.save).not.toHaveBeenCalled();
    }
    (User.findById as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    expect((await request(app()).post(`/api/users/${new Types.ObjectId()}/password`).send({ password: GOOD })).status).toBe(404);
    const self = superAdmin();
    caller = self;
    expect((await request(app()).post(`/api/users/${self._id}/password`).send({ password: GOOD })).status).toBe(400);
  });

  it('controller refuses a non super admin even if routing changes', async () => {
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), setHeader: jest.fn() };
    await setUserPassword({ params: { id: String(target._id) }, body: { password: GOOD }, user: { _id: new Types.ObjectId(), role: 'brand-admin' } } as unknown as AuthRequest, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(target.save).not.toHaveBeenCalled();
  });
});
