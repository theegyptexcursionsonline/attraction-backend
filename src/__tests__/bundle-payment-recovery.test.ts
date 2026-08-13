import { Types } from 'mongoose';
import { Booking } from '../models/Booking';
import { BundleOrder } from '../models/BundleOrder';
import { BundleProviderEvent } from '../models/BundleProviderEvent';
import { releaseBundleInventory } from '../services/bundleInventory.service';
import {
  claimBundleProviderEvent,
  failBundlePayment,
  refundBundleOrder,
} from '../services/bundlePayment.service';
import { retrieveRefund } from '../services/stripe.service';
import { createRefund } from '../services/stripe.service';
import { getTenantStripeConfig } from '../services/tenantPayment.service';
import { appendBalancedLedger } from '../services/bundleAudit.service';
import { resolveBundleSettlementDispute } from '../services/bundleOperations.service';

jest.mock('../models/Booking', () => ({
  Booking: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(),
    updateOne: jest.fn(),
  },
}));
jest.mock('../models/BundleOrder', () => ({
  BundleOrder: {
    findById: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
}));
jest.mock('../models/BundleProviderEvent', () => ({
  BundleProviderEvent: {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
}));
jest.mock('../services/bundleInventory.service', () => ({
  runBundleTransaction: jest.fn(async (work: (session: object) => Promise<unknown>) => work({})),
  releaseBundleInventory: jest.fn(),
}));
jest.mock('../services/bundleAudit.service', () => ({
  appendBalancedLedger: jest.fn(),
  appendBundleEvent: jest.fn(),
  enqueueBundleOutbox: jest.fn(),
}));
jest.mock('../services/stripe.service', () => ({
  createPaymentIntent: jest.fn(),
  createRefund: jest.fn(),
  retrievePaymentIntent: jest.fn(),
  retrieveRefund: jest.fn(),
}));
jest.mock('../services/tenantPayment.service', () => ({
  ...jest.requireActual('../services/tenantPayment.service'),
  getTenantStripeConfig: jest.fn(),
}));

const queryResult = <T>(value: T) => ({ session: jest.fn().mockResolvedValue(value) });

describe('bundle payment recovery contracts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not acknowledge a provider retry while the first processing lease is unfinished', async () => {
    const duplicateError = Object.assign(new Error('duplicate'), { code: 11000 });
    (BundleProviderEvent.create as jest.Mock).mockRejectedValue(duplicateError);
    (BundleProviderEvent.findOne as jest.Mock).mockResolvedValue({
      _id: new Types.ObjectId(),
      status: 'processing',
      leaseUntil: new Date(Date.now() + 60_000),
    });

    await expect(claimBundleProviderEvent({
      eventId: 'evt_inflight',
      eventType: 'payment_intent.succeeded',
      tenantId: new Types.ObjectId(),
    })).resolves.toEqual({ duplicate: false, inFlight: true });

    expect(BundleProviderEvent.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('keeps inventory reserved after a failed card attempt so the same hold can be retried', async () => {
    const order = {
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      checkoutMode: 'test',
      status: 'payment_pending',
      paymentStatus: 'intent_created',
      stripePaymentIntentId: 'pi_retryable',
      save: jest.fn().mockResolvedValue(undefined),
    };
    (BundleOrder.findById as jest.Mock).mockReturnValue(queryResult(order));
    (Booking.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 3 });

    const result = await failBundlePayment(order._id.toString(), 'pi_retryable', 'card_declined');

    expect(result.order.status).toBe('payment_pending');
    expect(result.order.paymentStatus).toBe('failed');
    expect(releaseBundleInventory).not.toHaveBeenCalled();
    expect(order.save).toHaveBeenCalled();
  });

  it('reconciles a pending refund by provider id without creating or reserving a second operation', async () => {
    const operationId = 'refund:stable-operation-001';
    const order = {
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      checkoutMode: 'test',
      stripePaymentIntentId: 'pi_refund',
      paymentStatus: 'succeeded',
      totalMinor: 20_000,
      refundedMinor: 0,
      refundPendingMinor: 5_000,
      refunds: [{
        operationId,
        providerRefundId: 're_pending',
        amountMinor: 5_000,
        status: 'provider_pending',
        reason: 'Customer request',
      }],
    };
    (BundleOrder.findById as jest.Mock).mockResolvedValue(order);
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true, publishableKey: 'pk_test_public', secretKey: 'sk_test_secret' });
    (retrieveRefund as jest.Mock).mockResolvedValue({ id: 're_pending', status: 'pending', amount: 5_000 });
    (BundleOrder.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await expect(refundBundleOrder({
      orderId: order._id.toString(),
      operationId,
      amountMinor: 5_000,
      reason: 'Customer request',
      actorId: new Types.ObjectId(),
    })).rejects.toEqual(expect.objectContaining({ code: 'REFUND_PENDING' }));

    expect(BundleOrder.findOneAndUpdate).not.toHaveBeenCalled();
    expect(retrieveRefund).toHaveBeenCalledWith('sk_test_secret', 're_pending');
    expect(BundleOrder.updateOne).toHaveBeenCalledWith(
      { _id: order._id, 'refunds.operationId': operationId },
      { $set: { 'refunds.$.providerRefundId': 're_pending', 'refunds.$.status': 'provider_pending' } }
    );
  });

  it('releases a failed refund reservation only while that operation is still pending', async () => {
    const operationId = 'refund:stable-operation-002';
    const order = {
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      checkoutMode: 'test',
      stripePaymentIntentId: 'pi_failed_refund',
      paymentStatus: 'succeeded',
      totalMinor: 20_000,
      refundedMinor: 0,
      refundPendingMinor: 5_000,
      refunds: [{
        operationId,
        providerRefundId: 're_failed',
        amountMinor: 5_000,
        status: 'provider_pending',
        reason: 'Customer request',
      }],
    };
    (BundleOrder.findById as jest.Mock).mockResolvedValue(order);
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true, publishableKey: 'pk_test_public', secretKey: 'sk_test_secret' });
    (retrieveRefund as jest.Mock).mockResolvedValue({ id: 're_failed', status: 'failed', amount: 5_000 });
    (BundleOrder.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await expect(refundBundleOrder({
      orderId: order._id.toString(),
      operationId,
      amountMinor: 5_000,
      reason: 'Customer request',
      actorId: new Types.ObjectId(),
    })).rejects.toEqual(expect.objectContaining({ code: 'REFUND_FAILED' }));

    expect(BundleOrder.updateOne).toHaveBeenCalledWith(
      {
        _id: order._id,
        refundPendingMinor: { $gte: 5_000 },
        refunds: {
          $elemMatch: {
            operationId,
            status: { $in: ['requested', 'provider_pending'] },
          },
        },
      },
      {
        $inc: { refundPendingMinor: -5_000 },
        $set: {
          'refunds.$.providerRefundId': 're_failed',
          'refunds.$.status': 'failed',
        },
      }
    );
  });

  it('keeps fulfilment independent from a partial refund so remaining service can complete', async () => {
    const operationId = 'refund:partial-service-001';
    const order = {
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      checkoutMode: 'test',
      stripePaymentIntentId: 'pi_partial_service',
      status: 'confirmed',
      paymentStatus: 'succeeded',
      currency: 'USD',
      totalMinor: 20_000,
      platformAllocationMinor: 2_000,
      paymentFeeReserveMinor: 1_000,
      taxMinor: 1_000,
      refundedMinor: 0,
      refundPendingMinor: 5_000,
      recovery: { required: false, attempts: 0 },
      components: [
        {
          componentId: 'still-confirmed',
          customerAllocationMinor: 10_000,
          supplierNetTotalMinor: 8_000,
          supplierTenantId: new Types.ObjectId(),
          refundedMinor: 0,
          refundStatus: 'none',
          status: 'confirmed',
          settlementStatus: 'on_hold',
        },
        {
          componentId: 'already-fulfilled',
          customerAllocationMinor: 10_000,
          supplierNetTotalMinor: 8_000,
          supplierTenantId: new Types.ObjectId(),
          refundedMinor: 0,
          refundStatus: 'none',
          status: 'fulfilled',
          settlementStatus: 'on_hold',
        },
      ],
      refunds: [{
        operationId,
        amountMinor: 5_000,
        status: 'requested',
        reason: 'Approved partial adjustment',
      }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    (BundleOrder.findById as jest.Mock)
      .mockResolvedValueOnce(order)
      .mockReturnValueOnce(queryResult(order));
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({
      enabled: true,
      publishableKey: 'pk_test_public',
      secretKey: 'sk_test_secret',
    });
    (createRefund as jest.Mock).mockResolvedValue({ id: 're_partial', status: 'succeeded', amount: 5_000 });
    (Booking.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 2 });

    const result = await refundBundleOrder({
      orderId: order._id.toString(),
      operationId,
      amountMinor: 5_000,
      reason: 'Approved partial adjustment',
      actorId: new Types.ObjectId(),
    });

    expect(result.order.status).toBe('partially_refunded');
    expect(result.order.components[0]).toEqual(expect.objectContaining({
      status: 'confirmed',
      refundStatus: 'partial',
      refundedMinor: 2_500,
    }));
    expect(result.order.components[1]).toEqual(expect.objectContaining({
      status: 'fulfilled',
      refundStatus: 'partial',
      refundedMinor: 2_500,
    }));
    expect(releaseBundleInventory).not.toHaveBeenCalled();
  });

  it('rejects a new partial refund while a paid cancellation is pending', async () => {
    const order = {
      _id: new Types.ObjectId(),
      status: 'cancel_pending',
      totalMinor: 10_000,
      refundedMinor: 0,
      refunds: [],
    };
    (BundleOrder.findById as jest.Mock).mockResolvedValue(order);

    await expect(refundBundleOrder({
      orderId: order._id.toString(),
      operationId: 'refund:cancel-partial-blocked',
      amountMinor: 5_000,
      reason: 'Incomplete cancellation refund',
      actorId: new Types.ObjectId(),
    })).rejects.toEqual(expect.objectContaining({ code: 'CANCELLATION_REQUIRES_FULL_REFUND' }));

    expect(BundleOrder.findOneAndUpdate).not.toHaveBeenCalled();
    expect(createRefund).not.toHaveBeenCalled();
  });

  it('reconciles a legacy partial cancellation refund without clearing the cancellation recovery state', async () => {
    const operationId = 'refund:legacy-cancel-partial';
    const order = {
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      checkoutMode: 'test',
      stripePaymentIntentId: 'pi_legacy_cancel_partial',
      status: 'cancel_pending',
      paymentStatus: 'succeeded',
      currency: 'USD',
      totalMinor: 10_000,
      platformAllocationMinor: 2_000,
      paymentFeeReserveMinor: 0,
      taxMinor: 0,
      refundedMinor: 0,
      refundPendingMinor: 5_000,
      recovery: { required: true, reason: 'Cancellation review', attempts: 0 },
      components: [{
        componentId: 'future-component',
        supplierTenantId: new Types.ObjectId(),
        customerAllocationMinor: 10_000,
        supplierNetTotalMinor: 8_000,
        refundedMinor: 0,
        refundStatus: 'none',
        status: 'cancel_pending',
        settlementStatus: 'on_hold',
      }],
      refunds: [{
        operationId,
        amountMinor: 5_000,
        status: 'provider_pending',
        providerRefundId: 're_legacy_partial',
        reason: 'Legacy partial cancellation',
      }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    (BundleOrder.findById as jest.Mock)
      .mockResolvedValueOnce(order)
      .mockReturnValueOnce(queryResult(order));
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({
      enabled: true,
      publishableKey: 'pk_test_public',
      secretKey: 'sk_test_secret',
    });
    (retrieveRefund as jest.Mock).mockResolvedValue({
      id: 're_legacy_partial',
      status: 'succeeded',
      amount: 5_000,
    });
    (Booking.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    const result = await refundBundleOrder({
      orderId: order._id.toString(),
      operationId,
      amountMinor: 5_000,
      reason: 'Legacy partial cancellation',
      actorId: new Types.ObjectId(),
    });

    expect(result.order.status).toBe('cancel_pending');
    expect(result.order.paymentStatus).toBe('partially_refunded');
    expect(result.order.components[0].status).toBe('cancel_pending');
    expect(result.order.recovery).toEqual(expect.objectContaining({
      required: true,
      reason: 'Cancellation has a legacy partial refund; refund the full remaining amount',
    }));
  });

  it('releases unfulfilled capacity exactly once after a full refund succeeds', async () => {
    const operationId = 'refund:full-release-001';
    const order = {
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      checkoutMode: 'test',
      stripePaymentIntentId: 'pi_full_refund',
      status: 'cancel_pending',
      paymentStatus: 'succeeded',
      currency: 'USD',
      totalMinor: 20_000,
      platformAllocationMinor: 2_000,
      paymentFeeReserveMinor: 1_000,
      taxMinor: 1_000,
      refundedMinor: 0,
      refundPendingMinor: 20_000,
      recovery: {
        required: true,
        attempts: 0,
        reason: 'Cancellation review',
      },
      components: [
        {
          componentId: 'future-component',
          attractionId: new Types.ObjectId(),
          supplyOfferId: new Types.ObjectId(),
          date: '2030-04-01',
          time: '09:00',
          quantities: { adults: 2, children: 0, infants: 0 },
          customerAllocationMinor: 10_000,
          supplierNetTotalMinor: 8_000,
          supplierTenantId: new Types.ObjectId(),
          refundedMinor: 0,
          status: 'cancel_pending',
          settlementStatus: 'on_hold',
        },
        {
          componentId: 'fulfilled-component',
          attractionId: new Types.ObjectId(),
          supplyOfferId: new Types.ObjectId(),
          date: '2030-03-01',
          time: '09:00',
          quantities: { adults: 2, children: 0, infants: 0 },
          customerAllocationMinor: 10_000,
          supplierNetTotalMinor: 8_000,
          supplierTenantId: new Types.ObjectId(),
          refundedMinor: 0,
          status: 'fulfilled',
          settlementStatus: 'accrued',
        },
      ],
      refunds: [{
        operationId,
        amountMinor: 20_000,
        status: 'requested',
        reason: 'Approved cancellation',
      }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    (BundleOrder.findById as jest.Mock)
      .mockResolvedValueOnce(order)
      .mockReturnValueOnce(queryResult(order));
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true, publishableKey: 'pk_test_public', secretKey: 'sk_test_secret' });
    (createRefund as jest.Mock).mockResolvedValue({ id: 're_full', status: 'succeeded', amount: 20_000 });
    (Booking.findOneAndUpdate as jest.Mock).mockResolvedValue({ _id: new Types.ObjectId() });
    (Booking.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 2 });

    const result = await refundBundleOrder({
      orderId: order._id.toString(),
      operationId,
      amountMinor: 20_000,
      reason: 'Approved cancellation',
      actorId: new Types.ObjectId(),
    });

    expect(result.order.status).toBe('refunded');
    expect(result.order.components[0].settlementStatus).toBe('not_eligible');
    expect(result.order.components[1].settlementStatus).toBe('not_eligible');
    expect(result.order.components[1].status).toBe('fulfilled');
    expect(result.order.components[1].refundStatus).toBe('full');
    expect(result.order.recovery).toEqual(expect.objectContaining({ required: false }));
    expect(result.order.recovery.reason).toBeUndefined();
    expect(releaseBundleInventory).toHaveBeenCalledTimes(1);
    expect(releaseBundleInventory).toHaveBeenCalledWith(
      expect.objectContaining({
        attractionId: order.components[0].attractionId,
        supplyOfferId: order.components[0].supplyOfferId,
        guests: 2,
      }),
      expect.anything()
    );
    expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        bundleOrderId: order._id,
        bundleComponentId: 'future-component',
        inventoryReleasedAt: { $exists: false },
      }),
      expect.anything(),
      expect.objectContaining({ new: false })
    );
    expect(appendBalancedLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: `refund:${operationId}`,
        lines: expect.arrayContaining([
          expect.objectContaining({ account: 'supplier_payable', direction: 'debit', amountMinor: 8_000 }),
          expect.objectContaining({ account: 'platform_revenue', direction: 'debit', amountMinor: 2_000 }),
          expect.objectContaining({ account: 'cash_collected', direction: 'credit', amountMinor: 20_000 }),
        ]),
      }),
      expect.anything()
    );
  });

  it('keeps a fully refunded paid settlement in recovery until the supplier cash-out is resolved', async () => {
    const operationId = 'refund:paid-settlement-001';
    const order = {
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      checkoutMode: 'test',
      stripePaymentIntentId: 'pi_paid_settlement',
      status: 'completed',
      paymentStatus: 'succeeded',
      currency: 'USD',
      totalMinor: 10_000,
      platformAllocationMinor: 2_000,
      paymentFeeReserveMinor: 0,
      taxMinor: 0,
      refundedMinor: 0,
      refundPendingMinor: 10_000,
      recovery: { required: false, attempts: 0 },
      components: [{
        componentId: 'paid-component',
        attractionId: new Types.ObjectId(),
        supplyOfferId: new Types.ObjectId(),
        supplierTenantId: new Types.ObjectId(),
        date: '2030-04-01',
        time: '09:00',
        quantities: { adults: 1, children: 0, infants: 0 },
        customerAllocationMinor: 10_000,
        supplierNetTotalMinor: 8_000,
        settlementPaidMinor: 8_000,
        refundedMinor: 0,
        status: 'fulfilled',
        settlementStatus: 'paid',
      }],
      refunds: [{ operationId, amountMinor: 10_000, status: 'requested', reason: 'Approved post-service refund' }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    (BundleOrder.findById as jest.Mock)
      .mockResolvedValueOnce(order)
      .mockReturnValueOnce(queryResult(order));
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true, publishableKey: 'pk_test_public', secretKey: 'sk_test_secret' });
    (createRefund as jest.Mock).mockResolvedValue({ id: 're_paid_settlement', status: 'succeeded', amount: 10_000 });
    (Booking.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    const result = await refundBundleOrder({
      orderId: order._id.toString(),
      operationId,
      amountMinor: 10_000,
      reason: 'Approved post-service refund',
      actorId: new Types.ObjectId(),
    });

    expect(result.order.components[0].settlementStatus).toBe('disputed');
    expect(result.order.components[0].settlementDisputedMinor).toBe(8_000);
    expect(result.order.recovery).toEqual(expect.objectContaining({
      required: true,
      reason: 'A refunded supplier settlement still requires resolution',
    }));
    const ledger = (appendBalancedLedger as jest.Mock).mock.calls.at(-1)?.[0];
    expect(ledger.lines).not.toContainEqual(expect.objectContaining({ account: 'supplier_payable' }));
    expect(ledger.lines).toContainEqual(expect.objectContaining({
      account: 'customer_refund',
      direction: 'debit',
      amountMinor: 8_000,
    }));
  });

  it('keeps paid settlement exposure cumulative across partial then full refunds without a second payable debit', async () => {
    const firstOperation = 'refund:paid-partial-then-full-1';
    const secondOperation = 'refund:paid-partial-then-full-2';
    const order = {
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      checkoutMode: 'test',
      stripePaymentIntentId: 'pi_paid_partial_full',
      status: 'completed',
      paymentStatus: 'succeeded',
      currency: 'USD',
      totalMinor: 10_000,
      platformAllocationMinor: 2_000,
      paymentFeeReserveMinor: 0,
      taxMinor: 0,
      refundedMinor: 0,
      refundPendingMinor: 5_000,
      recovery: { required: false, attempts: 0 },
      components: [{
        componentId: 'paid-component',
        supplierTenantId: new Types.ObjectId(),
        customerAllocationMinor: 10_000,
        supplierNetTotalMinor: 8_000,
        settlementPaidMinor: 8_000,
        settlementDisputedMinor: 0,
        settlementRecoveredMinor: 0,
        settlementWrittenOffMinor: 0,
        settlementOperationId: 'payout:original',
        refundedMinor: 0,
        refundStatus: 'none',
        status: 'fulfilled',
        settlementStatus: 'paid',
      }],
      refunds: [{
        operationId: firstOperation,
        amountMinor: 5_000,
        status: 'requested',
        reason: 'First adjustment',
      }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    (BundleOrder.findById as jest.Mock)
      .mockResolvedValueOnce(order)
      .mockReturnValueOnce(queryResult(order))
      .mockResolvedValueOnce(order)
      .mockReturnValueOnce(queryResult(order));
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({
      enabled: true,
      publishableKey: 'pk_test_public',
      secretKey: 'sk_test_secret',
    });
    (createRefund as jest.Mock)
      .mockResolvedValueOnce({ id: 're_paid_partial', status: 'succeeded', amount: 5_000 })
      .mockResolvedValueOnce({ id: 're_paid_full', status: 'succeeded', amount: 5_000 });
    (Booking.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await refundBundleOrder({
      orderId: order._id.toString(),
      operationId: firstOperation,
      amountMinor: 5_000,
      reason: 'First adjustment',
      actorId: new Types.ObjectId(),
    });
    expect(order.components[0]).toEqual(expect.objectContaining({
      settlementStatus: 'disputed',
      settlementDisputedMinor: 4_000,
    }));
    expect(order.recovery.required).toBe(true);

    order.refundPendingMinor = 5_000;
    order.refunds.push({
      operationId: secondOperation,
      amountMinor: 5_000,
      status: 'requested',
      reason: 'Final adjustment',
    });
    await refundBundleOrder({
      orderId: order._id.toString(),
      operationId: secondOperation,
      amountMinor: 5_000,
      reason: 'Final adjustment',
      actorId: new Types.ObjectId(),
    });

    expect(order.components[0]).toEqual(expect.objectContaining({
      settlementStatus: 'disputed',
      settlementDisputedMinor: 8_000,
      refundStatus: 'full',
    }));
    expect(order.recovery.required).toBe(true);
    const finalRefundLedger = (appendBalancedLedger as jest.Mock).mock.calls.find(
      ([entry]) => entry.operationId === `refund:${secondOperation}`
    )?.[0];
    expect(finalRefundLedger.lines).not.toContainEqual(
      expect.objectContaining({ account: 'supplier_payable' })
    );
  });

  it.each(['recovered', 'written_off'] as const)(
    'reopens only remaining paid exposure after a partial dispute was %s',
    async (resolution) => {
      const firstOperation = `refund:paid-${resolution}-partial`;
      const finalOperation = `refund:paid-${resolution}-full`;
      const order = {
        _id: new Types.ObjectId(),
        storefrontTenantId: new Types.ObjectId(),
        checkoutMode: 'test',
        stripePaymentIntentId: `pi_paid_${resolution}`,
        status: 'completed',
        paymentStatus: 'succeeded',
        currency: 'USD',
        totalMinor: 10_000,
        platformAllocationMinor: 2_000,
        paymentFeeReserveMinor: 0,
        taxMinor: 0,
        refundedMinor: 0,
        refundPendingMinor: 5_000,
        recovery: { required: false, attempts: 0 },
        components: [{
          componentId: 'paid-component',
          supplierTenantId: new Types.ObjectId(),
          customerAllocationMinor: 10_000,
          supplierNetTotalMinor: 8_000,
          settlementPaidMinor: 8_000,
          settlementDisputedMinor: 0,
          settlementRecoveredMinor: 0,
          settlementWrittenOffMinor: 0,
          settlementOperationId: 'payout:original',
          refundedMinor: 0,
          refundStatus: 'none',
          status: 'fulfilled',
          settlementStatus: 'paid',
          settlementDisputeResolutions: [],
        }],
        refunds: [{
          operationId: firstOperation,
          amountMinor: 5_000,
          status: 'requested',
          reason: 'First adjustment',
        }],
        save: jest.fn().mockResolvedValue(undefined),
      };
      (getTenantStripeConfig as jest.Mock).mockResolvedValue({
        enabled: true,
        publishableKey: 'pk_test_public',
        secretKey: 'sk_test_secret',
      });
      (Booking.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
      (createRefund as jest.Mock)
        .mockResolvedValueOnce({ id: `re_${resolution}_partial`, status: 'succeeded', amount: 5_000 })
        .mockResolvedValueOnce({ id: `re_${resolution}_full`, status: 'succeeded', amount: 5_000 });
      (BundleOrder.findById as jest.Mock)
        .mockResolvedValueOnce(order)
        .mockReturnValueOnce(queryResult(order));

      await refundBundleOrder({
        orderId: order._id.toString(),
        operationId: firstOperation,
        amountMinor: 5_000,
        reason: 'First adjustment',
        actorId: new Types.ObjectId(),
      });

      (BundleOrder.findById as jest.Mock).mockReset().mockReturnValue(queryResult(order));
      (BundleOrder.findOne as jest.Mock).mockReturnValue(queryResult(null));
      await resolveBundleSettlementDispute({
        orderId: order._id.toString(),
        componentId: 'paid-component',
        operationId: `dispute:${resolution}:partial`,
        resolution,
        expectedOutstandingMinor: 4_000,
        reason: 'Recorded settlement resolution evidence',
        actorId: new Types.ObjectId(),
      });
      expect(order.components[0]).toEqual(expect.objectContaining({
        settlementStatus: 'paid',
        settlementDisputedMinor: 0,
        [resolution === 'recovered' ? 'settlementRecoveredMinor' : 'settlementWrittenOffMinor']: 4_000,
      }));

      order.refundPendingMinor = 5_000;
      order.refunds.push({
        operationId: finalOperation,
        amountMinor: 5_000,
        status: 'requested',
        reason: 'Final adjustment',
      });
      (BundleOrder.findById as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce(order)
        .mockReturnValueOnce(queryResult(order));
      await refundBundleOrder({
        orderId: order._id.toString(),
        operationId: finalOperation,
        amountMinor: 5_000,
        reason: 'Final adjustment',
        actorId: new Types.ObjectId(),
      });

      expect(order.components[0]).toEqual(expect.objectContaining({
        settlementStatus: 'disputed',
        settlementDisputedMinor: 4_000,
      }));
      expect(order.recovery.required).toBe(true);
      const finalRefundLedger = (appendBalancedLedger as jest.Mock).mock.calls.find(
        ([entry]) => entry.operationId === `refund:${finalOperation}`
      )?.[0];
      expect(finalRefundLedger.lines).not.toContainEqual(
        expect.objectContaining({ account: 'supplier_payable' })
      );
    }
  );

  it('fails closed when a full refund cannot bind future inventory to a child booking', async () => {
    const operationId = 'refund:missing-booking-001';
    const order = {
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      checkoutMode: 'test',
      stripePaymentIntentId: 'pi_missing_booking',
      status: 'cancel_pending',
      paymentStatus: 'succeeded',
      currency: 'USD',
      totalMinor: 20_000,
      refundedMinor: 0,
      refundPendingMinor: 20_000,
      recovery: {
        required: true,
        attempts: 0,
        reason: 'Cancellation review',
      },
      components: [{
        componentId: 'missing-component',
        attractionId: new Types.ObjectId(),
        supplyOfferId: new Types.ObjectId(),
        date: '2030-04-01',
        time: '09:00',
        quantities: { adults: 2, children: 0, infants: 0 },
        customerAllocationMinor: 20_000,
        refundedMinor: 0,
        status: 'cancel_pending',
        settlementStatus: 'on_hold',
      }],
      refunds: [{
        operationId,
        amountMinor: 20_000,
        status: 'requested',
        reason: 'Approved cancellation',
      }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    (BundleOrder.findById as jest.Mock)
      .mockResolvedValueOnce(order)
      .mockReturnValueOnce(queryResult(order));
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true, publishableKey: 'pk_test_public', secretKey: 'sk_test_secret' });
    (createRefund as jest.Mock).mockResolvedValue({ id: 're_missing', status: 'succeeded', amount: 20_000 });
    (Booking.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
    (Booking.findOne as jest.Mock).mockReturnValue(queryResult(null));

    await expect(refundBundleOrder({
      orderId: order._id.toString(),
      operationId,
      amountMinor: 20_000,
      reason: 'Approved cancellation',
      actorId: new Types.ObjectId(),
    })).rejects.toEqual(expect.objectContaining({ code: 'REFUND_INVENTORY_BINDING_MISSING' }));

    expect(releaseBundleInventory).not.toHaveBeenCalled();
  });
});
