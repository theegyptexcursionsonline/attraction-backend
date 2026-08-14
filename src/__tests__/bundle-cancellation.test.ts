import { Types } from 'mongoose';
import { Booking } from '../models/Booking';
import { BundleOrder } from '../models/BundleOrder';
import { releaseBundleInventory } from '../services/bundleInventory.service';
import {
  cancelBundleOrder,
  expireBundleOrder,
  expireStaleBundleOrders,
  fulfilBundleComponent,
  markBundleSettlementPaid,
  releaseBundleSettlement,
  resolveBundleSettlementDispute,
} from '../services/bundleOperations.service';
import { appendBalancedLedger } from '../services/bundleAudit.service';
import { cancelPaymentIntent, createPaymentIntent } from '../services/stripe.service';
import { getTenantStripeConfig } from '../services/tenantPayment.service';

jest.mock('../models/Booking', () => ({
  Booking: { updateMany: jest.fn(), updateOne: jest.fn() },
}));
jest.mock('../models/BundleOrder', () => ({
  BundleOrder: {
    findById: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    find: jest.fn(),
  },
}));
jest.mock('../services/bundleInventory.service', () => ({
  runBundleTransaction: jest.fn(async (work: (session: object) => Promise<unknown>) => work({})),
  releaseBundleInventory: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/bundleAudit.service', () => ({
  appendBalancedLedger: jest.fn(),
  appendBundleEvent: jest.fn(),
  enqueueBundleOutbox: jest.fn(),
}));
jest.mock('../services/stripe.service', () => ({
  cancelPaymentIntent: jest.fn(),
  createPaymentIntent: jest.fn(),
  retrievePaymentIntent: jest.fn(),
}));
jest.mock('../services/tenantPayment.service', () => ({
  getTenantStripeConfig: jest.fn(),
}));
jest.mock('../services/bundlePayment.service', () => ({
  allocateCapturedBundlePayment: jest.fn(),
  assertBundleStripeConfigBinding: jest.fn(),
  bundlePaymentBindingError: jest.fn(),
  bundlePaymentIntentIdempotencyKey: jest.fn(() => 'bundle:stable:intent:v1'),
  finalizeBundlePayment: jest.fn(),
}));

const queryResult = <T>(value: T) => ({ session: jest.fn().mockResolvedValue(value) });
const expiryRows = (rows: unknown[]) => ({
  select: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(rows) }),
    }),
  }),
});
const component = (status = 'reserved', settlementStatus = 'on_hold') => ({
  componentId: new Types.ObjectId().toString(),
  attractionId: new Types.ObjectId(),
  supplyOfferId: new Types.ObjectId(),
  supplierTenantId: new Types.ObjectId(),
  date: '2030-04-01',
  time: '09:00',
  quantities: { adults: 2, children: 0, infants: 0 },
  status,
  settlementStatus,
  refundStatus: 'none',
  refundedMinor: 0,
  supplierNetTotalMinor: 8_000,
});

describe('bundle cancellation lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('releases every capacity layer only after an unpaid order is safely cancellable', async () => {
    const order = {
      _id: new Types.ObjectId(),
      reference: 'BTW-CANCEL01',
      storefrontTenantId: new Types.ObjectId(),
      status: 'reserved',
      paymentStatus: 'not_started',
      components: [component(), component()],
      recovery: { required: false, attempts: 0 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    (BundleOrder.findById as jest.Mock).mockResolvedValue(order);
    (BundleOrder.findOne as jest.Mock).mockReturnValue(queryResult(order));
    (Booking.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 2 });

    const result = await cancelBundleOrder({
      orderId: order._id.toString(),
      reason: 'Customer cannot travel',
      actor: { actorType: 'guest' },
    });

    expect(result.status).toBe('cancelled');
    expect(result.paymentStatus).toBe('cancelled');
    expect(releaseBundleInventory).toHaveBeenCalledTimes(2);
    expect(order.components.every((item) => item.settlementStatus === 'not_eligible')).toBe(true);
  });

  it('puts a paid cancellation into review and disputes any settlement already marked paid', async () => {
    const order = {
      _id: new Types.ObjectId(),
      reference: 'BTW-CANCEL02',
      storefrontTenantId: new Types.ObjectId(),
      status: 'in_progress',
      paymentStatus: 'succeeded',
      totalMinor: 20_000,
      refundedMinor: 0,
      components: [component('fulfilled', 'paid'), component('confirmed', 'on_hold')],
      recovery: { required: false, attempts: 0 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    (BundleOrder.findById as jest.Mock)
      .mockResolvedValueOnce(order)
      .mockReturnValueOnce(queryResult(order));

    const result = await cancelBundleOrder({
      orderId: order._id.toString(),
      reason: 'Customer requested a policy review',
      actor: { actorType: 'user', actorId: new Types.ObjectId() },
    });

    expect(result.status).toBe('cancel_pending');
    expect(result.components[0].status).toBe('fulfilled');
    expect(result.components[0].settlementStatus).toBe('disputed');
    expect(result.components[1].status).toBe('cancel_pending');
    expect(result.recovery.required).toBe(false);
    expect(releaseBundleInventory).not.toHaveBeenCalled();
  });

  it('accepts cancellation after provider capture even while child allocation recovery is pending', async () => {
    const order = {
      _id: new Types.ObjectId(),
      reference: 'BTW-CANCEL03',
      storefrontTenantId: new Types.ObjectId(),
      status: 'paid_allocation_pending',
      paymentStatus: 'succeeded',
      totalMinor: 10_000,
      refundedMinor: 0,
      refundPendingMinor: 0,
      components: [component('reserved', 'on_hold')],
      recovery: {
        required: true,
        attempts: 1,
        reason: 'Provider payment captured; child allocation is pending',
      },
      save: jest.fn().mockResolvedValue(undefined),
    };
    (BundleOrder.findById as jest.Mock)
      .mockResolvedValueOnce(order)
      .mockReturnValueOnce(queryResult(order));

    const result = await cancelBundleOrder({
      orderId: order._id.toString(),
      reason: 'Customer requested cancellation after capture',
      actor: { actorType: 'user', actorId: new Types.ObjectId() },
    });

    expect(result.status).toBe('cancel_pending');
    expect(result.paymentStatus).toBe('succeeded');
    expect(result.components[0].status).toBe('cancel_pending');
    expect(releaseBundleInventory).not.toHaveBeenCalled();
  });

  it('isolates an expiry poison row and continues releasing later eligible holds', async () => {
    const poisonId = new Types.ObjectId();
    const healthyId = new Types.ObjectId();
    const poisonReview = {
      _id: poisonId,
      storefrontTenantId: new Types.ObjectId(),
      status: 'payment_pending',
      paymentStatus: 'intent_created',
      recovery: { required: false, attempts: 0 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    const healthy = {
      _id: healthyId,
      storefrontTenantId: new Types.ObjectId(),
      status: 'reserved',
      paymentStatus: 'not_started',
      holdExpiresAt: new Date(Date.now() - 60_000),
      components: [component()],
      save: jest.fn().mockResolvedValue(undefined),
    };
    (BundleOrder.find as jest.Mock).mockReturnValue(expiryRows([
      { _id: poisonId },
      { _id: healthyId },
    ]));
    (BundleOrder.findById as jest.Mock)
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockReturnValueOnce(queryResult(poisonReview))
      .mockResolvedValueOnce(healthy);
    (BundleOrder.findOne as jest.Mock).mockReturnValue(queryResult(healthy));
    (Booking.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await expect(expireStaleBundleOrders()).resolves.toEqual({
      expired: 1,
      paid: 0,
      manualReview: 1,
      failed: 1,
    });
    expect(poisonReview.status).toBe('manual_review');
    expect(releaseBundleInventory).toHaveBeenCalledTimes(1);
    expect(healthy.status).toBe('cancelled');
  });

  it('reconciles and cancels an in-flight idempotent provider intent before expiring capacity', async () => {
    const order = {
      _id: new Types.ObjectId(),
      reference: 'BTW-EXPIRY01',
      storefrontTenantId: new Types.ObjectId(),
      checkoutMode: 'test',
      status: 'reserved',
      paymentStatus: 'not_started',
      paymentSessionClaimedAt: new Date(),
      holdExpiresAt: new Date(Date.now() - 1_000),
      totalMinor: 20_000,
      currency: 'USD',
      components: [component()],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const intent = {
      id: 'pi_expiry_race',
      clientSecret: '',
      amount: 20_000,
      amountReceived: 0,
      currency: 'usd',
      status: 'requires_payment_method',
      livemode: false,
      metadata: {
        paymentKind: 'bundle',
        bundleOrderId: order._id.toString(),
        storefrontTenantId: order.storefrontTenantId.toString(),
        orderReference: order.reference,
        checkoutMode: 'test',
      },
    };
    const rebound = {
      ...order,
      status: 'payment_pending',
      paymentStatus: 'intent_created',
      paymentSessionClaimedAt: undefined,
      stripePaymentIntentId: intent.id,
    };
    (BundleOrder.findById as jest.Mock)
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(rebound);
    (BundleOrder.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
    (BundleOrder.findOne as jest.Mock).mockReturnValue(queryResult(rebound));
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({
      enabled: true,
      publishableKey: 'pk_test_public',
      secretKey: 'sk_test_secret',
    });
    (createPaymentIntent as jest.Mock).mockResolvedValue(intent);
    (cancelPaymentIntent as jest.Mock).mockResolvedValue({ id: intent.id, status: 'canceled' });
    (Booking.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await expect(expireBundleOrder(order._id)).resolves.toBe('expired');

    expect(createPaymentIntent).toHaveBeenCalledWith(
      'sk_test_secret',
      order.totalMinor,
      order.currency,
      expect.objectContaining({ bundleOrderId: order._id.toString(), checkoutMode: 'test' }),
      { idempotencyKey: 'bundle:stable:intent:v1' }
    );
    expect((cancelPaymentIntent as jest.Mock).mock.invocationCallOrder[0])
      .toBeLessThan((releaseBundleInventory as jest.Mock).mock.invocationCallOrder[0]);
    expect(releaseBundleInventory).toHaveBeenCalledTimes(1);
  });

  it('allows a partially refunded itinerary to finish and release only fulfilled supplier work', async () => {
    const supplierTenantId = new Types.ObjectId();
    const pending = {
      ...component('confirmed'),
      componentId: 'remaining-service',
      supplierTenantId,
      refundStatus: 'partial',
      refundedMinor: 1_000,
    };
    const delivered = {
      ...component('fulfilled'),
      componentId: 'delivered-service',
      supplierTenantId: new Types.ObjectId(),
      refundStatus: 'partial',
      refundedMinor: 1_000,
    };
    const order = {
      _id: new Types.ObjectId(),
      reference: 'BTW-PARTIAL01',
      storefrontTenantId: new Types.ObjectId(),
      status: 'partially_refunded',
      paymentStatus: 'partially_refunded',
      refundedMinor: 2_000,
      currency: 'USD',
      components: [pending, delivered],
      save: jest.fn().mockResolvedValue(undefined),
    };
    (BundleOrder.findOne as jest.Mock).mockReturnValue(queryResult(order));
    (Booking.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    const fulfilled = await fulfilBundleComponent({
      orderId: order._id.toString(),
      componentId: pending.componentId,
      supplierTenantId: supplierTenantId.toString(),
      actorId: new Types.ObjectId(),
    });

    expect(fulfilled.status).toBe('partially_refunded');
    expect(fulfilled.components[0].status).toBe('fulfilled');

    (BundleOrder.findById as jest.Mock).mockReturnValue(queryResult(order));
    const released = await releaseBundleSettlement({
      orderId: order._id.toString(),
      componentId: pending.componentId,
      actorId: new Types.ObjectId(),
    });
    expect(released.components[0].settlementStatus).toBe('payable');
  });

  it('binds one immutable payout operation to exactly one component', async () => {
    const payoutOperation = 'payout:provider:0001';
    const payable = component('fulfilled', 'payable');
    const order = {
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      currency: 'USD',
      components: [payable],
      save: jest.fn().mockResolvedValue(undefined),
    };
    (BundleOrder.findById as jest.Mock).mockReturnValue(queryResult(order));
    (BundleOrder.findOne as jest.Mock).mockReturnValue(queryResult(null));
    (Booking.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await markBundleSettlementPaid({
      orderId: order._id.toString(),
      componentId: payable.componentId,
      operationId: payoutOperation,
      actorId: new Types.ObjectId(),
    });

    expect(payable).toEqual(expect.objectContaining({
      settlementStatus: 'paid',
      settlementOperationId: payoutOperation,
    }));
    await expect(markBundleSettlementPaid({
      orderId: order._id.toString(),
      componentId: payable.componentId,
      operationId: 'payout:provider:0002',
      actorId: new Types.ObjectId(),
    })).rejects.toEqual(expect.objectContaining({ code: 'SETTLEMENT_OPERATION_CONFLICT' }));
  });

  it('resolves a refunded paid-settlement dispute with explicit cash recovery evidence', async () => {
    const disputed = {
      ...component('fulfilled', 'disputed'),
      componentId: 'disputed-component',
      refundStatus: 'full',
      settlementOperationId: 'payout:provider:prior',
    };
    const order = {
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      status: 'refunded',
      currency: 'USD',
      recovery: { required: true, reason: 'A refunded supplier settlement still requires resolution', attempts: 0 },
      components: [disputed],
      save: jest.fn().mockResolvedValue(undefined),
    };
    (BundleOrder.findById as jest.Mock).mockReturnValue(queryResult(order));
    (BundleOrder.findOne as jest.Mock).mockReturnValue(queryResult(null));

    await resolveBundleSettlementDispute({
      orderId: order._id.toString(),
      componentId: disputed.componentId,
      operationId: 'clawback:provider:0001',
      resolution: 'recovered',
      expectedOutstandingMinor: 8_000,
      reason: 'Supplier payout returned and bank evidence attached',
      actorId: new Types.ObjectId(),
    });

    expect(disputed).toEqual(expect.objectContaining({
      settlementStatus: 'not_eligible',
      settlementDisputeOperationId: 'clawback:provider:0001',
      settlementDisputeResolution: 'recovered',
    }));
    expect(order.recovery.required).toBe(false);
    expect(appendBalancedLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'settlement-dispute:clawback:provider:0001',
        lines: expect.arrayContaining([
          expect.objectContaining({ account: 'supplier_settlement', direction: 'debit' }),
          expect.objectContaining({ account: 'customer_refund', direction: 'credit' }),
        ]),
      }),
      expect.anything()
    );
  });

  it.each(['recovered', 'written_off'] as const)(
    'rejects a stale %s approval when the outstanding settlement exposure increased',
    async (resolution) => {
      const disputed = {
        ...component('fulfilled', 'disputed'),
        componentId: 'stale-approval-component',
        customerAllocationMinor: 10_000,
        refundedMinor: 10_000,
        refundStatus: 'full',
        settlementOperationId: 'payout:provider:stale',
        settlementPaidMinor: 8_000,
        settlementDisputedMinor: 8_000,
        settlementRecoveredMinor: 0,
        settlementWrittenOffMinor: 0,
        settlementDisputeResolutions: [],
      };
      const order = {
        _id: new Types.ObjectId(),
        storefrontTenantId: new Types.ObjectId(),
        status: 'refunded',
        currency: 'USD',
        recovery: { required: true, attempts: 0 },
        components: [disputed],
        save: jest.fn().mockResolvedValue(undefined),
      };
      (BundleOrder.findById as jest.Mock).mockReturnValue(queryResult(order));

      await expect(resolveBundleSettlementDispute({
        orderId: order._id.toString(),
        componentId: disputed.componentId,
        operationId: `stale:${resolution}:approval`,
        resolution,
        expectedOutstandingMinor: 4_000,
        reason: 'Approval was opened before another refund completed',
        actorId: new Types.ObjectId(),
      })).rejects.toEqual(expect.objectContaining({ code: 'SETTLEMENT_DISPUTE_AMOUNT_CHANGED' }));

      expect(disputed.settlementDisputedMinor).toBe(8_000);
      expect(order.save).not.toHaveBeenCalled();
      expect(appendBalancedLedger).not.toHaveBeenCalled();
    }
  );
});
