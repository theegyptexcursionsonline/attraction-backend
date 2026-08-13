import { Types } from 'mongoose';
import { BundleOrder } from '../models/BundleOrder';
import {
  createBundlePaymentSession,
} from '../services/bundlePayment.service';
import { cancelPaymentIntent, createPaymentIntent } from '../services/stripe.service';
import { getTenantStripeConfig } from '../services/tenantPayment.service';

jest.mock('../models/Booking', () => ({ Booking: { updateMany: jest.fn() } }));
jest.mock('../models/BundleOrder', () => ({
  BundleOrder: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findById: jest.fn(),
    updateOne: jest.fn(),
  },
}));
jest.mock('../models/BundleProviderEvent', () => ({ BundleProviderEvent: {} }));
jest.mock('../services/bundleInventory.service', () => ({
  runBundleTransaction: jest.fn(),
  releaseBundleInventory: jest.fn(),
}));
jest.mock('../services/bundleAudit.service', () => ({
  appendBalancedLedger: jest.fn(),
  appendBundleEvent: jest.fn(),
  enqueueBundleOutbox: jest.fn(),
}));
jest.mock('../services/stripe.service', () => ({
  cancelPaymentIntent: jest.fn(),
  createPaymentIntent: jest.fn(),
  createRefund: jest.fn(),
  retrievePaymentIntent: jest.fn(),
  retrieveRefund: jest.fn(),
}));
jest.mock('../services/tenantPayment.service', () => ({
  ...jest.requireActual('../services/tenantPayment.service'),
  getTenantStripeConfig: jest.fn(),
}));

describe('Bundle payment session versus hold expiry', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks the provider boundary first and cancels an intent when expiry wins before binding', async () => {
    const order = {
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      checkoutMode: 'test',
      reference: 'BTW-RACE01',
      status: 'reserved',
      paymentStatus: 'not_started',
      holdExpiresAt: new Date(Date.now() + 60_000),
      totalMinor: 12_500,
      currency: 'USD',
    };
    let resolveProvider!: (value: Record<string, unknown>) => void;
    const providerCall = new Promise<Record<string, unknown>>((resolve) => {
      resolveProvider = resolve;
    });
    (BundleOrder.findOne as jest.Mock).mockResolvedValue(order);
    (BundleOrder.findOneAndUpdate as jest.Mock)
      .mockResolvedValueOnce({ ...order, paymentSessionClaimedAt: new Date() })
      .mockResolvedValueOnce(null);
    (BundleOrder.findById as jest.Mock).mockResolvedValue({
      ...order,
      status: 'cancelled',
      paymentStatus: 'expired',
    });
    (getTenantStripeConfig as jest.Mock).mockResolvedValue({
      enabled: true,
      publishableKey: 'pk_test_public',
      secretKey: 'sk_test_secret',
    });
    (createPaymentIntent as jest.Mock).mockReturnValue(providerCall);
    (cancelPaymentIntent as jest.Mock).mockResolvedValue({ id: 'pi_race', status: 'canceled' });

    const result = createBundlePaymentSession(order._id.toString(), order.storefrontTenantId);
    await Promise.resolve();
    await Promise.resolve();

    expect(BundleOrder.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: order._id,
        status: 'reserved',
        holdExpiresAt: { $gt: expect.any(Date) },
      }),
      { $set: { paymentSessionClaimedAt: expect.any(Date) } },
      { new: true }
    );

    resolveProvider({
      id: 'pi_race',
      clientSecret: 'pi_race_secret',
      amount: order.totalMinor,
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
    });

    await expect(result).rejects.toEqual(expect.objectContaining({ code: 'PAYMENT_SESSION_CONFLICT' }));
    expect(BundleOrder.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        holdExpiresAt: { $gt: expect.any(Date) },
        paymentSessionClaimedAt: { $exists: true },
      }),
      expect.anything(),
      { new: true }
    );
    expect(cancelPaymentIntent).toHaveBeenCalledWith(
      'sk_test_secret',
      'pi_race',
      expect.objectContaining({ idempotencyKey: expect.stringContaining('late-session-cancel') })
    );
  });
});
