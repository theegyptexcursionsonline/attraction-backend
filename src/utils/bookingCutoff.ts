export const MAX_BOOKING_CUTOFF_MINUTES = 7 * 24 * 60;

// Every configured Attraction Network site operates in Egypt. A site with no or an
// invalid timezone must not fall back to UTC: that would close Cairo departures about
// three hours late, or throw and take booking offline for the whole site.
export const DEFAULT_BOOKING_TIME_ZONE = 'Africa/Cairo';

export function resolveBookingTimeZone(timeZone: unknown): string {
  if (typeof timeZone !== 'string' || !timeZone.trim() || timeZone.trim().toUpperCase() === 'UTC') {
    return DEFAULT_BOOKING_TIME_ZONE;
  }
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timeZone.trim() });
    return timeZone.trim();
  } catch {
    return DEFAULT_BOOKING_TIME_ZONE;
  }
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type BookingEligibilityReason = 'eligible' | 'past_date' | 'past_departure' | 'cutoff_reached' | 'invalid_departure';

const formatterFor = (timeZone: string): Intl.DateTimeFormat => new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const partsInZone = (date: Date, timeZone: string): LocalParts & { second: number } => {
  const values = Object.fromEntries(
    formatterFor(timeZone).formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
};

const dateKey = ({ year, month, day }: Pick<LocalParts, 'year' | 'month' | 'day'>): string =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** Resolve a catalogue wall-clock departure in an IANA timezone to an instant. */
export function zonedDeparture(date: string, time: string, timeZone: string): Date | null {
  const dateMatch = DATE_PATTERN.exec(date);
  const timeMatch = TIME_PATTERN.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const target: LocalParts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  };
  const targetWallClock = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  let candidateMs = targetWallClock;

  // Iteration handles offsets on either side of a daylight-saving transition.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = partsInZone(new Date(candidateMs), timeZone);
    const representedWallClock = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    const adjustment = targetWallClock - representedWallClock;
    if (adjustment === 0) break;
    candidateMs += adjustment;
  }

  const resolved = new Date(candidateMs);
  const local = partsInZone(resolved, timeZone);
  return local.year === target.year && local.month === target.month && local.day === target.day
    && local.hour === target.hour && local.minute === target.minute
    ? resolved
    : null;
}

export function bookingEligibility(input: {
  date: string;
  time?: string;
  timeZone: string;
  cutoffMinutes?: number;
  now?: Date;
}): { eligible: boolean; reason: BookingEligibilityReason; departure?: Date } {
  const now = input.now ?? new Date();
  if (!input.time) {
    const requested = DATE_PATTERN.exec(input.date);
    if (!requested) return { eligible: false, reason: 'invalid_departure' };
    const today = dateKey(partsInZone(now, input.timeZone));
    return input.date < today
      ? { eligible: false, reason: 'past_date' }
      : { eligible: true, reason: 'eligible' };
  }

  const departure = zonedDeparture(input.date, input.time, input.timeZone);
  if (!departure) return { eligible: false, reason: 'invalid_departure' };
  if (departure.getTime() <= now.getTime()) {
    return { eligible: false, reason: 'past_departure', departure };
  }
  const cutoffMinutes = input.cutoffMinutes ?? 0;
  const cutoffAt = departure.getTime() - cutoffMinutes * 60_000;
  return now.getTime() >= cutoffAt
    ? { eligible: false, reason: 'cutoff_reached', departure }
    : { eligible: true, reason: 'eligible', departure };
}
