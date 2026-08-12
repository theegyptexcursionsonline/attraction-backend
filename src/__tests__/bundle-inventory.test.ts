import mongoose from 'mongoose';
import { Availability } from '../models/Availability';
import { BundleOfferInventory } from '../models/BundleOfferInventory';
import {
  assertBundleInventoryAvailable,
  BundleInventoryError,
  runBundleTransaction,
} from '../services/bundleInventory.service';

jest.mock('../models/Availability', () => ({ Availability: { findOne: jest.fn() } }));
jest.mock('../models/BundleOfferInventory', () => ({ BundleOfferInventory: { findOne: jest.fn() } }));

const selection = {
  attractionId: '507f1f77bcf86cd799439011',
  supplyOfferId: '507f1f77bcf86cd799439012',
  date: '2030-04-01',
  time: '09:00',
  guests: 3,
  offerCapacity: 4,
};

describe('bundle dual-capacity checks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fails closed when the attraction has no explicit availability row', async () => {
    (Availability.findOne as jest.Mock).mockResolvedValue(null);
    (BundleOfferInventory.findOne as jest.Mock).mockResolvedValue(null);
    await expect(assertBundleInventoryAvailable(selection)).rejects.toEqual(
      expect.objectContaining<Partial<BundleInventoryError>>({ code: 'AVAILABILITY_NOT_CONFIGURED' })
    );
  });

  it('classifies customer-correctable capacity conflicts as 409 responses', () => {
    expect(new BundleInventoryError(
      'AVAILABILITY_NOT_CONFIGURED',
      'This departure is not available'
    ).statusCode).toBe(409);
    expect(new BundleInventoryError(
      'INVALID_GUEST_COUNT',
      'A positive guest count is required'
    ).statusCode).toBe(400);
  });

  it('checks both real attraction capacity and supplier allocation capacity', async () => {
    (Availability.findOne as jest.Mock).mockResolvedValue({
      isBlocked: false,
      timeSlots: [{ time: '09:00', capacity: 10, booked: 1 }],
    });
    (BundleOfferInventory.findOne as jest.Mock).mockResolvedValue({ capacity: 4, reserved: 2 });
    await expect(assertBundleInventoryAvailable(selection)).rejects.toEqual(
      expect.objectContaining<Partial<BundleInventoryError>>({ code: 'OFFER_CAPACITY_EXCEEDED' })
    );
  });

  it('accepts only when both independent capacity limits can serve the party', async () => {
    (Availability.findOne as jest.Mock).mockResolvedValue({
      isBlocked: false,
      timeSlots: [{ time: '09:00', capacity: 10, booked: 1 }],
    });
    (BundleOfferInventory.findOne as jest.Mock).mockResolvedValue({ capacity: 8, reserved: 2 });
    await expect(assertBundleInventoryAvailable(selection)).resolves.toBeUndefined();
  });

  it('retries a first-writer supplier inventory bootstrap race with a fresh transaction', async () => {
    const endSession = jest.fn().mockResolvedValue(undefined);
    const startSession = jest.spyOn(mongoose, 'startSession').mockImplementation(async () => ({
      withTransaction: async (work: () => Promise<void>) => work(),
      endSession,
    } as never));
    let attempts = 0;
    await expect(runBundleTransaction(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error('BundleOfferInventory duplicate key'), {
          code: 11000,
          keyPattern: { supplyOfferId: 1, date: 1, timeKey: 1 },
        });
      }
      return 'reserved';
    })).resolves.toBe('reserved');
    expect(attempts).toBe(2);
    expect(startSession).toHaveBeenCalledTimes(2);
    expect(endSession).toHaveBeenCalledTimes(2);
    startSession.mockRestore();
  });
});
