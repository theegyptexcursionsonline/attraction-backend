import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';

/**
 * Currency rules for promo codes and special offers (PLATFORM #1046).
 *
 * A discount amount is money, and money only means something in its own
 * currency. Nothing here converts between currencies:
 *   - a fixed special offer carries the currency of its tour and applies only
 *     while the tour is still priced in it; a percentage offer applies in any
 *     currency and stores none;
 *   - a promo code carries the currency its fixed amount, minimum order and
 *     maximum discount are written in, and applies only to tours priced in it.
 * Checkout, the cart preview and the public offer reads all use these helpers,
 * so a discount the storefront shows is the discount the booking gets.
 */

const CURRENCY_CODE = /^[A-Z]{3}$/;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Upper-case three-letter code, or null when the value is not one. Never guesses. */
export const normalizeCurrencyCode = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return CURRENCY_CODE.test(code) ? code : null;
};

export type DiscountType = 'percentage' | 'fixed';

export interface OfferTerms {
  _id?: unknown;
  discountType: DiscountType;
  discountValue: number;
  currency?: string | null;
}

/** True when the offer may discount a booking priced in `tourCurrency`. */
export const offerAppliesToCurrency = (offer: Pick<OfferTerms, 'discountType' | 'currency'>, tourCurrency: unknown): boolean => {
  if (offer.discountType === 'percentage') return true;
  const tour = normalizeCurrencyCode(tourCurrency);
  return offer.discountType === 'fixed' && tour !== null && normalizeCurrencyCode(offer.currency) === tour;
};

/**
 * Query clause for the offers that may apply to a tour priced in `tourCurrency`.
 * A tour without a valid currency can only take percentage offers.
 */
export const applicableOfferClause = (tourCurrency: unknown): Record<string, unknown> => {
  const tour = normalizeCurrencyCode(tourCurrency);
  return tour
    ? { $or: [{ discountType: 'percentage' }, { discountType: 'fixed', currency: tour }] }
    : { discountType: 'percentage' };
};

/**
 * Which offer a tour shows and checkout applies, when several are live: the
 * largest discount value, then the oldest offer. Public reads and checkout sort
 * the same way so the storefront and the booking agree.
 */
export const OFFER_PRIORITY_SORT = { discountValue: -1, _id: 1 } as const;

export const offerDiscountFor = (offer: Pick<OfferTerms, 'discountType' | 'discountValue'>, subtotal: number): number =>
  offer.discountType === 'percentage'
    ? round2(subtotal * (offer.discountValue / 100))
    : offer.discountValue;

// Matches no document: a fixed amount without a valid tour currency is never claimable.
const NO_CURRENCY_MATCH = { $in: [] as string[] };

/**
 * Claim filter for an offer priced by checkout: the claim succeeds only if the
 * offer still carries the exact terms the booking was priced with.
 */
export const offerClaimFilter = (offer: OfferTerms, tourCurrency: unknown, now: Date): Record<string, unknown> => ({
  _id: offer._id,
  isActive: true,
  validFrom: { $lte: now },
  validUntil: { $gte: now },
  $expr: { $lt: ['$usageCount', '$usageLimit'] },
  discountType: offer.discountType,
  discountValue: offer.discountValue,
  ...(offer.discountType === 'fixed' ? { currency: normalizeCurrencyCode(tourCurrency) ?? NO_CURRENCY_MATCH } : {}),
});

export interface PromoTerms {
  _id?: unknown;
  code?: string;
  discountType: DiscountType;
  discountValue: number;
  currency?: string | null;
  minOrderAmount?: number | null;
  maxDiscount?: number | null;
}

export type PromoEvaluation =
  | { ok: true; discount: number; currency: string; maxDiscount?: number }
  | { ok: false; reason: 'currency'; promoCurrency: string | null; tourCurrency: string | null }
  | { ok: false; reason: 'minimum'; minimum: number; currency: string };

/** A positive cap, or undefined when the code has none. */
export const effectiveMaxDiscount = (maxDiscount: unknown): number | undefined =>
  typeof maxDiscount === 'number' && Number.isFinite(maxDiscount) && maxDiscount > 0 ? maxDiscount : undefined;

/**
 * One rule for the cart preview and checkout. The code's fixed amount, minimum
 * order and maximum discount are written in the code's currency, so it applies
 * only to a tour priced in that currency.
 */
export const evaluatePromo = (
  promo: PromoTerms,
  context: { tourCurrency: unknown; subtotal: number }
): PromoEvaluation => {
  const promoCurrency = normalizeCurrencyCode(promo.currency);
  const tourCurrency = normalizeCurrencyCode(context.tourCurrency);
  if (!promoCurrency || !tourCurrency || promoCurrency !== tourCurrency) {
    return { ok: false, reason: 'currency', promoCurrency, tourCurrency };
  }
  const minimum = typeof promo.minOrderAmount === 'number' && Number.isFinite(promo.minOrderAmount) ? promo.minOrderAmount : 0;
  if (context.subtotal < minimum) return { ok: false, reason: 'minimum', minimum, currency: promoCurrency };
  const maxDiscount = effectiveMaxDiscount(promo.maxDiscount);
  let discount = promo.discountType === 'percentage'
    ? round2(context.subtotal * (promo.discountValue / 100))
    : promo.discountValue;
  if (maxDiscount !== undefined) discount = Math.min(discount, maxDiscount);
  return { ok: true, discount, currency: promoCurrency, ...(maxDiscount !== undefined ? { maxDiscount } : {}) };
};

/** Claim filter for a promo priced by checkout: same terms, same currency, still eligible. */
export const promoClaimFilter = (promo: PromoTerms, tourCurrency: unknown, subtotal: number, now: Date): Record<string, unknown> => ({
  _id: promo._id,
  currency: normalizeCurrencyCode(tourCurrency) ?? NO_CURRENCY_MATCH,
  isActive: true,
  validFrom: { $lte: now },
  validUntil: { $gte: now },
  $expr: { $lt: ['$usageCount', '$usageLimit'] },
  discountType: promo.discountType,
  discountValue: promo.discountValue,
  minOrderAmount: { $lte: subtotal },
  // `null` also matches a code that has no cap at all.
  maxDiscount: promo.maxDiscount ?? null,
});

/** Customer wording for a code refused on currency. */
export const promoCurrencyMessage = (promoCurrency: string | null): string =>
  promoCurrency
    ? `This promo code applies only to bookings priced in ${promoCurrency}`
    : 'This promo code has no currency set, so it cannot be used yet';

const toObjectId = (value: unknown): Types.ObjectId | null => {
  const id = String(value ?? '');
  return Types.ObjectId.isValid(id) && /^[a-f0-9]{24}$/i.test(id) ? new Types.ObjectId(id) : null;
};

const sortedUnique = (codes: Array<string | null>): string[] =>
  [...new Set(codes.filter((code): code is string => code !== null))].sort();

/**
 * Currencies a site sells in: its default currency plus the currency of every
 * tour it lists that is not archived. Empty when the site does not exist.
 */
export const siteSaleCurrencies = async (tenantId: unknown): Promise<string[]> => {
  const id = toObjectId(tenantId);
  if (!id) return [];
  const tenant = await Tenant.findById(id).select('defaultCurrency').lean();
  if (!tenant) return [];
  const tourCurrencies = await Attraction.distinct('currency', { tenantIds: id, status: { $ne: 'archived' } });
  return sortedUnique([normalizeCurrencyCode(tenant.defaultCurrency), ...tourCurrencies.map(normalizeCurrencyCode)]);
};

/** Currencies any site on the platform sells in (for codes valid on every site). */
export const platformSaleCurrencies = async (): Promise<string[]> => {
  const [tourCurrencies, siteCurrencies] = await Promise.all([
    Attraction.distinct('currency', { status: { $ne: 'archived' } }),
    Tenant.distinct('defaultCurrency', { status: { $in: ['active', 'coming_soon'] } }),
  ]);
  return sortedUnique([...tourCurrencies, ...siteCurrencies].map(normalizeCurrencyCode));
};

/** Sale currencies per site, for annotating a page of promo codes in one read. */
export const saleCurrenciesBySite = async (tenantIds: unknown[]): Promise<Map<string, string[]>> => {
  const ids = [...new Set(tenantIds.map((value) => toObjectId(value)?.toHexString()).filter((id): id is string => !!id))]
    .map((id) => new Types.ObjectId(id));
  const result = new Map<string, string[]>();
  if (!ids.length) return result;
  const [tenants, tours] = await Promise.all([
    Tenant.find({ _id: { $in: ids } }).select('defaultCurrency').lean(),
    Attraction.aggregate<{ _id: Types.ObjectId; currencies: string[] }>([
      { $match: { tenantIds: { $in: ids }, status: { $ne: 'archived' } } },
      { $unwind: '$tenantIds' },
      { $match: { tenantIds: { $in: ids } } },
      { $group: { _id: '$tenantIds', currencies: { $addToSet: '$currency' } } },
    ]),
  ]);
  const toursBySite = new Map(tours.map((row) => [String(row._id), row.currencies]));
  for (const tenant of tenants) {
    const id = String(tenant._id);
    result.set(id, sortedUnique([
      normalizeCurrencyCode(tenant.defaultCurrency),
      ...(toursBySite.get(id) || []).map(normalizeCurrencyCode),
    ]));
  }
  return result;
};
