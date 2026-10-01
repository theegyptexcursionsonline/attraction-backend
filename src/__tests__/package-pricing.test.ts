import {
  addDays,
  addMonths,
  firstBookableDate,
  monthDays,
  packageCalendar,
  packageDateStatus,
  packageFromPrice,
  packageQuoteHash,
  packageSelectionSchema,
  PackageDepartureState,
  PackageQuote,
  PackageSelectionInput,
  pricePackageSelection,
  todayInZone,
} from '../services/packagePricing.service';
import { serviceFeeOn, withServiceFeeCents } from '../utils/serviceFee';
import { PackageDetailsInput } from '../utils/packageDetails';
import { samplePackage } from '../test/packageFixture';

const TODAY = '2026-10-01';
const WINTER_DAY = '2026-11-10';
const SUMMER_DAY = '2027-06-15';

const quote = (selection: Partial<PackageSelectionInput>, overrides: Partial<PackageDetailsInput> = {}, extra: { today?: string; feeBasisPoints?: number } = {}) =>
  pricePackageSelection({
    details: samplePackage(overrides),
    currency: 'USD',
    selection: packageSelectionSchema.parse({ date: WINTER_DAY, tierKey: 'gold', rooms: [{ adults: 2 }], ...selection }),
    today: extra.today ?? TODAY,
    feeBasisPoints: extra.feeBasisPoints,
  });

const priced = (...args: Parameters<typeof quote>): PackageQuote => {
  const result = quote(...args);
  if (!result.ok) throw new Error(`expected a price, got ${result.code}: ${result.message}`);
  return result.quote;
};

const refused = (...args: Parameters<typeof quote>) => {
  const result = quote(...args);
  if (result.ok) throw new Error(`expected a refusal, got ${result.quote.total}`);
  return result;
};

const cents = (value: number) => Math.round(value * 100);

/** Every displayed figure adds up: units × quantities = lines, lines = total, subtotal + fee = total. */
const expectConsistent = (result: PackageQuote) => {
  let total = 0;
  for (const line of [...result.rooms, ...result.extras]) {
    let lineCents = 0;
    for (const charge of line.charges) {
      expect(cents(charge.amount)).toBe(cents(charge.unitPrice) * charge.quantity);
      lineCents += cents(charge.amount);
    }
    expect(cents(line.amount)).toBe(lineCents);
    total += lineCents;
  }
  expect(cents(result.total)).toBe(total);
  expect(cents(result.subtotal) + cents(result.serviceFee)).toBe(cents(result.total));
  const party = result.travellers.adults + result.travellers.children;
  const roomCents = result.rooms.reduce((sum, room) => sum + cents(room.amount), 0);
  expect(cents(result.tripPerPerson)).toBe(Math.round(roomCents / party));
};

describe('service fee helpers', () => {
  it('keeps the tour checkout fee rule unchanged (5 % of the subtotal, to the cent)', () => {
    expect(serviceFeeOn(100)).toBe(5);
    expect(serviceFeeOn(99.99)).toBe(5);
    expect(serviceFeeOn(0.1)).toBe(0.01);
    expect(serviceFeeOn(1234.5)).toBe(61.73);
  });

  it('puts the fee inside a unit price, rounded to the cent', () => {
    expect(withServiceFeeCents(100_000)).toBe(105_000);
    expect(withServiceFeeCents(9999)).toBe(10_499);
    expect(withServiceFeeCents(1)).toBe(1);
    expect(withServiceFeeCents(10)).toBe(11);
    expect(withServiceFeeCents(0)).toBe(0);
    expect(withServiceFeeCents(100_000, 0)).toBe(100_000);
  });
});

describe('package rooms and occupancy', () => {
  it('prices two adults sharing a double room, fee inside every figure', () => {
    const result = priced({ rooms: [{ adults: 2 }] });
    expect(result.rooms).toEqual([{
      room: 1, occupancy: 'double', adults: 2, children: 0, infants: 0, amount: 2100,
      charges: [{ traveller: 'adult', rate: 'double', quantity: 2, unitPrice: 1050, amount: 2100 }],
    }]);
    expect(result).toMatchObject({
      currency: 'USD', departureDate: WINTER_DAY, returnDate: '2026-11-17',
      tier: { key: 'gold', name: 'Gold' }, season: { key: 'winter', name: 'Winter' }, groupSize: { min: 2, max: 4 },
      travellers: { adults: 2, children: 0, infants: 0 },
      total: 2100, serviceFee: 100, subtotal: 2000, perPerson: 1050, tripPerPerson: 1050, feeBasisPoints: 500,
    });
    expectConsistent(result);
  });

  it('prices a solo traveller in a single room at the one-traveller group price', () => {
    const result = priced({ rooms: [{ adults: 1 }] });
    expect(result.groupSize).toEqual({ min: 1, max: 1 });
    expect(result.rooms[0]).toMatchObject({ occupancy: 'single', charges: [{ rate: 'single', quantity: 1, unitPrice: 1680 }] });
    expect(result.total).toBe(1680);
  });

  it('prices three adults in a triple room', () => {
    const result = priced({ rooms: [{ adults: 3 }] });
    expect(result.rooms[0]).toMatchObject({ occupancy: 'triple', charges: [{ rate: 'triple', quantity: 3, unitPrice: 997.5, amount: 2992.5 }] });
    expect(result.total).toBe(2992.5);
    expectConsistent(result);
  });

  it('charges children sharing with two adults the child price', () => {
    const result = priced({ rooms: [{ adults: 2, children: 2 }] });
    expect(result.rooms[0].charges).toEqual([
      { traveller: 'adult', rate: 'double', quantity: 2, unitPrice: 1050, amount: 2100 },
      { traveller: 'child', rate: 'child', quantity: 2, unitPrice: 525, amount: 1050 },
    ]);
    expect(result.total).toBe(3150);
    expect(result.perPerson).toBe(787.5);
  });

  it('charges a child sharing with one adult the double price by default, further children the child price', () => {
    const one = priced({ rooms: [{ adults: 1, children: 1 }] });
    expect(one.rooms[0]).toMatchObject({ occupancy: 'double', amount: 2100 });
    expect(one.rooms[0].charges).toEqual([
      { traveller: 'adult', rate: 'double', quantity: 1, unitPrice: 1050, amount: 1050 },
      { traveller: 'child', rate: 'double', quantity: 1, unitPrice: 1050, amount: 1050 },
    ]);
    const two = priced({ rooms: [{ adults: 1, children: 2 }] });
    expect(two.rooms[0].charges.map(charge => [charge.traveller, charge.rate, charge.quantity])).toEqual([
      ['adult', 'double', 1], ['child', 'double', 1], ['child', 'child', 1],
    ]);
    expect(two.total).toBe(2625);
  });

  it('charges a child with one adult the child price when the package says so', () => {
    const result = priced({ rooms: [{ adults: 1, children: 1 }] }, {
      travellers: { allowChildren: true, allowInfants: true, childMinAge: 2, childMaxAge: 11, childWithOneAdult: 'child' },
    });
    expect(result.rooms[0].charges).toEqual([
      { traveller: 'adult', rate: 'double', quantity: 1, unitPrice: 1050, amount: 1050 },
      { traveller: 'child', rate: 'child', quantity: 1, unitPrice: 525, amount: 525 },
    ]);
    expect(result.total).toBe(1575);
  });

  it('does not count infants towards the group size, and charges the infant price', () => {
    const result = priced({ tierKey: 'diamond', rooms: [{ adults: 1, infants: 1 }] });
    expect(result.groupSize).toEqual({ min: 1, max: 1 });
    expect(result.travellers).toEqual({ adults: 1, children: 0, infants: 1 });
    expect(result.rooms[0].charges).toEqual([
      { traveller: 'adult', rate: 'single', quantity: 1, unitPrice: 2415, amount: 2415 },
      { traveller: 'infant', rate: 'infant', quantity: 1, unitPrice: 52.5, amount: 52.5 },
    ]);
    expect(result.perPerson).toBe(2467.5);
  });

  it('records a free infant as a zero line rather than hiding it', () => {
    const result = priced({ rooms: [{ adults: 2, infants: 1 }] });
    expect(result.rooms[0].charges[1]).toEqual({ traveller: 'infant', rate: 'infant', quantity: 1, unitPrice: 0, amount: 0 });
    expect(result.total).toBe(2100);
  });

  it('picks the group size from every room together', () => {
    const four = priced({ rooms: [{ adults: 2 }, { adults: 2 }] });
    expect(four.groupSize).toEqual({ min: 2, max: 4 });
    expect(four.total).toBe(4200);
    const five = priced({ rooms: [{ adults: 2 }, { adults: 2, children: 1 }] });
    expect(five.groupSize).toEqual({ min: 5, max: 16 });
    expect(five.rooms.map(room => room.amount)).toEqual([1680, 2100]);
    expect(five.total).toBe(3780);
    expectConsistent(five);
  });

  it('uses the hotel level and season of the departure date', () => {
    expect(priced({ tierKey: 'diamond' }).total).toBe(2940);
    expect(priced({ date: SUMMER_DAY }).total).toBe(1470);
    expect(priced({ date: SUMMER_DAY, tierKey: 'diamond' }).total).toBe(2310);
  });

  it('treats both ends of a season as inside it', () => {
    expect(priced({ date: '2027-04-30' }).season.key).toBe('winter');
    expect(priced({ date: '2027-05-01' }).season.key).toBe('summer');
    expect(priced({ date: '2026-10-03' }).season.key).toBe('winter');
  });

  it('returns no fee lines when the fee is zero', () => {
    const result = priced({ rooms: [{ adults: 2 }] }, {}, { feeBasisPoints: 0 });
    expect(result).toMatchObject({ total: 2000, serviceFee: 0, subtotal: 2000, feeBasisPoints: 0 });
  });
});

describe('package room rules', () => {
  it.each([
    [{ rooms: [{ adults: 0, children: 1 }] }, {}, 'Room 1 needs at least one adult. Children and infants share a room with an adult.'],
    [{ rooms: [{ adults: 2 }, { adults: 0, infants: 1 }] }, {}, 'Room 2 needs at least one adult. Children and infants share a room with an adult.'],
    [{ rooms: [{ adults: 3 }] }, { rooms: { allowSingle: true, allowTriple: false, maxChildrenPerRoom: 2, maxInfantsPerRoom: 1 } }, 'Room 1: rooms for three adults are not offered on this trip. Split them across two rooms.'],
    [{ rooms: [{ adults: 2 }, { adults: 1 }] }, { rooms: { allowSingle: false, allowTriple: true, maxChildrenPerRoom: 2, maxInfantsPerRoom: 1 } }, 'Room 2: single rooms are not offered on this trip. Put each adult in a room with at least one other traveller.'],
    [{ rooms: [{ adults: 2, children: 2 }] }, { rooms: { allowSingle: true, allowTriple: true, maxChildrenPerRoom: 1, maxInfantsPerRoom: 1 } }, 'Room 1 can take at most 1 child.'],
    [{ rooms: [{ adults: 2, infants: 2 }] }, {}, 'Room 1 can take at most 1 infant.'],
    [{ rooms: [{ adults: 2, children: 1 }] }, { travellers: { allowChildren: false, allowInfants: true, childMinAge: 2, childMaxAge: 11, childWithOneAdult: 'double' } }, 'This trip is for adults only.'],
    [{ rooms: [{ adults: 2, infants: 1 }] }, { travellers: { allowChildren: true, allowInfants: false, childMinAge: 3, childMaxAge: 11, childWithOneAdult: 'double' } }, 'This trip cannot take infants (under 3).'],
  ] as Array<[Partial<PackageSelectionInput>, Partial<PackageDetailsInput>, string]>)('refuses %j', (selection, overrides, message) => {
    const result = refused(selection, overrides);
    expect(result).toMatchObject({ code: 'ROOM_INVALID', message });
  });

  it('allows a single parent with a child even where single rooms are not offered', () => {
    const result = priced({ rooms: [{ adults: 1, children: 1 }] }, { rooms: { allowSingle: false, allowTriple: true, maxChildrenPerRoom: 2, maxInfantsPerRoom: 1 } });
    expect(result.rooms[0].occupancy).toBe('double');
  });

  it('refuses group sizes the trip does not take, infants not counted', () => {
    const tooMany = refused({ rooms: [{ adults: 3, children: 2 }, { adults: 3, children: 2 }, { adults: 3, children: 2 }, { adults: 3 }] });
    expect(tooMany).toMatchObject({ code: 'PARTY_SIZE', message: 'This trip is for 1 to 16 travellers (infants not counted).' });
    const fixedSize = refused({ rooms: [{ adults: 2 }] }, { groupBands: [{ key: 'solo', min: 1, max: 1 }], rates: [] });
    expect(fixedSize.message).toBe('This trip is for 1 traveller (infants not counted).');
  });

  it('refuses a hotel level that does not exist', () => {
    expect(refused({ tierKey: 'platinum' })).toMatchObject({ code: 'UNKNOWN_TIER', message: 'Choose one of the hotel levels shown.' });
  });

  it('refuses a choice whose price is not set yet', () => {
    const rates = samplePackage().rates.map(row => (row.tierKey === 'gold' && row.seasonKey === 'winter' && row.bandKey === 'small' ? { ...row, child: null } : row));
    expect(priced({ rooms: [{ adults: 2 }] }, { rates }).total).toBe(2100);
    expect(refused({ rooms: [{ adults: 2, children: 1 }] }, { rates })).toMatchObject({ code: 'NO_PRICE', room: 1 });
    expect(refused({}, { rates: rates.filter(row => !(row.tierKey === 'gold' && row.seasonKey === 'winter')) })).toMatchObject({ code: 'NO_PRICE' });
  });
});

describe('package dates', () => {
  it.each([
    ['2026-09-30', 'past', 'This date has passed. Choose another date.'],
    ['2026-10-01', 'too-soon', "This trip needs 2 days' notice. Choose a later date."],
    ['2026-10-02', 'too-soon', "This trip needs 2 days' notice. Choose a later date."],
    ['2026-12-31', 'not-running', 'This trip does not start on this date. Choose another date.'],
    ['2027-10-01', 'no-price', 'This date has no price yet. Choose another date.'],
    ['2027-10-02', 'too-far', 'This date is not open for booking yet. Choose an earlier date.'],
  ])('refuses %s as %s', (date, status, message) => {
    const result = refused({ date });
    expect(result).toMatchObject({ code: status === 'no-price' ? 'NO_PRICE' : 'DATE_UNAVAILABLE', dateStatus: status, message });
  });

  it('opens the first day after the notice period', () => {
    expect(priced({ date: '2026-10-03' }).departureDate).toBe('2026-10-03');
    expect(packageDateStatus(samplePackage({ minNoticeDays: 0 }), TODAY, TODAY)).toBe('open');
    expect(refused({ date: '2026-10-01' }, { minNoticeDays: 1 }).message).toBe("This trip needs a day's notice. Choose a later date.");
  });

  it('starts an any-day package only on its weekdays', () => {
    const fridaysOnly = samplePackage({ daily: { weekdays: [5], blackoutDates: [], horizonMonths: 12, dailyCapacity: 20 } });
    expect(packageDateStatus(fridaysOnly, '2026-11-13', TODAY)).toBe('open');
    expect(packageDateStatus(fridaysOnly, '2026-11-12', TODAY)).toBe('not-running');
  });

  it('judges a fixed-departure package by notice, horizon and season only (seats are the database)', () => {
    const fixed = samplePackage({ departureMode: 'fixed', daily: { weekdays: [], blackoutDates: [], horizonMonths: 1, dailyCapacity: 1 } });
    expect(packageDateStatus(fixed, '2026-12-31', TODAY)).toBe('open');
    expect(packageDateStatus(fixed, '2027-06-15', TODAY)).toBe('open');
    expect(packageDateStatus(fixed, '2028-10-02', TODAY)).toBe('too-far');
  });

  it('finds the first bookable day', () => {
    expect(firstBookableDate(samplePackage(), TODAY)).toBe('2026-10-03');
    expect(firstBookableDate(samplePackage({ seasons: [], rates: [] }), TODAY)).toBeNull();
    const fixed = samplePackage({ departureMode: 'fixed' });
    expect(firstBookableDate(fixed, TODAY, ['2026-10-02', '2026-11-20', '2026-10-25'])).toBe('2026-10-25');
    expect(firstBookableDate(fixed, TODAY, [])).toBeNull();
  });

  it('does calendar arithmetic on calendar days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-10-01', 12)).toBe('2027-10-01');
    expect(monthDays('2027-02')).toHaveLength(28);
    expect(monthDays('2028-02').slice(-1)).toEqual(['2028-02-29']);
  });

  it("reads today in the operator's time zone", () => {
    const lateEvening = new Date('2026-10-01T20:00:00.000Z');
    expect(todayInZone('Asia/Kolkata', lateEvening)).toBe('2026-10-02');
    expect(todayInZone('America/New_York', lateEvening)).toBe('2026-10-01');
  });
});

describe('package extras', () => {
  const party = { rooms: [{ adults: 2, children: 1 }, { adults: 2 }] };

  it('prices extras per traveller with a child price', () => {
    const result = priced({ ...party, extras: [{ id: 'balloon', adults: 3, children: 1 }] });
    expect(result.extras).toEqual([{
      id: 'balloon', name: 'Hot-air balloon over Luxor', unit: 'per_traveller', adults: 3, children: 1, amount: 472.5,
      charges: [
        { traveller: 'adult', rate: 'extra', quantity: 3, unitPrice: 126, amount: 378 },
        { traveller: 'child', rate: 'extra-child', quantity: 1, unitPrice: 94.5, amount: 94.5 },
      ],
    }]);
    expectConsistent(result);
  });

  it('charges children the adult price for an extra without a child price', () => {
    const result = priced({ ...party, extras: [{ id: 'abu-simbel', adults: 1, children: 1 }] });
    expect(result.extras[0].charges.map(charge => charge.unitPrice)).toEqual([157.5, 157.5]);
  });

  it('charges a per-room extra for every room', () => {
    const result = priced({ ...party, extras: [{ id: 'extra-night', quantity: 2 }] });
    expect(result.extras[0]).toMatchObject({ quantity: 2, rooms: 2, amount: 399, charges: [{ traveller: 'unit', quantity: 4, unitPrice: 99.75, amount: 399 }] });
  });

  it('charges a per-booking extra by quantity, one unit by default', () => {
    expect(priced({ extras: [{ id: 'airport' }] }).extras[0]).toMatchObject({ quantity: 1, amount: 42 });
    expect(priced({ extras: [{ id: 'airport', quantity: 2 }] }).extras[0].amount).toBe(84);
  });

  it('adds extras to the total and the per-person figure', () => {
    const result = priced({ ...party, extras: [{ id: 'balloon', adults: 4, children: 1 }, { id: 'airport', quantity: 1 }] });
    // Five travellers price at the 5–16 group size: 2 × 840 + 420, then 2 × 840.
    const rooms = 2100 + 1680;
    expect(result.total).toBe(rooms + 4 * 126 + 94.5 + 42);
    expect(result.perPerson).toBe(Math.round(cents(result.total) / 5) / 100);
    expectConsistent(result);
  });

  it('keeps the trip price per person apart from extras, so a hotel level does not look dearer once an extra is added', () => {
    const without = priced(party);
    const withExtras = priced({ ...party, extras: [{ id: 'balloon', adults: 4, children: 1 }, { id: 'airport', quantity: 1 }] });
    expect(without.tripPerPerson).toBe(756);
    expect(without.perPerson).toBe(756);
    expect(withExtras.tripPerPerson).toBe(756);
    expect(withExtras.perPerson).toBeGreaterThan(756);
    expectConsistent(withExtras);
  });

  it.each([
    [{ id: 'ghost' }, 'UNKNOWN_EXTRA', 'One of the extras you chose is no longer offered. Review your extras.'],
    [{ id: 'balloon' }, 'EXTRA_INVALID', 'Hot-air balloon over Luxor: choose who it is for.'],
    [{ id: 'balloon', adults: 5 }, 'EXTRA_INVALID', 'Hot-air balloon over Luxor: there are 4 adults on this booking.'],
    [{ id: 'balloon', children: 2 }, 'EXTRA_INVALID', 'Hot-air balloon over Luxor: there is 1 child on this booking.'],
    [{ id: 'balloon', quantity: 2 }, 'EXTRA_INVALID', 'Hot-air balloon over Luxor: choose how many adults and children it is for.'],
    [{ id: 'extra-night', quantity: 4 }, 'EXTRA_INVALID', 'Extra night in Cairo: you can add up to 3.'],
    [{ id: 'extra-night', adults: 2 }, 'EXTRA_INVALID', 'Extra night in Cairo: choose a quantity.'],
  ])('refuses %j', (extra, code, message) => {
    expect(refused({ ...party, extras: [extra] })).toMatchObject({ code, message });
  });

  it('refuses the same extra twice and an extra with no price yet', () => {
    expect(refused({ extras: [{ id: 'airport' }, { id: 'airport' }] })).toMatchObject({ code: 'EXTRA_INVALID', message: 'Each extra can be added once.' });
    const extras = samplePackage().extras.map(extra => (extra.id === 'airport' ? { ...extra, price: null } : extra));
    expect(refused({ extras: [{ id: 'airport' }] }, { extras })).toMatchObject({ code: 'NO_PRICE', extraId: 'airport' });
  });
});

describe('package price arithmetic', () => {
  it('keeps every figure consistent with awkward prices', () => {
    const awkward = samplePackage({
      rates: samplePackage().rates.map(row => ({ ...row, double: 99.99, single: 133.33, triple: 0.01, child: 33.33, infant: 0.07 })),
      extras: [{ id: 'odd', name: 'Odd', description: '', unit: 'per_traveller', price: 0.19, priceChild: 0.11, maxQuantity: 1 }],
    });
    const selections = [
      { rooms: [{ adults: 1 }] },
      { rooms: [{ adults: 2, children: 2, infants: 1 }, { adults: 3, children: 1 }, { adults: 1, children: 2 }] },
      { rooms: [{ adults: 3 }, { adults: 3 }, { adults: 2, infants: 1 }], extras: [{ id: 'odd', adults: 7, children: 0 }] },
    ];
    for (const selection of selections) {
      const result = pricePackageSelection({
        details: awkward, currency: 'EUR', today: TODAY,
        selection: packageSelectionSchema.parse({ date: WINTER_DAY, tierKey: 'gold', ...selection }),
      });
      if (!result.ok) throw new Error(result.message);
      expectConsistent(result.quote);
      // The fee inside each unit price is 5 % to the cent, so the whole fee stays within half a
      // cent per priced unit of 5 % of the operator's prices.
      const units = [...result.quote.rooms, ...result.quote.extras].flatMap(line => line.charges).reduce((sum, charge) => sum + charge.quantity, 0);
      expect(Math.abs(cents(result.quote.serviceFee) - cents(result.quote.subtotal) * 0.05)).toBeLessThanOrEqual(units * 0.5);
    }
  });

  it('identifies a quote by its selection and total, ignoring the order of extras', () => {
    const selection = packageSelectionSchema.parse({ date: WINTER_DAY, tierKey: 'gold', rooms: [{ adults: 2 }], extras: [{ id: 'airport' }, { id: 'balloon', adults: 2 }] });
    const reordered = { ...selection, extras: [...selection.extras].reverse() };
    const hash = packageQuoteHash('pkg1', selection, { currency: 'USD', total: 2394 });
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
    expect(packageQuoteHash('pkg1', reordered, { currency: 'USD', total: 2394 })).toBe(hash);
    expect(packageQuoteHash('pkg1', selection, { currency: 'USD', total: 2394.01 })).not.toBe(hash);
    expect(packageQuoteHash('pkg1', selection, { currency: 'EUR', total: 2394 })).not.toBe(hash);
    expect(packageQuoteHash('pkg2', selection, { currency: 'USD', total: 2394 })).not.toBe(hash);
    expect(packageQuoteHash('pkg1', { ...selection, tierKey: 'diamond' }, { currency: 'USD', total: 2394 })).not.toBe(hash);
  });
});

describe('package "from" prices', () => {
  it('advertises the cheapest bookable price for two sharing, with its date', () => {
    expect(packageFromPrice(samplePackage(), TODAY)).toEqual({ perPerson: 735, date: '2027-05-01', tierKey: 'gold', travellers: 2, basis: 'double' });
  });

  it('never advertises a season that cannot be booked', () => {
    const shortHorizon = samplePackage({ daily: { weekdays: [0, 1, 2, 3, 4, 5, 6], blackoutDates: [], horizonMonths: 6, dailyCapacity: 20 } });
    expect(packageFromPrice(shortHorizon, TODAY)).toEqual({ perPerson: 1050, date: '2026-10-03', tierKey: 'gold', travellers: 2, basis: 'double' });
    expect(packageFromPrice(samplePackage(), '2027-10-01')).toBeNull();
  });

  it('uses only real departures for a fixed-departure package', () => {
    const fixed = samplePackage({ departureMode: 'fixed' });
    expect(packageFromPrice(fixed, TODAY, ['2026-11-20', '2026-12-05'])).toMatchObject({ perPerson: 1050, date: '2026-11-20' });
    expect(packageFromPrice(fixed, TODAY, ['2026-11-20', '2027-07-01'])).toMatchObject({ perPerson: 735, date: '2027-07-01' });
    expect(packageFromPrice(fixed, TODAY, [])).toBeNull();
  });

  it('uses the smallest group the trip takes when it does not take two', () => {
    const groupsOnly = samplePackage({ groupBands: [{ key: 'large', min: 5, max: 16 }], rates: samplePackage().rates.filter(row => row.bandKey === 'large') });
    expect(packageFromPrice(groupsOnly, TODAY)).toMatchObject({ travellers: 5, basis: 'double', perPerson: 630 });
    const soloOnly = samplePackage({ groupBands: [{ key: 'solo', min: 1, max: 1 }], rates: samplePackage().rates.filter(row => row.bandKey === 'solo') });
    expect(packageFromPrice(soloOnly, TODAY)).toMatchObject({ travellers: 1, basis: 'single', perPerson: 1365 });
  });
});

describe('package calendar', () => {
  const calendar = (departures: Array<[string, PackageDepartureState]>, travellers = 2, overrides: Partial<PackageDetailsInput> = {}) =>
    packageCalendar({ details: samplePackage(overrides), month: '2026-10', today: TODAY, travellers, departures: new Map(departures) });

  it('shows each day of the month with seats and the cheapest per-person price', () => {
    const days = calendar([]);
    expect(days).toHaveLength(31);
    expect(days.slice(0, 3)).toEqual([
      { date: '2026-10-01', status: 'closed', reason: 'too-soon' },
      { date: '2026-10-02', status: 'closed', reason: 'too-soon' },
      { date: '2026-10-03', status: 'available', seatsLeft: 20, perPersonFrom: 1050 },
    ]);
  });

  it('counts bookings and stop-sales on any-day packages', () => {
    const days = calendar([
      ['2026-10-10', { booked: 5, blocked: false }],
      ['2026-10-11', { booked: 19, blocked: false }],
      ['2026-10-12', { booked: 20, blocked: false }],
      ['2026-10-13', { booked: 0, blocked: true }],
      ['2026-10-14', { capacity: 99, booked: 0, blocked: false }],
    ]);
    const byDate = Object.fromEntries(days.map(day => [day.date, day]));
    expect(byDate['2026-10-10']).toEqual({ date: '2026-10-10', status: 'available', seatsLeft: 15, perPersonFrom: 1050 });
    expect(byDate['2026-10-11']).toEqual({ date: '2026-10-11', status: 'closed', reason: 'not-enough-seats', seatsLeft: 1 });
    expect(byDate['2026-10-12']).toEqual({ date: '2026-10-12', status: 'sold-out', seatsLeft: 0 });
    expect(byDate['2026-10-13']).toEqual({ date: '2026-10-13', status: 'closed', reason: 'blocked' });
    // An any-day package always uses its own daily capacity.
    expect(byDate['2026-10-14'].seatsLeft).toBe(20);
  });

  it('opens only dated departures on a fixed-departure package', () => {
    const days = calendar([
      ['2026-10-20', { capacity: 12, booked: 4, blocked: false }],
      ['2026-10-27', { capacity: 12, booked: 12, blocked: false }],
    ], 2, { departureMode: 'fixed' });
    const open = days.filter(day => day.status !== 'closed');
    expect(open).toEqual([
      { date: '2026-10-20', status: 'available', seatsLeft: 8, perPersonFrom: 1050 },
      { date: '2026-10-27', status: 'sold-out', seatsLeft: 0 },
    ]);
    expect(days.find(day => day.date === '2026-10-21')).toEqual({ date: '2026-10-21', status: 'closed', reason: 'no-departure' });
  });

  it('prices each day for the party size asked for', () => {
    expect(calendar([], 1)[2].perPersonFrom).toBe(1680);
    expect(calendar([], 6)[2].perPersonFrom).toBe(840);
    expect(calendar([], 17)[2]).toMatchObject({ status: 'closed', reason: 'party-size' });
  });
});
