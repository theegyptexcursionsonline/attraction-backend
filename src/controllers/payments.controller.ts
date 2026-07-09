import { Response, NextFunction, Request } from 'express';
import { Booking } from '../models/Booking';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types';
import { createMockPaymentIntent, confirmMockPayment, createMockRefund } from '../services/stripe.service';
import { generateTicketPdf } from '../services/pdf.service';
import { sendBookingConfirmation } from '../services/email.service';
import { safeEmitEvent, recordInboundEvent } from '../services/webhook.service';

// Compact, tenant-safe booking summary for webhook payloads (the booking's own
// fields only — never cross-tenant data).
const paymentEventPayload = (booking: {
  _id: unknown;
  reference: string;
  tenantId: unknown;
  attractionId?: unknown;
  status: string;
  paymentStatus: string;
  total: number;
  currency: string;
}): Record<string, unknown> => ({
  bookingId: String(booking._id),
  reference: booking.reference,
  tenantId: String(booking.tenantId),
  attractionId: booking.attractionId ? String(booking.attractionId) : undefined,
  status: booking.status,
  paymentStatus: booking.paymentStatus,
  total: booking.total,
  currency: booking.currency,
});

const adminRoles = ['super-admin', 'brand-admin', 'manager'];

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

export const createPaymentIntent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId).populate('attractionId', 'title');

    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }

    if (!canAccessBooking(req, booking.userId, booking.tenantId)) {
      sendError(res, 'Not authorized to process payment for this booking', 403);
      return;
    }

    if (booking.paymentStatus !== 'pending') {
      sendError(res, 'Payment already processed', 400);
      return;
    }

    // Create mock PaymentIntent
    const paymentIntent = createMockPaymentIntent(
      Math.round(booking.total * 100),
      booking.currency.toLowerCase(),
      {
        bookingId: booking._id.toString(),
        bookingReference: booking.reference,
      }
    );

    // Update booking with payment intent ID
    booking.stripePaymentIntentId = paymentIntent.id;
    booking.paymentStatus = 'processing';
    await booking.save();

    sendSuccess(res, {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: booking.total,
      currency: booking.currency,
    });
  } catch (error) {
    next(error);
  }
};

export const confirmPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId)
      .populate('attractionId', 'title slug images destination meetingPoint');

    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }

    if (booking.paymentStatus !== 'processing' && booking.paymentStatus !== 'pending') {
      sendError(res, 'Payment cannot be confirmed', 400);
      return;
    }

    // Mock payment confirmation - immediately succeeds
    booking.paymentStatus = 'succeeded';
    booking.status = 'confirmed';
    booking.paymentMethod = 'card';

    if (!booking.stripePaymentIntentId) {
      booking.stripePaymentIntentId = `pi_mock_auto_${Date.now()}`;
    }

    await booking.save();

    // Outbound webhooks: a successful payment confirms the booking. Tenant-scoped.
    safeEmitEvent(booking.tenantId, 'payment.succeeded', paymentEventPayload(booking));
    safeEmitEvent(booking.tenantId, 'booking.confirmed', paymentEventPayload(booking));

    // Generate ticket PDF and send confirmation email
    try {
      const attraction = booking.attractionId as any;
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
        cancellationPolicy: attraction?.cancellationPolicy,
        instantConfirmation: attraction?.instantConfirmation,
      };

      const pdfBuffer = await generateTicketPdf(ticketData);

      // Resolve the tenant so the confirmation email is branded for that site.
      const tenantBrand = await Tenant.findById(booking.tenantId)
        .select('name slug customDomain domainMigrated')
        .lean();

      // Send confirmation email with PDF attachment
      await sendBookingConfirmation(
        booking.guestDetails.email,
        {
          reference: booking.reference,
          attractionTitle: attraction?.title || 'Experience',
          date: booking.items[0]?.date || '',
          time: booking.items[0]?.time,
          guestName: `${booking.guestDetails.firstName} ${booking.guestDetails.lastName}`,
          total: booking.total,
          currency: booking.currency,
        },
        pdfBuffer,
        tenantBrand
      );

      // The mobile ticket is now issued — notify subscribers. Tenant-scoped.
      safeEmitEvent(booking.tenantId, 'ticket.issued', {
        ...paymentEventPayload(booking),
        attractionTitle: attraction?.title,
      });
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
      // Don't fail the payment if email fails
    }

    sendSuccess(res, {
      reference: booking.reference,
      paymentStatus: booking.paymentStatus,
      bookingStatus: booking.status,
      amount: booking.total,
      currency: booking.currency,
    }, 'Payment confirmed successfully');
  } catch (error) {
    next(error);
  }
};

export const handleWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Inbound provider webhook (Stripe). The body arrives raw (express.raw on
  // this path) so a real Stripe signature check can be added without a parser
  // mutating the bytes. Idempotency is enforced via the (provider, eventId)
  // unique index so provider retries never double-confirm a booking.
  try {
    let event: {
      id?: string;
      type?: string;
      data?: { object?: { id?: string; metadata?: { bookingId?: string } } };
    };
    try {
      const raw = Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body || {});
      event = raw ? JSON.parse(raw) : {};
    } catch {
      sendError(res, 'Invalid webhook payload', 400);
      return;
    }

    const eventId = event.id;
    const eventType = event.type;

    if (!eventId) {
      // Without an id we can't dedupe; acknowledge so the provider stops
      // retrying, but take no action.
      res.json({ received: true, ignored: 'missing event id' });
      return;
    }

    // Idempotency gate — first writer wins; duplicates short-circuit.
    const { duplicate } = await recordInboundEvent('stripe', eventId, { eventType });
    if (duplicate) {
      res.json({ received: true, duplicate: true });
      return;
    }

    if (eventType === 'payment_intent.succeeded' || eventType === 'checkout.session.completed') {
      const obj = event.data?.object;
      const intentId = obj?.id;
      const bookingId = obj?.metadata?.bookingId;
      const booking = bookingId
        ? await Booking.findById(bookingId)
        : intentId
          ? await Booking.findOne({ stripePaymentIntentId: intentId })
          : null;

      if (booking && booking.paymentStatus !== 'succeeded') {
        booking.paymentStatus = 'succeeded';
        booking.status = 'confirmed';
        await booking.save();
        safeEmitEvent(booking.tenantId, 'payment.succeeded', paymentEventPayload(booking));
        safeEmitEvent(booking.tenantId, 'booking.confirmed', paymentEventPayload(booking));
      }
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
};

export const getPaymentStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId).select(
      'reference paymentStatus status total currency userId tenantId'
    );

    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }

    if (!canAccessBooking(req, booking.userId, booking.tenantId)) {
      sendError(res, 'Not authorized to view this payment', 403);
      return;
    }

    sendSuccess(res, {
      reference: booking.reference,
      paymentStatus: booking.paymentStatus,
      bookingStatus: booking.status,
      amount: booking.total,
      currency: booking.currency,
    });
  } catch (error) {
    next(error);
  }
};

export const refundPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const { amount } = req.body;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }

    if (!req.user) {
      sendError(res, 'Authentication required', 401);
      return;
    }

    if (!hasTenantAccess(req, booking.tenantId)) {
      sendError(res, 'Not authorized to refund this booking', 403);
      return;
    }

    if (!booking.stripePaymentIntentId) {
      sendError(res, 'No payment found for this booking', 400);
      return;
    }

    if (booking.paymentStatus !== 'succeeded') {
      sendError(res, 'Payment cannot be refunded', 400);
      return;
    }

    // Create mock refund
    const refundAmount = amount
      ? Math.round(amount * 100)
      : Math.round(booking.total * 100);

    createMockRefund(booking.stripePaymentIntentId, refundAmount);

    booking.paymentStatus = 'refunded';
    booking.status = 'refunded';
    await booking.save();

    sendSuccess(res, booking, 'Refund processed successfully');
  } catch (error) {
    next(error);
  }
};
