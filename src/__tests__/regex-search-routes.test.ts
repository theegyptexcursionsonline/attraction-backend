import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { MAX_REGEX_SEARCH_LENGTH } from '../utils/helpers';

function controllerMockFactory() {
  return new Proxy(
    {},
    {
      get: (_target, prop: string | symbol) => {
        if (prop === '__esModule') return true;
        return (req: Request, res: Response) =>
          res.status(200).json({
            success: true,
            handler: String(prop),
            query: req.query,
          });
      },
    }
  );
}

const pass = (req: Request, _res: Response, next: NextFunction) => {
  Object.assign(req, {
    user: {
      _id: '000000000000000000000001',
      role: 'super-admin',
      status: 'active',
      assignedTenants: [],
    },
  });
  next();
};

jest.mock('../controllers/attractions.controller', () => controllerMockFactory());
jest.mock('../controllers/bookings.controller', () => controllerMockFactory());
jest.mock('../controllers/destinations.controller', () => controllerMockFactory());
jest.mock('../controllers/promo.controller', () => controllerMockFactory());
jest.mock('../controllers/reviews.controller', () => controllerMockFactory());
jest.mock('../controllers/rsvps.controller', () => controllerMockFactory());
jest.mock('../controllers/specialOffers.controller', () => controllerMockFactory());
jest.mock('../controllers/tenants.controller', () => controllerMockFactory());
jest.mock('../controllers/users.controller', () => controllerMockFactory());
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: pass,
  optionalAuth: pass,
  requireAdmin: pass,
  requireRole: () => pass,
  requireSuperAdmin: pass,
  canAccessTenant: pass,
}));
jest.mock('../middleware/tenant.middleware', () => ({
  optionalTenant: pass,
  requireTenant: pass,
}));

import attractionsRoutes from '../routes/attractions.routes';
import bookingsRoutes from '../routes/bookings.routes';
import destinationsRoutes from '../routes/destinations.routes';
import promoRoutes from '../routes/promo.routes';
import reviewsRoutes from '../routes/reviews.routes';
import rsvpsRoutes from '../routes/rsvps.routes';
import specialOffersRoutes from '../routes/specialOffers.routes';
import tenantsRoutes from '../routes/tenants.routes';
import usersRoutes from '../routes/users.routes';

const app = express();
app.use('/attractions', attractionsRoutes);
app.use('/bookings', bookingsRoutes);
app.use('/destinations', destinationsRoutes);
app.use('/promo-codes', promoRoutes);
app.use('/reviews', reviewsRoutes);
app.use('/rsvps', rsvpsRoutes);
app.use('/special-offers', specialOffersRoutes);
app.use('/tenants', tenantsRoutes);
app.use('/users', usersRoutes);

type SearchRoute = {
  name: string;
  path: string;
  parameter: 'destination' | 'search';
};

const searchRoutes: SearchRoute[] = [
  { name: 'attraction destination filter', path: '/attractions', parameter: 'destination' },
  { name: 'resellable attraction search', path: '/attractions/resellable', parameter: 'search' },
  { name: 'booking admin search', path: '/bookings/admin', parameter: 'search' },
  { name: 'destination search', path: '/destinations', parameter: 'search' },
  { name: 'promo-code search', path: '/promo-codes', parameter: 'search' },
  { name: 'review admin search', path: '/reviews/admin', parameter: 'search' },
  { name: 'RSVP admin search', path: '/rsvps/admin', parameter: 'search' },
  { name: 'special-offer search', path: '/special-offers', parameter: 'search' },
  { name: 'tenant search', path: '/tenants', parameter: 'search' },
  { name: 'user search', path: '/users', parameter: 'search' },
  { name: 'traveler search', path: '/users/travelers', parameter: 'search' },
];

describe.each(searchRoutes)('$name route boundary', ({ path, parameter }) => {
  it.each(['Summer', '.', '^a', '['])('accepts bounded literal input %s', async (value) => {
    const response = await request(app).get(path).query({ [parameter]: value });

    expect(response.status).toBe(200);
  });

  it('accepts exactly 128 Unicode characters', async () => {
    const value = '🌊'.repeat(MAX_REGEX_SEARCH_LENGTH);
    const response = await request(app).get(path).query({ [parameter]: value });

    expect(response.status).toBe(200);
  });

  it('rejects 129 Unicode characters', async () => {
    const response = await request(app)
      .get(path)
      .query({ [parameter]: '🌊'.repeat(MAX_REGEX_SEARCH_LENGTH + 1) });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Query validation failed');
  });

  it('rejects repeated values instead of selecting one implicitly', async () => {
    const response = await request(app).get(path).query({ [parameter]: ['Summer', 'Winter'] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Query validation failed');
  });

  it('normalizes whitespace to an empty value', async () => {
    const response = await request(app).get(path).query({ [parameter]: '   ' });

    expect(response.status).toBe(200);
  });
});

describe('special-offer route filter contract', () => {
  it.each(['active', 'expired', 'upcoming', 'inactive'])(
    'preserves supported status %s',
    async (status) => {
      const response = await request(app).get('/special-offers').query({ status });

      expect(response.status).toBe(200);
    }
  );

  it('rejects an unsupported status', async () => {
    const response = await request(app).get('/special-offers').query({ status: 'all' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Query validation failed');
  });
});
