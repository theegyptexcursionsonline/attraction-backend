import { ClientSession, Types } from 'mongoose';
import { z } from 'zod';
import { Availability } from '../models/Availability';
import { bookingDate } from './bookingInventory.service';
import { isoDateSchema, PackageDetails } from '../utils/packageDetails';
import { PackageQuote, PackageQuoteCharge, PackageQuoteExtra } from './packagePricing.service';
import { PackageArrivalDetails, PackageTravellerDetails } from './packageGuestDetails.service';

/**
 * Package bookings on the shared booking rails. A package booking is an ordinary Booking (one
 * line, card payment through the existing payment endpoints, hold expiry, cancellation and
 * refunds), plus a `packageBooking` snapshot of exactly what was quoted. Every amount on the
 * booking has the service fee inside it, as the customer saw it; the fee itself is recorded in
 * the snapshot.
 */

export const PACKAGE_OPTION_PREFIX = 'package:';

export class PackageSeatsUnavailableError extends Error {
  constructor() { super('PACKAGE_SEATS_UNAVAILABLE'); }
}

/**
 * Takes the seats inside the booking transaction, checked in the same write that takes them:
 * two customers racing for the last places cannot both get them. A fixed departure must already
 * exist (a date without one is refused, never created); an any-day package creates the day's row
 * on first booking and measures it against the package's current daily capacity. Infants take no
 * seat. Released by the shared hold-expiry and cancellation paths through
 * `inventoryReservations`.
 */
export async function reservePackageSeats(
  attractionId: Types.ObjectId,
  details: PackageDetails,
  date: string,
  guests: number,
  session?: ClientSession,
): Promise<void> {
  const day = bookingDate(date);
  const options = session ? { session } : {};
  const fits = (capacity: unknown) => ({ $expr: { $lte: [{ $add: [{ $ifNull: ['$allDayBooked', 0] }, guests] }, capacity] } });
  if (details.departureMode === 'daily') {
    await Availability.updateOne(
      { attractionId, date: day },
      { $setOnInsert: { timeSlots: [], allDayCapacity: details.daily.dailyCapacity, allDayBooked: 0, isBlocked: false } },
      { ...options, upsert: true },
    );
    const reserved = await Availability.findOneAndUpdate(
      { attractionId, date: day, isBlocked: { $ne: true }, ...fits(details.daily.dailyCapacity) },
      { $inc: { allDayBooked: guests } },
      { ...options, new: true },
    );
    if (!reserved) throw new PackageSeatsUnavailableError();
    return;
  }
  const reserved = await Availability.findOneAndUpdate(
    { attractionId, date: day, isBlocked: { $ne: true }, allDayCapacity: { $type: 'number' }, ...fits('$allDayCapacity') },
    { $inc: { allDayBooked: guests } },
    { ...options, new: true },
  );
  if (!reserved) throw new PackageSeatsUnavailableError();
}

const cents = (value: number): number => Math.round(value * 100);

const durationLabel = (details: Pick<PackageDetails, 'durationDays' | 'durationNights'>): string => {
  if (!details.durationDays) return '';
  const nights = details.durationNights === undefined ? '' : ` / ${details.durationNights} night${details.durationNights === 1 ? '' : 's'}`;
  return `${details.durationDays} days${nights}`;
};

const extraChargeName = (extra: PackageQuoteExtra, charge: PackageQuoteCharge): string => {
  if (extra.unit === 'per_traveller') return `${extra.name} (${charge.traveller === 'child' ? 'children' : 'adults'})`;
  if (extra.unit === 'per_room') return `${extra.name} (${extra.quantity ?? 1} × ${extra.rooms ?? 1} room${extra.rooms === 1 ? '' : 's'})`;
  return extra.name;
};

/**
 * The booking line every shared surface reads (admin lists, emails, ticket, settlement): the
 * hotel level and duration, the travellers, the rooms total and each extra as an add-on — every
 * figure fee-inclusive, so the line and its add-ons add up to the booking total.
 */
export function packageBookingItem(details: PackageDetails, quote: PackageQuote) {
  const roomsCents = quote.rooms.reduce((sum, room) => sum + cents(room.amount), 0);
  const payers = quote.travellers.adults + quote.travellers.children;
  const duration = durationLabel(details);
  return {
    optionId: `${PACKAGE_OPTION_PREFIX}${quote.tier.key}`,
    optionName: duration ? `${quote.tier.name} · ${duration}` : quote.tier.name,
    date: quote.departureDate,
    quantities: { ...quote.travellers },
    unitPrice: Math.round(roomsCents / Math.max(payers, 1)) / 100,
    totalPrice: roomsCents / 100,
    addons: quote.extras.flatMap((extra) => extra.charges.map((charge) => ({
      id: charge.rate === 'extra-child' ? `${extra.id}:child` : extra.id,
      name: extraChargeName(extra, charge),
      price: charge.unitPrice,
      quantity: charge.quantity,
      pricingType: 'per_unit' as const,
      totalPrice: charge.amount,
    }))),
  };
}

const cancellationRuleSchema = z.object({ daysBefore: z.number().int().min(0), refundPercent: z.number().int().min(0).max(100), cancelBy: z.string() });

/** The stored snapshot, read back for decisions (cancellation). Anything else is not a package booking. */
export const packageBookingSnapshotSchema = z.object({
  version: z.literal(1),
  departureDate: z.string(),
  returnDate: z.string(),
  cancellationReferenceDate: isoDateSchema.optional(),
  cancellation: z.array(cancellationRuleSchema),
}).passthrough();

export type PackageBookingSnapshot = ReturnType<typeof packageBookingSnapshot>;

export function packageBookingSnapshot(input: {
  details: PackageDetails;
  quote: PackageQuote;
  quoteHash: string;
  travellerNames?: string[];
  travellerDetails?: PackageTravellerDetails;
  arrivalDetails?: PackageArrivalDetails;
}) {
  const { details, quote } = input;
  const tier = details.tiers.find((candidate) => candidate.key === quote.tier.key);
  const names = input.travellerDetails?.map((traveller) => traveller.name) ?? input.travellerNames;
  return {
    version: 1 as const,
    departureDate: quote.departureDate,
    returnDate: quote.returnDate,
    ...(quote.cancellationReferenceDate ? { cancellationReferenceDate: quote.cancellationReferenceDate } : {}),
    ...(quote.packageRevision !== undefined ? { packageRevision: quote.packageRevision } : {}),
    ...(details.durationDays !== undefined ? { durationDays: details.durationDays } : {}),
    ...(details.durationNights !== undefined ? { durationNights: details.durationNights } : {}),
    startCity: details.startCity,
    endCity: details.endCity,
    tier: { key: quote.tier.key, name: quote.tier.name, hotels: structuredClone(tier?.hotels ?? []) },
    season: { ...quote.season },
    groupSize: { ...quote.groupSize },
    travellers: { ...quote.travellers },
    ...(input.travellerDetails?.length ? { travellerDetails: structuredClone(input.travellerDetails) } : {}),
    ...(names?.length ? { travellerNames: [...names] } : {}),
    ...(input.arrivalDetails ? { arrivalDetails: { ...input.arrivalDetails } } : {}),
    bookingRequirements: { ...details.bookingRequirements },
    rooms: structuredClone(quote.rooms),
    extras: structuredClone(quote.extras),
    total: quote.total,
    serviceFee: quote.serviceFee,
    operatorSubtotal: quote.subtotal,
    perPerson: quote.perPerson,
    feeBasisPoints: quote.feeBasisPoints,
    quoteHash: input.quoteHash,
    cancellation: [...details.cancellation]
      .sort((left, right) => right.daysBefore - left.daysBefore)
      .map((rule) => ({ ...rule, cancelBy: shiftDays(quote.cancellationReferenceDate ?? quote.departureDate, -rule.daysBefore) })),
  };
}

const DAY_MS = 86_400_000;
const shiftDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS);

/**
 * The refund the package's terms give for cancelling on `today` (operator day): the rule with the
 * largest "at least N days before" that the cancellation still meets; nothing once every deadline
 * has passed.
 */
export function packageRefundPercentOn(
  cancellation: Array<{ daysBefore: number; refundPercent: number }>,
  departureDate: string,
  today: string,
): number {
  const daysBefore = daysBetween(today, departureDate);
  let applicable: { daysBefore: number; refundPercent: number } | null = null;
  for (const rule of cancellation) {
    if (rule.daysBefore <= daysBefore && (!applicable || rule.daysBefore > applicable.daysBefore)) applicable = rule;
  }
  return applicable ? applicable.refundPercent : 0;
}

/**
 * Why a customer may not cancel this paid package booking themselves, or null. Cancelling through
 * the shared path refunds the whole payment, so a customer may do it only while the trip's terms
 * give a full refund; later cancellations go to the operator, who can refund what the terms give.
 * Unpaid bookings have nothing to refund and stay cancellable.
 */
export function packageSelfCancellationProblem(booking: { packageBooking?: unknown; paymentStatus?: string }, today: string): string | null {
  if (booking.packageBooking === undefined || booking.packageBooking === null) return null;
  if (booking.paymentStatus !== 'succeeded') return null;
  const snapshot = packageBookingSnapshotSchema.safeParse(booking.packageBooking);
  if (!snapshot.success) return 'Please contact us to cancel this trip.';
  if (snapshot.data.cancellationReferenceDate && today >= snapshot.data.cancellationReferenceDate) {
    return 'This booking has reached its first service date. Please contact us to cancel this trip.';
  }
  const percent = packageRefundPercentOn(snapshot.data.cancellation, snapshot.data.cancellationReferenceDate ?? snapshot.data.departureDate, today);
  if (percent >= 100) return null;
  return percent > 0
    ? `Under this trip's terms, cancelling now refunds ${percent}% of the price. Please contact us to cancel and we will arrange that refund.`
    : 'Under this trip\'s terms, cancelling now is not refundable. Please contact us if you need to cancel.';
}

const dayCount = (days: number): string => `${days} day${days === 1 ? '' : 's'}`;
const refundWords = (percent: number): string => (percent === 100 ? 'full refund' : percent === 0 ? 'no refund' : `${percent}% refund`);

/**
 * The cancellation terms in words, stored as the listing's `cancellationPolicy` so every shared
 * surface (confirmation email, ticket, storefront) states the package's real schedule rather than
 * the tour default.
 */
export function cancellationPolicyText(rules: Array<{ daysBefore: number; refundPercent: number }>): string {
  const sorted = [...rules].sort((left, right) => right.daysBefore - left.daysBefore);
  if (sorted.length === 0) return '';
  if (sorted.length === 1 && sorted[0].daysBefore === 0) {
    return sorted[0].refundPercent === 0 ? 'Non-refundable.' : `${sorted[0].refundPercent === 100 ? 'Full' : `${sorted[0].refundPercent}%`} refund if you cancel before departure.`;
  }
  const sentences = sorted.map((rule, index) => {
    if (rule.daysBefore === 0) return `Later: ${refundWords(rule.refundPercent)}.`;
    return index === 0
      ? `Cancel at least ${dayCount(rule.daysBefore)} before departure: ${refundWords(rule.refundPercent)}.`
      : `At least ${dayCount(rule.daysBefore)} before: ${refundWords(rule.refundPercent)}.`;
  });
  if (sorted[sorted.length - 1].daysBefore > 0) sentences.push('Later: no refund.');
  return sentences.join(' ');
}
