import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { updateResellerVisibilityBulk } from '../controllers/attractions.controller';

jest.mock('../models/Attraction', () => ({ Attraction: { find: jest.fn(), bulkWrite: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: { countDocuments: jest.fn() } }));
jest.mock('../models/Booking', () => ({ Booking: {} }));

const response = () => { const res: any = {}; res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res); return res; };

describe('reseller brand visibility', () => {
  beforeEach(() => jest.clearAllMocks());

  it('validates the complete batch then revokes storefront access from blocked brands', async () => {
    const owner = new Types.ObjectId();
    const allowed = new Types.ObjectId();
    const blocked = new Types.ObjectId();
    const tourIds = [new Types.ObjectId(), new Types.ObjectId()];
    const tours = tourIds.map((_id) => ({ _id, ownerTenantId: owner, tenantIds: [owner, allowed, blocked] }));
    (Attraction.find as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue(tours) });
    (Tenant.countDocuments as jest.Mock).mockResolvedValue(1);
    (Attraction.bulkWrite as jest.Mock).mockResolvedValue({ modifiedCount: 2 });

    const res = response();
    await updateResellerVisibilityBulk({ user: { role: 'super-admin' }, body: { attractionIds: tourIds.map(String), allowedTenants: [allowed.toString()] } } as never, res, jest.fn());

    expect(Attraction.bulkWrite).toHaveBeenCalledTimes(1);
    const operations = (Attraction.bulkWrite as jest.Mock).mock.calls[0][0];
    expect(operations).toHaveLength(2);
    expect(operations[0].updateOne.update.$set.tenantIds.map(String)).toEqual([owner.toString(), allowed.toString()]);
    expect(operations[0].updateOne.update.$set['reseller.allowedTenants'].map(String)).toEqual([allowed.toString()]);
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  it('fails before any write when an allowed brand is not active', async () => {
    const owner = new Types.ObjectId();
    const inactive = new Types.ObjectId();
    const tourId = new Types.ObjectId();
    (Attraction.find as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: tourId, ownerTenantId: owner, tenantIds: [owner] }]) });
    (Tenant.countDocuments as jest.Mock).mockResolvedValue(0);
    const res = response();

    await updateResellerVisibilityBulk({ user: { role: 'super-admin' }, body: { attractionIds: [tourId.toString()], allowedTenants: [inactive.toString()] } } as never, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Attraction.bulkWrite).not.toHaveBeenCalled();
  });
});
