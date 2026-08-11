import { Types } from 'mongoose';
import { Booking } from '../models/Booking';
import { BundleOrder } from '../models/BundleOrder';
import { releaseBundleInventory } from '../services/bundleInventory.service';
import {
  failBundlePayment,
  refundBundleOrder,
} from '../services/bundlePayment.service';
import { retrieveRefund } from '../services/stripe.service';
import { getTenantStripeConfig } from '../services/tenantPayment.service';

jest.mock('../models/Booking', () => ({
  Booking: { updateMany: jest.fn(), updateOne: jest.fn() },
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
  getTenantStripeConfig: jest.fn(),
}));

const queryResult = <T>(value: T) => ({ session: jest.fn().mockResolvedValue(value) });

describe('bundle payment recovery contracts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps inventory reserved after a failed card attempt so the same hold can be retried', async () => {
    const order = {
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
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
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true, secretKey: 'sk_test' });
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
    expect(retrieveRefund).toHaveBeenCalledWith('sk_test', 're_pending');
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
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({ enabled: true, secretKey: 'sk_test' });
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
});
