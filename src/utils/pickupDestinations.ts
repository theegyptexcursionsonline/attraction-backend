// A site can serve areas it has no departures in by collecting guests from their hotels
// (for example Royal Cruise sails from Hurghada and picks up in Makadi Bay or El Gouna).
// Those areas are listed as destinations whose tours are the site's hotel-pickup tours.

export const PICKUP_DESTINATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_PICKUP_DESTINATIONS = 12;

/**
 * Storefront designs that show pickup areas ("Hotel pickup available") and open them by
 * pickup. Every other design lists destinations by departure city, so a pickup area there
 * would open onto an empty page; for those sites a stored list stays dormant.
 */
export const PICKUP_AREA_DESIGN_MODES: ReadonlySet<string> = new Set(['nautical']);

export function supportsPickupAreas(tenant: unknown): boolean {
  const designMode = (tenant as { designMode?: unknown } | null | undefined)?.designMode;
  return typeof designMode === 'string' && PICKUP_AREA_DESIGN_MODES.has(designMode);
}

/** Trimmed, lowercased, de-duplicated, well-formed slugs, capped at the maximum. */
export function normalizePickupDestinationSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const slugs = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => PICKUP_DESTINATION_SLUG_PATTERN.test(item));
  return [...new Set(slugs)].slice(0, MAX_PICKUP_DESTINATIONS);
}

/** The pickup areas that are in effect for this site: none unless its design shows them. */
export function tenantPickupDestinationSlugs(tenant: unknown): string[] {
  if (!supportsPickupAreas(tenant)) return [];
  return normalizePickupDestinationSlugs((tenant as { pickupDestinationSlugs?: unknown }).pickupDestinationSlugs);
}

export function isValidPickupDestinationList(value: unknown): boolean {
  return Array.isArray(value)
    && value.length <= MAX_PICKUP_DESTINATIONS
    && value.every((slug) => typeof slug === 'string' && PICKUP_DESTINATION_SLUG_PATTERN.test(slug.trim().toLowerCase()));
}
