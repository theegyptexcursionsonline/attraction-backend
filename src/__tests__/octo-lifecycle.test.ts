import mongoose from 'mongoose';
import { Availability } from '../models/Availability';
import { OctoHold } from '../models/OctoHold';
import {
  parseAvailabilityId,
  sweepExpiredOctoHolds,
  validateReservationRequest,
} from '../routes/octo.routes';
import { OctoAttractionLike } from '../octo/mappers';

const product: OctoAttractionLike = {
  _id: 'product-1',
  availability: { type: 'time-slots' },
  entryWindows: [{ startTime: '09:00' }, { startTime: '14:00' }],
  pricingOptions: [
    { id: 'adult', name: 'Adult', price: 25 },
    { id: 'child', name: 'Child', price: 10 },
    { id: 'free', name: 'Infant', price: 0 },
  ],
};

describe('OCTO reservation validation', () => {
  it('strictly parses real local dates and times', () => {
    expect(parseAvailabilityId('2026-07-10')).toEqual({ localDate: '2026-07-10', startTime: null });
    expect(parseAvailabilityId('2026-07-10T09:00:00')).toEqual({ localDate: '2026-07-10', startTime: '09:00' });
    expect(parseAvailabilityId('2026-02-30')).toBeNull();
    expect(parseAvailabilityId('2026-07-10T25:00')).toBeNull();
  });

  it('accepts only units, option, and start times belonging to the product', () => {
    expect(validateReservationRequest(product, 'OTHER', '2026-07-10T09:00:00', [{ unitId: 'adult', quantity: 1 }]))
      .toEqual({ error: 'optionId is not valid for this product' });
    expect(validateReservationRequest(product, 'DEFAULT', '2026-07-10T10:00:00', [{ unitId: 'adult', quantity: 1 }]))
      .toEqual({ error: 'availabilityId does not belong to this product option' });
    expect(validateReservationRequest(product, 'DEFAULT', '2026-07-10T09:00:00', [{ unitId: 'unknown', quantity: 1 }]))
      .toEqual({ error: 'Unknown unitId: unknown' });
  });

  it('rejects duplicate units, non-positive/non-integer quantities, and zero prices', () => {
    expect(validateReservationRequest(product, 'DEFAULT', '2026-07-10T09:00:00', [
      { unitId: 'adult', quantity: 1 },
      { unitId: 'adult', quantity: 2 },
    ])).toEqual({ error: 'Duplicate unitId: adult' });
    expect(validateReservationRequest(product, 'DEFAULT', '2026-07-10T09:00:00', [{ unitId: 'adult', quantity: 1.5 }]))
      .toEqual({ error: 'quantity for adult must be a positive integer' });
    expect(validateReservationRequest(product, 'DEFAULT', '2026-07-10T09:00:00', [{ unitId: 'adult', quantity: 0 }]))
      .toEqual({ error: 'quantity for adult must be a positive integer' });
    expect(validateReservationRequest(product, 'DEFAULT', '2026-07-10T09:00:00', [{ unitId: 'free', quantity: 1 }]))
      .toEqual({ error: 'unit free must have a positive price' });
  });

  it('calculates a positive integer reservation without coercing input', () => {
    expect(validateReservationRequest(product, 'DEFAULT', '2026-07-10T14:00:00', [
      { unitId: 'adult', quantity: 2 },
      { unitId: 'child', quantity: 1 },
    ])).toEqual({
      localDate: '2026-07-10',
      startTime: '14:00',
      items: [
        { unitId: 'adult', quantity: 2, unitPriceMinor: 2500 },
        { unitId: 'child', quantity: 1, unitPriceMinor: 1000 },
      ],
      totalQty: 3,
      totalMinor: 6000,
    });
  });
});

describe('OCTO abandoned-hold sweep', () => {
  const now = new Date('2026-07-10T12:00:00.000Z');
  const hold = {
    _id: 'hold-1',
    status: 'ON_HOLD',
    attractionId: 'attraction-1',
    localDate: '2026-07-10',
    startTime: '09:00',
    unitItems: [{ unitId: 'adult', quantity: 2, unitPriceMinor: 2500 }],
  };
  let status: string;

  const mockCandidates = () => {
    const lean = jest.fn().mockResolvedValue([{ _id: hold._id }]);
    const select = jest.fn().mockReturnValue({ lean });
    const limit = jest.fn().mockReturnValue({ select });
    const sort = jest.fn().mockReturnValue({ limit });
    jest.spyOn(OctoHold, 'find').mockReturnValue({ sort } as never);
  };

  beforeEach(() => {
    status = 'ON_HOLD';
    mockCandidates();
    jest.spyOn(OctoHold, 'findOneAndUpdate');
    (OctoHold.findOneAndUpdate as jest.Mock).mockImplementation(async () => {
      if (status !== 'ON_HOLD') return null;
      status = 'EXPIRED';
      return { ...hold, status } as never;
    });
    jest.spyOn(Availability, 'findOneAndUpdate').mockResolvedValue({ _id: 'availability-1' } as never);
    jest.spyOn(mongoose, 'startSession').mockResolvedValue({
      withTransaction: async (work: () => Promise<void>) => work(),
      endSession: jest.fn().mockResolvedValue(undefined),
    } as never);
  });

  it('releases an expired hold once across concurrent sweep attempts', async () => {
    const [first, second] = await Promise.all([
      sweepExpiredOctoHolds({ now }),
      sweepExpiredOctoHolds({ now }),
    ]);

    expect(first.expired + second.expired).toBe(1);
    expect(Availability.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(status).toBe('EXPIRED');
  });

  it('is idempotent when the same stale candidate is swept again', async () => {
    expect(await sweepExpiredOctoHolds({ now })).toEqual({ examined: 1, expired: 1, failed: 0 });
    expect(await sweepExpiredOctoHolds({ now })).toEqual({ examined: 1, expired: 0, failed: 0 });
    expect(Availability.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('reports release failure and relies on the transaction to roll back expiry', async () => {
    jest.spyOn(Availability, 'findOneAndUpdate').mockResolvedValue(null);
    jest.spyOn(mongoose, 'startSession').mockResolvedValue({
      withTransaction: async (work: () => Promise<void>) => {
        const snapshot = status;
        try {
          await work();
        } catch (error) {
          status = snapshot;
          throw error;
        }
      },
      endSession: jest.fn().mockResolvedValue(undefined),
    } as never);

    expect(await sweepExpiredOctoHolds({ now })).toEqual({ examined: 1, expired: 0, failed: 1 });
    expect(status).toBe('ON_HOLD');
  });
});
