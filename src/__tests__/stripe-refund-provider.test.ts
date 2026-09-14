import Stripe from 'stripe';
import { createRefund, listPaymentIntentRefunds } from '../services/stripe.service';
import { refundLedgerStatus } from '../services/bookingRefund.service';

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const asyncList = <T>(items: T[]) => ({
  async *[Symbol.asyncIterator]() {
    for (const item of items) yield item;
  },
});

describe('Stripe refund provider helpers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists every refund for one PaymentIntent with status, amount and metadata', async () => {
    const list = jest.fn().mockReturnValue(asyncList([
      { id: 're_1', status: 'succeeded', amount: 2500, payment_intent: 'pi_list', metadata: { atnRefundFlow: 'booking-cancellation' } },
      { id: 're_2', status: null, amount: 500, payment_intent: { id: 'pi_list' }, metadata: null },
    ]));
    (Stripe as unknown as jest.Mock).mockImplementation(() => ({ refunds: { list } }));

    const refunds = await listPaymentIntentRefunds('sk_test_refund_list_1', 'pi_list');

    expect(list).toHaveBeenCalledWith({ payment_intent: 'pi_list', limit: 100 });
    expect(refunds).toEqual([
      { id: 're_1', status: 'succeeded', amount: 2500, paymentIntentId: 'pi_list', metadata: { atnRefundFlow: 'booking-cancellation' } },
      { id: 're_2', status: 'pending', amount: 500, paymentIntentId: 'pi_list', metadata: {} },
    ]);
  });

  it('fails closed without a secret key and propagates provider errors', async () => {
    await expect(listPaymentIntentRefunds(undefined, 'pi_list')).rejects.toThrow('Stripe secret key is required');
    const list = jest.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() { throw new Error('provider unavailable'); },
    });
    (Stripe as unknown as jest.Mock).mockImplementation(() => ({ refunds: { list } }));
    await expect(listPaymentIntentRefunds('sk_test_refund_list_2', 'pi_list')).rejects.toThrow('provider unavailable');
  });

  it('sends refund metadata only when a flow tags the refund', async () => {
    const create = jest.fn().mockResolvedValue({ id: 're_tagged', status: 'succeeded', amount: 100, payment_intent: 'pi_tag' });
    (Stripe as unknown as jest.Mock).mockImplementation(() => ({ refunds: { create } }));

    await createRefund('sk_test_refund_meta_1', 'pi_tag', 100, { idempotencyKey: 'k1', metadata: { atnRefundFlow: 'booking-cancellation' } });
    await createRefund('sk_test_refund_meta_1', 'pi_tag', 100, { idempotencyKey: 'k2' });

    expect(create).toHaveBeenNthCalledWith(1,
      { payment_intent: 'pi_tag', amount: 100, metadata: { atnRefundFlow: 'booking-cancellation' } },
      { idempotencyKey: 'k1' });
    expect(create).toHaveBeenNthCalledWith(2, { payment_intent: 'pi_tag', amount: 100 }, { idempotencyKey: 'k2' });
  });

  it('maps every Stripe refund status onto the booking ledger states', () => {
    expect(refundLedgerStatus('succeeded')).toBe('succeeded');
    expect(refundLedgerStatus('failed')).toBe('failed');
    expect(refundLedgerStatus('canceled')).toBe('failed');
    expect(refundLedgerStatus('pending')).toBe('pending');
    expect(refundLedgerStatus('requires_action')).toBe('pending');
  });
});
