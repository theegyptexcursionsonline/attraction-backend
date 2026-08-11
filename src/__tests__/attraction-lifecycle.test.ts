import { Attraction } from '../models/Attraction';
import { archiveAttraction, restoreAttraction, unarchiveAttraction } from '../controllers/attractions.controller';

jest.mock('../models/Attraction', () => ({
  Attraction: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));
jest.mock('../models/Tenant', () => ({ Tenant: {} }));
jest.mock('../models/Booking', () => ({ Booking: {} }));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const request = () => ({ params: { id: 'tour-1' }, user: { role: 'super-admin' } } as never);

describe('tour archive and trash lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('archives a published tour without marking it as trash', async () => {
    const tour: any = { status: 'active', save: jest.fn().mockResolvedValue(undefined) };
    (Attraction.findOne as jest.Mock).mockResolvedValue(tour);

    await archiveAttraction(request(), response(), jest.fn());

    expect(tour.statusBeforeArchive).toBe('active');
    expect(tour.status).toBe('archived');
    expect(tour.archivedAt).toBeInstanceOf(Date);
    expect(tour.trashedAt).toBeUndefined();
    expect(tour.save).toHaveBeenCalledTimes(1);
  });

  it('only unarchives rows carrying the archive marker', async () => {
    (Attraction.findOneAndUpdate as jest.Mock).mockResolvedValue({ status: 'draft' });

    await unarchiveAttraction(request(), response(), jest.fn());

    expect(Attraction.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'tour-1', status: 'archived', archivedAt: { $exists: true }, trashedAt: { $exists: false } },
      { $set: { status: 'draft' }, $unset: { archivedAt: 1, statusBeforeArchive: 1 } },
      { new: true }
    );
  });

  it('restores only trash or legacy-trash rows, never archived rows', async () => {
    (Attraction.findOneAndUpdate as jest.Mock).mockResolvedValue({ status: 'draft' });

    await restoreAttraction(request(), response(), jest.fn());

    expect(Attraction.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'tour-1', status: 'archived', archivedAt: { $exists: false } },
      { $set: { status: 'draft' }, $unset: { trashedAt: 1 } },
      { new: true }
    );
  });
});
