import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { updateStopSaleBatch } from '../controllers/attractions.controller';

jest.mock('../models/Attraction', () => ({ Attraction: { find: jest.fn() } }));
jest.mock('../models/Availability', () => ({ Availability: { bulkWrite: jest.fn() } }));
jest.mock('../models/Booking', () => ({ Booking: {} }));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Stop Sale batch mutation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('verifies every tour before applying a multi-tour date range', async () => {
    const ids = [new Types.ObjectId().toString(), new Types.ObjectId().toString()];
    (Attraction.find as jest.Mock).mockReturnValue({ distinct: jest.fn().mockResolvedValue(ids) });
    (Availability.bulkWrite as jest.Mock).mockResolvedValue({ modifiedCount: 4 });
    const res = response();
    await updateStopSaleBatch({
      user: { role: 'super-admin' },
      body: { attractionIds: ids, startDate: '2030-01-02', endDate: '2030-01-03', action: 'block', reason: 'weather' },
    } as never, res, jest.fn());

    expect(Availability.bulkWrite).toHaveBeenCalledTimes(1);
    const operations = (Availability.bulkWrite as jest.Mock).mock.calls[0][0];
    expect(operations).toHaveLength(4);
    expect(operations[0].updateOne.update.$set).toMatchObject({ isBlocked: true, blockReason: 'weather' });
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('fails closed before writing when any selected tour is unauthorized', async () => {
    const ids = [new Types.ObjectId().toString(), new Types.ObjectId().toString()];
    (Attraction.find as jest.Mock).mockReturnValue({ distinct: jest.fn().mockResolvedValue([ids[0]]) });
    const res = response();
    await updateStopSaleBatch({
      user: { role: 'brand-admin', assignedTenants: [new Types.ObjectId()] },
      body: { attractionIds: ids, startDate: '2030-01-02', endDate: '2030-01-03', action: 'unblock' },
    } as never, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(Availability.bulkWrite).not.toHaveBeenCalled();
  });
});
