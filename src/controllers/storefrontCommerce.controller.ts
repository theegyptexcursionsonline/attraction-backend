import crypto from 'crypto';
import { Response, NextFunction } from 'express';
import { Booking } from '../models/Booking';
import { Attraction } from '../models/Attraction';
import { StorefrontPurchase } from '../models/StorefrontPurchase';
import { AuthRequest, IBooking } from '../types';
import { sendError, sendSuccess } from '../utils/response';
import { verifyBookingAccessToken } from '../utils/bookingAccess';
import { standaloneBookingClause } from '../services/bookingRecordScope.service';
import { commerceSelection } from '../services/storefrontCommerce.service';
import { priceBookingSelection } from '../services/bookingPricing.service';
import { bookingEligibility, resolveBookingTimeZone } from '../utils/bookingCutoff';
import { assertTenantIdsBookingCreationAllowed } from '../services/tenantBookingPolicy.service';
import { minimumTourPrice } from '../utils/attractionPricing';
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export async function getCommerceItem(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant || !/^[a-f0-9]{24}$/i.test(req.params.id)) { sendError(res, 'Site not found', 404); return; }
    const item = await Attraction.findOne({ _id: req.params.id, tenantIds: req.tenant._id, status: 'active', enquiryOnly: { $ne: true } });
    if (!item) { sendError(res, 'Experience not found', 404); return; }
    const price = minimumTourPrice(item.pricingOptions);
    if (!(price > 0)) { sendError(res, 'Price unavailable', 409); return; }
    sendSuccess(res, { tenantId: String(req.tenant._id), event: 'view_item', currency: item.currency.toUpperCase(), value: price,
      items: [{ item_id: String(item._id), price, quantity: 1 }] });
  } catch (error) { next(error); }
}

export async function quoteCommerceCheckout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.tenant) { sendError(res, 'Site not found', 404); return; }
    const { attractionId, items, promoCode } = req.body;
    const attraction = await Attraction.findOne({ _id: attractionId, tenantIds: req.tenant._id, status: 'active', enquiryOnly: { $ne: true } });
    if (!attraction) { sendError(res, 'Experience not found', 404); return; }
    await assertTenantIdsBookingCreationAllowed([req.tenant._id]);
    const price = await priceBookingSelection(attraction, req.tenant, items, promoCode);
    if (price.temporalChecks.some(check => !bookingEligibility({ ...check, timeZone: resolveBookingTimeZone(req.tenant?.timezone) }).eligible)) {
      sendError(res, 'Departure is no longer available', 409); return;
    }
    sendSuccess(res, commerceSelection({ tenantId: req.tenant._id, attractionId: attraction._id, items: price.normalizedItems,
      subtotal: price.subtotal, fees: price.fees, discount: price.discount, total: price.total, currency: attraction.currency }, 'begin_checkout'));
  } catch (error) {
    if (error instanceof Error && /^(INVALID_|PARTICIPANT_LIMIT|MISSING_TENANT|COMMERCE_)/.test(error.message)) { sendError(res, 'Checkout selection is invalid', 400); return; }
    next(error);
  }
}

async function authorizedPurchase(req: AuthRequest): Promise<IBooking | null> {
  if (!req.tenant) return null;
  const booking = await Booking.findOne({ ...standaloneBookingClause, reference: req.params.reference, tenantId: req.tenant._id });
  if (!booking) return null;
  const token = req.headers['x-booking-access-token'];
  // Admin inspection is not a customer purchase. Only its owner/capability may emit.
  const owner = req.user?.role === 'customer' && String(booking.userId) === String(req.user._id);
  if (!owner && !(typeof token === 'string' && verifyBookingAccessToken(token, String(booking._id), booking.reference))) return null;
  if (booking.paymentMethod !== 'card' || booking.paymentStatus !== 'succeeded' || !['confirmed', 'completed'].includes(booking.status)
    || !booking.stripePaymentIntentId || (booking.refundedAmount || 0) > 0 || booking.inventoryReleasedAt) return null;
  return booking;
}
export async function claimCommercePurchase(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.body.consent !== true) { sendError(res, 'Optional tracking consent is required', 400); return; }
    const booking = await authorizedPurchase(req);
    if (!booking) { sendError(res, 'Paid receipt unavailable', 404); return; }
    const event = commerceSelection(booking, 'purchase', String(booking._id));
    const token = crypto.randomBytes(24).toString('hex');
    const now = new Date();
    let claimed;
    try {
      claimed = await StorefrontPurchase.findOneAndUpdate({ _id: event.transaction_id, tenantId: booking.tenantId, bookingId: booking._id,
        status: { $ne: 'dispatched' }, leaseUntil: { $lte: now } },
      { $set: { status: 'claimed', claimTokenHash: hash(token), leaseUntil: new Date(now.getTime() + 120_000), transactionId: event.transaction_id } }, { new: true, upsert: true });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    // A concurrent tab or completed dispatch owns this transaction. Do not emit again.
    sendSuccess(res, claimed ? { event, claimToken: token } : { event: null });
  } catch (error) { next(error); }
}
export async function acknowledgeCommercePurchase(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const booking = await authorizedPurchase(req);
    if (!booking) { sendError(res, 'Paid receipt unavailable', 404); return; }
    const result = await StorefrontPurchase.updateOne({ tenantId: booking.tenantId, bookingId: booking._id,
      claimTokenHash: hash(req.body.claimToken), status: 'claimed', leaseUntil: { $gt: new Date() } },
    { $set: { status: 'dispatched', dispatchedAt: new Date() } });
    if (!result.modifiedCount) { sendError(res, 'Receipt claim expired or already completed', 409); return; }
    sendSuccess(res, { dispatched: true });
  } catch (error) { next(error); }
}
