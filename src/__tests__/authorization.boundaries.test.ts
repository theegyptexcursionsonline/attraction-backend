import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';

import apiKeysRouter from '../routes/apiKeys.routes';
import reviewsRouter from '../routes/reviews.routes';
import specialOffersRouter from '../routes/specialOffers.routes';
import { optionalTenant, resolveTenant } from '../middleware/tenant.middleware';
import { ApiKey } from '../models/ApiKey';
import { Attraction } from '../models/Attraction';
import { Review } from '../models/Review';
import { SpecialOffer } from '../models/SpecialOffer';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { verifyToken } from '../utils/jwt';
import { AuthRequest } from '../types';

jest.mock('../utils/jwt', () => ({ verifyToken: jest.fn() }));
jest.mock('../models/User', () => ({ User: { findById: jest.fn() } }));
jest.mock('../models/Tenant', () => ({
  Tenant: { findOne: jest.fn(), findById: jest.fn() },
}));
jest.mock('../models/ApiKey', () => ({
  ApiKey: { create: jest.fn(), find: jest.fn(), findById: jest.fn() },
}));
jest.mock('../models/Attraction', () => ({
  Attraction: { exists: jest.fn(), find: jest.fn() },
}));
jest.mock('../models/SpecialOffer', () => ({
  SpecialOffer: {
    create: jest.fn(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));
jest.mock('../models/Review', () => ({
  Review: {
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));
jest.mock('../services/notification.service', () => ({
  createAdminNotifications: jest.fn().mockResolvedValue(undefined),
}));

const TENANT_A = new Types.ObjectId().toHexString();
const TENANT_B = new Types.ObjectId().toHexString();
const API_KEY_ID = new Types.ObjectId().toHexString();
const OFFER_ID = new Types.ObjectId().toHexString();
const ATTRACTION_ID = new Types.ObjectId().toHexString();
const REVIEW_ID = new Types.ObjectId().toHexString();

type TestRole = 'super-admin' | 'brand-admin' | 'manager' | 'editor' | 'viewer';

let currentUser: {
  _id: Types.ObjectId;
  role: TestRole;
  status: 'active';
  assignedTenants: Types.ObjectId[];
  firstName: string;
  lastName: string;
};

const setUser = (role: TestRole, tenantIds = [TENANT_A]) => {
  currentUser = {
    _id: new Types.ObjectId(),
    role,
    status: 'active',
    assignedTenants: tenantIds.map((id) => new Types.ObjectId(id)),
    firstName: 'RDMI',
    lastName: 'Team',
  };
};

const buildProtectedApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api-keys', apiKeysRouter);
  app.use('/offers', specialOffersRouter);
  app.use('/reviews', reviewsRouter);
  return app;
};

const auth = (req: request.Test) => req.set('Authorization', 'Bearer test-token');

describe('authorization boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setUser('manager');
    (verifyToken as jest.Mock).mockReturnValue({ userId: currentUser._id.toString() });
    (User.findById as jest.Mock).mockImplementation(async () => currentUser);
  });

  describe('tenant resolution', () => {
    const buildTenantApp = (middleware: typeof resolveTenant | typeof optionalTenant) => {
      const app = express();
      app.use((req, _res, next) => {
        (req as AuthRequest).user = currentUser as never;
        next();
      });
      app.get('/tenant', middleware, (req, res) => {
        res.json({ tenantId: String((req as AuthRequest).tenant?._id) });
      });
      return app;
    };

    it.each([
      ['required resolution', resolveTenant],
      ['optional resolution', optionalTenant],
    ])('rejects an explicit unassigned tenant with 403 during %s', async (_label, middleware) => {
      (Tenant.findOne as jest.Mock).mockResolvedValue({ _id: new Types.ObjectId(TENANT_B) });

      const response = await request(buildTenantApp(middleware))
        .get('/tenant')
        .set('Host', 'localhost')
        .set('x-tenant-id', TENANT_B);

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/access denied/i);
    });

    it('allows an assigned tenant to be resolved', async () => {
      (Tenant.findOne as jest.Mock).mockResolvedValue({ _id: new Types.ObjectId(TENANT_A) });

      const response = await request(buildTenantApp(optionalTenant))
        .get('/tenant')
        .set('Host', 'localhost')
        .set('x-tenant-id', TENANT_A);

      expect(response.status).toBe(200);
      expect(response.body.tenantId).toBe(TENANT_A);
    });
  });

  describe('API key mutations', () => {
    it.each(['viewer', 'editor'] as const)('forbids %s API-key creation', async (role) => {
      setUser(role);

      const response = await auth(request(buildProtectedApp()).post('/api-keys')).send({
        label: 'Partner integration',
        tenantId: TENANT_A,
      });

      expect(response.status).toBe(403);
      expect(ApiKey.create).not.toHaveBeenCalled();
    });

    it.each(['viewer', 'editor'] as const)('forbids %s API-key revocation', async (role) => {
      setUser(role);

      const response = await auth(
        request(buildProtectedApp()).delete(`/api-keys/${API_KEY_ID}`)
      );

      expect(response.status).toBe(403);
      expect(ApiKey.findById).not.toHaveBeenCalled();
    });

    it('rejects a manager requesting an unassigned tenant instead of falling back', async () => {
      (Tenant.findOne as jest.Mock).mockResolvedValue({ _id: new Types.ObjectId(TENANT_B) });

      const response = await auth(request(buildProtectedApp()).post('/api-keys'))
        .set('x-tenant-id', TENANT_B)
        .send({ label: 'Partner integration' });

      expect(response.status).toBe(403);
      expect(ApiKey.create).not.toHaveBeenCalled();
    });

    it('does not let a manager revoke another tenant\'s API key', async () => {
      const save = jest.fn();
      (ApiKey.findById as jest.Mock).mockResolvedValue({
        _id: API_KEY_ID,
        tenantId: new Types.ObjectId(TENANT_B),
        revoked: false,
        save,
      });

      const response = await auth(
        request(buildProtectedApp()).delete(`/api-keys/${API_KEY_ID}`)
      );

      expect(response.status).toBe(404);
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('special-offer mutations', () => {
    it.each(['viewer', 'editor'] as const)('forbids all %s offer mutations', async (role) => {
      setUser(role);

      const [createResponse, updateResponse, deleteResponse] = await Promise.all([
        auth(request(buildProtectedApp()).post('/offers')).send({ attractionId: ATTRACTION_ID }),
        auth(request(buildProtectedApp()).patch(`/offers/${OFFER_ID}`)).send({ title: 'Changed' }),
        auth(request(buildProtectedApp()).delete(`/offers/${OFFER_ID}`)),
      ]);

      expect(createResponse.status).toBe(403);
      expect(updateResponse.status).toBe(403);
      expect(deleteResponse.status).toBe(403);
      expect(SpecialOffer.create).not.toHaveBeenCalled();
      expect(SpecialOffer.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(SpecialOffer.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('denies cross-tenant offer deletion before deleting the document', async () => {
      (SpecialOffer.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({ attractionId: new Types.ObjectId(ATTRACTION_ID) }),
      });
      (Attraction.exists as jest.Mock).mockResolvedValue(null);

      const response = await auth(
        request(buildProtectedApp()).delete(`/offers/${OFFER_ID}`)
      );

      expect(response.status).toBe(404);
      expect(SpecialOffer.findByIdAndDelete).not.toHaveBeenCalled();
    });
  });

  describe('review detail privacy', () => {
    it('does not expose a pending review through the public ID route', async () => {
      const populate = jest.fn().mockResolvedValue(null);
      const select = jest.fn().mockReturnValue({ populate });
      (Review.findOne as jest.Mock).mockReturnValue({ select });

      const response = await request(buildProtectedApp()).get(`/reviews/${REVIEW_ID}`);

      expect(response.status).toBe(404);
      expect(Review.findOne).toHaveBeenCalledWith({ _id: REVIEW_ID, status: 'approved' });
    });

    it('selects only privacy-safe fields for an approved public review', async () => {
      const publicReview = {
        _id: REVIEW_ID,
        attractionId: { _id: ATTRACTION_ID, title: 'Sea Trip', slug: 'sea-trip' },
        author: 'RDMI Team',
        rating: 5,
        title: 'Excellent day',
        content: 'A polished public review.',
        country: 'GB',
      };
      const populate = jest.fn().mockResolvedValue(publicReview);
      const select = jest.fn().mockReturnValue({ populate });
      (Review.findOne as jest.Mock).mockReturnValue({ select });

      const response = await request(buildProtectedApp()).get(`/reviews/${REVIEW_ID}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(publicReview);
      const selectedFields = select.mock.calls[0][0] as string;
      expect(selectedFields).not.toContain('userId');
      expect(selectedFields).not.toContain('status');
    });

    it('keeps moderation available through the authenticated admin route', async () => {
      (Review.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({ attractionId: new Types.ObjectId(ATTRACTION_ID) }),
      });
      (Attraction.exists as jest.Mock).mockResolvedValue({ _id: ATTRACTION_ID });
      (Review.findByIdAndUpdate as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue({ _id: REVIEW_ID, status: 'approved' }),
      });

      const response = await auth(
        request(buildProtectedApp()).patch(`/reviews/${REVIEW_ID}/status`)
      ).send({ status: 'approved' });

      expect(response.status).toBe(200);
      expect(Review.findByIdAndUpdate).toHaveBeenCalledWith(
        REVIEW_ID,
        { status: 'approved' },
        { new: true }
      );
    });
  });
});
