import { Booking } from '../models/Booking';
import { claimTenantStripePaymentBinding } from '../services/tenantPayment.service';
import { claimBookingStripePaymentSession, bookingStripeContextMatches, BookingPaymentBindingConflict } from '../services/bookingPaymentBinding.service';

const session = { transaction: 'payment-binding' };
jest.mock('../models/Booking', () => ({ Booking: { findOneAndUpdate: jest.fn() } }));
jest.mock('../services/tenantPayment.service', () => ({
  ...jest.requireActual('../services/tenantPayment.service'),
  claimTenantStripePaymentBinding: jest.fn(),
}));
jest.mock('../services/bundleInventory.service', () => ({ runBundleTransaction: jest.fn((work) => work(session)) }));
const config = { enabled: true, publishableKey: 'pk_test_public', secretKey: 'rk_test_restricted', webhookSecret: 'whsec_saved', verifiedAccountId: 'acct_current', verifiedCredentialFingerprint: 'verified', configRevision: 5, bindingFenceRevision: 2 };
const booking = { _id: 'booking-1', tenantId: 'tenant-1' } as unknown as Parameters<typeof claimBookingStripePaymentSession>[0];
beforeEach(() => {
  jest.clearAllMocks();
  (claimTenantStripePaymentBinding as jest.Mock).mockResolvedValue(true);
  (Booking.findOneAndUpdate as jest.Mock).mockResolvedValue({ ...booking });
});
it('claims gateway and durable booking marker in the same transaction before provider creation', async () => {
  await claimBookingStripePaymentSession(booking, config);
  expect(claimTenantStripePaymentBinding).toHaveBeenCalledWith('tenant-1', config, session);
  expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({
    _id: 'booking-1', tenantId: 'tenant-1', bundleOrderId: { $exists: false }, status: 'pending', inventoryReleasedAt: { $exists: false }, stripePaymentSessionClaimedAt: { $exists: false },
  }), { $set: { stripePaymentSessionClaimedAt: expect.any(Date), stripePaymentBinding: { accountId: 'acct_current', mode: 'test' } } }, { new: true, session });
});
it('does not claim a booking after a concurrent gateway save wins the fence', async () => {
  (claimTenantStripePaymentBinding as jest.Mock).mockResolvedValue(false);
  await expect(claimBookingStripePaymentSession(booking, config)).rejects.toBeInstanceOf(BookingPaymentBindingConflict);
  expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
});
it('aborts the transaction if expiry or another request wins the booking claim', async () => {
  (Booking.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
  await expect(claimBookingStripePaymentSession(booking, config)).rejects.toBeInstanceOf(BookingPaymentBindingConflict);
});
it('resumes the same-account/mode claim after API key rotation without creating another marker', async () => {
  await claimBookingStripePaymentSession({ ...booking, stripePaymentSessionClaimedAt: new Date(), stripePaymentBinding: { accountId: 'acct_current', mode: 'test' } }, { ...config, secretKey: 'rk_test_rotated' });
  expect(claimTenantStripePaymentBinding).not.toHaveBeenCalled();
});
it.each([
  { ...config, verifiedAccountId: 'acct_other' },
  { ...config, publishableKey: 'pk_live_public', secretKey: 'rk_live_secret' },
])('rejects recovery with a different account or mode', async changedConfig => {
  const bound = { ...booking, stripePaymentSessionClaimedAt: new Date(), stripePaymentBinding: { accountId: 'acct_current', mode: 'test' as const } };
  expect(bookingStripeContextMatches(bound, changedConfig)).toBe(false);
  await expect(claimBookingStripePaymentSession(bound, changedConfig)).rejects.toBeInstanceOf(BookingPaymentBindingConflict);
  expect(claimTenantStripePaymentBinding).not.toHaveBeenCalled();
});
it('fails closed before claiming for unverified credentials', async () => {
  await expect(claimBookingStripePaymentSession(booking, { ...config, verifiedAccountId: undefined })).rejects.toBeInstanceOf(BookingPaymentBindingConflict);
  expect(claimTenantStripePaymentBinding).not.toHaveBeenCalled();
});
