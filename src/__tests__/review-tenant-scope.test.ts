import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Review } from '../models/Review';
import {
  createReview,
  getRecentReviews,
  getReviewById,
} from '../controllers/reviews.controller';

jest.mock('../models/Attraction', () => ({
  Attraction: { exists: jest.fn(), find: jest.fn() },
}));
jest.mock('../models/Review', () => ({
  Review: { create: jest.fn(), find: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../services/notification.service', () => ({
  createAdminNotifications: jest.fn().mockResolvedValue(undefined),
}));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('public review tenant boundaries', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects review creation for an attraction outside the active tenant', async () => {
    const tenantId = new Types.ObjectId();
    (Attraction.exists as jest.Mock).mockResolvedValue(null);
    const req = {
      tenant: { _id: tenantId },
      body: {
        attractionId: new Types.ObjectId().toString(),
        rating: 5,
        title: 'Excellent',
        content: 'A very good experience.',
        author: 'Guest',
        country: 'GB',
      },
    };
    const res = response();

    await createReview(req as never, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(Attraction.exists).toHaveBeenCalledWith(expect.objectContaining({
      tenantIds: { $in: [tenantId.toString()] },
    }));
    expect(Review.create).not.toHaveBeenCalled();
  });

  it('scopes recent reviews to attraction ids owned by the active tenant', async () => {
    const tenantId = new Types.ObjectId();
    const attractionId = new Types.ObjectId();
    const distinct = jest.fn().mockResolvedValue([attractionId]);
    (Attraction.find as jest.Mock).mockReturnValue({ distinct });
    const lean = jest.fn().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ populate: jest.fn().mockReturnValue({ lean }) });
    const sort = jest.fn().mockReturnValue({ limit });
    (Review.find as jest.Mock).mockReturnValue({ sort });

    await getRecentReviews(
      { tenant: { _id: tenantId }, query: {} } as never,
      response(),
      jest.fn()
    );

    expect(Review.find).toHaveBeenCalledWith({
      status: 'approved',
      attractionId: { $in: [attractionId] },
    });
  });

  it('scopes a public review detail lookup to the active tenant', async () => {
    const tenantId = new Types.ObjectId();
    const attractionId = new Types.ObjectId();
    const reviewId = new Types.ObjectId().toString();
    (Attraction.find as jest.Mock).mockReturnValue({
      distinct: jest.fn().mockResolvedValue([attractionId]),
    });
    const populate = jest.fn().mockResolvedValue(null);
    const select = jest.fn().mockReturnValue({ populate });
    (Review.findOne as jest.Mock).mockReturnValue({ select });

    await getReviewById(
      { tenant: { _id: tenantId }, params: { reviewId } } as never,
      response(),
      jest.fn()
    );

    expect(Review.findOne).toHaveBeenCalledWith({
      _id: reviewId,
      status: 'approved',
      attractionId: { $in: [attractionId] },
    });
  });
});
