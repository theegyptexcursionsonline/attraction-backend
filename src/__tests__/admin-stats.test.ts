import { Types } from 'mongoose';
import { getAdminStats } from '../controllers/stats.controller';
import { Attraction } from '../models/Attraction';
import { Booking } from '../models/Booking';
import { Tenant } from '../models/Tenant';

jest.mock('../models/Attraction', () => ({ Attraction: { aggregate: jest.fn() } }));
jest.mock('../models/Booking', () => ({ Booking: { countDocuments: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: { countDocuments: jest.fn() } }));
jest.mock('../models/Review', () => ({ Review: { aggregate: jest.fn() } }));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('admin dashboard statistics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns sourced tenant-scoped destinations, weighted rating, reviews and active sites', async () => {
    const tenantId = new Types.ObjectId();
    (Attraction.aggregate as jest.Mock).mockResolvedValue([{
      totalAttractions: 3,
      destinations: ['Hurghada', 'Makadi Bay'],
      totalReviews: 10,
      weightedRatingTotal: 47,
    }]);
    (Booking.countDocuments as jest.Mock).mockResolvedValue(8);
    (Tenant.countDocuments as jest.Mock).mockResolvedValue(1);
    const res = response();

    await getAdminStats({
      user: { role: 'brand-admin', assignedTenants: [tenantId] },
      tenant: { _id: tenantId },
    } as any, res, jest.fn());

    expect(Attraction.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
      { $match: { status: 'active', tenantIds: { $in: [tenantId] } } },
    ]));
    expect(Booking.countDocuments).toHaveBeenCalledWith({ tenantId });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: {
        totalAttractions: 3,
        totalBookings: 8,
        totalDestinations: 2,
        totalReviews: 10,
        averageRating: 4.7,
        activeSites: 1,
      },
    }));
  });

  it('scopes aggregate brand statistics to assigned tenants', async () => {
    const assigned = [new Types.ObjectId(), new Types.ObjectId()];
    (Attraction.aggregate as jest.Mock).mockResolvedValue([]);
    (Booking.countDocuments as jest.Mock).mockResolvedValue(0);
    (Tenant.countDocuments as jest.Mock).mockResolvedValue(2);

    await getAdminStats({ user: { role: 'brand-admin', assignedTenants: assigned } } as any, response(), jest.fn());

    expect(Booking.countDocuments).toHaveBeenCalledWith({ tenantId: { $in: assigned } });
    expect(Tenant.countDocuments).toHaveBeenCalledWith({ _id: { $in: assigned }, status: 'active' });
  });
});
