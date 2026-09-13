import { bookingEligibility, resolveBookingTimeZone, zonedDeparture } from '../utils/bookingCutoff';
import { applyBookingCutoffs } from '../utils/publicAvailability';
import { createAttractionSchema } from '../utils/validators';

describe('booking cutoff eligibility', () => {
  it('closes at the exact cutoff boundary and stays open one millisecond before it', () => {
    const base = { date: '2026-09-14', time: '08:30', timeZone: 'Africa/Cairo', cutoffMinutes: 120 };
    expect(bookingEligibility({ ...base, now: new Date('2026-09-14T03:29:59.999Z') }).eligible).toBe(true);
    expect(bookingEligibility({ ...base, now: new Date('2026-09-14T03:30:00.000Z') })).toMatchObject({
      eligible: false,
      reason: 'cutoff_reached',
    });
  });

  it('interprets the departure in the tenant timezone, including Cairo daylight time', () => {
    expect(zonedDeparture('2026-09-14', '08:30', 'Africa/Cairo')?.toISOString())
      .toBe('2026-09-14T05:30:00.000Z');
  });

  it('rejects a past timed departure even with a zero-minute legacy cutoff', () => {
    expect(bookingEligibility({
      date: '2026-09-14',
      time: '08:30',
      timeZone: 'Africa/Cairo',
      cutoffMinutes: 0,
      now: new Date('2026-09-14T05:30:00.000Z'),
    })).toMatchObject({ eligible: false, reason: 'past_departure' });
  });

  it('uses the tenant local calendar day for date-only legacy bookings', () => {
    const now = new Date('2026-09-13T22:30:00.000Z'); // 14 September in Cairo
    expect(bookingEligibility({ date: '2026-09-13', timeZone: 'Africa/Cairo', now }).reason).toBe('past_date');
    expect(bookingEligibility({ date: '2026-09-14', timeZone: 'Africa/Cairo', now }).eligible).toBe(true);
  });
});

describe('public option cutoff projection', () => {
  const attraction = {
    pricingOptions: [
      { id: 'early-close', bookingCutoffMinutes: 120, timeSlots: [{ startTime: '08:30' }] },
      { id: 'late-close', bookingCutoffMinutes: 0, timeSlots: [{ startTime: '08:30' }] },
      { id: 'afternoon', bookingCutoffMinutes: 120, timeSlots: [{ startTime: '14:00' }] },
    ],
  };
  const slots = [
    { time: '08:30', available: true, spotsLeft: 5 },
    { time: '14:00', available: true, spotsLeft: 5 },
  ];
  const context = { date: '2026-09-14', timeZone: 'Africa/Cairo', now: new Date('2026-09-14T04:00:00.000Z') };

  it('isolates cutoff decisions by selected option', () => {
    expect(applyBookingCutoffs(attraction, slots, { ...context, optionId: 'early-close' }))
      .toEqual([{ time: '08:30', available: false, spotsLeft: 5 }]);
    expect(applyBookingCutoffs(attraction, slots, { ...context, optionId: 'late-close' }))
      .toEqual([{ time: '08:30', available: true, spotsLeft: 5 }]);
  });

  it('keeps an aggregate departure open when any supporting option is eligible', () => {
    expect(applyBookingCutoffs(attraction, slots, context)).toEqual([
      { time: '08:30', available: true, spotsLeft: 5 },
      { time: '14:00', available: true, spotsLeft: 5 },
    ]);
  });
});

describe('booking cutoff authoring contract', () => {
  const publishable = {
    slug: 'scheduled-tour', title: 'Scheduled tour', shortDescription: 'A tour', description: 'A tour',
    category: 'tour', destination: { city: 'Hurghada', country: 'Egypt', coordinates: { lat: 27.25, lng: 33.81 } }, duration: '2 hours',
    priceFrom: 20, currency: 'EUR', availability: { type: 'time-slots' as const, advanceBooking: 30 },
    pricingOptions: [{ id: 'standard', name: 'Standard', price: 20, bookingCutoffMinutes: 120,
      timeSlots: [{ id: 'morning', label: 'Morning', startTime: '08:30' }] }],
  };

  it('accepts absent cutoff for old clients and validates the bounded integer', () => {
    const legacy = { ...publishable, pricingOptions: [{ id: 'standard', name: 'Standard', price: 20 }] };
    expect(createAttractionSchema.safeParse(legacy).success).toBe(true);
    for (const value of [-1, 1.5, 10081]) {
      expect(createAttractionSchema.safeParse({
        ...publishable,
        pricingOptions: [{ ...publishable.pricingOptions[0], bookingCutoffMinutes: value }],
      }).success).toBe(false);
    }
  });

  it('rejects a positive cutoff without a scheduled departure', () => {
    const result = createAttractionSchema.safeParse({
      ...publishable,
      availability: { type: 'date-only' as const, advanceBooking: 30 },
      pricingOptions: [{ id: 'standard', name: 'Standard', price: 20, bookingCutoffMinutes: 120 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['pricingOptions', 0, 'bookingCutoffMinutes'] }),
    ]));
  });
});

describe('booking timezone resolution', () => {
  it.each([
    ['Africa/Cairo', 'Africa/Cairo'],
    ['Europe/Berlin', 'Europe/Berlin'],
    [undefined, 'Africa/Cairo'],
    ['', 'Africa/Cairo'],
    ['UTC', 'Africa/Cairo'],
    ['Not/AZone', 'Africa/Cairo'],
    [42, 'Africa/Cairo'],
  ])('%p resolves to %p without throwing', (input, expected) => {
    expect(resolveBookingTimeZone(input)).toBe(expected);
  });

  it('a site without a timezone still closes a Cairo departure on Cairo time', () => {
    // 08:30 Cairo (EEST, UTC+3) on 13 Sep 2026 is 05:30 UTC; at 06:00 UTC it has departed.
    const eligibility = bookingEligibility({
      date: '2026-09-13', time: '08:30', cutoffMinutes: 0,
      timeZone: resolveBookingTimeZone(undefined), now: new Date('2026-09-13T06:00:00.000Z'),
    });
    expect(eligibility).toMatchObject({ eligible: false, reason: 'past_departure' });
  });
});
