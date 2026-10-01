/**
 * How a tour's dates are sold.
 *
 * `availability.type` is the one authority: a 'time-slots' tour is sold by departure (the public
 * availability API offers each departure with its own seats and cutoff, and a booking must name
 * one); every other type is sold by the day (one pool of seats for the date, no departure chosen).
 * A record without a type takes the model default, 'time-slots'.
 */
type TimedEntry = { startTime?: string | null } | null | undefined;

const hasStartTime = (entries: ReadonlyArray<TimedEntry> | null | undefined): boolean =>
  (entries || []).some((entry) => typeof entry?.startTime === 'string' && entry.startTime.trim() !== '');

/** A tour with a scheduled departure is sold by that slot; everything else by the day. */
export function departureAvailabilityType(
  entryWindows: ReadonlyArray<TimedEntry> | null | undefined,
): 'time-slots' | 'date-only' {
  return hasStartTime(entryWindows) ? 'time-slots' : 'date-only';
}

export interface DepartureScheduleSource {
  availability?: { type?: string | null } | null;
  entryWindows?: ReadonlyArray<TimedEntry> | null;
  pricingOptions?: ReadonlyArray<{ timeSlots?: ReadonlyArray<TimedEntry> | null } | null> | null;
  enquiryOnly?: boolean | null;
}

export const DEPARTURE_SCHEDULE_CONFLICT_MESSAGE =
  'Tours sold by date cannot list departure times. Set availability to Time Slots if guests choose a departure, or remove the departure times.';

/**
 * A tour sold by the day that still lists departure times. Nobody can choose those times: the
 * availability API offers none for it and the booking is for the whole day. Writes refuse the
 * pair so each tour says one thing; enquiry-only records publish no schedule at all.
 */
export function departureScheduleConflict(source: DepartureScheduleSource): boolean {
  if (source.enquiryOnly === true) return false;
  if ((source.availability?.type || 'time-slots') === 'time-slots') return false;
  return hasStartTime(source.entryWindows)
    || (source.pricingOptions || []).some((option) => hasStartTime(option?.timeSlots));
}
