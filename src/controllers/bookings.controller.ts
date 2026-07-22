import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Booking } from '../models/Booking';
import { Attraction } from '../models/Attraction';
import { User } from '../models/User';
import { PromoCode, IPromoCode } from '../models/PromoCode';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { generateBookingReference } from '../utils/hash';
import { generateTicketPdf } from '../services/pdf.service';
import { createRefund } from '../services/stripe.service';
import { getTenantStripeConfig } from '../services/tenantPayment.service';
import { createAdminNotifications } from '../services/notification.service';
import { sendBookingConfirmation, sendAdminBookingNotification, sendBookingStatusEmail } from '../services/email.service';
import { Tenant } from '../models/Tenant';
import { IdempotencyKey } from '../models/IdempotencyKey';
import { escapeRegex } from '../utils/helpers';
import { safeEmitEvent } from '../services/webhook.service';
import { IBooking } from '../types';
import { isPlatformHeld, settlementHeldBy } from '../utils/settlement';
import {
  generateBookingAccessToken,
  verifyBookingAccessToken,
} from '../utils/bookingAccess';
import {
  BookingWithInventoryMarker,
  bookingDate,
  inventoryEntriesForItems,
  releaseBookingInventory,
  reserveInventory,
  runBookingTransaction,
  sessionOption,
} from '../services/bookingInventory.service';

// Compact, tenant-safe booking summary for webhook payloads. Contains only the
// booking's own fields — never other tenants' data.
const bookingEventPayload = (
  booking: Pick<
    IBooking,
    | '_id'
    | 'reference'
    | 'tenantId'
    | 'attractionId'
    | 'status'
    | 'paymentStatus'
    | 'total'
    | 'currency'
    | 'guestDetails'
  >
): Record<string, unknown> => ({
  bookingId: String(booking._id),
  reference: booking.reference,
  tenantId: String(booking.tenantId),
  attractionId: String(booking.attractionId),
  status: booking.status,
  paymentStatus: booking.paymentStatus,
  total: booking.total,
  currency: booking.currency,
  customer: {
    name: `${booking.guestDetails?.firstName || ''} ${booking.guestDetails?.lastName || ''}`.trim(),
    email: booking.guestDetails?.email,
  },
});

const adminRoles = ['super-admin', 'brand-admin', 'manager'];

// Round money to 2 decimals (avoids float drift when splitting revenue).
const round2 = (n: number): number => Math.round(n * 100) / 100;

const hashValue = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const bookingResponse = (booking: IBooking): Record<string, unknown> => {
  const raw = typeof (booking as any).toJSON === 'function'
    ? (booking as any).toJSON()
    : { ...(booking as any) };
  return {
    ...raw,
    guestAccessToken: generateBookingAccessToken(String(booking._id), booking.reference),
  };
};

const earningsEligibilityClauses: Record<string, unknown>[] = [
  { status: { $in: ['confirmed', 'completed'] } },
  {
    $or: [
      { paymentMethod: { $ne: 'card' } },
      { paymentMethod: 'card', paymentStatus: 'succeeded' },
    ],
  },
];

const isEarningsEligible = (booking: {
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
}): boolean =>
  ['confirmed', 'completed'].includes(booking.status || '') &&
  (booking.paymentMethod !== 'card' || booking.paymentStatus === 'succeeded');

// Payment-processing fee deducted from the supplier's net on a resale booking
// (configurable). The supplier receives: total − reseller commission − this fee.
const RESELLER_PAYMENT_FEE_PERCENT = 2.9;

const bookingAccessTokenFromRequest = (req: AuthRequest): string | undefined => {
  const header = req.headers['x-booking-access-token'];
  const query = req.query.accessToken;
  if (typeof query === 'string' && query) {
    // Query fallback is retained for emailed links, but remove the credential
    // before response-time request logging so it does not land in access logs.
    const redact = (value: string): string => {
      const parsed = new URL(value, 'http://booking.local');
      parsed.searchParams.delete('accessToken');
      return `${parsed.pathname}${parsed.search}`;
    };
    req.url = redact(req.url);
    req.originalUrl = redact(req.originalUrl);
  }
  if (typeof header === 'string' && header) return header;
  return typeof query === 'string' && query ? query : undefined;
};

const hasGuestTokenAccess = (
  req: AuthRequest,
  booking: Pick<IBooking, '_id' | 'reference'>
): boolean => {
  const token = bookingAccessTokenFromRequest(req);
  return !!token && verifyBookingAccessToken(token, String(booking._id), booking.reference);
};

const hasTenantAccess = (req: AuthRequest, tenantId?: unknown): boolean => {
  if (!req.user || !tenantId) return false;
  if (req.user.role === 'super-admin') return true;
  if (!adminRoles.includes(req.user.role)) return false;

  return (req.user.assignedTenants || []).some(
    (assignedTenantId) => assignedTenantId.toString() === String(tenantId)
  );
};

const canAccessBooking = (req: AuthRequest, ownerId?: unknown, tenantId?: unknown): boolean => {
  if (!req.user) return false;
  if (req.user.role === 'super-admin') return true;

  if (adminRoles.includes(req.user.role)) {
    const isOwner =
      ownerId !== undefined && ownerId !== null && String(ownerId) === req.user._id.toString();
    return isOwner || hasTenantAccess(req, tenantId);
  }

  return ownerId !== undefined && ownerId !== null && String(ownerId) === req.user._id.toString();
};

const canReadBooking = (req: AuthRequest, ownerId?: unknown, tenantId?: unknown): boolean => {
  if (canAccessBooking(req, ownerId, tenantId)) return true;
  if (!req.user || !['editor', 'viewer'].includes(req.user.role)) return false;
  return (req.user.assignedTenants || []).some(
    (assignedTenantId) => assignedTenantId.toString() === String(tenantId)
  );
};

export const createBooking = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let idempotencyRecordId: mongoose.Types.ObjectId | undefined;
  try {
    const { attractionId, items, guestDetails, promoCode, paymentMethod } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];

    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.length < 16 ||
      idempotencyKey.length > 128 ||
      !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)
    ) {
      sendError(res, 'A valid Idempotency-Key header is required', 400);
      return;
    }

    if (paymentMethod && !['card', 'pay-later', 'cash'].includes(paymentMethod)) {
      sendError(res, 'Unsupported payment method', 400);
      return;
    }

    // Verify attraction exists
    const attraction = await Attraction.findById(attractionId);
    if (!attraction) {
      sendError(res, 'Attraction not found', 404);
      return;
    }

    if (attraction.status !== 'active') {
      sendError(res, 'Attraction is not available for booking', 409);
      return;
    }

    if (req.tenant && !attraction.tenantIds.some((id) => id.toString() === req.tenant?._id.toString())) {
      sendError(res, 'Attraction not available for this tenant', 403);
      return;
    }

    // Whether THIS booking's tenant has opted into dual (Foreigner/Resident) pricing.
    // The Resident rate is honoured only when the tenant flag is on AND the option has a residentPrice set.
    const residentPricingEnabled = req.tenant?.pricingSettings?.enableResidentPricing === true;

    // Recalculate line items on the server to prevent client-side price tampering.
    const normalizedItems = items.map((item: {
      optionId: string;
      date: string;
      time?: string;
      category?: 'foreigner' | 'resident';
      quantities: { adults: number; children: number; infants: number };
      addons?: Array<{ id: string; name: string; price: number }>;
      hotelPickup?: { hotelName?: string; roomNumber?: string; pickupTime?: string };
    }) => {
      const option = attraction.pricingOptions.find((o) => o.id === item.optionId);
      if (!option) {
        throw new Error(`INVALID_OPTION:${item.optionId}`);
      }

      const quantities = {
        adults: item.quantities?.adults || 0,
        children: item.quantities?.children || 0,
        infants: item.quantities?.infants || 0,
      };
      const values = Object.values(quantities);
      if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 100)) {
        throw new Error('INVALID_QUANTITY');
      }

      const payableGuests = quantities.adults + quantities.children;
      const capacityGuests = payableGuests + quantities.infants;
      if (payableGuests <= 0) {
        throw new Error('INVALID_QUANTITY');
      }
      if (capacityGuests > 100) throw new Error('INVALID_QUANTITY');

      // Reject a date in the past. The booking widget greys out past days in the UI,
      // but nothing enforced it server-side, so a stale cart or a direct API call could
      // still book "yesterday". Compare on UTC day so a same-day booking always passes.
      if (!item.date) throw new Error('INVALID_DATE');
      const bookingDay = bookingDate(item.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (bookingDay < today) {
        throw new Error('PAST_DATE');
      }

      // Pick the right tier. Falls back to foreigner price if resident is requested
      // but the flag is off or the option doesn't carry a residentPrice — never throws.
      const useResident =
        residentPricingEnabled &&
        item.category === 'resident' &&
        typeof option.residentPrice === 'number' &&
        option.residentPrice > 0;
      const unitPrice = useResident ? (option.residentPrice as number) : option.price;
      const appliedCategory: 'foreigner' | 'resident' | undefined = residentPricingEnabled
        ? useResident
          ? 'resident'
          : 'foreigner'
        : undefined;

      const totalPrice = Math.round(unitPrice * payableGuests * 100) / 100;

      // Validate add-ons against attraction's add-on catalog
      const validAddons = (item.addons || []).filter((addon) =>
        attraction.addons?.some((a) => a.id === addon.id)
      ).map((addon) => {
        const catalogAddon = attraction.addons?.find((a) => a.id === addon.id);
        return {
          id: addon.id,
          name: catalogAddon?.name || addon.name,
          price: catalogAddon?.price ?? 0,
        };
      });

      return {
        optionId: option.id,
        optionName: option.name,
        date: item.date,
        time: item.time,
        quantities,
        unitPrice,
        totalPrice,
        ...(appliedCategory ? { category: appliedCategory } : {}),
        ...(validAddons.length > 0 ? { addons: validAddons } : {}),
        // Persist hotel pickup when the guest supplied it (the widget only collects it
        // for attractions with hasHotelPickup). Was previously dropped here, so pickup
        // never reached the booking, admin, voucher or emails.
        ...(item.hotelPickup?.hotelName
          ? {
              hotelPickup: {
                hotelName: item.hotelPickup.hotelName,
                roomNumber: item.hotelPickup.roomNumber,
                pickupTime: item.hotelPickup.pickupTime,
              },
            }
          : {}),
      };
    });

    const subtotal = normalizedItems.reduce(
      (acc: number, item: { totalPrice: number; addons?: Array<{ price: number }> }) => {
        const addonsTotal = (item.addons || []).reduce((s, a) => s + a.price, 0);
        return acc + item.totalPrice + addonsTotal;
      },
      0
    );

    const fees = round2(subtotal * 0.05); // 5% service fee
    const tenantId = req.tenant?._id || attraction.tenantIds[0];
    if (!tenantId) {
      sendError(res, 'Attraction is not assigned to any tenant', 400);
      return;
    }

    const now = new Date();
    let promoCandidate: IPromoCode | null = null;
    let promoDiscount = 0;
    if (promoCode) {
      const promoBase = {
        code: String(promoCode).trim().toUpperCase(),
        currency: attraction.currency.toUpperCase(),
        isActive: true,
        validFrom: { $lte: now },
        validUntil: { $gte: now },
        minOrderAmount: { $lte: subtotal },
        $expr: { $lt: ['$usageCount', '$usageLimit'] },
      };
      promoCandidate = await PromoCode.findOne({ ...promoBase, tenantId });
      if (!promoCandidate) {
        promoCandidate = await PromoCode.findOne({
          ...promoBase,
          $or: [{ tenantId: null }, { tenantId: { $exists: false } }],
        });
      }
      if (!promoCandidate) throw new Error('INVALID_PROMO');

      promoDiscount = promoCandidate.discountType === 'percentage'
        ? round2(subtotal * (promoCandidate.discountValue / 100))
        : promoCandidate.discountValue;
      if (promoCandidate.maxDiscount !== undefined) {
        promoDiscount = Math.min(promoDiscount, promoCandidate.maxDiscount);
      }
    }

    // Auto-apply best special offer (if better than promo code)
    const { SpecialOffer } = await import('../models/SpecialOffer');
    const activeOffer = await SpecialOffer.findOne({
      attractionId,
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      $expr: { $lt: ['$usageCount', '$usageLimit'] },
    }).sort({ discountValue: -1 });

    let offerDiscount = 0;
    if (activeOffer) {
      offerDiscount = activeOffer.discountType === 'percentage'
        ? round2(subtotal * (activeOffer.discountValue / 100))
        : activeOffer.discountValue;
    }

    const useSpecialOffer = !!activeOffer && offerDiscount > promoDiscount;
    const discount = round2(Math.min(Math.max(useSpecialOffer ? offerDiscount : promoDiscount, 0), subtotal));
    const total = round2(Math.max(subtotal + fees - discount, 0));

    const keyHash = hashValue(idempotencyKey);
    const requestHash = hashValue(stableStringify({
      tenantId: String(tenantId),
      attractionId,
      items,
      guestDetails,
      promoCode: promoCode || null,
      paymentMethod: paymentMethod || 'pay-later',
    }));

    try {
      const record = await IdempotencyKey.create({
        scope: 'booking.create',
        tenantId,
        keyHash,
        requestHash,
        status: 'processing',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      idempotencyRecordId = record._id as mongoose.Types.ObjectId;
    } catch (claimError) {
      const isDuplicate =
        !!claimError &&
        typeof claimError === 'object' &&
        'code' in claimError &&
        (claimError as { code?: number }).code === 11000;
      if (!isDuplicate) throw claimError;

      const existing = await IdempotencyKey.findOne({
        scope: 'booking.create',
        tenantId,
        keyHash,
      }).lean();

      if (!existing || existing.requestHash !== requestHash) {
        sendError(res, 'Idempotency key was already used for a different booking request', 409);
        return;
      }

      if (existing.status === 'completed' && existing.resourceId) {
        const replayedBooking = await Booking.findById(existing.resourceId);
        if (replayedBooking) {
          res.setHeader('Idempotency-Replayed', 'true');
          sendSuccess(res, bookingResponse(replayedBooking as IBooking), 'Booking already created');
          return;
        }
      }

      res.setHeader('Retry-After', '2');
      sendError(res, 'An identical booking request is already processing', 409);
      return;
    }

    // Reseller revenue split. When this booking is made on a reseller's site
    // (sellerTenant) for an attraction owned by a different supplier tenant, we
    // record both sides and split `total` between them. Internal accounting only
    // — the customer still pays `total`; this does NOT change the charge.
    const sellerTenant = tenantId;
    const supplierTenant = attraction.ownerTenantId || attraction.tenantIds[0];
    const isResale = !!(
      attraction.reseller?.enabled &&
      supplierTenant &&
      sellerTenant &&
      supplierTenant.toString() !== sellerTenant.toString()
    );

    let resaleFields: {
      supplierTenantId: typeof supplierTenant;
      sellerTenantId: typeof sellerTenant;
      isResale: true;
      revenueBreakdown: {
        commissionPercent: number;
        sellerEarnings: number;
        paymentFee: number;
        supplierEarnings: number;
      };
    } | { isResale: false } = { isResale: false };

    if (isResale) {
      // Commission % only, on the total the customer pays.
      const commissionPercent = attraction.reseller.value;
      const sellerEarnings = round2((total * commissionPercent) / 100); // reseller commission
      const paymentFee = round2((total * RESELLER_PAYMENT_FEE_PERCENT) / 100); // payment processing fee
      const supplierEarnings = round2(total - sellerEarnings - paymentFee); // supplier (tour owner) net
      resaleFields = {
        supplierTenantId: supplierTenant,
        sellerTenantId: sellerTenant,
        isResale: true,
        revenueBreakdown: {
          commissionPercent,
          sellerEarnings,
          paymentFee,
          supplierEarnings,
        },
      };
    }

    const reference = generateBookingReference();
    const bookingId = new mongoose.Types.ObjectId();
    const guestAccessToken = generateBookingAccessToken(String(bookingId), reference);
    const inventoryEntries = inventoryEntriesForItems(
      attractionId,
      normalizedItems,
      attraction.availability?.type === 'time-slots'
    );

    const booking = await runBookingTransaction<IBooking>(async (session) => {
      await reserveInventory(inventoryEntries, session);

      if (useSpecialOffer && activeOffer) {
        const consumed = await SpecialOffer.findOneAndUpdate(
          {
            _id: activeOffer._id,
            isActive: true,
            validFrom: { $lte: now },
            validUntil: { $gte: now },
            $expr: { $lt: ['$usageCount', '$usageLimit'] },
          },
          { $inc: { usageCount: 1 } },
          { ...sessionOption(session), new: true }
        );
        if (!consumed) throw new Error('DISCOUNT_UNAVAILABLE');
      } else if (promoCandidate) {
        const consumed = await PromoCode.findOneAndUpdate(
          {
            _id: promoCandidate._id,
            currency: attraction.currency.toUpperCase(),
            isActive: true,
            validFrom: { $lte: now },
            validUntil: { $gte: now },
            $expr: { $lt: ['$usageCount', '$usageLimit'] },
          },
          { $inc: { usageCount: 1 } },
          { ...sessionOption(session), new: true }
        );
        if (!consumed) throw new Error('DISCOUNT_UNAVAILABLE');
      }

      const payload = {
        _id: bookingId,
        reference,
        inventoryReservedAt: new Date(),
        inventoryReservations: inventoryEntries.map((entry) => ({
          date: entry.date,
          time: entry.time,
          guests: entry.guests,
        })),
        userId: req.user?._id,
        tenantId,
        attractionId,
        items: normalizedItems,
        guestDetails,
        subtotal,
        fees,
        discount,
        total,
        currency: attraction.currency,
        promoCode: promoCandidate && !useSpecialOffer ? promoCandidate.code : undefined,
        specialOfferId: useSpecialOffer ? activeOffer?._id : undefined,
        paymentMethod: paymentMethod || 'pay-later',
        status: paymentMethod === 'card' ? 'pending' : 'confirmed',
        paymentStatus: 'pending',
        ...resaleFields,
      };

      const created = session
        ? (await Booking.create([payload], { session }))[0]
        : await Booking.create(payload);
      await IdempotencyKey.findByIdAndUpdate(
        idempotencyRecordId,
        {
          $set: {
            status: 'completed',
            resourceId: created._id,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        },
        sessionOption(session)
      );
      if (req.user) {
        await User.findByIdAndUpdate(
          req.user._id,
          { $inc: { totalBookings: 1 } },
          sessionOption(session)
        );
      }
      return created;
    });

    // Outbound webhooks: booking.created always; booking.confirmed when the
    // booking is immediately confirmed (pay-later). Tenant-scoped emit.
    safeEmitEvent(tenantId, 'booking.created', bookingEventPayload(booking));
    if (booking.status === 'confirmed') {
      safeEmitEvent(tenantId, 'booking.confirmed', bookingEventPayload(booking));
    }

    // Send notification to admins
    createAdminNotifications({
      type: 'booking',
      title: 'New Booking Received',
      message: `${guestDetails.firstName} ${guestDetails.lastName} booked "${attraction.title}" — ${attraction.currency} ${total.toFixed(2)}`,
      link: `/admin/bookings`,
      data: { bookingId: booking._id, reference: booking.reference },
      tenantId: tenantId.toString(),
    }).catch(() => {});

    // Email notifications — fire and forget so a delivery failure never blocks
    // the booking response. Includes:
    //   • Customer confirmation to the address typed at checkout
    //   • Operator notification only to this tenant's configured contact inbox.
    (async () => {
     // Whole block guarded: a tenant lookup or mail failure must never surface
     // as an unhandled promise rejection (which would crash the process on a DB
     // blip, since nothing awaits this IIFE).
     try {
      // Card bookings are NOT paid yet — their confirmation + operator emails are
      // sent by the Stripe webhook once the charge succeeds (finalizePaidBooking).
      // Announcing a card booking here would email a "confirmed" booking that hasn't
      // been paid for. Pay-later bookings email immediately (nothing to collect).
      if (paymentMethod === 'card') return;
      const firstItem = items[0];
      const totalAdults = items.reduce((s: number, it: { quantities?: { adults?: number } }) => s + (it.quantities?.adults || 0), 0);
      const totalChildren = items.reduce((s: number, it: { quantities?: { children?: number } }) => s + (it.quantities?.children || 0), 0);
      const guestName = `${guestDetails.firstName} ${guestDetails.lastName}`.trim();

      // Meeting point for the email map: coordinates come off the attraction's
      // destination (required on the model), the label prefers the specific
      // meeting-point address, falling back to the city. Undefined when no coords,
      // in which case the email simply omits the map block.
      const coords = attraction.destination?.coordinates;
      const meetingPoint =
        coords && typeof coords.lat === 'number' && typeof coords.lng === 'number'
          ? {
              lat: coords.lat,
              lng: coords.lng,
              label: attraction.meetingPoint?.address || attraction.destination?.city || undefined,
            }
          : undefined;

      // One tenant lookup, reused for both the customer confirmation (branding)
      // and the operator notification below.
      const tenantDoc = await Tenant.findById(tenantId)
        .select('name slug customDomain domainMigrated contactInfo theme logo')
        .lean();

      try {
        await sendBookingConfirmation(
          guestDetails.email,
          {
            reference: booking.reference,
            guestAccessToken,
            attractionTitle: attraction.title,
            date: firstItem?.date || '',
            time: firstItem?.time,
            guestName,
            total,
            currency: attraction.currency,
            paymentMethod: paymentMethod || 'pay-later',
            guests: totalAdults + totalChildren,
            hotelPickup: firstItem?.hotelPickup,
            meetingPoint,
          },
          undefined,
          tenantDoc,
        );
      } catch (err) {
        console.error('Customer confirmation email failed:', err);
      }

      try {
        const recipient = tenantDoc?.contactInfo?.email;
        if (recipient) {
          try {
            await sendAdminBookingNotification(recipient, {
              reference: booking.reference,
              tenantName: tenantDoc?.name || 'Attractions Network',
              attractionTitle: attraction.title,
              date: firstItem?.date || '',
              time: firstItem?.time,
              guestName,
              guestEmail: guestDetails.email,
              guestPhone: guestDetails.phone,
              adults: totalAdults,
              children: totalChildren,
              total,
              currency: attraction.currency,
              paymentMethod: paymentMethod || 'pay-later',
              hotelPickup: firstItem?.hotelPickup,
              meetingPoint,
            }, tenantDoc);
          } catch (err) {
            console.error(`Admin booking email to ${recipient} failed:`, err);
          }
        }
      } catch (err) {
        console.error('Admin booking notification block failed:', err);
      }
     } catch (err) {
       console.error('Booking notification side-effect failed:', err);
     }
    })();

    sendSuccess(
      res,
      bookingResponse(booking),
      'Booking created successfully',
      201
    );
  } catch (error) {
    if (idempotencyRecordId) {
      await IdempotencyKey.deleteOne({
        _id: idempotencyRecordId,
        status: 'processing',
      }).catch(() => undefined);
    }
    if (error instanceof Error && error.message.startsWith('INVALID_OPTION:')) {
      sendError(res, 'Invalid pricing option selected', 400);
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_QUANTITY') {
      sendError(res, 'At least one paid guest is required', 400);
      return;
    }
    if (error instanceof Error && error.message === 'PAST_DATE') {
      sendError(res, 'Cannot book a date in the past', 400);
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_DATE') {
      sendError(res, 'A valid booking date is required', 400);
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_PROMO') {
      sendError(res, 'Promo code is invalid for this site, currency, or order', 400);
      return;
    }
    if (error instanceof Error && error.message === 'DISCOUNT_UNAVAILABLE') {
      sendError(res, 'The selected discount is no longer available', 409);
      return;
    }
    if (error instanceof Error && error.message === 'SLOT_UNAVAILABLE') {
      sendError(res, 'The selected date or time is blocked, full, or unavailable', 409);
      return;
    }
    next(error);
  }
};

const confirmationSafeBooking = (booking: IBooking): Record<string, unknown> => {
  const raw = typeof (booking as any).toObject === 'function'
    ? (booking as any).toObject()
    : booking as any;
  const attraction = raw.attractionId && typeof raw.attractionId === 'object'
    ? raw.attractionId
    : null;
  const tenant = raw.tenantId && typeof raw.tenantId === 'object'
    ? raw.tenantId
    : null;

  return {
    id: raw.reference,
    reference: raw.reference,
    status: raw.status,
    paymentStatus: raw.paymentStatus,
    paymentMethod: raw.paymentMethod,
    items: (raw.items || []).map((item: Record<string, any>) => ({
      optionName: item.optionName,
      date: item.date,
      time: item.time,
      quantities: item.quantities,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      category: item.category,
      addons: (item.addons || []).map((addon: Record<string, unknown>) => ({
        name: addon.name,
        price: addon.price,
      })),
    })),
    subtotal: raw.subtotal,
    fees: raw.fees,
    discount: raw.discount,
    total: raw.total,
    currency: raw.currency,
    attraction: attraction
      ? {
          title: attraction.title,
          slug: attraction.slug,
          images: attraction.images,
          destination: attraction.destination,
        }
      : undefined,
    tenant: tenant ? { name: tenant.name, logo: tenant.logo } : undefined,
    ticketAvailable: raw.status === 'confirmed',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
};

export const getBookingByReference = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { reference } = req.params;

    const booking = await Booking.findOne({ reference });

    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }

    const hasAuthenticatedAccess = canReadBooking(req, booking.userId, booking.tenantId);
    const suppliedGuestToken = bookingAccessTokenFromRequest(req);
    if (!req.user && !suppliedGuestToken) {
      sendError(res, 'Booking access token or authentication is required', 401);
      return;
    }
    if (!hasAuthenticatedAccess && !hasGuestTokenAccess(req, booking)) {
      sendError(res, 'Not authorized to access this booking', 403);
      return;
    }

    await booking.populate([
      { path: 'attractionId', select: 'title slug images destination' },
      { path: 'tenantId', select: 'name logo' },
    ]);
    sendSuccess(res, confirmationSafeBooking(booking));
  } catch (error) {
    next(error);
  }
};

export const getMyBookings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { page = 1, limit = 10, status } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const query: Record<string, unknown> = { userId: req.user._id };
    if (status) {
      query.status = status;
    }

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .populate('attractionId', 'title slug images destination')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Booking.countDocuments(query),
    ]);

    sendPaginated(res, bookings, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
};

export const cancelBooking = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id);

    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }

    if (!canAccessBooking(req, booking.userId, booking.tenantId)) {
      sendError(res, 'Not authorized to cancel this booking', 403);
      return;
    }

    // Check if cancellation is allowed
    if (booking.status === 'cancelled' || booking.inventoryReleasedAt) {
      sendError(res, 'Booking was already cancelled or its inventory was released', 409);
      return;
    }
    if (!['pending', 'confirmed'].includes(booking.status)) {
      sendError(res, 'Booking cannot be cancelled', 400);
      return;
    }

    let completedRefund: { id: string; status: string; amount: number } | undefined;
    // A collected payment must be refunded successfully before cancellation can
    // change state or release inventory. Missing gateway data fails closed.
    if (booking.paymentStatus === 'succeeded') {
      if (booking.paymentMethod !== 'card' || !booking.stripePaymentIntentId) {
        sendError(res, 'Collected payment requires a verified gateway refund before cancellation', 409);
        return;
      }
      const stripeCfg = await getTenantStripeConfig(booking.tenantId);
      if (!stripeCfg?.enabled || !stripeCfg.secretKey) {
        sendError(res, 'Cancellation unavailable because the payment gateway is not configured', 503);
        return;
      }
      const refund = await createRefund(
        stripeCfg.secretKey,
        booking.stripePaymentIntentId,
        Math.round(booking.total * 100),
        { idempotencyKey: `booking-cancel-${booking._id}` }
      );
      if (!refund.id || refund.status !== 'succeeded') {
        sendError(res, 'Stripe has not completed the cancellation refund', 409);
        return;
      }
      completedRefund = refund;
    }

    const cancelledBooking = await runBookingTransaction<BookingWithInventoryMarker>(
      async (session) => {
        const current = await Booking.findOne(
          {
            _id: booking._id,
            status: { $in: ['pending', 'confirmed'] },
            inventoryReleasedAt: { $exists: false },
          },
          null,
          sessionOption(session)
        ) as BookingWithInventoryMarker | null;
        if (!current) throw new Error('CANCELLATION_CONFLICT');

        await releaseBookingInventory(current, session);
        if (completedRefund) {
          current.paymentStatus = 'refunded';
          current.refundedAmount = current.total;
          current.refunds = [
            ...(current.refunds || []).filter(
              (refund) => refund.providerRefundId !== completedRefund?.id
            ),
            {
              providerRefundId: completedRefund.id,
              amount: completedRefund.amount / 100,
              status: 'succeeded',
              createdAt: new Date(),
            },
          ];
          if (current.userId) {
            await User.findByIdAndUpdate(
              current.userId,
              { $inc: { totalSpent: -current.total } },
              sessionOption(session)
            );
          }
        }
        current.status = 'cancelled';
        await current.save(sessionOption(session));
        return current;
      }
    );

    safeEmitEvent(
      cancelledBooking.tenantId,
      'booking.cancelled',
      bookingEventPayload(cancelledBooking)
    );

    void Tenant.findById(cancelledBooking.tenantId)
      .select('name slug customDomain domainMigrated contactInfo theme logo defaultLanguage defaultCurrency timezone')
      .lean()
      .then((tenant) => tenant ? sendBookingStatusEmail(
          cancelledBooking.guestDetails.email,
          {
            reference: cancelledBooking.reference,
            guestName: `${cancelledBooking.guestDetails.firstName} ${cancelledBooking.guestDetails.lastName}`.trim(),
            kind: 'cancelled',
            guestAccessToken: generateBookingAccessToken(String(cancelledBooking._id), cancelledBooking.reference),
            refundAmount: completedRefund ? completedRefund.amount / 100 : undefined,
            currency: cancelledBooking.currency,
          },
          tenant
        ) : undefined)
      .catch(() => console.error('[email] cancellation notification failed', {
        tenantId: String(cancelledBooking.tenantId),
      }));

    sendSuccess(res, cancelledBooking, 'Booking cancelled successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'INVENTORY_RELEASE_FAILED') {
      sendError(res, 'Cancellation could not safely restore inventory', 409);
      return;
    }
    if (error instanceof Error && error.message === 'CANCELLATION_CONFLICT') {
      sendError(res, 'Booking was already cancelled or its inventory was released', 409);
      return;
    }
    if (error instanceof Error && error.message === 'REFUND_NOT_COMPLETED') {
      sendError(res, 'Refund has not completed; booking and inventory were not changed', 409);
      return;
    }
    next(error);
  }
};

export const getBookingTicket = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const booking = mongoose.Types.ObjectId.isValid(id)
      ? await Booking.findById(id)
      : await Booking.findOne({ reference: id });

    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }

    const suppliedGuestToken = bookingAccessTokenFromRequest(req);
    if (!req.user && !suppliedGuestToken) {
      sendError(res, 'Booking access token or authentication is required', 401);
      return;
    }
    if (
      !canReadBooking(req, booking.userId, booking.tenantId) &&
      !hasGuestTokenAccess(req, booking)
    ) {
      sendError(res, 'Not authorized to access this ticket', 403);
      return;
    }

    // Check if booking is confirmed
    if (booking.status !== 'confirmed') {
      sendError(res, 'Ticket not available. Booking is not confirmed.', 400);
      return;
    }

    // Generate and return PDF ticket
    try {
      await booking.populate([
        { path: 'attractionId' },
        { path: 'tenantId', select: 'name theme logo' },
      ]);
      const attraction = booking.attractionId as any;
      const tenant = booking.tenantId as any;
      const firstItem = booking.items[0] as any;

      const ticketData = {
        reference: booking.reference,
        attractionTitle: attraction?.title || 'Experience',
        optionName: firstItem?.optionName,
        date: firstItem?.date || new Date().toISOString().split('T')[0],
        time: firstItem?.time,
        duration: attraction?.duration,
        guestName: `${booking.guestDetails.firstName} ${booking.guestDetails.lastName}`,
        guestEmail: booking.guestDetails.email,
        guestPhone: booking.guestDetails.phone,
        guestCountry: booking.guestDetails.country,
        items: booking.items.map((item: any) => ({
          name: item.optionName,
          adults: item.quantities?.adults || 0,
          children: item.quantities?.children || 0,
          infants: item.quantities?.infants || 0,
        })),
        addons: firstItem?.addons?.length
          ? firstItem.addons.map((a: any) => ({ name: a.name, price: a.price }))
          : undefined,
        subtotal: booking.subtotal,
        fees: booking.fees,
        discount: booking.discount,
        total: booking.total,
        currency: booking.currency,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        meetingPoint: attraction?.meetingPoint?.address
          ? {
              address: attraction.meetingPoint.address,
              instructions: attraction.meetingPoint.instructions || undefined,
            }
          : undefined,
        cancellationPolicy: attraction?.cancellationPolicy,
        instantConfirmation: attraction?.instantConfirmation,
        tenantName: tenant?.name,
        brandColor: tenant?.theme?.primaryColor,
        logoUrl: tenant?.logo,
      };

      const pdfBuffer = await generateTicketPdf(ticketData);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=ticket-${booking.reference}.pdf`);
      res.send(pdfBuffer);
    } catch (pdfError) {
      console.error('PDF generation failed:', pdfError);
      sendError(res, 'Failed to generate ticket', 500);
    }
  } catch (error) {
    next(error);
  }
};

// Admin endpoints
export const getAllBookings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page = 1, limit = 20, status, startDate, endDate, search } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const query: Record<string, unknown> = {};
    const andClauses: Record<string, unknown>[] = [];

    // Scope for non-super-admins: their own-site bookings PLUS resale bookings
    // of tours they supply — so a supplier sees their tours sold via resellers.
    const scope = req.tenant ? [req.tenant._id] : (req.user?.assignedTenants || []);
    if (req.user?.role === 'super-admin' && req.tenant) {
      // A selected site must scope super-admin results just like the rest of the
      // admin UI. With no selected site, super-admins retain the All Sites view.
      andClauses.push({ tenantId: req.tenant._id });
    } else if (req.user?.role !== 'super-admin') {
      andClauses.push({
        $or: [
          { tenantId: { $in: scope } },
          { supplierTenantId: { $in: scope }, isResale: true },
        ],
      });
    }

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) (query.createdAt as Record<string, unknown>).$gte = new Date(startDate as string);
      if (endDate) (query.createdAt as Record<string, unknown>).$lte = new Date(endDate as string);
    }

    if (search) {
      const safeSearch = escapeRegex(search as string);
      andClauses.push({
        $or: [
          { reference: { $regex: safeSearch, $options: 'i' } },
          { 'guestDetails.email': { $regex: safeSearch, $options: 'i' } },
          { 'guestDetails.firstName': { $regex: safeSearch, $options: 'i' } },
          { 'guestDetails.lastName': { $regex: safeSearch, $options: 'i' } },
        ],
      });
    }

    if (andClauses.length > 0) query.$and = andClauses;

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .populate('attractionId', 'title slug')
        .populate('userId', 'firstName lastName email')
        .populate('tenantId', 'name slug')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Booking.countDocuments(query),
    ]);

    // Privacy: when a supplier views a resale booking of their own tour, never
    // reveal which reseller website sold it. Swap the seller identity for a
    // generic label and drop the seller tenant id. Super-admins see everything.
    const isSuper = req.user?.role === 'super-admin';
    const scopeSet = new Set(scope.map((t) => String(t)));
    const sanitized = (bookings as Array<Record<string, any>>).map((b) => {
      if (!isSuper && b.isResale) {
        const supplierId = b.supplierTenantId ? String(b.supplierTenantId) : null;
        const sellerId = b.sellerTenantId ? String(b.sellerTenantId) : null;
        const viewerIsSupplier = supplierId && scopeSet.has(supplierId);
        const viewerIsSeller = sellerId && scopeSet.has(sellerId);
        if (viewerIsSupplier && !viewerIsSeller) {
          b.tenantId = { name: 'Reseller partner' };
          b.sellerTenantId = undefined;
        }
      }
      return b;
    });

    sendPaginated(res, sanitized, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
};

export const updateBookingStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, paymentStatus } = req.body;

    if (paymentStatus !== undefined) {
      sendError(res, 'Payment status is controlled by the payment provider', 400);
      return;
    }
    if (status === 'cancelled' || status === 'refunded') {
      sendError(res, 'Use the cancellation workflow for cancelled or refunded bookings', 400);
      return;
    }

    const booking = await Booking.findById(id);

    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }

    if (!canAccessBooking(req, booking.userId, booking.tenantId)) {
      sendError(res, 'Not authorized to update this booking', 403);
      return;
    }

    if (
      (status === 'confirmed' || status === 'completed') &&
      booking.paymentMethod === 'card' &&
      booking.paymentStatus !== 'succeeded'
    ) {
      sendError(res, 'Card bookings can only be confirmed after provider-verified payment', 409);
      return;
    }

    if (status) {
      booking.status = status;
    }
    await booking.save();

    sendSuccess(res, booking, 'Booking updated successfully');
  } catch (error) {
    next(error);
  }
};

// Dashboard stats
export const getBookingStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const query: Record<string, unknown> = {};

    if (req.user?.role === 'super-admin' && req.tenant) {
      query.tenantId = req.tenant._id;
    } else if (req.user?.role !== 'super-admin') {
      if (req.tenant) {
        query.tenantId = req.tenant._id;
      } else {
        query.tenantId = { $in: req.user?.assignedTenants || [] };
      }
    }

    const [
      totalBookings,
      confirmedBookings,
      pendingBookings,
      completedBookings,
      cancelledBookings,
      refundedBookings,
      revenueAgg,
    ] = await Promise.all([
      Booking.countDocuments(query),
      Booking.countDocuments({ ...query, status: 'confirmed' }),
      Booking.countDocuments({ ...query, status: 'pending' }),
      Booking.countDocuments({ ...query, status: 'completed' }),
      Booking.countDocuments({ ...query, status: 'cancelled' }),
      Booking.countDocuments({ ...query, status: 'refunded' }),
      Booking.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            // Booked = confirmed/completed commitments (includes pay-later, which
            // never reaches paymentStatus 'succeeded'). Collected = money cleared.
            // Headline revenue is "booked" so pre-launch/pay-later bookings aren't
            // silently shown as $0.
            bookedRevenue: { $sum: { $cond: [{ $in: ['$status', ['confirmed', 'completed']] }, '$total', 0] } },
            collectedRevenue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$paymentStatus', 'succeeded'] },
                      { $in: ['$status', ['confirmed', 'completed']] },
                    ],
                  },
                  '$total',
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const rev = revenueAgg[0] || { bookedRevenue: 0, collectedRevenue: 0 };
    sendSuccess(res, {
      totalBookings,
      confirmedBookings,
      pendingBookings,
      completedBookings,
      cancelledBookings,
      refundedBookings,
      totalRevenue: rev.bookedRevenue,
      bookedRevenue: rev.bookedRevenue,
      collectedRevenue: rev.collectedRevenue,
    });
  } catch (error) {
    next(error);
  }
};

// Reseller earnings — splits the admin's resale activity into what they earn as
// the supplier (their attraction sold on someone else's site) vs as the seller
// (they sold someone else's attraction). Scoped to the admin's tenants; a
// super-admin (no tenant scope) sees the whole network.
export const getResellerEarnings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Resolve which tenants this admin can see. Super-admin => all tenants
    // (undefined scope). Otherwise the active tenant, or all assigned tenants.
    let myTenants: unknown[] | undefined;
    if (req.user?.role !== 'super-admin') {
      myTenants = req.tenant ? [req.tenant._id] : (req.user?.assignedTenants || []);
    }

    const scope = (field: 'supplierTenantId' | 'sellerTenantId'): Record<string, unknown> => {
      const tenantScope: Record<string, unknown> = { isResale: true };
      if (myTenants) tenantScope[field] = { $in: myTenants };
      return { $and: [tenantScope, ...earningsEligibilityClauses] };
    };

    const recentScope: Record<string, unknown> = { isResale: true };
    if (myTenants) {
      recentScope.$or = [
        { supplierTenantId: { $in: myTenants } },
        { sellerTenantId: { $in: myTenants } },
      ];
    }
    const recentMatch: Record<string, unknown> = {
      $and: [recentScope, ...earningsEligibilityClauses],
    };

    const [asSupplierAgg, asSellerAgg, recent] = await Promise.all([
      Booking.aggregate([
        { $match: scope('supplierTenantId') },
        { $group: { _id: null, total: { $sum: '$revenueBreakdown.supplierEarnings' }, count: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: scope('sellerTenantId') },
        { $group: { _id: null, total: { $sum: '$revenueBreakdown.sellerEarnings' }, count: { $sum: 1 } } },
      ]),
      Booking.find(recentMatch)
        .populate('attractionId', 'title')
        .populate('supplierTenantId', 'name')
        .populate('sellerTenantId', 'name')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    const myTenantSet = new Set((myTenants || []).map((t) => String(t)));
    const recentResale = recent.map((b: Record<string, any>) => {
      const supplierId = b.supplierTenantId?._id ? String(b.supplierTenantId._id) : null;
      const sellerId = b.sellerTenantId?._id ? String(b.sellerTenantId._id) : null;
      // Which side is the requesting admin? supplier (earns the net) or seller (earns commission).
      const role =
        supplierId && myTenantSet.has(supplierId) ? 'supplier'
        : sellerId && myTenantSet.has(sellerId) ? 'seller'
        : 'network';
      return {
        _id: b._id,
        reference: b.reference,
        title: b.attractionId?.title || null,
        amount: b.total,
        currency: b.currency,
        supplierTenant: b.supplierTenantId?.name || null,
        // Never reveal the reselling website to the supplier.
        sellerTenant: role === 'supplier' ? null : (b.sellerTenantId?.name || null),
        breakdown: b.revenueBreakdown || null,
        role,
        createdAt: b.createdAt,
      };
    });

    sendSuccess(res, {
      asSupplier: {
        total: round2(asSupplierAgg[0]?.total || 0),
        count: asSupplierAgg[0]?.count || 0,
      },
      asSeller: {
        total: round2(asSellerAgg[0]?.total || 0),
        count: asSellerAgg[0]?.count || 0,
      },
      recent: recentResale,
    });
  } catch (error) {
    next(error);
  }
};

// Anonymized, stable label for a reseller partner — the supplier can tell
// partners apart and settle per-partner without ever seeing the website name.
const partnerCode = (id: unknown): string =>
  id ? `Partner #${String(id).slice(-4).toUpperCase()}` : 'Partner #N/A';

// GET /bookings/admin/settlement
// Supplier-side payout ledger: every resale booking of the admin's tours, the
// net owed to them, grouped by (anonymized) partner, with settled/outstanding
// totals. Drives the manual-settlement workflow.
export const getSettlement = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let myTenants: unknown[] | undefined;
    if (req.user?.role !== 'super-admin') {
      myTenants = req.tenant ? [req.tenant._id] : (req.user?.assignedTenants || []);
    }

    const settlementScope: Record<string, unknown> = { isResale: true };
    if (myTenants) settlementScope.supplierTenantId = { $in: myTenants };
    const match: Record<string, unknown> = {
      $and: [settlementScope, ...earningsEligibilityClauses],
    };

    const bookings = await Booking.find(match)
      .populate('attractionId', 'title')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    // Suppliers with their own gateway hold their own funds → their card bookings
    // are supplier-settled; everyone else's card bookings are platform-settled.
    const ownGatewaySet = new Set(
      (await Tenant.find({ 'paymentSettings.ownPaymentGateway': true }).distinct('_id')).map((x) => String(x)),
    );

    let totalEarned = 0;
    let settled = 0;
    let outstanding = 0;
    const partners = new Map<string, { partnerId: string; partner: string; outstanding: number; settled: number; count: number }>();

    const items = (bookings as Array<Record<string, any>>).map((b) => {
      const net = b.revenueBreakdown?.supplierEarnings || 0;
      const isSettled = b.settlementStatus === 'settled';
      totalEarned += net;
      if (isSettled) settled += net; else outstanding += net;

      const partnerId = b.sellerTenantId ? String(b.sellerTenantId) : 'unknown';
      const code = partnerCode(b.sellerTenantId);
      const p = partners.get(partnerId) || { partnerId, partner: code, outstanding: 0, settled: 0, count: 0 };
      p.count += 1;
      if (isSettled) p.settled += net; else p.outstanding += net;
      partners.set(partnerId, p);

      return {
        _id: b._id,
        reference: b.reference,
        title: b.attractionId?.title || null,
        partner: code,
        partnerId,
        date: b.items?.[0]?.date || null,
        net: round2(net),
        currency: b.currency,
        status: isSettled ? 'settled' : 'pending',
        settledAt: b.settledAt || null,
        // Who holds the money → who may settle it (Fouad's rule). The UI uses this
        // to enable/disable the supplier's settle button per row.
        heldBy: settlementHeldBy(b.paymentMethod, ownGatewaySet.has(String(b.supplierTenantId))),
        createdAt: b.createdAt,
      };
    });

    sendSuccess(res, {
      summary: {
        totalEarned: round2(totalEarned),
        settled: round2(settled),
        outstanding: round2(outstanding),
        count: items.length,
      },
      partners: Array.from(partners.values()).map((p) => ({
        ...p,
        outstanding: round2(p.outstanding),
        settled: round2(p.settled),
      })),
      items,
    });
  } catch (error) {
    next(error);
  }
};

// Guard: can this admin settle this resale booking? (owns the supplied tour)
const canSettle = (req: AuthRequest, booking: { supplierTenantId?: unknown }): boolean => {
  if (req.user?.role === 'super-admin') return true;
  const scope = new Set((req.user?.assignedTenants || []).map((t) => String(t)));
  if (req.tenant?._id) scope.add(String(req.tenant._id));
  const sup = booking.supplierTenantId ? String(booking.supplierTenantId) : null;
  return !!sup && scope.has(sup);
};

// PATCH /bookings/admin/:id/settlement — mark one resale booking settled/pending
// DELETE /bookings/admin/:id — hard-delete a booking. Super-admin only (a
// destructive cleanup for test/junk bookings; a supplier can only CANCEL).
export const deleteBooking = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (req.user?.role !== 'super-admin') {
      sendError(res, 'Only a super admin can delete bookings', 403);
      return;
    }
    const deleted = await Booking.findByIdAndDelete(req.params.id);
    if (!deleted) {
      sendError(res, 'Booking not found', 404);
      return;
    }
    sendSuccess(res, { id: req.params.id }, 'Booking deleted');
  } catch (error) {
    next(error);
  }
};

export const updateSettlement = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (status !== 'settled' && status !== 'pending') {
      sendError(res, 'status must be "settled" or "pending"', 400);
      return;
    }

    const booking = await Booking.findById(id);
    if (!booking) { sendError(res, 'Booking not found', 404); return; }
    if (!booking.isResale) { sendError(res, 'Not a resale booking', 400); return; }
    if (!isEarningsEligible(booking)) {
      sendError(res, 'Only eligible confirmed or completed revenue can be settled', 400);
      return;
    }
    if (!canSettle(req, booking)) {
      sendError(res, 'You can only settle earnings for your own tours', 403);
      return;
    }
    // Fouad's rule: a supplier may self-settle only bookings they hold the money
    // for (cash-on-arrival or their own gateway). Platform-held online-card
    // bookings can only be settled by a super-admin (Foxes pays the supplier out).
    if (req.user?.role !== 'super-admin') {
      const sup = await Tenant.findById(booking.supplierTenantId)
        .select('paymentSettings.ownPaymentGateway')
        .lean();
      if (isPlatformHeld(booking.paymentMethod, !!sup?.paymentSettings?.ownPaymentGateway)) {
        sendError(res, 'This booking was paid online and is held by the platform — only a super admin can settle it. It still appears in your reports.', 403);
        return;
      }
    }

    booking.settlementStatus = status;
    booking.settledAt = status === 'settled' ? new Date() : undefined;
    await booking.save();

    sendSuccess(res, { id: booking._id, settlementStatus: booking.settlementStatus, settledAt: booking.settledAt }, 'Settlement updated');
  } catch (error) {
    next(error);
  }
};

// POST /bookings/admin/settlement/settle — batch settle/unsettle by booking ids
export const settleBatch = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      sendError(res, 'ids (non-empty array) required', 400);
      return;
    }
    if (status !== 'settled' && status !== 'pending') {
      sendError(res, 'status must be "settled" or "pending"', 400);
      return;
    }

    const matchClauses: Record<string, unknown>[] = [
      { _id: { $in: ids }, isResale: true },
      ...earningsEligibilityClauses,
    ];
    if (req.user?.role !== 'super-admin') {
      const scope = req.tenant ? [req.tenant._id] : (req.user?.assignedTenants || []);
      matchClauses.push({ supplierTenantId: { $in: scope } });
      // Suppliers may self-settle only bookings they hold the money for
      // (cash-on-arrival or their own gateway); platform-held card bookings are
      // silently excluded here and left for a super-admin.
      const ownGatewayTenants = await Tenant.find(
        { _id: { $in: scope }, 'paymentSettings.ownPaymentGateway': true },
      ).distinct('_id');
      matchClauses.push({
        $or: [
          { paymentMethod: { $ne: 'card' } },
          ...(ownGatewayTenants.length ? [{ supplierTenantId: { $in: ownGatewayTenants } }] : []),
        ],
      });
    }
    const match: Record<string, unknown> = { $and: matchClauses };

    const update: Record<string, unknown> = status === 'settled'
      ? { $set: { settlementStatus: 'settled', settledAt: new Date() } }
      : { $set: { settlementStatus: 'pending' }, $unset: { settledAt: '' } };

    const result = await Booking.updateMany(match, update);
    sendSuccess(res, { modified: result.modifiedCount }, `${result.modifiedCount} booking(s) marked ${status}`);
  } catch (error) {
    next(error);
  }
};
