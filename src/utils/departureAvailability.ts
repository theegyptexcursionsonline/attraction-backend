/**
 * How a tour's dates are sold, derived from its published departures.
 *
 * The public availability API returns departure slots only for 'time-slots' tours, and the
 * storefront booking engine asks for a departure whenever a tour publishes an entry window.
 * A 'date-only' tour with a window therefore opens a time step that can never be filled.
 * A tour with a scheduled departure is sold by that slot; everything else by the day.
 */
export function departureAvailabilityType(
  entryWindows: ReadonlyArray<{ startTime?: string | null }> | null | undefined,
): 'time-slots' | 'date-only' {
  const scheduled = (entryWindows || []).some(
    (window) => typeof window?.startTime === 'string' && window.startTime.trim() !== '',
  );
  return scheduled ? 'time-slots' : 'date-only';
}
