import { Types } from 'mongoose';
import { resolvePage } from '../controllers/page.controller';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { SAFARI_TENANT_ID, SAFARI_QUAD_PAGE_ID } from '../utils/safariLegacyPages';
jest.mock('../models/Tenant', () => ({ Tenant: { findById: jest.fn() } }));
jest.mock('../models/Attraction', () => ({ Attraction: { findOne: jest.fn(), find: jest.fn() } }));
const page = { _id: SAFARI_QUAD_PAGE_ID, slug: 'quad-biking', title: 'Quads', status: 'active', isPublished: true, body: '<script>bad()</script><p>Safe</p>' };
const response = () => { const res: any = {}; res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res); return res; };
const req = () => ({ tenant: { _id: new Types.ObjectId(SAFARI_TENANT_ID) }, query: { slug: 'hurghada-quad-biking-tours' } } as any);
beforeEach(() => {
  jest.resetAllMocks();
  (Attraction.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
  (Attraction.find as jest.Mock).mockReturnValue({ select: () => ({ lean: jest.fn().mockResolvedValue([]) }) });
  (Tenant.findById as jest.Mock).mockReturnValue({ select: () => ({ lean: jest.fn().mockResolvedValue({ customPages: [page] }) }) });
});
test('public compatibility retains sanitized page response plus redirect', async () => {
  const res = response(), next = jest.fn(); await resolvePage(req(), res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0].data).toMatchObject({ type: 'page', redirectTo: '/quad-biking', page: { body: '<p>Safe</p>' } });
});
test('exact active attraction wins without alias lookup', async () => {
  (Attraction.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue({ title: 'Live tour' }) });
  const res = response(); await resolvePage(req(), res, jest.fn());
  expect(res.json.mock.calls[0][0].data).toEqual({ type: 'attraction', attraction: { title: 'Live tour' } });
  expect(Attraction.find).not.toHaveBeenCalled();
});
test('exact published page wins without alias lookup', async () => {
  (Tenant.findById as jest.Mock).mockReturnValue({ select: () => ({ lean: jest.fn().mockResolvedValue({ customPages: [{ ...page, slug: 'hurghada-quad-biking-tours' }] }) }) });
  const res = response(); await resolvePage(req(), res, jest.fn());
  expect(res.json.mock.calls[0][0].data.redirectTo).toBeUndefined();
  expect(Attraction.find).not.toHaveBeenCalled();
});
test('unpublished source blocks alias', async () => {
  (Tenant.findById as jest.Mock).mockReturnValue({ select: () => ({ lean: jest.fn().mockResolvedValue({ customPages: [page, { ...page, slug: 'hurghada-quad-biking-tours', isPublished: false }] }) }) });
  const res = response(); await resolvePage(req(), res, jest.fn());
  expect(res.json.mock.calls[0][0].data).toEqual({ type: 'none' });
});
