import { Types } from 'mongoose';
import { bundleFingerprint } from '../bundles/hash';
import { BundleIdempotency } from '../models/BundleIdempotency';
import { claimBundleIdempotency } from '../services/bundleIdempotency.service';

jest.mock('../models/BundleIdempotency', () => ({
  BundleIdempotency: {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
}));

describe('Bundle idempotency processing lease', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reclaims a crashed processing claim after its lease expires', async () => {
    const existing = {
      _id: new Types.ObjectId(),
      requestHash: bundleFingerprint({ quoteId: 'quote-1' }),
      status: 'processing',
      leaseUntil: new Date(Date.now() - 1_000),
    };
    const duplicate = Object.assign(new Error('duplicate'), { code: 11000 });
    (BundleIdempotency.create as jest.Mock).mockRejectedValue(duplicate);
    (BundleIdempotency.findOne as jest.Mock).mockResolvedValue(existing);
    (BundleIdempotency.findOneAndUpdate as jest.Mock).mockImplementation(async (_query, update) => ({
      ...existing,
      requestHash: _query.requestHash,
      leaseUntil: update.$set.leaseUntil,
      attempts: 2,
    }));

    const claim = await claimBundleIdempotency({
      scope: 'bundle-order.create',
      storefrontTenantId: new Types.ObjectId(),
      key: 'stable-key-123456789',
      request: { quoteId: 'quote-1' },
    });

    expect(claim.record.attempts).toBe(2);
    expect(BundleIdempotency.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processing', leaseUntil: { $lte: expect.any(Date) } }),
      expect.objectContaining({
        $set: { leaseUntil: expect.any(Date) },
        $inc: { attempts: 1 },
      }),
      { new: true }
    );
  });
});
