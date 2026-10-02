import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { BookingCancellation } from '../models/BookingCancellation';
import { PromoCode } from '../models/PromoCode';
import { IBooking } from '../types';
import { bookingDate, expireStaleCardHolds, failCardBookingAndReleaseInventory, releaseBookingInventory, reserveInventory, runBookingTransaction } from '../services/bookingInventory.service';
import { ATN_CANCELLATION_REFUND_FLOW, ATN_REFUND_FLOW_KEY, finalizeBookingCancellation, requestBookingCancellation } from '../services/bookingCancellation.service';
import { getTenantStripeConfig } from '../services/tenantPayment.service';
import { cancelPaymentIntent, retrievePaymentIntent } from '../services/stripe.service';

// Only local Mongo is real. No provider or notification can leave this test process.
jest.mock('../services/bookingPaymentNotification.service', () => ({ enqueueBookingPaymentNotifications: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/bookingOperatorNotification.service', () => ({ enqueueBookingOperatorNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/tenantPayment.service', () => ({ getTenantStripeConfig: jest.fn() }));
jest.mock('../services/stripe.service', () => ({ retrievePaymentIntent: jest.fn(), cancelPaymentIntent: jest.fn(), createPaymentIntent: jest.fn(), createRefund: jest.fn(), listPaymentIntentRefunds: jest.fn() }));

jest.setTimeout(120_000);
let mongo: MongoMemoryReplSet;
const date = '2027-06-10';
const nextDate = '2027-06-11';
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('package_promo_release'));
  await Promise.all([Availability.init(), Booking.init(), BookingCancellation.init(), PromoCode.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  jest.resetAllMocks();
  await Promise.all([Availability.deleteMany({}), Booking.deleteMany({}), BookingCancellation.deleteMany({}), PromoCode.deleteMany({})]);
  (getTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true, secretKey: 'provider-stub' });
});
afterEach(() => jest.restoreAllMocks());

async function seed(paymentStatus: IBooking['paymentStatus'] = 'pending', providerBound = false) {
  const tenantId = new Types.ObjectId(), attractionId = new Types.ObjectId();
  const promo = await PromoCode.create({ code: 'STAY10', description: 'Package offer', tenantId, currency: 'USD', discountType: 'percentage', discountValue: 10,
    usageCount: 1, usageLimit: 1, validFrom: new Date('2026-01-01'), validUntil: new Date('2028-01-01') });
  const booking = await Booking.create({ reference: `release-${new Types.ObjectId()}`, tenantId, attractionId,
    items: [{ optionId: 'package:classic', optionName: 'Classic', date, quantities: { adults: 2, children: 0, infants: 0 }, unitPrice: 500, totalPrice: 1000 }],
    guestDetails: { firstName: 'Egypt Excursions', lastName: 'Online QA', email: 'theegyptexcursionsonline@gmail.com', phone: '+201000000000', country: 'Egypt' },
    subtotal: 1000, discount: 100, total: 900, currency: 'USD', status: paymentStatus === 'succeeded' ? 'confirmed' : 'pending', paymentStatus, paymentMethod: 'card',
    packageBooking: { version: 1 }, packagePromoClaim: { promoId: promo._id, code: promo.code, discount: 100, claimedAt: new Date() },
    inventoryReservedAt: new Date(), inventoryReservations: [{ date: bookingDate(date), guests: 2 }],
    ...(providerBound ? { stripePaymentIntentId: 'pi_release', stripePaymentSessionClaimedAt: new Date() } : {}),
  });
  await Availability.create({ attractionId, date: bookingDate(date), allDayCapacity: 20, allDayBooked: 2, timeSlots: [] });
  await Booking.collection.updateOne({ _id: booking._id }, { $set: { createdAt: new Date(Date.now() - 60 * 60_000) } });
  return { booking, promo, tenantId, attractionId };
}
async function expectReserved(input: Awaited<ReturnType<typeof seed>>, bookedDate = date) {
  expect((await PromoCode.findById(input.promo._id))?.usageCount).toBe(1);
  expect((await Booking.findById(input.booking._id))?.packagePromoClaim?.releasedAt).toBeUndefined();
  expect((await Availability.findOne({ attractionId: input.attractionId, date: bookingDate(bookedDate) }))?.allDayBooked).toBe(2);
}

describe('promotion reservations follow terminal booking transitions', () => {
  it.each(['pending', 'processing'] as const)('preserves an active %s promotion during inventory realignment', async paymentStatus => {
    const input = await seed(paymentStatus, paymentStatus === 'processing');
    // Same reserve/release/reset transaction used by repair-booking-integrity. It does not
    // abandon the booking, so its promotional capacity must not be returned to another buyer.
    await runBookingTransaction(async session => {
      const booking = (await Booking.findById(input.booking._id).session(session!))!;
      const replacement = [{ attractionId: input.attractionId, date: bookingDate(nextDate), guests: 2 }];
      await reserveInventory(replacement, session);
      await releaseBookingInventory(booking, session);
      booking.inventoryReleasedAt = undefined;
      booking.inventoryReservations = replacement;
      await booking.save({ session });
      return true;
    });
    await expectReserved(input, nextDate);
    expect((await Booking.findById(input.booking._id))?.status).toBe('pending');
    expect(retrievePaymentIntent).not.toHaveBeenCalled();
  });

  it('returns an unstarted expired reservation exactly once across concurrent workers and retries', async () => {
    const input = await seed();
    await Promise.all([expireStaleCardHolds(), expireStaleCardHolds()]);
    await expireStaleCardHolds();
    expect((await PromoCode.findById(input.promo._id))?.usageCount).toBe(0);
    expect((await Booking.findById(input.booking._id))?.packagePromoClaim?.releasedAt).toBeInstanceOf(Date);
    expect((await Booking.findById(input.booking._id))?.status).toBe('cancelled');
    expect((await Availability.findOne({ attractionId: input.attractionId }))?.allDayBooked).toBe(0);
  });

  it.each([null, 'processing', 'succeeded', 'requires_capture'])('keeps the promotion while provider state is %s', async state => {
    const input = await seed('processing', true);
    (retrievePaymentIntent as jest.Mock).mockResolvedValue(state ? { id: 'pi_release', status: state } : null);
    await expireStaleCardHolds();
    await expectReserved(input);
    expect(cancelPaymentIntent).not.toHaveBeenCalled();
  });

  it('returns a provider-bound reservation only after provider cancellation is confirmed', async () => {
    const input = await seed('processing', true);
    (retrievePaymentIntent as jest.Mock).mockResolvedValue({ id: 'pi_release', status: 'requires_payment_method' });
    (cancelPaymentIntent as jest.Mock).mockResolvedValueOnce(null).mockResolvedValue({ id: 'pi_release', status: 'canceled' });
    await expireStaleCardHolds(); await expectReserved(input);
    await expireStaleCardHolds(); await expireStaleCardHolds();
    expect((await PromoCode.findById(input.promo._id))?.usageCount).toBe(0);
    const booking = (await Booking.findById(input.booking._id))!;
    expect(booking.stripePaymentSessionClosedAt).toBeInstanceOf(Date);
    expect(booking.packagePromoClaim?.releasedAt).toBeInstanceOf(Date);
  });

  it('returns an authorized unstarted cancellation once', async () => {
    const input = await seed();
    await requestBookingCancellation(input.booking._id, input.tenantId);
    await finalizeBookingCancellation(input.booking._id, input.tenantId);
    await finalizeBookingCancellation(input.booking._id, input.tenantId);
    expect((await PromoCode.findById(input.promo._id))?.usageCount).toBe(0);
    expect((await Booking.findById(input.booking._id))?.packagePromoClaim?.releasedAt).toBeInstanceOf(Date);
  });

  it('refuses cancellation of an unresolved provider session without returning the claim', async () => {
    const input = await seed('processing', true);
    await expect(requestBookingCancellation(input.booking._id, input.tenantId)).rejects.toThrow('CANCELLATION_PAYMENT_UNRESOLVED');
    await expectReserved(input);
  });

  it('keeps paid redemption consumed after a completed full-refund cancellation', async () => {
    const input = await seed('succeeded', true);
    await requestBookingCancellation(input.booking._id, input.tenantId);
    await finalizeBookingCancellation(input.booking._id, input.tenantId, [{ id: 're_release', paymentIntentId: 'pi_release', amount: 90000, status: 'succeeded',
      metadata: { [ATN_REFUND_FLOW_KEY]: ATN_CANCELLATION_REFUND_FLOW, bookingId: String(input.booking._id), tenantId: String(input.tenantId) } }]);
    expect((await PromoCode.findById(input.promo._id))?.usageCount).toBe(1);
    const booking = (await Booking.findById(input.booking._id))!;
    expect(booking.packagePromoClaim?.releasedAt).toBeUndefined();
    expect(booking.paymentStatus).toBe('refunded');
  });

  it('rolls back promo release if the terminal booking save fails', async () => {
    const input = await seed();
    jest.spyOn(Booking.prototype, 'save').mockRejectedValueOnce(new Error('Simulated persistence failure'));
    await expect(failCardBookingAndReleaseInventory(input.booking._id, input.tenantId)).rejects.toThrow('Simulated persistence failure');
    await expectReserved(input);
    expect((await Booking.findById(input.booking._id))?.status).toBe('pending');
  });

  it('rolls back promo release when inventory cannot be restored', async () => {
    const input = await seed();
    await Availability.updateOne({ attractionId: input.attractionId }, { $set: { allDayBooked: 0 } });
    await expect(failCardBookingAndReleaseInventory(input.booking._id, input.tenantId)).rejects.toThrow('INVENTORY_RELEASE_FAILED');
    expect((await PromoCode.findById(input.promo._id))?.usageCount).toBe(1);
    expect((await Booking.findById(input.booking._id))?.packagePromoClaim?.releasedAt).toBeUndefined();
  });

  it('does not release a different tenant booking or claim', async () => {
    const input = await seed();
    await expect(failCardBookingAndReleaseInventory(input.booking._id, new Types.ObjectId())).resolves.toBeNull();
    await expectReserved(input);
  });
});
