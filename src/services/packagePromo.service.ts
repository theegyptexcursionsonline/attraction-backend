import { createHash } from 'crypto';
import { ClientSession, Types } from 'mongoose';
import { PromoCode, IPromoCode } from '../models/PromoCode';
import { IBooking } from '../types';
import { evaluatePromo } from '../utils/discountCurrency';
import { PackageQuote } from './packagePricing.service';

export class PackagePromoError extends Error {
  constructor(public readonly code: 'PROMO_UNAVAILABLE' | 'PROMO_CHANGED', message: string) { super(message); }
}

const cents = (value: number): number => Math.round(value * 100);
const scopeOf = (promo: Pick<IPromoCode, 'tenantId'>) => promo.tenantId ? { tenantId: promo.tenantId } : { tenantId: null };
const termsOf = (promo: IPromoCode) => ({
  id: String(promo._id), tenantId: promo.tenantId ? String(promo.tenantId) : null,
  code: promo.code, currency: promo.currency, discountType: promo.discountType, discountValue: promo.discountValue,
  minOrderAmount: promo.minOrderAmount ?? 0, maxDiscount: promo.maxDiscount ?? null,
  validFrom: promo.validFrom.toISOString(), validUntil: promo.validUntil.toISOString(),
});

/** Read-only. Keeps the existing service fee; discounts only rooms/extras before that fee. */
export async function pricePackagePromo(quote: PackageQuote, code: string | undefined, tenantId: Types.ObjectId | undefined): Promise<IPromoCode | null> {
  if (!code) return null;
  if (!tenantId) throw new PackagePromoError('PROMO_UNAVAILABLE', 'Choose a website before applying a promo code.');
  const now = new Date();
  const promo = await PromoCode.findOne({
    code, $or: [{ tenantId }, { tenantId: null }], isActive: true,
    validFrom: { $lte: now }, validUntil: { $gte: now },
    $expr: { $lt: ['$usageCount', '$usageLimit'] },
  }).lean<IPromoCode>();
  if (!promo) throw new PackagePromoError('PROMO_UNAVAILABLE', 'This promo code is unavailable on this website. Remove it or use another code.');
  const evaluated = evaluatePromo(promo, { tourCurrency: quote.currency, subtotal: quote.subtotal });
  if (!evaluated.ok) throw new PackagePromoError('PROMO_UNAVAILABLE', evaluated.reason === 'currency'
    ? 'This promo code does not apply to this package currency.'
    : `This code needs a package subtotal of ${evaluated.currency} ${evaluated.minimum.toFixed(2)} before the service fee.`);
  const discount = Math.min(cents(quote.subtotal), Math.max(0, cents(evaluated.discount)));
  if (!Number.isSafeInteger(discount) || discount <= 0) throw new PackagePromoError('PROMO_UNAVAILABLE', 'This promo code does not reduce the price of this selection.');
  if (cents(quote.total) - discount <= 0) throw new PackagePromoError('PROMO_UNAVAILABLE', 'This code leaves no payable card amount. Remove it to continue.');
  quote.preDiscountTotal = quote.total;
  quote.discount = discount / 100;
  quote.total = (cents(quote.total) - discount) / 100;
  quote.perPerson = Math.round(cents(quote.total) / (quote.travellers.adults + quote.travellers.children)) / 100;
  quote.promotion = {
    code: promo.code, currency: quote.currency, discountType: promo.discountType, discountValue: promo.discountValue,
    minOrderAmount: promo.minOrderAmount ?? 0, ...(promo.maxDiscount != null ? { maxDiscount: promo.maxDiscount } : {}),
    discount: quote.discount,
  };
  quote.promotionHash = createHash('sha256').update(JSON.stringify([termsOf(promo), discount])).digest('hex').slice(0, 32);
  return promo;
}

/** Same terms and original tenant/global identity, with eligibility checked at claim time. */
export async function claimPackagePromo(promo: IPromoCode, quote: PackageQuote, session?: ClientSession): Promise<NonNullable<IBooking['packagePromoClaim']>> {
  const now = new Date();
  const claimed = await PromoCode.findOneAndUpdate({
    _id: promo._id, ...scopeOf(promo), code: promo.code, currency: promo.currency, isActive: true,
    validFrom: { $eq: promo.validFrom, $lte: now }, validUntil: { $eq: promo.validUntil, $gte: now },
    discountType: promo.discountType, discountValue: promo.discountValue,
    minOrderAmount: promo.minOrderAmount ?? 0, maxDiscount: promo.maxDiscount ?? null,
    $expr: { $lt: ['$usageCount', '$usageLimit'] },
  }, { $inc: { usageCount: 1 } }, { ...(session ? { session } : {}), new: true });
  if (!claimed) throw new PackagePromoError('PROMO_CHANGED', 'This promo code changed or its last use was taken. Review the price before booking.');
  return { promoId: promo._id as Types.ObjectId, code: promo.code, discount: quote.discount!, claimedAt: now };
}

/**
 * Called only inside the inventory-release transaction after payment reconciliation. Existing
 * tour redemptions have no marker and keep their historic behavior. The booking save and promo
 * decrement share the transaction, so concurrent expiry/cancel retries return a reservation once.
 */
export async function releaseUnpaidPackagePromo(booking: IBooking, session?: ClientSession): Promise<void> {
  const claim = booking.packagePromoClaim;
  if (!claim || claim.releasedAt || !booking.packageBooking || !['pending', 'processing', 'failed'].includes(booking.paymentStatus)) return;
  const options = session ? { session } : {};
  const released = await PromoCode.updateOne({ _id: claim.promoId, usageCount: { $gte: 1 } }, { $inc: { usageCount: -1 } }, options);
  if (released.matchedCount !== 1 && await PromoCode.exists({ _id: claim.promoId }).session(session ?? null)) {
    throw new Error('PACKAGE_PROMO_RELEASE_CONFLICT');
  }
  // A deleted promo no longer has capacity to restore; retain the release receipt on the booking.
  claim.releasedAt = new Date();
}
