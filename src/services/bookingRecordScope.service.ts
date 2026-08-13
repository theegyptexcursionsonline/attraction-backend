/**
 * Bundle component Bookings are operational allocations, not independent
 * customer purchases. The BundleOrder exclusively owns their payment,
 * cancellation, inventory, notification, refund, and settlement lifecycles.
 */
export const standaloneBookingClause = Object.freeze({
  bundleOrderId: { $exists: false },
});

export const isBundleComponentBooking = (booking?: { bundleOrderId?: unknown } | null): boolean =>
  booking?.bundleOrderId !== undefined && booking.bundleOrderId !== null;

export const withStandaloneBookingScope = (
  query: Record<string, unknown> = {}
): Record<string, unknown> => ({
  $and: [standaloneBookingClause, query],
});
