import { IBooking } from '../types';

// Compact, tenant-safe booking summary for webhook payloads. Contains only the
// booking's own fields — never other tenants' data.
export const bookingEventPayload = (
  booking: Pick<
    IBooking,
    | '_id'
    | 'reference'
    | 'tenantId'
    | 'attractionId'
    | 'status'
    | 'paymentStatus'
    | 'total'
    | 'currency'
    | 'guestDetails'
  >
): Record<string, unknown> => ({
  bookingId: String(booking._id),
  reference: booking.reference,
  tenantId: String(booking.tenantId),
  attractionId: String(booking.attractionId),
  status: booking.status,
  paymentStatus: booking.paymentStatus,
  total: booking.total,
  currency: booking.currency,
  customer: {
    name: `${booking.guestDetails?.firstName || ''} ${booking.guestDetails?.lastName || ''}`.trim(),
    email: booking.guestDetails?.email,
  },
});

