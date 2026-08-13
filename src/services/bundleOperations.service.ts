import { Types } from 'mongoose';
import { totalGuests } from '../bundles/money';
import { Booking } from '../models/Booking';
import { BundleOrder, IBundleOrder } from '../models/BundleOrder';
import { appendBundleEvent, appendBalancedLedger, enqueueBundleOutbox } from './bundleAudit.service';
import { releaseBundleInventory, runBundleTransaction } from './bundleInventory.service';
import { cancelPaymentIntent, createPaymentIntent, retrievePaymentIntent } from './stripe.service';
import type { PaymentIntentResult } from './stripe.service';
import { getTenantStripeConfig } from './tenantPayment.service';
import {
  bundlePaymentBindingError,
  bundlePaymentIntentIdempotencyKey,
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
  let snapshot = await BundleOrder.findById(orderId);
  if (!snapshot || !['reserved', 'payment_pending'].includes(snapshot.status)) return 'ignored';
  if (snapshot.holdExpiresAt > new Date()) return 'ignored';
  const snapshotId = snapshot._id;

  const flagManualReview = async (reason: string): Promise<'manual_review'> => {
    await BundleOrder.updateOne(
      { _id: snapshotId, status: { $in: ['reserved', 'payment_pending'] } },
      {
        $set: {
          status: 'manual_review',
          paymentStatus: 'manual_review',
          'recovery.required': true,
          'recovery.reason': reason,
        },
        $unset: { paymentSessionClaimedAt: '' },
        $inc: { 'recovery.attempts': 1 },
      }
    );
    return 'manual_review';
  };

  let reconciledIntent: PaymentIntentResult | undefined;
  if (snapshot.stripePaymentIntentId || snapshot.paymentSessionClaimedAt) {
    const config = await getTenantStripeConfig(snapshot.storefrontTenantId);
    if (!config?.enabled || !config.secretKey || !snapshot.checkoutMode) {
      return flagManualReview('Payment gateway unavailable during hold expiry');
    }

    if (!snapshot.stripePaymentIntentId && snapshot.paymentSessionClaimedAt) {
      // A request may have crossed into Stripe but crashed before binding the
      // provider ID. Reissuing the exact idempotent call returns that same
      // intent (or creates one we immediately reconcile and cancel).
      reconciledIntent = await createPaymentIntent(
        config.secretKey,
        snapshot.totalMinor,
        snapshot.currency,
        {
          paymentKind: 'bundle',
          bundleOrderId: snapshot._id.toString(),
          storefrontTenantId: snapshot.storefrontTenantId.toString(),
          orderReference: snapshot.reference,
          checkoutMode: snapshot.checkoutMode,
        },
        { idempotencyKey: bundlePaymentIntentIdempotencyKey(snapshot._id) }
      );
      await BundleOrder.updateOne(
        {
          _id: snapshot._id,
          status: { $in: ['reserved', 'payment_pending'] },
          stripePaymentIntentId: { $exists: false },
        },
        {
          $set: {
            stripePaymentIntentId: reconciledIntent.id,
            status: 'payment_pending',
            paymentStatus: 'intent_created',
          },
          $unset: { paymentSessionClaimedAt: '' },
        }
      );
      snapshot = await BundleOrder.findById(snapshot._id);
      if (!snapshot || snapshot.stripePaymentIntentId !== reconciledIntent.id) {
        return flagManualReview('Payment intent could not be bound during hold expiry');
      }
    }

    const intent = reconciledIntent || await retrievePaymentIntent(
      config.secretKey,
      snapshot.stripePaymentIntentId!
    );
    if (!intent) return flagManualReview('Payment intent unavailable during hold expiry');
    const bindingError = bundlePaymentBindingError(snapshot, intent, false);
    if (bindingError) return flagManualReview(bindingError);
    if (intent.status === 'succeeded') {
      await finalizeBundlePayment(snapshot._id.toString(), intent, 'stripe');
      return 'paid';
    }
    const cancellation = await cancelPaymentIntent(
      config.secretKey,
      intent.id,
      { idempotencyKey: `bundle:${snapshot._id}:expire` }
    );
    if (!cancellation || cancellation.status !== 'canceled') {
      return flagManualReview(
        `Payment intent could not be cancelled (${cancellation?.status || 'unknown'})`
      );
    }
  }

  return runBundleTransaction(async (session) => {
    const order = await BundleOrder.findOne({
      _id: snapshot._id,
      status: { $in: ['reserved', 'payment_pending'] },
      holdExpiresAt: { $lte: new Date() },
      paymentSessionClaimedAt: { $exists: false },
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
  if (component.status !== 'confirmed' || component.refundStatus === 'full' || order.status === 'refunded') {
    throw new BundleOperationsError('COMPONENT_NOT_FULFILLABLE', 'Only a confirmed component can be fulfilled', 409);
  }
  component.status = 'fulfilled';
  const allResolved = order.components.every((item) =>
    item.status === 'fulfilled' || item.refundStatus === 'full'
  );
  if (allResolved && order.refundedMinor === 0) order.status = 'completed';
  else if (allResolved && order.refundedMinor > 0) order.status = 'partially_refunded';
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
  if (allResolved) {
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
  if (
    !['completed', 'partially_refunded'].includes(order.status) ||
    component.status !== 'fulfilled' ||
    component.refundStatus === 'full'
  ) {
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
  if (component.settlementStatus === 'paid') {
    if (component.settlementOperationId === input.operationId) return order;
    throw new BundleOperationsError(
      'SETTLEMENT_OPERATION_CONFLICT',
      'This component was settled by a different payout operation',
      409
    );
  }
  if (component.settlementStatus !== 'payable') {
    throw new BundleOperationsError('SETTLEMENT_NOT_PAYABLE', 'Settlement is not payable', 409);
  }
  const reusedOperation = await BundleOrder.findOne({
    'components.settlementOperationId': input.operationId,
  }).session(session);
  if (reusedOperation) {
    throw new BundleOperationsError(
      'SETTLEMENT_OPERATION_REUSED',
      'This payout operation is already bound to another component',
      409
    );
  }
  component.settlementStatus = 'paid';
  component.settlementOperationId = input.operationId;
  component.settlementPaidMinor = component.supplierNetTotalMinor;
  component.settlementDisputedMinor = 0;
  component.settlementRecoveredMinor = 0;
  component.settlementWrittenOffMinor = 0;
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

export const resolveBundleSettlementDispute = async (input: {
  orderId: string;
  componentId: string;
  operationId: string;
  resolution: 'recovered' | 'written_off';
  reason: string;
  actorId: Types.ObjectId;
}): Promise<IBundleOrder> => runBundleTransaction(async (session) => {
  const order = await BundleOrder.findById(input.orderId).session(session);
  if (!order) throw new BundleOperationsError('ORDER_NOT_FOUND', 'Bundle order not found', 404);
  const component = order.components.find((item) => item.componentId === input.componentId);
  if (!component) throw new BundleOperationsError('COMPONENT_NOT_FOUND', 'Bundle component not found', 404);
  const priorResolution = (component.settlementDisputeResolutions || []).find(
    (item) => item.operationId === input.operationId
  );
  if (priorResolution) {
    if (priorResolution.resolution === input.resolution) return order;
    throw new BundleOperationsError(
      'SETTLEMENT_DISPUTE_OPERATION_REUSED',
      'This dispute operation is already bound to a different resolution',
      409
    );
  }
  if (component.settlementStatus !== 'disputed') {
    if (
      component.settlementDisputeOperationId === input.operationId &&
      component.settlementDisputeResolution === input.resolution
    ) return order;
    throw new BundleOperationsError(
      'SETTLEMENT_DISPUTE_STATE_INVALID',
      'This component has no unresolved settlement dispute',
      409
    );
  }
  const paidMinor = component.settlementPaidMinor ||
    (component.settlementOperationId || component.settlementStatus === 'disputed'
      ? component.supplierNetTotalMinor
      : 0);
  const resolvedMinor = (component.settlementRecoveredMinor || 0) +
    (component.settlementWrittenOffMinor || 0);
  const proportionalExposure = component.customerAllocationMinor > 0
    ? Math.floor(paidMinor * component.refundedMinor / component.customerAllocationMinor)
    : 0;
  const targetExposureMinor = component.refundStatus === 'full'
    ? paidMinor
    : proportionalExposure;
  const outstandingMinor = component.settlementDisputedMinor ||
    Math.max(0, targetExposureMinor - resolvedMinor);
  if (outstandingMinor <= 0) {
    throw new BundleOperationsError(
      'SETTLEMENT_DISPUTE_AMOUNT_INVALID',
      'This component has no outstanding settlement amount to resolve',
      409
    );
  }
  const reusedOperation = await BundleOrder.findOne({
    $or: [
      { 'components.settlementDisputeOperationId': input.operationId },
      { 'components.settlementDisputeResolutions.operationId': input.operationId },
    ],
  }).session(session);
  if (reusedOperation) {
    throw new BundleOperationsError(
      'SETTLEMENT_DISPUTE_OPERATION_REUSED',
      'This dispute operation is already bound to another component',
      409
    );
  }
  component.settlementDisputedMinor = 0;
  if (input.resolution === 'recovered') {
    component.settlementRecoveredMinor = (component.settlementRecoveredMinor || 0) + outstandingMinor;
  } else {
    component.settlementWrittenOffMinor = (component.settlementWrittenOffMinor || 0) + outstandingMinor;
  }
  component.settlementStatus = component.refundStatus === 'full' ? 'not_eligible' : 'paid';
  component.settlementDisputeOperationId = input.operationId;
  component.settlementDisputeResolution = input.resolution;
  component.settlementDisputeResolutions = component.settlementDisputeResolutions || [];
  component.settlementDisputeResolutions.push({
    operationId: input.operationId,
    resolution: input.resolution,
    amountMinor: outstandingMinor,
    reason: input.reason,
    actorId: input.actorId,
    createdAt: new Date(),
  });
  const unresolved = order.components.some((item) =>
    (item.settlementDisputedMinor || 0) > 0 || item.settlementStatus === 'disputed'
  );
  order.recovery.required = unresolved;
  order.recovery.reason = unresolved
    ? 'A refunded supplier settlement still requires resolution'
    : undefined;
  await order.save({ session });
  if (input.resolution === 'recovered') {
    await appendBalancedLedger({
      orderId: order._id,
      operationId: `settlement-dispute:${input.operationId}`,
      storefrontTenantId: order.storefrontTenantId,
      currency: order.currency,
      lines: [
        {
          account: 'supplier_settlement',
          direction: 'debit',
          amountMinor: outstandingMinor,
          supplierTenantId: component.supplierTenantId,
          componentId: component.componentId,
        },
        {
          account: 'customer_refund',
          direction: 'credit',
          amountMinor: outstandingMinor,
          supplierTenantId: component.supplierTenantId,
          componentId: component.componentId,
        },
      ],
    }, session);
  }
  await appendBundleEvent({
    aggregateType: 'settlement',
    aggregateId: order._id,
    storefrontTenantId: order.storefrontTenantId,
    supplierTenantId: component.supplierTenantId,
    actorType: 'user',
    actorId: input.actorId,
    command: `resolve_dispute_${input.resolution}`,
    fromState: 'disputed',
    toState: component.settlementStatus,
    reason: input.reason,
    correlationId: input.operationId,
    metadata: { componentId: component.componentId, amountMinor: outstandingMinor },
  }, session);
  return order;
});
