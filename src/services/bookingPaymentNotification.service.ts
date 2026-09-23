import crypto from 'crypto';
import { ClientSession, Types } from 'mongoose';
import { Booking } from '../models/Booking';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { BookingPaymentNotification, BookingPaymentNotificationKind } from '../models/BookingPaymentNotification';
import { EmailReceipt, ensureEmailReceiptIndexes } from '../models/EmailReceipt';
import { IBooking } from '../types';
import { paymentFollowupEnabledFor } from '../utils/bookingPaymentFollowupPolicy';
import { bookingNotificationEmail, notificationCopyEmails } from '../utils/notificationRecipients';
import { generateBookingAccessToken } from '../utils/bookingAccess';
import { runBookingTransaction } from './bookingInventory.service';
import { standaloneBookingClause } from './bookingRecordScope.service';
import { getTenantStripeConfig, stripeCredentialMode } from './tenantPayment.service';
import { retrievePaymentIntent } from './stripe.service';
import { recipientFingerprint } from './email.service';
import { sendBookingPaymentNotice } from './bookingPaymentEmail.service';

const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const EXPIRY_NOTICE_MAX_AGE_MS = 6 * 60 * 60_000;
type PaymentBooking = IBooking & { createdAt: Date; paymentFailureReason?: string; inventoryReleasedAt?: Date };
class NoticeDecision extends Error {
  constructor(readonly outcome: 'suppressed' | 'retry' | 'manual_review', code: string) { super(code); }
}

export const ensureBookingPaymentNotificationIndexes = async (): Promise<void> => {
  await BookingPaymentNotification.createIndexes();
  await ensureEmailReceiptIndexes();
};

/** Called only by new lifecycle transitions; never scans historical bookings. */
export const enqueueBookingPaymentNotifications = async (
  booking: { _id: unknown; tenantId: unknown; createdAt: unknown },
  event: { kind: BookingPaymentNotificationKind }, session?: ClientSession
): Promise<void> => {
  if (!['payment_failed', 'checkout_expired'].includes(event.kind)) throw new Error('INVALID_PAYMENT_NOTIFICATION_KIND');
  if (!paymentFollowupEnabledFor(booking.createdAt)) return;
  const tenantId = new Types.ObjectId(String(booking.tenantId));
  const bookingId = new Types.ObjectId(String(booking._id));
  const write = async (transaction?: ClientSession) => {
    for (const audience of ['customer', 'operator'] as const) {
      const id = crypto.createHash('sha256').update(JSON.stringify(['booking_payment', String(tenantId), String(bookingId), event.kind, audience])).digest('hex');
      await BookingPaymentNotification.updateOne({ _id: id }, { $setOnInsert: {
        tenantId, bookingId, kind: event.kind, audience, status: 'pending', attempts: 0,
        nextAttemptAt: new Date(Date.now() + (event.kind === 'payment_failed' ? 5 * 60_000 : 0)),
      } }, { upsert: true, runValidators: true, ...(transaction ? { session: transaction } : {}) });
    }
    return true;
  };
  if (session) await write(session); else await runBookingTransaction(write);
};

function assertEligible(booking: PaymentBooking, kind: BookingPaymentNotificationKind): void {
  if (!paymentFollowupEnabledFor(booking.createdAt)) throw new NoticeDecision('suppressed', 'FOLLOWUP_DISABLED');
  if (booking.paymentMethod !== 'card' || booking.paymentStatus !== 'failed') throw new NoticeDecision('suppressed', 'BOOKING_STATE_CHANGED');
  if (kind === 'payment_failed') {
    const created = new Date(booking.createdAt).getTime();
    if (booking.status !== 'pending' || booking.paymentFailureReason !== 'payment_failed' || booking.inventoryReleasedAt ||
      !Number.isFinite(created) || created + 30 * 60_000 <= Date.now() || booking.cancellationRequestedAt) {
      throw new NoticeDecision('suppressed', 'BOOKING_STATE_CHANGED');
    }
  } else {
    if (booking.status !== 'cancelled' || booking.paymentFailureReason !== 'expired' || !booking.inventoryReleasedAt) {
      throw new NoticeDecision('suppressed', 'BOOKING_STATE_CHANGED');
    }
    const failedAt = new Date(booking.paymentFailureAt || '').getTime();
    if (!Number.isFinite(failedAt) || failedAt > Date.now()) {
      throw new NoticeDecision('manual_review', 'PAYMENT_FAILURE_TIME_INVALID');
    }
    if (Date.now() - failedAt >= EXPIRY_NOTICE_MAX_AGE_MS) {
      throw new NoticeDecision('suppressed', 'CHECKOUT_NOTICE_TOO_OLD');
    }
  }
}

async function verifyProvider(booking: PaymentBooking, kind: BookingPaymentNotificationKind): Promise<void> {
  if (!booking.stripePaymentIntentId) {
    if (kind === 'payment_failed' || booking.stripePaymentSessionClaimedAt) {
      throw new NoticeDecision('manual_review', 'PAYMENT_CONTEXT_MISSING');
    }
    return;
  }
  const config = await getTenantStripeConfig(booking.tenantId);
  if (!config?.enabled || !config.secretKey || !config.verifiedAccountId || !config.verifiedCredentialFingerprint) {
    throw new NoticeDecision('manual_review', 'PAYMENT_CONTEXT_MISSING');
  }
  const mode = stripeCredentialMode(config);
  if (!['test', 'live'].includes(mode) || (booking.stripePaymentBinding &&
    (booking.stripePaymentBinding.accountId !== config.verifiedAccountId || booking.stripePaymentBinding.mode !== mode))) {
    throw new NoticeDecision('manual_review', 'PAYMENT_CONTEXT_MISMATCH');
  }
  const intent = await retrievePaymentIntent(config.secretKey, booking.stripePaymentIntentId);
  if (!intent) throw new NoticeDecision('retry', 'PAYMENT_STATUS_UNAVAILABLE');
  if (intent.id !== booking.stripePaymentIntentId || intent.metadata.bookingId !== String(booking._id) ||
    intent.metadata.tenantId !== String(booking.tenantId) || intent.amount !== Math.round(booking.total * 100) ||
    intent.currency.toLowerCase() !== booking.currency.toLowerCase() || intent.livemode !== (mode === 'live')) {
    throw new NoticeDecision('manual_review', 'PAYMENT_CONTEXT_MISMATCH');
  }
  if (intent.amountReceived > 0 || ['succeeded', 'processing', 'requires_capture', 'requires_action', 'requires_confirmation'].includes(intent.status)) {
    throw new NoticeDecision('suppressed', 'PAYMENT_IN_PROGRESS_OR_PAID');
  }
  if (intent.status !== (kind === 'payment_failed' ? 'requires_payment_method' : 'canceled')) {
    throw new NoticeDecision('manual_review', 'PAYMENT_STATUS_INCOMPATIBLE');
  }
}

/** Read-only Stripe verification; provider writes here are email delivery only. */
export const processBookingPaymentNotifications = async (limit = 20): Promise<{
  sent: number; retried: number; manualReview: number; suppressed: number;
}> => {
  const summary = { sent: 0, retried: 0, manualReview: 0, suppressed: 0 };
  // A disabled/future activation epoch is a reversible pause. Do not claim,
  // quarantine or consume durable rows while the release switch is off.
  if (!paymentFollowupEnabledFor(new Date())) return summary;
  const batch = Number.isFinite(limit) ? Math.max(0, Math.min(100, Math.floor(limit))) : 20;
  for (let index = 0; index < batch; index++) {
    const expired = await BookingPaymentNotification.findOneAndUpdate({ status: 'processing', leaseUntil: { $lte: new Date() } }, {
      $set: { status: 'manual_review', lastError: 'DELIVERY_UNCERTAIN_LEASE_EXPIRED' }, $unset: { leaseToken: 1, leaseUntil: 1 },
    }, { sort: { leaseUntil: 1 }, new: true });
    if (expired) { summary.manualReview++; continue; }
    const leaseToken = crypto.randomUUID();
    const event = await BookingPaymentNotification.findOneAndUpdate({ status: { $in: ['pending', 'retry'] }, nextAttemptAt: { $lte: new Date() } }, {
      $set: { status: 'processing', leaseToken, leaseUntil: new Date(Date.now() + LEASE_MS) }, $inc: { attempts: 1 },
    }, { sort: { nextAttemptAt: 1, _id: 1 }, new: true });
    if (!event) break;
    const fence = { _id: event._id, tenantId: event.tenantId, status: 'processing', leaseToken };
    let status: 'sent' | 'retry' | 'manual_review' | 'suppressed' = 'manual_review';
    let lastError = 'NOTIFICATION_PREPARATION_FAILED';
    let providerStarted = false;
    let providerAccepted = false;
    let receiptId: unknown;
    try {
      const [booking, tenant] = await Promise.all([
        Booking.findOne({ _id: event.bookingId, tenantId: event.tenantId, ...standaloneBookingClause }).lean<PaymentBooking>(),
        Tenant.findById(event.tenantId).select('name slug customDomain domainMigrated theme logo contactInfo defaultLanguage defaultCurrency timezone notificationSettings flatUrls').lean(),
      ]);
      if (!booking || !tenant) throw new NoticeDecision('manual_review', 'NOTIFICATION_SCOPE_MISSING');
      assertEligible(booking, event.kind);
      try { await verifyProvider(booking, event.kind); }
      catch (error) {
        if (error instanceof NoticeDecision) throw error;
        // Reads have no external side effect: an unavailable config/provider may
        // recover safely. Never substitute an assumed unpaid state.
        throw new NoticeDecision('retry', 'PAYMENT_STATUS_UNAVAILABLE');
      }
      const recipient = event.audience === 'customer' ? booking.guestDetails.email : bookingNotificationEmail(tenant);
      if (!recipient) throw new NoticeDecision('manual_review', event.audience === 'customer' ? 'CUSTOMER_RECIPIENT_MISSING' : 'OPERATOR_RECIPIENT_MISSING');
      notificationCopyEmails([recipient]);
      if (event.audience === 'operator') notificationCopyEmails(tenant.notificationSettings?.bookingCcEmails, recipient);
      const attraction = await Attraction.findOne({ _id: booking.attractionId, tenantIds: event.tenantId, status: 'active' }).select('title slug pathSlug').lean();
      // Re-read after provider lookup. A successful retry/expiry must suppress a stale notice.
      const latest = await Booking.findOne({ _id: event.bookingId, tenantId: event.tenantId, ...standaloneBookingClause }).lean<PaymentBooking>();
      if (!latest) throw new NoticeDecision('manual_review', 'NOTIFICATION_SCOPE_MISSING');
      assertEligible(latest, event.kind);
      if (latest.stripePaymentIntentId !== booking.stripePaymentIntentId || latest.total !== booking.total || latest.currency !== booking.currency ||
        JSON.stringify(latest.stripePaymentBinding) !== JSON.stringify(booking.stripePaymentBinding)) throw new NoticeDecision('retry', 'PAYMENT_CONTEXT_CHANGED');
      const renewed = await BookingPaymentNotification.updateOne({ ...fence, leaseUntil: { $gt: new Date() } }, { $set: { leaseUntil: new Date(Date.now() + LEASE_MS) } });
      if (!renewed.modifiedCount) throw new NoticeDecision('manual_review', 'DELIVERY_NOT_STARTED');
      if (event.audience === 'customer' && event.kind === 'payment_failed') {
        // Same unique identity as the old webhook sender: rolling versions cannot
        // both send. Unknown legacy claims are never reclaimed or blindly retried.
        await ensureEmailReceiptIndexes();
        const identity = { tenantId: event.tenantId, dedupeKey: `booking.payment_failed:${booking.reference}` };
        try {
          receiptId = (await EmailReceipt.create({ ...identity, eventType: 'booking.payment_failed', recipientHash: recipientFingerprint(recipient), status: 'claimed', attempts: 1 }))._id;
        } catch (error) {
          if ((error as { code?: number }).code !== 11000) throw error;
          const receipt = await EmailReceipt.findOne(identity).lean();
          throw new NoticeDecision(receipt?.status === 'sent' ? 'suppressed' : 'manual_review', receipt?.status === 'sent' ? 'LEGACY_NOTICE_ALREADY_SENT' : 'LEGACY_DELIVERY_UNCERTAIN');
        }
      }
      // Receipt acquisition may wait on its unique index; fence again before mail.
      const sendLeaseUntil = Date.now() + LEASE_MS;
      const sendLease = await BookingPaymentNotification.updateOne({ ...fence, leaseUntil: { $gt: new Date() } }, { $set: { leaseUntil: new Date(sendLeaseUntil) } });
      if (!sendLease.modifiedCount) throw new NoticeDecision('manual_review', 'DELIVERY_NOT_STARTED');
      const finalBooking = await Booking.findOne({ _id: event.bookingId, tenantId: event.tenantId, ...standaloneBookingClause }).lean<PaymentBooking>();
      if (!finalBooking) throw new NoticeDecision('manual_review', 'NOTIFICATION_SCOPE_MISSING');
      assertEligible(finalBooking, event.kind);
      if (finalBooking.stripePaymentIntentId !== booking.stripePaymentIntentId || finalBooking.total !== booking.total ||
        finalBooking.currency !== booking.currency || finalBooking.guestDetails.email !== booking.guestDetails.email ||
        JSON.stringify(finalBooking.stripePaymentBinding) !== JSON.stringify(booking.stripePaymentBinding)) {
        throw new NoticeDecision('retry', 'PAYMENT_CONTEXT_CHANGED');
      }
      const slug = tenant.flatUrls ? attraction?.pathSlug || attraction?.slug : attraction?.slug;
      const tourPath = slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? `${tenant.flatUrls ? '/' : '/attractions/'}${slug}` : '/';
      if (Date.now() >= sendLeaseUntil) throw new NoticeDecision('manual_review', 'DELIVERY_UNCERTAIN_LEASE_EXPIRED');
      providerStarted = true;
      const result = await sendBookingPaymentNotice({
        kind: event.kind, audience: event.audience, reference: booking.reference,
        guestName: `${booking.guestDetails.firstName || ''} ${booking.guestDetails.lastName || ''}`.trim(),
        guestEmail: booking.guestDetails.email, total: booking.total, currency: booking.currency,
        experience: attraction?.title, departure: booking.items?.map(item => [item.date, item.time].filter(Boolean).join(' ')).join('; '), tourPath,
        ...(event.audience === 'customer' && event.kind === 'payment_failed'
          ? { guestAccessToken: generateBookingAccessToken(String(booking._id), booking.reference) } : {}),
      }, tenant);
      providerAccepted = result.status === 'sent';
      status = providerAccepted ? 'sent' : 'manual_review';
      lastError = result.status === 'sent' ? '' : `DELIVERY_SKIPPED_${result.reason.toUpperCase()}`;
      if (receiptId) await EmailReceipt.updateOne({ _id: receiptId, status: 'claimed' }, { $set: result.status === 'sent'
        ? { status: 'sent', sentAt: new Date() } : { status: 'skipped', lastError: result.reason } });
    } catch (error) {
      if (error instanceof NoticeDecision) { status = error.outcome; lastError = error.message; }
      else if (providerStarted) {
        const code = Number((error as { status?: unknown }).status);
        if (!providerAccepted && code === 429) {
          // Explicit non-acceptance permits deleting only our owned legacy claim.
          try {
            if (receiptId) await EmailReceipt.deleteOne({ _id: receiptId, status: 'claimed' });
            status = 'retry'; lastError = 'PROVIDER_REJECTED_429';
          } catch { status = 'manual_review'; lastError = 'LEGACY_DELIVERY_UNCERTAIN'; }
        } else {
          status = 'manual_review';
          lastError = providerAccepted ? 'DELIVERY_UNCERTAIN_COMPLETION'
            : Number.isInteger(code) && code >= 400 && code < 500 && code !== 408 ? `PROVIDER_REJECTED_${code}` : 'DELIVERY_UNCERTAIN';
        }
      } else { status = 'manual_review'; lastError = 'NOTIFICATION_PREPARATION_FAILED'; }
    }
    // A post-claim state check may stop us before mail. Such an owned receipt
    // has known non-delivery; do not leave it looking like an ambiguous send.
    if (receiptId && !providerStarted) {
      try {
        if (status === 'retry') await EmailReceipt.deleteOne({ _id: receiptId, status: 'claimed' });
        else await EmailReceipt.updateOne({ _id: receiptId, status: 'claimed' }, { $set: { status: 'skipped', lastError } });
      } catch { status = 'manual_review'; lastError = 'LEGACY_DELIVERY_UNCERTAIN'; }
    }
    if (status === 'retry' && event.attempts >= MAX_ATTEMPTS) status = 'manual_review';
    const updated = await BookingPaymentNotification.updateOne(fence, { $set: {
      status, lastError, ...(status === 'sent' ? { sentAt: new Date() } : {}),
      ...(status === 'retry' ? { nextAttemptAt: new Date(Date.now() + Math.min(60 * 60_000, 30_000 * 2 ** (event.attempts - 1))) } : {}),
    }, $unset: { leaseToken: 1, leaseUntil: 1 } });
    if (updated.modifiedCount) {
      if (status === 'sent') summary.sent++; else if (status === 'retry') summary.retried++;
      else if (status === 'suppressed') summary.suppressed++; else summary.manualReview++;
    }
  }
  return summary;
};
