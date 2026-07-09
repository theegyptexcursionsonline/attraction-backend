import { isPlatformHeld, settlementHeldBy, canSupplierSelfSettle } from '../utils/settlement';

// Fouad (2026-07-05): a supplier self-settles only bookings they hold the money
// for — cash-on-arrival OR their own gateway. Platform-held online-card bookings
// are settled by a super-admin; reports stay visible to the supplier either way.
describe('settlement authority — who may settle a resale booking', () => {
  describe('cash-on-arrival (supplier collected the money)', () => {
    it.each(['pay-later', 'cash'])('%s → supplier-held, supplier may self-settle', (method) => {
      expect(isPlatformHeld(method, false)).toBe(false);
      expect(canSupplierSelfSettle(method, false)).toBe(true);
      expect(settlementHeldBy(method, false)).toBe('supplier');
    });
  });

  describe('online card payment', () => {
    it('no own gateway → PLATFORM-held, only super-admin settles', () => {
      expect(isPlatformHeld('card', false)).toBe(true);
      expect(canSupplierSelfSettle('card', false)).toBe(false);
      expect(settlementHeldBy('card', false)).toBe('platform');
    });

    it("supplier's OWN gateway → supplier-held, supplier may self-settle", () => {
      expect(isPlatformHeld('card', true)).toBe(false);
      expect(canSupplierSelfSettle('card', true)).toBe(true);
      expect(settlementHeldBy('card', true)).toBe('supplier');
    });
  });

  it('own gateway makes every payment method supplier-held', () => {
    for (const m of ['card', 'pay-later', 'cash']) {
      expect(canSupplierSelfSettle(m, true)).toBe(true);
    }
  });

  it('an unknown/undefined method is treated as cash-on-arrival (supplier-held), not platform', () => {
    expect(isPlatformHeld(undefined, false)).toBe(false);
    expect(settlementHeldBy(undefined, false)).toBe('supplier');
  });
});
