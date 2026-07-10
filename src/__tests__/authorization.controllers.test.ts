import { Types } from 'mongoose';
import { ApiKey } from '../models/ApiKey';
import { Tenant } from '../models/Tenant';
import { SpecialOffer } from '../models/SpecialOffer';
import { Attraction } from '../models/Attraction';
import { Review } from '../models/Review';
import { createApiKey, revokeApiKey } from '../controllers/apiKeys.controller';
import { createOffer, deleteOffer } from '../controllers/specialOffers.controller';
import { getReviewById } from '../controllers/reviews.controller';
import { AuthRequest } from '../types';

jest.mock('../models/ApiKey', () => ({
  ApiKey: { create: jest.fn(), findById: jest.fn() },
}));
jest.mock('../models/Tenant', () => ({ Tenant: { findById: jest.fn() } }));
jest.mock('../models/SpecialOffer', () => ({
  SpecialOffer: {
    create: jest.fn(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn(),
  },
}));
jest.mock('../models/Attraction', () => ({ Attraction: { exists: jest.fn() } }));
jest.mock('../models/Review', () => ({ Review: { findOne: jest.fn() } }));
jest.mock('../services/notification.service', () => ({
  createAdminNotifications: jest.fn().mockResolvedValue(undefined),
}));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const authRequest = (overrides: Record<string, unknown> = {}): AuthRequest =>
  ({
    body: {},
    params: {},
    query: {},
    headers: {},
    user: {
      role: 'manager',
      assignedTenants: [],
    },
    ...overrides,
  } as unknown as AuthRequest);

describe('authorization controller defenses', () => {
  beforeEach(() => jest.clearAllMocks());

  test.each([createApiKey, revokeApiKey])(
    'API key mutation rejects viewer/editor callers even if invoked directly',
    async (controller) => {
      const req = authRequest({
        params: { id: new Types.ObjectId().toString() },
        body: { label: 'blocked' },
        user: { role: 'viewer', assignedTenants: [] },
      });
      const res = response();

      await controller(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(ApiKey.create).not.toHaveBeenCalled();
      expect(ApiKey.findById).not.toHaveBeenCalled();
    }
  );

  it('rejects API key creation for an explicitly unassigned tenant', async () => {
    const assignedTenantId = new Types.ObjectId();
    const otherTenantId = new Types.ObjectId();
    const req = authRequest({
      body: { label: 'cross-tenant', tenantId: otherTenantId.toString() },
      user: { role: 'manager', assignedTenants: [assignedTenantId] },
    });
    const res = response();

    await createApiKey(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(Tenant.findById).not.toHaveBeenCalled();
    expect(ApiKey.create).not.toHaveBeenCalled();
  });

  it('does not delete a special offer belonging to another tenant', async () => {
    const assignedTenantId = new Types.ObjectId();
    const attractionId = new Types.ObjectId();
    const select = jest.fn().mockResolvedValue({ attractionId });
    (SpecialOffer.findById as jest.Mock).mockReturnValue({ select });
    (Attraction.exists as jest.Mock).mockResolvedValue(null);
    const req = authRequest({
      params: { id: new Types.ObjectId().toString() },
      user: { role: 'manager', assignedTenants: [assignedTenantId] },
    });
    const res = response();

    await deleteOffer(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(SpecialOffer.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('rejects direct viewer special-offer mutation', async () => {
    const req = authRequest({ user: { role: 'viewer', assignedTenants: [] } });
    const res = response();

    await createOffer(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(SpecialOffer.create).not.toHaveBeenCalled();
  });

  it('queries public review details as approved-only with a safe field allowlist', async () => {
    const reviewId = new Types.ObjectId().toString();
    const populate = jest.fn().mockResolvedValue(null);
    const select = jest.fn().mockReturnValue({ populate });
    (Review.findOne as jest.Mock).mockReturnValue({ select });
    const req = authRequest({ params: { reviewId }, user: undefined });
    const res = response();

    await getReviewById(req, res, jest.fn());

    expect(Review.findOne).toHaveBeenCalledWith({ _id: reviewId, status: 'approved' });
    const selectedFields = select.mock.calls[0][0] as string;
    expect(selectedFields).not.toContain('userId');
    expect(selectedFields.split(' ')).not.toContain('status');
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
