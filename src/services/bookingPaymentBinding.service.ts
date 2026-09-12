import { Booking } from '../models/Booking';
import { IBooking } from '../types';
import { claimTenantStripePaymentBinding, stripeCredentialMode, TenantStripeConfig } from './tenantPayment.service';
import { runBundleTransaction } from './bundleInventory.service';
import { standaloneBookingClause } from './bookingRecordScope.service';

export class BookingPaymentBindingConflict extends Error {}

export const bookingStripeContextMatches = (
  booking: Pick<IBooking, 'stripePaymentBinding'>,
  config: TenantStripeConfig,
): boolean => !booking.stripePaymentBinding || (
  booking.stripePaymentBinding.accountId === config.verifiedAccountId &&
  booking.stripePaymentBinding.mode === stripeCredentialMode(config)
);

/** Fence the account before the network call, including crashes before intent persistence. */
export const claimBookingStripePaymentSession = async (
  booking: Pick<IBooking, '_id' | 'tenantId' | 'stripePaymentBinding' | 'stripePaymentSessionClaimedAt'>,
  config: TenantStripeConfig,
): Promise<void> => {
  if (!bookingStripeContextMatches(booking, config)) throw new BookingPaymentBindingConflict('Payment account changed');
  if (booking.stripePaymentSessionClaimedAt) return;
  const mode = stripeCredentialMode(config);
  if (!config.verifiedAccountId || !['test', 'live'].includes(mode)) throw new BookingPaymentBindingConflict('Payment account is not verified');
  await runBundleTransaction(async session => {
    if (!await claimTenantStripePaymentBinding(booking.tenantId, config, session)) {
      throw new BookingPaymentBindingConflict('Payment configuration changed; retry');
    }
    const claimed = await Booking.findOneAndUpdate({
      _id: booking._id, tenantId: booking.tenantId, ...standaloneBookingClause,
      paymentMethod: 'card', status: 'pending', inventoryReleasedAt: { $exists: false },
      paymentStatus: { $in: ['pending', 'failed'] },
      stripePaymentSessionClaimedAt: { $exists: false },
      $or: [{ stripePaymentIntentId: { $exists: false } }, { stripePaymentIntentId: null }, { stripePaymentIntentId: '' }],
    }, { $set: {
      stripePaymentSessionClaimedAt: new Date(),
      stripePaymentBinding: { accountId: config.verifiedAccountId, mode },
    } }, { new: true, session });
    if (!claimed) throw new BookingPaymentBindingConflict('Payment session changed; retry');
    return true;
  });
};

/** One request tuple for initial creation and crash recovery. */
export const bookingStripePaymentRequest = (booking: Pick<IBooking, '_id' | 'total' | 'currency'>) => {
  const amount = Math.round(booking.total * 100);
  const currency = booking.currency.toLowerCase();
  return { amount, currency, idempotencyKey: `booking:${booking._id}:payment:${amount}:${currency}` };
};
