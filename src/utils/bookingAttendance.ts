import { bookingEligibility, resolveBookingTimeZone, zonedDeparture } from './bookingCutoff';

export type AttendanceStatus = 'not-recorded' | 'no-show';
type Booking = { status?: string; cancellationRequestedAt?: unknown; items?: Array<{ date?: unknown; time?: unknown }> };
export function attendanceEligibility(booking: Booking, timeZone: unknown, now = new Date()): { canMarkNoShow: boolean; reason: string | null } {
  if (!['confirmed', 'completed'].includes(booking.status || '') || booking.cancellationRequestedAt) return { canMarkNoShow: false, reason: 'Only active confirmed or completed bookings can be marked as no-show.' };
  if (!booking.items?.length) return { canMarkNoShow: false, reason: 'The booking departure could not be confirmed.' };
  const zone = resolveBookingTimeZone(timeZone);
  for (const item of booking.items) {
    if (typeof item.date !== 'string' || !zonedDeparture(item.date, '00:00', zone) || (item.time !== undefined && typeof item.time !== 'string')) {
      return { canMarkNoShow: false, reason: 'The booking departure could not be confirmed.' };
    }
    const departure = bookingEligibility({ date: item.date, time: item.time as string | undefined, timeZone: zone, now });
    if (!['past_date', 'past_departure'].includes(departure.reason)) return { canMarkNoShow: false, reason: departure.reason === 'invalid_departure'
      ? 'The booking departure could not be confirmed.' : 'No-show is available after the latest booked departure. For a booking without a departure time, wait until the travel day has passed.' };
  }
  return { canMarkNoShow: true, reason: null };
}
