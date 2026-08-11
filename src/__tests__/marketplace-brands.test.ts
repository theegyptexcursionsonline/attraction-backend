import { Tenant } from '../models/Tenant';
import { getMarketplaceBrands } from '../controllers/tenants.controller';

jest.mock('../models/Tenant', () => ({ Tenant: { find: jest.fn(), countDocuments: jest.fn() } }));
jest.mock('../models/Attraction', () => ({ Attraction: {} }));
jest.mock('../models/Booking', () => ({ Booking: {} }));
jest.mock('../models/DomainClaim', () => ({ DomainClaim: {} }));

const response = () => {
  const res: any = {};
  res.setHeader = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('marketplace brand directory', () => {
  it('returns a minimal paginated active-brand projection', async () => {
    const lean = jest.fn().mockResolvedValue([{ _id: 'brand-1', name: 'Brand One', slug: 'brand-one', logo: '/logo.png', status: 'active', privateSetting: 'hidden' }]);
    const limit = jest.fn().mockReturnValue({ lean });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    const select = jest.fn().mockReturnValue({ sort });
    (Tenant.find as jest.Mock).mockReturnValue({ select });
    (Tenant.countDocuments as jest.Mock).mockResolvedValue(1);
    const res = response();

    await getMarketplaceBrands({ query: { page: 1, limit: 100 } } as never, res, jest.fn());

    expect(select).toHaveBeenCalledWith('_id name slug logo status');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: [{ id: 'brand-1', name: 'Brand One', slug: 'brand-one', logo: '/logo.png', status: 'active' }],
      pagination: expect.objectContaining({ total: 1 }),
    }));
  });
});
