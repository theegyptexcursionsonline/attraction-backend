interface AvailabilitySource {
  entryWindows?: Array<{ startTime?: string }>;
  pricingOptions?: Array<{
    timeSlots?: Array<{ startTime?: string }>;
  }>;
}

const LEGACY_DEFAULT_TIMES = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

interface StoredAvailabilitySlot {
  time?: string;
  capacity?: number;
  booked?: number;
}

const uniqueValidTimes = (times: Array<string | undefined>): string[] => [...new Set(
  times
    .map((time) => time?.trim())
    .filter((time): time is string => Boolean(time && TIME_PATTERN.test(time))),
)];

/**
 * The catalog schedule is the shared authority for both public availability and
 * booking inventory. Entry windows remain first for stable storefront ordering;
 * option-owned slots are appended when they add a distinct departure.
 */
export function configuredAvailabilityTimes(attraction: AvailabilitySource): string[] {
  return uniqueValidTimes([
    ...(attraction.entryWindows || []).map((window) => window.startTime),
    ...(attraction.pricingOptions || []).flatMap((option) =>
      (option.timeSlots || []).map((slot) => slot.startTime)),
  ]);
}

/**
 * Project a materialized date's stored capacity onto the current catalog
 * schedule. Missing stored slots remain unavailable because a date-specific
 * record is an operator override; stale slots outside an explicit catalog
 * schedule are hidden so the public API never advertises an unbookable time.
 */
export function publicAvailabilityTimeSlots(
  attraction: AvailabilitySource,
  storedSlots: StoredAvailabilitySlot[] = [],
  defaultCapacity: number,
): Array<{ time: string; available: boolean; spotsLeft: number }> {
  const configuredTimes = configuredAvailabilityTimes(attraction);
  const storedTimes = uniqueValidTimes(storedSlots.map((slot) => slot.time));
  const times = configuredTimes.length > 0
    ? storedTimes.filter((time) => configuredTimes.includes(time))
    : storedTimes;

  return times.map((time) => {
    const stored = storedSlots.find((slot) => slot.time?.trim() === time);
    const capacity = typeof stored?.capacity === 'number' ? stored.capacity : defaultCapacity;
    const booked = typeof stored?.booked === 'number' ? stored.booked : 0;
    const spotsLeft = Math.max(0, capacity - booked);
    return { time, available: spotsLeft > 0, spotsLeft };
  });
}

/**
 * Build the no-override public availability slots for a tour. A configured
 * catalog window is authoritative; legacy defaults remain only for older
 * tours with no schedule metadata.
 */
export function publicDefaultTimeSlots(
  attraction: AvailabilitySource,
  capacity: number,
): Array<{ time: string; available: true; spotsLeft: number }> {
  const configuredTimes = configuredAvailabilityTimes(attraction);
  const times = configuredTimes.length > 0 ? configuredTimes : LEGACY_DEFAULT_TIMES;
  return times.map((time) => ({ time, available: true, spotsLeft: capacity }));
}
