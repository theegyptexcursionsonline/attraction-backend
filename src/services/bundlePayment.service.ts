import { Types } from 'mongoose';
import { assertTransition } from '../bundles/domain';
import { allocateProportionally } from '../bundles/money';
import { Booking } from '../models/Booking';
import { BundleOrder, IBundleOrder } from '../models/BundleOrder';
import { BundleProviderEvent } from '../models/BundleProviderEvent';
import {
  createPaymentIntent,
  createRefund,
  PaymentIntentResult,
  retrievePaymentIntent,
  retrieveRefund,
} from './stripe.service';
import { getTenantStripeConfig } from './tenantPayment.service';
import {
  appendBalancedLedger,
  appendBundleEvent,
  enqueueBundleOutbox,
  LedgerLine,
} from './bundleAudit.service';
import { runBundleTransaction } from './bundleInventory.service';

export class BundlePaymentError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400) {
    super(message);
  }
}

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
  if (requireSucceeded && (intent.status !== 'succeeded' || intent.amountReceived < order.totalMinor)) {
    return 'Payment has not been fully received';
  }
  return null;
};

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
  const intent = await createPaymentIntent(
    config.secretKey,
    order.totalMinor,
    order.currency,
    {
      paymentKind: 'bundle',
      bundleOrderId: order._id.toString(),
      storefrontTenantId: order.storefrontTenantId.toString(),
      orderReference: order.reference,
    },
    { idempotencyKey: `bundle:${order._id}:intent:v1` }
  );
  const bindingOrder = order.stripePaymentIntentId
    ? order
    : await BundleOrder.findOneAndUpdate(
        {
          _id: order._id,
          storefrontTenantId: order.storefrontTenantId,
          status: 'reserved',
          paymentStatus: 'not_started',
          stripePaymentIntentId: { $exists: false },
        },
        {
          $set: {
            stripePaymentIntentId: intent.id,
            status: 'payment_pending',
            paymentStatus: 'intent_created',
          },
        },
        { new: true }
      );
  if (!bindingOrder || bindingOrder.stripePaymentIntentId !== intent.id) {
    throw new BundlePaymentError('PAYMENT_SESSION_CONFLICT', 'A different payment session is already bound to this order', 409);
  }
  const bindingError = bundlePaymentBindingError(bindingOrder, intent, false);
  if (bindingError) throw new BundlePaymentError('PAYMENT_BINDING_INVALID', bindingError, 409);
  if (order.status === 'reserved') {
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
}): Promise<{ duplicate: boolean; recordId?: Types.ObjectId }> => {
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
  if (existing.status === 'processing' && existing.leaseUntil > new Date()) return { duplicate: true };
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
  return reclaimed ? { duplicate: false, recordId: reclaimed._id } : { duplicate: true };
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

export const refundBundleOrder = async (input: {
  orderId: string;
  operationId: string;
  amountMinor: number;
  reason: string;
  actorId: Types.ObjectId;
}): Promise<{ order: IBundleOrder; duplicate: boolean }> => {
  let order = await BundleOrder.findById(input.orderId);
  if (!order) throw new BundlePaymentError('ORDER_NOT_FOUND', 'Bundle order not found', 404);
  const prior = order.refunds.find((refund) => refund.operationId === input.operationId);
  if (prior) {
    if (prior.amountMinor !== input.amountMinor || prior.reason !== input.reason) {
      throw new BundlePaymentError('REFUND_OPERATION_REUSED', 'This refund operation was used with different data', 409);
    }
    if (prior.status === 'succeeded') return { order, duplicate: true };
    if (prior.status === 'failed') {
      throw new BundlePaymentError('REFUND_OPERATION_FAILED', 'This refund operation was rejected; start a new operation', 409);
    }
  } else {
    const reserved = await BundleOrder.findOneAndUpdate(
      {
        _id: order._id,
        'refunds.operationId': { $ne: input.operationId },
        $expr: {
          $lte: [
            { $add: ['$refundedMinor', '$refundPendingMinor', input.amountMinor] },
            '$totalMinor',
          ],
        },
      },
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
  if (!order.stripePaymentIntentId || order.paymentStatus === 'failed') {
    throw new BundlePaymentError('ORDER_NOT_REFUNDABLE', 'This order has no refundable payment', 409);
  }
  const config = await getTenantStripeConfig(order.storefrontTenantId);
  if (!config?.enabled || !config.secretKey) {
    throw new BundlePaymentError('PAYMENT_GATEWAY_UNAVAILABLE', 'Refund provider is unavailable', 503);
  }
  const currentRefund = order.refunds.find((item) => item.operationId === input.operationId)!;
  const providerRefund = currentRefund.providerRefundId
    ? await retrieveRefund(config.secretKey, currentRefund.providerRefundId)
    : await createRefund(
        config.secretKey,
        order.stripePaymentIntentId,
        input.amountMinor,
        {
          idempotencyKey: `bundle-refund:${order._id}:${input.operationId}`,
          allowPending: true,
        }
      );
  if (!providerRefund || providerRefund.amount !== input.amountMinor) {
    throw new BundlePaymentError('REFUND_PROVIDER_UNCERTAIN', 'Refund status could not be verified; retry this operation', 409);
  }
  if (providerRefund.status === 'failed' || providerRefund.status === 'canceled') {
    await BundleOrder.updateOne(
      {
        _id: order._id,
        refundPendingMinor: { $gte: input.amountMinor },
        refunds: {
          $elemMatch: {
            operationId: input.operationId,
            status: { $in: ['requested', 'provider_pending'] },
          },
        },
      },
      {
        $inc: { refundPendingMinor: -input.amountMinor },
        $set: {
          'refunds.$.providerRefundId': providerRefund.id,
          'refunds.$.status': 'failed',
        },
      }
    );
    throw new BundlePaymentError('REFUND_FAILED', 'The payment provider rejected this refund', 409);
  }
  if (providerRefund.status !== 'succeeded') {
    await BundleOrder.updateOne(
      { _id: order._id, 'refunds.operationId': input.operationId },
      {
        $set: {
          'refunds.$.providerRefundId': providerRefund.id,
          'refunds.$.status': 'provider_pending',
        },
      }
    );
    throw new BundlePaymentError('REFUND_PENDING', 'The refund is processing; retry the same operation to reconcile it', 409);
  }
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
    order.components.forEach((component, index) => {
      component.refundedMinor += componentAllocations[index];
      component.settlementStatus = component.settlementStatus === 'paid' ? 'disputed' : 'on_hold';
      component.status = component.refundedMinor >= component.customerAllocationMinor
        ? 'refunded'
        : 'partially_refunded';
    });
    refund.providerRefundId = providerRefund.id;
    refund.status = 'succeeded';
    order.refundPendingMinor -= input.amountMinor;
    order.refundedMinor += input.amountMinor;
    const full = order.refundedMinor === order.totalMinor;
    order.paymentStatus = full ? 'refunded' : 'partially_refunded';
    order.status = full ? 'refunded' : 'partially_refunded';
    await order.save({ session });
    await Booking.updateMany(
      { bundleOrderId: order._id },
      { $set: { settlementStatus: 'pending' } },
      { session }
    );
    await appendBalancedLedger({
      orderId: order._id,
      operationId: `refund:${input.operationId}`,
      storefrontTenantId: order.storefrontTenantId,
      currency: order.currency,
      lines: [
        { account: 'customer_refund', direction: 'debit', amountMinor: input.amountMinor },
        { account: 'cash_collected', direction: 'credit', amountMinor: input.amountMinor },
      ],
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
