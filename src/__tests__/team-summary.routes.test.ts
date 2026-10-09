/**
 * GET /users/summary at the route boundary: the Team totals are readable by exactly the roles that
 * may read the Team list, and the path is never mistaken for a member id (GET /users/:id).
 */
import express from 'express';
import request from '../test/loopbackRequest';
import { verifyToken } from '../utils/jwt';
import { User } from '../models/User';
import usersRoutes from '../routes/users.routes';
import * as usersController from '../controllers/users.controller';

jest.mock('../utils/jwt', () => ({ verifyToken: jest.fn() }));
jest.mock('../models/User', () => ({ User: { findById: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: { findOne: jest.fn() } }));
jest.mock('../controllers/users.controller', () => {
  const handlers: Record<string, jest.Mock> = {};
  return new Proxy({}, {
    get: (_target, prop: string | symbol) => {
      if (prop === '__esModule') return true;
      const name = String(prop);
      handlers[name] ??= jest.fn((_req, res) => res.status(200).json({ success: true, handler: name }));
      return handlers[name];
    },
  });
});

const app = express();
app.use(express.json());
app.use('/users', usersRoutes);

const signedInAs = (role: string) => {
  (verifyToken as jest.Mock).mockReturnValue({ userId: 'caller' });
  (User.findById as jest.Mock).mockResolvedValue({ _id: 'caller', role, status: 'active', assignedTenants: [] });
};

describe('GET /users/summary route guard', () => {
  it('asks a signed-out visitor to sign in', async () => {
    const response = await request(app).get('/users/summary');
    expect(response.status).toBe(401);
    expect(usersController.getTeamSummary).not.toHaveBeenCalled();
  });

  test.each(['editor', 'viewer', 'customer', 'guest'])('refuses %s, who cannot read the Team list either', async (role) => {
    signedInAs(role);
    const [summary, list] = await Promise.all([
      request(app).get('/users/summary').set('Authorization', 'Bearer token'),
      request(app).get('/users').set('Authorization', 'Bearer token'),
    ]);
    expect([summary.status, list.status]).toEqual([403, 403]);
    expect(usersController.getTeamSummary).not.toHaveBeenCalled();
  });

  test.each(['super-admin', 'brand-admin', 'manager'])('lets %s read the totals, not a member called "summary"', async (role) => {
    signedInAs(role);
    const response = await request(app).get('/users/summary').set('Authorization', 'Bearer token');
    expect(response.status).toBe(200);
    expect(response.body.handler).toBe('getTeamSummary');
    expect(usersController.getUserById).not.toHaveBeenCalled();
  });

  it('passes a site id through for the controller to check', async () => {
    signedInAs('brand-admin');
    const response = await request(app).get('/users/summary?tenantId=6720f0c0a1b2c3d4e5f60718').set('Authorization', 'Bearer token');
    expect(response.status).toBe(200);
    expect((usersController.getTeamSummary as jest.Mock).mock.calls[0][0].query).toEqual({ tenantId: '6720f0c0a1b2c3d4e5f60718' });
  });
});
