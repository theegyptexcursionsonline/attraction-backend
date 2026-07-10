import { Response, NextFunction, Request } from 'express';
import { Booking } from '../models/Booking';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types';
import {
  createPaymentIntent as stripeCreatePaymentIntent,
  retrievePaymentIntentStatus,
  createRefund as stripeCreateRefund,
  constructWebhookEvent,
} from '../services/stripe.service';
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
  bookingEmail?: string,
  suppliedEmail?: unknown
): boolean =>
  typeof suppliedEmail === 'string' &&
  !!bookingEmail &&
  bookingEmail.trim().toLowerCase() === suppliedEmail.trim().toLowerCase();

export const createPaymentIntent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { bookingId, guestEmail } = req.body;

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
      !canGuestAccessBooking(booking.guestDetails?.email, guestEmail)
    ) {
      sendError(res, 'Not authorized to process payment for this booking', 403);
      return;
    }

    if (booking.paymentStatus !== 'pending') {
      sendError(res, 'Payment already processed', 400);
      return;
    }

    // Resolve THIS booking's tenant's own Stripe gateway. Online payment is only
    // available when that site's admin has configured + enabled their keys.
    const stripeCfg = await getTenantStripeConfig(booking.tenantId);
    if (!stripeCfg || !stripeCfg.enabled || !stripeCfg.secretKey) {
      sendError(res, 'Online payment is not enabled for this site', 400);
      return;
    }

    const paymentIntent = await stripeCreatePaymentIntent(
      stripeCfg.secretKey,
      Math.round(booking.total * 100),
      booking.currency.toLowerCase(),
      {
        bookingId: booking._id.toString(),
        bookingReference: booking.reference,
        tenantId: String(booking.tenantId),
      }
    );

    // Update booking with payment intent ID
    booking.stripePaymentIntentId = paymentIntent.id;
    booking.paymentStatus = 'processing';
    await booking.save();

    sendSuccess(res, {
      clientSecret: paymentIntent.clientSecret,
      paymentIntentId: paymentIntent.id,
      publishableKey: stripeCfg.publishableKey, // the checkout inits Stripe.js with this
      amount: booking.total,
      currency: booking.currency,
    });
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
const finalizePaidBooking = async (bookingId: string): Promise<boolean> => {
  const booking = await Booking.findById(bookingId).populate(
    'attractionId',
    'title slug images destination meetingPoint duration cancellationPolicy instantConfirmation'
  );
  if (!booking) return false;
  if (booking.paymentStatus === 'succeeded') return false; // already finalized — idempotent

  booking.paymentStatus = 'succeeded';
  booking.status = 'confirmed';
  booking.paymentMethod = 'card';
  await booking.save();

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
    const { bookingId, guestEmail } = req.body;

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
      !canGuestAccessBooking(booking.guestDetails?.email, guestEmail)
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
    if (confirmationPolicy.verifyIntent && booking.stripePaymentIntentId && stripeCfg?.secretKey) {
      const status = await retrievePaymentIntentStatus(stripeCfg.secretKey, booking.stripePaymentIntentId);
      if (status !== 'succeeded') {
        sendError(res, 'Payment has not completed yet', 400);
        return;
      }
    }

    await finalizePaidBooking(String(booking._id));

    const updated = await Booking.findById(booking._id).select('reference paymentStatus status total currency');
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let event: any;
    if (stripeCfg?.secretKey && stripeCfg?.webhookSecret) {
      // Verified path (production): reject anything not signed by the tenant's secret.
      try {
        event = constructWebhookEvent(stripeCfg.secretKey, stripeCfg.webhookSecret, req.body, signature);
      } catch {
        sendError(res, 'Invalid webhook signature', 400);
        return;
      }
    } else {
      // No gateway configured for this tenant — nothing to verify against. Parse the
      // raw body (dev/mock only); never authoritative in production.
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
    }

    const eventId = event?.id;
    const eventType = event?.type;
    if (!eventId) {
      res.json({ received: true, ignored: 'missing event id' });
      return;
    }

    const { duplicate } = await recordInboundEvent('stripe', eventId, { eventType, tenantId });
    if (duplicate) {
      res.json({ received: true, duplicate: true });
      return;
    }

    const obj = event?.data?.object;
    const intentId = obj?.id;
    const bookingId = obj?.metadata?.bookingId;
    const findBooking = async () =>
      bookingId
        ? Booking.findById(bookingId)
        : intentId
          ? Booking.findOne({ stripePaymentIntentId: intentId })
          : null;

    if (eventType === 'payment_intent.succeeded' || eventType === 'checkout.session.completed') {
      const booking = await findBooking();
      // Defense in depth: the booking must belong to the tenant this webhook is for.
      if (booking && String(booking.tenantId) === String(tenantId)) {
        await finalizePaidBooking(String(booking._id));
      }
    } else if (eventType === 'payment_intent.payment_failed') {
      const booking = await findBooking();
      if (booking && String(booking.tenantId) === String(tenantId) && booking.paymentStatus !== 'succeeded') {
        booking.paymentStatus = 'failed';
        await booking.save();
        safeEmitEvent(booking.tenantId, 'payment.failed', paymentEventPayload(booking));
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

    // Never refund more than was charged (unbounded amount was flagged in the audit).
    if (amount !== undefined && (typeof amount !== 'number' || amount <= 0 || amount > booking.total)) {
      sendError(res, 'Refund amount must be between 0 and the booking total', 400);
      return;
    }
    const refundAmount = amount ? Math.round(amount * 100) : Math.round(booking.total * 100);

    // Refund on the tenant's own Stripe account.
    const stripeCfg = await getTenantStripeConfig(booking.tenantId);
    await stripeCreateRefund(stripeCfg?.secretKey, booking.stripePaymentIntentId, refundAmount);

    booking.paymentStatus = 'refunded';
    booking.status = 'refunded';
    await booking.save();

    sendSuccess(res, booking, 'Refund processed successfully');
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
      if (!willHaveSecret || !willHavePublishable) {
        sendError(res, 'Add both the publishable and secret keys before enabling online payments', 400);
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
