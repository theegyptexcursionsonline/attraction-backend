import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { Destination } from '../models/Destination';
import { Attraction } from '../models/Attraction';

// Authentication and tenant resolution are external boundaries; preserve the real
// router, query validator and controller so unknown-query stripping is exercised.
jest.mock('../middleware/auth.middleware', () => {
  const pass = (req: Request, _res: Response, next: NextFunction) => {
    const role = req.header('x-test-role');
    if (role) Object.assign(req, { user: { role, assignedTenants: ['site-a'] } });
    next();
  };
  return { optionalAuth: pass, authenticate: pass, requireSuperAdmin: pass };
});
jest.mock('../middleware/tenant.middleware', () => ({
  optionalTenant: (req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { tenant: { _id: 'site-a' } });
    next();
  },
}));
jest.mock('../models/Destination', () => ({ Destination: { find: jest.fn(), countDocuments: jest.fn() } }));
jest.mock('../models/Attraction', () => ({ Attraction: { distinct: jest.fn(), aggregate: jest.fn() } }));
import destinationsRoutes from '../routes/destinations.routes';

const app = express();
app.use('/destinations', destinationsRoutes);
const destinations = [{ name: 'Makadi Bay', slug: 'makadi-bay' }];
const skip = jest.fn();
const limit = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  limit.mockReturnValue({ lean: async () => destinations });
  skip.mockReturnValue({ limit });
  (Destination.find as jest.Mock).mockReturnValue({ sort: () => ({ skip }) });
  (Destination.countDocuments as jest.Mock).mockResolvedValue(21);
  (Attraction.distinct as jest.Mock).mockResolvedValue(['Hurghada']);
  (Attraction.aggregate as jest.Mock).mockResolvedValue([]);
});

it.each(['super-admin', 'brand-admin', 'manager', 'editor', 'viewer'])('preserves editor mode for %s and returns active global taxonomy without counts', async role => {
  const response = await request(app).get('/destinations?forEditor=true&page=2&limit=10').set('x-test-role', role);
  expect(response.status).toBe(200);
  expect(response.body.data).toEqual(destinations);
  expect(Destination.find).toHaveBeenCalledWith({ isActive: true });
  expect(Destination.countDocuments).toHaveBeenCalledWith({ isActive: true });
  expect(skip).toHaveBeenCalledWith(10);
  expect(limit).toHaveBeenCalledWith(10);
  expect(Attraction.distinct).not.toHaveBeenCalled();
  expect(Attraction.aggregate).not.toHaveBeenCalled();
});
it.each([undefined, 'customer'])('rejects unauthorized editor mode (%s)', async role => {
  const pending = request(app).get('/destinations?forEditor=true');
  if (role) pending.set('x-test-role', role);
  const response = await pending;
  expect(response.status).toBe(role ? 403 : 401);
  expect(Destination.find).not.toHaveBeenCalled();
});
it.each(['', '?forEditor=false'])('retains ordinary tenant scoping %s', async query => {
  const response = await request(app).get(`/destinations${query}`);
  expect(response.status).toBe(200);
  expect(Attraction.distinct).toHaveBeenCalledWith('destination.city', { status: 'active', tenantIds: { $in: ['site-a'] } });
  expect(Destination.find).toHaveBeenCalledWith({ isActive: true, name: { $in: ['Hurghada'] } });
  expect(Attraction.aggregate).toHaveBeenCalledWith(expect.arrayContaining([{ $match: { status: 'active', tenantIds: { $in: ['site-a'] } } }]));
});
it.each(['yes', 'true&forEditor=false'])('rejects malformed editor mode %s', async value => {
  const response = await request(app).get(`/destinations?forEditor=${value}`);
  expect(response.status).toBe(400);
  expect(Destination.find).not.toHaveBeenCalled();
});
