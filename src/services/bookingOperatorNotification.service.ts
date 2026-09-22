import crypto from 'crypto';
import { ClientSession, Types } from 'mongoose';
import { Booking } from '../models/Booking';
import { Tenant } from '../models/Tenant';
import { BookingOperatorNotification } from '../models/BookingOperatorNotification';
import { sendOperatorBookingStatusEmail } from './email.service';
import { bookingNotificationEmail, notificationCopyEmails } from '../utils/notificationRecipients';

const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

export const ensureBookingOperatorNotificationIndexes = async (): Promise<void> => {
  await BookingOperatorNotification.createIndexes();
};

/** Transactional intent only: no provider call, customer token or recipient snapshot. */
export const enqueueBookingOperatorNotification = async (
  booking: {
    _id: unknown; tenantId: unknown; reference: string; currency: string;
    guestDetails: { firstName?: string; lastName?: string; email?: string }; total: number;
  },
  event: { kind: 'cancelled' | 'refunded'; refundAmount?: number; fullRefund?: boolean; eventKey: string },
  session?: ClientSession
): Promise<void> => {
  if (!event.eventKey || event.eventKey.length > 200 || !['cancelled', 'refunded'].includes(event.kind)) {
    throw new Error('INVALID_OPERATOR_NOTIFICATION_EVENT');
  }
  if (event.refundAmount !== undefined && (!Number.isFinite(event.refundAmount) || event.refundAmount < 0)) {
    throw new Error('INVALID_OPERATOR_NOTIFICATION_REFUND');
  }
  const tenantId = new Types.ObjectId(String(booking.tenantId));
  const bookingId = new Types.ObjectId(String(booking._id));
  const id = crypto.createHash('sha256')
    .update(JSON.stringify([String(tenantId), String(bookingId), event.kind, event.eventKey])).digest('hex');
  try {
    await BookingOperatorNotification.updateOne({ _id: id }, { $setOnInsert: {
      bookingId, tenantId, kind: event.kind, refundAmount: event.refundAmount,
      fullRefund: event.fullRefund, status: 'pending', attempts: 0, nextAttemptAt: new Date(),
    } }, { upsert: true, runValidators: true, ...(session ? { session } : {}) });
  } catch (error) {
    // A transaction that hits a duplicate-key conflict must abort/retry as a whole.
    // Outside a transaction, another enqueue already persisted this exact intent.
    if (!session && (error as { code?: number }).code === 11000) return;
    throw error;
  }
};

/**
 * Provider acceptance is not inbox delivery. Expired/ambiguous in-flight attempts
 * require reconciliation, never automatic resend (Mailgun has no idempotency key).
 */
export const processBookingOperatorNotifications = async (limit = 20): Promise<{
  sent: number; retried: number; manualReview: number;
}> => {
  const summary = { sent: 0, retried: 0, manualReview: 0 };
  const batchSize = Number.isFinite(limit) ? Math.max(0, Math.min(100, Math.floor(limit))) : 20;
  for (let index = 0; index < batchSize; index += 1) {
    const now = new Date();
    // Quarantine is bounded by the same batch budget and fenced against completion.
    const expired = await BookingOperatorNotification.findOneAndUpdate({
      status: 'processing', leaseUntil: { $lte: now },
    }, {
      $set: { status: 'manual_review', lastError: 'DELIVERY_UNCERTAIN_LEASE_EXPIRED' },
      $unset: { leaseToken: 1, leaseUntil: 1 },
    }, { sort: { leaseUntil: 1 }, new: true });
    if (expired) { summary.manualReview += 1; continue; }
    const leaseToken = crypto.randomUUID();
    const event = await BookingOperatorNotification.findOneAndUpdate({
      status: { $in: ['pending', 'retry'] }, nextAttemptAt: { $lte: now },
    }, {
      $set: { status: 'processing', leaseToken, leaseUntil: new Date(now.getTime() + LEASE_MS) },
      $inc: { attempts: 1 },
    }, { sort: { nextAttemptAt: 1, _id: 1 }, new: true });
    if (!event) break;
    const fence = { _id: event._id, status: 'processing', leaseToken };
    let status: 'sent' | 'retry' | 'manual_review' = 'manual_review';
    let lastError = 'DELIVERY_UNCERTAIN';
    let providerStarted = false;
    try {
      const [booking, tenant] = await Promise.all([
        Booking.findOne({ _id: event.bookingId, tenantId: event.tenantId })
          .select('reference currency guestDetails.firstName guestDetails.lastName').lean(),
        Tenant.findById(event.tenantId)
          .select('name slug customDomain domainMigrated contactInfo theme logo defaultLanguage defaultCurrency timezone notificationSettings').lean(),
      ]);
      if (!booking || !tenant) {
        lastError = 'NOTIFICATION_SCOPE_MISSING';
      } else {
        const recipient = bookingNotificationEmail(tenant);
        if (!recipient) {
          lastError = 'OPERATOR_RECIPIENT_MISSING';
        } else {
          // Validate the primary and copies before any external effect.
          notificationCopyEmails([recipient]);
          notificationCopyEmails(tenant.notificationSettings?.bookingCcEmails, recipient);
          const renewed = await BookingOperatorNotification.updateOne({ ...fence, leaseUntil: { $gt: new Date() } }, {
            $set: { leaseUntil: new Date(Date.now() + LEASE_MS) },
          });
          if (!renewed.modifiedCount) continue;
          providerStarted = true;
          const result = await sendOperatorBookingStatusEmail({
            reference: booking.reference,
            guestName: `${booking.guestDetails.firstName || ''} ${booking.guestDetails.lastName || ''}`.trim(),
            kind: event.kind, refundAmount: event.refundAmount,
            currency: booking.currency, fullRefund: event.fullRefund,
          }, tenant);
          status = result.status === 'sent' ? 'sent' : 'manual_review';
          lastError = result.status === 'sent' ? '' : `DELIVERY_SKIPPED_${result.reason.toUpperCase()}`;
        }
      }
    } catch (error) {
      const providerStatus = Number((error as { status?: unknown })?.status);
      // Rate limiting explicitly rejects the request before acceptance. Network
      // failures and gateway 5xx/408 responses can hide an accepted message.
      if (providerStarted && providerStatus === 429) {
        status = event.attempts < MAX_ATTEMPTS ? 'retry' : 'manual_review';
        lastError = `PROVIDER_REJECTED_${providerStatus}`;
      } else if (providerStarted && Number.isInteger(providerStatus) && providerStatus >= 400 && providerStatus < 500 && providerStatus !== 408) {
        lastError = `PROVIDER_REJECTED_${providerStatus}`;
      } else {
        lastError = providerStarted ? 'DELIVERY_UNCERTAIN' : 'NOTIFICATION_PREPARATION_FAILED';
      }
    }
    const updated = await BookingOperatorNotification.updateOne(fence, {
      $set: {
        status, lastError,
        ...(status === 'sent' ? { sentAt: new Date() } : {}),
        ...(status === 'retry' ? { nextAttemptAt: new Date(Date.now() + Math.min(60 * 60_000, 30_000 * 2 ** (event.attempts - 1))) } : {}),
      },
      $unset: { leaseToken: 1, leaseUntil: 1 },
    });
    if (updated.modifiedCount) {
      if (status === 'sent') summary.sent += 1;
      else if (status === 'retry') summary.retried += 1;
      else summary.manualReview += 1;
    }
  }
  return summary;
};
