import { Types } from 'mongoose';
import { Booking } from '../models/Booking';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { generateBookingAccessToken } from '../utils/bookingAccess';
import { sendBookingStatusEmail } from './email.service';
import { standaloneBookingClause } from './bookingRecordScope.service';
import { listPaymentIntentRefunds } from './stripe.service';
import { runBookingTransaction, sessionOption } from './bookingInventory.service';
import { enqueueBookingOperatorNotification } from './bookingOperatorNotification.service';

/**
 * Stripe refund metadata key/value that marks a refund created by the customer
 * cancellation flow. That flow owns the booking transition (status cancelled +
 * inventory release) inside its own transaction, so webhook reconciliation must
 * never race it into a different terminal state.
 */
export const ATN_REFUND_FLOW_KEY = 'atnRefundFlow';
export const ATN_CANCELLATION_REFUND_FLOW = 'booking-cancellation';

export type RefundLedgerStatus = 'pending' | 'succeeded' | 'failed';

/** Map a Stripe refund status onto the booking ledger's three states. */
export const refundLedgerStatus = (providerStatus: string): RefundLedgerStatus => {
  if (providerStatus === 'succeeded') return 'succeeded';
  if (providerStatus === 'failed' || providerStatus === 'canceled') return 'failed';
  return 'pending';
};

const refundLog = (level: 'info' | 'warn', event: string, fields: Record<string, unknown>): void => {
  const line = { source: 'stripe-refund-webhook', event, ...fields };
  if (level === 'warn') console.warn('[stripe-refund]', line);
  else console.info('[stripe-refund]', line);
};

/**
 * Record one provider refund on the booking ledger, keyed by the Stripe refund
 * id so every caller (admin refund, webhook, replays) converges on ONE entry.
 * Status only moves forward: pending -> succeeded|failed, succeeded -> failed
 * (a reversal). A late or stale write can never turn succeeded back into
 * pending or failed back into succeeded. Returns the entry's previous status.
 */
export const recordBookingRefundLedger = async (
  bookingId: Types.ObjectId | string,
  refund: { id: string; status: string; amount: number }
): Promise<{ previousStatus: RefundLedgerStatus | null; status: RefundLedgerStatus }> => {
  const status = refundLedgerStatus(refund.status);
  const amount = refund.amount / 100;
  const inserted = await Booking.updateOne(
    { _id: bookingId, ...standaloneBookingClause, 'refunds.providerRefundId': { $ne: refund.id } },
    { $push: { refunds: { providerRefundId: refund.id, amount, status, createdAt: new Date() } } }
  );
  if (inserted.modifiedCount === 1) return { previousStatus: null, status };

  const allowedFrom: RefundLedgerStatus[] = status === 'succeeded'
    ? ['pending']
    : status === 'failed'
      ? ['pending', 'succeeded']
      : [];
  if (allowedFrom.length === 0) return { previousStatus: 'pending', status };

  const before = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      ...standaloneBookingClause,
      refunds: { $elemMatch: { providerRefundId: refund.id, status: { $in: allowedFrom } } },
    },
    { $set: { 'refunds.$.status': status, 'refunds.$.amount': amount } },
    { new: false, projection: { refunds: 1 } }
  );
  const previous = before?.refunds?.find((entry) => entry.providerRefundId === refund.id);
  return { previousStatus: previous ? previous.status : status, status };
};

export interface RefundStateResult {
  refundedMinor: number;
  fullRefund: boolean;
  newlyRefunded: number;
  transitioned: boolean;
}

/**
 * Apply a provider-confirmed succeeded-refund total to a standalone card booking.
 * Shared by the admin refund endpoint and the Stripe webhook:
 * - refundedAmount only ratchets up ($max), atomically, so exactly one caller
 *   observes the positive delta and owns the totalSpent decrement + email;
 * - a full refund moves paymentStatus succeeded -> refunded and an active
 *   booking status -> refunded (a cancelled booking keeps its status).
 */
export const applyBookingRefundTotal = async (
  booking: { _id: unknown; tenantId: unknown; total: number; userId?: unknown; stripePaymentIntentId?: string },
  succeededRefundMinor: number
): Promise<RefundStateResult> => runBookingTransaction(async (session) => {
  const bookingAmount = Math.round(booking.total * 100);
  const fullRefund = succeededRefundMinor >= bookingAmount;
  const refundedMinor = Math.min(succeededRefundMinor, bookingAmount);
  const refundedMajor = refundedMinor / 100;
  const scope = {
    _id: booking._id,
    tenantId: booking.tenantId,
    ...standaloneBookingClause,
    stripePaymentIntentId: booking.stripePaymentIntentId,
  };
  const before = await Booking.findOneAndUpdate(
    scope,
    { $max: { refundedAmount: refundedMajor } },
    { new: false, ...sessionOption(session) }
  );
  const newlyRefunded = before
    ? Math.max(Math.round((refundedMajor - (before.refundedAmount || 0)) * 100), 0) / 100
    : 0;
  let transitioned = false;
  if (before && fullRefund) {
    const updated = await Booking.updateOne(
      { ...scope, paymentStatus: 'succeeded' },
      [{
        $set: {
          paymentStatus: 'refunded',
          status: {
            $cond: [{ $in: ['$status', ['pending', 'confirmed', 'completed']] }, 'refunded', '$status'],
          },
        },
      }],
      sessionOption(session)
    );
    transitioned = updated.modifiedCount === 1;
  }
  if (booking.userId && newlyRefunded > 0) {
    await User.findByIdAndUpdate(booking.userId, { $inc: { totalSpent: -newlyRefunded } }, sessionOption(session));
  }
  if (before && newlyRefunded > 0) {
    await enqueueBookingOperatorNotification(before, {
      kind: 'refunded', eventKey: `refunded:${refundedMinor}`,
      refundAmount: newlyRefunded, fullRefund,
    }, session);
  }
  return { refundedMinor, fullRefund, newlyRefunded, transitioned };
});

/** Customer "refund processed" email — the same message the admin refund sends. */
export const notifyBookingRefunded = (
  booking: {
    _id: unknown;
    tenantId: unknown;
    reference: string;
    currency: string;
    guestDetails: { email: string; firstName?: string; lastName?: string };
  },
  refundAmount: number,
  fullRefund: boolean
): void => {
  void Tenant.findById(booking.tenantId)
    .select('name slug customDomain domainMigrated contactInfo theme logo defaultLanguage defaultCurrency timezone')
    .lean()
    .then((tenant) => tenant ? sendBookingStatusEmail(
        booking.guestDetails.email,
        {
          reference: booking.reference,
          guestName: `${booking.guestDetails.firstName || ''} ${booking.guestDetails.lastName || ''}`.trim(),
          kind: 'refunded',
          guestAccessToken: generateBookingAccessToken(String(booking._id), booking.reference),
          refundAmount,
          currency: booking.currency,
          fullRefund,
        },
        tenant
      ) : undefined)
    .catch(() => console.error('[email] refund notification failed', {
      tenantId: String(booking.tenantId),
    }));
};

export type RefundReconcileOutcome =
  | 'applied'
  | 'no-change'
  | 'retry-payment-not-finalized'
  | 'deferred-to-cancellation'
  | 'manual-review';

export interface RefundReconcileResult {
  outcome: RefundReconcileOutcome;
  newlyRefunded: number;
  fullRefund: boolean;
  reversedRefundIds: string[];
}

/**
 * Reconcile one tenant-scoped standalone booking against the refunds Stripe
 * actually holds for its PaymentIntent. The webhook payload is only a trigger:
 * the provider list is authoritative, so duplicate, replayed and out-of-order
 * deliveries converge on the same state and never apply a refund twice.
 */
export const reconcileBookingStripeRefunds = async (input: {
  tenantId: string;
  paymentIntentId: string;
  secretKey: string;
  eventId: string;
  eventType: string;
}): Promise<RefundReconcileResult | null> => {
  const booking = await Booking.findOne({
    stripePaymentIntentId: input.paymentIntentId,
    tenantId: input.tenantId,
    ...standaloneBookingClause,
  });
  if (!booking) return null;

  const logFields = {
    tenantId: input.tenantId,
    bookingId: String(booking._id),
    paymentIntentId: input.paymentIntentId,
    eventId: input.eventId,
    eventType: input.eventType,
  };
  const result: RefundReconcileResult = {
    outcome: 'no-change',
    newlyRefunded: 0,
    fullRefund: false,
    reversedRefundIds: [],
  };

  // Stripe may deliver a refund before payment_intent.succeeded has been applied.
  // Recording nothing and asking for redelivery keeps finalization -> refund order.
  if (
    booking.status === 'pending' &&
    !booking.inventoryReleasedAt &&
    ['pending', 'processing', 'failed'].includes(booking.paymentStatus)
  ) {
    refundLog('warn', 'payment_not_finalized_retry', logFields);
    return { ...result, outcome: 'retry-payment-not-finalized' };
  }

  const providerRefunds = (await listPaymentIntentRefunds(input.secretKey, input.paymentIntentId))
    .filter((refund) => refund.paymentIntentId === input.paymentIntentId);

  for (const refund of providerRefunds) {
    const ledger = await recordBookingRefundLedger(booking._id, refund);
    if (ledger.previousStatus === 'succeeded' && ledger.status === 'failed') {
      result.reversedRefundIds.push(refund.id);
    }
  }
  if (result.reversedRefundIds.length > 0) {
    // Stripe can fail a refund after reporting success (the money is returned
    // to the merchant balance). ATN never silently re-opens a refunded booking:
    // the ledger shows the failure and an operator decides the booking state.
    refundLog('warn', 'refund_reversed_manual_review', {
      ...logFields,
      refundIds: result.reversedRefundIds,
    });
  }

  const cancellationOwned = providerRefunds.some(
    (refund) => refund.metadata?.[ATN_REFUND_FLOW_KEY] === ATN_CANCELLATION_REFUND_FLOW
  );
  if (
    cancellationOwned &&
    ['pending', 'confirmed'].includes(booking.status) &&
    !booking.inventoryReleasedAt
  ) {
    refundLog('warn', 'deferred_to_cancellation_flow', logFields);
    return { ...result, outcome: 'deferred-to-cancellation' };
  }

  if (!['succeeded', 'refunded'].includes(booking.paymentStatus)) {
    // Money moved on a booking ATN never recorded as paid (e.g. a late payment on
    // a released hold). The ledger now shows the refund; state needs a human.
    refundLog('warn', 'unpaid_booking_refund_manual_review', {
      ...logFields,
      paymentStatus: booking.paymentStatus,
      status: booking.status,
    });
    return { ...result, outcome: 'manual-review' };
  }

  const succeededMinor = providerRefunds
    .filter((refund) => refund.status === 'succeeded')
    .reduce((sum, refund) => sum + refund.amount, 0);
  if (succeededMinor <= 0) {
    return { ...result, outcome: result.reversedRefundIds.length ? 'manual-review' : 'no-change' };
  }

  const state = await applyBookingRefundTotal(booking, succeededMinor);
  result.fullRefund = state.fullRefund;
  result.newlyRefunded = state.newlyRefunded;
  if (state.newlyRefunded > 0) {
    notifyBookingRefunded(booking, state.newlyRefunded, state.fullRefund);
  }
  if (state.newlyRefunded > 0 || state.transitioned) {
    refundLog('info', 'refund_applied', {
      ...logFields,
      newlyRefunded: state.newlyRefunded,
      refundedAmount: state.refundedMinor / 100,
      fullRefund: state.fullRefund,
    });
    result.outcome = 'applied';
  } else if (result.reversedRefundIds.length) {
    result.outcome = 'manual-review';
  }
  return result;
};
