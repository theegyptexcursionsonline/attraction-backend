import { Router, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import mongoose, { ClientSession } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { OctoHold } from '../models/OctoHold';
import { authenticateApiKey, requireScope } from '../middleware/apiKey.middleware';
import { AuthRequest } from '../types';
import {
  toOctoSupplier,
  toOctoProduct,
  toOctoAvailability,
  toOctoBooking,
  octoUnitType,
  OctoTenantLike,
  OctoAttractionLike,
} from '../octo/mappers';

// OCTO (octo.travel) supplier API — the standard channel-manager / OTA contract.
//   Increment 1: catalogue (supplier + products)
//   Increment 2: availability (read) + booking lifecycle (reserve→confirm→cancel)
// Auth reuses the tenant-scoped API-key system; responses are RAW OCTO shapes.
// Consumer-side adapters (calling Booking.com / Trip.com / GYG) are increment 3
// and are the only part gated on external OTA credentials.
const router = Router();
router.use(authenticateApiKey);

const DEFAULT_CAPACITY = 25; // matches GET /attractions/:id/availability
const HOLD_TTL_MS = 30 * 60 * 1000;
const octoErr = (res: Response, code: number, error: string, msg: string) =>
  res.status(code).json({ error, errorMessage: msg });

// availabilityId is a local datetime ('2026-07-10T09:00:00') or a date ('2026-07-10').
export function parseAvailabilityId(id: string): { localDate: string; startTime: string | null } | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::00)?)?$/.exec(String(id));
  if (!match) return null;
  const [, localDate, hour, minute] = match;
  const day = new Date(`${localDate}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== localDate) return null;
  if (hour !== undefined && (Number(hour) > 23 || Number(minute) > 59)) return null;
  return { localDate, startTime: hour === undefined ? null : `${hour}:${minute}` };
}

// Vacancies for a product on a date/slot, mirroring the storefront availability
// logic (blocked → closed; else capacity − booked; default 25 when no record).
async function vacanciesFor(
  attractionId: unknown,
  localDate: string,
  startTime: string | null,
): Promise<{ vacancies: number; capacity: number; blocked: boolean }> {
  const day = new Date(`${localDate}T00:00:00.000Z`);
  const rec = await Availability.findOne({ attractionId, date: day }).lean();
  if (rec?.isBlocked) return { vacancies: 0, capacity: 0, blocked: true };
  if (startTime) {
    const slot = rec?.timeSlots?.find((s) => s.time === startTime);
    if (slot) return { vacancies: Math.max(0, slot.capacity - slot.booked), capacity: slot.capacity, blocked: false };
    return { vacancies: DEFAULT_CAPACITY, capacity: DEFAULT_CAPACITY, blocked: false };
  }
  const cap = rec?.allDayCapacity ?? DEFAULT_CAPACITY;
  const booked = rec?.allDayBooked ?? 0;
  return { vacancies: Math.max(0, cap - booked), capacity: cap, blocked: !!rec?.isBlocked };
}

async function ensureCapacityRecord(
  attractionId: unknown,
  localDate: string,
  startTime: string | null,
  session: ClientSession,
): Promise<void> {
  const day = new Date(`${localDate}T00:00:00.000Z`);
  await Availability.updateOne(
    { attractionId, date: day },
    { $setOnInsert: { attractionId, date: day, timeSlots: [], allDayCapacity: DEFAULT_CAPACITY, allDayBooked: 0, isBlocked: false } },
    { upsert: true, session },
  );
  if (startTime) {
    await Availability.updateOne(
      { attractionId, date: day, isBlocked: { $ne: true }, 'timeSlots.time': { $ne: startTime } },
      { $push: { timeSlots: { time: startTime, capacity: DEFAULT_CAPACITY, booked: 0 } } },
      { session },
    );
  } else {
    await Availability.updateOne(
      { attractionId, date: day, allDayCapacity: { $exists: false } },
      { $set: { allDayCapacity: DEFAULT_CAPACITY } },
      { session },
    );
  }
}

async function reserveCapacity(
  attractionId: unknown,
  localDate: string,
  startTime: string | null,
  quantity: number,
  session: ClientSession,
): Promise<boolean> {
  await ensureCapacityRecord(attractionId, localDate, startTime, session);
  const day = new Date(`${localDate}T00:00:00.000Z`);
  const base = { attractionId, date: day, isBlocked: { $ne: true } };
  const updated = startTime
    ? await Availability.findOneAndUpdate(
      {
        ...base,
        $expr: {
          $gte: [
            {
              $let: {
                vars: { slot: { $first: { $filter: { input: '$timeSlots', as: 'slot', cond: { $eq: ['$$slot.time', startTime] } } } } },
                in: { $subtract: ['$$slot.capacity', '$$slot.booked'] },
              },
            },
            quantity,
          ],
        },
      },
      { $inc: { 'timeSlots.$[slot].booked': quantity } },
      { new: true, session, arrayFilters: [{ 'slot.time': startTime }] },
    )
    : await Availability.findOneAndUpdate(
      { ...base, $expr: { $gte: [{ $subtract: ['$allDayCapacity', { $ifNull: ['$allDayBooked', 0] }] }, quantity] } },
      { $inc: { allDayBooked: quantity } },
      { new: true, session },
    );
  return !!updated;
}

async function releaseCapacity(
  attractionId: unknown,
  localDate: string,
  startTime: string | null,
  quantity: number,
  session: ClientSession,
): Promise<void> {
  const day = new Date(`${localDate}T00:00:00.000Z`);
  const updated = startTime
    ? await Availability.findOneAndUpdate(
      {
        attractionId,
        date: day,
        $expr: {
          $gte: [
            {
              $let: {
                vars: { slot: { $first: { $filter: { input: '$timeSlots', as: 'slot', cond: { $eq: ['$$slot.time', startTime] } } } } },
                in: '$$slot.booked',
              },
            },
            quantity,
          ],
        },
      },
      { $inc: { 'timeSlots.$[slot].booked': -quantity } },
      { new: true, session, arrayFilters: [{ 'slot.time': startTime }] },
    )
    : await Availability.findOneAndUpdate(
      { attractionId, date: day, allDayBooked: { $gte: quantity } },
      { $inc: { allDayBooked: -quantity } },
      { new: true, session },
    );
  if (!updated) throw new Error('OCTO inventory release failed: reserved capacity was not found');
}

const tenantOf = (req: AuthRequest) => req.tenant as unknown as OctoTenantLike;
async function findProduct(req: AuthRequest, productId: string) {
  const byId = /^[a-f\d]{24}$/i.test(productId) ? { _id: productId } : { slug: productId };
  return Attraction.findOne({ ...byId, tenantIds: req.tenant?._id }).lean();
}

// Unit lookup (id → { name, priceMinor }) from a product's pricing options.
function unitMap(a: OctoAttractionLike): Record<string, { name: string; priceMinor: number }> {
  const out: Record<string, { name: string; priceMinor: number }> = {};
  const opts = a.pricingOptions?.length ? a.pricingOptions : [{ id: 'adult', name: 'Adult', price: a.priceFrom || 0 }];
  for (const o of opts) out[o.id] = { name: o.name, priceMinor: Math.round((o.price || 0) * 100) };
  return out;
}

interface ValidatedUnitItem { unitId: string; quantity: number; unitPriceMinor: number }

function isSameReservation(
  hold: InstanceType<typeof OctoHold>,
  expected: {
    productId: string;
    optionId: string;
    availabilityId: string;
    currency: string;
    totalMinor: number;
    unitItems: ValidatedUnitItem[];
  },
): boolean {
  return hold.productId === expected.productId
    && hold.optionId === expected.optionId
    && hold.availabilityId === expected.availabilityId
    && hold.currency === expected.currency
    && hold.totalMinor === expected.totalMinor
    && hold.unitItems.length === expected.unitItems.length
    && hold.unitItems.every((item) => {
      const other = expected.unitItems.find((candidate) => candidate.unitId === item.unitId);
      if (!other) return false;
      return item.unitId === other.unitId
        && item.quantity === other.quantity
        && item.unitPriceMinor === other.unitPriceMinor;
    });
}

export function validateReservationRequest(
  product: OctoAttractionLike,
  optionId: unknown,
  availabilityId: unknown,
  unitItems: unknown,
): { localDate: string; startTime: string | null; items: ValidatedUnitItem[]; totalQty: number; totalMinor: number } | { error: string } {
  if (optionId !== 'DEFAULT') return { error: 'optionId is not valid for this product' };
  const parsed = parseAvailabilityId(String(availabilityId || ''));
  if (!parsed) return { error: 'availabilityId must be a valid local date or local start time' };

  const startTimes = [...new Set((product.entryWindows || []).map((w) => w.startTime).filter(Boolean))];
  const isSlotted = product.availability?.type === 'time-slots' && startTimes.length > 0;
  if (isSlotted && (!parsed.startTime || !startTimes.includes(parsed.startTime)))
    return { error: 'availabilityId does not belong to this product option' };
  if (!isSlotted && parsed.startTime) return { error: 'availabilityId does not belong to this all-day product option' };
  if (!Array.isArray(unitItems) || unitItems.length === 0) return { error: 'unitItems must contain at least one unit' };

  const units = unitMap(product);
  const seen = new Set<string>();
  const items: ValidatedUnitItem[] = [];
  let totalQty = 0;
  let totalMinor = 0;
  for (const raw of unitItems) {
    if (!raw || typeof raw !== 'object') return { error: 'unitItems must contain valid unit objects' };
    const { unitId, quantity } = raw as { unitId?: unknown; quantity?: unknown };
    if (typeof unitId !== 'string' || !units[unitId]) return { error: `Unknown unitId: ${String(unitId || '')}` };
    if (seen.has(unitId)) return { error: `Duplicate unitId: ${unitId}` };
    if (!Number.isInteger(quantity) || Number(quantity) <= 0) return { error: `quantity for ${unitId} must be a positive integer` };
    const unitPriceMinor = units[unitId].priceMinor;
    if (!Number.isInteger(unitPriceMinor) || unitPriceMinor <= 0) return { error: `unit ${unitId} must have a positive price` };
    seen.add(unitId);
    const qty = Number(quantity);
    items.push({ unitId, quantity: qty, unitPriceMinor });
    totalQty += qty;
    totalMinor += qty * unitPriceMinor;
  }
  return { ...parsed, items, totalQty, totalMinor };
}

// ── Catalogue ─────────────────────────────────────────────────────────────
router.get('/supplier', (req: AuthRequest, res: Response) => {
  res.json(toOctoSupplier(tenantOf(req), `${req.protocol}://${req.get('host')}/api/octo`));
});

router.get('/products', requireScope('read'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const list = await Attraction.find({ tenantIds: req.tenant?._id, status: 'active' }).limit(500).lean();
    res.json(list.map((a) => toOctoProduct(a as unknown as OctoAttractionLike, tenantOf(req))));
  } catch (err) { next(err); }
});

router.get('/products/:id', requireScope('read'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const a = await findProduct(req, req.params.id);
    if (!a) return void octoErr(res, 404, 'INVALID_PRODUCT_ID', 'Product not found');
    res.json(toOctoProduct(a as unknown as OctoAttractionLike, tenantOf(req)));
  } catch (err) { next(err); }
});

// ── Availability ────────────────────────────────────────────────────────────
// POST /octo/availability  { productId, optionId?, localDateStart, localDateEnd }
router.post('/availability', requireScope('read'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { productId, optionId = 'DEFAULT', localDateStart, localDateEnd } = req.body || {};
    if (!productId || !localDateStart) return void octoErr(res, 400, 'BAD_REQUEST', 'productId and localDateStart are required');
    const a = await findProduct(req, productId);
    if (!a) return void octoErr(res, 404, 'INVALID_PRODUCT_ID', 'Product not found');
    if (optionId !== 'DEFAULT') return void octoErr(res, 400, 'INVALID_OPTION_ID', 'Option does not belong to this product');
    const parsedStart = parseAvailabilityId(localDateStart);
    const parsedEnd = parseAvailabilityId(localDateEnd || localDateStart);
    if (!parsedStart || parsedStart.startTime || !parsedEnd || parsedEnd.startTime || parsedEnd.localDate < parsedStart.localDate)
      return void octoErr(res, 400, 'BAD_REQUEST', 'localDateStart and localDateEnd must be a valid ascending date range');
    const prod = a as unknown as OctoAttractionLike;
    const startTimes = (prod.entryWindows || []).map((w) => w.startTime).filter(Boolean);
    const isSlotted = prod.availability?.type === 'time-slots' && startTimes.length > 0;

    const start = new Date(`${parsedStart.localDate}T00:00:00.000Z`);
    const end = new Date(`${parsedEnd.localDate}T00:00:00.000Z`);
    const out: unknown[] = [];
    // Cap the range to protect the endpoint.
    for (let d = new Date(start), n = 0; d <= end && n < 62; d.setUTCDate(d.getUTCDate() + 1), n++) {
      const localDate = d.toISOString().slice(0, 10);
      if (isSlotted) {
        for (const st of startTimes) {
          const v = await vacanciesFor(a._id, localDate, st);
          out.push(toOctoAvailability({ localDate, startTime: st, vacancies: v.vacancies, capacity: v.capacity, blocked: v.blocked }));
        }
      } else {
        const v = await vacanciesFor(a._id, localDate, null);
        out.push(toOctoAvailability({ localDate, startTime: null, vacancies: v.vacancies, capacity: v.capacity, blocked: v.blocked }));
      }
    }
    res.json(out);
  } catch (err) { next(err); }
});

// ── Booking lifecycle ─────────────────────────────────────────────────────
// POST /octo/bookings — reserve a hold: { productId, optionId?, availabilityId, unitItems:[{unitId,quantity}] }
router.post('/bookings', requireScope('write'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { productId, optionId = 'DEFAULT', availabilityId, unitItems, uuid } = req.body || {};
    if (!productId || !availabilityId || !Array.isArray(unitItems) || unitItems.length === 0)
      return void octoErr(res, 400, 'BAD_REQUEST', 'productId, availabilityId and unitItems are required');
    if (uuid !== undefined && (typeof uuid !== 'string' || !uuid.trim()))
      return void octoErr(res, 400, 'BAD_REQUEST', 'uuid must be a non-empty string when supplied');

    const a = await findProduct(req, productId);
    if (!a) return void octoErr(res, 404, 'INVALID_PRODUCT_ID', 'Product not found');
    const prod = a as unknown as OctoAttractionLike;
    const validated = validateReservationRequest(prod, optionId, availabilityId, unitItems);
    if ('error' in validated) return void octoErr(res, 400, 'BAD_REQUEST', validated.error);
    const { localDate, startTime, items, totalQty, totalMinor } = validated;
    const currency = prod.currency || tenantOf(req).defaultCurrency || 'USD';
    const supplierTenantId = (a as { ownerTenantId?: unknown }).ownerTenantId || (a.tenantIds && a.tenantIds[0]);
    const idempotencyHeader = req.get('Idempotency-Key');
    const holdUuid = (typeof uuid === 'string' ? uuid.trim() : idempotencyHeader?.trim()) || randomUUID();
    const expected = {
      productId: String(a._id), optionId, availabilityId, currency, totalMinor, unitItems: items,
    };
    const session = await mongoose.startSession();
    let hold: InstanceType<typeof OctoHold> | null = null;
    let reused = false;
    try {
      try {
        await session.withTransaction(async () => {
          hold = null;
          reused = false;
          const existing = await OctoHold.findOne({ uuid: holdUuid, tenantId: req.tenant?._id }, null, { session });
          if (existing) {
            hold = existing;
            reused = true;
            return;
          }
          const ok = await reserveCapacity(a._id, localDate, startTime, totalQty, session);
          if (!ok) return;
          [hold] = await OctoHold.create([{
            uuid: holdUuid,
            status: 'ON_HOLD',
            tenantId: req.tenant?._id,
            supplierTenantId,
            attractionId: a._id,
            productId: expected.productId,
            optionId,
            availabilityId,
            localDate,
            startTime,
            unitItems: items,
            currency,
            totalMinor,
            expiresAt: new Date(Date.now() + HOLD_TTL_MS),
          }], { session });
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        hold = await OctoHold.findOne({ uuid: holdUuid, tenantId: req.tenant?._id });
        if (!hold) throw error;
        reused = true;
      }
    } finally {
      await session.endSession();
    }
    if (!hold) return void octoErr(res, 400, 'AVAILABILITY_SOLD_OUT', 'Not enough capacity for the requested date/time');
    if (reused && !isSameReservation(hold, expected))
      return void octoErr(res, 409, 'IDEMPOTENCY_CONFLICT', 'uuid or Idempotency-Key was already used for a different reservation');

    const resolvedHold = hold as InstanceType<typeof OctoHold>;
    const existingBooking = reused && resolvedHold.bookingId
      ? await Booking.findById(resolvedHold.bookingId).lean()
      : null;
    res.status(reused ? 200 : 201).json(
      toOctoBooking({
        uuid: resolvedHold.uuid,
        status: resolvedHold.status,
        productId: resolvedHold.productId,
        optionId: resolvedHold.optionId,
        availabilityId: resolvedHold.availabilityId,
        currency: resolvedHold.currency,
        totalMinor: resolvedHold.totalMinor,
        unitItems: resolvedHold.unitItems,
        reference: existingBooking?.reference ?? null,
        contact: resolvedHold.contact,
        utcHoldExpiration: resolvedHold.expiresAt?.toISOString() ?? null,
      }),
    );
  } catch (err) { next(err); }
});

async function expireHold(
  filter: Record<string, unknown>,
  now: Date,
): Promise<boolean> {
  const session = await mongoose.startSession();
  let expired = false;
  try {
    await session.withTransaction(async () => {
      expired = false;
      const hold = await OctoHold.findOneAndUpdate(
        { ...filter, status: 'ON_HOLD', expiresAt: { $lte: now } },
        { $set: { status: 'EXPIRED' } },
        { new: true, session },
      );
      if (!hold) return;
      const qty = hold.unitItems.reduce((sum, unit) => sum + unit.quantity, 0);
      await releaseCapacity(hold.attractionId, hold.localDate, hold.startTime ?? null, qty, session);
      expired = true;
    });
  } finally {
    await session.endSession();
  }
  return expired;
}

export interface OctoSweepResult {
  examined: number;
  expired: number;
  failed: number;
}

// Callable from a scheduler/worker. Each hold gets its own transaction so one
// corrupt inventory record cannot prevent other abandoned holds from releasing.
export async function sweepExpiredOctoHolds(
  options: { now?: Date; limit?: number } = {},
): Promise<OctoSweepResult> {
  const now = options.now || new Date();
  const limit = Math.max(1, Math.min(1000, Math.floor(options.limit || 100)));
  const candidates = await OctoHold.find({ status: 'ON_HOLD', expiresAt: { $lte: now } })
    .sort({ expiresAt: 1 })
    .limit(limit)
    .select({ _id: 1 })
    .lean();
  const result: OctoSweepResult = { examined: candidates.length, expired: 0, failed: 0 };
  for (const candidate of candidates) {
    try {
      if (await expireHold({ _id: candidate._id }, now)) result.expired += 1;
    } catch (_error) {
      result.failed += 1;
    }
  }
  return result;
}

// Loading still performs a targeted expiry for immediate consistency, while
// sweepExpiredOctoHolds makes expiry independent from GET traffic.
async function loadHold(req: AuthRequest, uuid: string) {
  const tenantId = req.tenant?._id;
  await expireHold({ uuid, tenantId }, new Date());
  return OctoHold.findOne({ uuid, tenantId });
}

// POST /octo/bookings/:uuid/confirm — { contact:{ firstName,lastName,emailAddress,phoneNumber } }
router.post('/bookings/:uuid/confirm', requireScope('write'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    let hold = await loadHold(req, req.params.uuid);
    if (!hold) return void octoErr(res, 404, 'INVALID_BOOKING_UUID', 'Booking not found');
    if (hold.status === 'CONFIRMED' && hold.bookingId) {
      const b = await Booking.findById(hold.bookingId).lean();
      return void res.json(toOctoBooking({
        uuid: hold.uuid, status: 'CONFIRMED', productId: hold.productId, optionId: hold.optionId,
        availabilityId: hold.availabilityId, currency: hold.currency, totalMinor: hold.totalMinor,
        unitItems: hold.unitItems, reference: b?.reference ?? null, contact: hold.contact,
      }));
    }
    if (hold.status !== 'ON_HOLD') return void octoErr(res, 400, 'BOOKING_NOT_ON_HOLD', `Booking is ${hold.status}`);

    const contact = (req.body?.contact || {}) as { firstName?: string; lastName?: string; emailAddress?: string; phoneNumber?: string };
    if (!contact.firstName || !contact.lastName || !contact.emailAddress)
      return void octoErr(res, 400, 'BAD_REQUEST', 'contact.firstName, lastName and emailAddress are required');

    const a = await Attraction.findById(hold.attractionId).lean();
    if (!a) return void octoErr(res, 404, 'INVALID_PRODUCT_ID', 'Product not found');
    const units = unitMap((a || {}) as unknown as OctoAttractionLike);
    // Bucket OCTO units into our adults/children/infants quantities.
    const q = { adults: 0, children: 0, infants: 0 };
    for (const u of hold.unitItems) {
      const t = octoUnitType(units[u.unitId]?.name);
      if (t === 'INFANT') q.infants += u.quantity;
      else if (t === 'CHILD' || t === 'YOUTH' || t === 'STUDENT') q.children += u.quantity;
      else q.adults += u.quantity;
    }
    const total = hold.totalMinor / 100;
    const supplier = hold.supplierTenantId ? String(hold.supplierTenantId) : null;
    const isResale = !!supplier && supplier !== String(hold.tenantId);

    const session = await mongoose.startSession();
    let booking: InstanceType<typeof Booking> | null = null;
    try {
      await session.withTransaction(async () => {
        booking = null;
        const claimed = await OctoHold.findOneAndUpdate(
          { _id: hold?._id, status: 'ON_HOLD', expiresAt: { $gt: new Date() } },
          { $set: { status: 'CONFIRMED', contact } },
          { new: true, session },
        );
        if (!claimed) return;
        [booking] = await Booking.create([{
          reference: `OCTO-${claimed.uuid.slice(0, 8).toUpperCase()}`,
          tenantId: claimed.tenantId,
          attractionId: claimed.attractionId,
          items: [{
            optionId: claimed.optionId,
            optionName: a.title || 'Booking',
            date: claimed.localDate,
            time: claimed.startTime || undefined,
            quantities: q,
            unitPrice: total,
            totalPrice: total,
          }],
          guestDetails: {
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.emailAddress,
            phone: contact.phoneNumber || 'N/A',
            country: 'N/A',
          },
          subtotal: total,
          total,
          currency: claimed.currency,
          paymentMethod: 'pay-later',
          paymentStatus: 'pending',
          status: 'confirmed',
          ...(isResale ? { supplierTenantId: claimed.supplierTenantId, sellerTenantId: claimed.tenantId, isResale: true } : {}),
        }], { session });
        await OctoHold.updateOne({ _id: claimed._id, status: 'CONFIRMED' }, { $set: { bookingId: booking._id } }, { session });
        hold = claimed;
      });
    } finally {
      await session.endSession();
    }
    if (!booking) {
      hold = await OctoHold.findById(hold._id);
      if (!hold) return void octoErr(res, 404, 'INVALID_BOOKING_UUID', 'Booking not found');
      if (hold.status === 'CONFIRMED' && hold.bookingId) {
        const existing = await Booking.findById(hold.bookingId).lean();
        return void res.json(toOctoBooking({
          uuid: hold.uuid, status: hold.status, productId: hold.productId, optionId: hold.optionId,
          availabilityId: hold.availabilityId, currency: hold.currency, totalMinor: hold.totalMinor,
          unitItems: hold.unitItems, reference: existing?.reference ?? null, contact: hold.contact,
        }));
      }
      return void octoErr(res, 400, 'BOOKING_NOT_ON_HOLD', `Booking is ${hold.status}`);
    }

    res.json(toOctoBooking({
      uuid: hold.uuid, status: 'CONFIRMED', productId: hold.productId, optionId: hold.optionId,
      availabilityId: hold.availabilityId, currency: hold.currency, totalMinor: hold.totalMinor,
      unitItems: hold.unitItems, reference: (booking as InstanceType<typeof Booking>).reference, contact,
    }));
  } catch (err) { next(err); }
});

// DELETE /octo/bookings/:uuid — cancel a hold/booking + release capacity.
router.delete('/bookings/:uuid', requireScope('write'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await expireHold({ uuid: req.params.uuid, tenantId: req.tenant?._id }, new Date());
    let hold = await OctoHold.findOne({ uuid: req.params.uuid, tenantId: req.tenant?._id });
    if (!hold) return void octoErr(res, 404, 'INVALID_BOOKING_UUID', 'Booking not found');
    if (hold.status === 'ON_HOLD' || hold.status === 'CONFIRMED') {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const claimed = await OctoHold.findOneAndUpdate(
            { _id: hold?._id, status: { $in: ['ON_HOLD', 'CONFIRMED'] } },
            { $set: { status: 'CANCELLED' } },
            { new: true, session },
          );
          if (!claimed) return;
          const qty = claimed.unitItems.reduce((sum, unit) => sum + unit.quantity, 0);
          await releaseCapacity(claimed.attractionId, claimed.localDate, claimed.startTime ?? null, qty, session);
          if (claimed.bookingId) await Booking.updateOne({ _id: claimed.bookingId }, { $set: { status: 'cancelled' } }, { session });
          hold = claimed;
        });
      } finally {
        await session.endSession();
      }
      hold = await OctoHold.findById(hold._id) || hold;
    }
    res.json(toOctoBooking({
      uuid: hold.uuid, status: hold.status, productId: hold.productId, optionId: hold.optionId,
      availabilityId: hold.availabilityId, currency: hold.currency, totalMinor: hold.totalMinor,
      unitItems: hold.unitItems, contact: hold.contact,
    }));
  } catch (err) { next(err); }
});

// GET /octo/bookings/:uuid
router.get('/bookings/:uuid', requireScope('read'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const hold = await loadHold(req, req.params.uuid);
    if (!hold) return void octoErr(res, 404, 'INVALID_BOOKING_UUID', 'Booking not found');
    const b = hold.bookingId ? await Booking.findById(hold.bookingId).lean() : null;
    res.json(toOctoBooking({
      uuid: hold.uuid, status: hold.status, productId: hold.productId, optionId: hold.optionId,
      availabilityId: hold.availabilityId, currency: hold.currency, totalMinor: hold.totalMinor,
      unitItems: hold.unitItems, reference: b?.reference ?? null, contact: hold.contact,
      utcHoldExpiration: hold.expiresAt?.toISOString() ?? null,
    }));
  } catch (err) { next(err); }
});

export default router;
