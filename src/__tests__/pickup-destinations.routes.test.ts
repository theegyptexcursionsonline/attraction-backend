import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';

// The real routers, query/body validators, auth and tenant middleware run here, so a
// validator that strips pickupFrom or pickupDestinationSlugs fails these tests.
const royalCruiseId = new Types.ObjectId();
const otherSiteId = new Types.ObjectId();
let mockUser: Record<string, unknown> | null = null;

jest.mock('../utils/jwt', () => ({ verifyToken: jest.fn(() => ({ userId: 'user-1' })) }));
jest.mock('../models/User', () => ({ User: { findById: jest.fn(() => Promise.resolve(mockUser)) } }));
jest.mock('../models/Tenant', () => ({ Tenant: { findOne: jest.fn(), findByIdAndUpdate: jest.fn() } }));
jest.mock('../models/Attraction', () => ({ Attraction: { find: jest.fn(), countDocuments: jest.fn() } }));
jest.mock('../models/Category', () => ({ Category: { findOne: jest.fn().mockResolvedValue(null) } }));

import attractionsRouter from '../routes/attractions.routes';
import tenantRoutes from '../routes/tenants.routes';

const app = express();
app.use(express.json());
app.use('/attractions', attractionsRouter);
app.use('/tenants', tenantRoutes);

const royalCruise = { _id: royalCruiseId, slug: 'royal-cruise-hurghada', status: 'active', pickupDestinationSlugs: ['makadi-bay', 'sahl-hasheesh'] };

const listChain = () => {
  const chain: Record<string, jest.Mock> = {};
  for (const step of ['select', 'populate', 'sort', 'skip', 'limit']) chain[step] = jest.fn().mockReturnValue(chain);
  chain.lean = jest.fn().mockResolvedValue([]);
  return chain;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  (Tenant.findOne as jest.Mock).mockResolvedValue(royalCruise);
  (Attraction.find as jest.Mock).mockReturnValue(listChain());
  (Attraction.countDocuments as jest.Mock).mockResolvedValue(0);
});

describe('GET /attractions?pickupFrom', () => {
  it('reaches the controller and lists the site hotel-pickup tours', async () => {
    const response = await request(app).get('/attractions?pickupFrom=Makadi-Bay&limit=3').set('x-tenant-id', 'royal-cruise-hurghada');

    expect(response.status).toBe(200);
    expect(Attraction.find).toHaveBeenCalledWith(expect.objectContaining({
      status: 'active',
      tenantIds: { $in: [royalCruiseId] },
      hasHotelPickup: true,
    }));
  });

  it('returns an empty page for an area the site does not serve', async () => {
    const response = await request(app).get('/attractions?pickupFrom=soma-bay').set('x-tenant-id', 'royal-cruise-hurghada');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(Attraction.find).not.toHaveBeenCalled();
  });

  it('rejects a malformed pickup area', async () => {
    const response = await request(app).get('/attractions?pickupFrom=%24ne').set('x-tenant-id', 'royal-cruise-hurghada');

    expect(response.status).toBe(400);
    expect(Attraction.find).not.toHaveBeenCalled();
  });
});

describe('saving pickup areas through the tenant routes', () => {
  beforeEach(() => {
    (Tenant.findByIdAndUpdate as jest.Mock).mockImplementation((id, update) => Promise.resolve({ _id: id, ...update.$set }));
  });

  it('lets an assigned site admin save them from site settings', async () => {
    mockUser = { _id: 'user-1', role: 'brand-admin', status: 'active', tokenVersion: 0, assignedTenants: [royalCruiseId] };

    const response = await request(app)
      .patch(`/tenants/${royalCruiseId}/settings`)
      .set('Authorization', 'Bearer token')
      .send({ pickupDestinationSlugs: ['makadi-bay', 'sahl-hasheesh'] });

    expect(response.status).toBe(200);
    expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(
      String(royalCruiseId),
      { $set: { pickupDestinationSlugs: ['makadi-bay', 'sahl-hasheesh'] } },
      { new: true, runValidators: true }
    );
  });

  it('refuses a site admin of another site', async () => {
    mockUser = { _id: 'user-1', role: 'brand-admin', status: 'active', tokenVersion: 0, assignedTenants: [otherSiteId] };

    const response = await request(app)
      .patch(`/tenants/${royalCruiseId}/settings`)
      .set('Authorization', 'Bearer token')
      .send({ pickupDestinationSlugs: ['makadi-bay'] });

    expect(response.status).toBe(403);
    expect(Tenant.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('keeps them on the super-admin site update', async () => {
    mockUser = { _id: 'user-1', role: 'super-admin', status: 'active', tokenVersion: 0, assignedTenants: [] };

    const response = await request(app)
      .patch(`/tenants/${royalCruiseId}`)
      .set('Authorization', 'Bearer token')
      .send({ pickupDestinationSlugs: [' Makadi-Bay ', 'soma-bay'] });

    expect(response.status).toBe(200);
    expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(
      String(royalCruiseId),
      { $set: { pickupDestinationSlugs: ['makadi-bay', 'soma-bay'] } },
      { new: true, runValidators: true }
    );
  });

  it('rejects an invalid list on either route', async () => {
    mockUser = { _id: 'user-1', role: 'super-admin', status: 'active', tokenVersion: 0, assignedTenants: [] };

    for (const path of [`/tenants/${royalCruiseId}`, `/tenants/${royalCruiseId}/settings`]) {
      const response = await request(app)
        .patch(path)
        .set('Authorization', 'Bearer token')
        .send({ pickupDestinationSlugs: ['makadi bay'] });
      expect(response.status).toBe(400);
    }
    expect(Tenant.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
