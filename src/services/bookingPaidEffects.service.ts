import crypto from 'crypto';
import { env } from '../config/env';
import { Booking } from '../models/Booking';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { BookingPaidEffectV1 } from '../models/BookingPaidEffectV1';
import { runBookingTransaction, sessionOption } from './bookingInventory.service';
import { standaloneBookingClause } from './bookingRecordScope.service';
import { enqueueWebhookEvent } from './webhook.service';
import { preparePaidBookingNotice } from './bookingPaidNotice.service';
import { IBooking, ITenant } from '../types';
import { bookingNotificationEmail, notificationCopyEmails } from '../utils/notificationRecipients';

const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const payload = (booking: IBooking): Record<string, unknown> => ({
  bookingId: String(booking._id), reference: booking.reference, tenantId: String(booking.tenantId),
  attractionId: String(booking.attractionId), status: booking.status, paymentStatus: booking.paymentStatus,
  total: booking.total, currency: booking.currency,
});

// Pin destinations without copying addresses into queue records. A later site or
// guest edit must not redirect an already-authorized confirmation or its CC list.
const recipientFingerprint = (booking: IBooking, tenant: Pick<ITenant, 'contactInfo' | 'notificationSettings'> | null,
  audience: 'customer' | 'operator'): string | undefined => {
  try {
    const primary = audience === 'customer' ? booking.guestDetails.email : bookingNotificationEmail(tenant);
    if (!primary) return undefined;
    const [normalized] = notificationCopyEmails([primary]);
    const copies = audience === 'operator' ? notificationCopyEmails(tenant?.notificationSettings?.bookingCcEmails, primary).sort() : [];
    return crypto.createHash('sha256').update(JSON.stringify([normalized, copies])).digest('hex');
  } catch { return undefined; }
};

export const ensureBookingPaidEffectIndexes = async (): Promise<void> => {
  await BookingPaidEffectV1.createIndexes();
};

/** A verified provider result changes the booking, accounting and downstream intents
 * together. A failed commit is safe to retry; an already-paid legacy booking creates
 * no work. Provider calls are deliberately absent from this transaction.
 */
export const finalizePaidBooking = async (
  bookingId: string, expected: { tenantId: unknown; paymentIntentId: string }
): Promise<boolean> => runBookingTransaction(async session => {
  const booking = await Booking.findOneAndUpdate({
    _id: bookingId, ...standaloneBookingClause, tenantId: expected.tenantId,
    stripePaymentIntentId: expected.paymentIntentId, paymentMethod: 'card', status: 'pending',
    inventoryReleasedAt: { $exists: false }, paymentStatus: { $in: ['pending', 'processing', 'failed'] },
  }, { $set: { paymentStatus: 'succeeded', status: 'confirmed', paymentMethod: 'card' } },
  { new: true, ...sessionOption(session) });
  if (!booking) return false;
  if (booking.userId) {
    // Users are global identities, without tenantId. Credit only the authenticated
    // user already bound to this tenant-scoped booking, never callback input.
    await User.findByIdAndUpdate(booking.userId, { $inc: { totalSpent: booking.total } }, sessionOption(session));
  }
  const tenant = await Tenant.findById(booking.tenantId, null, sessionOption(session))
    .select('contactInfo notificationSettings').lean();
  const attraction = await Attraction.findOne({ _id: booking.attractionId, tenantIds: booking.tenantId },
    'title duration cancellationPolicy instantConfirmation meetingPoint.address destination.city destination.coordinates', sessionOption(session)).lean();
  const presentation = attraction ? { title: attraction.title, duration: attraction.duration,
    cancellationPolicy: attraction.cancellationPolicy, instantConfirmation: attraction.instantConfirmation,
    meetingPoint: { address: attraction.meetingPoint?.address },
    destination: { city: attraction.destination?.city, coordinates: attraction.destination?.coordinates },
  } : undefined;
  for (const audience of ['customer', 'operator'] as const) {
    const recipient = recipientFingerprint(booking, tenant, audience);
    const id = crypto.createHash('sha256').update(JSON.stringify(['paid-v1', String(booking.tenantId), bookingId, audience])).digest('hex');
    await BookingPaidEffectV1.updateOne({ _id: id }, { $setOnInsert: {
      bookingId: booking._id, tenantId: booking.tenantId, audience, kind: 'paid_confirmation',
      paymentIntentId: expected.paymentIntentId, total: booking.total, currency: booking.currency,
      recipientFingerprint: recipient, attractionPresentation: presentation,
      status: recipient && presentation ? 'pending' : 'manual_review',
      ...(!recipient ? { lastError: 'NOTIFICATION_RECIPIENT_UNAVAILABLE' } : !presentation ? { lastError: 'NOTIFICATION_SCOPE_MISSING' } : {}),
      attempts: 0, nextAttemptAt: new Date(),
    } }, { upsert: true, runValidators: true, ...sessionOption(session) });
  }
  await enqueueWebhookEvent(booking.tenantId, 'payment.succeeded', payload(booking), session, `paid:${bookingId}`);
  await enqueueWebhookEvent(booking.tenantId, 'booking.confirmed', payload(booking), session, `paid:${bookingId}`);
  return true;
});

/** Mail has no provider idempotency guarantee. After a recorded attempt, a crash or
 * ambiguous provider response is reviewed by a human, not retried. Preparation and
 * explicitly rejected 429s are safe to retry. Customer/operator delivery is isolated.
 */
export const processBookingPaidEffects = async (limit = 20): Promise<{
  sent: number; retried: number; manualReview: number;
}> => {
  const summary = { sent: 0, retried: 0, manualReview: 0 };
  if (!env.bookingPaidEffectsDeliveryEnabled) return summary;
  const batch = Number.isFinite(limit) ? Math.max(0, Math.min(100, Math.floor(limit))) : 20;
  for (let index = 0; index < batch; index++) {
    const expired = await BookingPaidEffectV1.findOneAndUpdate({ status: 'processing', leaseUntil: { $lte: new Date() } }, [
      { $set: {
        status: { $cond: [{ $or: [{ $ne: [{ $ifNull: ['$providerAttemptedAt', null] }, null] }, { $gte: ['$attempts', MAX_ATTEMPTS] }] }, 'manual_review', 'retry'] },
        lastError: { $cond: [{ $ne: [{ $ifNull: ['$providerAttemptedAt', null] }, null] }, 'DELIVERY_UNCERTAIN_LEASE_EXPIRED', 'NOTIFICATION_PREPARATION_FAILED'] },
        nextAttemptAt: new Date(),
      } }, { $unset: ['leaseToken', 'leaseUntil'] },
    ], { sort: { leaseUntil: 1 }, new: true });
    if (expired) {
      if (expired.status === 'manual_review') summary.manualReview++; else summary.retried++;
      continue;
    }
    const token = crypto.randomUUID();
    const event = await BookingPaidEffectV1.findOneAndUpdate({
      status: { $in: ['pending', 'retry'] }, nextAttemptAt: { $lte: new Date() }, providerAttemptedAt: { $exists: false },
    }, { $set: { status: 'processing', leaseToken: token, leaseUntil: new Date(Date.now() + LEASE_MS) }, $inc: { attempts: 1 } },
    { sort: { nextAttemptAt: 1, _id: 1 }, new: true });
    if (!event) break;
    const fence = { _id: event._id, tenantId: event.tenantId, status: 'processing', leaseToken: token };
    let status: 'sent' | 'retry' | 'manual_review' = 'manual_review';
    let reason = 'NOTIFICATION_SCOPE_MISSING';
    let providerStarted = false;
    try {
      const booking = await Booking.findOne({ _id: event.bookingId, tenantId: event.tenantId, ...standaloneBookingClause });
      const tenant = await Tenant.findById(event.tenantId);
      const attraction = event.attractionPresentation;
      if (booking && tenant && attraction) {
        if (booking.stripePaymentIntentId !== event.paymentIntentId || booking.total !== event.total || booking.currency !== event.currency ||
          booking.paymentStatus !== 'succeeded' || !['confirmed', 'completed'].includes(booking.status)) {
          reason = 'BOOKING_STATE_CHANGED';
        } else if (!event.recipientFingerprint || recipientFingerprint(booking, tenant, event.audience) !== event.recipientFingerprint) {
          reason = 'NOTIFICATION_RECIPIENT_CHANGED';
        } else {
          const send = await preparePaidBookingNotice(booking, attraction, tenant, event.audience);
          const claimed = await runBookingTransaction(async session => {
            const update = await BookingPaidEffectV1.updateOne({ ...fence, leaseUntil: { $gt: new Date() } }, {
              $set: { providerAttemptedAt: new Date(), leaseUntil: new Date(Date.now() + LEASE_MS),
                ...(event.audience === 'customer' && !event.ticketQueuedAt ? { ticketQueuedAt: new Date() } : {}),
              },
            }, sessionOption(session));
            if (!update.modifiedCount) return false;
            // Ticket generation succeeded before preparation returned. Persist its event
            // before email delivery so a mail-provider outage cannot lose the integration.
            if (event.audience === 'customer' && !event.ticketQueuedAt) {
              await enqueueWebhookEvent(event.tenantId, 'ticket.issued', { ...payload(booking), attractionTitle: attraction.title }, session, `paid-ticket:${booking._id}`);
            }
            return true;
          });
          if (!claimed) continue;
          providerStarted = true;
          const result = await send();
          if (result.status === 'sent') { status = 'sent'; reason = ''; }
          else reason = `DELIVERY_SKIPPED_${result.reason.toUpperCase()}`;
        }
      }
    } catch (error) {
      const code = Number((error as { status?: unknown })?.status);
      if (!providerStarted || code === 429) {
        status = event.attempts < MAX_ATTEMPTS ? 'retry' : 'manual_review';
        reason = providerStarted ? 'PROVIDER_REJECTED_429' : 'NOTIFICATION_PREPARATION_FAILED';
      } else {
        reason = Number.isInteger(code) && code >= 400 && code < 500 && code !== 408 ? `PROVIDER_REJECTED_${code}` : 'DELIVERY_UNCERTAIN';
      }
    }
    const updated = await BookingPaidEffectV1.updateOne(fence, {
      $set: { status, lastError: reason,
        ...(status === 'sent' ? { sentAt: new Date() } : {}),
        ...(status === 'retry' ? { nextAttemptAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** (event.attempts - 1))) } : {}),
      }, $unset: { leaseToken: 1, leaseUntil: 1, ...(status === 'retry' ? { providerAttemptedAt: 1 } : {}) },
    });
    if (updated.modifiedCount) { if (status === 'sent') summary.sent++; else if (status === 'retry') summary.retried++; else summary.manualReview++; }
  }
  return summary;
};
