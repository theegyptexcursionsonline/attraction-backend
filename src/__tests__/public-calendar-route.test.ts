import express from 'express';
import request from 'supertest';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import router from '../routes/attractions.routes';

jest.mock('../middleware/tenant.middleware', () => ({ optionalTenant: (req: any, _res: any, next: any) => { req.tenant = { _id: 'tenant-public' }; next(); } }));
jest.mock('../models/Attraction', () => ({ Attraction: { exists: jest.fn() } }));
jest.mock('../models/Availability', () => ({ Availability: { find: jest.fn() } }));
const app = express();
app.use('/attractions', router);
const path = '/attractions/6aa051e9e8da09289e127d95/public-blocked-dates';
describe('public calendar route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Attraction.exists as jest.Mock).mockResolvedValue({});
    (Availability.find as jest.Mock).mockReturnValue({ sort: () => ({ lean: async () => [{ date: '2026-09-13', blockReason: 'private' }] }) });
  });
  it('ignores an unrelated or stale staff authorization header and exposes dates only', async () => {
    const res = await request(app).get(path + '?from=2026-09-01&to=2026-09-30').set('Authorization', 'Bearer stale-staff-session');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ date: '2026-09-13' }]);
    expect(Attraction.exists).toHaveBeenCalledWith({ _id: '6aa051e9e8da09289e127d95', status: 'active', tenantIds: { $in: ['tenant-public'] } });
  });
  it.each(['', '?from=bad&to=2026-09-30', '?from=2026-09-30&to=2026-09-01', '?from=2026-01-01&to=2028-01-01'])('rejects an invalid or unbounded date window %s', async query => {
    expect((await request(app).get(path + query)).status).toBe(400);
    expect(Availability.find).not.toHaveBeenCalled();
  });
  it('returns 404 when the public tenant cannot see the tour', async () => {
    (Attraction.exists as jest.Mock).mockResolvedValue(null);
    expect((await request(app).get(path + '?from=2026-09-01&to=2026-09-30')).status).toBe(404);
  });
});
