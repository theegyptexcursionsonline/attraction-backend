import { Types } from 'mongoose';
import { Booking } from '../models/Booking';
import { BundleOrder } from '../models/BundleOrder';
import { releaseBundleInventory } from '../services/bundleInventory.service';
import { cancelBundleOrder } from '../services/bundleOperations.service';

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
  retrievePaymentIntent: jest.fn(),
}));
jest.mock('../services/tenantPayment.service', () => ({
  getTenantStripeConfig: jest.fn(),
}));
jest.mock('../services/bundlePayment.service', () => ({
  bundlePaymentBindingError: jest.fn(),
  finalizeBundlePayment: jest.fn(),
}));

const queryResult = <T>(value: T) => ({ session: jest.fn().mockResolvedValue(value) });
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
    expect(releaseBundleInventory).not.toHaveBeenCalled();
  });
});
