import { getTenantByCustomDomain } from '../controllers/tenants.controller';
import { Tenant } from '../models/Tenant';

jest.mock('../models/Tenant', () => ({ Tenant: { findOne: jest.fn() } }));

const response = () => { const res: any = {}; res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res); return res; };
const lookup = (hostname: string) => { const res = response(); return getTenantByCustomDomain({ params: { hostname } } as any, res, jest.fn()).then(() => res); };

// The storefront's robots.txt treats a 404 here as "not a site"; www and apex must agree.
describe('GET /tenants/by-domain/:hostname host variants', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (Tenant.findOne as jest.Mock).mockReturnValue({ select: () => ({ lean: jest.fn().mockResolvedValue({ _id: 't1', slug: 'safari-sahara-hurghada', name: 'Safari Sahara', customDomain: 'safari-sahara.com' }) }) });
  });

  test.each(['safari-sahara.com', 'www.safari-sahara.com', 'WWW.Safari-Sahara.COM', 'safari-sahara.com.'])('%s looks up the bare public domain', async (hostname) => {
    const res = await lookup(hostname);
    expect(Tenant.findOne).toHaveBeenCalledWith({ customDomain: 'safari-sahara.com', status: { $in: ['active', 'coming_soon'] } });
    expect(res.json.mock.calls[0][0].data).toEqual({ id: 't1', slug: 'safari-sahara-hurghada', name: 'Safari Sahara', customDomain: 'safari-sahara.com' });
  });

  test.each(['safari-sahara.com/x', 'user@safari-sahara.com', 'localhost', ''])('%p is refused as not found without a read', async (hostname) => {
    const res = await lookup(hostname);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(Tenant.findOne).not.toHaveBeenCalled();
  });
});
