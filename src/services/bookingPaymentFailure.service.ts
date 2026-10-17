import crypto from 'crypto';
import { Types } from 'mongoose';
import { Booking } from '../models/Booking';
import { WebhookEvent } from '../models/WebhookEvent';
import { markCardPaymentFailed, runBookingTransaction, sessionOption } from './bookingInventory.service';
import { standaloneBookingClause } from './bookingRecordScope.service';
import { enqueueWebhookEvent } from './webhook.service';

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

type FailureInput = {
  bookingId: unknown;
  tenantId: unknown;
  paymentIntentId: string;
  eventId: string;
  /** The controller retrieves and verifies this intent from the bound Stripe account. */
  currentPaymentStatus: string;
};

/** One verified provider event is one attempt; the same intent may decline again.
 * Receipt, retryable failure and downstream intents either all commit or all abort.
 */
export const recordCardPaymentFailure = async (input: FailureInput): Promise<{ duplicate: boolean; transitioned: boolean }> => {
  if (typeof input.eventId !== 'string' || !input.eventId || input.eventId.length > 255) throw new Error('INVALID_PAYMENT_FAILURE_EVENT_ID');
  if (!Types.ObjectId.isValid(String(input.tenantId)) || !Types.ObjectId.isValid(String(input.bookingId)) || !input.paymentIntentId) throw new Error('INVALID_PAYMENT_FAILURE_BINDING');
  const tenantId = new Types.ObjectId(String(input.tenantId));
  const eventType = 'payment_intent.payment_failed';
  const eventKey = `stripe-failure:${crypto.createHash('sha256').update(input.eventId).digest('hex')}`;
  const write = () => runBookingTransaction(async session => {
    const bound = await Booking.exists({ _id: input.bookingId, tenantId, stripePaymentIntentId: input.paymentIntentId,
      paymentMethod: 'card', ...standaloneBookingClause }).session(session || null);
    if (!bound) throw new Error('PAYMENT_FAILURE_BINDING_CHANGED');
    // Claim before effects; completion is invisible until the transaction commits.
    const claim = await WebhookEvent.updateOne({ provider: 'stripe', eventId: input.eventId }, { $setOnInsert: {
      tenantId, eventType, completedTenantIds: [tenantId], receivedAt: new Date(),
    } }, { upsert: true, runValidators: true, ...sessionOption(session) });
    if (!claim.upsertedCount) {
      const previous = await WebhookEvent.findOne({ provider: 'stripe', eventId: input.eventId }, null, sessionOption(session));
      if (!previous || String(previous.tenantId) !== String(tenantId) || previous.eventType !== eventType ||
        previous.completedTenantIds?.some(id => String(id) !== String(tenantId))) throw new Error('PAYMENT_FAILURE_EVENT_SCOPE_CONFLICT');
      // Also suppress old acknowledged failures without a completion marker.
      // This rollout must not resend historical events to new subscribers.
      return { duplicate: true, transitioned: false };
    }
    if (!['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture', 'succeeded', 'canceled'].includes(input.currentPaymentStatus)) {
      throw new Error('PAYMENT_FAILURE_PROVIDER_STATE_UNSUPPORTED');
    }
    if (input.currentPaymentStatus !== 'requires_payment_method') return { duplicate: false, transitioned: false };
    const booking = await markCardPaymentFailed(input.bookingId, tenantId, input.paymentIntentId, session);
    if (booking) await enqueueWebhookEvent(tenantId, 'payment.failed', paymentEventPayload(booking), session, eventKey);
    return { duplicate: false, transitioned: !!booking };
  });
  try { return await write(); } catch (error) {
    const failure = error as { code?: number; keyPattern?: Record<string, unknown> };
    // Concurrent first receipts may race on the existing unique provider/event
    // index. Retry in a fresh transaction; never continue an aborted session.
    if (failure.code === 11000 && failure.keyPattern?.provider && failure.keyPattern?.eventId) return write();
    throw error;
  }
};
