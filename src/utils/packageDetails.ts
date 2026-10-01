import { z } from 'zod';
import { secureImageUrlSchema } from './imagePresentation';
import { withServiceFeeCents } from './serviceFee';

/**
 * Package listings: multi-day trips priced by departure date × hotel level × season × group size
 * × room occupancy. A package is an Attraction with `listingType: 'package'` and a
 * `packageDetails` document, so catalogue, URLs, sitemaps, reviews, tenant scoping and the
 * booking rails stay shared with tours.
 *
 * Two levels of validity:
 * - stored (this schema): every value that is present is valid and unambiguous — unique keys,
 *   rates that point at an existing level/season/group size, real dates, money in cents. A draft
 *   may be incomplete.
 * - publishable (`packagePublishProblems`): complete enough to sell. Each problem names the exact
 *   place to fix ("Gold · High season · 2–4 travellers: double room price missing").
 *
 * Prices are entered per person in the listing's currency, before the service fee; every price a
 * customer sees has the fee inside it (packagePricing.service).
 */

export const LISTING_TYPES = ['tour', 'attraction', 'package'] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const PACKAGE_LIMITS = {
  minDays: 2,
  maxDays: 60,
  seasons: 24,
  tiers: 6,
  bands: 8,
  hotelsPerTier: 20,
  extras: 30,
  cancellationRules: 8,
  blackoutDates: 366,
  roomsPerBooking: 20,
  travellers: 60,
  dailyCapacity: 500,
  horizonMonths: 24,
  noticeDays: 365,
  price: 1_000_000,
  extraQuantity: 30,
} as const;

const HTML_TAG = /<[a-z!/?]/i;
const LINE_CONTROL = /[\u0000-\u001f\u007f]/;
const PROSE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const line = (max: number) => z.string().trim().max(max)
  .refine((value) => !HTML_TAG.test(value) && !LINE_CONTROL.test(value), 'Use plain text without HTML');
const prose = (max: number) => z.string().trim().max(max)
  .refine((value) => !HTML_TAG.test(value) && !PROSE_CONTROL.test(value), 'Use plain text without HTML');

export const PACKAGE_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const key = z.string().trim().regex(PACKAGE_KEY_PATTERN, 'Use lowercase letters, numbers and hyphens');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isRealIsoDate = (value: string): boolean => {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
export const isoDateSchema = z.string().trim().refine(isRealIsoDate, 'Use a real date (YYYY-MM-DD)');

const hasCents = (value: number): boolean => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
const money = z.number().finite().min(0, 'Prices cannot be negative').max(PACKAGE_LIMITS.price)
  .refine(hasCents, 'Use at most two decimal places');
const rate = money.nullable().default(null);
const int = (min: number, max: number) => z.number().int().min(min).max(max);

const seasonSchema = z.object({
  key,
  name: line(60).default(''),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
}).strict();

const hotelSchema = z.object({
  city: line(80).default(''),
  name: line(120).default(''),
  nights: int(1, PACKAGE_LIMITS.maxDays).optional(),
  stars: int(1, 5).optional(),
}).strict();

const tierSchema = z.object({
  key,
  name: line(60).default(''),
  description: prose(500).default(''),
  hotels: z.array(hotelSchema).max(PACKAGE_LIMITS.hotelsPerTier).default([]),
}).strict();

const bandSchema = z.object({
  key,
  min: int(1, PACKAGE_LIMITS.travellers),
  max: int(1, PACKAGE_LIMITS.travellers),
}).strict();

const rateSchema = z.object({
  tierKey: key,
  seasonKey: key,
  bandKey: key,
  /** Per adult sharing a double or twin room. */
  double: rate,
  /** Per adult alone in a room. */
  single: rate,
  /** Per adult in a room of three adults. */
  triple: rate,
  /** Per child sharing a room with adults. */
  child: rate,
  /** Per infant (under the child age), in a room with adults. */
  infant: rate,
}).strict();

const roomsSchema = z.object({
  allowSingle: z.boolean().default(true),
  allowTriple: z.boolean().default(true),
  maxChildrenPerRoom: int(0, 2).default(1),
  maxInfantsPerRoom: int(0, 2).default(1),
}).strict();

const travellersSchema = z.object({
  allowChildren: z.boolean().default(true),
  allowInfants: z.boolean().default(true),
  /** Children are from this age; younger travellers are infants. */
  childMinAge: int(1, 17).default(2),
  childMaxAge: int(1, 17).default(11),
  /**
   * What a child pays when sharing a room with ONE adult: 'double' — the child takes the second
   * place of a double room and pays the double rate (the room is paid as a double); 'child' — the
   * child rate. Further children in that room pay the child rate either way.
   */
  childWithOneAdult: z.enum(['double', 'child']).default('double'),
}).strict();

const dailySchema = z.object({
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: z.array(int(0, 6)).max(7).default([0, 1, 2, 3, 4, 5, 6]),
  blackoutDates: z.array(isoDateSchema).max(PACKAGE_LIMITS.blackoutDates).default([]),
  horizonMonths: int(1, PACKAGE_LIMITS.horizonMonths).default(12),
  /** Travellers who can start this trip on one day. */
  dailyCapacity: int(1, PACKAGE_LIMITS.dailyCapacity).default(20),
}).strict();

export const PACKAGE_EXTRA_UNITS = ['per_traveller', 'per_room', 'per_booking'] as const;
export type PackageExtraUnit = (typeof PACKAGE_EXTRA_UNITS)[number];

const extraSchema = z.object({
  id: key,
  name: line(80).default(''),
  description: prose(300).default(''),
  unit: z.enum(PACKAGE_EXTRA_UNITS),
  /** Per adult (per_traveller), per room per unit (per_room) or per unit (per_booking). */
  price: rate,
  /** per_traveller only: price per child; null = the adult price. */
  priceChild: rate,
  /** per_room / per_booking: the most units one booking can take (e.g. extra nights). */
  maxQuantity: int(1, PACKAGE_LIMITS.extraQuantity).default(1),
}).strict();

const cancellationRuleSchema = z.object({
  /** The refund applies when cancelling at least this many days before departure. */
  daysBefore: int(0, 365),
  refundPercent: int(0, 100),
}).strict();

export const PACKAGE_MEALS = ['breakfast', 'lunch', 'dinner'] as const;

const itineraryDaySchema = z.object({
  day: int(1, PACKAGE_LIMITS.maxDays),
  title: line(120).default(''),
  description: prose(4000).default(''),
  meals: z.array(z.enum(PACKAGE_MEALS)).max(3).default([]),
  overnight: line(120).default(''),
  imageUrl: secureImageUrlSchema.optional(),
}).strict();

const duplicates = <T>(values: T[]): T[] => values.filter((value, index) => values.indexOf(value) !== index);

export const packageDetailsSchema = z.object({
  version: z.literal(1),
  durationDays: int(PACKAGE_LIMITS.minDays, PACKAGE_LIMITS.maxDays).optional(),
  durationNights: int(0, PACKAGE_LIMITS.maxDays).optional(),
  startCity: line(80).default(''),
  endCity: line(80).default(''),
  /** fixed: departures are dated rows with their own seats; daily: any allowed day. */
  departureMode: z.enum(['fixed', 'daily']).default('daily'),
  /** Days between booking and departure. */
  minNoticeDays: int(0, PACKAGE_LIMITS.noticeDays).default(2),
  daily: dailySchema.default({}),
  seasons: z.array(seasonSchema).max(PACKAGE_LIMITS.seasons).default([]),
  tiers: z.array(tierSchema).max(PACKAGE_LIMITS.tiers).default([]),
  groupBands: z.array(bandSchema).max(PACKAGE_LIMITS.bands).default([]),
  rates: z.array(rateSchema).max(PACKAGE_LIMITS.tiers * PACKAGE_LIMITS.seasons * PACKAGE_LIMITS.bands).default([]),
  rooms: roomsSchema.default({}),
  travellers: travellersSchema.default({}),
  extras: z.array(extraSchema).max(PACKAGE_LIMITS.extras).default([]),
  cancellation: z.array(cancellationRuleSchema).max(PACKAGE_LIMITS.cancellationRules).default([]),
  itinerary: z.array(itineraryDaySchema).max(PACKAGE_LIMITS.maxDays).default([]),
}).strict().superRefine((details, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  const keyed: Array<[string, string[]]> = [
    ['seasons', details.seasons.map((season) => season.key)],
    ['tiers', details.tiers.map((tier) => tier.key)],
    ['groupBands', details.groupBands.map((band) => band.key)],
    ['extras', details.extras.map((extra) => extra.id)],
  ];
  for (const [path, keys] of keyed) {
    for (const repeated of new Set(duplicates(keys))) issue([path], `"${repeated}" is used twice`);
  }
  if (details.durationDays !== undefined && details.durationNights !== undefined && details.durationNights > details.durationDays) {
    issue(['durationNights'], 'A trip cannot have more nights than days');
  }
  details.seasons.forEach((season, index) => {
    if (season.from && season.to && season.from > season.to) issue(['seasons', index, 'to'], 'A season must end on or after its first day');
  });
  details.groupBands.forEach((band, index) => {
    if (band.min > band.max) issue(['groupBands', index, 'max'], 'The largest group size must be at least the smallest');
  });
  const seasonKeys = new Set(details.seasons.map((season) => season.key));
  const tierKeys = new Set(details.tiers.map((tier) => tier.key));
  const bandKeys = new Set(details.groupBands.map((band) => band.key));
  const cells = new Set<string>();
  details.rates.forEach((row, index) => {
    if (!tierKeys.has(row.tierKey)) issue(['rates', index, 'tierKey'], 'This price belongs to a hotel level that does not exist');
    if (!seasonKeys.has(row.seasonKey)) issue(['rates', index, 'seasonKey'], 'This price belongs to a season that does not exist');
    if (!bandKeys.has(row.bandKey)) issue(['rates', index, 'bandKey'], 'This price belongs to a group size that does not exist');
    const cell = `${row.tierKey}|${row.seasonKey}|${row.bandKey}`;
    if (cells.has(cell)) issue(['rates', index], 'This hotel level, season and group size already has prices');
    cells.add(cell);
  });
  if (duplicates(details.daily.weekdays).length) issue(['daily', 'weekdays'], 'Each weekday can be listed once');
  if (duplicates(details.daily.blackoutDates).length) issue(['daily', 'blackoutDates'], 'Each closed date can be listed once');
  if (details.travellers.childMinAge > details.travellers.childMaxAge) {
    issue(['travellers', 'childMaxAge'], 'The oldest child age must be at least the youngest');
  }
  if (duplicates(details.cancellation.map((rule) => rule.daysBefore)).length) {
    issue(['cancellation'], 'Each cancellation deadline can be listed once');
  }
  if (duplicates(details.itinerary.map((day) => day.day)).length) issue(['itinerary'], 'Each day of the itinerary can be listed once');
  details.itinerary.forEach((day, index) => {
    if (duplicates(day.meals).length) issue(['itinerary', index, 'meals'], 'Each meal can be listed once');
  });
  details.extras.forEach((extra, index) => {
    if (extra.unit !== 'per_traveller' && extra.priceChild !== null) {
      issue(['extras', index, 'priceChild'], 'Only extras priced per traveller have a child price');
    }
  });
});

export type PackageDetails = z.infer<typeof packageDetailsSchema>;
export type PackageDetailsInput = z.input<typeof packageDetailsSchema>;
export type PackageSeason = PackageDetails['seasons'][number];
export type PackageTier = PackageDetails['tiers'][number];
export type PackageBand = PackageDetails['groupBands'][number];
export type PackageRate = PackageDetails['rates'][number];
export type PackageExtra = PackageDetails['extras'][number];

/** The stored document, or null when the value is not a valid package document. */
export const readPackageDetails = (value: unknown): PackageDetails | null => {
  const parsed = packageDetailsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const bandLabel = (band: Pick<PackageBand, 'min' | 'max'>): string =>
  band.min === band.max
    ? `${band.min} traveller${band.min === 1 ? '' : 's'}`
    : `${band.min}–${band.max} travellers`;

const named = (name: string, fallback: string): string => name.trim() || fallback;

const RATE_FIELDS: Array<{ field: keyof Pick<PackageRate, 'double' | 'single' | 'triple' | 'child' | 'infant'>; label: string }> = [
  { field: 'double', label: 'double room price' },
  { field: 'single', label: 'single room price' },
  { field: 'triple', label: 'triple room price' },
  { field: 'child', label: 'child price' },
  { field: 'infant', label: 'infant price' },
];

/** Rate fields a cell must have to sell with these room and traveller rules. */
export const requiredRateFields = (details: Pick<PackageDetails, 'rooms' | 'travellers'>): Array<keyof PackageRate> => [
  'double',
  ...(details.rooms.allowSingle ? ['single' as const] : []),
  ...(details.rooms.allowTriple ? ['triple' as const] : []),
  ...(details.travellers.allowChildren ? ['child' as const] : []),
  ...(details.travellers.allowInfants ? ['infant' as const] : []),
];

export const MAX_PUBLISH_PROBLEMS = 25;

/**
 * Everything that stops this package from being sold, in the order an editor would fix it.
 * Empty means publishable. `today` is the operator's calendar day (YYYY-MM-DD).
 */
export function packagePublishProblems(details: PackageDetails, today: string): string[] {
  const problems: string[] = [];
  const add = (message: string) => { problems.push(message); };

  if (details.durationDays === undefined) add('Set how many days the trip lasts');
  if (details.durationNights === undefined) add('Set how many nights the trip lasts');
  if (!details.startCity) add('Set the city where the trip starts');
  if (!details.endCity) add('Set the city where the trip ends');

  if (details.departureMode === 'daily' && details.daily.weekdays.length === 0) {
    add('Choose at least one weekday the trip can start on');
  }

  if (details.seasons.length === 0) add('Add at least one season with its dates');
  details.seasons.forEach((season, index) => {
    const label = named(season.name, `Season ${index + 1}`);
    if (!season.name) add(`Season ${index + 1}: add a name`);
    if (!season.from || !season.to) add(`${label}: set the first and last departure date`);
  });
  const dated = details.seasons
    .filter((season): season is PackageSeason & { from: string; to: string } => Boolean(season.from && season.to))
    .sort((left, right) => left.from.localeCompare(right.from));
  for (let index = 1; index < dated.length; index += 1) {
    if (dated[index].from <= dated[index - 1].to) {
      add(`${named(dated[index - 1].name, 'A season')} and ${named(dated[index].name, 'another season')} overlap — each date can belong to one season`);
    }
  }
  if (dated.length > 0 && !dated.some((season) => season.to >= today)) {
    add('Every season has ended — add a season with future dates');
  }

  if (details.tiers.length === 0) add('Add at least one hotel level');
  details.tiers.forEach((tier, index) => {
    const label = named(tier.name, `Hotel level ${index + 1}`);
    if (!tier.name) add(`Hotel level ${index + 1}: add a name`);
    tier.hotels.forEach((hotel, hotelIndex) => {
      if (!hotel.city || !hotel.name) add(`${label}: hotel ${hotelIndex + 1} needs a city and a hotel name`);
    });
  });

  if (details.groupBands.length === 0) add('Add at least one group size');
  const bands = [...details.groupBands].sort((left, right) => left.min - right.min);
  for (let index = 1; index < bands.length; index += 1) {
    if (bands[index].min !== bands[index - 1].max + 1) {
      add(`Group sizes must follow on without gaps or overlaps: ${bandLabel(bands[index - 1])} is followed by ${bandLabel(bands[index])}`);
    }
  }
  if (bands.length > 0 && bands[0].min === 1 && !details.rooms.allowSingle) {
    add('A solo traveller needs a single room — allow single rooms or start group sizes at 2');
  }
  if (details.travellers.allowChildren && details.rooms.maxChildrenPerRoom === 0) {
    add('Children are welcome, but no room can take a child — set how many children can share a room');
  }
  if (details.travellers.allowInfants && details.rooms.maxInfantsPerRoom === 0) {
    add('Infants are welcome, but no room can take an infant — set how many infants can share a room');
  }

  const required = requiredRateFields(details);
  const missing: string[] = [];
  for (const tier of details.tiers) {
    for (const season of details.seasons) {
      for (const band of bands) {
        const cell = details.rates.find((row) => row.tierKey === tier.key && row.seasonKey === season.key && row.bandKey === band.key);
        const where = `${named(tier.name, 'Hotel level')} · ${named(season.name, 'Season')} · ${bandLabel(band)}`;
        for (const { field, label } of RATE_FIELDS) {
          if (!required.includes(field)) continue;
          const value = cell?.[field];
          if (value === null || value === undefined) missing.push(`${where}: ${label} missing`);
          else if (field !== 'child' && field !== 'infant' && value <= 0) missing.push(`${where}: ${label} must be more than zero`);
        }
      }
    }
  }
  problems.push(...missing);

  details.extras.forEach((extra, index) => {
    const label = named(extra.name, `Extra ${index + 1}`);
    if (!extra.name) add(`Extra ${index + 1}: add a name`);
    if (extra.price === null) add(`${label}: set a price`);
  });

  if (details.cancellation.length === 0) {
    add('Add the cancellation terms (a single rule with 0 % refund means non-refundable)');
  }
  const rules = [...details.cancellation].sort((left, right) => right.daysBefore - left.daysBefore);
  for (let index = 1; index < rules.length; index += 1) {
    if (rules[index].refundPercent > rules[index - 1].refundPercent) {
      add(`Cancelling ${rules[index].daysBefore} days before cannot refund more than cancelling ${rules[index - 1].daysBefore} days before`);
    }
  }

  if (details.durationDays !== undefined) {
    const days = new Set(details.itinerary.map((entry) => entry.day));
    for (let day = 1; day <= details.durationDays; day += 1) {
      if (!days.has(day)) add(`Itinerary: day ${day} is missing`);
    }
    details.itinerary
      .filter((entry) => entry.day > (details.durationDays as number))
      .forEach((entry) => add(`Itinerary: day ${entry.day} is after the last day of a ${details.durationDays}-day trip`));
  }
  details.itinerary.forEach((entry) => {
    if (!entry.title) add(`Itinerary: day ${entry.day} needs a title`);
  });

  if (problems.length <= MAX_PUBLISH_PROBLEMS) return problems;
  return [...problems.slice(0, MAX_PUBLISH_PROBLEMS - 1), `…and ${problems.length - (MAX_PUBLISH_PROBLEMS - 1)} more to fix`];
}

/**
 * What a storefront may show about a package: everything descriptive, never the raw rate
 * matrix (prices reach customers only through the server-computed quote and calendar, with
 * the service fee inside them).
 */
const shownPrice = (amount: number): number => withServiceFeeCents(Math.round(amount * 100)) / 100;

export const publicPackageDetails = (value: unknown): Record<string, unknown> | undefined => {
  const details = readPackageDetails(value);
  if (!details) return undefined;
  return {
    version: details.version,
    durationDays: details.durationDays,
    durationNights: details.durationNights,
    startCity: details.startCity,
    endCity: details.endCity,
    departureMode: details.departureMode,
    minNoticeDays: details.minNoticeDays,
    tiers: details.tiers.map(({ key: tierKey, name, description, hotels }) => ({ key: tierKey, name, description, hotels })),
    groupBands: [...details.groupBands].sort((left, right) => left.min - right.min).map(({ min, max }) => ({ min, max })),
    rooms: details.rooms,
    travellers: details.travellers,
    // Extras have one fixed price each, shown before the visitor adds one — with the service fee
    // inside, rounded exactly as the quote rounds it. Room rates stay server-side (they depend on
    // date, group size and occupancy and reach customers only through the quote and calendar).
    extras: details.extras
      .filter((extra) => extra.price !== null)
      .map(({ id, name, description, unit, maxQuantity, price, priceChild }) => ({
        id,
        name,
        description,
        unit,
        maxQuantity,
        price: shownPrice(price as number),
        ...(unit === 'per_traveller' && priceChild !== null ? { priceChild: shownPrice(priceChild) } : {}),
      })),
    cancellation: [...details.cancellation].sort((left, right) => right.daysBefore - left.daysBefore),
    itinerary: [...details.itinerary].sort((left, right) => left.day - right.day),
  };
};
