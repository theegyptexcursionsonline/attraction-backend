import { Attraction } from '../models/Attraction';
import {
  archiveAttraction,
  deleteAttraction,
  permanentlyDeleteAttraction,
  restoreAttraction,
  unarchiveAttraction,
} from '../controllers/attractions.controller';

jest.mock('../models/Attraction', () => ({
  Attraction: {
    exists: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOneAndDelete: jest.fn(),
  },
}));
jest.mock('../models/Tenant', () => ({ Tenant: {} }));
jest.mock('../models/Booking', () => ({ Booking: { exists: jest.fn() } }));
jest.mock('../models/BundleOrder', () => ({ BundleOrder: { exists: jest.fn() } }));
jest.mock('../models/Availability', () => ({ Availability: { deleteMany: jest.fn() } }));
jest.mock('../services/bundleInventory.service', () => ({ runBundleTransaction: jest.fn() }));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const request = () => ({ params: { id: 'tour-1' }, user: { role: 'super-admin' } } as never);
const ownerRequest = (tenantId: string) => ({
  params: { id: 'tour-1' },
  user: { role: 'brand-admin', assignedTenants: [tenantId] },
} as never);

describe('tour archive and trash lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('archives a published tour without marking it as trash', async () => {
    const tour: any = { status: 'active' };
    (Attraction.findOne as jest.Mock).mockResolvedValue(tour);
    (Attraction.findOneAndUpdate as jest.Mock).mockResolvedValue({ ...tour, status: 'archived' });

    await archiveAttraction(request(), response(), jest.fn());

    expect(Attraction.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'tour-1', status: 'active' },
      expect.objectContaining({
        $set: expect.objectContaining({
          statusBeforeArchive: 'active',
          status: 'archived',
          archivedAt: expect.any(Date),
        }),
        $unset: { trashedAt: 1 },
      }),
      { new: true }
    );
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

  it('re-enforces commercial ownership in the destructive write predicate', async () => {
    const tenantId = '507f1f77bcf86cd799439011';
    (Attraction.exists as jest.Mock).mockResolvedValue({ _id: 'tour-1' });
    (Attraction.findOneAndUpdate as jest.Mock).mockResolvedValue({ status: 'draft' });

    await unarchiveAttraction(ownerRequest(tenantId), response(), jest.fn());

    expect(Attraction.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'tour-1',
        $or: [
          { ownerTenantId: { $in: [tenantId] } },
          { ownerTenantId: { $exists: false }, tenantIds: { $in: [tenantId] } },
          { ownerTenantId: null, tenantIds: { $in: [tenantId] } },
        ],
      }),
      expect.anything(),
      { new: true }
    );
  });

  test.each([
    ['trash', deleteAttraction],
    ['archive', archiveAttraction],
    ['unarchive', unarchiveAttraction],
    ['restore', restoreAttraction],
    ['permanent delete', permanentlyDeleteAttraction],
  ])('denies a reseller attempting to %s a supplier-owned attraction', async (_label, handler) => {
    const res = response();
    (Attraction.exists as jest.Mock).mockResolvedValue(null);

    await handler(ownerRequest('507f1f77bcf86cd799439011'), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(Attraction.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Attraction.findOneAndDelete).not.toHaveBeenCalled();
  });
});
