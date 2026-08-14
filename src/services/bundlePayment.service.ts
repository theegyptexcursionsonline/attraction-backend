import { Types } from 'mongoose';
import { assertTransition } from '../bundles/domain';
import { allocateProportionally, totalGuests } from '../bundles/money';
import { Booking } from '../models/Booking';
import { BundleOrder, IBundleOrder } from '../models/BundleOrder';
import { BundleProviderEvent } from '../models/BundleProviderEvent';
import {
  cancelPaymentIntent,
  createPaymentIntent,
  createRefund,
  PaymentIntentResult,
  retrievePaymentIntent,
  retrieveRefund,
} from './stripe.service';
import { getTenantStripeConfig, stripeCredentialMode, TenantStripeConfig } from './tenantPayment.service';
import {
  appendBalancedLedger,
  appendBundleEvent,
  enqueueBundleOutbox,
  LedgerLine,
} from './bundleAudit.service';
import { releaseBundleInventory, runBundleTransaction } from './bundleInventory.service';

export class BundlePaymentError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400) {
    super(message);
  }
}

const assertBundleStripeEnvironment = (
  order: IBundleOrder,
  config: TenantStripeConfig | null
): void => {
  if (!order.checkoutMode || stripeCredentialMode(config) !== order.checkoutMode) {
    throw new BundlePaymentError(
      'PAYMENT_MODE_MISMATCH',
      'This order cannot use a different TEST or LIVE payment environment',
      409
    );
  }
};

export const bundlePaymentBindingError = (
  order: IBundleOrder,
  intent: PaymentIntentResult,
  requireSucceeded = true
): string | null => {
  if (intent.id !== order.stripePaymentIntentId) return 'Payment intent does not match this order';
  if (intent.metadata.bundleOrderId !== order._id.toString()) return 'Payment metadata does not match this order';
  if (intent.metadata.storefrontTenantId !== order.storefrontTenantId.toString()) return 'Payment tenant does not match this order';
  if (intent.metadata.paymentKind !== 'bundle') return 'Payment kind does not match this order';
  if (intent.amount !== order.totalMinor) return 'Payment amount does not match this order';
  if (intent.currency.toUpperCase() !== order.currency.toUpperCase()) return 'Payment currency does not match this order';
  if (order.checkoutMode) {
    if (intent.metadata.checkoutMode !== order.checkoutMode) return 'Payment environment metadata does not match this order';
    if (intent.livemode !== (order.checkoutMode === 'live')) return 'Payment provider environment does not match this order';
  }
  if (requireSucceeded && (intent.status !== 'succeeded' || intent.amountReceived < order.totalMinor)) {
    return 'Payment has not been fully received';
  }
  return null;
};

export const bundlePaymentIntentIdempotencyKey = (orderId: Types.ObjectId | string): string =>
  `bundle:${orderId}:intent:v1`;

export const createBundlePaymentSession = async (
  orderId: string,
  storefrontTenantId: Types.ObjectId | string
): Promise<{
  orderId: string;
  clientSecret: string;
  publishableKey: string;
  amountMinor: number;
  currency: string;
}> => {
  const order = await BundleOrder.findOne({ _id: orderId, storefrontTenantId });
  if (!order) throw new BundlePaymentError('ORDER_NOT_FOUND', 'Bundle order not found', 404);
  if (order.holdExpiresAt <= new Date()) {
    throw new BundlePaymentError('ORDER_HOLD_EXPIRED', 'This reservation expired; build the bundle again', 409);
  }
  if (!['reserved', 'payment_pending'].includes(order.status)) {
    throw new BundlePaymentError('ORDER_NOT_PAYABLE', 'This order cannot accept a payment', 409);
  }
  const config = await getTenantStripeConfig(order.storefrontTenantId);
  if (!config?.enabled || !config.secretKey || !config.publishableKey) {
    throw new BundlePaymentError('PAYMENT_GATEWAY_UNAVAILABLE', 'Card payment is not configured for this storefront', 503);
  }
  assertBundleStripeEnvironment(order, config);
  // Mark provider creation before crossing the network boundary. The expiry
  // worker uses this durable marker to reconcile the same Stripe idempotency
  // key before it may return capacity.
  const claimTime = new Date();
  const claimedOrder = order.stripePaymentIntentId
    ? order
    : await BundleOrder.findOneAndUpdate(
        {
          _id: order._id,
          storefrontTenantId: order.storefrontTenantId,
          status: 'reserved',
          paymentStatus: 'not_started',
          holdExpiresAt: { $gt: claimTime },
          stripePaymentIntentId: { $exists: false },
        },
        { $set: { paymentSessionClaimedAt: claimTime } },
        { new: true }
      );
  if (!claimedOrder) {
    throw new BundlePaymentError('PAYMENT_SESSION_CONFLICT', 'This reservation expired or another payment session already won', 409);
  }

  const intent = await createPaymentIntent(
    config.secretKey,
    claimedOrder.totalMinor,
    claimedOrder.currency,
    {
      paymentKind: 'bundle',
      bundleOrderId: claimedOrder._id.toString(),
      storefrontTenantId: claimedOrder.storefrontTenantId.toString(),
      orderReference: claimedOrder.reference,
      checkoutMode: claimedOrder.checkoutMode!,
    },
    { idempotencyKey: bundlePaymentIntentIdempotencyKey(claimedOrder._id) }
  );
  const bindTime = new Date();
  let bindingOrder = claimedOrder.stripePaymentIntentId
    ? claimedOrder
    : await BundleOrder.findOneAndUpdate(
        {
          _id: claimedOrder._id,
          storefrontTenantId: claimedOrder.storefrontTenantId,
          status: 'reserved',
          paymentStatus: 'not_started',
          holdExpiresAt: { $gt: bindTime },
          paymentSessionClaimedAt: { $exists: true },
          stripePaymentIntentId: { $exists: false },
        },
        {
          $set: {
            stripePaymentIntentId: intent.id,
            status: 'payment_pending',
            paymentStatus: 'intent_created',
          },
          $unset: { paymentSessionClaimedAt: '' },
        },
        { new: true }
      );
  if (!bindingOrder) {
    const latest = await BundleOrder.findById(claimedOrder._id);
    if (
      latest?.stripePaymentIntentId === intent.id &&
      ['payment_pending', 'manual_review'].includes(latest.status)
    ) {
      bindingOrder = latest;
    } else {
      const cancelled = await cancelPaymentIntent(config.secretKey, intent.id, {
        idempotencyKey: `bundle:${claimedOrder._id}:late-session-cancel`,
      });
      if (!cancelled || cancelled.status !== 'canceled') {
        await BundleOrder.updateOne(
          {
            _id: claimedOrder._id,
            paymentStatus: { $nin: ['succeeded', 'partially_refunded', 'refunded'] },
          },
          {
            $set: {
              stripePaymentIntentId: intent.id,
              status: 'manual_review',
              paymentStatus: 'manual_review',
              'recovery.required': true,
              'recovery.reason': 'Payment session crossed the inventory hold boundary and could not be cancelled',
            },
            $unset: { paymentSessionClaimedAt: '' },
            $inc: { 'recovery.attempts': 1 },
          }
        );
      }
    }
  }
  if (!bindingOrder || bindingOrder.stripePaymentIntentId !== intent.id) {
    throw new BundlePaymentError('PAYMENT_SESSION_CONFLICT', 'A different payment session is already bound to this order', 409);
  }
  const bindingError = bundlePaymentBindingError(bindingOrder, intent, false);
  if (bindingError) throw new BundlePaymentError('PAYMENT_BINDING_INVALID', bindingError, 409);
  if (claimedOrder.status === 'reserved') {
    await appendBundleEvent({
      aggregateType: 'order',
      aggregateId: bindingOrder._id,
      storefrontTenantId: bindingOrder.storefrontTenantId,
      actorType: 'guest',
      command: 'create_payment_intent',
      fromState: 'reserved',
      toState: 'payment_pending',
      metadata: { paymentIntentId: intent.id },
    });
  }
  return {
    orderId: bindingOrder._id.toString(),
    clientSecret: intent.clientSecret,
    publishableKey: config.publishableKey,
    amountMinor: bindingOrder.totalMinor,
    currency: bindingOrder.currency,
  };
};

const paidLedgerLines = (order: IBundleOrder): LedgerLine[] => [
  {
    account: 'cash_collected',
    direction: 'debit',
    amountMinor: order.totalMinor,
  },
  ...order.components.map((component) => ({
    account: 'supplier_payable' as const,
    direction: 'credit' as const,
    amountMinor: component.supplierNetTotalMinor,
    supplierTenantId: component.supplierTenantId,
    componentId: component.componentId,
  })),
  {
    account: 'platform_revenue',
    direction: 'credit',
    amountMinor: order.platformAllocationMinor,
  },
  {
    account: 'payment_fee_reserve',
    direction: 'credit',
    amountMinor: order.paymentFeeReserveMinor,
  },
  {
    account: 'tax_payable',
    direction: 'credit',
    amountMinor: order.taxMinor,
  },
];

export const finalizeBundlePayment = async (
  orderId: string,
  intent: PaymentIntentResult,
  actorType: 'stripe' | 'user'
): Promise<{ order: IBundleOrder; duplicate: boolean }> => runBundleTransaction(async (session) => {
  const order = await BundleOrder.findById(orderId).session(session);
  if (!order) throw new BundlePaymentError('ORDER_NOT_FOUND', 'Bundle order not found', 404);
  if (order.paymentStatus === 'succeeded' && ['confirmed', 'in_progress', 'completed'].includes(order.status)) {
    return { order, duplicate: true };
  }
  const bindingError = bundlePaymentBindingError(order, intent, true);
  if (bindingError) throw new BundlePaymentError('PAYMENT_BINDING_INVALID', bindingError, 409);
  if (!['payment_pending', 'manual_review'].includes(order.status)) {
    throw new BundlePaymentError('ORDER_PAYMENT_STATE_INVALID', 'Order is not waiting for payment', 409);
  }
  const fromState = order.status;
  order.paymentStatus = 'succeeded';
  if (order.status === 'payment_pending') {
    assertTransition('order', order.status, 'paid');
    order.status = 'paid';
  }
  assertTransition('order', order.status, 'allocating');
  order.status = 'allocating';
  for (const component of order.components) {
    component.status = 'confirmed';
    component.settlementStatus = 'on_hold';
  }
  assertTransition('order', order.status, 'confirmed');
  order.status = 'confirmed';
  order.recovery.required = false;
  order.recovery.reason = undefined;
  order.recovery.lastAttemptAt = new Date();
  await order.save({ session });
  const bookingIds = order.components.map((component) => component.bookingId).filter(Boolean);
  const childUpdate = await Booking.updateMany(
    {
      _id: { $in: bookingIds },
      bundleOrderId: order._id,
      status: 'pending',
      inventoryReleasedAt: { $exists: false },
      paymentStatus: { $ne: 'succeeded' },
    },
    { $set: { paymentStatus: 'succeeded', status: 'confirmed' } },
    { session }
  );
  if (childUpdate.modifiedCount !== bookingIds.length) {
    throw new BundlePaymentError('CHILD_ALLOCATION_CONFLICT', 'Paid order requires allocation recovery', 409);
  }
  await appendBalancedLedger({
    orderId: order._id,
    operationId: `payment:${intent.id}`,
    storefrontTenantId: order.storefrontTenantId,
    currency: order.currency,
    lines: paidLedgerLines(order),
  }, session);
  await appendBundleEvent({
    aggregateType: 'order',
    aggregateId: order._id,
    storefrontTenantId: order.storefrontTenantId,
    actorType,
    command: 'payment_succeeded_and_allocate',
    fromState,
    toState: 'confirmed',
    correlationId: intent.id,
    metadata: { amountMinor: order.totalMinor, componentCount: order.components.length },
  }, session);
  await enqueueBundleOutbox({
    orderId: order._id,
    tenantId: order.storefrontTenantId,
    audience: 'customer',
    eventType: 'bundle.order_confirmed',
    payload: { orderId: order._id.toString(), reference: order.reference },
  }, session);
  await enqueueBundleOutbox({
    orderId: order._id,
    tenantId: order.storefrontTenantId,
    audience: 'storefront',
    eventType: 'bundle.order_confirmed',
    payload: { orderId: order._id.toString(), reference: order.reference },
  }, session);
  for (const supplierTenantId of new Set(order.components.map((component) => component.supplierTenantId.toString()))) {
    await enqueueBundleOutbox({
      orderId: order._id,
      tenantId: new Types.ObjectId(supplierTenantId),
      audience: 'supplier',
      eventType: 'bundle.component_confirmed',
      payload: {
        orderId: order._id.toString(),
        reference: order.reference,
        componentIds: order.components
          .filter((component) => component.supplierTenantId.toString() === supplierTenantId)
          .map((component) => component.componentId),
      },
    }, session);
  }
  return { order, duplicate: false };
});

export const confirmBundlePaymentFromProvider = async (
  orderId: string,
  storefrontTenantId: Types.ObjectId | string
): Promise<{ order: IBundleOrder; duplicate: boolean }> => {
  const order = await BundleOrder.findOne({ _id: orderId, storefrontTenantId });
  if (!order) throw new BundlePaymentError('ORDER_NOT_FOUND', 'Bundle order not found', 404);
  if (!order.stripePaymentIntentId) {
    throw new BundlePaymentError('PAYMENT_SESSION_MISSING', 'No payment session is bound to this order', 409);
  }
  const config = await getTenantStripeConfig(order.storefrontTenantId);
  if (!config?.enabled || !config.secretKey) {
    throw new BundlePaymentError('PAYMENT_GATEWAY_UNAVAILABLE', 'Payment verification is unavailable', 503);
  }
  assertBundleStripeEnvironment(order, config);
  const intent = await retrievePaymentIntent(config.secretKey, order.stripePaymentIntentId);
  if (!intent) throw new BundlePaymentError('PAYMENT_NOT_FOUND', 'Payment could not be verified', 409);
  return finalizeBundlePayment(order._id.toString(), intent, 'user');
};

export const failBundlePayment = async (
  orderId: string,
  intentId: string,
  reason: string
): Promise<{ order: IBundleOrder; duplicate: boolean }> => runBundleTransaction(async (session) => {
  const order = await BundleOrder.findById(orderId).session(session);
  if (!order) throw new BundlePaymentError('ORDER_NOT_FOUND', 'Bundle order not found', 404);
  if (order.paymentStatus === 'failed' && order.status === 'payment_pending') return { order, duplicate: true };
  if (order.paymentStatus === 'succeeded') {
    throw new BundlePaymentError('PAID_ORDER_CANNOT_FAIL', 'A succeeded payment cannot be failed', 409);
  }
  if (order.stripePaymentIntentId !== intentId) {
    throw new BundlePaymentError('PAYMENT_BINDING_INVALID', 'Payment intent does not match this order', 409);
  }
  order.paymentStatus = 'failed';
  order.paymentFailureReason = reason.slice(0, 500);
  await order.save({ session });
  await Booking.updateMany(
    { bundleOrderId: order._id, status: 'pending' },
    { $set: { paymentStatus: 'failed' } },
    { session }
  );
  await appendBundleEvent({
    aggregateType: 'order',
    aggregateId: order._id,
    storefrontTenantId: order.storefrontTenantId,
    actorType: 'stripe',
    command: 'payment_failed_hold_inventory',
    fromState: 'payment_pending',
    toState: 'payment_pending',
    correlationId: intentId,
    reason,
    metadata: {},
  }, session);
  return { order, duplicate: false };
});

export const claimBundleProviderEvent = async (input: {
  eventId: string;
  eventType: string;
  tenantId: Types.ObjectId | string;
  orderId?: Types.ObjectId;
}): Promise<{ duplicate: boolean; recordId?: Types.ObjectId; inFlight?: boolean }> => {
  try {
    const record = await BundleProviderEvent.create({
      provider: 'stripe',
      ...input,
      status: 'processing',
      attempts: 1,
      leaseUntil: new Date(Date.now() + 60_000),
    });
    return { duplicate: false, recordId: record._id };
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  const existing = await BundleProviderEvent.findOne({ provider: 'stripe', eventId: input.eventId });
  if (!existing) throw new BundlePaymentError('PROVIDER_EVENT_RACE', 'Please retry this event', 409);
  if (existing.status === 'completed') return { duplicate: true };
  if (existing.status === 'processing' && existing.leaseUntil > new Date()) {
    // The first worker has not durably completed its effects. Returning a
    // terminal duplicate acknowledgement here would make a crash lose money.
    return { duplicate: false, inFlight: true };
  }
  const reclaimed = await BundleProviderEvent.findOneAndUpdate(
    {
      _id: existing._id,
      $or: [{ status: 'failed' }, { leaseUntil: { $lte: new Date() } }],
    },
    {
      $set: { status: 'processing', leaseUntil: new Date(Date.now() + 60_000) },
      $inc: { attempts: 1 },
      $unset: { lastError: 1 },
    },
    { new: true }
  );
  return reclaimed
    ? { duplicate: false, recordId: reclaimed._id }
    : { duplicate: false, inFlight: true };
};

export const completeBundleProviderEvent = async (recordId: Types.ObjectId): Promise<void> => {
  await BundleProviderEvent.updateOne(
    { _id: recordId, status: 'processing' },
    { $set: { status: 'completed', completedAt: new Date(), leaseUntil: new Date() } }
  );
};

export const failBundleProviderEvent = async (
  recordId: Types.ObjectId,
  error: Error
): Promise<void> => {
  await BundleProviderEvent.updateOne(
    { _id: recordId },
    { $set: { status: 'failed', lastError: error.message.slice(0, 1000), leaseUntil: new Date() } }
  );
};

const REFUND_ATTEMPT_LEASE_MS = 60_000;
const REFUND_RETRY_DELAY_MS = 60_000;
const REFUNDABLE_PAYMENT_STATUSES = ['succeeded', 'partially_refunded'] as const;

const clearResolvedRefundRecovery = async (orderId: Types.ObjectId): Promise<void> => {
  await BundleOrder.updateOne(
    {
      _id: orderId,
      refundPendingMinor: 0,
      'recovery.required': true,
      'recovery.reason': /^Refund recovery required:/,
      refunds: {
        $not: {
          $elemMatch: { status: { $in: ['requested', 'provider_pending'] } },
        },
      },
      'components.settlementStatus': { $ne: 'disputed' },
    },
    {
      $set: {
        'recovery.required': false,
        'recovery.lastAttemptAt': new Date(),
      },
      $unset: { 'recovery.reason': '' },
    }
  );
};

const releaseRefundReservation = async (
  orderId: Types.ObjectId,
  operationId: string,
  amountMinor: number,
  reason: string,
  providerRefundId?: string
): Promise<void> => {
  await BundleOrder.updateOne(
    {
      _id: orderId,
      refundPendingMinor: { $gte: amountMinor },
      refunds: {
        $elemMatch: {
          operationId,
          status: { $in: ['requested', 'provider_pending'] },
        },
      },
    },
    {
      $inc: { refundPendingMinor: -amountMinor },
      $set: {
        ...(providerRefundId ? { 'refunds.$.providerRefundId': providerRefundId } : {}),
        'refunds.$.status': 'failed',
        'refunds.$.lastAttemptAt': new Date(),
        'refunds.$.lastError': reason.slice(0, 500),
      },
      $unset: {
        'refunds.$.leaseUntil': '',
        'refunds.$.nextAttemptAt': '',
      },
    }
  );
  await clearResolvedRefundRecovery(orderId);
};

const scheduleRefundRecovery = async (
  orderId: Types.ObjectId,
  operationId: string,
  reason: string,
  providerRefundId?: string,
  releaseLease = true
): Promise<void> => {
  const now = new Date();
  const update: Record<string, unknown> = {
    $set: {
      ...(providerRefundId ? { 'refunds.$.providerRefundId': providerRefundId } : {}),
      'refunds.$.status': 'provider_pending',
      'refunds.$.lastAttemptAt': now,
      'refunds.$.nextAttemptAt': new Date(now.getTime() + REFUND_RETRY_DELAY_MS),
      'refunds.$.lastError': reason.slice(0, 500),
      'recovery.required': true,
      'recovery.reason': `Refund recovery required: ${reason}`.slice(0, 500),
      'recovery.lastAttemptAt': now,
    },
    $inc: { 'recovery.attempts': 1 },
  };
  if (releaseLease) update.$unset = { 'refunds.$.leaseUntil': '' };
  await BundleOrder.updateOne(
    {
      _id: orderId,
      refunds: {
        $elemMatch: {
          operationId,
          status: { $in: ['requested', 'provider_pending'] },
        },
      },
    },
    update
  );
};

const claimRefundProviderAttempt = async (
  orderId: Types.ObjectId,
  operationId: string
): Promise<boolean> => {
  const now = new Date();
  const result = await BundleOrder.updateOne(
    {
      _id: orderId,
      refunds: {
        $elemMatch: {
          operationId,
          status: { $in: ['requested', 'provider_pending'] },
          $or: [
            { leaseUntil: { $exists: false } },
            { leaseUntil: { $lte: now } },
          ],
        },
      },
    },
    {
      $set: {
        'refunds.$.providerAttemptedAt': now,
        'refunds.$.lastAttemptAt': now,
        'refunds.$.leaseUntil': new Date(now.getTime() + REFUND_ATTEMPT_LEASE_MS),
      },
      $unset: {
        'refunds.$.nextAttemptAt': '',
        'refunds.$.lastError': '',
      },
      $inc: { 'refunds.$.attempts': 1 },
    }
  );
  return result.modifiedCount === 1;
};

export const refundBundleOrder = async (input: {
  orderId: string;
  operationId: string;
  amountMinor: number;
  reason: string;
  actorId: Types.ObjectId;
}): Promise<{ order: IBundleOrder; duplicate: boolean }> => {
  let order = await BundleOrder.findById(input.orderId);
  if (!order) throw new BundlePaymentError('ORDER_NOT_FOUND', 'Bundle order not found', 404);
  if (
    !order.stripePaymentIntentId ||
    !REFUNDABLE_PAYMENT_STATUSES.includes(
      order.paymentStatus as (typeof REFUNDABLE_PAYMENT_STATUSES)[number]
    )
  ) {
    throw new BundlePaymentError('ORDER_NOT_REFUNDABLE', 'Only a captured payment can be refunded', 409);
  }
  const remainingRefundableMinor = order.totalMinor - order.refundedMinor;
  const prior = order.refunds.find((refund) => refund.operationId === input.operationId);
  if (
    order.status === 'cancel_pending' &&
    input.amountMinor !== remainingRefundableMinor &&
    !prior
  ) {
    throw new BundlePaymentError(
      'CANCELLATION_REQUIRES_FULL_REFUND',
      'A cancellation-pending order must refund its full remaining paid amount',
      409
    );
  }
  if (prior) {
    if (prior.amountMinor !== input.amountMinor || prior.reason !== input.reason) {
      throw new BundlePaymentError('REFUND_OPERATION_REUSED', 'This refund operation was used with different data', 409);
    }
    if (prior.status === 'succeeded') return { order, duplicate: true };
    if (prior.status === 'failed') {
      throw new BundlePaymentError('REFUND_OPERATION_FAILED', 'This refund operation was rejected; start a new operation', 409);
    }
  } else {
    const reservationQuery: Record<string, unknown> = {
        _id: order._id,
        stripePaymentIntentId: order.stripePaymentIntentId,
        paymentStatus: { $in: [...REFUNDABLE_PAYMENT_STATUSES] },
        'refunds.operationId': { $ne: input.operationId },
        $expr: {
          $lte: [
            { $add: ['$refundedMinor', '$refundPendingMinor', input.amountMinor] },
            '$totalMinor',
          ],
        },
      };
    if (input.amountMinor !== remainingRefundableMinor) {
      reservationQuery.status = { $ne: 'cancel_pending' };
    }
    const reserved = await BundleOrder.findOneAndUpdate(
      reservationQuery,
      {
        $inc: { refundPendingMinor: input.amountMinor },
        $push: {
          refunds: {
            operationId: input.operationId,
            amountMinor: input.amountMinor,
            status: 'requested',
            reason: input.reason,
            requestedBy: input.actorId,
            createdAt: new Date(),
            // If this process dies after reserving money but before claiming
            // the provider lease, the bounded worker can safely resume it.
            nextAttemptAt: new Date(Date.now() + REFUND_RETRY_DELAY_MS),
            attempts: 0,
          },
        },
      },
      { new: true }
    );
    if (!reserved) {
      const raced = await BundleOrder.findOne({
        _id: order._id,
        'refunds.operationId': input.operationId,
      });
      if (!raced) {
        throw new BundlePaymentError('REFUND_EXCEEDS_REMAINING', 'Refund exceeds the unreserved paid amount');
      }
      order = raced;
    } else {
      order = reserved;
    }
  }
  const currentRefund = order.refunds.find((item) => item.operationId === input.operationId)!;
  const config = await getTenantStripeConfig(order.storefrontTenantId);
  if (!config?.enabled || !config.secretKey) {
    if (!currentRefund.providerAttemptedAt && !currentRefund.providerRefundId) {
      await releaseRefundReservation(
        order._id,
        input.operationId,
        input.amountMinor,
        'Refund provider is unavailable before submission'
      );
    } else {
      await scheduleRefundRecovery(
        order._id,
        input.operationId,
        'Refund provider is temporarily unavailable',
        currentRefund.providerRefundId
      );
    }
    throw new BundlePaymentError('PAYMENT_GATEWAY_UNAVAILABLE', 'Refund provider is unavailable', 503);
  }
  try {
    assertBundleStripeEnvironment(order, config);
  } catch (error) {
    if (!currentRefund.providerAttemptedAt && !currentRefund.providerRefundId) {
      await releaseRefundReservation(
        order._id,
        input.operationId,
        input.amountMinor,
        error instanceof Error ? error.message : 'Payment environment mismatch'
      );
    } else {
      await scheduleRefundRecovery(
        order._id,
        input.operationId,
        error instanceof Error ? error.message : 'Payment environment mismatch',
        currentRefund.providerRefundId
      );
    }
    throw error;
  }

  const claimed = await claimRefundProviderAttempt(order._id, input.operationId);
  if (!claimed) {
    const latest = await BundleOrder.findById(order._id);
    const latestRefund = latest?.refunds.find((item) => item.operationId === input.operationId);
    if (latest && latestRefund?.status === 'succeeded') return { order: latest, duplicate: true };
    throw new BundlePaymentError(
      'REFUND_OPERATION_IN_PROGRESS',
      'This refund operation is already being reconciled',
      409
    );
  }
  const claimedRefund = currentRefund;
  let providerRefund: Awaited<ReturnType<typeof retrieveRefund>>;
  try {
    providerRefund = claimedRefund.providerRefundId
      ? await retrieveRefund(config.secretKey, claimedRefund.providerRefundId)
      : await createRefund(
          config.secretKey,
          order.stripePaymentIntentId!,
          input.amountMinor,
          {
            // Reusing this key makes a crash after Stripe accepted the request
            // safe: every retry retrieves/returns the same provider operation.
            idempotencyKey: `bundle-refund:${order._id}:${input.operationId}`,
            allowPending: true,
          }
        );
  } catch (error) {
    await scheduleRefundRecovery(
      order._id,
      input.operationId,
      error instanceof Error ? error.message : 'Refund provider request was uncertain',
      claimedRefund.providerRefundId
    );
    throw new BundlePaymentError(
      'REFUND_PROVIDER_UNCERTAIN',
      'Refund status could not be verified; recovery will retry this operation',
      409
    );
  }
  if (!providerRefund || providerRefund.amount !== input.amountMinor) {
    await scheduleRefundRecovery(
      order._id,
      input.operationId,
      'Refund provider returned incomplete or mismatched evidence',
      providerRefund?.id || claimedRefund.providerRefundId
    );
    throw new BundlePaymentError('REFUND_PROVIDER_UNCERTAIN', 'Refund status could not be verified; recovery will retry this operation', 409);
  }
  if (providerRefund.status === 'failed' || providerRefund.status === 'canceled') {
    await releaseRefundReservation(
      order._id,
      input.operationId,
      input.amountMinor,
      `Refund provider returned ${providerRefund.status}`,
      providerRefund.id
    );
    throw new BundlePaymentError('REFUND_FAILED', 'The payment provider rejected this refund', 409);
  }
  if (providerRefund.status !== 'succeeded') {
    await scheduleRefundRecovery(
      order._id,
      input.operationId,
      `Refund provider status is ${providerRefund.status}`,
      providerRefund.id
    );
    throw new BundlePaymentError('REFUND_PENDING', 'The refund is processing and will be reconciled automatically', 409);
  }
  // Persist provider evidence before the local transaction. If the process
  // crashes or a local invariant fails, the recovery worker can retrieve this
  // exact succeeded refund rather than creating a second one.
  await scheduleRefundRecovery(
    order._id,
    input.operationId,
    'Provider refund succeeded; local accounting is pending',
    providerRefund.id,
    false
  );
  return runBundleTransaction(async (session) => {
    order = await BundleOrder.findById(input.orderId).session(session);
    if (!order) throw new BundlePaymentError('ORDER_NOT_FOUND', 'Bundle order not found', 404);
    const refund = order.refunds.find((item) => item.operationId === input.operationId);
    if (!refund) throw new BundlePaymentError('REFUND_OPERATION_MISSING', 'Refund operation is missing', 409);
    if (refund.status === 'succeeded') return { order, duplicate: true };
    const componentAllocations = allocateProportionally(
      input.amountMinor,
      order.components.map((component) => component.customerAllocationMinor - component.refundedMinor)
    );
    const fromState = order.status;
    const paidSettlementMinorBeforeRefund = order.components.map((component) =>
      component.settlementPaidMinor ||
      (component.settlementOperationId || component.settlementStatus === 'paid' || component.settlementStatus === 'disputed'
        ? component.supplierNetTotalMinor
        : 0)
    );
    const releasableComponents = order.components.filter((component) =>
      ['reserved', 'confirmed', 'cancel_pending', 'refund_pending'].includes(component.status)
    );
    order.components.forEach((component, index) => {
      component.refundedMinor += componentAllocations[index];
      const fullyRefunded = component.refundedMinor >= component.customerAllocationMinor;
      component.refundStatus = fullyRefunded ? 'full' : 'partial';
      const paidMinor = paidSettlementMinorBeforeRefund[index];
      if (paidMinor > 0) {
        component.settlementPaidMinor = paidMinor;
        const targetExposureMinor = fullyRefunded
          ? paidMinor
          : Math.floor(paidMinor * component.refundedMinor / component.customerAllocationMinor);
        const resolvedMinor = (component.settlementRecoveredMinor || 0) +
          (component.settlementWrittenOffMinor || 0);
        component.settlementDisputedMinor = Math.max(0, targetExposureMinor - resolvedMinor);
        component.settlementStatus = component.settlementDisputedMinor > 0
          ? 'disputed'
          : fullyRefunded ? 'not_eligible' : 'paid';
      } else if (fullyRefunded) {
        component.settlementStatus = 'not_eligible';
      }
      // Fulfilment and refund are independent dimensions. A partial refund
      // must not make a still-booked supplier component impossible to fulfil,
      // and a full refund must not erase whether service had been delivered.
    });
    refund.providerRefundId = providerRefund.id;
    refund.status = 'succeeded';
    refund.lastAttemptAt = new Date();
    refund.nextAttemptAt = undefined;
    refund.leaseUntil = undefined;
    refund.lastError = undefined;
    order.refundPendingMinor -= input.amountMinor;
    order.refundedMinor += input.amountMinor;
    const full = order.refundedMinor === order.totalMinor;
    const legacyCancellationPartial = fromState === 'cancel_pending' && !full;
    order.paymentStatus = full ? 'refunded' : 'partially_refunded';
    order.status = full ? 'refunded' : legacyCancellationPartial ? 'cancel_pending' : 'partially_refunded';
    const disputedSettlement = order.components.some((component) =>
      (component.settlementDisputedMinor || 0) > 0 || component.settlementStatus === 'disputed'
    );
    order.recovery.required = disputedSettlement || legacyCancellationPartial;
    order.recovery.reason = disputedSettlement
      ? 'A refunded supplier settlement still requires resolution'
      : legacyCancellationPartial
        ? 'Cancellation has a legacy partial refund; refund the full remaining amount'
      : undefined;
    await order.save({ session });
    if (full) {
      for (const component of releasableComponents) {
        const claimedBooking = await Booking.findOneAndUpdate(
          {
            bundleOrderId: order._id,
            bundleComponentId: component.componentId,
            inventoryReleasedAt: { $exists: false },
          },
          {
            $set: {
              status: 'cancelled',
              paymentStatus: 'refunded',
              inventoryReleasedAt: new Date(),
            },
          },
          { new: false, session }
        );
        if (!claimedBooking) {
          const alreadyReleased = await Booking.findOne({
            bundleOrderId: order._id,
            bundleComponentId: component.componentId,
            inventoryReleasedAt: { $exists: true },
          }).session(session);
          if (alreadyReleased) continue;
          throw new BundlePaymentError(
            'REFUND_INVENTORY_BINDING_MISSING',
            'Refunded booking inventory could not be verified',
            409
          );
        }
        await releaseBundleInventory({
          attractionId: component.attractionId,
          supplyOfferId: component.supplyOfferId,
          date: component.date,
          time: component.time,
          guests: totalGuests(component.quantities),
          offerCapacity: 1,
        }, session);
      }
    }
    await Booking.updateMany(
      { bundleOrderId: order._id },
      { $set: { settlementStatus: 'pending' } },
      { session }
    );
    const refundLedgerLines: LedgerLine[] = [
      { account: 'cash_collected', direction: 'credit', amountMinor: input.amountMinor },
    ];
    if (full) {
      const reversalLines: LedgerLine[] = [
        ...order.components.flatMap((component, index) =>
          paidSettlementMinorBeforeRefund[index] > 0
            ? []
            : [{
                account: 'supplier_payable' as const,
                direction: 'debit' as const,
                amountMinor: component.supplierNetTotalMinor,
                supplierTenantId: component.supplierTenantId,
                componentId: component.componentId,
              }]
        ),
        { account: 'platform_revenue', direction: 'debit', amountMinor: order.platformAllocationMinor },
        { account: 'payment_fee_reserve', direction: 'debit', amountMinor: order.paymentFeeReserveMinor },
        { account: 'tax_payable', direction: 'debit', amountMinor: order.taxMinor },
      ];
      const reversedMinor = reversalLines.reduce((sum, line) => sum + line.amountMinor, 0);
      refundLedgerLines.push(...reversalLines);
      if (reversedMinor !== input.amountMinor) {
        refundLedgerLines.push({
          account: 'customer_refund',
          direction: reversedMinor > input.amountMinor ? 'credit' : 'debit',
          amountMinor: Math.abs(reversedMinor - input.amountMinor),
        });
      }
    } else {
      refundLedgerLines.push({
        account: 'customer_refund',
        direction: 'debit',
        amountMinor: input.amountMinor,
      });
    }
    await appendBalancedLedger({
      orderId: order._id,
      operationId: `refund:${input.operationId}`,
      storefrontTenantId: order.storefrontTenantId,
      currency: order.currency,
      lines: refundLedgerLines,
    }, session);
    await appendBundleEvent({
      aggregateType: 'order',
      aggregateId: order._id,
      storefrontTenantId: order.storefrontTenantId,
      actorType: 'user',
      actorId: input.actorId,
      command: full ? 'refund_full' : 'refund_partial',
      fromState,
      toState: order.status,
      reason: input.reason,
      correlationId: providerRefund.id,
      metadata: { amountMinor: input.amountMinor, refundedMinor: order.refundedMinor },
    }, session);
    await enqueueBundleOutbox({
      orderId: order._id,
      tenantId: order.storefrontTenantId,
      audience: 'customer',
      eventType: 'bundle.order_refunded',
      payload: { orderId: order._id.toString(), reference: order.reference, amountMinor: input.amountMinor },
    }, session);
    return { order, duplicate: false };
  });
};

export const processPendingBundleRefunds = async (
  limit = 25,
  now = new Date()
): Promise<{ examined: number; reconciled: number; pending: number; failed: number }> => {
  // Repairs the narrow crash window between a terminal provider result and
  // clearing the order-level recovery flag. The predicate cannot clear a real
  // pending refund or a supplier-settlement dispute.
  await BundleOrder.updateMany(
    {
      refundPendingMinor: 0,
      'recovery.required': true,
      'recovery.reason': /^Refund recovery required:/,
      refunds: {
        $not: {
          $elemMatch: { status: { $in: ['requested', 'provider_pending'] } },
        },
      },
      'components.settlementStatus': { $ne: 'disputed' },
    },
    {
      $set: { 'recovery.required': false, 'recovery.lastAttemptAt': now },
      $unset: { 'recovery.reason': '' },
    }
  );
  const rows = await BundleOrder.find({
    refunds: {
      $elemMatch: {
        status: { $in: ['requested', 'provider_pending'] },
        $and: [
          {
            $or: [
              { nextAttemptAt: { $exists: false } },
              { nextAttemptAt: { $lte: now } },
            ],
          },
          {
            $or: [
              { leaseUntil: { $exists: false } },
              { leaseUntil: { $lte: now } },
            ],
          },
        ],
      },
    },
  })
    .select('_id refunds')
    .sort({ 'refunds.nextAttemptAt': 1, _id: 1 })
    .limit(limit)
    .lean();

  const totals = { examined: 0, reconciled: 0, pending: 0, failed: 0 };
  for (const row of rows) {
    for (const refund of row.refunds) {
      if (totals.examined >= limit) return totals;
      if (!['requested', 'provider_pending'].includes(refund.status)) continue;
      if (refund.nextAttemptAt && new Date(refund.nextAttemptAt) > now) continue;
      if (refund.leaseUntil && new Date(refund.leaseUntil) > now) continue;
      totals.examined += 1;
      try {
        await refundBundleOrder({
          orderId: row._id.toString(),
          operationId: refund.operationId,
          amountMinor: refund.amountMinor,
          reason: refund.reason,
          actorId: refund.requestedBy,
        });
        totals.reconciled += 1;
      } catch (error) {
        const code = error instanceof BundlePaymentError ? error.code : '';
        if (code === 'REFUND_FAILED' || code === 'REFUND_OPERATION_FAILED') {
          totals.failed += 1;
        } else {
          totals.pending += 1;
          if (!code) {
            try {
              await scheduleRefundRecovery(
                row._id,
                refund.operationId,
                error instanceof Error ? error.message : 'Unexpected refund recovery failure',
                refund.providerRefundId
              );
            } catch {
              // Keep processing independent operations. The provider lease or
              // due timestamp leaves this operation eligible on a later pass.
            }
          }
        }
      }
    }
  }
  return totals;
};
