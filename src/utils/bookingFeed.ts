import { createHmac, timingSafeEqual } from 'crypto';
import { Types } from 'mongoose';

/**
 * The booking feed the Foxes booking API reads (booking platform Phase 2, "Feed contract"; the EEO
 * website serves the same contract). Every Attraction Network site flows in (owner decision D2,
 * 10 Oct 2026).
 *
 * - One signed consumer. `x-foxes-feed-signature: t=<unix>,v1=<hex HMAC-SHA256(secret,
 *   "<t>.GET <path>?<sorted, percent-encoded query>")>`, five minutes either way. Anything else is a
 *   401 that never says why.
 * - Changes since a cursor in (updatedAt, _id) order, or the bookings with a service day inside a
 *   window, in _id order.
 * - One feed item per booked service: a booking holds up to ten `items`, each with its own day,
 *   time, option and guests, and operations runs each one as its own booking. The reference is the
 *   booking's for a one-item booking and `<reference>/<n>` for item n of a longer one (items never
 *   change after a booking is made, so n is stable).
 * - Nothing is logged about a guest.
 */

export const FEED_SIGNATURE_HEADER = 'x-foxes-feed-signature';
export const FEED_SIGNATURE_WINDOW_S = 300;
export const FEED_SECRET_MIN_BYTES = 32;
/** The booking API refuses a page with more items than this, so a page never carries more. */
export const FEED_PAGE_LIMIT = 100;
/** Writes in flight settle before they are read, so a commit that lands late is not skipped. */
export const FEED_SETTLE_MS = 10_000;
const WINDOW_MAX_DAYS = 120;

export function canonicalFeedQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) => (aKey < bKey ? -1 : aKey > bKey ? 1 : aValue < bValue ? -1 : aValue > bValue ? 1 : 0))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/** True only for a well-formed, in-window signature of exactly this request. The secret is used as configured. */
export function verifyFeedSignature(
  secret: string,
  header: string | null | undefined,
  method: string,
  pathname: string,
  params: URLSearchParams,
  nowS: number,
): boolean {
  if (!header || Buffer.byteLength(secret, 'utf8') < FEED_SECRET_MIN_BYTES) return false;
  const match = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(header.trim());
  if (!match) return false;
  const t = Number(match[1]);
  if (!Number.isSafeInteger(t) || Math.abs(nowS - t) > FEED_SIGNATURE_WINDOW_S) return false;
  const signing = `${t}.${method.toUpperCase()} ${pathname}?${canonicalFeedQuery(params)}`;
  const expected = createHmac('sha256', secret).update(signing).digest();
  const given = Buffer.from(match[2], 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export class FeedRequestError extends Error {
  constructor(public readonly field: string) {
    super(`Invalid ${field}`);
    this.name = 'FeedRequestError';
  }
}

export type FeedRequest =
  | { mode: 'changes'; limit: number; since: Date | null; after: { at: Date; id: Types.ObjectId } | null }
  | { mode: 'window'; limit: number; serviceFrom: string; serviceTo: string; after: { id: Types.ObjectId } | null };

/** Changes cursors carry (updatedAt, _id); window cursors carry the _id only and say so, so one is never read as the other. */
const encodeChangesCursor = (at: Date, id: unknown) => Buffer.from(JSON.stringify({ a: at.toISOString(), i: String(id) })).toString('base64url');
const encodeWindowCursor = (id: unknown) => Buffer.from(JSON.stringify({ w: 1, i: String(id) })).toString('base64url');

function decodeCursor(raw: string, mode: FeedRequest['mode']): { at: Date; id: Types.ObjectId } | { id: Types.ObjectId } {
  try {
    if (raw.length <= 512) {
      const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      if (value && typeof value === 'object' && typeof value.i === 'string' && /^[a-f0-9]{24}$/.test(value.i)) {
        const id = new Types.ObjectId(value.i);
        if (mode === 'window' && value.w === 1 && !('a' in value)) return { id };
        const at = new Date(value.a);
        if (mode === 'changes' && !('w' in value) && typeof value.a === 'string' && Number.isFinite(at.getTime())) return { at, id };
      }
    }
  } catch { /* refused below */ }
  throw new FeedRequestError('cursor');
}

export const isCalendarDay = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** The request's own parameters, strictly: an unknown or repeated parameter, or mixed modes, is refused. */
export function parseFeedRequest(params: URLSearchParams): FeedRequest {
  const allowed = new Set(['limit', 'cursor', 'since', 'serviceFrom', 'serviceTo']);
  for (const key of params.keys()) if (!allowed.has(key)) throw new FeedRequestError(key);
  for (const key of allowed) if (params.getAll(key).length > 1) throw new FeedRequestError(key);
  const rawLimit = params.get('limit');
  const limit = rawLimit === null ? FEED_PAGE_LIMIT : Number(rawLimit);
  if (!/^\d{1,3}$/.test(rawLimit ?? '100') || !Number.isInteger(limit) || limit < 1 || limit > FEED_PAGE_LIMIT) throw new FeedRequestError('limit');
  const cursor = params.get('cursor');
  const serviceFrom = params.get('serviceFrom');
  const serviceTo = params.get('serviceTo');
  if (serviceFrom !== null || serviceTo !== null) {
    if (params.has('since')) throw new FeedRequestError('since');
    if (!isCalendarDay(serviceFrom)) throw new FeedRequestError('serviceFrom');
    if (!isCalendarDay(serviceTo)) throw new FeedRequestError('serviceTo');
    const days = (Date.parse(`${serviceTo}T00:00:00Z`) - Date.parse(`${serviceFrom}T00:00:00Z`)) / 86_400_000;
    if (days < 0 || days > WINDOW_MAX_DAYS) throw new FeedRequestError('serviceTo');
    const after = cursor ? decodeCursor(cursor, 'window') as { id: Types.ObjectId } : null;
    return { mode: 'window', limit, serviceFrom, serviceTo, after };
  }
  const after = cursor ? decodeCursor(cursor, 'changes') as { at: Date; id: Types.ObjectId } : null;
  const rawSince = params.get('since');
  let since: Date | null = null;
  if (rawSince !== null) {
    if (cursor) throw new FeedRequestError('since');
    since = new Date(rawSince);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(rawSince) || !Number.isFinite(since.getTime())) throw new FeedRequestError('since');
  }
  return { mode: 'changes', limit, since, after };
}

/**
 * The query and order for one page. Bundle component bookings are named on purpose: they are the
 * services a bundle's guests actually take (the model hides them from generic queries), and
 * operations runs each one. The caller reads `limit + 1` bookings to know whether more follow.
 */
export function feedQuery(request: FeedRequest, now: Date): { filter: Record<string, unknown>; sort: Record<string, 1> } {
  const and: Record<string, unknown>[] = [];
  if (request.mode === 'changes') {
    and.push({ updatedAt: { $lte: new Date(now.getTime() - FEED_SETTLE_MS) } });
    if (request.after) and.push({ $or: [{ updatedAt: { $gt: request.after.at } }, { updatedAt: request.after.at, _id: { $gt: request.after.id } }] });
    else if (request.since) and.push({ updatedAt: { $gte: request.since } });
    return { filter: { $and: and }, sort: { updatedAt: 1, _id: 1 } };
  }
  // A booking's items may fall on several days, so the window pages by _id alone: an order on the
  // item day would read a booking that spans the page edge again and again. One item must fall
  // inside the window ($elemMatch), not one item after its start and another before its end.
  and.push({ items: { $elemMatch: { date: { $gte: request.serviceFrom, $lte: request.serviceTo } } } });
  if (request.after) and.push({ _id: { $gt: request.after.id } });
  return { filter: { $and: and }, sort: { _id: 1 } };
}

/** The position after the last booking a page covered, in the order of this request's mode. */
export function cursorAfter(request: FeedRequest, row: { _id: unknown; updatedAt?: Date | string | null }): string {
  return request.mode === 'changes' ? encodeChangesCursor(new Date(row.updatedAt as Date | string), row._id) : encodeWindowCursor(row._id);
}

export type FeedBookingItemRow = {
  optionId?: string | null;
  optionName?: string | null;
  date?: string | null;
  time?: string | null;
  quantities?: { adults?: number | null; children?: number | null; infants?: number | null } | null;
  totalPrice?: number | null;
  hotelPickup?: { status?: string | null; address?: string | null; hotelName?: string | null; roomNumber?: string | null; pickupTime?: string | null } | null;
};

export type FeedBookingRow = {
  _id: unknown;
  reference?: string | null;
  tenantId?: unknown;
  sellerTenantId?: unknown;
  attractionId?: unknown;
  items?: FeedBookingItemRow[] | null;
  guestDetails?: { firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null } | null;
  total?: number | null;
  refundedAmount?: number | null;
  currency?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  attendanceStatus?: string | null;
  bundleOrderId?: unknown;
  updatedAt?: Date | string | null;
};

export type FeedSite = { slug?: string | null; timezone?: string | null };
export type FeedTour = { title?: string | null };

/** Display text: control characters become spaces, runs of space collapse, and it is cut to fit. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = [...value].map((char) => (char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f ? ' ' : char)).join('').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : null;
}

/** A contact detail is never cut: one that does not fit is left out rather than corrupted. */
function contact(value: unknown, max: number): string | null {
  const clean = text(value, Number.MAX_SAFE_INTEGER);
  return clean && clean.length <= max ? clean : null;
}

const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const clock = (value: unknown): string | null => (typeof value === 'string' && CLOCK.test(value.trim()) ? value.trim() : null);

/** ISO 4217 minor units for the currencies that do not use two. */
const CURRENCY_DECIMALS: Readonly<Record<string, number>> = Object.freeze({
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, UGX: 0, XAF: 0, XOF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
});
const decimalsOf = (currency: string) => CURRENCY_DECIMALS[currency] ?? 2;
const toMinor = (value: number, currency: string) => Math.round(value * 10 ** decimalsOf(currency));
/** Formats minor units exactly (no floating-point division). */
const fromMinor = (minor: number, currency: string) => {
  const decimals = decimalsOf(currency);
  if (decimals === 0) return { value: String(minor), currency };
  const digits = String(minor).padStart(decimals + 1, '0');
  return { value: `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`, currency };
};

/**
 * Splits a booking amount (minor units) over its items in proportion to each item's own price
 * (minor units), in exact integer arithmetic, the remainder going to the last item, so the parts
 * always add up to the booking amount. Items without a usable price share equally.
 */
export function splitOverItems(totalMinor: number, weightsMinor: number[]): number[] {
  if (weightsMinor.length <= 1) return [totalMinor];
  const usable = weightsMinor.map((weight) => (Number.isSafeInteger(weight) && weight > 0 ? BigInt(weight) : 0n));
  const sum = usable.reduce((total, weight) => total + weight, 0n);
  const total = BigInt(totalMinor);
  const parts = sum > 0n ? usable.map((weight) => (total * weight) / sum) : usable.map(() => total / BigInt(usable.length));
  parts[parts.length - 1] += total - parts.reduce((assigned, part) => assigned + part, 0n);
  return parts.map(Number);
}

const STATUS: Readonly<Record<string, string>> = Object.freeze({
  pending: 'pending', confirmed: 'confirmed', completed: 'completed', cancelled: 'cancelled', refunded: 'cancelled',
});

/**
 * A card checkout that has not been paid yet (an open payment, a declined card or a bundle still
 * waiting for its payment) is not a booking for operations: it is left out until it is paid. It can
 * never have been sent before, so nothing that was taken in is ever left without its update; once
 * paid, cancelled or expired its `updatedAt` moves and the feed sends it.
 */
export const isOpenCardCheckout = (row: Pick<FeedBookingRow, 'status' | 'paymentMethod'>) => row.status === 'pending' && row.paymentMethod === 'card';

/**
 * The feed items for one booking, one per booked service, or [] when the booking is not one
 * operations takes in (an open card checkout, or no reference). An unknown status is passed on as
 * it is, so the booking API records "status not understood" instead of guessing.
 */
export function toFeedItems(row: FeedBookingRow, site: FeedSite | null, tour: FeedTour | null): Record<string, unknown>[] {
  const reference = text(row.reference, 110);
  const updatedAt = row.updatedAt ? new Date(row.updatedAt) : null;
  const items = Array.isArray(row.items) ? row.items : [];
  if (!reference || !updatedAt || !Number.isFinite(updatedAt.getTime()) || !items.length || isOpenCardCheckout(row)) return [];
  const currency = String(row.currency || '').trim().toUpperCase();
  const validCurrency = /^[A-Z]{3}$/.test(currency);
  const total = Number(row.total);
  const refunded = Math.max(0, Number(row.refundedAmount) || 0);
  const rawStatus = String(row.status || '');
  const cancelled = rawStatus === 'cancelled' || rawStatus === 'refunded';
  const status = !cancelled && row.attendanceStatus === 'no-show' ? 'no_show' : STATUS[rawStatus] ?? rawStatus.toLowerCase();
  const paymentStatus = row.paymentStatus === 'refunded' || (total > 0 && refunded >= total) ? 'refunded'
    : refunded > 0 ? 'partially_refunded'
      : row.paymentStatus === 'succeeded' ? 'paid'
        : 'unpaid';
  // "Pay later / pay at location": the guest pays when they arrive, so the driver or guide collects it.
  const collectsOnTheDay = !cancelled && ['pay-later', 'cash'].includes(String(row.paymentMethod)) && row.paymentStatus !== 'succeeded' && row.paymentStatus !== 'refunded';
  const weights = items.map((item) => toMinor(Number(item.totalPrice), currency));
  const totalMinor = validCurrency && Number.isFinite(total) && total >= 0 ? toMinor(total, currency) : null;
  const amountParts = totalMinor === null ? null : splitOverItems(totalMinor, weights);
  const dueMinor = totalMinor === null ? 0 : totalMinor - toMinor(refunded, currency);
  const dueParts = collectsOnTheDay && dueMinor > 0 ? splitOverItems(dueMinor, weights) : null;
  const guest = row.guestDetails && typeof row.guestDetails === 'object' ? row.guestDetails : null;
  const siteSlug = text(site?.slug, 80);
  const timezone = text(site?.timezone, 64);

  return items.map((item, index) => {
    const adults = Math.max(0, Math.floor(Number(item.quantities?.adults) || 0));
    const children = Math.max(0, Math.floor(Number(item.quantities?.children) || 0));
    const infants = Math.max(0, Math.floor(Number(item.quantities?.infants) || 0));
    const guests = adults + children + infants;
    const breakdown = [['Adults', adults], ['Children', children], ['Infants', infants]]
      .filter(([, count]) => Number(count) > 0)
      .map(([label, count]) => ({ label, count }));
    const pickup = item.hotelPickup && typeof item.hotelPickup === 'object' ? item.hotelPickup : null;
    const due = dueParts?.[index] ?? 0;
    return {
      source: 'atn',
      externalRef: items.length === 1 ? reference : `${reference}/${index + 1}`,
      sourceBookingId: String(row._id),
      sourceSite: siteSlug,
      status,
      paymentStatus,
      tour: {
        name: text(tour?.title, 200) || 'Tour no longer listed',
        code: row.attractionId ? String(row.attractionId) : null,
        option: text(item.optionName, 200),
      },
      serviceDate: isCalendarDay(item.date) ? item.date : null,
      serviceTime: clock(item.time),
      timezone,
      guests: {
        total: Math.min(guests, 999),
        ...(breakdown.length && guests <= 999 ? { breakdown } : {}),
      },
      amount: amountParts ? fromMinor(amountParts[index], currency) : null,
      customer: {
        name: text(`${guest?.firstName || ''} ${guest?.lastName || ''}`, 160),
        email: contact(guest?.email, 254),
        phone: contact(guest?.phone, 32),
        locale: null,
      },
      pickup: pickup && pickup.status !== 'provide_later'
        ? { hotel: text(pickup.hotelName, 200) || text(pickup.address, 200), room: text(pickup.roomNumber, 40), time: clock(pickup.pickupTime) }
        : null,
      collect: due > 0 ? fromMinor(due, currency) : null,
      updatedAt: updatedAt.toISOString(),
    };
  });
}

/** Only the services inside a window page's days (a booking's other items arrive through changes). */
export function inWindow(item: Record<string, unknown>, request: FeedRequest): boolean {
  if (request.mode !== 'window') return true;
  const day = item.serviceDate as string | null;
  return Boolean(day && day >= request.serviceFrom && day <= request.serviceTo);
}

/**
 * Builds one page from the bookings read (up to `limit + 1`, in the request's order): whole
 * bookings only, never more than `limit` items. The cursor is the last booking the page covered,
 * including bookings that contributed no item, so paging always moves forward; an empty read keeps
 * the position it was asked from.
 */
export function buildFeedPage(
  request: FeedRequest,
  rows: FeedBookingRow[],
  lookup: (row: FeedBookingRow) => { site: FeedSite | null; tour: FeedTour | null },
  incomingCursor: string | null,
): { items: Record<string, unknown>[]; hasMore: boolean; nextCursor: string | null } {
  const items: Record<string, unknown>[] = [];
  let covered = 0;
  for (const row of rows.slice(0, request.limit)) {
    const { site, tour } = lookup(row);
    const own = toFeedItems(row, site, tour).filter((item) => inWindow(item, request));
    // A booking is never split across pages. One that alone has more services than a page holds
    // (the booking form allows ten) is sent on its own page with its first `limit` services.
    if (items.length && items.length + own.length > request.limit) break;
    items.push(...own.slice(0, request.limit));
    covered += 1;
  }
  const last = rows[covered - 1];
  return {
    items,
    hasMore: rows.length > covered,
    nextCursor: last ? cursorAfter(request, last) : incomingCursor,
  };
}
