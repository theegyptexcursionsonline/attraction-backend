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
jest.mock('../models/Tenant', () => ({ Tenant: { findOne: jest.fn(), findById: jest.fn(), findByIdAndUpdate: jest.fn() } }));
jest.mock('../models/Attraction', () => ({ Attraction: { find: jest.fn(), countDocuments: jest.fn(), distinct: jest.fn(), aggregate: jest.fn() } }));
jest.mock('../models/Destination', () => ({ Destination: { find: jest.fn(), countDocuments: jest.fn(), distinct: jest.fn() } }));
jest.mock('../models/Category', () => ({ Category: { findOne: jest.fn().mockResolvedValue(null) } }));

import { Destination } from '../models/Destination';
import attractionsRouter from '../routes/attractions.routes';
import destinationsRouter from '../routes/destinations.routes';
import tenantRoutes from '../routes/tenants.routes';

const app = express();
app.use(express.json());
app.use('/attractions', attractionsRouter);
app.use('/tenants', tenantRoutes);
app.use('/destinations', destinationsRouter);

const royalCruise = { _id: royalCruiseId, slug: 'royal-cruise-hurghada', status: 'active', designMode: 'nautical', pickupDestinationSlugs: ['makadi-bay', 'sahl-hasheesh'] };
const superAdmin = { _id: 'user-1', role: 'super-admin', status: 'active', tokenVersion: 0, assignedTenants: [] };

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
  (Tenant.findById as jest.Mock).mockReturnValue({ select: () => ({ lean: jest.fn().mockResolvedValue({ _id: royalCruiseId }) }) });
  (Destination.distinct as jest.Mock).mockImplementation((_field, filter) => Promise.resolve(filter.slug.$in));
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

  it('saves the site name for a super-admin through site settings, with the rest of the page', async () => {
    mockUser = superAdmin;

    const response = await request(app)
      .patch(`/tenants/${royalCruiseId}/settings`)
      .set('Authorization', 'Bearer token')
      .send({
        name: ' Royal Cruise Hurghada ',
        logo: '/logos/royal-cruise.png',
        contactInfo: { email: 'bookings@example.org', phone: '+20 100 000 0000' },
        timezone: 'Africa/Cairo',
        stats: { totalBookings: 3 },
        paymentSettings: { stripeSecretKey: 'must-not-pass' },
      });

    expect(response.status).toBe(200);
    expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(
      String(royalCruiseId),
      { $set: { contactInfo: { email: 'bookings@example.org', phone: '+20 100 000 0000' }, logo: '/logos/royal-cruise.png', timezone: 'Africa/Cairo', name: 'Royal Cruise Hurghada' } },
      { new: true, runValidators: true }
    );
  });

  it('never lets a site admin rename the site', async () => {
    mockUser = { _id: 'user-1', role: 'brand-admin', status: 'active', tokenVersion: 0, assignedTenants: [royalCruiseId] };

    const response = await request(app)
      .patch(`/tenants/${royalCruiseId}/settings`)
      .set('Authorization', 'Bearer token')
      .send({ name: 'Renamed', tagline: 'Sail the Red Sea' });

    expect(response.status).toBe(200);
    expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(String(royalCruiseId), { $set: { tagline: 'Sail the Red Sea' } }, { new: true, runValidators: true });
  });

  it('refuses a blank site name', async () => {
    mockUser = superAdmin;

    const response = await request(app).patch(`/tenants/${royalCruiseId}/settings`).set('Authorization', 'Bearer token').send({ name: '   ' });

    expect(response.status).toBe(400);
    expect(Tenant.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses a newly added area that is not an active destination', async () => {
    mockUser = superAdmin;
    (Destination.distinct as jest.Mock).mockResolvedValue([]);

    const response = await request(app).patch(`/tenants/${royalCruiseId}/settings`).set('Authorization', 'Bearer token').send({ pickupDestinationSlugs: ['atlantis'] });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('atlantis');
    expect(Tenant.findByIdAndUpdate).not.toHaveBeenCalled();
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

describe('GET /destinations network-wide list', () => {
  const rows = [{ name: 'Hurghada', slug: 'hurghada' }];
  beforeEach(() => {
    (Attraction.distinct as jest.Mock).mockResolvedValue(['Hurghada', 'Makadi Bay']);
    (Attraction.aggregate as jest.Mock).mockResolvedValue([{ _id: 'Hurghada', count: 12 }]);
    const chain = listChain();
    chain.lean.mockResolvedValue(rows);
    (Destination.find as jest.Mock).mockReturnValue(chain);
    (Destination.countDocuments as jest.Mock).mockResolvedValue(1);
  });

  it('shows a visitor only destinations with active tours', async () => {
    const response = await request(app).get('/destinations?limit=50');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ name: 'Hurghada', slug: 'hurghada', attractionCount: 12 }]);
    expect(Attraction.distinct).toHaveBeenCalledWith('destination.city', { status: 'active' });
    expect(Destination.find).toHaveBeenCalledWith({ isActive: true, name: { $in: ['Hurghada', 'Makadi Bay'] } });
    expect(Destination.countDocuments).toHaveBeenCalledWith({ isActive: true, name: { $in: ['Hurghada', 'Makadi Bay'] } });
  });

  it('treats a signed-in customer as a visitor', async () => {
    mockUser = { _id: 'user-1', role: 'customer', status: 'active', tokenVersion: 0 };

    await request(app).get('/destinations?limit=50').set('Authorization', 'Bearer token');

    expect(Destination.find).toHaveBeenCalledWith({ isActive: true, name: { $in: ['Hurghada', 'Makadi Bay'] } });
  });

  it('keeps every active destination for a super-admin managing destinations', async () => {
    mockUser = superAdmin;

    const response = await request(app).get('/destinations?scope=admin').set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(Destination.find).toHaveBeenCalledWith({ isActive: true });
    expect(Attraction.distinct).not.toHaveBeenCalled();
  });

  it('refuses an admin-scoped read without a staff session instead of answering the public list', async () => {
    const response = await request(app).get('/destinations?scope=admin');

    expect(response.status).toBe(401);
    expect(Destination.find).not.toHaveBeenCalled();
  });

  it('keeps editor options complete', async () => {
    mockUser = superAdmin;

    await request(app).get('/destinations?forEditor=true').set('Authorization', 'Bearer token');

    expect(Destination.find).toHaveBeenCalledWith({ isActive: true });
  });

  it('filters the public featured list the same way, but not the staff one', async () => {
    const chain = listChain();
    (Destination.find as jest.Mock).mockReturnValue(chain);

    await request(app).get('/destinations/featured?limit=6');
    expect(Destination.find).toHaveBeenLastCalledWith({ isActive: true, name: { $in: ['Hurghada', 'Makadi Bay'] } });

    mockUser = superAdmin;
    await request(app).get('/destinations/featured?limit=6').set('Authorization', 'Bearer token');
    expect(Destination.find).toHaveBeenLastCalledWith({ isActive: true });
  });
});
