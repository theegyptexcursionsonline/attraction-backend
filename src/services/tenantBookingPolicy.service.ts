import { AppError } from '../middleware/error.middleware';
import { Tenant } from '../models/Tenant';
import { ITenant } from '../types';

// Stable, reversible tenant policy. The closure is keyed by tenant slug, never
// by a deployment-specific ObjectId, custom domain, or mutable display name.
const BOOKING_CREATION_CLOSED_TENANT_SLUGS = [
  'makadi-horse-club',
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
