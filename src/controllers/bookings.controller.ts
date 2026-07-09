import { Response, NextFunction } from 'express';
import { Booking } from '../models/Booking';
import { Attraction } from '../models/Attraction';
import { User } from '../models/User';
import { PromoCode } from '../models/PromoCode';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { generateBookingReference } from '../utils/hash';
import { generateTicketPdf } from '../services/pdf.service';
import { createMockRefund } from '../services/stripe.service';
import { createAdminNotifications } from '../services/notification.service';
import { sendBookingConfirmation, sendAdminBookingNotification } from '../services/email.service';
import { Tenant } from '../models/Tenant';
import { escapeRegex } from '../utils/helpers';
import { Availability } from '../models/Availability';
import { safeEmitEvent } from '../services/webhook.service';
import { IBooking } from '../types';
import { isPlatformHeld, settlementHeldBy } from '../utils/settlement';

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

// Payment-processing fee deducted from the supplier's net on a resale booking
// (configurable). The supplier receives: total − reseller commission − this fee.
const RESELLER_PAYMENT_FEE_PERCENT = 2.9;

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

export const createBooking = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { attractionId, items, guestDetails, promoCode, paymentMethod } = req.body;

    // Verify attraction exists
    const attraction = await Attraction.findById(attractionId);
    if (!attraction) {
      sendError(res, 'Attraction not found', 404);
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
    }) => {
      const option = attraction.pricingOptions.find((o) => o.id === item.optionId);
      if (!option) {
        throw new Error(`INVALID_OPTION:${item.optionId}`);
      }

      const payableGuests = (item.quantities?.adults || 0) + (item.quantities?.children || 0);
      if (payableGuests <= 0) {
        throw new Error('INVALID_QUANTITY');
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
          price: catalogAddon?.price || addon.price,
        };
      });

      return {
        optionId: option.id,
        optionName: option.name,
        date: item.date,
        time: item.time,
        quantities: item.quantities,
        unitPrice,
        totalPrice,
        ...(appliedCategory ? { category: appliedCategory } : {}),
        ...(validAddons.length > 0 ? { addons: validAddons } : {}),
      };
    });

    const subtotal = normalizedItems.reduce(
      (acc: number, item: { totalPrice: number; addons?: Array<{ price: number }> }) => {
        const addonsTotal = (item.addons || []).reduce((s, a) => s + a.price, 0);
        return acc + item.totalPrice + addonsTotal;
      },
      0
    );

    const fees = Math.round(subtotal * 0.05 * 100) / 100; // 5% service fee
    let discount = 0;

    // Validate promo code
    if (promoCode) {
      const promo = await PromoCode.findOne({
        code: promoCode.toUpperCase(),
        isActive: true,
        validFrom: { $lte: new Date() },
        validUntil: { $gte: new Date() },
      });

      if (promo && promo.usageCount < promo.usageLimit && subtotal >= promo.minOrderAmount) {
        if (promo.discountType === 'percentage') {
          discount = Math.round(subtotal * (promo.discountValue / 100) * 100) / 100;
          if (promo.maxDiscount) {
            discount = Math.min(discount, promo.maxDiscount);
          }
        } else {
          discount = promo.discountValue;
        }

        // Increment usage count
        await PromoCode.findByIdAndUpdate(promo._id, { $inc: { usageCount: 1 } });
      }
    }

    // Auto-apply best special offer (if better than promo code)
    let specialOfferId = null;
    const { SpecialOffer } = await import('../models/SpecialOffer');
    const activeOffer = await SpecialOffer.findOne({
      attractionId,
      isActive: true,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() },
      $expr: { $lt: ['$usageCount', '$usageLimit'] },
    }).sort({ discountValue: -1 });

    if (activeOffer) {
      let offerDiscount = 0;
      if (activeOffer.discountType === 'percentage') {
        offerDiscount = Math.round(subtotal * (activeOffer.discountValue / 100) * 100) / 100;
      } else {
        offerDiscount = activeOffer.discountValue;
      }
      if (offerDiscount > discount) {
        discount = offerDiscount;
        specialOfferId = activeOffer._id;
        await SpecialOffer.findByIdAndUpdate(activeOffer._id, { $inc: { usageCount: 1 } });
      }
    }

    const total = subtotal + fees - discount;

    const tenantId = req.tenant?._id || attraction.tenantIds[0];
    if (!tenantId) {
      sendError(res, 'Attraction is not assigned to any tenant', 400);
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

    // Create booking
    const booking = await Booking.create({
      reference: generateBookingReference(),
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
      promoCode,
      specialOfferId,
      paymentMethod: paymentMethod || 'pay-later',
      status: paymentMethod === 'pay-later' ? 'confirmed' : 'pending',
      paymentStatus: paymentMethod === 'pay-later' ? 'pending' : 'pending',
      ...resaleFields,
    });

    // Outbound webhooks: booking.created always; booking.confirmed when the
    // booking is immediately confirmed (pay-later). Tenant-scoped emit.
    safeEmitEvent(tenantId, 'booking.created', bookingEventPayload(booking));
    if (booking.status === 'confirmed') {
      safeEmitEvent(tenantId, 'booking.confirmed', bookingEventPayload(booking));
    }

    // Update user stats if logged in
    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { totalBookings: 1, totalSpent: total },
      });
    }

    // Decrement availability for booked slots
    for (const item of items) {
      if (item.date) {
        const bookingDate = new Date(item.date);
        bookingDate.setHours(0, 0, 0, 0);
        const totalGuests = (item.quantities?.adults || 0) + (item.quantities?.children || 0);

        if (item.time) {
          await Availability.findOneAndUpdate(
            { attractionId, date: bookingDate, 'timeSlots.time': item.time },
            { $inc: { 'timeSlots.$.booked': totalGuests } },
            { upsert: false }
          );
        } else {
          await Availability.findOneAndUpdate(
            { attractionId, date: bookingDate },
            { $inc: { allDayBooked: totalGuests } },
            { upsert: false }
          );
        }
      }
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
    //   • Admin notification to the tenant's contact email + Fouad's central
    //     inbox so brand operators see new bookings in their inbox.
    (async () => {
     // Whole block guarded: a tenant lookup or mail failure must never surface
     // as an unhandled promise rejection (which would crash the process on a DB
     // blip, since nothing awaits this IIFE).
     try {
      const firstItem = items[0];
      const totalAdults = items.reduce((s: number, it: { quantities?: { adults?: number } }) => s + (it.quantities?.adults || 0), 0);
      const totalChildren = items.reduce((s: number, it: { quantities?: { children?: number } }) => s + (it.quantities?.children || 0), 0);
      const guestName = `${guestDetails.firstName} ${guestDetails.lastName}`.trim();

      // One tenant lookup, reused for both the customer confirmation (branding)
      // and the operator notification below.
      const tenantDoc = await Tenant.findById(tenantId)
        .select('name slug customDomain domainMigrated contactInfo')
        .lean();

      try {
        await sendBookingConfirmation(
          guestDetails.email,
          {
            reference: booking.reference,
            attractionTitle: attraction.title,
            date: firstItem?.date || '',
            time: firstItem?.time,
            guestName,
            total,
            currency: attraction.currency,
          },
          undefined,
          tenantDoc,
        );
      } catch (err) {
        console.error('Customer confirmation email failed:', err);
      }

      try {
        const recipients = new Set<string>();
        if (tenantDoc?.contactInfo?.email) recipients.add(tenantDoc.contactInfo.email);
        recipients.add('info@foxestechnology.com');
        for (const recipient of recipients) {
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
            });
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

    sendSuccess(res, booking, 'Booking created successfully', 201);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('INVALID_OPTION:')) {
      sendError(res, 'Invalid pricing option selected', 400);
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_QUANTITY') {
      sendError(res, 'At least one paid guest is required', 400);
      return;
    }
    next(error);
  }
};

export const getBookingByReference = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { reference } = req.params;

    const booking = await Booking.findOne({ reference })
      .populate('attractionId', 'title slug images destination')
      .populate('tenantId', 'name logo');

    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }

    // Reference-based lookup is public — the reference itself acts as auth
    // (only the booker and admin know the reference)
    sendSuccess(res, booking);
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
    if (!['pending', 'confirmed'].includes(booking.status)) {
      sendError(res, 'Booking cannot be cancelled', 400);
      return;
    }

    // If payment was made, process refund
    if (booking.paymentStatus === 'succeeded' && booking.stripePaymentIntentId) {
      createMockRefund(booking.stripePaymentIntentId, Math.round(booking.total * 100));
      booking.paymentStatus = 'refunded';
      booking.status = 'refunded';
    }

    booking.status = 'cancelled';
    await booking.save();

    safeEmitEvent(booking.tenantId, 'booking.cancelled', bookingEventPayload(booking));

    sendSuccess(res, booking, 'Booking cancelled successfully');
  } catch (error) {
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

    const booking = await Booking.findById(id)
      .populate('attractionId')
      .populate('tenantId', 'name theme logo');

    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }

    // Allow public access when user is not authenticated (optionalAuth)
    // but still gate for authenticated users who don't own the booking
    if (req.user && !canAccessBooking(req, booking.userId, booking.tenantId)) {
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
    if (req.user?.role !== 'super-admin') {
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

    const booking = await Booking.findById(id);

    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }

    if (!canAccessBooking(req, booking.userId, booking.tenantId)) {
      sendError(res, 'Not authorized to update this booking', 403);
      return;
    }

    if (status) {
      booking.status = status;
    }
    if (paymentStatus) {
      booking.paymentStatus = paymentStatus;
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

    if (req.user?.role !== 'super-admin') {
      if (req.tenant) {
        query.tenantId = req.tenant._id;
      } else {
        query.tenantId = { $in: req.user?.assignedTenants || [] };
      }
    }

    const [totalBookings, confirmedBookings, pendingBookings, cancelledBookings, revenueAgg] = await Promise.all([
      Booking.countDocuments(query),
      Booking.countDocuments({ ...query, status: 'confirmed' }),
      Booking.countDocuments({ ...query, status: 'pending' }),
      Booking.countDocuments({ ...query, status: 'cancelled' }),
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
            collectedRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'succeeded'] }, '$total', 0] } },
          },
        },
      ]),
    ]);

    const rev = revenueAgg[0] || { bookedRevenue: 0, collectedRevenue: 0 };
    sendSuccess(res, {
      totalBookings,
      confirmedBookings,
      pendingBookings,
      cancelledBookings,
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
      const match: Record<string, unknown> = { isResale: true };
      if (myTenants) match[field] = { $in: myTenants };
      return match;
    };

    const recentMatch: Record<string, unknown> = { isResale: true };
    if (myTenants) {
      recentMatch.$or = [
        { supplierTenantId: { $in: myTenants } },
        { sellerTenantId: { $in: myTenants } },
      ];
    }

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

    const match: Record<string, unknown> = { isResale: true };
    if (myTenants) match.supplierTenantId = { $in: myTenants };

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

    const match: Record<string, unknown> = { _id: { $in: ids }, isResale: true };
    if (req.user?.role !== 'super-admin') {
      const scope = req.tenant ? [req.tenant._id] : (req.user?.assignedTenants || []);
      match.supplierTenantId = { $in: scope };
      // Suppliers may self-settle only bookings they hold the money for
      // (cash-on-arrival or their own gateway); platform-held card bookings are
      // silently excluded here and left for a super-admin.
      const ownGatewayTenants = await Tenant.find(
        { _id: { $in: scope }, 'paymentSettings.ownPaymentGateway': true },
      ).distinct('_id');
      match.$or = [
        { paymentMethod: { $ne: 'card' } },
        ...(ownGatewayTenants.length ? [{ supplierTenantId: { $in: ownGatewayTenants } }] : []),
      ];
    }

    const update: Record<string, unknown> = status === 'settled'
      ? { $set: { settlementStatus: 'settled', settledAt: new Date() } }
      : { $set: { settlementStatus: 'pending' }, $unset: { settledAt: '' } };

    const result = await Booking.updateMany(match, update);
    sendSuccess(res, { modified: result.modifiedCount }, `${result.modifiedCount} booking(s) marked ${status}`);
  } catch (error) {
    next(error);
  }
};
