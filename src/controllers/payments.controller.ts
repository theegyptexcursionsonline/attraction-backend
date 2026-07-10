import { Response, NextFunction, Request } from 'express';
import type Stripe from 'stripe';
import { Booking } from '../models/Booking';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types';
import {
  createPaymentIntent as stripeCreatePaymentIntent,
  retrievePaymentIntent,
  retrieveSucceededRefundAmount,
  createRefund as stripeCreateRefund,
  constructWebhookEvent,
} from '../services/stripe.service';
import type { PaymentIntentResult } from '../services/stripe.service';
import {
  evaluateStripeConfirmation,
  getTenantStripeConfig,
  saveTenantStripeConfig,
} from '../services/tenantPayment.service';
import { secretHint } from '../utils/secretCrypto';
import { generateTicketPdf } from '../services/pdf.service';
import { sendBookingConfirmation, sendAdminBookingNotification } from '../services/email.service';
import { safeEmitEvent, recordInboundEvent } from '../services/webhook.service';
import { env } from '../config/env';
import { generateBookingAccessToken, verifyBookingAccessToken } from '../utils/bookingAccess';
import { failCardBookingAndReleaseInventory } from '../services/bookingInventory.service';

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

type StripeMode = 'test' | 'live' | 'mixed' | 'unconfigured';

const stripeKeyMode = (key?: string): 'test' | 'live' | null => {
  const match = key?.match(/_(test|live)_/);
  return match ? (match[1] as 'test' | 'live') : null;
};

const resolveStripeMode = (publishableKey?: string, secretKey?: string): StripeMode => {
  const publishableMode = stripeKeyMode(publishableKey);
  const secretMode = stripeKeyMode(secretKey);
  if (publishableMode && secretMode && publishableMode !== secretMode) return 'mixed';
  return publishableMode || secretMode || 'unconfigured';
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

const canGuestAccessBooking = (
  booking: { _id: unknown; reference: string; guestDetails?: { email?: string } },
  suppliedEmail?: unknown,
  suppliedToken?: unknown
): boolean =>
  typeof suppliedEmail === 'string' &&
  !!booking.guestDetails?.email &&
  booking.guestDetails.email.trim().toLowerCase() === suppliedEmail.trim().toLowerCase() &&
  verifyBookingAccessToken(suppliedToken, String(booking._id), booking.reference);

type PaymentBinding = {
  _id: unknown;
  tenantId: unknown;
  stripePaymentIntentId?: string;
  total: number;
  currency: string;
};

const bookingAmountMinor = (booking: Pick<PaymentBinding, 'total'>): number =>
  Math.round(booking.total * 100);

const paymentBindingError = (
  booking: PaymentBinding,
  intent: PaymentIntentResult,
  requireSucceeded: boolean
): string | null => {
  if (!booking.stripePaymentIntentId || intent.id !== booking.stripePaymentIntentId) {
    return 'Stripe PaymentIntent does not match this booking';
  }
  if (intent.metadata.bookingId !== String(booking._id)) {
    return 'Stripe PaymentIntent booking metadata does not match';
  }
  if (intent.metadata.tenantId !== String(booking.tenantId)) {
    return 'Stripe PaymentIntent tenant metadata does not match';
  }
  if (intent.amount !== bookingAmountMinor(booking)) {
    return 'Stripe PaymentIntent amount does not match this booking';
  }
  if (intent.currency.toLowerCase() !== booking.currency.toLowerCase()) {
    return 'Stripe PaymentIntent currency does not match this booking';
  }
  if (requireSucceeded && intent.status !== 'succeeded') {
    return 'Payment has not completed yet';
  }
  if (requireSucceeded && intent.amountReceived !== bookingAmountMinor(booking)) {
    return 'Stripe amount received does not match this booking';
  }
  return null;
};

const paymentIntentResponse = (
  booking: Pick<PaymentBinding, 'total' | 'currency'>,
  intent: PaymentIntentResult,
  publishableKey: string
) => ({
  clientSecret: intent.clientSecret,
  paymentIntentId: intent.id,
  publishableKey,
  amount: booking.total,
  currency: booking.currency,
});

export const createPaymentIntent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { bookingId, guestEmail, guestAccessToken } = req.body;

    if (!req.user && !guestEmail) {
      sendError(res, 'Authentication or guest email is required', 401);
      return;
    }

    const booking = await Booking.findById(bookingId).populate('attractionId', 'title');

    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }

    if (
      !canAccessBooking(req, booking.userId, booking.tenantId) &&
      !canGuestAccessBooking(booking, guestEmail, guestAccessToken)
    ) {
      sendError(res, 'Not authorized to process payment for this booking', 403);
      return;
    }

    if (!['pending', 'processing', 'failed'].includes(booking.paymentStatus)) {
      sendError(res, 'Payment already processed', 400);
      return;
    }

    // Resolve THIS booking's tenant's own Stripe gateway. Online payment is only
    // available when that site's admin has configured + enabled their keys.
    const stripeCfg = await getTenantStripeConfig(booking.tenantId);
    if (
      !stripeCfg ||
      !stripeCfg.enabled ||
      !stripeCfg.secretKey ||
      !stripeCfg.publishableKey
    ) {
      sendError(res, 'Online payment is not enabled for this site', 400);
      return;
    }

    // A reload or retry must resume the already-bound PaymentIntent rather than
    // create another possible charge for the same booking.
    if (booking.stripePaymentIntentId) {
      const existingIntent = await retrievePaymentIntent(
        stripeCfg.secretKey,
        booking.stripePaymentIntentId
      );
      if (!existingIntent) {
        sendError(res, 'The existing Stripe payment session could not be retrieved', 502);
        return;
      }
      const bindingError = paymentBindingError(booking, existingIntent, false);
      if (bindingError) {
        sendError(res, bindingError, 409);
        return;
      }
      if (existingIntent.status === 'canceled') {
        sendError(res, 'The existing Stripe payment session was cancelled', 409);
        return;
      }

      sendSuccess(
        res,
        paymentIntentResponse(booking, existingIntent, stripeCfg.publishableKey),
        'Payment session resumed'
      );
      return;
    }

    const paymentIntent = await stripeCreatePaymentIntent(
      stripeCfg.secretKey,
      bookingAmountMinor(booking),
      booking.currency.toLowerCase(),
      {
        bookingId: booking._id.toString(),
        bookingReference: booking.reference,
        tenantId: String(booking.tenantId),
      },
      {
        // Stripe returns the same intent when concurrent/retried requests use
        // this key, including a retry after Stripe succeeded but MongoDB did not.
        idempotencyKey: `booking:${booking._id}:payment:${bookingAmountMinor(booking)}:${booking.currency.toLowerCase()}`,
      }
    );

    const createdBindingError = paymentBindingError(
      {
        _id: booking._id,
        tenantId: booking.tenantId,
        stripePaymentIntentId: paymentIntent.id,
        total: booking.total,
        currency: booking.currency,
      },
      paymentIntent,
      false
    );
    if (createdBindingError) {
      sendError(res, `Stripe created an invalid payment session: ${createdBindingError}`, 502);
      return;
    }

    // Bind the provider intent exactly once. If another request won the race,
    // deterministic Stripe idempotency means it bound this same intent.
    const claimed = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        paymentStatus: { $in: ['pending', 'failed'] },
        $or: [
          { stripePaymentIntentId: { $exists: false } },
          { stripePaymentIntentId: null },
          { stripePaymentIntentId: '' },
        ],
      },
      {
        $set: {
          stripePaymentIntentId: paymentIntent.id,
          paymentStatus: 'processing',
        },
      },
      { new: true }
    );

    if (!claimed) {
      const latest = await Booking.findById(booking._id);
      if (!latest?.stripePaymentIntentId) {
        sendError(res, 'Payment session could not be bound to this booking', 409);
        return;
      }
      const latestIntent = await retrievePaymentIntent(stripeCfg.secretKey, latest.stripePaymentIntentId);
      if (!latestIntent) {
        sendError(res, 'The existing Stripe payment session could not be retrieved', 502);
        return;
      }
      const bindingError = paymentBindingError(latest, latestIntent, false);
      if (bindingError) {
        sendError(res, bindingError, 409);
        return;
      }
      sendSuccess(
        res,
        paymentIntentResponse(latest, latestIntent, stripeCfg.publishableKey),
        'Payment session resumed'
      );
      return;
    }

    sendSuccess(
      res,
      paymentIntentResponse(claimed, paymentIntent, stripeCfg.publishableKey),
      'Payment session created'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Finalize a paid booking (idempotent). Marks it paid + confirmed, then sends the
 * branded customer confirmation (with PDF ticket) + the operator notification and
 * emits outbound webhooks. Safe to call from BOTH the Stripe webhook and the confirm
 * endpoint — the first caller wins; a duplicate call short-circuits so emails never
 * double-send. This is the single place a card booking becomes "paid".
 */
const finalizePaidBooking = async (
  bookingId: string,
  expected: { tenantId: unknown; paymentIntentId: string }
): Promise<boolean> => {
  const booking = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      tenantId: expected.tenantId,
      stripePaymentIntentId: expected.paymentIntentId,
      paymentStatus: { $in: ['pending', 'processing', 'failed'] },
    },
    {
      $set: {
        paymentStatus: 'succeeded',
        status: 'confirmed',
        paymentMethod: 'card',
      },
    },
    { new: true }
  ).populate(
    'attractionId',
    'title slug images destination meetingPoint duration cancellationPolicy instantConfirmation'
  );
  if (!booking) return false; // another confirm/webhook caller already won

  if (booking.userId) {
    await User.findByIdAndUpdate(booking.userId, { $inc: { totalSpent: booking.total } });
  }

  safeEmitEvent(booking.tenantId, 'payment.succeeded', paymentEventPayload(booking));
  safeEmitEvent(booking.tenantId, 'booking.confirmed', paymentEventPayload(booking));

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attraction = booking.attractionId as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstItem = booking.items[0] as any;
    const guestName = `${booking.guestDetails.firstName} ${booking.guestDetails.lastName}`.trim();
    const totalAdults = booking.items.reduce((s: number, i: { quantities?: { adults?: number } }) => s + (i.quantities?.adults || 0), 0);
    const totalChildren = booking.items.reduce((s: number, i: { quantities?: { children?: number } }) => s + (i.quantities?.children || 0), 0);
    const coords = attraction?.destination?.coordinates;
    const meetingPoint =
      coords && typeof coords.lat === 'number' && typeof coords.lng === 'number'
        ? { lat: coords.lat, lng: coords.lng, label: attraction?.meetingPoint?.address || attraction?.destination?.city || undefined }
        : undefined;
    const hotelPickup = firstItem?.hotelPickup;

    const tenantBrand = await Tenant.findById(booking.tenantId)
      .select('name slug customDomain domainMigrated theme logo contactInfo')
      .lean();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tb = tenantBrand as any;
    const base = env.frontendUrl.split(',')[0].trim().replace(/\/+$/, '');
    const logoUrl = tb?.logo
      ? (/^https?:\/\//i.test(tb.logo) ? tb.logo : `${base}${tb.logo.startsWith('/') ? '' : '/'}${tb.logo}`)
      : undefined;

    const pdfBuffer = await generateTicketPdf({
      reference: booking.reference,
      attractionTitle: attraction?.title || 'Experience',
      optionName: firstItem?.optionName,
      date: firstItem?.date || new Date().toISOString().split('T')[0],
      time: firstItem?.time,
      duration: attraction?.duration,
      guestName,
      guestEmail: booking.guestDetails.email,
      guestPhone: booking.guestDetails.phone,
      guestCountry: booking.guestDetails.country,
      items: booking.items.map((item: { optionName?: string; quantities?: { adults?: number; children?: number; infants?: number } }) => ({
        name: item.optionName || 'Experience',
        adults: item.quantities?.adults || 0,
        children: item.quantities?.children || 0,
        infants: item.quantities?.infants || 0,
      })),
      addons: firstItem?.addons?.length
        ? firstItem.addons.map((a: { name: string; price: number }) => ({ name: a.name, price: a.price }))
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
      // Brand the PDF ticket for the operator (was falling back to "Attractions Network").
      tenantName: tb?.name,
      brandColor: tb?.theme?.primaryColor,
      logoUrl,
    });

    await sendBookingConfirmation(
      booking.guestDetails.email,
      {
        reference: booking.reference,
        attractionTitle: attraction?.title || 'Experience',
        date: firstItem?.date || '',
        time: firstItem?.time,
        guestName,
        total: booking.total,
        currency: booking.currency,
        paymentMethod: 'card',
        guests: totalAdults + totalChildren,
        hotelPickup,
        meetingPoint,
        guestAccessToken: generateBookingAccessToken(String(booking._id), booking.reference),
      },
      pdfBuffer,
      tenantBrand
    );

    const recipients = new Set<string>();
    if (tb?.contactInfo?.email) recipients.add(tb.contactInfo.email);
    recipients.add('info@foxestechnology.com');
    for (const recipient of recipients) {
      try {
        await sendAdminBookingNotification(
          recipient,
          {
            reference: booking.reference,
            tenantName: tb?.name || 'Attractions Network',
            attractionTitle: attraction?.title || 'Experience',
            date: firstItem?.date || '',
            time: firstItem?.time,
            guestName,
            guestEmail: booking.guestDetails.email,
            guestPhone: booking.guestDetails.phone,
            adults: totalAdults,
            children: totalChildren,
            total: booking.total,
            currency: booking.currency,
            paymentMethod: 'card',
            hotelPickup,
            meetingPoint,
          },
          tenantBrand
        );
      } catch (err) {
        console.error(`Operator payment email to ${recipient} failed:`, err);
      }
    }

    safeEmitEvent(booking.tenantId, 'ticket.issued', {
      ...paymentEventPayload(booking),
      attractionTitle: attraction?.title,
    });
  } catch (emailError) {
    console.error('finalizePaidBooking email/PDF failed:', emailError);
  }
  return true;
};

export const confirmPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { bookingId, guestEmail, guestAccessToken } = req.body;

    if (!req.user && !guestEmail) {
      sendError(res, 'Authentication or guest email is required', 401);
      return;
    }

    const booking = await Booking.findById(bookingId).select(
      'paymentStatus stripePaymentIntentId tenantId reference status total currency userId guestDetails.email'
    );
    if (!booking) {
      sendError(res, 'Booking not found', 404);
      return;
    }
    if (
      !canAccessBooking(req, booking.userId, booking.tenantId) &&
      !canGuestAccessBooking(booking, guestEmail, guestAccessToken)
    ) {
      sendError(res, 'Not authorized to confirm payment for this booking', 403);
      return;
    }
    if (booking.paymentStatus === 'succeeded') {
      sendSuccess(res, {
        reference: booking.reference,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.status,
        amount: booking.total,
        currency: booking.currency,
      }, 'Payment already confirmed');
      return;
    }
    if (booking.paymentStatus !== 'processing' && booking.paymentStatus !== 'pending') {
      sendError(res, 'Payment cannot be confirmed', 400);
      return;
    }

    // Never trust the client: a configured tenant gateway must have a Stripe
    // PaymentIntent and Stripe itself must report that intent as succeeded.
    const stripeCfg = await getTenantStripeConfig(booking.tenantId);
    const confirmationPolicy = evaluateStripeConfirmation(
      stripeCfg,
      booking.stripePaymentIntentId,
      env.isProd
    );
    if (!confirmationPolicy.allowed) {
      sendError(res, confirmationPolicy.error, 400);
      return;
    }
    if (!confirmationPolicy.verifyIntent || !booking.stripePaymentIntentId || !stripeCfg?.secretKey) {
      sendError(res, 'A verified Stripe payment session is required', 400);
      return;
    }
    const intent = await retrievePaymentIntent(stripeCfg.secretKey, booking.stripePaymentIntentId);
    if (!intent) {
      sendError(res, 'Stripe payment session could not be verified', 502);
      return;
    }
    const bindingError = paymentBindingError(booking, intent, true);
    if (bindingError) {
      sendError(res, bindingError, 400);
      return;
    }

    const finalized = await finalizePaidBooking(String(booking._id), {
      tenantId: booking.tenantId,
      paymentIntentId: booking.stripePaymentIntentId as string,
    });

    const updated = await Booking.findById(booking._id).select('reference paymentStatus status total currency');
    if (!finalized && updated?.paymentStatus !== 'succeeded') {
      sendError(res, 'Payment could not be atomically finalized', 409);
      return;
    }
    sendSuccess(res, {
      reference: updated?.reference,
      paymentStatus: updated?.paymentStatus,
      bookingStatus: updated?.status,
      amount: updated?.total,
      currency: updated?.currency,
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
  // Inbound Stripe webhook for ONE tenant (URL carries :tenantId). The body arrives
  // raw (express.raw on this path) so the signature can be verified against THAT
  // tenant's own webhook secret. Idempotency via (provider, eventId) so retries
  // never double-confirm. This webhook is the source of truth that a card booking is
  // paid — it (not the client) marks the booking succeeded and sends the emails.
  try {
    const { tenantId } = req.params;
    const stripeCfg = await getTenantStripeConfig(tenantId);
    const signature = (req.headers['stripe-signature'] as string) || '';

    // Webhooks are authoritative in every environment. Never parse an unsigned
    // body as an event; local tests must mock signature construction explicitly.
    if (!stripeCfg?.secretKey || !stripeCfg.webhookSecret) {
      sendError(res, 'Stripe webhook is not configured for this tenant', 503);
      return;
    }
    if (!signature) {
      sendError(res, 'Stripe webhook signature is required', 400);
      return;
    }

    let event;
    try {
      event = constructWebhookEvent(stripeCfg.secretKey, stripeCfg.webhookSecret, req.body, signature);
    } catch {
      sendError(res, 'Invalid webhook signature', 400);
      return;
    }

    const eventId = event?.id;
    const eventType = event?.type;
    if (!eventId) {
      sendError(res, 'Stripe webhook event ID is required', 400);
      return;
    }

    const obj = event.data.object as Stripe.PaymentIntent;
    const intentId = obj?.id;
    if (eventType === 'payment_intent.succeeded') {
      if (!intentId || obj?.status !== 'succeeded') {
        sendError(res, 'Invalid succeeded PaymentIntent payload', 400);
        return;
      }

      // Bind by the stored provider ID and tenant, never by attacker-controlled
      // metadata alone. Metadata, amount, currency, and amount_received must also
      // agree before the compare-and-set transition can run.
      const booking = await Booking.findOne({
        stripePaymentIntentId: intentId,
        tenantId,
      });
      if (!booking) {
        res.json({ received: true, ignored: 'payment intent is not bound to this tenant' });
        return;
      }

      const intentEvidence: PaymentIntentResult = {
        id: intentId,
        clientSecret: '',
        amount: obj.amount,
        amountReceived: obj.amount_received,
        currency: obj.currency || '',
        status: obj.status,
        metadata: obj.metadata || {},
      };
      const bindingError = paymentBindingError(booking, intentEvidence, true);
      if (bindingError) {
        sendError(res, bindingError, 400);
        return;
      }

      const finalized = await finalizePaidBooking(String(booking._id), {
        tenantId: booking.tenantId,
        paymentIntentId: intentId,
      });
      const { duplicate } = await recordInboundEvent('stripe', eventId, { eventType, tenantId });
      res.json({ received: true, duplicate: duplicate || !finalized });
      return;
    } else if (eventType === 'payment_intent.payment_failed') {
      if (!intentId) {
        sendError(res, 'Invalid failed PaymentIntent payload', 400);
        return;
      }
      const booking = await Booking.findOne({ stripePaymentIntentId: intentId, tenantId });
      if (booking) {
        if (
          obj?.metadata?.bookingId !== String(booking._id) ||
          obj?.metadata?.tenantId !== String(booking.tenantId)
        ) {
          sendError(res, 'Stripe PaymentIntent metadata does not match this booking', 400);
          return;
        }
        const failedBooking = await failCardBookingAndReleaseInventory(
          booking._id,
          booking.tenantId,
          intentId
        );
        if (failedBooking) {
          safeEmitEvent(
            failedBooking.tenantId,
            'payment.failed',
            paymentEventPayload(failedBooking)
          );
        }
      }
      const { duplicate } = await recordInboundEvent('stripe', eventId, { eventType, tenantId });
      res.json({ received: true, duplicate });
      return;
    }

    const { duplicate } = await recordInboundEvent('stripe', eventId, { eventType, tenantId });
    res.json({ received: true, duplicate, ignored: eventType });
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

    // Never refund more than was charged (unbounded amount was flagged in the audit).
    if (amount !== undefined && (typeof amount !== 'number' || amount <= 0 || amount > booking.total)) {
      sendError(res, 'Refund amount must be between 0 and the booking total', 400);
      return;
    }
    const refundAmount = amount ? Math.round(amount * 100) : Math.round(booking.total * 100);

    // Refund on the tenant's own Stripe account. Missing credentials must never
    // create a fake provider success or mutate the booking.
    const stripeCfg = await getTenantStripeConfig(booking.tenantId);
    if (!stripeCfg?.secretKey) {
      sendError(res, 'Stripe refunds are not configured for this tenant', 503);
      return;
    }
    const refund = await stripeCreateRefund(
      stripeCfg.secretKey,
      booking.stripePaymentIntentId,
      refundAmount,
      {
        allowPending: true,
        idempotencyKey: `booking:${booking._id}:refund:${refundAmount}`,
      }
    );
    const ledgerStatus = refund.status === 'succeeded'
      ? 'succeeded'
      : refund.status === 'failed'
        ? 'failed'
        : 'pending';
    await Booking.updateOne(
      { _id: booking._id, 'refunds.providerRefundId': { $ne: refund.id } },
      {
        $push: {
          refunds: {
            providerRefundId: refund.id,
            amount: refund.amount / 100,
            status: ledgerStatus,
            createdAt: new Date(),
          },
        },
      }
    );
    await Booking.updateOne(
      { _id: booking._id, 'refunds.providerRefundId': refund.id },
      { $set: { 'refunds.$.status': ledgerStatus, 'refunds.$.amount': refund.amount / 100 } }
    );

    if (refund.status !== 'succeeded') {
      sendSuccess(
        res,
        {
          refundId: refund.id,
          refundStatus: refund.status,
          amount: refund.amount / 100,
          currency: booking.currency,
          paymentStatus: booking.paymentStatus,
          bookingStatus: booking.status,
        },
        'Refund submitted but not completed',
        202
      );
      return;
    }

    const refundedAmount = await retrieveSucceededRefundAmount(
      stripeCfg.secretKey,
      booking.stripePaymentIntentId
    );
    const bookingAmount = Math.round(booking.total * 100);
    const fullRefund = refundedAmount >= bookingAmount;
    const refundedMajor = Math.min(refundedAmount, bookingAmount) / 100;
    const beforeRefundUpdate = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        stripePaymentIntentId: booking.stripePaymentIntentId,
      },
      {
        $max: { refundedAmount: refundedMajor },
        ...(fullRefund ? { $set: { paymentStatus: 'refunded', status: 'refunded' } } : {}),
      },
      { new: false }
    );
    const newlyRefunded = Math.max(
      refundedMajor - (beforeRefundUpdate?.refundedAmount || 0),
      0
    );
    if (booking.userId && newlyRefunded > 0) {
      await User.findByIdAndUpdate(booking.userId, { $inc: { totalSpent: -newlyRefunded } });
    }

    sendSuccess(
      res,
      {
        refundId: refund.id,
        refundStatus: refund.status,
        refundType: fullRefund ? 'full' : 'partial',
        amount: refund.amount / 100,
        refundedAmount: Math.min(refundedAmount, bookingAmount) / 100,
        remainingAmount: Math.max(bookingAmount - refundedAmount, 0) / 100,
        currency: booking.currency,
        paymentStatus: fullRefund ? 'refunded' : booking.paymentStatus,
        bookingStatus: fullRefund ? 'refunded' : booking.status,
      },
      fullRefund ? 'Refund processed successfully' : 'Partial refund processed successfully'
    );
  } catch (error) {
    next(error);
  }
};

const webhookUrlFor = (req: AuthRequest, tenantId: string): string =>
  `${req.protocol}://${req.get('host')}/api/payments/webhook/${tenantId}`;

/**
 * Admin: read a tenant's payment-gateway config. Returns a client-safe summary only —
 * the publishable key (public) plus booleans for whether the secret/webhook are set
 * and a last-4 hint. The secret + webhook signing secret are NEVER returned.
 */
export const getPaymentGateway = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { tenantId } = req.params;
    const cfg = await getTenantStripeConfig(tenantId);
    sendSuccess(res, {
      provider: 'stripe',
      enabled: !!cfg?.enabled,
      publishableKey: cfg?.publishableKey || '',
      hasSecretKey: !!cfg?.secretKey,
      hasWebhookSecret: !!cfg?.webhookSecret,
      secretKeyHint: secretHint(cfg?.secretKey),
      mode: resolveStripeMode(cfg?.publishableKey, cfg?.secretKey),
      webhookUrl: webhookUrlFor(req, tenantId),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: save a tenant's own Stripe keys. Any site admin configures THEIR gateway
 * here — publishable key, secret key, webhook signing secret, and an enable toggle.
 * Secrets are encrypted at rest; a blank secret field means "keep the existing one".
 */
export const updatePaymentGateway = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { tenantId } = req.params;
    const { enabled, publishableKey, secretKey, webhookSecret } = req.body || {};

    // Sanity-check key prefixes so an admin doesn't paste the wrong field.
    if (publishableKey && !/^pk_(test|live)_/.test(publishableKey.trim())) {
      sendError(res, 'Publishable key must start with pk_test_ or pk_live_', 400);
      return;
    }
    if (secretKey && !/^(sk|rk)_(test|live)_/.test(secretKey.trim())) {
      sendError(res, 'Secret key must start with sk_test_ / sk_live_', 400);
      return;
    }
    if (webhookSecret && !/^whsec_/.test(webhookSecret.trim())) {
      sendError(res, 'Webhook signing secret must start with whsec_', 400);
      return;
    }
    const existing = await getTenantStripeConfig(tenantId);
    const effectivePublishableKey =
      publishableKey !== undefined ? String(publishableKey).trim() : existing?.publishableKey;
    const effectiveSecretKey = secretKey ? String(secretKey).trim() : existing?.secretKey;
    const effectiveWebhookSecret = webhookSecret
      ? String(webhookSecret).trim()
      : existing?.webhookSecret;
    const effectiveMode = resolveStripeMode(effectivePublishableKey, effectiveSecretKey);

    if (effectiveMode === 'mixed') {
      sendError(
        res,
        'Stripe key modes must match: use pk_test_ with sk_test_, or pk_live_ with sk_live_',
        400
      );
      return;
    }

    // Don't let a tenant enable the gateway without the keys it needs.
    if (enabled) {
      const willHaveSecret = !!effectiveSecretKey;
      const willHavePublishable = !!effectivePublishableKey;
      const willHaveWebhookSecret = !!effectiveWebhookSecret;
      if (!willHaveSecret || !willHavePublishable || !willHaveWebhookSecret) {
        sendError(
          res,
          'Add the publishable key, secret key, and webhook signing secret before enabling online payments',
          400
        );
        return;
      }
    }

    const summary = await saveTenantStripeConfig(tenantId, {
      enabled,
      publishableKey,
      secretKey,
      webhookSecret,
    });
    const savedCfg = await getTenantStripeConfig(tenantId);
    sendSuccess(
      res,
      {
        provider: 'stripe',
        ...summary,
        secretKeyHint: secretHint(savedCfg?.secretKey),
        mode: resolveStripeMode(savedCfg?.publishableKey, savedCfg?.secretKey),
        webhookUrl: webhookUrlFor(req, tenantId),
      },
      'Payment gateway updated'
    );
  } catch (error) {
    next(error);
  }
};
