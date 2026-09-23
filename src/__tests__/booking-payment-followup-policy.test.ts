import { env } from '../config/env';
import { paymentFollowupEnabledFor } from '../utils/bookingPaymentFollowupPolicy';

describe('payment follow-up rollout boundary', () => {
  const previous = env.bookingPaymentFollowupStartAt;
  beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-09-24T12:00:00Z')); });
  afterEach(() => { env.bookingPaymentFollowupStartAt = previous; jest.useRealTimers(); });
  it.each(['', 'invalid', '2026-09-23', '2026-09-23T12:00:00+03:00', '2026-02-30T00:00:00Z', '2026-09-25T00:00:00Z'])('disables invalid or future configuration %s', boundary => {
    env.bookingPaymentFollowupStartAt = boundary;
    expect(paymentFollowupEnabledFor(new Date('2026-09-24T10:00:00Z'))).toBe(false);
  });
  it('excludes historical checkouts and permits the exact boundary', () => {
    env.bookingPaymentFollowupStartAt = '2026-09-24T00:00:00Z';
    expect(paymentFollowupEnabledFor('2026-09-23T23:59:59.999Z')).toBe(false);
    expect(paymentFollowupEnabledFor('2026-09-24T00:00:00Z')).toBe(true);
    expect(paymentFollowupEnabledFor(new Date('2026-09-24T10:00:00Z'))).toBe(true);
  });
  it.each([null, undefined, 0, {}, '', 'invalid', new Date(NaN), '2026-09-25T00:00:00Z'])('rejects missing, invalid and future creation times', created => {
    env.bookingPaymentFollowupStartAt = '2026-09-24T00:00:00.000Z';
    expect(paymentFollowupEnabledFor(created)).toBe(false);
  });
});
