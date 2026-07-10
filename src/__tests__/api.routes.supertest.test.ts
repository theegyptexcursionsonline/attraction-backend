import fs from 'fs';
import path from 'path';
import request from 'supertest';

function controllerMockFactory() {
  return new Proxy(
    {},
    {
      get: (_target, prop: string | symbol) => {
        if (prop === '__esModule') return true;
        return (req: any, res: any) =>
          res.status(200).json({
            success: true,
            mocked: true,
            handler: String(prop),
            path: req.path,
          });
      },
    }
  );
}

jest.mock('../controllers/auth.controller', () => controllerMockFactory());
jest.mock('../controllers/attractions.controller', () => controllerMockFactory());
jest.mock('../controllers/bookings.controller', () => controllerMockFactory());
jest.mock('../controllers/categories.controller', () => controllerMockFactory());
jest.mock('../controllers/destinations.controller', () => controllerMockFactory());
jest.mock('../controllers/reviews.controller', () => controllerMockFactory());
jest.mock('../controllers/tenants.controller', () => controllerMockFactory());
jest.mock('../controllers/users.controller', () => controllerMockFactory());
jest.mock('../controllers/payments.controller', () => controllerMockFactory());
jest.mock('../controllers/upload.controller', () => controllerMockFactory());
jest.mock('../controllers/stats.controller', () => controllerMockFactory());

import app from '../app';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface Endpoint {
  method: HttpMethod;
  path: string;
}

const routePrefixByFile: Record<string, string> = {
  'auth.routes.ts': '/auth',
  'attractions.routes.ts': '/attractions',
  'bookings.routes.ts': '/bookings',
  'categories.routes.ts': '/categories',
  'contact.routes.ts': '/contact',
  'destinations.routes.ts': '/destinations',
  'payments.routes.ts': '/payments',
  'reviews.routes.ts': '/reviews',
  'stats.routes.ts': '/stats',
  'tenants.routes.ts': '/tenants',
  'upload.routes.ts': '/upload',
  'users.routes.ts': '/users',
};

const readEndpointsFromRouteFile = (filePath: string, prefix: string): Endpoint[] => {
  const source = fs.readFileSync(filePath, 'utf8');
  const regex = /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  const endpoints: Endpoint[] = [];

  let match: RegExpExecArray | null = regex.exec(source);
  while (match) {
    endpoints.push({
      method: match[1] as HttpMethod,
      path: `/api${prefix}${match[2] === '/' ? '' : match[2]}`,
    });
    match = regex.exec(source);
  }

  return endpoints;
};

const toConcretePath = (routePath: string): string =>
  routePath.replace(/:([A-Za-z0-9_]+)/g, 'test-id');

const collectApiEndpoints = (): Endpoint[] => {
  const routesDir = path.resolve(__dirname, '../routes');
  const collected: Endpoint[] = [
    { method: 'get', path: '/api' },
    { method: 'get', path: '/api/health' },
  ];

  for (const [file, prefix] of Object.entries(routePrefixByFile)) {
    const fullPath = path.join(routesDir, file);
    const endpoints = readEndpointsFromRouteFile(fullPath, prefix);
    collected.push(...endpoints);
  }

  const dedup = new Map<string, Endpoint>();
  for (const endpoint of collected) {
    dedup.set(`${endpoint.method} ${endpoint.path}`, endpoint);
  }

  return Array.from(dedup.values()).sort((a, b) =>
    `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`)
  );
};

describe('API routes supertest coverage', () => {
  const endpoints = collectApiEndpoints();

  it('discovers route list from all API route modules', () => {
    // Protect against accidentally missing route modules from this coverage test.
    expect(endpoints.length).toBeGreaterThanOrEqual(70);
  });

  it('never publishes seeded account credentials on the API homepage', async () => {
    const response = await request(app).get('/api');

    expect(response.status).toBe(200);
    expect(response.text).not.toContain('Test Accounts');
    expect(response.text).not.toContain('admin@attractions-network.com');
    expect(response.text).not.toContain('Admin@123456');
    expect(response.text).not.toContain('Customer@123');
  });

  test.each(endpoints)('%s %s responds (not missing route)', async ({ method, path: routePath }) => {
    const concretePath = toConcretePath(routePath);
    let req = request(app)[method](concretePath);

    if (method === 'post' || method === 'put' || method === 'patch' || method === 'delete') {
      req = req.send({});
    }

    const response = await req;

    // Route should exist and respond with something other than global 404 handler.
    // Valid outcomes include auth/validation/controller statuses (200/201/400/401/403/etc).
    expect(response.status).not.toBe(404);
  });
});
