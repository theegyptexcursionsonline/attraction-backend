import express from 'express';
import request from 'supertest';
import { verifyToken } from '../utils/jwt';
import { User } from '../models/User';
import apiKeysRoutes from '../routes/apiKeys.routes';
import specialOffersRoutes from '../routes/specialOffers.routes';
import * as apiKeyControllers from '../controllers/apiKeys.controller';
import * as offerControllers from '../controllers/specialOffers.controller';

const ok = jest.fn((_req, res) => res.status(200).json({ success: true }));

jest.mock('../utils/jwt', () => ({ verifyToken: jest.fn() }));
jest.mock('../models/User', () => ({ User: { findById: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: { findOne: jest.fn() } }));
jest.mock('../controllers/apiKeys.controller', () => ({
  createApiKey: jest.fn((req, res) => ok(req, res)),
  listApiKeys: jest.fn((req, res) => ok(req, res)),
  revokeApiKey: jest.fn((req, res) => ok(req, res)),
}));
jest.mock('../controllers/specialOffers.controller', () => ({
  getActiveOffers: jest.fn((req, res) => ok(req, res)),
  getOfferForAttraction: jest.fn((req, res) => ok(req, res)),
  getAllOffers: jest.fn((req, res) => ok(req, res)),
  getOfferStats: jest.fn((req, res) => ok(req, res)),
  createOffer: jest.fn((req, res) => ok(req, res)),
  updateOffer: jest.fn((req, res) => ok(req, res)),
  deleteOffer: jest.fn((req, res) => ok(req, res)),
}));

const app = express();
app.use(express.json());
app.use('/api-keys', apiKeysRoutes);
app.use('/special-offers', specialOffersRoutes);

describe('authorization route guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (verifyToken as jest.Mock).mockReturnValue({ userId: 'user-1' });
  });

  test.each(['viewer', 'editor'])('%s cannot create or revoke API keys', async (role) => {
    (User.findById as jest.Mock).mockResolvedValue({
      role,
      status: 'active',
      assignedTenants: [],
    });

    const [createResponse, revokeResponse] = await Promise.all([
      request(app)
        .post('/api-keys')
        .set('Authorization', 'Bearer token')
        .send({ label: 'blocked' }),
      request(app)
        .delete('/api-keys/key-id')
        .set('Authorization', 'Bearer token'),
    ]);

    expect(createResponse.status).toBe(403);
    expect(revokeResponse.status).toBe(403);
    expect(apiKeyControllers.createApiKey).not.toHaveBeenCalled();
    expect(apiKeyControllers.revokeApiKey).not.toHaveBeenCalled();
  });

  test.each(['viewer', 'editor'])('%s cannot mutate special offers', async (role) => {
    (User.findById as jest.Mock).mockResolvedValue({
      role,
      status: 'active',
      assignedTenants: [],
    });

    const responses = await Promise.all([
      request(app).post('/special-offers').set('Authorization', 'Bearer token').send({}),
      request(app).patch('/special-offers/offer-id').set('Authorization', 'Bearer token').send({}),
      request(app).delete('/special-offers/offer-id').set('Authorization', 'Bearer token'),
    ]);

    expect(responses.map((res) => res.status)).toEqual([403, 403, 403]);
    expect(offerControllers.createOffer).not.toHaveBeenCalled();
    expect(offerControllers.updateOffer).not.toHaveBeenCalled();
    expect(offerControllers.deleteOffer).not.toHaveBeenCalled();
  });
});
