import { Types } from 'mongoose';
import { totalGuests } from '../bundles/money';
import { Booking } from '../models/Booking';
import { BundleOrder, IBundleOrder } from '../models/BundleOrder';
import { appendBundleEvent, appendBalancedLedger, enqueueBundleOutbox } from './bundleAudit.service';
import { releaseBundleInventory, runBundleTransaction } from './bundleInventory.service';
import { cancelPaymentIntent, retrievePaymentIntent } from './stripe.service';
import { getTenantStripeConfig } from './tenantPayment.service';
import {
  bundlePaymentBindingError,
  finalizeBundlePayment,
} from './bundlePayment.service';

export class BundleOperationsError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400) {
    super(message);
  }
}

interface CancellationActor {
  actorType: 'user' | 'guest';
  actorId?: Types.ObjectId;
  actorTenantId?: Types.ObjectId;
}

const markBundleManualReview = async (
  orderId: Types.ObjectId | string,
  reason: string,
  actor: CancellationActor | { actorType: 'scheduler' }
): Promise<IBundleOrder> => runBundleTransaction(async (session) => {
  const order = await BundleOrder.findById(orderId).session(session);
  if (!order) throw new BundleOperationsError('ORDER_NOT_FOUND', 'Bundle order not found', 404);
  const fromState = order.status;
  order.status = 'manual_review';
  if (order.paymentStatus !== 'succeeded') order.paymentStatus = 'manual_review';
  order.recovery.required = true;
  order.recovery.reason = reason.slice(0, 500);
  order.recovery.lastAttemptAt = new Date();
  order.recovery.attempts += 1;
  await order.save({ session });
  await appendBundleEvent({
    aggregateType: 'order',
    aggregateId: order._id,
    storefrontTenantId: order.storefrontTenantId,
    ...actor,
    command: 'recovery.manual_review',
    fromState,
    toState: 'manual_review',
    reason,
    metadata: {},
  }, session);
  return order;
});

const releaseUnpaidBundleOrder = async (
  orderId: Types.ObjectId | string,
  reason: string,
  actor: CancellationActor | { actorType: 'scheduler' }
): Promise<IBundleOrder> => runBundleTransaction(async (session) => {
  const order = await BundleOrder.findOne({
    _id: orderId,
    status: { $in: ['reserved', 'payment_pending', 'manual_review'] },
    paymentStatus: { $nin: ['succeeded', 'partially_refunded', 'refunded'] },
  }).session(session);
  if (!order) {
    const existing = await BundleOrder.findById(orderId).session(session);
    if (existing?.status === 'cancelled') return existing;
    throw new BundleOperationsError('ORDER_NOT_CANCELLABLE', 'This bundle order cannot be cancelled without a refund', 409);
  }
  const guests = totalGuests(order.components[0].quantities);
  for (const component of order.components) {
    await releaseBundleInventory({
      attractionId: component.attractionId,
      supplyOfferId: component.supplyOfferId,
      date: component.date,
      time: component.time,
      guests,
      offerCapacity: 1,
    }, session);
    component.status = 'cancelled';
    component.settlementStatus = 'not_eligible';
  }
  const fromState = order.status;
  order.status = 'cancelled';
  order.paymentStatus = 'cancelled';
  order.recovery.required = false;
  order.recovery.reason = undefined;
  await order.save({ session });
  await Booking.updateMany(
    { bundleOrderId: order._id, inventoryReleasedAt: { $exists: false } },
    {
      $set: {
        status: 'cancelled',
        paymentStatus: 'failed',
        inventoryReleasedAt: new Date(),
      },
    },
    { session }
  );
  await appendBundleEvent({
    aggregateType: 'order',
    aggregateId: order._id,
    storefrontTenantId: order.storefrontTenantId,
    ...actor,
    command: 'cancel_unpaid_and_release',
    fromState,
    toState: 'cancelled',
    reason,
    metadata: {},
  }, session);
  await enqueueBundleOutbox({
    orderId: order._id,
    tenantId: order.storefrontTenantId,
    audience: 'customer',
    eventType: 'bundle.order_cancelled',
    payload: { orderId: order._id.toString(), reference: order.reference },
  }, session);
  return order;
});

const requestPaidBundleCancellation = async (
  orderId: Types.ObjectId | string,
  reason: string,
  actor: CancellationActor
): Promise<IBundleOrder> => runBundleTransaction(async (session) => {
  const order = await BundleOrder.findById(orderId).session(session);
  if (!order) throw new BundleOperationsError('ORDER_NOT_FOUND', 'Bundle order not found', 404);
  if (order.status === 'cancel_pending') return order;
  if (!['succeeded', 'partially_refunded'].includes(order.paymentStatus)) {
    throw new BundleOperationsError('PAID_ORDER_REQUIRED', 'A paid cancellation request requires a verified payment', 409);
  }
  if (!['confirmed', 'in_progress', 'completed', 'manual_review'].includes(order.status)) {
    throw new BundleOperationsError('ORDER_NOT_CANCELLABLE', 'This order cannot enter cancellation review', 409);
  }
  const fromState = order.status;
  order.status = 'cancel_pending';
  for (const component of order.components) {
    if (['confirmed', 'reserved'].includes(component.status)) component.status = 'cancel_pending';
    if (component.settlementStatus === 'paid') component.settlementStatus = 'disputed';
    else if (component.settlementStatus !== 'disputed') component.settlementStatus = 'on_hold';
  }
  order.recovery.required = true;
  order.recovery.reason = `Cancellation review: ${reason}`.slice(0, 500);
  await order.save({ session });
  await appendBundleEvent({
    aggregateType: 'order',
    aggregateId: order._id,
    storefrontTenantId: order.storefrontTenantId,
    ...actor,
    command: 'request_paid_cancellation',
    fromState,
    toState: 'cancel_pending',
    reason,
    metadata: { remainingRefundableMinor: order.totalMinor - order.refundedMinor },
  }, session);
  await enqueueBundleOutbox({
    orderId: order._id,
    tenantId: order.storefrontTenantId,
    audience: 'storefront',
    eventType: 'bundle.cancellation_requested',
    payload: { orderId: order._id.toString(), reference: order.reference },
  }, session);
  for (const supplierTenantId of new Set(
    order.components.map((component) => component.supplierTenantId.toString())
  )) {
    await enqueueBundleOutbox({
      orderId: order._id,
      tenantId: new Types.ObjectId(supplierTenantId),
      audience: 'supplier',
      eventType: 'bundle.cancellation_requested',
      payload: { orderId: order._id.toString(), reference: order.reference },
    }, session);
  }
  return order;
});

export const cancelBundleOrder = async (input: {
  orderId: string;
  reason: string;
  actor: CancellationActor;
}): Promise<IBundleOrder> => {
  const order = await BundleOrder.findById(input.orderId);
  if (!order) throw new BundleOperationsError('ORDER_NOT_FOUND', 'Bundle order not found', 404);
  if (['cancelled', 'refunded'].includes(order.status)) return order;
  if (['succeeded', 'partially_refunded', 'refunded'].includes(order.paymentStatus)) {
    return requestPaidBundleCancellation(order._id, input.reason, input.actor);
  }
  if (!['reserved', 'payment_pending', 'manual_review'].includes(order.status)) {
    throw new BundleOperationsError('ORDER_NOT_CANCELLABLE', 'This bundle order cannot be cancelled', 409);
  }
  if (!order.stripePaymentIntentId) {
    return releaseUnpaidBundleOrder(order._id, input.reason, input.actor);
  }
  const config = await getTenantStripeConfig(order.storefrontTenantId);
  if (!config?.enabled || !config.secretKey) {
    return markBundleManualReview(
      order._id,
      'Payment gateway unavailable during cancellation',
      input.actor
    );
  }
  const intent = await retrievePaymentIntent(config.secretKey, order.stripePaymentIntentId);
  if (!intent || bundlePaymentBindingError(order, intent, false)) {
    return markBundleManualReview(
      order._id,
      'Payment state could not be bound during cancellation',
      input.actor
    );
  }
  if (intent.status === 'succeeded') {
    const finalized = await finalizeBundlePayment(order._id.toString(), intent, 'user');
    return requestPaidBundleCancellation(finalized.order._id, input.reason, input.actor);
  }
  if (intent.status !== 'canceled') {
    const cancellation = await cancelPaymentIntent(
      config.secretKey,
      order.stripePaymentIntentId,
      { idempotencyKey: `bundle:${order._id}:cancel` }
    );
    if (
      !cancellation ||
      cancellation.status !== 'canceled' ||
      bundlePaymentBindingError(order, cancellation, false)
    ) {
      return markBundleManualReview(
        order._id,
        'Payment intent could not be safely cancelled',
        input.actor
      );
    }
  }
  return releaseUnpaidBundleOrder(order._id, input.reason, input.actor);
};

export const recoverBundleOrder = async (input: {
  orderId: string;
  reason: string;
  actorId: Types.ObjectId;
}): Promise<{ order: IBundleOrder; outcome: 'confirmed' | 'cancelled' | 'pending' }> => {
  const order = await BundleOrder.findById(input.orderId);
  if (!order) throw new BundleOperationsError('ORDER_NOT_FOUND', 'Bundle order not found', 404);
  if (['confirmed', 'in_progress', 'completed'].includes(order.status)) {
    return { order, outcome: 'confirmed' };
  }
  if (['cancelled', 'refunded'].includes(order.status)) {
    return { order, outcome: 'cancelled' };
  }
  if (!order.stripePaymentIntentId) {
    if (order.holdExpiresAt <= new Date()) {
      const cancelled = await releaseUnpaidBundleOrder(
        order._id,
        input.reason,
        { actorType: 'user', actorId: input.actorId }
      );
      return { order: cancelled, outcome: 'cancelled' };
    }
    const pending = await markBundleManualReview(
      order._id,
      'No payment session exists; hold remains active',
      { actorType: 'user', actorId: input.actorId }
    );
    return { order: pending, outcome: 'pending' };
  }
  const config = await getTenantStripeConfig(order.storefrontTenantId);
  if (!config?.enabled || !config.secretKey) {
    const pending = await markBundleManualReview(
      order._id,
      'Payment gateway unavailable during recovery',
      { actorType: 'user', actorId: input.actorId }
    );
    return { order: pending, outcome: 'pending' };
  }
  const intent = await retrievePaymentIntent(config.secretKey, order.stripePaymentIntentId);
  if (!intent || bundlePaymentBindingError(order, intent, false)) {
    const pending = await markBundleManualReview(
      order._id,
      'Provider payment evidence could not be bound during recovery',
      { actorType: 'user', actorId: input.actorId }
    );
    return { order: pending, outcome: 'pending' };
  }
  if (intent.status === 'succeeded') {
    const finalized = await finalizeBundlePayment(order._id.toString(), intent, 'user');
    return { order: finalized.order, outcome: 'confirmed' };
  }
  if (intent.status === 'canceled' || order.holdExpiresAt <= new Date()) {
    const cancelled = await cancelBundleOrder({
      orderId: order._id.toString(),
      reason: input.reason,
      actor: { actorType: 'user', actorId: input.actorId },
    });
    return { order: cancelled, outcome: 'cancelled' };
  }
  const pending = await markBundleManualReview(
    order._id,
    `Provider payment remains ${intent.status}`,
    { actorType: 'user', actorId: input.actorId }
  );
  return { order: pending, outcome: 'pending' };
};

export const expireBundleOrder = async (
  orderId: Types.ObjectId | string
): Promise<'expired' | 'paid' | 'ignored' | 'manual_review'> => {
  const snapshot = await BundleOrder.findById(orderId);
  if (!snapshot || !['reserved', 'payment_pending'].includes(snapshot.status)) return 'ignored';
  if (snapshot.holdExpiresAt > new Date()) return 'ignored';

  if (snapshot.stripePaymentIntentId) {
    const config = await getTenantStripeConfig(snapshot.storefrontTenantId);
    if (!config?.enabled || !config.secretKey) {
      await BundleOrder.updateOne(
        { _id: snapshot._id, status: { $in: ['reserved', 'payment_pending'] } },
        {
          $set: {
            status: 'manual_review',
            paymentStatus: 'manual_review',
            'recovery.required': true,
            'recovery.reason': 'Payment gateway unavailable during hold expiry',
          },
          $inc: { 'recovery.attempts': 1 },
        }
      );
      return 'manual_review';
    }
    const intent = await retrievePaymentIntent(config.secretKey, snapshot.stripePaymentIntentId);
    if (!intent) {
      await BundleOrder.updateOne(
        { _id: snapshot._id, status: { $in: ['reserved', 'payment_pending'] } },
        {
          $set: {
            status: 'manual_review',
            paymentStatus: 'manual_review',
            'recovery.required': true,
            'recovery.reason': 'Payment intent unavailable during hold expiry',
          },
          $inc: { 'recovery.attempts': 1 },
        }
      );
      return 'manual_review';
    }
    if (intent.status === 'succeeded') {
      await finalizeBundlePayment(snapshot._id.toString(), intent, 'stripe');
      return 'paid';
    }
    const cancellation = await cancelPaymentIntent(
      config.secretKey,
      snapshot.stripePaymentIntentId,
      { idempotencyKey: `bundle:${snapshot._id}:expire` }
    );
    if (!cancellation || cancellation.status !== 'canceled') {
      await BundleOrder.updateOne(
        { _id: snapshot._id, status: { $in: ['reserved', 'payment_pending'] } },
        {
          $set: {
            status: 'manual_review',
            paymentStatus: 'manual_review',
            'recovery.required': true,
            'recovery.reason': `Payment intent could not be cancelled (${cancellation?.status || 'unknown'})`,
          },
          $inc: { 'recovery.attempts': 1 },
        }
      );
      return 'manual_review';
    }
  }

  return runBundleTransaction(async (session) => {
    const order = await BundleOrder.findOne({
      _id: snapshot._id,
      status: { $in: ['reserved', 'payment_pending'] },
      holdExpiresAt: { $lte: new Date() },
    }).session(session);
    if (!order) return 'ignored' as const;
    const guests = totalGuests(order.components[0].quantities);
    for (const component of order.components) {
      await releaseBundleInventory({
        attractionId: component.attractionId,
        supplyOfferId: component.supplyOfferId,
        date: component.date,
        time: component.time,
        guests,
        offerCapacity: 1,
      }, session);
      component.status = 'cancelled';
    }
    const fromState = order.status;
    order.status = 'cancelled';
    order.paymentStatus = 'expired';
    await order.save({ session });
    await Booking.updateMany(
      { bundleOrderId: order._id, inventoryReleasedAt: { $exists: false } },
      {
        $set: {
          status: 'cancelled',
          paymentStatus: 'failed',
          inventoryReleasedAt: new Date(),
        },
      },
      { session }
    );
    await appendBundleEvent({
      aggregateType: 'order',
      aggregateId: order._id,
      storefrontTenantId: order.storefrontTenantId,
      actorType: 'scheduler',
      command: 'expire_hold',
      fromState,
      toState: 'cancelled',
      metadata: {},
    }, session);
    return 'expired' as const;
  });
};

export const expireStaleBundleOrders = async (limit = 50): Promise<{
  expired: number;
  paid: number;
  manualReview: number;
}> => {
  const rows = await BundleOrder.find({
    status: { $in: ['reserved', 'payment_pending'] },
    holdExpiresAt: { $lte: new Date() },
  }).select('_id').sort({ holdExpiresAt: 1 }).limit(limit).lean();
  const totals = { expired: 0, paid: 0, manualReview: 0 };
  for (const row of rows) {
    const result = await expireBundleOrder(row._id);
    if (result === 'expired') totals.expired += 1;
    if (result === 'paid') totals.paid += 1;
    if (result === 'manual_review') totals.manualReview += 1;
  }
  return totals;
};

export const fulfilBundleComponent = async (input: {
  orderId: string;
  componentId: string;
  supplierTenantId: string;
  actorId: Types.ObjectId;
}): Promise<IBundleOrder> => runBundleTransaction(async (session) => {
  const order = await BundleOrder.findOne({
    _id: input.orderId,
    'components.componentId': input.componentId,
    'components.supplierTenantId': input.supplierTenantId,
  }).session(session);
  if (!order) throw new BundleOperationsError('COMPONENT_NOT_FOUND', 'Bundle component not found', 404);
  const component = order.components.find(
    (item) => item.componentId === input.componentId &&
      item.supplierTenantId.toString() === input.supplierTenantId
  );
  if (!component) throw new BundleOperationsError('COMPONENT_NOT_FOUND', 'Bundle component not found', 404);
  if (component.status === 'fulfilled') return order;
  if (component.status !== 'confirmed') {
    throw new BundleOperationsError('COMPONENT_NOT_FULFILLABLE', 'Only a confirmed component can be fulfilled', 409);
  }
  component.status = 'fulfilled';
  const allFulfilled = order.components.every((item) => item.status === 'fulfilled');
  if (allFulfilled) order.status = 'completed';
  else if (order.status === 'confirmed') order.status = 'in_progress';
  await order.save({ session });
  await Booking.updateOne(
    { bundleOrderId: order._id, bundleComponentId: component.componentId },
    { $set: { status: 'completed' } },
    { session }
  );
  await appendBundleEvent({
    aggregateType: 'component',
    aggregateId: order._id,
    storefrontTenantId: order.storefrontTenantId,
    supplierTenantId: component.supplierTenantId,
    actorType: 'user',
    actorId: input.actorId,
    actorTenantId: component.supplierTenantId,
    command: 'fulfil',
    fromState: 'confirmed',
    toState: 'fulfilled',
    metadata: { componentId: component.componentId },
  }, session);
  if (allFulfilled) {
    await enqueueBundleOutbox({
      orderId: order._id,
      tenantId: order.storefrontTenantId,
      audience: 'customer',
      eventType: 'bundle.order_completed',
      payload: { orderId: order._id.toString(), reference: order.reference },
    }, session);
  }
  return order;
});

export const releaseBundleSettlement = async (input: {
  orderId: string;
  componentId: string;
  actorId: Types.ObjectId;
}): Promise<IBundleOrder> => runBundleTransaction(async (session) => {
  const order = await BundleOrder.findById(input.orderId).session(session);
  if (!order) throw new BundleOperationsError('ORDER_NOT_FOUND', 'Bundle order not found', 404);
  const component = order.components.find((item) => item.componentId === input.componentId);
  if (!component) throw new BundleOperationsError('COMPONENT_NOT_FOUND', 'Bundle component not found', 404);
  if (order.status !== 'completed' || component.status !== 'fulfilled') {
    throw new BundleOperationsError('SETTLEMENT_NOT_ELIGIBLE', 'Fulfilment must be complete before settlement', 409);
  }
  if (component.settlementStatus === 'payable') return order;
  if (component.settlementStatus !== 'on_hold') {
    throw new BundleOperationsError('SETTLEMENT_STATE_INVALID', 'Settlement cannot be released from its current state', 409);
  }
  component.settlementStatus = 'payable';
  await order.save({ session });
  await appendBundleEvent({
    aggregateType: 'settlement',
    aggregateId: order._id,
    storefrontTenantId: order.storefrontTenantId,
    supplierTenantId: component.supplierTenantId,
    actorType: 'user',
    actorId: input.actorId,
    command: 'release_payable',
    fromState: 'on_hold',
    toState: 'payable',
    metadata: { componentId: component.componentId, amountMinor: component.supplierNetTotalMinor },
  }, session);
  return order;
});

export const markBundleSettlementPaid = async (input: {
  orderId: string;
  componentId: string;
  operationId: string;
  actorId: Types.ObjectId;
}): Promise<IBundleOrder> => runBundleTransaction(async (session) => {
  const order = await BundleOrder.findById(input.orderId).session(session);
  if (!order) throw new BundleOperationsError('ORDER_NOT_FOUND', 'Bundle order not found', 404);
  const component = order.components.find((item) => item.componentId === input.componentId);
  if (!component) throw new BundleOperationsError('COMPONENT_NOT_FOUND', 'Bundle component not found', 404);
  if (component.settlementStatus === 'paid') return order;
  if (component.settlementStatus !== 'payable') {
    throw new BundleOperationsError('SETTLEMENT_NOT_PAYABLE', 'Settlement is not payable', 409);
  }
  component.settlementStatus = 'paid';
  await order.save({ session });
  await Booking.updateOne(
    { bundleOrderId: order._id, bundleComponentId: component.componentId },
    { $set: { settlementStatus: 'settled', settledAt: new Date() } },
    { session }
  );
  await appendBalancedLedger({
    orderId: order._id,
    operationId: `settlement:${input.operationId}`,
    storefrontTenantId: order.storefrontTenantId,
    currency: order.currency,
    lines: [
      {
        account: 'supplier_payable',
        direction: 'debit',
        amountMinor: component.supplierNetTotalMinor,
        supplierTenantId: component.supplierTenantId,
        componentId: component.componentId,
      },
      {
        account: 'supplier_settlement',
        direction: 'credit',
        amountMinor: component.supplierNetTotalMinor,
        supplierTenantId: component.supplierTenantId,
        componentId: component.componentId,
      },
    ],
  }, session);
  await appendBundleEvent({
    aggregateType: 'settlement',
    aggregateId: order._id,
    storefrontTenantId: order.storefrontTenantId,
    supplierTenantId: component.supplierTenantId,
    actorType: 'user',
    actorId: input.actorId,
    command: 'mark_paid',
    fromState: 'payable',
    toState: 'paid',
    correlationId: input.operationId,
    metadata: { componentId: component.componentId, amountMinor: component.supplierNetTotalMinor },
  }, session);
  return order;
});
