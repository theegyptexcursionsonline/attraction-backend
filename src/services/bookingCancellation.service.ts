import crypto from 'crypto';
import { Booking } from '../models/Booking';
import { BookingCancellation } from '../models/BookingCancellation';
import { User } from '../models/User';
import { BookingWithInventoryMarker, releaseBookingInventory, runBookingTransaction, sessionOption } from './bookingInventory.service';
import { standaloneBookingClause } from './bookingRecordScope.service';
import { enqueueBookingOperatorNotification } from './bookingOperatorNotification.service';
import { getTenantStripeConfig } from './tenantPayment.service';
import { bookingStripeContextMatches } from './bookingPaymentBinding.service';
import { createRefund, listPaymentIntentRefunds, ProviderRefund } from './stripe.service';

export const ATN_REFUND_FLOW_KEY = 'atnRefundFlow';
export const ATN_CANCELLATION_REFUND_FLOW = 'booking-cancellation';
const LEASE_MS = 5 * 60_000;

export const isCancellationRefund = (refund: ProviderRefund, booking: { _id: unknown; tenantId: unknown; stripePaymentIntentId?: string }): boolean =>
  refund.paymentIntentId === booking.stripePaymentIntentId &&
  refund.metadata?.[ATN_REFUND_FLOW_KEY] === ATN_CANCELLATION_REFUND_FLOW &&
  refund.metadata.bookingId === String(booking._id) && refund.metadata.tenantId === String(booking.tenantId);

/** Persist before any provider request. Existing operations are never reset by retries. */
export const requestBookingCancellation = async (bookingId: unknown, tenantId: unknown): Promise<void> => {
  await runBookingTransaction(async (session) => {
    const booking = await Booking.findOne({ _id: bookingId, tenantId, ...standaloneBookingClause }, null, sessionOption(session));
    if (!booking || !['pending', 'confirmed'].includes(booking.status) || booking.inventoryReleasedAt) throw new Error('CANCELLATION_CONFLICT');
    if (booking.paymentMethod === 'card' && booking.paymentStatus !== 'succeeded' && (booking.stripePaymentIntentId || booking.stripePaymentSessionClaimedAt)) throw new Error('CANCELLATION_PAYMENT_UNRESOLVED');
    // Serialize against admin state edits before any financial side effect.
    await Booking.updateOne({ _id: booking._id, tenantId: booking.tenantId }, { $set: { cancellationRequestedAt: booking.cancellationRequestedAt || new Date() } }, sessionOption(session));
    await BookingCancellation.updateOne({ _id: booking._id, tenantId: booking.tenantId }, {
      $setOnInsert: { status: 'pending', attempts: 0, nextAttemptAt: new Date() },
    }, { upsert: true, ...sessionOption(session) });
    return true;
  });
};

/** Provider evidence is fetched with the booking's verified account before this function. */
export const finalizeBookingCancellation = async (
  bookingId: unknown, tenantId: unknown, refunds: ProviderRefund[] = []
): Promise<BookingWithInventoryMarker> => runBookingTransaction(async (session) => {
  const booking = await Booking.findOne({ _id: bookingId, tenantId, ...standaloneBookingClause }, null, sessionOption(session)) as BookingWithInventoryMarker | null;
  if (!booking) throw new Error('CANCELLATION_CONFLICT');
  const scope = { _id: booking._id, tenantId: booking.tenantId };
  const operation = await BookingCancellation.findOne(scope, null, sessionOption(session));
  const cancellation = refunds.filter((refund) => isCancellationRefund(refund, booking));
  // Legacy refunds carry the same immutable booking+tenant metadata. They may
  // recover an interrupted pre-outbox cancellation without creating another refund.
  if (!operation && !cancellation.some((refund) => refund.status === 'succeeded')) throw new Error('CANCELLATION_INTENT_MISSING');
  if (booking.status === 'cancelled' && booking.inventoryReleasedAt) {
    await BookingCancellation.updateOne(scope, { $set: { status: 'completed' }, $unset: { leaseToken: 1, leaseUntil: 1, lastError: 1 } }, sessionOption(session));
    return booking;
  }
  if (!['pending', 'confirmed', 'refunded'].includes(booking.status) || booking.inventoryReleasedAt) throw new Error('CANCELLATION_CONFLICT');
  const paid = ['succeeded', 'refunded'].includes(booking.paymentStatus);
  let refundDelta = 0;
  let cancellationRefundAmount = 0;
  if (paid) {
    const valid = refunds.filter((refund) => refund.paymentIntentId === booking.stripePaymentIntentId && refund.status === 'succeeded');
    if (valid.some((refund) => booking.refunds?.some((entry) => entry.providerRefundId === refund.id && entry.status === 'failed'))) throw new Error('CANCELLATION_REFUND_REVERSED');
    const minor = valid.reduce((sum, refund) => sum + refund.amount, 0);
    if (!cancellation.some((refund) => refund.status === 'succeeded') || minor < Math.round(booking.total * 100)) throw new Error('REFUND_NOT_COMPLETED');
    cancellationRefundAmount = cancellation.filter((refund) => refund.status === 'succeeded').reduce((sum, refund) => sum + refund.amount, 0) / 100;
    refundDelta = Math.max(0, Math.round((booking.total - (booking.refundedAmount || 0)) * 100)) / 100;
    booking.paymentStatus = 'refunded';
    booking.refundedAmount = booking.total;
    const ids = new Set(valid.map((refund) => refund.id));
    booking.refunds = [...(booking.refunds || []).filter((refund) => !ids.has(refund.providerRefundId)),
      ...valid.map((refund) => ({ providerRefundId: refund.id, amount: refund.amount / 100, status: 'succeeded' as const, createdAt: new Date() }))];
    if (booking.userId && refundDelta > 0) await User.findByIdAndUpdate(booking.userId, { $inc: { totalSpent: -refundDelta } }, sessionOption(session));
  } else if (booking.paymentStatus !== 'pending' && booking.paymentStatus !== 'failed') {
    throw new Error('CANCELLATION_PAYMENT_UNRESOLVED');
  }
  await releaseBookingInventory(booking, session);
  booking.cancellationRequestedAt = booking.cancellationRequestedAt || new Date();
  booking.status = 'cancelled';
  await booking.save(sessionOption(session));
  await enqueueBookingOperatorNotification(booking, { kind: 'cancelled', eventKey: 'cancelled', refundAmount: paid ? cancellationRefundAmount : undefined, fullRefund: paid }, session);
  await enqueueBookingOperatorNotification(booking, { kind: 'cancelled', eventKey: 'cancelled', audience: 'customer', refundAmount: paid ? cancellationRefundAmount : undefined, fullRefund: paid }, session);
  await BookingCancellation.updateOne(scope, { $set: { status: 'completed' }, $unset: { leaseToken: 1, leaseUntil: 1, lastError: 1 } }, { upsert: true, ...sessionOption(session) });
  return booking;
});

/** A resumed attempt reads Stripe; an ambiguous prior write is never blindly repeated. */
export const processBookingCancellation = async (bookingId: unknown, tenantId: unknown): Promise<BookingWithInventoryMarker | null> => {
  const now = new Date();
  const leaseToken = crypto.randomUUID();
  const operation = await BookingCancellation.findOneAndUpdate({ _id: bookingId, tenantId,
    $or: [{ status: { $in: ['pending', 'retry'] }, nextAttemptAt: { $lte: now } }, { status: 'processing', leaseUntil: { $lte: now } }],
  }, { $set: { status: 'processing', leaseToken, leaseUntil: new Date(Date.now() + LEASE_MS) }, $inc: { attempts: 1 } }, { new: true });
  if (!operation) return null;
  const fence = { _id: operation._id, tenantId: operation.tenantId, status: 'processing', leaseToken };
  try {
    const booking = await Booking.findOne({ _id: operation._id, tenantId: operation.tenantId, ...standaloneBookingClause });
    if (!booking) throw new Error('CANCELLATION_SCOPE_MISSING');
    if (booking.status === 'cancelled' && booking.inventoryReleasedAt) return await finalizeBookingCancellation(booking._id, booking.tenantId);
    if (!['pending', 'confirmed', 'refunded'].includes(booking.status) || booking.inventoryReleasedAt) throw new Error('CANCELLATION_CONFLICT');
    if (!['succeeded', 'refunded'].includes(booking.paymentStatus)) {
      // Card holds must use the existing hold recovery, never release while a
      // payment could settle independently of this cancellation command.
      if (booking.paymentMethod === 'card' && booking.stripePaymentIntentId) throw new Error('CANCELLATION_PAYMENT_UNRESOLVED');
      return await finalizeBookingCancellation(booking._id, booking.tenantId);
    }
    const config = await getTenantStripeConfig(booking.tenantId);
    if (!config?.enabled || !config.secretKey || !bookingStripeContextMatches(booking, config)) throw new Error('CANCELLATION_GATEWAY_UNAVAILABLE');
    if (booking.paymentMethod !== 'card' || !booking.stripePaymentIntentId) throw new Error('CANCELLATION_PAYMENT_UNRESOLVED');
    let refunds = (await listPaymentIntentRefunds(config.secretKey, booking.stripePaymentIntentId)).filter((refund) => refund.paymentIntentId === booking.stripePaymentIntentId);
    if (!refunds.some((refund) => isCancellationRefund(refund, booking))) {
      if (operation.providerAttemptedAt) throw new Error('CANCELLATION_REFUND_UNCERTAIN');
      const succeeded = refunds.filter((refund) => refund.status === 'succeeded').reduce((sum, refund) => sum + refund.amount, 0);
      if (refunds.some((refund) => !['succeeded', 'failed', 'canceled'].includes(refund.status))) throw new Error('CANCELLATION_REFUND_PENDING');
      const amount = Math.round(booking.total * 100) - succeeded;
      if (amount <= 0) throw new Error('CANCELLATION_REFUND_UNCERTAIN');
      const claimed = await BookingCancellation.updateOne({ ...fence, providerAttemptedAt: { $exists: false }, leaseUntil: { $gt: new Date() } },
        { $set: { providerAttemptedAt: new Date(), refundAmountMinor: amount } });
      if (!claimed.modifiedCount) return null;
      const refund = await createRefund(config.secretKey, booking.stripePaymentIntentId, amount, {
        allowPending: true, idempotencyKey: `booking-cancel-${booking._id}`,
        metadata: { [ATN_REFUND_FLOW_KEY]: ATN_CANCELLATION_REFUND_FLOW, bookingId: String(booking._id), tenantId: String(booking.tenantId) },
      });
      refunds = [...refunds, { ...refund, metadata: { [ATN_REFUND_FLOW_KEY]: ATN_CANCELLATION_REFUND_FLOW, bookingId: String(booking._id), tenantId: String(booking.tenantId) } }];
    }
    if (refunds.some((refund) => isCancellationRefund(refund, booking) && ['failed', 'canceled'].includes(refund.status))) throw new Error('CANCELLATION_REFUND_FAILED');
    if (!refunds.some((refund) => isCancellationRefund(refund, booking) && refund.status === 'succeeded')) throw new Error('CANCELLATION_REFUND_PENDING');
    return await finalizeBookingCancellation(booking._id, booking.tenantId, refunds);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const terminal = ['CANCELLATION_SCOPE_MISSING', 'CANCELLATION_CONFLICT', 'CANCELLATION_REFUND_UNCERTAIN', 'CANCELLATION_REFUND_FAILED', 'CANCELLATION_REFUND_REVERSED', 'CANCELLATION_PAYMENT_UNRESOLVED'].includes(message) || operation.attempts >= 10;
    if (terminal) console.warn('[booking-cancellations] manual review required', { bookingId: String(operation._id), tenantId: String(operation.tenantId), code: /^CANCELLATION_[A-Z_]+$/.test(message) ? message : 'CANCELLATION_RECOVERY_REQUIRED' });
    await BookingCancellation.updateOne(fence, { $set: {
      status: terminal ? 'manual_review' : 'retry', nextAttemptAt: new Date(Date.now() + 30_000),
      lastError: /^CANCELLATION_[A-Z_]+$/.test(message) ? message : 'CANCELLATION_RECOVERY_REQUIRED',
    }, $unset: { leaseToken: 1, leaseUntil: 1 } });
    return null;
  }
};

export const processPendingBookingCancellations = async (limit = 20): Promise<void> => {
  const now = new Date();
  if (!Number.isSafeInteger(limit) || limit <= 0) return;
  const rows = await BookingCancellation.find({ $or: [
    { status: { $in: ['pending', 'retry'] }, nextAttemptAt: { $lte: now } },
    { status: 'processing', leaseUntil: { $lte: now } },
  ] }).sort({ nextAttemptAt: 1, _id: 1 }).limit(Math.min(100, Math.max(0, limit))).select('_id tenantId').lean();
  for (const row of rows) await processBookingCancellation(row._id, row.tenantId);
};
