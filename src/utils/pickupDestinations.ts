// A site can serve areas it has no departures in by collecting guests from their hotels
// (for example Royal Cruise sails from Hurghada and picks up in Makadi Bay or El Gouna).
// Those areas are listed as destinations whose tours are the site's hotel-pickup tours.

export const PICKUP_DESTINATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_PICKUP_DESTINATIONS = 12;

export function tenantPickupDestinationSlugs(tenant: unknown): string[] {
  const raw = (tenant as { pickupDestinationSlugs?: unknown } | null | undefined)?.pickupDestinationSlugs;
  if (!Array.isArray(raw)) return [];
  const slugs = raw
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => PICKUP_DESTINATION_SLUG_PATTERN.test(value));
  return [...new Set(slugs)].slice(0, MAX_PICKUP_DESTINATIONS);
}

export function isValidPickupDestinationList(value: unknown): boolean {
  return Array.isArray(value)
    && value.length <= MAX_PICKUP_DESTINATIONS
    && value.every((slug) => typeof slug === 'string' && PICKUP_DESTINATION_SLUG_PATTERN.test(slug.trim().toLowerCase()));
}
