import type { AddonPricingType } from '../types';

/**
 * Server-authoritative add-on pricing for a booking line.
 *
 * The storefront sends `{ id, name, price, quantity }` per add-on; only `id`
 * and `quantity` are trusted. Name, unit price and pricing type always come
 * from the attraction's add-on catalogue, so a tampered client price can never
 * change what is charged.
 *
 *  - `per_unit`   → charged once per booking line: quantity must be exactly 1.
 *  - `per_person` → charged per participant: quantity ≤ adults + children + infants.
 *
 * Duplicate ids in a request are merged (quantities summed) BEFORE the rules
 * run, so sending the same per_unit add-on twice is rejected rather than
 * double-charged. Unknown ids fail closed: silently dropping a requested line
 * would let the browser show one basket while the server stores another.
 */

export interface CatalogAddon {
  id: string;
  name: string;
  price: number;
  pricingType?: AddonPricingType | string;
  pricingModel?: 'per-person' | 'per-booking' | string;
}

export interface RequestedAddon {
  id: string;
  name?: string;
  price?: number;
  quantity?: number;
}

export interface BookedAddon {
  id: string;
  name: string;
  /** Catalogue unit price at booking time. */
  price: number;
  quantity: number;
  pricingType: AddonPricingType;
  /** Rolling-deployment alias retained for existing booking consumers. */
  pricingModel: 'per-person' | 'per-booking';
  totalPrice: number;
}

export class AddonSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AddonSelectionError';
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const resolveAddonPricingType = (
  pricingType: unknown,
  pricingModel?: unknown,
): AddonPricingType =>
  pricingType === 'per_person' || pricingModel === 'per-person' ? 'per_person' : 'per_unit';

/** Quantity of a stored add-on; legacy bookings written before `quantity` existed mean 1. */
type StoredAddonLike = { price?: number | null; quantity?: number | null } | null | undefined;

export const addonQuantity = (addon: StoredAddonLike): number => {
  const quantity = Number(addon?.quantity);
  return Number.isInteger(quantity) && quantity >= 1 ? quantity : 1;
};

/** `price × quantity` for a stored add-on, tolerant of legacy records. */
export const addonLineTotal = (addon: StoredAddonLike): number =>
  round2((Number(addon?.price) || 0) * addonQuantity(addon));

export const addonsTotal = (addons: Array<{ price?: number | null; quantity?: number | null }> | null | undefined): number =>
  round2((addons || []).reduce((sum, addon) => sum + addonLineTotal(addon), 0));

export const normalizeBookingAddons = ({
  catalog,
  requested,
  participants,
}: {
  catalog: CatalogAddon[] | null | undefined;
  requested: RequestedAddon[] | null | undefined;
  /** adults + children + infants on the booking line. */
  participants: number;
}): BookedAddon[] => {
  if (!requested?.length) return [];

  // Merge duplicates by id, preserving first-seen order.
  const merged = new Map<string, number>();
  for (const addon of requested) {
    if (!addon?.id) continue;
    const quantity = Number.isInteger(addon.quantity) && (addon.quantity as number) >= 1
      ? (addon.quantity as number)
      : 1;
    merged.set(addon.id, (merged.get(addon.id) || 0) + quantity);
  }

  const booked: BookedAddon[] = [];
  for (const [id, quantity] of merged) {
    const catalogAddon = (catalog || []).find((candidate) => candidate.id === id);
    if (!catalogAddon) {
      throw new AddonSelectionError('A selected add-on is no longer available');
    }
    const pricingType = resolveAddonPricingType(catalogAddon.pricingType, catalogAddon.pricingModel);
    const name = catalogAddon.name;

    if (pricingType === 'per_unit' && quantity !== 1) {
      throw new AddonSelectionError(`Add-on "${name}" can only be added once`);
    }
    if (pricingType === 'per_person' && quantity > participants) {
      throw new AddonSelectionError(
        `Add-on "${name}" can be added for at most ${participants} participant${participants === 1 ? '' : 's'}`
      );
    }

    const price = round2(Number(catalogAddon.price) || 0);
    booked.push({
      id,
      name,
      price,
      quantity,
      pricingType,
      pricingModel: pricingType === 'per_person' ? 'per-person' : 'per-booking',
      totalPrice: round2(price * quantity),
    });
  }
  return booked;
};
