import { Types } from 'mongoose';
import { resolvePage } from '../controllers/page.controller';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { SAFARI_TENANT_ID } from '../utils/safariLegacyPages';
jest.mock('../models/Tenant', () => ({ Tenant: { findById: jest.fn() } }));
jest.mock('../models/Attraction', () => ({ Attraction: { findOne: jest.fn(), exists: jest.fn() } }));
// Production shape on 16 Sep: the Quad page was rebuilt on its WordPress address with a new id.
const page = { _id: '6aa2c2c4aed8540632bb2f1e', slug: 'hurghada-quad-biking', title: 'Quads', status: 'active', isPublished: true, body: '<script>bad()</script><p>Safe</p>' };
const response = () => { const res: any = {}; res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res); return res; };
const req = (slug = 'quad-biking', tenantId = SAFARI_TENANT_ID) => ({ tenant: { _id: new Types.ObjectId(tenantId) }, query: { slug } } as any);
const pages = (customPages: unknown[]) => (Tenant.findById as jest.Mock).mockReturnValue({ select: () => ({ lean: jest.fn().mockResolvedValue({ customPages }) }) });
beforeEach(() => {
  jest.resetAllMocks();
  (Attraction.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
  (Attraction.exists as jest.Mock).mockResolvedValue(null);
  pages([page]);
});
test.each(['quad-biking', 'hurghada-quad-biking-tours'])('old address %s answers with the sanitized live page plus a redirect', async slug => {
  const res = response(), next = jest.fn(); await resolvePage(req(slug), res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0].data).toMatchObject({ type: 'page', redirectTo: '/hurghada-quad-biking', page: { body: '<p>Safe</p>' } });
  // The hold check is scoped to this site and to records still on the website.
  expect(Attraction.exists).toHaveBeenCalledWith({ tenantIds: req().tenant._id, status: { $ne: 'archived' }, $or: [{ pathSlug: slug }, { slug }] });
});
test('exact active attraction wins without alias lookup', async () => {
  (Attraction.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue({ title: 'Live tour' }) });
  const res = response(); await resolvePage(req(), res, jest.fn());
  expect(res.json.mock.calls[0][0].data).toEqual({ type: 'attraction', attraction: { title: 'Live tour' } });
  expect(Attraction.exists).not.toHaveBeenCalled();
});
test('exact published page wins without alias lookup', async () => {
  pages([page, { ...page, _id: 'other', slug: 'quad-biking' }]);
  const res = response(); await resolvePage(req(), res, jest.fn());
  expect(res.json.mock.calls[0][0].data.redirectTo).toBeUndefined();
  expect(res.json.mock.calls[0][0].data.page.slug).toBe('quad-biking');
  expect(Attraction.exists).not.toHaveBeenCalled();
});
test('the live address itself never redirects', async () => {
  const res = response(); await resolvePage(req('hurghada-quad-biking'), res, jest.fn());
  expect(res.json.mock.calls[0][0].data.redirectTo).toBeUndefined();
});
test('unpublished draft on the old address blocks the alias', async () => {
  pages([page, { ...page, _id: 'draft', slug: 'quad-biking', isPublished: false }]);
  const res = response(); await resolvePage(req(), res, jest.fn());
  expect(res.json.mock.calls[0][0].data).toEqual({ type: 'none' });
});
test('an unlisted tour on the old address blocks the alias', async () => {
  (Attraction.exists as jest.Mock).mockResolvedValue({ _id: new Types.ObjectId() });
  const res = response(); await resolvePage(req(), res, jest.fn());
  expect(res.json.mock.calls[0][0].data).toEqual({ type: 'none' });
});
test('another site with the same page never receives the alias', async () => {
  const res = response(); await resolvePage(req('quad-biking', new Types.ObjectId().toHexString()), res, jest.fn());
  expect(res.json.mock.calls[0][0].data).toEqual({ type: 'none' });
  expect(Attraction.exists).not.toHaveBeenCalled();
});
test('unknown address stays none without an extra read', async () => {
  const res = response(); await resolvePage(req('no-such-page'), res, jest.fn());
  expect(res.json.mock.calls[0][0].data).toEqual({ type: 'none' });
  expect(Attraction.exists).not.toHaveBeenCalled();
});
test('a failed hold check is an error, not a redirect', async () => {
  (Attraction.exists as jest.Mock).mockRejectedValue(new Error('db down'));
  const res = response(), next = jest.fn(); await resolvePage(req(), res, next);
  expect(next).toHaveBeenCalledWith(expect.any(Error));
  expect(res.json).not.toHaveBeenCalled();
});
