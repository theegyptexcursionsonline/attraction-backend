import {
  toOctoSupplier,
  toOctoProduct,
  octoUnitType,
  toOctoAvailability,
  octoAvailabilityId,
  toOctoBooking,
} from '../octo/mappers';

const tenant = {
  _id: 'tenant123',
  slug: 'makadi-horse-club',
  name: 'Makadi Horse Club',
  defaultLanguage: 'en',
  defaultCurrency: 'USD',
  timezone: 'Africa/Cairo',
  contactInfo: { email: 'info@makadihorseclub.com', phone: '+20 65 345 0001' },
};

describe('OCTO supplier mapper', () => {
  it('maps a tenant to an OCTO supplier', () => {
    const s = toOctoSupplier(tenant, 'https://x/api/octo');
    expect(s.id).toBe('tenant123');
    expect(s.name).toBe('Makadi Horse Club');
    expect(s.endpoint).toBe('https://x/api/octo');
    expect(s.contact.email).toBe('info@makadihorseclub.com');
    expect(s.locale).toBe('en');
    expect(s.timeZone).toBe('Africa/Cairo');
    expect(s.currencies).toEqual(['USD']);
  });
});

describe('octoUnitType', () => {
  it('infers OCTO unit types from pricing-option names', () => {
    expect(octoUnitType('Adult')).toBe('ADULT');
    expect(octoUnitType('Child (3-11)')).toBe('CHILD');
    expect(octoUnitType('Infant')).toBe('INFANT');
    expect(octoUnitType('Senior citizen')).toBe('SENIOR');
    expect(octoUnitType('Family pass')).toBe('FAMILY');
    expect(octoUnitType('VIP')).toBe('ADULT'); // default
  });
});

describe('OCTO product mapper', () => {
  const base = {
    _id: 'prod1',
    slug: 'beginner-horse-ride',
    title: 'Beginner Horse Riding Lesson',
    currency: 'USD',
    priceFrom: 40,
    instantConfirmation: true,
  };

  it('maps a time-slot product to START_TIME with start times + units in minor currency', () => {
    const p = toOctoProduct(
      {
        ...base,
        availability: { type: 'time-slots' },
        entryWindows: [
          { label: 'Morning', startTime: '09:00', endTime: '10:00' },
          { label: 'Sunset', startTime: '17:00', endTime: '18:00' },
        ],
        pricingOptions: [
          { id: 'adult', name: 'Adult', price: 40, originalPrice: 50 },
          { id: 'child', name: 'Child', price: 25 },
        ],
      },
      tenant,
    );

    expect(p.id).toBe('prod1');
    expect(p.reference).toBe('beginner-horse-ride');
    expect(p.availabilityType).toBe('START_TIME');
    expect(p.options[0].availabilityLocalStartTimes).toEqual(['09:00', '17:00']);

    const units = p.options[0].units;
    expect(units).toHaveLength(2);
    expect(units[0].type).toBe('ADULT');
    // minor units (cents): retail 4000, original 5000
    expect(units[0].pricingFrom[0].retail).toBe(4000);
    expect(units[0].pricingFrom[0].original).toBe(5000);
    expect(units[0].pricingFrom[0].currency).toBe('USD');
    expect(units[1].type).toBe('CHILD');
    expect(units[1].pricingFrom[0].retail).toBe(2500);
    // child has no originalPrice → falls back to price
    expect(units[1].pricingFrom[0].original).toBe(2500);
  });

  it('maps a date-only product to OPENING_HOURS and synthesises a default Adult unit', () => {
    const p = toOctoProduct({ ...base, availability: { type: 'date-only' }, pricingOptions: [] }, tenant);
    expect(p.availabilityType).toBe('OPENING_HOURS');
    expect(p.options[0].availabilityLocalStartTimes).toEqual(['00:00']);
    expect(p.options[0].units).toHaveLength(1);
    expect(p.options[0].units[0].type).toBe('ADULT');
    expect(p.options[0].units[0].pricingFrom[0].retail).toBe(4000); // from priceFrom
  });

  it('marks the default option and requires availability', () => {
    const p = toOctoProduct(base, tenant);
    expect(p.options[0].default).toBe(true);
    expect(p.availabilityRequired).toBe(true);
    expect(p.instantConfirmation).toBe(true);
  });
});

describe('OCTO availability mapper', () => {
  it('maps an available slot', () => {
    const av = toOctoAvailability({ localDate: '2026-07-10', startTime: '09:00', vacancies: 12, capacity: 25 });
    expect(av.id).toBe('2026-07-10T09:00:00');
    expect(av.status).toBe('AVAILABLE');
    expect(av.available).toBe(true);
    expect(av.vacancies).toBe(12);
    expect(av.allDay).toBe(false);
  });
  it('marks a full slot SOLD_OUT', () => {
    const av = toOctoAvailability({ localDate: '2026-07-10', startTime: '09:00', vacancies: 0, capacity: 25 });
    expect(av.status).toBe('SOLD_OUT');
    expect(av.available).toBe(false);
  });
  it('marks a blocked date CLOSED (all-day)', () => {
    const av = toOctoAvailability({ localDate: '2026-07-10', startTime: null, vacancies: 25, capacity: 25, blocked: true });
    expect(av.status).toBe('CLOSED');
    expect(av.available).toBe(false);
    expect(av.allDay).toBe(true);
  });
  it('octoAvailabilityId uses date-only for all-day', () => {
    expect(octoAvailabilityId('2026-07-10', null)).toBe('2026-07-10');
    expect(octoAvailabilityId('2026-07-10', '17:00')).toBe('2026-07-10T17:00:00');
  });
});

describe('OCTO booking mapper', () => {
  it('expands unit quantities into per-ticket unitItems + prices in minor units', () => {
    const b = toOctoBooking({
      uuid: 'abc-123', status: 'ON_HOLD', productId: 'p1', optionId: 'DEFAULT',
      availabilityId: '2026-07-10T09:00:00', currency: 'USD', totalMinor: 10500,
      unitItems: [{ unitId: 'adult', quantity: 2 }, { unitId: 'child', quantity: 1 }],
      utcHoldExpiration: '2026-07-10T09:30:00.000Z',
    });
    expect(b.status).toBe('ON_HOLD');
    expect(b.unitItems).toHaveLength(3);
    expect(b.unitItems.map((u) => u.unitId)).toEqual(['adult', 'adult', 'child']);
    expect(b.pricing.retail).toBe(10500);
    expect(b.pricing.currency).toBe('USD');
    expect(b.utcHoldExpiration).toBe('2026-07-10T09:30:00.000Z');
  });
  it('formats the contact fullName', () => {
    const b = toOctoBooking({
      uuid: 'x', status: 'CONFIRMED', productId: 'p1', currency: 'USD', totalMinor: 0,
      contact: { firstName: 'Sara', lastName: 'Hassan', emailAddress: 's@x.com' },
    });
    expect(b.contact.fullName).toBe('Sara Hassan');
    expect(b.contact.emailAddress).toBe('s@x.com');
  });
});
