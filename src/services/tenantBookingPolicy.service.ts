import { AppError } from '../middleware/error.middleware';
import { Tenant } from '../models/Tenant';
import { ITenant } from '../types';

// Stable, reversible tenant policy. The closure is keyed by tenant slug, never
// by a deployment-specific ObjectId, custom domain, or mutable display name.
//
// king-of-egypt-tours is a protected preview: it shows published tours and
// prices, and the booking drawer works up to checkout, but no real booking is
// created until the owner opens the site. Opening it is removing this slug.
const BOOKING_CREATION_CLOSED_TENANT_SLUGS = [
  'makadi-horse-club',
  'king-of-egypt-tours',
  // The network queue's eight new sites (batch B09): seeded for the owner's review and closed to real bookings
  // until the owner approves and opens each one. Opening a site is removing its slug.
  'grand-egyptian-museum',
  'hurghada-boat-tour',
  'dive2egypt',
  'marsa-alam-red-sea-egypt',
  'wadi-el-gemal-reserve',
  'shaab-samadai',
  'bahria-oasis',
  'turtle-bay-hurghada',
  // The network queue's ten monument sites (batch B10): closed to real bookings until each domain is connected
  // and the owner opens it. Opening a site is removing its slug.
  'great-sphinx-of-giza',
  'pyramid-complex-giza',
  'great-pyramid-of-cheops',
  'mit-rahina-museum',
  'sakkara-pyramids',
  'pyramid-of-khafre',
  'pyramid-of-menkaure',
  'pyramids-of-dahshur',
  'statue-of-ramesses-ii',
  'three-pools-dahab',
  // The network queue's batch B11: closed to real bookings until each domain is connected and the owner opens it.
  // Opening a site is removing its slug. The first six are the new sites; the rest already existed and none of
  // them has a payment gateway or a booking inbox, so they are closed here too rather than left open while their
  // catalogue is worked on. `makadi-bay-safari` is kept closed although it has been dropped from batch B11: it has
  // been inactive since May, awaiting deduplication with `makadi-bay-safari-center`, so fail-closed is right and
  // removing the slug would be the only change this work makes to a site that must stay exactly as it is.
  'saqqara-necropolis',
  'pyramid-of-djoser',
  'red-pyramid-egypt',
  'sphinx-of-memphis',
  'samadai-beach',
  'hurghada-speedboat',
  'makadi-bay-safari',
  'cairo-tour-from-hurghada',
  'luxor-tour-from-hurghada',
  'hurghada-snorkeling',
  'cairo-night-cruise',
  // The network queue's batch B12: nine monuments of the Saqqara necropolis and its neighbours, and one
  // mangrove shore inside Ras Mohamed National Park. Each is closed to real bookings until its domain is
  // connected and the owner opens it; opening a site is removing its slug.
  'imhotep-museum',
  'serapeum-of-saqqara',
  'pyramid-of-teti',
  'pyramid-of-unas',
  'pyramid-of-userkaf',
  'tomb-of-nefer',
  'buried-pyramid',
  'pyramid-of-pepi-ii',
  'pyramid-of-sahure',
  'mangrove-forest-egypt',
] as const;

export class TenantBookingCreationClosedError extends AppError {
  readonly code = 'TENANT_BOOKING_CREATION_CLOSED';

  constructor() {
    super('Bookings are temporarily unavailable for this site', 503);
  }
}

export const isTenantBookingCreationClosed = (
  tenant?: Pick<ITenant, 'slug'> | null
): boolean => !!tenant && BOOKING_CREATION_CLOSED_TENANT_SLUGS.includes(
  tenant.slug as (typeof BOOKING_CREATION_CLOSED_TENANT_SLUGS)[number]
);

export const assertTenantBookingCreationAllowed = (
  tenant?: Pick<ITenant, 'slug'> | null
): void => {
  if (isTenantBookingCreationClosed(tenant)) {
    throw new TenantBookingCreationClosedError();
  }
};

/**
 * Enforce the same slug policy when a create path has only tenant ObjectIds.
 * A database/query failure propagates and therefore fails closed.
 */
export const assertTenantIdsBookingCreationAllowed = async (
  tenantIds: Array<unknown>
): Promise<void> => {
  const ids = [...new Set(tenantIds.filter(Boolean).map(String))];
  if (ids.length === 0) return;

  // Keep this as a plain model query so it composes with the repository's
  // transaction/controller test doubles as well as a real Mongoose Query.
  const closedTenant = await Tenant.findOne({
    _id: { $in: ids },
    slug: { $in: BOOKING_CREATION_CLOSED_TENANT_SLUGS },
  });

  // Re-check the stable identity in process as defence in depth; callers and
  // test doubles must never be able to turn an arbitrary matched tenant into a
  // portfolio-wide shutdown.
  assertTenantBookingCreationAllowed(closedTenant);
};

/**
 * Read the resolved booking site's current policy, never a body flag or an
 * earlier tenant snapshot. Missing legacy flags retain offline checkout; a
 * query failure propagates. A disabled card gateway cannot permit an offline
 * fallback on a site which requires card payment.
 *
 * Call only for a new booking, after completed idempotent receipt replays and
 * before inventory, promotion or booking writes.
 */
export const assertTenantPaymentMethodAllowed = async (
  tenantId: unknown,
  paymentMethod: unknown
): Promise<void> => {
  if (paymentMethod === 'card') return;
  const cardOnlyTenant = await Tenant.findOne({
    _id: tenantId,
    'paymentSettings.allowPayAtLocation': false,
  });
  if (cardOnlyTenant?.paymentSettings?.allowPayAtLocation === false) {
    throw new AppError('Pay at location is not available for this site. Please pay by card.', 409);
  }
};
