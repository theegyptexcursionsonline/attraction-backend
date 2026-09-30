import type { PipelineStage } from 'mongoose';

/** The lowest bookable tour price in one currency, exactly as the tour is priced. */
export interface StartingPrice {
  currency: string;
  amount: number;
}

/**
 * A destination's "Starting from" price.
 *
 * Tour prices are compared only within their own currency: the backend holds no exchange rates, and
 * a converted number would be a price no site ever set. `priceFrom`/`priceCurrency` are therefore set
 * only when every priced tour here shares one currency (every live site today), so the number can
 * never be read in the wrong unit. When a destination mixes currencies (the network-wide marketplace,
 * or a site reselling another operator's tours) both are omitted and `startingPrices` carries the
 * lowest price per currency, for a client that converts with its own rates to find the cheapest.
 * Nothing priced → no price at all, never `0`.
 *
 * The code is `priceCurrency`, not `currency`: storefront designs already read a destination's
 * `currency` as its local-currency travel fact, which a tour's pricing currency is not.
 */
export interface DestinationStartingPrice {
  priceFrom?: number;
  priceCurrency?: string;
  startingPrices: StartingPrice[];
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * Aggregation stages that reduce the destination's matched tours to one row per currency holding that
 * currency's lowest price. Enquiry-only programmes are left out: their price is withheld everywhere
 * else on the storefront, so it must not surface here either. A missing, zero or non-numeric price is
 * "not priced", never "free".
 */
export const startingPriceStages = (): PipelineStage[] => [
  { $match: { enquiryOnly: { $ne: true }, priceFrom: { $gt: 0 } } },
  {
    $group: {
      _id: {
        $cond: [
          { $eq: [{ $type: '$currency' }, 'string'] },
          { $toUpper: { $trim: { input: '$currency' } } },
          null,
        ],
      },
      amount: { $min: '$priceFrom' },
    },
  },
];

/** Turns the `startingPriceStages` rows into the response fields; unusable rows are dropped, never guessed. */
export function toDestinationStartingPrice(
  rows: ReadonlyArray<{ _id?: unknown; amount?: unknown }>
): DestinationStartingPrice {
  const startingPrices = rows
    .filter((row): row is { _id: string; amount: number } =>
      typeof row._id === 'string'
      && CURRENCY_CODE.test(row._id)
      && typeof row.amount === 'number'
      && Number.isFinite(row.amount)
      && row.amount > 0)
    .map((row) => ({ currency: row._id, amount: row.amount }))
    .sort((a, b) => (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0));

  if (startingPrices.length === 1) {
    return { priceFrom: startingPrices[0].amount, priceCurrency: startingPrices[0].currency, startingPrices };
  }
  return { startingPrices };
}
