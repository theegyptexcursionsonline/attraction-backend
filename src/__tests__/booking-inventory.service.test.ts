import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import {
  expireStaleCardHolds,
  failCardBookingAndReleaseInventory,
  markCardPaymentFailed,
  bookingDate,
  inventoryEntriesForItems,
  reserveInventory,
} from '../services/bookingInventory.service';
import { getTenantStripeConfig } from '../services/tenantPayment.service';
import { createPaymentIntent, cancelPaymentIntent, retrievePaymentIntent } from '../services/stripe.service';

jest.mock('../models/Availability', () => ({
  Availability: {
    updateOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

jest.mock('../models/Booking', () => ({
  Booking: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  },
}));

jest.mock('../services/tenantPayment.service', () => ({
  ...jest.requireActual('../services/tenantPayment.service'),
  getTenantStripeConfig: jest.fn(),
}));

jest.mock('../services/stripe.service', () => ({
  createPaymentIntent: jest.fn(),
  cancelPaymentIntent: jest.fn(),
  retrievePaymentIntent: jest.fn(),
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

  it('materializes and reserves the configured catalog departures', async () => {
    (Availability.findOneAndUpdate as jest.Mock).mockResolvedValue({});
    const date = new Date('2026-08-01T00:00:00.000Z');
    const entries = inventoryEntriesForItems(
      'attraction-1',
      [{
        date: '2026-08-01',
        time: '07:00',
        quantities: { adults: 2, children: 1, infants: 0 },
      }],
      true,
      ['07:00', '10:00', '13:00'],
    );

    await reserveInventory(entries);

    expect(entries).toEqual([expect.objectContaining({
      time: '07:00',
      guests: 3,
      configuredTimes: ['07:00', '10:00', '13:00'],
    })]);
    expect(Availability.updateOne).toHaveBeenNthCalledWith(
      1,
      { attractionId: 'attraction-1', date },
      {
        $setOnInsert: {
          timeSlots: [
            { time: '07:00', capacity: 25, booked: 0 },
            { time: '10:00', capacity: 25, booked: 0 },
            { time: '13:00', capacity: 25, booked: 0 },
          ],
          isBlocked: false,
        },
      },
      { upsert: true },
    );
    expect(Availability.updateOne).toHaveBeenCalledTimes(1);
    expect(Availability.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        attractionId: 'attraction-1',
        date,
        isBlocked: { $ne: true },
        $expr: expect.any(Object),
      }),
      { $inc: { 'timeSlots.$[slot].booked': 3 } },
      { new: true, arrayFilters: [{ 'slot.time': '07:00' }] },
    );
  });

  it('rejects an unknown configured departure before creating inventory', async () => {
    expect(() => inventoryEntriesForItems(
      'attraction-1',
      [{
        date: '2026-08-01',
        time: '08:00',
        quantities: { adults: 1, children: 0, infants: 0 },
      }],
      true,
      ['07:00', '10:00'],
    )).toThrow('SLOT_UNAVAILABLE');

    await expect(reserveInventory([{
      attractionId: 'attraction-1',
      date: new Date('2026-08-01T00:00:00.000Z'),
      time: '08:00',
      guests: 1,
      configuredTimes: ['07:00', '10:00'],
    }])).rejects.toThrow('SLOT_UNAVAILABLE');

    expect(Availability.updateOne).not.toHaveBeenCalled();
    expect(Availability.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('keeps concurrent capacity claims on one atomic conditional update', async () => {
    let booked = 0;
    (Availability.findOneAndUpdate as jest.Mock).mockImplementation(
      async (_query: unknown, update: { $inc: Record<string, number> }) => {
        const guests = update.$inc['timeSlots.$[slot].booked'];
        if (booked + guests > 25) return null;
        booked += guests;
        return { booked };
      }
    );

    const entry = (guests: number) => inventoryEntriesForItems(
      'attraction-1',
      [{
        date: '2026-08-01',
        time: '07:00',
        quantities: { adults: guests, children: 0, infants: 0 },
      }],
      true,
      ['07:00'],
    );
    const results = await Promise.allSettled([
      reserveInventory(entry(15)),
      reserveInventory(entry(15)),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(booked).toBe(15);
    expect(Availability.findOneAndUpdate).toHaveBeenCalledTimes(2);
    for (const [query] of (Availability.findOneAndUpdate as jest.Mock).mock.calls) {
      expect(query).toEqual(expect.objectContaining({
        isBlocked: { $ne: true },
        $expr: expect.any(Object),
      }));
    }
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

  it('keeps a declined payment retryable without releasing its inventory hold', async () => {
    const booking = {
      _id: 'booking-retryable',
      tenantId: 'tenant-1',
      stripePaymentIntentId: 'pi_retryable',
      paymentStatus: 'failed',
      status: 'pending',
    };
    (Booking.findOneAndUpdate as jest.Mock).mockResolvedValue(booking);

    await expect(markCardPaymentFailed(
      booking._id,
      booking.tenantId,
      booking.stripePaymentIntentId
    )).resolves.toBe(booking);

    expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: booking._id,
        status: 'pending',
        inventoryReleasedAt: { $exists: false },
      }),
      { $set: { paymentStatus: 'failed' } },
      { new: true }
    );
    expect(Availability.findOneAndUpdate).not.toHaveBeenCalled();
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

  it('cancels an abandoned Stripe intent before releasing its inventory', async () => {
    const candidate = {
      _id: 'booking-expired',
      tenantId: 'tenant-1',
      stripePaymentIntentId: 'pi_expired',
    };
    const booking = {
      ...candidate,
      attractionId: 'attraction-1',
      paymentStatus: 'failed',
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
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true, secretKey: 'sk_test' });
    (retrievePaymentIntent as jest.Mock).mockResolvedValue({ status: 'requires_payment_method' });
    (cancelPaymentIntent as jest.Mock).mockResolvedValue({ status: 'canceled' });

    await expect(expireStaleCardHolds()).resolves.toBe(1);
    expect(cancelPaymentIntent).toHaveBeenCalledWith(
      'sk_test',
      'pi_expired',
      { idempotencyKey: 'booking:booking-expired:expire-payment' }
    );
    expect(Availability.findOneAndUpdate).toHaveBeenCalled();
  });

  it('keeps inventory held when Stripe cannot confirm cancellation', async () => {
    const candidate = {
      _id: 'booking-racing-payment',
      tenantId: 'tenant-1',
      stripePaymentIntentId: 'pi_racing',
    };
    (Booking.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue([candidate]),
    });
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true, secretKey: 'sk_test' });
    (retrievePaymentIntent as jest.Mock).mockResolvedValue({ status: 'requires_payment_method' });
    (cancelPaymentIntent as jest.Mock).mockResolvedValue({ status: 'succeeded' });

    await expect(expireStaleCardHolds()).resolves.toBe(0);
    expect(Booking.findOne).not.toHaveBeenCalled();
    expect(Availability.findOneAndUpdate).not.toHaveBeenCalled();
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

describe('claimed payment session cleanup', () => {
  beforeEach(() => jest.clearAllMocks());
  const candidate = { _id: 'booking-claimed', tenantId: 'tenant-1', reference: 'ATT-CLAIMED', total: 25, currency: 'EUR', status: 'cancelled', stripePaymentSessionClaimedAt: new Date(), stripePaymentBinding: { accountId: 'acct_current', mode: 'test' } };
  const config = { enabled: true, secretKey: 'rk_test_secret', publishableKey: 'pk_test_public', verifiedAccountId: 'acct_current' };
  const prepare = () => {
    (Booking.find as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue([candidate]) });
    (getTenantStripeConfig as jest.Mock).mockResolvedValue(config);
  };
  it('recovers the deterministic intent after a crash and closes the marker only after Stripe cancellation', async () => {
    prepare();
    (createPaymentIntent as jest.Mock).mockResolvedValue({ id: 'pi_recovered', status: 'requires_payment_method' });
    (cancelPaymentIntent as jest.Mock).mockResolvedValue({ id: 'pi_recovered', status: 'canceled' });
    await expect(expireStaleCardHolds()).resolves.toBe(0);
    expect(createPaymentIntent).toHaveBeenCalledWith('rk_test_secret', 2500, 'eur', { bookingId: 'booking-claimed', bookingReference: 'ATT-CLAIMED', tenantId: 'tenant-1' }, { idempotencyKey: 'booking:booking-claimed:payment:2500:eur' });
    expect(Booking.updateOne).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1', status: 'cancelled' }), { $set: { stripePaymentSessionClosedAt: expect.any(Date) } });
    expect(Availability.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('keeps the marker protected when the recovered intent is processing or paid', async () => {
    prepare();
    (createPaymentIntent as jest.Mock).mockResolvedValue({ id: 'pi_recovered', status: 'succeeded' });
    await expect(expireStaleCardHolds()).resolves.toBe(0);
    expect(cancelPaymentIntent).not.toHaveBeenCalled();
    expect(Booking.updateOne).not.toHaveBeenCalled();
  });
  it('does not recover an old session through another account', async () => {
    prepare();
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({ ...config, verifiedAccountId: 'acct_other' });
    await expect(expireStaleCardHolds()).resolves.toBe(0);
    expect(createPaymentIntent).not.toHaveBeenCalled();
    expect(Booking.updateOne).not.toHaveBeenCalled();
  });
});

it('does not release a hold if a payment claim wins after the expiry scan', async () => {
  jest.clearAllMocks();
  (Booking.findOne as jest.Mock).mockResolvedValue(null);
  await expect(failCardBookingAndReleaseInventory('booking-race', 'tenant-1')).resolves.toBeNull();
  expect(Booking.findOne).toHaveBeenCalledWith(expect.objectContaining({ stripePaymentSessionClaimedAt: { $exists: false } }), null, {});
  expect(Availability.findOneAndUpdate).not.toHaveBeenCalled();
});

it.each([23, 24, 48])('does not recreate an unknown payment session after %i hours', async hours => {
  jest.clearAllMocks();
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (Booking.find as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue([{
    _id: 'booking-old-claim', tenantId: 'tenant-1', total: 25, currency: 'EUR', stripePaymentSessionClaimedAt: new Date(Date.now() - hours * 60 * 60 * 1000),
  }]) });
  (getTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true, secretKey: 'rk_test_secret' });
  await expect(expireStaleCardHolds()).resolves.toBe(0);
  expect(createPaymentIntent).not.toHaveBeenCalled();
  expect(cancelPaymentIntent).not.toHaveBeenCalled();
  expect(Booking.updateOne).not.toHaveBeenCalled();
  expect(Availability.findOneAndUpdate).not.toHaveBeenCalled();
  expect(warning).toHaveBeenCalledWith('booking_payment_recovery_required', expect.objectContaining({ reason: 'idempotency_recovery_window_elapsed' }));
  warning.mockRestore();
});
