import { createHash } from 'crypto';
import { z } from 'zod';
import {
  isoDateSchema,
  PACKAGE_KEY_PATTERN,
  PACKAGE_LIMITS,
  PackageBand,
  PackageDetails,
  PackageExtraUnit,
  PackageRate,
  PackageSeason,
} from '../utils/packageDetails';
import { SERVICE_FEE_BASIS_POINTS, withServiceFeeCents } from '../utils/serviceFee';

/**
 * The only price authority for package listings. Pure: no database, no clock (the caller passes
 * the operator's `today`), so the quote a customer sees and the charge at booking come from the
 * same function and the same inputs.
 *
 * Every amount returned has the service fee inside it, computed per unit price and rounded to the
 * cent, so unit prices × quantities add up to the line amounts and the lines add up to the total.
 * `serviceFee` is the part of `total` that is the fee; `subtotal` is the operator's own prices.
 */

const keySchema = z.string().trim().regex(PACKAGE_KEY_PATTERN, 'Choose one of the options shown');

export const packageSelectionSchema = z.object({
  date: isoDateSchema,
  tierKey: keySchema,
  rooms: z.array(z.object({
    adults: z.number().int().min(0).max(3),
    children: z.number().int().min(0).max(2).default(0),
    infants: z.number().int().min(0).max(2).default(0),
  }).strict()).min(1, 'Add at least one room').max(PACKAGE_LIMITS.roomsPerBooking, `A booking can hold up to ${PACKAGE_LIMITS.roomsPerBooking} rooms`),
  extras: z.array(z.object({
    id: keySchema,
    adults: z.number().int().min(0).max(PACKAGE_LIMITS.travellers).optional(),
    children: z.number().int().min(0).max(PACKAGE_LIMITS.travellers).optional(),
    quantity: z.number().int().min(1).max(PACKAGE_LIMITS.extraQuantity).optional(),
  }).strict()).max(PACKAGE_LIMITS.extras).default([]),
}).strict();

export type PackageSelection = z.infer<typeof packageSelectionSchema>;
export type PackageSelectionInput = z.input<typeof packageSelectionSchema>;

// ── calendar days ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const utc = (date: string): number => Date.parse(`${date}T00:00:00.000Z`);

export const addDays = (date: string, days: number): string =>
  new Date(utc(date) + days * DAY_MS).toISOString().slice(0, 10);

/** Same day of the month, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export const addMonths = (date: string, months: number): string => {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
};

export const weekdayOf = (date: string): number => new Date(utc(date)).getUTCDay();

/** The operator's calendar day in an IANA time zone. */
export const todayInZone = (timeZone: string, now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export const monthDays = (month: string): string[] => {
  const first = `${month}-01`;
  const days: string[] = [];
  for (let date = first; date.slice(0, 7) === month; date = addDays(date, 1)) days.push(date);
  return days;
};

// ── lookups ───────────────────────────────────────────────────────────────────────────────────

export const seasonForDate = (details: PackageDetails, date: string): PackageSeason | null =>
  details.seasons.find((season) => Boolean(season.from && season.to && season.from <= date && date <= season.to)) ?? null;

export const bandForParty = (details: PackageDetails, travellers: number): PackageBand | null =>
  details.groupBands.find((band) => band.min <= travellers && travellers <= band.max) ?? null;

export const partyRange = (details: PackageDetails): { min: number; max: number } | null => {
  if (details.groupBands.length === 0) return null;
  return {
    min: Math.min(...details.groupBands.map((band) => band.min)),
    max: Math.max(...details.groupBands.map((band) => band.max)),
  };
};

const rateCell = (details: PackageDetails, tierKey: string, seasonKey: string, bandKey: string): PackageRate | null =>
  details.rates.find((row) => row.tierKey === tierKey && row.seasonKey === seasonKey && row.bandKey === bandKey) ?? null;

// ── which dates can start the trip ───────────────────────────────────────────────────────────

export type PackageDateStatus = 'open' | 'past' | 'too-soon' | 'too-far' | 'not-running' | 'no-price';

/**
 * Whether a day can start this trip by the package's own rules. A fixed-departure package also
 * needs a departure on that day with free seats; the caller checks that against the database.
 */
export function packageDateStatus(details: PackageDetails, date: string, today: string): PackageDateStatus {
  if (date < today) return 'past';
  if (date < addDays(today, details.minNoticeDays)) return 'too-soon';
  if (details.departureMode === 'daily') {
    if (date > addMonths(today, details.daily.horizonMonths)) return 'too-far';
    if (!details.daily.weekdays.includes(weekdayOf(date)) || details.daily.blackoutDates.includes(date)) return 'not-running';
  } else if (date > addMonths(today, PACKAGE_LIMITS.horizonMonths)) {
    return 'too-far';
  }
  return seasonForDate(details, date) ? 'open' : 'no-price';
}

export const packageDateMessage = (status: Exclude<PackageDateStatus, 'open'>, details: PackageDetails): string => {
  switch (status) {
    case 'past': return 'This date has passed. Choose another date.';
    case 'too-soon': return details.minNoticeDays === 1
      ? 'This trip needs a day\'s notice. Choose a later date.'
      : `This trip needs ${details.minNoticeDays} days' notice. Choose a later date.`;
    case 'too-far': return 'This date is not open for booking yet. Choose an earlier date.';
    case 'not-running': return 'This trip does not start on this date. Choose another date.';
    default: return 'This date has no price yet. Choose another date.';
  }
};

/** Candidate start days for an any-day package, from the notice period to the booking horizon. */
const dailyWindow = (details: PackageDetails, today: string): string[] => {
  const dates: string[] = [];
  const last = addMonths(today, details.daily.horizonMonths);
  for (let date = addDays(today, details.minNoticeDays); date <= last; date = addDays(date, 1)) dates.push(date);
  return dates;
};

/**
 * The first day a customer could start the trip, or null. Fixed departures pass the dated
 * departures that still have seats; any-day packages are judged from their own rules.
 */
export function firstBookableDate(details: PackageDetails, today: string, departureDates: string[] = []): string | null {
  const candidates = details.departureMode === 'fixed' ? [...departureDates].sort() : dailyWindow(details, today);
  return candidates.find((date) => packageDateStatus(details, date, today) === 'open') ?? null;
}

// ── prices ────────────────────────────────────────────────────────────────────────────────────

const cents = (value: number): number => Math.round(value * 100);
const money = (amountCents: number): number => amountCents / 100;

type RateField = 'single' | 'double' | 'triple' | 'child' | 'infant';

export interface PackageQuoteCharge {
  traveller: 'adult' | 'child' | 'infant' | 'unit';
  /** Which price applies: a room rate, the child/infant rate, or an extra. */
  rate: RateField | 'extra' | 'extra-child';
  quantity: number;
  /** Per unit, service fee included. */
  unitPrice: number;
  /** quantity × unitPrice. */
  amount: number;
}

export interface PackageQuoteRoom {
  room: number;
  occupancy: 'single' | 'double' | 'triple';
  adults: number;
  children: number;
  infants: number;
  charges: PackageQuoteCharge[];
  amount: number;
}

export interface PackageQuoteExtra {
  id: string;
  name: string;
  unit: PackageExtraUnit;
  /** per_room / per_booking: units chosen (per_room is then charged for every room). */
  quantity?: number;
  rooms?: number;
  adults?: number;
  children?: number;
  charges: PackageQuoteCharge[];
  amount: number;
}

export interface PackageQuote {
  currency: string;
  departureDate: string;
  returnDate: string;
  tier: { key: string; name: string };
  season: { key: string; name: string };
  groupSize: { min: number; max: number };
  travellers: { adults: number; children: number; infants: number };
  rooms: PackageQuoteRoom[];
  extras: PackageQuoteExtra[];
  /** What the customer pays, service fee included. */
  total: number;
  /** The part of `total` that is the service fee. */
  serviceFee: number;
  /** The operator's own prices: total − serviceFee. */
  subtotal: number;
  /** total ÷ (adults + children), for display. */
  perPerson: number;
  feeBasisPoints: number;
}

export type PackageRefusalCode =
  | 'DATE_UNAVAILABLE'
  | 'NO_PRICE'
  | 'UNKNOWN_TIER'
  | 'ROOM_INVALID'
  | 'PARTY_SIZE'
  | 'UNKNOWN_EXTRA'
  | 'EXTRA_INVALID';

export interface PackageRefusal {
  ok: false;
  code: PackageRefusalCode;
  message: string;
  room?: number;
  extraId?: string;
  dateStatus?: Exclude<PackageDateStatus, 'open'>;
}

export type PackagePricingResult = { ok: true; quote: PackageQuote } | PackageRefusal;

const refusal = (code: PackageRefusalCode, message: string, extra: Partial<PackageRefusal> = {}): PackageRefusal =>
  ({ ok: false, code, message, ...extra });

const NO_PRICE_MESSAGE = 'This choice has no price yet. Choose another hotel level or date.';

type BaseCharge = { traveller: PackageQuoteCharge['traveller']; rate: PackageQuoteCharge['rate']; quantity: number; unit: number | null };

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** Why a room cannot be booked as chosen, or null. Checked before group size and prices. */
function roomProblem(details: PackageDetails, room: PackageSelection['rooms'][number], number: number): PackageRefusal | null {
  const { adults, children, infants } = room;
  const invalid = (message: string) => refusal('ROOM_INVALID', message, { room: number });
  if (adults < 1) return invalid(`Room ${number} needs at least one adult. Children and infants share a room with an adult.`);
  if (children > 0 && !details.travellers.allowChildren) return invalid('This trip is for adults only.');
  if (infants > 0 && !details.travellers.allowInfants) {
    return invalid(`This trip cannot take infants (under ${details.travellers.childMinAge}).`);
  }
  if (children > details.rooms.maxChildrenPerRoom) {
    return invalid(`Room ${number} can take at most ${plural(details.rooms.maxChildrenPerRoom, 'child', 'children')}.`);
  }
  if (infants > details.rooms.maxInfantsPerRoom) {
    return invalid(`Room ${number} can take at most ${plural(details.rooms.maxInfantsPerRoom, 'infant', 'infants')}.`);
  }
  if (adults === 3 && !details.rooms.allowTriple) {
    return invalid(`Room ${number}: rooms for three adults are not offered on this trip. Split them across two rooms.`);
  }
  if (adults === 1 && children === 0 && !details.rooms.allowSingle) {
    return invalid(`Room ${number}: single rooms are not offered on this trip. Put each adult in a room with at least one other traveller.`);
  }
  return null;
}

/** What each traveller in a valid room pays, by occupancy (see the child rule in packageDetails). */
function roomCharges(
  details: PackageDetails,
  cell: PackageRate,
  room: PackageSelection['rooms'][number],
): { occupancy: PackageQuoteRoom['occupancy']; charges: BaseCharge[] } {
  const { adults, children, infants } = room;
  const charges: BaseCharge[] = [];
  let occupancy: PackageQuoteRoom['occupancy'];
  if (adults === 1 && children === 0) {
    occupancy = 'single';
    charges.push({ traveller: 'adult', rate: 'single', quantity: 1, unit: cell.single });
  } else if (adults === 1) {
    occupancy = 'double';
    charges.push({ traveller: 'adult', rate: 'double', quantity: 1, unit: cell.double });
    if (details.travellers.childWithOneAdult === 'double') {
      charges.push({ traveller: 'child', rate: 'double', quantity: 1, unit: cell.double });
      if (children > 1) charges.push({ traveller: 'child', rate: 'child', quantity: children - 1, unit: cell.child });
    } else {
      charges.push({ traveller: 'child', rate: 'child', quantity: children, unit: cell.child });
    }
  } else {
    occupancy = adults === 2 ? 'double' : 'triple';
    charges.push({ traveller: 'adult', rate: occupancy, quantity: adults, unit: cell[occupancy] });
    if (children > 0) charges.push({ traveller: 'child', rate: 'child', quantity: children, unit: cell.child });
  }
  if (infants > 0) charges.push({ traveller: 'infant', rate: 'infant', quantity: infants, unit: cell.infant });
  return { occupancy, charges };
}

function extraCharges(
  details: PackageDetails,
  chosen: PackageSelection['extras'][number],
  party: { adults: number; children: number; rooms: number },
): { line: Omit<PackageQuoteExtra, 'charges' | 'amount'>; charges: BaseCharge[] } | PackageRefusal {
  const extra = details.extras.find((candidate) => candidate.id === chosen.id);
  if (!extra) return refusal('UNKNOWN_EXTRA', 'One of the extras you chose is no longer offered. Review your extras.', { extraId: chosen.id });
  const invalid = (message: string) => refusal('EXTRA_INVALID', `${extra.name}: ${message}`, { extraId: extra.id });
  if (extra.price === null) return refusal('NO_PRICE', `${extra.name} has no price yet. Remove it to continue.`, { extraId: extra.id });

  if (extra.unit === 'per_traveller') {
    if (chosen.quantity !== undefined) return invalid('choose how many adults and children it is for.');
    const adults = chosen.adults ?? 0;
    const children = chosen.children ?? 0;
    if (adults + children < 1) return invalid('choose who it is for.');
    if (adults > party.adults) return invalid(`there are ${plural(party.adults, 'adult', 'adults')} on this booking.`);
    if (children > party.children) return invalid(`there ${party.children === 1 ? 'is' : 'are'} ${plural(party.children, 'child', 'children')} on this booking.`);
    const charges: BaseCharge[] = [];
    if (adults > 0) charges.push({ traveller: 'adult', rate: 'extra', quantity: adults, unit: extra.price });
    if (children > 0) charges.push({ traveller: 'child', rate: 'extra-child', quantity: children, unit: extra.priceChild ?? extra.price });
    return { line: { id: extra.id, name: extra.name, unit: extra.unit, adults, children }, charges };
  }

  if (chosen.adults !== undefined || chosen.children !== undefined) return invalid('choose a quantity.');
  const quantity = chosen.quantity ?? 1;
  if (quantity > extra.maxQuantity) return invalid(`you can add up to ${extra.maxQuantity}.`);
  if (extra.unit === 'per_room') {
    return {
      line: { id: extra.id, name: extra.name, unit: extra.unit, quantity, rooms: party.rooms },
      charges: [{ traveller: 'unit', rate: 'extra', quantity: quantity * party.rooms, unit: extra.price }],
    };
  }
  return {
    line: { id: extra.id, name: extra.name, unit: extra.unit, quantity },
    charges: [{ traveller: 'unit', rate: 'extra', quantity, unit: extra.price }],
  };
}

/** Fee-inclusive charges; null when a price is missing. */
const priced = (charges: BaseCharge[], basisPoints: number): { shown: PackageQuoteCharge[]; baseCents: number; shownCents: number } | null => {
  let baseCents = 0;
  let shownCents = 0;
  const shown: PackageQuoteCharge[] = [];
  for (const charge of charges) {
    if (charge.unit === null || charge.unit === undefined) return null;
    const unitBase = cents(charge.unit);
    const unitShown = withServiceFeeCents(unitBase, basisPoints);
    baseCents += unitBase * charge.quantity;
    shownCents += unitShown * charge.quantity;
    shown.push({
      traveller: charge.traveller,
      rate: charge.rate,
      quantity: charge.quantity,
      unitPrice: money(unitShown),
      amount: money(unitShown * charge.quantity),
    });
  }
  return { shown, baseCents, shownCents };
};

/**
 * Prices one selection: date (by the package's own rules — a fixed departure's seats are the
 * caller's to check), hotel level, rooms with their travellers, and extras.
 */
export function pricePackageSelection(input: {
  details: PackageDetails;
  currency: string;
  selection: PackageSelection;
  today: string;
  feeBasisPoints?: number;
}): PackagePricingResult {
  const { details, selection } = input;
  const basisPoints = input.feeBasisPoints ?? SERVICE_FEE_BASIS_POINTS;

  const dateStatus = packageDateStatus(details, selection.date, input.today);
  if (dateStatus !== 'open') {
    return refusal(dateStatus === 'no-price' ? 'NO_PRICE' : 'DATE_UNAVAILABLE', packageDateMessage(dateStatus, details), { dateStatus });
  }
  const season = seasonForDate(details, selection.date) as PackageSeason;
  const tier = details.tiers.find((candidate) => candidate.key === selection.tierKey);
  if (!tier) return refusal('UNKNOWN_TIER', 'Choose one of the hotel levels shown.');

  for (const [index, room] of selection.rooms.entries()) {
    const problem = roomProblem(details, room, index + 1);
    if (problem) return problem;
  }
  const travellers = selection.rooms.reduce((sum, room) => ({
    adults: sum.adults + room.adults,
    children: sum.children + room.children,
    infants: sum.infants + room.infants,
  }), { adults: 0, children: 0, infants: 0 });
  const party = travellers.adults + travellers.children;
  const band = bandForParty(details, party);
  if (!band) {
    const range = partyRange(details);
    return refusal('PARTY_SIZE', range
      ? range.min === range.max
        ? `This trip is for ${plural(range.min, 'traveller', 'travellers')} (infants not counted).`
        : `This trip is for ${range.min} to ${range.max} travellers (infants not counted).`
      : NO_PRICE_MESSAGE);
  }
  const cell = rateCell(details, tier.key, season.key, band.key);
  if (!cell) return refusal('NO_PRICE', NO_PRICE_MESSAGE);

  let baseCents = 0;
  let shownCents = 0;
  const rooms: PackageQuoteRoom[] = [];
  for (const [index, room] of selection.rooms.entries()) {
    const result = roomCharges(details, cell, room);
    const amounts = priced(result.charges, basisPoints);
    if (!amounts) return refusal('NO_PRICE', NO_PRICE_MESSAGE, { room: index + 1 });
    baseCents += amounts.baseCents;
    shownCents += amounts.shownCents;
    rooms.push({ room: index + 1, occupancy: result.occupancy, ...room, charges: amounts.shown, amount: money(amounts.shownCents) });
  }

  const seen = new Set<string>();
  const extras: PackageQuoteExtra[] = [];
  for (const chosen of selection.extras) {
    if (seen.has(chosen.id)) return refusal('EXTRA_INVALID', 'Each extra can be added once.', { extraId: chosen.id });
    seen.add(chosen.id);
    const result = extraCharges(details, chosen, { adults: travellers.adults, children: travellers.children, rooms: rooms.length });
    if ('ok' in result) return result;
    const amounts = priced(result.charges, basisPoints);
    if (!amounts) return refusal('NO_PRICE', NO_PRICE_MESSAGE, { extraId: chosen.id });
    baseCents += amounts.baseCents;
    shownCents += amounts.shownCents;
    extras.push({ ...result.line, charges: amounts.shown, amount: money(amounts.shownCents) });
  }

  return {
    ok: true,
    quote: {
      currency: input.currency,
      departureDate: selection.date,
      returnDate: details.durationDays ? addDays(selection.date, details.durationDays - 1) : selection.date,
      tier: { key: tier.key, name: tier.name },
      season: { key: season.key, name: season.name },
      groupSize: { min: band.min, max: band.max },
      travellers,
      rooms,
      extras,
      total: money(shownCents),
      serviceFee: money(shownCents - baseCents),
      subtotal: money(baseCents),
      perPerson: money(Math.round(shownCents / party)),
      feeBasisPoints: basisPoints,
    },
  };
}

/**
 * Identifies what the customer was shown: the selection and its total. Booking re-prices and
 * compares, so a price that changed in between is refused with the new figure rather than charged.
 */
export const packageQuoteHash = (attractionId: string, selection: PackageSelection, quote: Pick<PackageQuote, 'currency' | 'total'>): string =>
  createHash('sha256').update(JSON.stringify([
    attractionId,
    selection.date,
    selection.tierKey,
    selection.rooms.map((room) => [room.adults, room.children, room.infants]),
    [...selection.extras]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((extra) => [extra.id, extra.adults ?? 0, extra.children ?? 0, extra.quantity ?? 0]),
    quote.currency,
    cents(quote.total),
  ])).digest('hex').slice(0, 32);

// ── "from" prices ─────────────────────────────────────────────────────────────────────────────

/** The reference party for "from" prices: two travellers sharing, or the nearest size the trip takes. */
const referenceParty = (details: PackageDetails): { travellers: number; rate: 'single' | 'double' } | null => {
  const range = partyRange(details);
  if (!range) return null;
  const travellers = Math.min(Math.max(2, range.min), range.max);
  return { travellers, rate: travellers === 1 ? 'single' : 'double' };
};

/** The cheapest per-person price (fee included) on one date for a party size, across hotel levels. */
export function datePerPersonFrom(
  details: PackageDetails,
  date: string,
  travellers: number,
  basisPoints = SERVICE_FEE_BASIS_POINTS,
): { perPerson: number; tierKey: string } | null {
  const season = seasonForDate(details, date);
  const band = bandForParty(details, travellers);
  if (!season || !band) return null;
  const field: RateField = travellers === 1 ? 'single' : 'double';
  let best: { cents: number; tierKey: string } | null = null;
  for (const tier of details.tiers) {
    const unit = rateCell(details, tier.key, season.key, band.key)?.[field];
    if (typeof unit !== 'number' || unit <= 0) continue;
    const shown = withServiceFeeCents(cents(unit), basisPoints);
    if (!best || shown < best.cents) best = { cents: shown, tierKey: tier.key };
  }
  return best ? { perPerson: money(best.cents), tierKey: best.tierKey } : null;
}

export interface PackageFromPrice {
  perPerson: number;
  /** The first date that price is available on. */
  date: string;
  tierKey: string;
  travellers: number;
  basis: 'single' | 'double';
}

/**
 * The lowest per-person price a customer can actually book, with the date it belongs to — never a
 * price from a season that has ended or a day that cannot start the trip.
 */
export function packageFromPrice(
  details: PackageDetails,
  today: string,
  departureDates: string[] = [],
  basisPoints = SERVICE_FEE_BASIS_POINTS,
): PackageFromPrice | null {
  const reference = referenceParty(details);
  if (!reference) return null;
  const candidates = details.departureMode === 'fixed' ? [...new Set(departureDates)].sort() : dailyWindow(details, today);
  let best: PackageFromPrice | null = null;
  for (const date of candidates) {
    if (packageDateStatus(details, date, today) !== 'open') continue;
    const price = datePerPersonFrom(details, date, reference.travellers, basisPoints);
    if (price && (!best || price.perPerson < best.perPerson)) {
      best = { perPerson: price.perPerson, date, tierKey: price.tierKey, travellers: reference.travellers, basis: reference.rate };
    }
  }
  return best;
}

// ── calendar ──────────────────────────────────────────────────────────────────────────────────

export interface PackageDepartureState {
  /** Seats on a fixed departure; any-day packages use the package's daily capacity. */
  capacity?: number;
  booked: number;
  blocked: boolean;
}

export interface PackageCalendarDay {
  date: string;
  status: 'available' | 'sold-out' | 'closed';
  reason?: Exclude<PackageDateStatus, 'open'> | 'no-departure' | 'blocked' | 'not-enough-seats' | 'party-size';
  seatsLeft?: number;
  perPersonFrom?: number;
}

/** Seats left on a day, or null when no trip starts that day. */
export const seatsLeftOn = (details: PackageDetails, state: PackageDepartureState | undefined): number | null => {
  if (state?.blocked) return null;
  const capacity = details.departureMode === 'fixed' ? state?.capacity : details.daily.dailyCapacity;
  if (typeof capacity !== 'number') return null;
  return Math.max(0, capacity - (state?.booked ?? 0));
};

/** One month of start days for a party size, with seats and the cheapest per-person price. */
export function packageCalendar(input: {
  details: PackageDetails;
  month: string;
  today: string;
  travellers: number;
  departures: Map<string, PackageDepartureState>;
  feeBasisPoints?: number;
}): PackageCalendarDay[] {
  const { details } = input;
  return monthDays(input.month).map((date): PackageCalendarDay => {
    const dateStatus = packageDateStatus(details, date, input.today);
    if (dateStatus !== 'open') return { date, status: 'closed', reason: dateStatus };
    const state = input.departures.get(date);
    if (state?.blocked) return { date, status: 'closed', reason: 'blocked' };
    const seatsLeft = seatsLeftOn(details, state);
    if (seatsLeft === null) return { date, status: 'closed', reason: 'no-departure' };
    if (seatsLeft === 0) return { date, status: 'sold-out', seatsLeft };
    if (seatsLeft < input.travellers) return { date, status: 'closed', reason: 'not-enough-seats', seatsLeft };
    const price = datePerPersonFrom(details, date, input.travellers, input.feeBasisPoints);
    if (!price) {
      return { date, status: 'closed', reason: bandForParty(details, input.travellers) ? 'no-price' : 'party-size', seatsLeft };
    }
    return { date, status: 'available', seatsLeft, perPersonFrom: price.perPerson };
  });
}
