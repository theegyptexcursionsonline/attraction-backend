import {
  cancellationPolicyText,
  packageBookingItem,
  packageBookingSnapshot,
  packageRefundPercentOn,
  packageSelfCancellationProblem,
} from '../services/packageBooking.service';
import { packageSelectionSchema, pricePackageSelection, PackageQuote } from '../services/packagePricing.service';
import { resaleFieldsFor, RESELLER_PAYMENT_FEE_PERCENT } from '../utils/resaleSplit';

it('keeps the payment fee rate tour bookings use', () => { expect(RESELLER_PAYMENT_FEE_PERCENT).toBe(2.9); });
import { samplePackage } from '../test/packageFixture';

const SCHEDULE = [
  { daysBefore: 30, refundPercent: 100 },
  { daysBefore: 14, refundPercent: 50 },
  { daysBefore: 0, refundPercent: 0 },
];
const DEPARTURE = '2026-12-01';

const quoteFor = (selection: Record<string, unknown>): PackageQuote => {
  const result = pricePackageSelection({
    details: samplePackage(),
    currency: 'USD',
    today: '2026-10-01',
    selection: packageSelectionSchema.parse({ date: DEPARTURE, tierKey: 'gold', rooms: [{ adults: 2 }], ...selection }),
  });
  if (!result.ok) throw new Error(result.message);
  return result.quote;
};
const cents = (value: number) => Math.round(value * 100);

describe('package refund schedule', () => {
  it.each([
    ['2026-10-01', 100], // 61 days before
    ['2026-11-01', 100], // exactly 30 days before
    ['2026-11-02', 50], // 29 days before
    ['2026-11-17', 50], // exactly 14 days before
    ['2026-11-18', 0], // 13 days before
    ['2026-12-01', 0], // departure day
    ['2026-12-05', 0], // after departure
  ])('cancelling on %s refunds %i %%', (today, percent) => {
    expect(packageRefundPercentOn(SCHEDULE, DEPARTURE, today)).toBe(percent);
  });

  it('refunds nothing when the terms have no rule that still applies', () => {
    expect(packageRefundPercentOn([], DEPARTURE, '2026-10-01')).toBe(0);
    expect(packageRefundPercentOn([{ daysBefore: 60, refundPercent: 100 }], DEPARTURE, '2026-11-01')).toBe(0);
  });
});

describe('customer self-cancellation of a package', () => {
  const booking = (paymentStatus: string, today: string) => ({
    paymentStatus,
    packageBooking: { version: 1, departureDate: DEPARTURE, returnDate: '2026-12-08', cancellation: SCHEDULE.map(rule => ({ ...rule, cancelBy: '' })) },
    today,
  });

  it('lets a customer cancel a paid trip while the terms still refund in full', () => {
    const paid = booking('succeeded', '2026-11-01');
    expect(packageSelfCancellationProblem(paid, paid.today)).toBeNull();
  });

  it('sends a customer to the operator once the refund is partial or nothing', () => {
    expect(packageSelfCancellationProblem(booking('succeeded', '2026-11-10'), '2026-11-10'))
      .toBe("Under this trip's terms, cancelling now refunds 50% of the price. Please contact us to cancel and we will arrange that refund.");
    expect(packageSelfCancellationProblem(booking('succeeded', '2026-11-25'), '2026-11-25'))
      .toBe("Under this trip's terms, cancelling now is not refundable. Please contact us if you need to cancel.");
  });

  it('never blocks an unpaid trip or a booking that is not a package', () => {
    expect(packageSelfCancellationProblem(booking('pending', '2026-11-25'), '2026-11-25')).toBeNull();
    expect(packageSelfCancellationProblem(booking('failed', '2026-11-25'), '2026-11-25')).toBeNull();
    expect(packageSelfCancellationProblem({ paymentStatus: 'succeeded' }, '2026-11-25')).toBeNull();
  });

  it('asks the customer to get in touch when the stored terms cannot be read', () => {
    expect(packageSelfCancellationProblem({ paymentStatus: 'succeeded', packageBooking: { version: 1 } }, '2026-11-25'))
      .toBe('Please contact us to cancel this trip.');
  });
});

describe('cancellation terms in words', () => {
  it.each([
    [SCHEDULE, 'Cancel at least 30 days before departure: full refund. At least 14 days before: 50% refund. Later: no refund.'],
    [[{ daysBefore: 45, refundPercent: 100 }, { daysBefore: 7, refundPercent: 25 }], 'Cancel at least 45 days before departure: full refund. At least 7 days before: 25% refund. Later: no refund.'],
    [[{ daysBefore: 1, refundPercent: 100 }], 'Cancel at least 1 day before departure: full refund. Later: no refund.'],
    [[{ daysBefore: 0, refundPercent: 0 }], 'Non-refundable.'],
    [[{ daysBefore: 0, refundPercent: 100 }], 'Full refund if you cancel before departure.'],
    [[{ daysBefore: 0, refundPercent: 80 }], '80% refund if you cancel before departure.'],
    [[], ''],
  ])('states %j', (rules, text) => {
    expect(cancellationPolicyText(rules)).toBe(text);
  });
});

describe('the booking line a package booking stores', () => {
  it('adds up to the quoted total, fee included, with every extra as an add-on', () => {
    const quote = quoteFor({
      rooms: [{ adults: 2, children: 1 }, { adults: 2 }],
      extras: [{ id: 'balloon', adults: 3, children: 1 }, { id: 'extra-night', quantity: 2 }, { id: 'airport' }],
    });
    const item = packageBookingItem(samplePackage(), quote);
    expect(item).toMatchObject({
      optionId: 'package:gold',
      optionName: 'Gold · 8 days / 7 nights',
      date: DEPARTURE,
      quantities: { adults: 4, children: 1, infants: 0 },
    });
    expect(item.addons.map(addon => [addon.id, addon.name, addon.quantity, addon.price, addon.totalPrice])).toEqual([
      ['balloon', 'Hot-air balloon over Luxor (adults)', 3, 126, 378],
      ['balloon:child', 'Hot-air balloon over Luxor (children)', 1, 94.5, 94.5],
      ['extra-night', 'Extra night in Cairo (2 × 2 rooms)', 4, 99.75, 399],
      ['airport', 'Private airport transfer', 1, 42, 42],
    ]);
    const stored = cents(item.totalPrice) + item.addons.reduce((sum, addon) => sum + cents(addon.totalPrice), 0);
    expect(stored).toBe(cents(quote.total));
    expect(item.unitPrice).toBe(Math.round(cents(item.totalPrice) / 5) / 100);
  });

  it('snapshots the quote with hotels and dated cancellation terms', () => {
    const quote = quoteFor({ rooms: [{ adults: 2 }] });
    const snapshot = packageBookingSnapshot({ details: samplePackage(), quote, quoteHash: 'a'.repeat(32), travellerNames: ['Lead Traveller', 'Second Traveller'] });
    expect(snapshot).toMatchObject({
      version: 1,
      departureDate: DEPARTURE,
      returnDate: '2026-12-08',
      durationDays: 8,
      durationNights: 7,
      tier: { key: 'gold', name: 'Gold', hotels: [{ city: 'Cairo', name: 'Steigenberger Pyramids', nights: 3, stars: 5 }, expect.any(Object)] },
      total: 2100,
      serviceFee: 100,
      operatorSubtotal: 2000,
      quoteHash: 'a'.repeat(32),
      travellerNames: ['Lead Traveller', 'Second Traveller'],
      cancellation: [
        { daysBefore: 30, refundPercent: 100, cancelBy: '2026-11-01' },
        { daysBefore: 14, refundPercent: 50, cancelBy: '2026-11-17' },
        { daysBefore: 0, refundPercent: 0, cancelBy: '2026-12-01' },
      ],
    });
  });
});

describe('reseller split for package bookings', () => {
  const owner = 'owner-site';
  it('is not a resale on the owner site, without reselling, or without an owner', () => {
    expect(resaleFieldsFor({ reseller: { enabled: true, value: 10 }, ownerTenantId: owner }, owner, 1000)).toEqual({ isResale: false });
    expect(resaleFieldsFor({ reseller: { enabled: false, value: 10 }, ownerTenantId: owner }, 'seller', 1000)).toEqual({ isResale: false });
    expect(resaleFieldsFor({ reseller: { enabled: true, value: 10 }, tenantIds: [] }, 'seller', 1000)).toEqual({ isResale: false });
  });

  it('splits the total into commission, payment fee and supplier net, to the cent', () => {
    expect(resaleFieldsFor({ reseller: { enabled: true, value: 12.5 }, tenantIds: [owner] }, 'seller', 2667)).toEqual({
      isResale: true,
      supplierTenantId: owner,
      sellerTenantId: 'seller',
      revenueBreakdown: {
        commissionPercent: 12.5,
        sellerEarnings: 333.38,
        paymentFee: 77.34,
        supplierEarnings: 2256.28,
      },
    });
  });
});
