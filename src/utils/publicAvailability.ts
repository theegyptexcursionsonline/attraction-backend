interface AvailabilitySource {
  entryWindows?: Array<{ startTime?: string }>;
}

const LEGACY_DEFAULT_TIMES = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

/**
 * Build the no-override public availability slots for a tour. A configured
 * catalog window is authoritative; legacy defaults remain only for older
 * tours with no schedule metadata.
 */
export function publicDefaultTimeSlots(
  attraction: AvailabilitySource,
  capacity: number,
): Array<{ time: string; available: true; spotsLeft: number }> {
  const configuredTimes = [...new Set(
    (attraction.entryWindows || [])
      .map((window) => window.startTime?.trim())
      .filter((time): time is string => Boolean(time)),
  )];
  const times = configuredTimes.length > 0 ? configuredTimes : LEGACY_DEFAULT_TIMES;
  return times.map((time) => ({ time, available: true, spotsLeft: capacity }));
}
