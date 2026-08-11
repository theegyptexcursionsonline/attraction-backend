import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { getResellableAttractionDetails, getResellableAttractions } from '../controllers/attractions.controller';

jest.mock('../models/Attraction', () => ({
  Attraction: { find: jest.fn(), findOne: jest.fn(), countDocuments: jest.fn() },
}));
jest.mock('../models/Tenant', () => ({ Tenant: { find: jest.fn() } }));
jest.mock('../models/Booking', () => ({ Booking: {} }));
jest.mock('../models/Review', () => ({ Review: {} }));
jest.mock('../models/Availability', () => ({ Availability: {} }));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  return res;
};

const listChain = (rows: unknown[]) => ({
  select: jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(rows) }),
        }),
      }),
    }),
  }),
});

describe('marketplace discovery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('combines search, brand, visibility and selected-site filters server-side without leaking allowlists', async () => {
    const site = new Types.ObjectId();
    const owner = new Types.ObjectId();
    const listing = new Types.ObjectId();
    const tenantLean = jest.fn().mockResolvedValue([{ _id: owner }]);
    (Tenant.find as jest.Mock).mockReturnValue({ select: jest.fn().mockReturnValue({ lean: tenantLean }) });
    (Attraction.find as jest.Mock).mockImplementation((query) => {
      expect(query.ownerTenantId).toEqual({ $ne: site, $in: [owner] });
      expect(query.$and).toEqual(expect.arrayContaining([
        expect.objectContaining({ $or: expect.any(Array) }),
        { tenantIds: site },
      ]));
      return listChain([{
        _id: listing,
        title: 'Jeep Safari',
        slug: 'jeep-safari',
        images: [],
        priceFrom: 40,
        currency: 'USD',
        tenantIds: [site],
        ownerTenantId: { _id: owner, name: 'Desert Fox', slug: 'desertfox' },
        reseller: { enabled: true, type: 'commission', value: 20, allowedTenants: [site] },
      }]);
    });
    (Attraction.countDocuments as jest.Mock).mockResolvedValue(1);
    const res = response();

    await getResellableAttractions({
      tenant: { _id: site },
      user: { role: 'brand-admin', assignedTenants: [site] },
      query: { page: 1, limit: 24, search: 'Desert', ownerTenantIds: owner.toString(), addedOnly: true },
    } as never, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.pagination).toEqual({ page: 1, limit: 24, total: 1, totalPages: 1 });
    expect(body.data[0]).toEqual(expect.objectContaining({ id: listing.toString(), addedToMySite: true }));
    expect(body.data[0]).not.toHaveProperty('tenantIds');
    expect(body.data[0].resellTerms).not.toHaveProperty('allowedTenants');
  });

  it('returns only safe detail fields for an eligible listing', async () => {
    const site = new Types.ObjectId();
    const owner = new Types.ObjectId();
    const listing = new Types.ObjectId();
    const lean = jest.fn().mockResolvedValue({
      _id: listing,
      title: 'Jeep Safari',
      slug: 'jeep-safari',
      images: [],
      tenantIds: [site],
      ownerTenantId: { _id: owner, name: 'Desert Fox', slug: 'desertfox' },
      reseller: { type: 'commission', value: 20, allowedTenants: [site] },
      internalNotes: 'never expose',
    });
    (Attraction.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ populate: jest.fn().mockReturnValue({ lean }) }),
    });
    const res = response();

    await getResellableAttractionDetails({
      tenant: { _id: site },
      user: { role: 'brand-admin', assignedTenants: [site] },
      params: { id: listing.toString() },
    } as never, res, jest.fn());

    const data = res.json.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({ id: listing.toString(), title: 'Jeep Safari' }));
    expect(data).not.toHaveProperty('tenantIds');
    expect(data).not.toHaveProperty('internalNotes');
    expect(data.resellTerms).not.toHaveProperty('allowedTenants');
  });

  it('requires a selected site for the on-site-only filter', async () => {
    const res = response();
    await getResellableAttractions({ user: { role: 'super-admin' }, query: { addedOnly: true } } as never, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Attraction.find).not.toHaveBeenCalled();
  });
});
