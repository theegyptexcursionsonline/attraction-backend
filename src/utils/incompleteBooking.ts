/**
 * "In-complete" (client request, 9 Oct 2026): a card checkout the customer started but never paid.
 *
 * It is not a stored status. The payment flow keeps the booking `pending` while its payment window is
 * open and `expireStaleCardHolds` closes it as `cancelled` + payment `failed` once the hold expires,
 * so the partner API, webhooks, emails and the storefront keep their meaning. Reporting reads
 * In-complete through this one rule, and a real cancellation is a cancelled booking that is not one.
 *
 * Pay-later and cash bookings are confirmed when they are made, so they are never In-complete.
 */

/** The payment window a card checkout keeps its hold (the same 30 minutes `expireStaleCardHolds` uses). */
export const CARD_PAYMENT_WINDOW_MS = 30 * 60 * 1000;

/** Payment states of a card booking that has not been paid. */
export const UNPAID_CARD_PAYMENT_STATUSES = ['pending', 'processing', 'failed'] as const;

/** Bookings that are In-complete at `now`: closed unpaid, or still open past the payment window. */
export const incompleteBookingClause = (now: Date = new Date()): Record<string, unknown> => ({
  paymentMethod: 'card',
  paymentStatus: { $in: [...UNPAID_CARD_PAYMENT_STATUSES] },
  $or: [
    { status: 'cancelled' },
    { status: 'pending', createdAt: { $lt: new Date(now.getTime() - CARD_PAYMENT_WINDOW_MS) } },
  ],
});

/** Cancelled bookings that were real bookings (paid, pay-later or cash): never an unpaid card checkout. */
export const realCancellationClause = (): Record<string, unknown> => ({
  status: 'cancelled',
  $nor: [{ paymentMethod: 'card', paymentStatus: { $in: [...UNPAID_CARD_PAYMENT_STATUSES] } }],
});

type BookingFacts = { paymentMethod?: unknown; paymentStatus?: unknown; status?: unknown; createdAt?: unknown };

/** The same rule for one booking already read (list rows). */
export const isIncompleteBooking = (booking: BookingFacts, now: Date = new Date()): boolean => {
  if (booking.paymentMethod !== 'card') return false;
  if (!(UNPAID_CARD_PAYMENT_STATUSES as readonly unknown[]).includes(booking.paymentStatus)) return false;
  if (booking.status === 'cancelled') return true;
  if (booking.status !== 'pending') return false;
  const created = booking.createdAt instanceof Date ? booking.createdAt : new Date(String(booking.createdAt));
  return Number.isFinite(created.getTime()) && created.getTime() < now.getTime() - CARD_PAYMENT_WINDOW_MS;
};
