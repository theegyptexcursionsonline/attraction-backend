import {
  AddonSelectionError,
  addonLineTotal,
  addonQuantity,
  addonsTotal,
  normalizeBookingAddons,
} from '../utils/bookingAddons';
import { createBookingSchema } from '../utils/validators';

const catalog = [
  { id: 'lunch', name: 'Lunch', price: 15 },                                   // legacy: no pricingType → per_unit
  { id: 'photos', name: 'Photo set', price: 20, pricingType: 'per_unit' },
  { id: 'gear', name: 'Snorkel gear', price: 10, pricingType: 'per_person' },
];

describe('normalizeBookingAddons', () => {
  it('prices from the catalogue and defaults quantity to 1', () => {
    const booked = normalizeBookingAddons({
      catalog,
      requested: [{ id: 'lunch', name: 'Tampered', price: 0.01 }],
      participants: 2,
    });
    expect(booked).toEqual([{
      id: 'lunch',
      name: 'Lunch',
      price: 15,
      quantity: 1,
      pricingType: 'per_unit',
      pricingModel: 'per-booking',
      totalPrice: 15,
    }]);
  });

  it('rejects quantity > 1 on a per_unit add-on (legacy add-ons included)', () => {
    expect(() => normalizeBookingAddons({ catalog, requested: [{ id: 'lunch', quantity: 2 }], participants: 4 }))
      .toThrow(new AddonSelectionError('Add-on "Lunch" can only be added once'));
    expect(() => normalizeBookingAddons({ catalog, requested: [{ id: 'photos', quantity: 3 }], participants: 4 }))
      .toThrow('Add-on "Photo set" can only be added once');
  });

  it('bounds a per_person add-on by the participants on the line', () => {
    expect(normalizeBookingAddons({ catalog, requested: [{ id: 'gear', quantity: 3 }], participants: 3 }))
      .toEqual([{
        id: 'gear',
        name: 'Snorkel gear',
        price: 10,
        quantity: 3,
        pricingType: 'per_person',
        pricingModel: 'per-person',
        totalPrice: 30,
      }]);
    expect(() => normalizeBookingAddons({ catalog, requested: [{ id: 'gear', quantity: 4 }], participants: 3 }))
      .toThrow('Add-on "Snorkel gear" can be added for at most 3 participants');
    expect(() => normalizeBookingAddons({ catalog, requested: [{ id: 'gear', quantity: 2 }], participants: 1 }))
      .toThrow('Add-on "Snorkel gear" can be added for at most 1 participant');
  });

  it('merges duplicate ids by summing quantities before applying the rules', () => {
    expect(normalizeBookingAddons({
      catalog,
      requested: [{ id: 'gear', quantity: 1 }, { id: 'gear', quantity: 2 }],
      participants: 3,
    })).toEqual([{
      id: 'gear',
      name: 'Snorkel gear',
      price: 10,
      quantity: 3,
      pricingType: 'per_person',
      pricingModel: 'per-person',
      totalPrice: 30,
    }]);

    // Two lines of a per_unit add-on are a double charge, not two units.
    expect(() => normalizeBookingAddons({ catalog, requested: [{ id: 'lunch' }, { id: 'lunch' }], participants: 3 }))
      .toThrow('Add-on "Lunch" can only be added once');
  });

  it('fails closed on ids that are not in the catalogue and copes with empty input', () => {
    expect(() => normalizeBookingAddons({ catalog, requested: [{ id: 'ghost', quantity: 1 }], participants: 2 }))
      .toThrow(new AddonSelectionError('A selected add-on is no longer available'));
    expect(() => normalizeBookingAddons({ catalog: [], requested: [{ id: 'lunch' }], participants: 2 }))
      .toThrow(new AddonSelectionError('A selected add-on is no longer available'));
    expect(normalizeBookingAddons({ catalog, requested: undefined, participants: 2 })).toEqual([]);
  });
});

describe('add-on line totals', () => {
  it('treat a legacy add-on without quantity as one unit', () => {
    expect(addonQuantity({ price: 15 })).toBe(1);
    expect(addonQuantity({ price: 15, quantity: 0 })).toBe(1);
    expect(addonLineTotal({ price: 15 })).toBe(15);
    expect(addonLineTotal({ price: 10, quantity: 3 })).toBe(30);
    expect(addonLineTotal({ price: 0.1, quantity: 3 })).toBe(0.3);
  });

  it('sum price × quantity across a line', () => {
    expect(addonsTotal([{ price: 15 }, { price: 10, quantity: 3 }])).toBe(45);
    expect(addonsTotal(undefined)).toBe(0);
  });
});

describe('createBookingSchema add-on quantity', () => {
  const booking = (addons: unknown[]) => ({
    attractionId: '507f1f77bcf86cd799439011',
    items: [{
      optionId: 'adult',
      date: '2030-03-10',
      quantities: { adults: 2, children: 0, infants: 0 },
      addons,
    }],
    guestDetails: { firstName: 'Egypt Excursions', lastName: 'Online QA', email: 'theegyptexcursionsonline@gmail.com', phone: '+20100000000', country: 'Egypt' },
  });

  it('defaults quantity to 1 and accepts 1..50 integers', () => {
    const parsed = createBookingSchema.parse(booking([{ id: 'lunch', name: 'Lunch', price: 15 }, { id: 'gear', name: 'Gear', price: 10, quantity: 50 }]));
    expect(parsed.items[0].addons.map((a) => a.quantity)).toEqual([1, 50]);
  });

  it('rejects 0, 51 and fractional quantities', () => {
    for (const quantity of [0, 51, 1.5, -1]) {
      expect(createBookingSchema.safeParse(booking([{ id: 'gear', name: 'Gear', price: 10, quantity }])).success).toBe(false);
    }
  });
});
