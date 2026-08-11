import mongoose, { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { SpecialOffer } from '../models/SpecialOffer';
import { createOffersBulk } from '../controllers/specialOffers.controller';
import { createSpecialOffersBulkSchema } from '../utils/validators';

jest.mock('../models/Attraction', () => ({ Attraction: { find: jest.fn() } }));
jest.mock('../models/SpecialOffer', () => ({
  SpecialOffer: {
    insertMany: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  },
}));
jest.mock('../models/Booking', () => ({ Booking: {} }));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const validBody = (attractionIds: string[]) => ({
  attractionIds,
  title: 'Summer Offer',
  description: 'Seasonal price',
  discountType: 'percentage',
  discountValue: 10,
  validFrom: '2026-08-11T00:00:00.000Z',
  validUntil: '2026-08-31T23:59:59.000Z',
  usageLimit: 100,
  isActive: true,
});

describe('bulk special offers', () => {
  afterEach(() => jest.restoreAllMocks());

  it('validates percentages, date ordering, ObjectIds and duplicate targets', () => {
    const id = new Types.ObjectId().toHexString();
    expect(createSpecialOffersBulkSchema.safeParse(validBody([id])).success).toBe(true);
    expect(createSpecialOffersBulkSchema.safeParse({ ...validBody([id]), discountValue: 101 }).success).toBe(false);
    expect(createSpecialOffersBulkSchema.safeParse({ ...validBody([id]), validUntil: '2026-08-01T00:00:00.000Z' }).success).toBe(false);
    expect(createSpecialOffersBulkSchema.safeParse(validBody([id, id])).success).toBe(false);
    expect(createSpecialOffersBulkSchema.safeParse(validBody(['not-an-id'])).success).toBe(false);
  });

  it('creates every selected offer in one transaction', async () => {
    const ids = [new Types.ObjectId(), new Types.ObjectId()];
    const lean = jest.fn().mockResolvedValue(ids.map((_id) => ({ _id, ownerTenantId: new Types.ObjectId(), tenantIds: [] })));
    (Attraction.find as jest.Mock).mockReturnValue({ select: jest.fn().mockReturnValue({ lean }) });
    const created = ids.map((_id) => ({ _id: new Types.ObjectId(), attractionId: _id }));
    (SpecialOffer.insertMany as jest.Mock).mockResolvedValue(created);
    const session = {
      withTransaction: jest.fn(async (work: () => Promise<void>) => work()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
    const res = response();
    const next = jest.fn();

    await createOffersBulk({ user: { role: 'super-admin' }, body: validBody(ids.map(String)) } as never, res, next);

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(SpecialOffer.insertMany).toHaveBeenCalledWith(
      expect.arrayContaining(ids.map((id) => expect.objectContaining({ attractionId: id.toString(), title: 'Summer Offer' }))),
      { session, ordered: true }
    );
    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it('performs no write when any selected tour is missing', async () => {
    const ids = [new Types.ObjectId(), new Types.ObjectId()];
    const lean = jest.fn().mockResolvedValue([{ _id: ids[0], ownerTenantId: new Types.ObjectId(), tenantIds: [] }]);
    (Attraction.find as jest.Mock).mockReturnValue({ select: jest.fn().mockReturnValue({ lean }) });
    const startSession = jest.spyOn(mongoose, 'startSession');
    const res = response();

    await createOffersBulk({ user: { role: 'super-admin' }, body: validBody(ids.map(String)) } as never, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(startSession).not.toHaveBeenCalled();
    expect(SpecialOffer.insertMany).not.toHaveBeenCalled();
  });
});
