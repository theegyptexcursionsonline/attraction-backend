import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import {
  expireStaleCardHolds,
  failCardBookingAndReleaseInventory,
  bookingDate,
  inventoryEntriesForItems,
  reserveInventory,
} from '../services/bookingInventory.service';

jest.mock('../models/Availability', () => ({
  Availability: {
    updateOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

jest.mock('../models/Booking', () => ({
  Booking: {
    findOne: jest.fn(),
    find: jest.fn(),
  },
}));

describe('booking inventory lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Availability.updateOne as jest.Mock).mockResolvedValue({ acknowledged: true });
  });

  it('stores date-only inventory at UTC midnight regardless of server timezone', () => {
    expect(bookingDate('2026-08-01').toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('materializes advertised default capacity before the atomic reservation', async () => {
    (Availability.findOneAndUpdate as jest.Mock).mockResolvedValue({});

    await reserveInventory([{
      attractionId: 'attraction-1',
      date: new Date('2026-08-01T00:00:00'),
      guests: 2,
    }]);

    expect(Availability.updateOne).toHaveBeenCalledWith(
      { attractionId: 'attraction-1', date: new Date('2026-08-01T00:00:00') },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          allDayCapacity: 25,
          allDayBooked: 0,
          isBlocked: false,
        }),
      }),
      { upsert: true }
    );
    expect(Availability.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        attractionId: 'attraction-1',
        allDayCapacity: { $type: 'number' },
      }),
      { $inc: { allDayBooked: 2 } },
      { new: true }
    );
  });

  it('uses the attraction availability mode instead of a legacy cart time', () => {
    const entries = inventoryEntriesForItems(
      'attraction-1',
      [{
        date: '2026-08-01',
        time: '08:00',
        quantities: { adults: 2, children: 0, infants: 0 },
      }],
      false
    );

    expect(entries).toEqual([expect.objectContaining({
      time: undefined,
      guests: 2,
    })]);
  });

  it('atomically releases all guests and cancels a failed card booking', async () => {
    const booking = {
      _id: 'booking-1',
      tenantId: 'tenant-1',
      attractionId: 'attraction-1',
      paymentStatus: 'processing',
      status: 'pending',
      inventoryReservedAt: new Date('2026-07-31T00:00:00Z'),
      inventoryReservations: [{
        date: new Date('2026-08-01T00:00:00Z'),
        time: '09:00',
        guests: 4,
      }],
      inventoryReleasedAt: undefined as Date | undefined,
      items: [{
        date: '2026-08-01',
        time: '09:00',
        quantities: { adults: 2, children: 1, infants: 1 },
      }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    (Booking.findOne as jest.Mock).mockResolvedValue(booking);
    (Availability.findOneAndUpdate as jest.Mock).mockResolvedValue({});

    const result = await failCardBookingAndReleaseInventory(
      'booking-1',
      'tenant-1',
      'pi_bound'
    );

    expect(result).toBe(booking);
    expect(Availability.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ attractionId: 'attraction-1' }),
      { $inc: { 'timeSlots.$[slot].booked': -4 } },
      expect.objectContaining({ arrayFilters: [{ 'slot.time': '09:00' }] })
    );
    expect(booking.paymentStatus).toBe('failed');
    expect(booking.status).toBe('cancelled');
    expect(booking.inventoryReleasedAt).toBeInstanceOf(Date);
    expect(booking.save).toHaveBeenCalled();
  });

  it('expires an abandoned card booking even when no PaymentIntent was created', async () => {
    const candidate = {
      _id: 'booking-abandoned',
      tenantId: 'tenant-1',
      stripePaymentIntentId: undefined,
    };
    const booking = {
      ...candidate,
      attractionId: 'attraction-1',
      paymentStatus: 'pending',
      status: 'pending',
      inventoryReservedAt: new Date('2026-07-31T00:00:00Z'),
      inventoryReservations: [{
        date: new Date('2026-08-01T00:00:00Z'),
        guests: 1,
      }],
      inventoryReleasedAt: undefined as Date | undefined,
      items: [{
        date: '2026-08-01',
        quantities: { adults: 1, children: 0, infants: 0 },
      }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    (Booking.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue([candidate]),
    });
    (Booking.findOne as jest.Mock).mockResolvedValue(booking);
    (Availability.findOneAndUpdate as jest.Mock).mockResolvedValue({});

    await expect(expireStaleCardHolds()).resolves.toBe(1);
    expect(Booking.findOne).toHaveBeenCalledWith(
      expect.not.objectContaining({ stripePaymentIntentId: expect.anything() }),
      null,
      {}
    );
  });

  it('does not decrement inventory for a legacy booking that never reserved it', async () => {
    const booking = {
      _id: 'legacy-booking',
      tenantId: 'tenant-1',
      attractionId: 'attraction-1',
      paymentStatus: 'pending',
      status: 'pending',
      inventoryReleasedAt: undefined as Date | undefined,
      items: [{
        date: '2026-08-01',
        quantities: { adults: 1, children: 0, infants: 0 },
      }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    (Booking.findOne as jest.Mock).mockResolvedValue(booking);

    await expect(
      failCardBookingAndReleaseInventory('legacy-booking', 'tenant-1')
    ).resolves.toBe(booking);

    expect(Availability.findOneAndUpdate).not.toHaveBeenCalled();
    expect(booking.inventoryReleasedAt).toBeInstanceOf(Date);
    expect(booking.status).toBe('cancelled');
  });
});
