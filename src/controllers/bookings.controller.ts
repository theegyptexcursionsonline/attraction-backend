import { resaleFieldsFor } from '../utils/resaleSplit';
import { attendanceEligibility } from '../utils/bookingAttendance';
import { incompleteBookingClause, isIncompleteBooking, realCancellationClause } from '../utils/incompleteBooking';
import { escapeRegex } from '../utils/helpers';
import { customerCursor } from '../utils/customerLists';
import { bookingGuestTotals, bookingLineSummaries, bookingTicketAddons } from '../utils/bookingLineSummary';
import { normalizeHotelPickup, HotelPickupError } from '../utils/hotel-pickup';
import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Booking } from '../models/Booking';
import { Attraction } from '../models/Attraction';
import { User } from '../models/User';
import { PromoCode } from '../models/PromoCode';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { generateBookingReference } from '../utils/hash';
import { generateTicketPdf } from '../services/pdf.service';
import { getTenantStripeConfig } from '../services/tenantPayment.service';
import { requestBookingCancellation, processBookingCancellation } from '../services/bookingCancellation.service';
import { createAdminNotifications } from '../services/notification.service';
import {
  sendBookingConfirmation,
  sendAdminBookingNotification,
  sendBookingPaymentLinkEmail,
  brandedLink,
  getEmailBrand,
} from '../services/email.service';
import { Tenant } from '../models/Tenant';
import { IdempotencyKey } from '../models/IdempotencyKey';
import { searchRegexValue } from '../utils/helpers';
import { safeEmitEvent } from '../services/webhook.service';
import { IBooking } from '../types';
import { isPlatformHeld, settlementHeldBy } from '../utils/settlement';
import {
  generateBookingAccessToken,
  verifyBookingAccessToken,
} from '../utils/bookingAccess';
import {
  BookingWithInventoryMarker,
  inventoryEntriesForItems,
  reserveInventory,
  runBookingTransaction,
  sessionOption,
} from '../services/bookingInventory.service';
import {
  isBundleComponentBooking,
  standaloneBookingClause,
} from '../services/bookingRecordScope.service';
import { priceBookingSelection } from '../services/bookingPricing.service';
import { FinanceError, customerFinance } from '../utils/financeSettings';
import { fenceFinancePolicy } from '../services/tenantFinance.service';
import { tourFinanceQuote, TourPriceChangedError } from '../services/tourFinanceQuote.service';
import { offerClaimFilter, promoClaimFilter, promoCurrencyMessage } from '../utils/discountCurrency';
import {
  AddonSelectionError,
  addonLineTotal,
  addonQuantity,
  addonsTotal,
} from '../utils/bookingAddons';
import { assertTenantIdsBookingCreationAllowed, assertTenantPaymentMethodAllowed } from '../services/tenantBookingPolicy.service';
import { configuredAvailabilityTimes } from '../utils/publicAvailability';
import { bookingEligibility, resolveBookingTimeZone } from '../utils/bookingCutoff';
import { bookingNotificationEmail } from '../utils/notificationRecipients';
import { packageSelfCancellationProblem } from '../services/packageBooking.service';
import { todayInZone } from '../services/packagePricing.service';
import { customerFeeLines } from '../utils/financeSettings';

// Compact, tenant-safe booking summary for webhook payloads. Contains only the
// booking's own fields — never other tenants' data.
export const bookingEventPayload = (
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

export const bookingResponse = (booking: IBooking): Record<string, unknown> => {
  const raw = typeof (booking as any).toJSON === 'function'
    ? (booking as any).toJSON()
    : { ...(booking as any) };
  const { financeSnapshot, attendanceRecordedBy, attendanceRecordedAt, attendanceRevision, ...customerBooking } = raw;
  if (customerBooking.revenueBreakdown) {
    const { configuredBusinessFees, sellerNetAfterConfiguredFees, ...publicBreakdown } = customerBooking.revenueBreakdown;
    customerBooking.revenueBreakdown = publicBreakdown;
  }
  return {
    ...customerBooking,
    ...(financeSnapshot ? { finance: customerFinance(financeSnapshot) } : {}),
    guestAccessToken: generateBookingAccessToken(String(booking._id), booking.reference),
  };
};

const earningsEligibilityClauses: Record<string, unknown>[] = [
  standaloneBookingClause,
  { status: { $in: ['confirmed', 'completed'] } },
  {
    $or: [
      { paymentMethod: { $ne: 'card' } },
      { paymentMethod: 'card', paymentStatus: 'succeeded' },
    ],
  },
];

const rejectBundleComponentBooking = (res: Response, booking?: { bundleOrderId?: unknown } | null): boolean => {
  if (!isBundleComponentBooking(booking)) return false;
  // Do not reveal that an internal allocation record exists. Customers and
  // admins must use the BundleOrder routes that own its lifecycle.
  sendError(res, 'Booking not found', 404);
  return true;
};

const isEarningsEligible = (booking: {
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
}): boolean =>
  ['confirmed', 'completed'].includes(booking.status || '') &&
  (booking.paymentMethod !== 'card' || booking.paymentStatus === 'succeeded');


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
    const { attractionId, tenantId: requestedTenantId, items, guestDetails, promoCode, paymentMethod, pickupSelectionVersion } = req.body;
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

    let bookingTenant = req.tenant;
    if (requestedTenantId) {
      if (!req.user || !adminRoles.includes(req.user.role)) {
        sendError(res, 'Tenant selection is only available to authorized staff', 403);
        return;
      }
      if (req.tenant && req.tenant._id.toString() !== requestedTenantId) {
        sendError(res, 'Booking tenant does not match the active site', 403);
        return;
      }
      if (req.user.role !== 'super-admin' && !hasTenantAccess(req, requestedTenantId)) {
        sendError(res, 'Booking site not found', 404);
        return;
      }
      bookingTenant = await Tenant.findOne({
        _id: requestedTenantId,
        status: { $in: ['active', 'coming_soon'] },
      }) || undefined;
      if (!bookingTenant) {
        sendError(res, 'Booking site not found', 404);
        return;
      }
    } else if (req.user && adminRoles.includes(req.user.role) && !bookingTenant) {
      sendError(res, 'Select a site before creating this booking', 400);
      return;
    }

    // Keep tenant ownership inside the lookup so a cross-tenant id is not
    // fetched and checked after the fact.
    const attraction = bookingTenant
      ? await Attraction.findOne({
          _id: attractionId,
          tenantIds: { $in: [bookingTenant._id] },
        })
      : await Attraction.findById(attractionId);
    if (!attraction) {
      sendError(res, 'Attraction not found', 404);
      return;
    }

    if (attraction.status !== 'active') {
      sendError(res, 'Attraction is not available for booking', 409);
      return;
    }

    if (attraction.enquiryOnly === true) {
      sendError(res, 'This programme is available by enquiry only', 409);
      return;
    }

    const tenantId = bookingTenant?._id || attraction.tenantIds[0];
    if (!tenantId) throw new Error('MISSING_TENANT');

    const keyHash = hashValue(idempotencyKey);
    // Compatibility metadata must not change the identity of an existing retry.
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

    // Completed requests replay before reading today's fee configuration or repricing.
    if (!bookingTenant) bookingTenant = await Tenant.findOne({ _id: tenantId }) || undefined;
    if (!bookingTenant) throw new FinanceError('FINANCE_UNAVAILABLE', 'Booking site not found.');
    const pricing = await priceBookingSelection(attraction, bookingTenant, items, promoCode);
    let { normalizedItems } = pricing;
    const { temporalChecks, subtotal, fees, now, promoCandidate, activeOffer, useSpecialOffer, discount, total } = pricing;
    const { SpecialOffer } = await import('../models/SpecialOffer');
    const quote = tourFinanceQuote(attraction._id, attraction.currency, pricing);
    if ((pricing.policy.configured || req.body.quoteHash) && req.body.quoteHash !== quote.quoteHash) throw new TourPriceChangedError(quote);

    // A completed request must replay its original receipt even if an admin has
    // since changed pickup availability. Validate new requests before inventory,
    // promotion usage or booking writes; the catch releases this processing claim.
    const bookingTimeZone = resolveBookingTimeZone(bookingTenant?.timezone);
    for (const check of temporalChecks) {
      const eligibility = bookingEligibility({ ...check, timeZone: bookingTimeZone });
      if (!eligibility.eligible) {
        if (eligibility.reason === 'cutoff_reached') throw new Error('BOOKING_CUTOFF_REACHED');
        if (eligibility.reason === 'past_departure') throw new Error('PAST_DEPARTURE');
        if (eligibility.reason === 'past_date') throw new Error('PAST_DATE');
        throw new Error('INVALID_DATE');
      }
    }

    const legacyPickupCount = attraction.hasHotelPickup === true && pickupSelectionVersion === undefined
      ? normalizedItems.filter((item: IBooking['items'][number]) => !item.hotelPickup).length
      : 0;
    normalizedItems = normalizedItems.map((item: IBooking['items'][number]) => {
      const hotelPickup = normalizeHotelPickup(attraction.hasHotelPickup === true, item.hotelPickup, pickupSelectionVersion);
      if (hotelPickup) return { ...item, hotelPickup };
      const withoutPickup = { ...item };
      delete withoutPickup.hotelPickup;
      return withoutPickup;
    });

    // Preserve completed idempotent replays above, but reject every genuinely
    // new booking for a closed tenant before inventory, discounts, or Booking
    // records can be mutated. This also covers direct API calls with no host.
    await assertTenantIdsBookingCreationAllowed([tenantId]);
    await assertTenantPaymentMethodAllowed(tenantId, paymentMethod);

    // Preserve contractual gross commission and processing deductions. Configured
    // business fees are seller expenses and never reduce the supplier obligation.
    const resaleFields = resaleFieldsFor(attraction, tenantId, total, pricing.financeSnapshot);

    const reference = generateBookingReference();
    const bookingId = new mongoose.Types.ObjectId();
    const guestAccessToken = generateBookingAccessToken(String(bookingId), reference);
    const configuredTimes = configuredAvailabilityTimes(attraction);
    const inventoryEntries = inventoryEntriesForItems(
      attractionId,
      normalizedItems,
      attraction.availability?.type === 'time-slots',
      configuredTimes.length > 0 ? configuredTimes : undefined,
    );

    const booking = await runBookingTransaction<IBooking>(async (session) => {
      await fenceFinancePolicy(pricing.policy, session);
      await reserveInventory(inventoryEntries, session);

      // Claim only the exact terms this booking was priced with (amount, type
      // and, for money amounts, the tour's currency); an edit in between fails closed.
      if (useSpecialOffer && activeOffer) {
        const consumed = await SpecialOffer.findOneAndUpdate(
          offerClaimFilter(activeOffer, attraction.currency, now),
          { $inc: { usageCount: 1 } },
          { ...sessionOption(session), new: true }
        );
        if (!consumed) throw new Error('DISCOUNT_UNAVAILABLE');
      } else if (promoCandidate) {
        const consumed = await PromoCode.findOneAndUpdate(
          promoClaimFilter(promoCandidate, attraction.currency, subtotal, now),
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
        ...(pricing.financeSnapshot ? { financeSnapshot: pricing.financeSnapshot } : {}),
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

    if (legacyPickupCount > 0) {
      console.info('booking.pickup.legacy_missing', { count: legacyPickupCount, paymentMethod: paymentMethod || 'pay-later' });
    }

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
      // The saved, server-priced lines (not the request) describe what was booked.
      const bookedLines = bookingLineSummaries(booking.items);
      const bookedGuests = bookingGuestTotals(bookedLines);

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
        .select('name slug customDomain domainMigrated contactInfo notificationSettings theme logo')
        .lean();

      try {
        const emailBrand = getEmailBrand(tenantDoc);
        const storedFirstItem = booking.items[0];
        let ticketPdf: Buffer | undefined;
        try {
          ticketPdf = await generateTicketPdf({
            reference: booking.reference,
            attractionTitle: attraction.title,
            optionName: storedFirstItem?.optionName,
            date: storedFirstItem?.date || new Date().toISOString().split('T')[0],
            time: storedFirstItem?.time,
            duration: attraction.duration,
            guestName,
            guestEmail: guestDetails.email,
            guestPhone: guestDetails.phone,
            guestCountry: guestDetails.country,
            hotelPickups: booking.items.map(item => item.hotelPickup).filter((pickup): pickup is NonNullable<typeof pickup> => Boolean(pickup)),
            items: booking.items.map(item => ({
              name: item.optionName || 'Experience',
              adults: item.quantities?.adults || 0,
              children: item.quantities?.children || 0,
              infants: item.quantities?.infants || 0,
            })),
            addons: bookedLines.some((line) => line.addons.length) ? bookingTicketAddons(bookedLines) : undefined,
            subtotal: booking.subtotal,
            fees: booking.fees,
            feeLines: customerFeeLines(booking.financeSnapshot),
            discount: booking.discount,
            total: booking.total,
            currency: booking.currency,
            paymentStatus: booking.paymentStatus,
            paymentMethod: booking.paymentMethod,
            cancellationPolicy: attraction.cancellationPolicy,
            instantConfirmation: attraction.instantConfirmation,
            tenantName: tenantDoc?.name,
            brandColor: tenantDoc?.theme?.primaryColor,
            logoUrl: emailBrand.logo,
            confirmationUrl: brandedLink(emailBrand, '/checkout/confirmation', {
              ref: booking.reference,
              accessToken: guestAccessToken,
            }),
          });
        } catch (err) {
          console.error('Pay-later ticket generation failed:', err);
        }

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
            guests: bookedGuests.adults + bookedGuests.children + bookedGuests.infants,
            lines: bookedLines,
            hotelPickup: firstItem?.hotelPickup,
            hotelPickups: booking.items.map(item => item.hotelPickup).filter((pickup): pickup is NonNullable<typeof pickup> => Boolean(pickup)),
            meetingPoint,
          },
          ticketPdf,
          tenantDoc,
        );
      } catch (err) {
        console.error('Customer confirmation email failed:', err);
      }

      try {
        const recipient = bookingNotificationEmail(tenantDoc);
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
              infants: bookedGuests.infants,
              lines: bookedLines,
              total,
              currency: attraction.currency,
              paymentMethod: paymentMethod || 'pay-later',
              hotelPickup: firstItem?.hotelPickup,
            hotelPickups: booking.items.map(item => item.hotelPickup).filter((pickup): pickup is NonNullable<typeof pickup> => Boolean(pickup)),
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
    if (error instanceof TourPriceChangedError) {
      res.status(409).json({ success: false, code: 'PRICE_CHANGED', error: error.message, quote: error.quote }); return;
    }
    if (error instanceof FinanceError) {
      res.status(409).json({ success: false, code: error.code, error: error.message }); return;
    }
    if (error instanceof Error && error.message.startsWith('INVALID_OPTION:')) {
      sendError(res, 'Invalid pricing option selected', 400);
      return;
    }
    if (error instanceof HotelPickupError) {
      sendError(res, error.message, 400);
      return;
    }
    if (error instanceof AddonSelectionError) {
      sendError(res, error.message, 400);
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_QUANTITY') {
      sendError(res, 'At least one paid guest is required', 400);
      return;
    }
    if (error instanceof Error && error.message.startsWith('PARTICIPANT_LIMIT:')) {
      const [, minimum, maximum] = error.message.split(':');
      sendError(res, `This option is available for ${minimum} to ${maximum} participants`, 400);
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_ADDON') {
      sendError(res, 'Invalid or duplicate add-on selected', 400);
      return;
    }
    if (error instanceof Error && error.message === 'PAST_DATE') {
      sendError(res, 'Cannot book a date in the past', 400);
      return;
    }
    if (error instanceof Error && error.message === 'PAST_DEPARTURE') {
      sendError(res, 'Cannot book a departure time that has already passed', 400);
      return;
    }
    if (error instanceof Error && error.message === 'BOOKING_CUTOFF_REACHED') {
      sendError(res, 'Online booking has closed for this departure', 409);
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_DATE') {
      sendError(res, 'A valid booking date is required', 400);
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_TIME_SLOT') {
      sendError(res, 'Select an available time slot for this tour', 400);
      return;
    }
    if (error instanceof Error && error.message.startsWith('INVALID_PROMO_CURRENCY:')) {
      sendError(res, promoCurrencyMessage(error.message.slice('INVALID_PROMO_CURRENCY:'.length) || null), 400);
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
      addons: (item.addons || []).map((addon: Record<string, any>) => ({
        name: addon.name,
        price: addon.price,
        pricingModel: addon.pricingModel,
        quantity: addonQuantity(addon),
        pricingType: addon.pricingType,
        totalPrice: addon.totalPrice ?? addonLineTotal(addon),
        lineTotal: addonLineTotal(addon),
      })),
    })),
    subtotal: raw.subtotal,
    fees: raw.fees,
    discount: raw.discount,
    total: raw.total,
    currency: raw.currency,
    ...(raw.financeSnapshot ? { finance: customerFinance(raw.financeSnapshot) } : {}),
    attraction: attraction
      ? {
          title: attraction.title,
          slug: attraction.slug,
          images: attraction.images,
          destination: attraction.destination,
        }
      : undefined,
    tenant: tenant ? { name: tenant.name, logo: tenant.logo, slug: tenant.slug } : undefined,
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
    if (rejectBundleComponentBooking(res, booking)) return;

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
      { path: 'tenantId', select: 'name logo slug' },
    ]);
    sendSuccess(res, confirmationSafeBooking(booking));
  } catch (error) {
    next(error);
  }
};

const isPayableCardBooking = (booking: Pick<IBooking, 'paymentMethod' | 'paymentStatus' | 'status'> & {
  inventoryReleasedAt?: unknown;
}): boolean =>
  booking.paymentMethod === 'card' &&
  booking.status === 'pending' &&
  ['pending', 'processing', 'failed'].includes(booking.paymentStatus) &&
  !booking.inventoryReleasedAt;

/**
 * Capability-protected detail needed by the hosted payment page. Unlike the
 * general confirmation response, this returns the internal booking id because
 * Stripe PaymentIntent creation is bound to that exact record. Access is still
 * fail-closed behind either an authorized principal or the booking HMAC token.
 */
export const getBookingPaymentDetails = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const booking = await Booking.findOne({ reference: req.params.reference });
    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }
    if (rejectBundleComponentBooking(res, booking)) return;

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
    if (!isPayableCardBooking(booking)) {
      sendError(res, 'This booking is no longer eligible for card payment', 409);
      return;
    }

    const [tenant, attraction] = await Promise.all([
      Tenant.findById(booking.tenantId).select('name slug logo theme').lean(),
      Attraction.findById(booking.attractionId).select('title').lean(),
    ]);
    sendSuccess(res, {
      bookingId: String(booking._id),
      attractionId: String(booking.attractionId),
      reference: booking.reference,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      total: booking.total,
      currency: booking.currency,
      guestName: `${booking.guestDetails.firstName} ${booking.guestDetails.lastName}`.trim(),
      guestEmail: booking.guestDetails.email,
      attractionTitle: attraction?.title || booking.items?.[0]?.optionName || 'Your booking',
      tenant: tenant
        ? { name: tenant.name, slug: tenant.slug, logo: tenant.logo, theme: tenant.theme }
        : undefined,
    });
  } catch (error) {
    next(error);
  }
};

/** Send or resend the hosted card-payment link from the admin booking record. */
export const sendBookingPaymentLink = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }
    if (rejectBundleComponentBooking(res, booking)) return;
    if (!hasTenantAccess(req, booking.tenantId)) {
      sendError(res, 'Not authorized to access this booking', 403);
      return;
    }
    if (!isPayableCardBooking(booking)) {
      sendError(res, 'This booking is no longer eligible for a payment link', 409);
      return;
    }

    const tenant = await Tenant.findById(booking.tenantId)
      .select('name slug customDomain domainMigrated contactInfo theme logo')
      .lean();
    const guestName = `${booking.guestDetails.firstName} ${booking.guestDetails.lastName}`.trim();
    // Deliberately NOT deduped: an admin pressing "send payment link" again is a fresh intent
    // (the guest lost the mail, the address was corrected), not a retried event. The failure
    // is reported honestly instead of surfacing as a 500 that leaves the admin guessing.
    try {
      await sendBookingPaymentLinkEmail(
        booking.guestDetails.email,
        {
          reference: booking.reference,
          guestName,
          guestAccessToken: generateBookingAccessToken(String(booking._id), booking.reference),
          total: booking.total,
          currency: booking.currency,
        },
        tenant
      );
    } catch (error) {
      console.error('[email] payment link send failed', {
        tenantId: String(booking.tenantId),
        reference: booking.reference,
        error: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
      });
      sendError(res, 'The payment link could not be emailed. Try again in a moment.', 502);
      return;
    }

    sendSuccess(res, { sent: true, reference: booking.reference }, 'Payment link sent');
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

    const { page = 1, limit = 10, status, search } = req.query;
    const pageNum = Number(page), limitNum = Number(limit);
    const query: Record<string, unknown> = { ...standaloneBookingClause, userId: req.user._id };
    if (req.tenant) query.tenantId = req.tenant._id;
    if (req.query.pagination === 'cursor') {
      if (!req.tenant) { sendError(res, 'Select a site for your bookings', 400); return; }
      const siteId = req.tenant._id;
      const literal = typeof search === 'string' ? escapeRegex(search) : '';
      const base: import('mongoose').PipelineStage[] = [
        { $match: query },
        { $lookup: { from: 'attractions', let: { tourId: '$attractionId',supplier:'$supplierTenantId',seller:'$sellerTenantId',resale:'$isResale' }, pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$tourId'] }, $or:[{tenantIds:siteId},{$expr:{$and:[{$eq:['$$resale',true]},{$eq:['$$seller',siteId]},{$eq:['$ownerTenantId','$$supplier']},{$ne:['$$supplier',null]}]}}] } },
          { $project: { _id:1,title:1,slug:1,images:1,destination:1 } },
        ], as: '__tour' } },
        { $set: { attractionId: { $arrayElemAt: ['$__tour', 0] } } },
      ];
      // Do not silently discard bookings whose catalogue reference is malformed.
      const broken = await Booking.aggregate([...base, { $match: { attractionId: { $exists:false } } }, { $limit:1 }, { $project:{_id:1} }]);
      if (broken.length) { sendError(res, 'A booking reference could not be confirmed. Please contact support.', 409); return; }
      if (literal) base.push({ $match: { $or: [{ reference: { $regex:literal,$options:'i' } }, { 'attractionId.title': { $regex:literal,$options:'i' } }] } });
      const counts = await Booking.aggregate([...base, { $group: { _id:'$status',count:{$sum:1} } }]);
      const summary = Object.fromEntries(counts.map(row => [row._id,row.count]));
      if (status) base.push({ $match: { status } });
      const plan = customerCursor({ owner:String(req.user._id),site:String(siteId),status:status || null,search:search || '' },req.query.cursor as string | undefined);
      const [rows, totals] = await Promise.all([
        Booking.aggregate([...base,{ $set:plan.normalized },...(plan.seek?[{ $match:plan.seek }]:[]),{ $sort:plan.sort },{ $limit:limitNum+1 },{ $project:{ _id:1,reference:1,items:1,currency:1,total:1,totalPrice:1,status:1,paymentStatus:1,paymentFailureReason:1,paymentFailureAt:1,createdAt:1,attractionId:1,tenantId:1,_cursor0:1,_cursor1:1 } }]),
        Booking.aggregate([...base,{ $count:'total' }]),
      ]);
      const result = plan.page(rows,limitNum,totals[0]?.total || 0);
      res.setHeader('Cache-Control','private, no-store');
      res.json({success:true,data:result.rows,pagination:result.pagination,counts:{all:counts.reduce((sum,row)=>sum+row.count,0),...summary}}); return;
    }
    if (status) query.status = status;
    // Legacy clients keep their page envelope, but every joined source must belong
    // to the booking's own seller site, including intentional network-context reads.
    // One database pipeline validates and reads the same joined rows; a separate
    // preflight followed by unrestricted populate would reopen a concurrent-edit gap.
    const [legacy] = await Booking.aggregate([
      { $match: query },
      { $lookup: {
        from: 'attractions',
        let: { tourId:'$attractionId',site:'$tenantId',supplier:'$supplierTenantId',seller:'$sellerTenantId',resale:'$isResale' },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq:['$_id','$$tourId'] },
            { $eq:[{ $type:'$$site' },'objectId'] },
            { $or: [
              { $in:['$$site',{ $cond:[{ $isArray:'$tenantIds' },'$tenantIds',[]] }] },
              { $and:[{ $eq:['$$resale',true] },{ $eq:['$$seller','$$site'] },{ $eq:['$ownerTenantId','$$supplier'] },{ $eq:[{ $type:'$$supplier' },'objectId'] }] },
            ] },
          ] } } },
          { $project:{ _id:1,title:1,slug:1,images:1,destination:1 } },
        ],
        as:'__tour',
      } },
      { $facet: {
        broken:[{ $match:{ '__tour.0':{ $exists:false } } },{ $limit:1 },{ $project:{_id:1} }],
        rows:[{ $sort:{createdAt:-1,_id:-1} },{ $skip:(pageNum-1)*limitNum },{ $limit:limitNum },{ $set:{ attractionId:{ $arrayElemAt:['$__tour',0] } } },{ $project:{__tour:0,financeSnapshot:0,attendanceRecordedBy:0,attendanceRecordedAt:0,attendanceRevision:0,'revenueBreakdown.configuredBusinessFees':0,'revenueBreakdown.sellerNetAfterConfiguredFees':0} }],
        totals:[{ $count:'total' }],
      } },
    ]);
    if (legacy?.broken.length) { sendError(res,'A booking reference could not be confirmed. Please contact support.',409); return; }
    res.setHeader('Cache-Control','private, no-store');
    sendPaginated(res,legacy?.rows || [],pageNum,limitNum,legacy?.totals[0]?.total || 0);
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
    if (rejectBundleComponentBooking(res, booking)) return;

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

    // A package trip's terms can refund less than everything, but this path refunds in full: a
    // customer cancels a paid trip themselves only while its terms give a full refund, and the
    // operator handles later cancellations.
    if (!req.user || !adminRoles.includes(req.user.role)) {
      const packageProblem = packageSelfCancellationProblem(booking, todayInZone(resolveBookingTimeZone(undefined)));
      if (packageProblem) {
        sendError(res, packageProblem, 409);
        return;
      }
    }

    if (booking.paymentStatus === 'succeeded') {
      if (booking.paymentMethod !== 'card' || !booking.stripePaymentIntentId) {
        sendError(res, 'Collected payment requires a verified gateway refund before cancellation', 409); return;
      }
      const gateway = await getTenantStripeConfig(booking.tenantId);
      if (!gateway?.enabled || !gateway.secretKey) {
        sendError(res, 'Cancellation unavailable because the payment gateway is not configured', 503); return;
      }
    }
    // Record authorized intent before Stripe. A process restart or database
    // failure after the refund is recovered by the worker/webhook.
    await requestBookingCancellation(booking._id, booking.tenantId);
    const cancelledBooking = await processBookingCancellation(booking._id, booking.tenantId);
    if (!cancelledBooking) {
      sendError(res, 'Cancellation is awaiting reconciliation; refresh the booking before taking further action', 409);
      return;
    }

    safeEmitEvent(
      cancelledBooking.tenantId,
      'booking.cancelled',
      bookingEventPayload(cancelledBooking)
    );

    sendSuccess(res, bookingResponse(cancelledBooking), 'Booking cancelled successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'INVENTORY_RELEASE_FAILED') {
      sendError(res, 'Cancellation could not safely restore inventory', 409);
      return;
    }
    if (error instanceof Error && error.message === 'CANCELLATION_PAYMENT_UNRESOLVED') {
      sendError(res, 'An active payment must be reconciled before cancellation', 409); return;
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
    if (rejectBundleComponentBooking(res, booking)) return;

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
        addons: (() => {
          const bookedLines = bookingLineSummaries(booking.items);
          return bookedLines.some((line) => line.addons.length) ? bookingTicketAddons(bookedLines) : undefined;
        })(),
        subtotal: booking.subtotal,
        fees: booking.fees,
        feeLines: customerFeeLines(booking.financeSnapshot),
        discount: booking.discount,
        total: booking.total,
        currency: booking.currency,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        hotelPickups: booking.items.map((item) => item.hotelPickup).filter((pickup): pickup is NonNullable<typeof pickup> => Boolean(pickup)),
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

    const query: Record<string, unknown> = { ...standaloneBookingClause };
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

    // One reading moment for the filter and the row flags, so a row never changes side mid-request.
    const now = new Date();
    if (status === 'refunded') {
      andClauses.push({ $or: [{ status: 'refunded' }, { paymentStatus: 'refunded' }] });
    } else if (status === 'incomplete') {
      andClauses.push(incompleteBookingClause(now));
    } else if (status === 'cancelled') {
      // Real cancellations only: a card checkout nobody paid is In-complete, not cancelled.
      andClauses.push(realCancellationClause());
    } else if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) (query.createdAt as Record<string, unknown>).$gte = new Date(startDate as string);
      if (endDate) (query.createdAt as Record<string, unknown>).$lte = new Date(endDate as string);
    }

    const safeSearch = searchRegexValue(search);
    if (safeSearch) {
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
        .populate('attractionId', 'title slug images')
        .populate('userId', 'firstName lastName email')
        .populate('tenantId', 'name slug timezone')
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
    const assignedSet = new Set((req.user?.assignedTenants || []).map(String));
    const sanitized = (bookings as Array<Record<string, any>>).map((b) => {
      const bookingSite = String(b.tenantId?._id || b.tenantId);
      const canManage = adminRoles.includes(req.user?.role || '') && (isSuper || assignedSet.has(bookingSite)) && (!req.tenant || String(req.tenant._id) === bookingSite);
      b.incomplete = isIncompleteBooking(b, now);
      b.attendanceStatus = b.attendanceStatus || 'not-recorded';
      b.attendanceRevision = b.attendanceRevision || 0;
      b.attendanceEligibility = canManage ? attendanceEligibility(b, b.tenantId?.timezone) : { canMarkNoShow: false, reason: 'Only the selling website can update attendance.' };

      b.attendanceEligibility.canUndoNoShow = canManage && b.attendanceStatus === 'no-show';
      if (!isSuper && b.isResale) {
        const supplierId = b.supplierTenantId ? String(b.supplierTenantId) : null;
        const sellerId = b.sellerTenantId ? String(b.sellerTenantId) : null;
        const viewerIsSupplier = supplierId && scopeSet.has(supplierId);
        const viewerIsSeller = sellerId && scopeSet.has(sellerId);
        if (viewerIsSupplier && !viewerIsSeller) {
          b.tenantId = { name: 'Reseller partner' };
          b.sellerTenantId = undefined;
          delete b.financeSnapshot;
          delete b.attendanceRecordedBy;
          if (b.revenueBreakdown) { delete b.revenueBreakdown.configuredBusinessFees; delete b.revenueBreakdown.sellerNetAfterConfiguredFees; }
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
    if (rejectBundleComponentBooking(res, booking)) return;

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

    if (['cancelled', 'refunded'].includes(booking.status)) {
      sendError(res, 'A cancelled or refunded booking cannot be reopened', 409); return;
    }
    const updated = await Booking.findOneAndUpdate({ _id: booking._id, tenantId: booking.tenantId,
      status: booking.status, paymentStatus: booking.paymentStatus, cancellationRequestedAt: { $exists: false },
    }, { $set: status ? { status } : {} }, { new: true, runValidators: true });
    if (!updated) { sendError(res, 'Booking changed or cancellation is being reconciled; refresh before editing', 409); return; }
    sendSuccess(res, updated, 'Booking updated successfully');
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
    if (!req.user || !['super-admin', 'brand-admin', 'manager', 'editor', 'viewer'].includes(req.user.role)) {
      sendError(res, 'Administrator access required', req.user ? 403 : 401);
      return;
    }
    const query: Record<string, unknown> = { ...standaloneBookingClause };

    if (req.user?.role === 'super-admin' && req.tenant) {
      query.tenantId = req.tenant._id;
    } else if (req.user?.role !== 'super-admin') {
      if (req.tenant) {
        // Re-enforce membership here as well as in the route's tenant resolver.
        query.tenantId = { $eq: req.tenant._id, $in: req.user.assignedTenants || [] };
      } else {
        query.tenantId = { $in: req.user?.assignedTenants || [] };
      }
    }

    // A card checkout nobody paid is In-complete: it is counted on its own and never as a booking or
    // a cancellation (client request, 9 Oct 2026).
    const incomplete = incompleteBookingClause(new Date());
    const [
      totalBookings,
      confirmedBookings,
      pendingBookings,
      completedBookings,
      cancelledBookings,
      refundedBookings,
      incompleteBookings,
      revenueAgg,
    ] = await Promise.all([
      Booking.countDocuments({ ...query, $nor: [incomplete] }),
      Booking.countDocuments({ ...query, status: 'confirmed' }),
      Booking.countDocuments({ ...query, $nor: [incomplete], status: 'pending' }),
      Booking.countDocuments({ ...query, status: 'completed' }),
      Booking.countDocuments({ ...query, $and: [realCancellationClause()] }),
      Booking.countDocuments({ ...query, $or: [{ status: 'refunded' }, { paymentStatus: 'refunded' }] }),
      Booking.countDocuments({ ...query, $and: [incomplete] }),
      Booking.aggregate([
        { $match: query },
        {
          $set: {
            reportingCurrency: {
              $toUpper: { $trim: { input: { $convert: { input: '$currency', to: 'string', onError: '', onNull: '' } } } },
            },
          },
        },
        {
          $group: {
            // Never add unlike currencies or infer a missing currency from the site.
            _id: { $cond: [{ $regexMatch: { input: '$reportingCurrency', regex: /^[A-Z]{3}$/ } }, '$reportingCurrency', null] },
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

    const currencyTotals = revenueAgg.map((row: { _id: string | null; bookedRevenue: number; collectedRevenue: number }) => ({
      currency: row._id,
      bookedRevenue: round2(row.bookedRevenue),
      collectedRevenue: round2(row.collectedRevenue),
    })).sort((left, right) => left.currency === null ? 1 : right.currency === null ? -1 : left.currency.localeCompare(right.currency));
    // Retain scalar fields for compatible clients only when they have one known unit.
    // Null is deliberate: mixed or unidentified money has no honest scalar total.
    const rev = currencyTotals.length === 0 ? { bookedRevenue: 0, collectedRevenue: 0 }
      : currencyTotals.length === 1 && currencyTotals[0].currency ? currencyTotals[0] : null;
    sendSuccess(res, {
      totalBookings,
      confirmedBookings,
      pendingBookings,
      completedBookings,
      cancelledBookings,
      refundedBookings,
      incompleteBookings,
      currency: currencyTotals.length === 1 ? currencyTotals[0].currency : null,
      currencyTotals,
      totalRevenue: rev?.bookedRevenue ?? null,
      bookedRevenue: rev?.bookedRevenue ?? null,
      collectedRevenue: rev?.collectedRevenue ?? null,
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
        { $group: { _id: null, total: { $sum: '$revenueBreakdown.sellerEarnings' }, sellerNetAfterConfiguredFees: { $sum: { $ifNull: ['$revenueBreakdown.sellerNetAfterConfiguredFees', '$revenueBreakdown.sellerEarnings'] } }, configuredBusinessFees: { $sum: '$revenueBreakdown.configuredBusinessFees' }, count: { $sum: 1 } } },
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
      if (role === 'supplier' && b.revenueBreakdown) { delete b.revenueBreakdown.configuredBusinessFees; delete b.revenueBreakdown.sellerNetAfterConfiguredFees; }
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
        sellerNetAfterConfiguredFees: round2(asSellerAgg[0]?.sellerNetAfterConfiguredFees || 0),
        configuredBusinessFees: round2(asSellerAgg[0]?.configuredBusinessFees || 0),
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
    const deleted = await Booking.findOneAndDelete({
      _id: req.params.id,
      ...standaloneBookingClause,
    });
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
    if (rejectBundleComponentBooking(res, booking)) return;
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
      standaloneBookingClause,
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
