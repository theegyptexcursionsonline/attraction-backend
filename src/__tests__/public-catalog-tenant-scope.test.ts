import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Destination } from '../models/Destination';
import { SpecialOffer } from '../models/SpecialOffer';
import { getAttractionBySlug } from '../controllers/attractions.controller';
import { getDestinationBySlug } from '../controllers/destinations.controller';
import { getActiveOffers } from '../controllers/specialOffers.controller';

jest.mock('../models/Attraction', () => ({
  Attraction: {
    findOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  },
}));
jest.mock('../models/Destination', () => ({ Destination: { findOne: jest.fn() } }));
jest.mock('../models/SpecialOffer', () => ({ SpecialOffer: { find: jest.fn() } }));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('public catalogue tenant boundaries', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adds the active tenant to attraction slug lookup', async () => {
    const tenantId = new Types.ObjectId();
    const lean = jest.fn().mockResolvedValue(null);
    const select = jest.fn().mockReturnValue({ lean });
    (Attraction.findOne as jest.Mock).mockReturnValue({ select });

    await getAttractionBySlug(
      { tenant: { _id: tenantId }, params: { slug: 'private-tour' } } as never,
      response(),
      jest.fn()
    );

    expect(Attraction.findOne).toHaveBeenCalledWith({
      slug: 'private-tour',
      status: 'active',
      tenantIds: { $in: [tenantId] },
    });
  });

  it('does not return a destination with no attractions in the active tenant', async () => {
    const tenantId = new Types.ObjectId();
    (Destination.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ name: 'Luxor', slug: 'luxor' }),
    });
    (Attraction.countDocuments as jest.Mock).mockResolvedValue(0);
    (Attraction.aggregate as jest.Mock).mockResolvedValue([]);
    const res = response();

    await getDestinationBySlug(
      { tenant: { _id: tenantId }, params: { slug: 'luxor' } } as never,
      res,
      jest.fn()
    );

    expect(Attraction.countDocuments).toHaveBeenCalledWith({
      'destination.city': 'Luxor',
      status: 'active',
      tenantIds: { $in: [tenantId] },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(Attraction.find).not.toHaveBeenCalled();
  });

  it('scopes active offers to attractions owned by the active tenant', async () => {
    const tenantId = new Types.ObjectId();
    const attractionId = new Types.ObjectId();
    (Attraction.find as jest.Mock).mockReturnValue({
      distinct: jest.fn().mockResolvedValue([attractionId]),
    });
    const lean = jest.fn().mockResolvedValue([]);
    const sort = jest.fn().mockReturnValue({ lean });
    const populate = jest.fn().mockReturnValue({ sort });
    (SpecialOffer.find as jest.Mock).mockReturnValue({ populate });

    await getActiveOffers(
      { tenant: { _id: tenantId } } as never,
      response(),
      jest.fn()
    );

    expect(SpecialOffer.find).toHaveBeenCalledWith(expect.objectContaining({
      attractionId: { $in: [attractionId] },
    }));
  });
});
