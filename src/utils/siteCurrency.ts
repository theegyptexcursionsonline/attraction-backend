import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { normalizeCurrencyCode } from './discountCurrency';

/**
 * One base currency per site (client decision, 10 Oct 2026). Every tour on a site is priced, sold and
 * reported in the site's `defaultCurrency`: tours priced in other currencies made a site's fees, payouts
 * and totals disagree. Creating, publishing and moving tours, the marketplace, the site's own currency
 * change and every checkout (tours, packages, partner API) ask this module. Nothing is converted.
 */
export interface SiteCurrency { id: string; name: string; currency: string }

const DEFAULT_SITE_CURRENCY = 'USD';

export const siteCurrencies = async (siteIds: readonly unknown[]): Promise<SiteCurrency[]> => {
  const ids = [...new Set(siteIds.map((id) => String(id)))].filter((id) => Types.ObjectId.isValid(id));
  if (ids.length === 0) return [];
  const sites = await Tenant.find({ _id: { $in: ids } }).select('name defaultCurrency').lean();
  return sites.map((site) => ({
    id: String(site._id),
    name: site.name,
    currency: normalizeCurrencyCode(site.defaultCurrency) ?? DEFAULT_SITE_CURRENCY,
  }));
};

/** Why a tour priced in `currency` cannot be on these sites, or null when it can. */
export const tourCurrencyProblem = (currency: unknown, sites: readonly SiteCurrency[]): string | null => {
  if (sites.length === 0) return null;
  const siteCodes = [...new Set(sites.map((site) => site.currency))];
  if (siteCodes.length > 1) {
    const listed = sites.map((site) => `${site.name}: ${site.currency}`).join(', ');
    return `These sites sell in different currencies (${listed}). A tour can only be on sites that sell in the same currency.`;
  }
  const [siteCode] = siteCodes;
  if (normalizeCurrencyCode(currency) === siteCode) return null;
  const who = sites.length === 1 ? sites[0].name : 'These sites';
  return `${who} ${sites.length === 1 ? 'sells' : 'sell'} in ${siteCode}, so this tour must be priced in ${siteCode}.`;
};

/**
 * Checkout's last line of defence: a site sells only tours priced in its own currency. An older tour
 * that does not match is refused until it is re-priced, never charged in a currency the site does not use.
 */
export const soldInSiteCurrency = (currency: unknown, site: { defaultCurrency?: unknown } | null | undefined): boolean =>
  !site || normalizeCurrencyCode(currency) === (normalizeCurrencyCode(site.defaultCurrency) ?? DEFAULT_SITE_CURRENCY);

export const NOT_SOLD_IN_SITE_CURRENCY = 'This experience cannot be booked on this website right now. Please contact us to book it.';

/** Case-insensitive exact match for a stored tour currency (older records may not be upper-cased). */
export const currencyMatch = (code: string) => {
  const normalized = normalizeCurrencyCode(code);
  if (!normalized) throw new Error(`Invalid currency code: ${code}`);
  return new RegExp(`^\\s*${normalized}\\s*$`, 'i');
};

/**
 * Whether a site may move to `nextCurrency`: only when no tour on it (archived and trashed included, since
 * either can come back) is priced in another currency. Prices are never converted automatically.
 */
export const siteCurrencyChangeProblem = async (siteId: unknown, nextCurrency: string): Promise<string | null> => {
  const others = await Attraction.countDocuments({ tenantIds: siteId, currency: { $not: currencyMatch(nextCurrency) } });
  if (others === 0) return null;
  return `${others} tour${others === 1 ? ' on this site is' : 's on this site are'} priced in another currency. `
    + `A site's currency can change only when every tour on it is priced in ${nextCurrency}.`;
};
