import { Router, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
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
function parseAvailabilityId(id: string): { localDate: string; startTime: string | null } {
  const [datePart, timePart] = String(id).split('T');
  const startTime = timePart ? timePart.slice(0, 5) : null; // 'HH:mm'
  return { localDate: datePart, startTime };
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

// Reserve/release capacity by adjusting the Availability `booked` counters,
// creating the record (with default capacity) on first reservation.
// NOTE: find-modify-save; fine for early OTA volume — a per-slot atomic $inc
// guard is a later hardening if concurrency grows.
async function adjustCapacity(
  attractionId: unknown,
  localDate: string,
  startTime: string | null,
  delta: number,
): Promise<boolean> {
  const day = new Date(`${localDate}T00:00:00.000Z`);
  let rec = await Availability.findOne({ attractionId, date: day });
  if (!rec) rec = new Availability({ attractionId, date: day, timeSlots: [], allDayBooked: 0 });
  if (rec.isBlocked) return false;
  if (startTime) {
    let slot = rec.timeSlots.find((s) => s.time === startTime);
    if (!slot) {
      slot = { time: startTime, capacity: DEFAULT_CAPACITY, booked: 0 };
      rec.timeSlots.push(slot);
    }
    if (delta > 0 && slot.capacity - slot.booked < delta) return false;
    slot.booked = Math.max(0, slot.booked + delta);
  } else {
    const cap = rec.allDayCapacity ?? DEFAULT_CAPACITY;
    const booked = rec.allDayBooked ?? 0;
    if (delta > 0 && cap - booked < delta) return false;
    rec.allDayCapacity = cap;
    rec.allDayBooked = Math.max(0, booked + delta);
  }
  await rec.save();
  return true;
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
    const { productId, localDateStart, localDateEnd } = req.body || {};
    if (!productId || !localDateStart) return void octoErr(res, 400, 'BAD_REQUEST', 'productId and localDateStart are required');
    const a = await findProduct(req, productId);
    if (!a) return void octoErr(res, 404, 'INVALID_PRODUCT_ID', 'Product not found');
    const prod = a as unknown as OctoAttractionLike;
    const startTimes = (prod.entryWindows || []).map((w) => w.startTime).filter(Boolean);
    const isSlotted = prod.availability?.type === 'time-slots' && startTimes.length > 0;

    const start = new Date(`${localDateStart}T00:00:00.000Z`);
    const end = new Date(`${(localDateEnd || localDateStart)}T00:00:00.000Z`);
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
    const { productId, optionId = 'DEFAULT', availabilityId, unitItems } = req.body || {};
    if (!productId || !availabilityId || !Array.isArray(unitItems) || unitItems.length === 0)
      return void octoErr(res, 400, 'BAD_REQUEST', 'productId, availabilityId and unitItems are required');

    const a = await findProduct(req, productId);
    if (!a) return void octoErr(res, 404, 'INVALID_PRODUCT_ID', 'Product not found');
    const prod = a as unknown as OctoAttractionLike;
    const { localDate, startTime } = parseAvailabilityId(availabilityId);
    const units = unitMap(prod);
    const currency = prod.currency || tenantOf(req).defaultCurrency || 'USD';

    let totalMinor = 0;
    let totalQty = 0;
    const items = unitItems.map((u: { unitId: string; quantity: number }) => {
      const price = units[u.unitId]?.priceMinor ?? 0;
      const qty = Math.max(0, Number(u.quantity) || 0);
      totalMinor += price * qty;
      totalQty += qty;
      return { unitId: u.unitId, quantity: qty, unitPriceMinor: price };
    });
    if (totalQty <= 0) return void octoErr(res, 400, 'BAD_REQUEST', 'unitItems must reserve at least one unit');

    const ok = await adjustCapacity(a._id, localDate, startTime, totalQty);
    if (!ok) return void octoErr(res, 400, 'AVAILABILITY_SOLD_OUT', 'Not enough capacity for the requested date/time');

    const supplierTenantId = (a as { ownerTenantId?: unknown }).ownerTenantId || (a.tenantIds && a.tenantIds[0]);
    const hold = await OctoHold.create({
      uuid: randomUUID(),
      status: 'ON_HOLD',
      tenantId: req.tenant?._id,
      supplierTenantId,
      attractionId: a._id,
      productId: String(a._id),
      optionId,
      availabilityId,
      localDate,
      startTime,
      unitItems: items,
      currency,
      totalMinor,
      expiresAt: new Date(Date.now() + HOLD_TTL_MS),
    });

    res.status(201).json(
      toOctoBooking({
        uuid: hold.uuid,
        status: 'ON_HOLD',
        productId: hold.productId,
        optionId: hold.optionId,
        availabilityId: hold.availabilityId,
        currency,
        totalMinor,
        unitItems: items,
        utcHoldExpiration: hold.expiresAt?.toISOString() ?? null,
      }),
    );
  } catch (err) { next(err); }
});

// Load a tenant-scoped hold, lazily expiring + releasing capacity if past TTL.
async function loadHold(req: AuthRequest, uuid: string) {
  const hold = await OctoHold.findOne({ uuid, tenantId: req.tenant?._id });
  if (!hold) return null;
  if (hold.status === 'ON_HOLD' && hold.expiresAt && hold.expiresAt.getTime() < Date.now()) {
    const qty = hold.unitItems.reduce((s, u) => s + u.quantity, 0);
    await adjustCapacity(hold.attractionId, hold.localDate, hold.startTime ?? null, -qty);
    hold.status = 'EXPIRED';
    await hold.save();
  }
  return hold;
}

// POST /octo/bookings/:uuid/confirm — { contact:{ firstName,lastName,emailAddress,phoneNumber } }
router.post('/bookings/:uuid/confirm', requireScope('write'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const hold = await loadHold(req, req.params.uuid);
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

    const booking = await Booking.create({
      reference: `OCTO-${hold.uuid.slice(0, 8).toUpperCase()}`,
      tenantId: hold.tenantId,
      attractionId: hold.attractionId,
      items: [{
        optionId: hold.optionId,
        optionName: a?.title || 'Booking',
        date: hold.localDate,
        time: hold.startTime || undefined,
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
      currency: hold.currency,
      paymentMethod: 'pay-later',
      paymentStatus: 'pending',
      status: 'confirmed',
      ...(isResale ? { supplierTenantId: hold.supplierTenantId, sellerTenantId: hold.tenantId, isResale: true } : {}),
    });

    hold.status = 'CONFIRMED';
    hold.bookingId = booking._id as never;
    hold.contact = contact;
    await hold.save();

    res.json(toOctoBooking({
      uuid: hold.uuid, status: 'CONFIRMED', productId: hold.productId, optionId: hold.optionId,
      availabilityId: hold.availabilityId, currency: hold.currency, totalMinor: hold.totalMinor,
      unitItems: hold.unitItems, reference: booking.reference, contact,
    }));
  } catch (err) { next(err); }
});

// DELETE /octo/bookings/:uuid — cancel a hold/booking + release capacity.
router.delete('/bookings/:uuid', requireScope('write'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const hold = await OctoHold.findOne({ uuid: req.params.uuid, tenantId: req.tenant?._id });
    if (!hold) return void octoErr(res, 404, 'INVALID_BOOKING_UUID', 'Booking not found');
    if (hold.status === 'ON_HOLD' || hold.status === 'CONFIRMED') {
      const qty = hold.unitItems.reduce((s, u) => s + u.quantity, 0);
      await adjustCapacity(hold.attractionId, hold.localDate, hold.startTime ?? null, -qty);
      if (hold.bookingId) await Booking.findByIdAndUpdate(hold.bookingId, { status: 'cancelled' });
      hold.status = 'CANCELLED';
      await hold.save();
    }
    res.json(toOctoBooking({
      uuid: hold.uuid, status: 'CANCELLED', productId: hold.productId, optionId: hold.optionId,
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
