import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { Booking } from '../models/Booking';
import { BundleOrder } from '../models/BundleOrder';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { permanentlyDeleteAttraction } from '../controllers/attractions.controller';
import { runBundleTransaction } from '../services/bundleInventory.service';
import { AuthRequest } from '../types';

jest.mock('../models/Booking', () => ({
  Booking: { exists: jest.fn() },
}));
jest.mock('../models/BundleOrder', () => ({
  BundleOrder: { exists: jest.fn() },
}));
jest.mock('../models/Attraction', () => ({
  Attraction: {
    exists: jest.fn(),
    findOneAndDelete: jest.fn(),
  },
}));
jest.mock('../models/Availability', () => ({
  Availability: { deleteMany: jest.fn() },
}));
jest.mock('../services/bundleInventory.service', () => ({
  runBundleTransaction: jest.fn(),
}));

const transactionSession = { id: 'permanent-delete-session' };
const attractionId = new Types.ObjectId().toString();

const chain = <T>(value: T) => {
  const query = { session: jest.fn() };
  query.session.mockResolvedValue(value);
  return query;
};

const app = express();
app.delete('/attractions/:id/permanent', (req, res, next) => {
  (req as AuthRequest).user = {
    _id: new Types.ObjectId(),
    role: 'super-admin',
    assignedTenants: [],
  } as unknown as AuthRequest['user'];
  void permanentlyDeleteAttraction(req as AuthRequest, res, next);
});

describe('permanent attraction deletion preserves Bundle history and capacity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (runBundleTransaction as jest.Mock).mockImplementation(async (work) =>
      work(transactionSession)
    );
    (Booking.exists as jest.Mock)
      .mockReturnValueOnce(chain(null))
      .mockReturnValueOnce(chain(null));
    (BundleOrder.exists as jest.Mock).mockReturnValue(chain(null));
    (Attraction.findOneAndDelete as jest.Mock).mockReturnValue(
      chain({ _id: attractionId })
    );
    (Availability.deleteMany as jest.Mock).mockResolvedValue({ deletedCount: 1 });
  });

  it('separately opts into Bundle children instead of relying on the generic Booking filter', async () => {
    (Booking.exists as jest.Mock)
      .mockReset()
      .mockReturnValueOnce(chain(null))
      .mockReturnValueOnce(chain({ _id: new Types.ObjectId() }));

    const response = await request(app).delete(`/attractions/${attractionId}/permanent`);

    expect(response.status).toBe(409);
    expect(Booking.exists).toHaveBeenNthCalledWith(1, {
      attractionId,
      bundleOrderId: { $exists: false },
    });
    expect(Booking.exists).toHaveBeenNthCalledWith(2, {
      attractionId,
      bundleOrderId: { $exists: true },
    });
    expect(Attraction.findOneAndDelete).not.toHaveBeenCalled();
    expect(Availability.deleteMany).not.toHaveBeenCalled();
  });

  test.each(['reserved', 'paid', 'partially_refunded'])(
    'blocks deletion while a %s master Bundle order references the attraction',
    async () => {
      (BundleOrder.exists as jest.Mock).mockReturnValue(
        chain({ _id: new Types.ObjectId() })
      );

      const response = await request(app).delete(`/attractions/${attractionId}/permanent`);

      expect(response.status).toBe(409);
      expect(BundleOrder.exists).toHaveBeenCalledWith({
        'components.attractionId': attractionId,
      });
      expect(Attraction.findOneAndDelete).not.toHaveBeenCalled();
      expect(Availability.deleteMany).not.toHaveBeenCalled();
    }
  );

  it('deletes an unused trashed attraction and its capacity in the same transaction', async () => {
    const response = await request(app).delete(`/attractions/${attractionId}/permanent`);

    expect(response.status).toBe(200);
    expect(Attraction.findOneAndDelete).toHaveBeenCalledWith({
      _id: attractionId,
      status: 'archived',
      archivedAt: { $exists: false },
    });
    expect((Attraction.findOneAndDelete as jest.Mock).mock.results[0].value.session)
      .toHaveBeenCalledWith(transactionSession);
    expect(Availability.deleteMany).toHaveBeenCalledWith(
      { attractionId },
      { session: transactionSession }
    );
  });

  it('does not delete capacity if the transaction fails', async () => {
    (runBundleTransaction as jest.Mock).mockRejectedValue(
      new Error('Transient transaction failed')
    );

    const response = await request(app).delete(`/attractions/${attractionId}/permanent`);

    expect(response.status).toBe(500);
    expect(Attraction.findOneAndDelete).not.toHaveBeenCalled();
    expect(Availability.deleteMany).not.toHaveBeenCalled();
  });
});
