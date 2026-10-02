import { createHash } from 'crypto';
import { packageDetailsSchema, publicPackageDetails, PackageDetailsInput, packagePublishProblems } from '../utils/packageDetails';
import { datePerPersonFrom, packageQuoteHash, packageSelectionSchema, pricePackageSelection } from '../services/packagePricing.service';
import { packageArrivalDetailsSchema, packageGuestDetailsProblem, packageTravellerDetailsSchema } from '../services/packageGuestDetails.service';
import { packageBookingSnapshot, packageSelfCancellationProblem } from '../services/packageBooking.service';
import { samplePackage, samplePackageInput } from '../test/packageFixture';

const TODAY = '2026-10-01';
const DEPARTURE = '2026-11-10';
const hotel = { name: 'Example accommodation', city: 'Cairo', nights: 2, stars: 5, description: 'River views', imageUrls: ['https://example.com/hotel.jpg'], amenities: ['Pool'], accommodationType: 'cruise' as const, roomType: 'River cabin', vesselName: 'Example vessel' };
const configured = (): Partial<PackageDetailsInput> => ({
  extras: [
    { id: 'included', name: 'Included cabin', unit: 'per_booking', price: 0, accommodation: hotel },
    { id: 'suite', name: 'Suite cabin', unit: 'per_booking', price: 200, accommodation: { ...hotel, roomType: 'Suite' } },
    { id: 'french', name: 'French guide', unit: 'per_traveller', price: 30, priceChild: 15 },
    { id: 'english', name: 'English guide', unit: 'per_traveller', price: 0 },
    { id: 'before', name: 'Pre-trip night', unit: 'per_room', price: 100, maxQuantity: 3, timing: 'before_trip', accommodation: hotel },
    { id: 'before-other', name: 'Other pre-trip stay', unit: 'per_room', price: 110, maxQuantity: 3, timing: 'before_trip' },
    { id: 'after', name: 'Post-trip night', unit: 'per_room', price: 120, maxQuantity: 3, timing: 'after_trip' },
  ],
  optionGroups: [
    { id: 'cabin', name: 'Cabin', kind: 'cabin', required: true, extraIds: ['included', 'suite'] },
    { id: 'guide', name: 'Guide language', kind: 'guide', required: false, extraIds: ['french', 'english'] },
  ],
});
const select = (overrides: Record<string, unknown> = {}) => packageSelectionSchema.parse({ date: DEPARTURE, tierKey: 'gold', rooms: [{ adults: 2 }], extras: [], ...overrides });
const price = (overrides: Record<string, unknown> = {}, details = samplePackage(configured())) => pricePackageSelection({ details, currency: 'USD', today: TODAY, selection: select(overrides) });
const good = (overrides: Record<string, unknown> = {}, details = samplePackage(configured())) => { const result = price(overrides, details); if (!result.ok) throw new Error(result.message); return result.quote; };

describe('package completion configuration', () => {
  it('old documents gain disabled requirements and no option choices without losing data', () => {
    const old = samplePackageInput();
    const parsed = packageDetailsSchema.parse(old);
    expect(parsed.optionGroups).toEqual([]);
    expect(parsed.rooms.bedPreferences).toEqual([]);
    expect(parsed.bookingRequirements).toEqual({ travellerNames: false, dateOfBirth: false, nationality: false, arrivalDetails: 'hidden', bedPreference: false });
    expect(parsed.tiers[0].hotels).toEqual(old.tiers![0].hotels);
  });
  it('publishes descriptive accommodation and grouped choice metadata with fee inclusive prices', () => {
    const details = samplePackage(configured());
    const shown = publicPackageDetails(details) as any;
    expect(shown.extras[1]).toMatchObject({ price: 210, accommodation: { roomType: 'Suite' } });
    expect(shown.extras[4]).toMatchObject({ timing: 'before_trip', maxQuantity: 3 });
    expect(shown.optionGroups).toEqual(details.optionGroups);
    expect(shown).not.toHaveProperty('rates');
    expect(packageDetailsSchema.parse(details)).toEqual(details);
  });
  it.each([
    { optionGroups: [{ id: 'bad', kind: 'hotel', extraIds: ['unknown'] }] },
    { optionGroups: [{ id: 'bad', kind: 'hotel', extraIds: ['balloon', 'balloon'] }] },
    { optionGroups: [{ id: 'one', kind: 'hotel', extraIds: ['balloon'] }, { id: 'two', kind: 'other', extraIds: ['balloon'] }] },
    { extras: [{ id: 'bad', unit: 'per_booking', price: 2, timing: 'before_trip' }] },
    { extras: [{ id: 'bad', unit: 'per_booking', price: 2, accommodation: { name: '<script>', imageUrls: ['http://example.com/x.jpg'] } }] },
    { rooms: { bedPreferences: ['double', 'double'] } },
    { bookingRequirements: { bedPreference: true } },
  ])('rejects ambiguous or hostile configuration %j', (overrides) => {
    expect(packageDetailsSchema.safeParse({ ...samplePackageInput(), ...overrides }).success).toBe(false);
  });
  it('draft empty option groups cannot be published', () => {
    expect(packagePublishProblems(samplePackage({ optionGroups: [{ id: 'empty', name: '', kind: 'meal' }] }), TODAY)).toEqual(expect.arrayContaining(['Option group 1: add a name', 'Option group 1: add at least one choice']));
  });
});

describe('package grouped choices and quoted requests', () => {
  it('does not choose a required option for the guest; a partial quote is explicitly incomplete', () => {
    expect(good()).toMatchObject({ bookingReady: false, total: 2100, selectionProblems: [{ code: 'OPTION_REQUIRED', groupId: 'cabin', message: 'Choose an option for Cabin.' }] });
    expect(good({ extras: [{ id: 'included', quantity: 1 }] })).toMatchObject({ bookingReady: true, total: 2100, selectionProblems: [] });
  });
  it.each([
    { extras: [{ id: 'included' }, { id: 'suite' }] },
    { extras: [{ id: 'included' }, { id: 'included' }] },
    { extras: [{ id: 'french', adults: 1 }] },
    { extras: [{ id: 'suite', quantity: 2 }] },
    { extras: [{ id: 'before', quantity: 1 }, { id: 'before-other', quantity: 1 }] },
  ])('hard refuses invalid choices %j', (selection) => {
    expect(price(selection)).toMatchObject({ ok: false, code: 'EXTRA_INVALID' });
  });
  it('prices grouped guide selections for every adult and child, and extra nights for every room', () => {
    const result = good({ rooms: [{ adults: 2, children: 1 }, { adults: 1 }], extras: [{ id: 'included' }, { id: 'french', adults: 3, children: 1 }, { id: 'before', quantity: 2 }, { id: 'after', quantity: 3 }] });
    expect(result.extras[1]).toMatchObject({ amount: 110.25, optionGroup: { id: 'guide', name: 'Guide language', kind: 'guide' } });
    expect(result.extras[2]).toMatchObject({ amount: 420, fromDate: '2026-11-08', toDate: DEPARTURE, timing: 'before_trip', accommodation: hotel });
    expect(result.extras[3]).toMatchObject({ amount: 756, fromDate: '2026-11-17', toDate: '2026-11-20', timing: 'after_trip' });
  });
  it('keeps old hash commitments byte-identical and binds a requested bed preference', () => {
    const selection = select(); const quote = good({}, samplePackage());
    const oldHash = createHash('sha256').update(JSON.stringify(['id', selection.date, selection.tierKey, [[2, 0, 0]], [], 'USD', 210000])).digest('hex').slice(0, 32);
    expect(packageQuoteHash('id', selection, quote)).toBe(oldHash);
    const twin = select({ rooms: [{ adults: 2, bedPreference: 'twin' }] });
    expect(packageQuoteHash('id', twin, quote)).not.toBe(oldHash);
    expect(price({ rooms: twin.rooms })).toMatchObject({ ok: false, code: 'ROOM_INVALID' });
    expect(good({ rooms: twin.rooms }, samplePackage({ ...configured(), rooms: { bedPreferences: ['twin'] } })).rooms[0].bedPreference).toBe('twin');
  });
  it('includes the cheapest required choices in advertised prices, without underquoting them', () => {
    const details = samplePackage({ ...configured(), optionGroups: [{ id: 'guide', name: 'Guide', kind: 'guide', required: true, extraIds: ['french'] }] });
    expect(datePerPersonFrom(details, DEPARTURE, 2)).toEqual({ perPerson: 1081.5, tierKey: 'gold' });
    const result = good({ extras: [{ id: 'french', adults: 2 }] }, details);
    expect(result.perPerson).toBe(1081.5);
    expect(datePerPersonFrom(samplePackage(), DEPARTURE, 2)).toEqual({ perPerson: 1050, tierKey: 'gold' });
  });
  it('finds a valid required-night combination and closes an impossible one', () => {
    const details = samplePackage({ ...configured(), optionGroups: [
      { id: 'one', name: 'One', kind: 'extra_night', required: true, extraIds: ['before'] },
      { id: 'two', name: 'Two', kind: 'extra_night', required: true, extraIds: ['before-other', 'after'] },
    ] });
    expect(datePerPersonFrom(details, DEPARTURE, 2)?.perPerson).toBe(1165.5);
    details.optionGroups[1].extraIds = ['before-other'];
    expect(datePerPersonFrom(details, DEPARTURE, 2)).toBeNull();
  });
  it('refuses pre-trip nights in the past and does not advertise required past accommodation', () => {
    const details = samplePackage({ ...configured(), minNoticeDays: 0, optionGroups: [{ id: 'stay', name: 'Stay', kind: 'extra_night', required: true, extraIds: ['before'] }] });
    expect(price({ date: TODAY, extras: [{ id: 'before', quantity: 1 }] }, details)).toMatchObject({ ok: false, code: 'EXTRA_INVALID' });
    expect(datePerPersonFrom(details, TODAY, 2, undefined, TODAY)).toBeNull();
    expect(datePerPersonFrom(details, '2026-10-02', 2, undefined, TODAY)).toEqual({ perPerson: 1102.5, tierKey: 'gold' });
  });
  it('uses an actual triple-room allocation when a required option is priced per room', () => {
    const details = samplePackage({ ...configured(), optionGroups: [{ id: 'stay', name: 'Stay', kind: 'extra_night', required: true, extraIds: ['before'] }] });
    const from = datePerPersonFrom(details, DEPARTURE, 3);
    const actual = good({ rooms: [{ adults: 3 }], extras: [{ id: 'before', quantity: 1 }] }, details);
    expect(from?.perPerson).toBe(actual.perPerson);
    expect(price({ rooms: [{ adults: 3, bedPreference: 'twin' }] }, samplePackage({ rooms: { bedPreferences: ['twin'] } }))).toMatchObject({ ok: false, code: 'ROOM_INVALID' });
  });
  it.each(['timing', 'hotel', 'required-group', 'bed-requirement'] as const)('binds a same-price %s change into the reviewed quote', (change) => {
    const details = samplePackage({ ...configured(), rooms: { bedPreferences: ['twin'] } });
    const selected = { extras: [{ id: 'included' }, { id: 'before', quantity: 2 }] };
    const selection = select(selected);
    const before = good(selected, details);
    const beforeHash = packageQuoteHash('id', selection, before);
    if (change === 'timing') details.extras.find(extra => extra.id === 'before')!.timing = 'after_trip';
    if (change === 'hotel') details.extras[0].accommodation!.name = 'Different property';
    if (change === 'required-group') details.optionGroups[0].required = false;
    if (change === 'bed-requirement') details.bookingRequirements.bedPreference = true;
    const after = good(selected, details);
    expect(after.total).toBe(before.total);
    expect(packageQuoteHash('id', selection, after)).not.toBe(beforeHash);
  });
  it('preserves semantic quote identity across extra selection ordering', () => {
    const one = { extras: [{ id: 'included' }, { id: 'before', quantity: 2 }] };
    const two = { extras: [...one.extras].reverse() };
    expect(packageQuoteHash('id', select(one), good(one))).toBe(packageQuoteHash('id', select(two), good(two)));
  });
  it('anchors cancellation to the first paid pre-trip stay and refuses free cancellation after it starts', () => {
    const details = samplePackage({ ...configured(), cancellation: [{ daysBefore: 1, refundPercent: 100 }, { daysBefore: 0, refundPercent: 0 }] });
    const quote = good({ extras: [{ id: 'included' }, { id: 'before', quantity: 2 }] }, details);
    expect(quote.cancellationReferenceDate).toBe('2026-11-08');
    const snapshot = packageBookingSnapshot({ details, quote, quoteHash: 'a'.repeat(32) });
    expect(snapshot.cancellation[0].cancelBy).toBe('2026-11-07');
    expect(packageSelfCancellationProblem({ packageBooking: snapshot, paymentStatus: 'succeeded' }, '2026-11-07')).toBeNull();
    expect(packageSelfCancellationProblem({ packageBooking: snapshot, paymentStatus: 'succeeded' }, '2026-11-08')).toContain('first service date');
    expect(packageSelfCancellationProblem({ packageBooking: snapshot, paymentStatus: 'succeeded' }, '2026-11-09')).toContain('first service date');
    snapshot.cancellation = [{ daysBefore: 0, refundPercent: 100, cancelBy: '2026-11-08' }];
    expect(packageSelfCancellationProblem({ packageBooking: snapshot, paymentStatus: 'succeeded' }, '2026-11-08')).toContain('first service date');
    const legacy = packageBookingSnapshot({ details: samplePackage(), quote: good({}, samplePackage()), quoteHash: 'a'.repeat(32) });
    expect(legacy).not.toHaveProperty('cancellationReferenceDate');
  });
});

const travellerDetails = () => [
  { name: 'First Traveller', type: 'adult' as const, dateOfBirth: '1990-10-01', nationality: 'Egypt' },
  { name: 'Second Traveller', type: 'adult' as const, dateOfBirth: '1991-10-01', nationality: 'Egypt' },
];
const guestProblem = (overrides: Record<string, unknown> = {}, requirementOverrides = {}) => {
  const details = samplePackage({ bookingRequirements: { travellerNames: true, dateOfBirth: true, nationality: true, ...requirementOverrides } });
  const selection = select();
  return packageGuestDetailsProblem({ details, selection, quote: good({}, details), today: TODAY, travellerDetails: travellerDetails(), ...overrides });
};
describe('complete guest details at booking', () => {
  it('accepts valid typed details and keeps unconfigured legacy booking valid', () => {
    expect(guestProblem()).toBeNull();
    expect(guestProblem({ travellerDetails: undefined }, { travellerNames: false, dateOfBirth: false, nationality: false })).toBeNull();
  });
  it.each([
    [undefined, 'Enter the requested details'],
    [[travellerDetails()[0]], 'all 2 travellers'],
    [[travellerDetails()[0], { ...travellerDetails()[1], type: 'child' }], 'Traveller types must match'],
    [[travellerDetails()[0], { ...travellerDetails()[1], dateOfBirth: undefined }], 'date of birth'],
    [[travellerDetails()[0], { ...travellerDetails()[1], nationality: undefined }], 'nationality'],
    [[travellerDetails()[0], { ...travellerDetails()[1], dateOfBirth: '2027-01-01' }], 'valid date of birth'],
    [[travellerDetails()[0], { ...travellerDetails()[1], dateOfBirth: '2015-01-01' }], 'selected traveller type'],
    [[travellerDetails()[0], { ...travellerDetails()[1], dateOfBirth: '1900-01-01' }], 'valid date of birth'],
  ])('rejects incomplete or inconsistent typed details', (value, message) => {
    expect(guestProblem({ travellerDetails: value })).toContain(message);
  });
  it('uses age on departure, not age today, at the child/adult boundary', () => {
    const second = { ...travellerDetails()[1], dateOfBirth: '2014-11-10' };
    expect(guestProblem({ travellerDetails: [travellerDetails()[0], second] })).toBeNull();
    expect(guestProblem({ travellerDetails: [travellerDetails()[0], { ...second, dateOfBirth: '2014-11-11' }] })).toContain('selected traveller type');
  });
  it('rejects impossible DOB, HTML, unrecognized properties and bad times before business validation', () => {
    for (const item of [{ ...travellerDetails()[0], dateOfBirth: '2026-02-30' }, { ...travellerDetails()[0], name: '<img>' }, { ...travellerDetails()[0], passport: 'not accepted' }]) expect(packageTravellerDetailsSchema.safeParse([item]).success).toBe(false);
    for (const item of [{ time: '24:01' }, { pickupLocation: '<script>' }, { date: '2026-02-30' }, { flightNumber: 'x\nFAKE' }]) expect(packageArrivalDetailsSchema.safeParse(item).success).toBe(false);
  });
  it('validates configured arrival data and bed requests without inventing a guarantee', () => {
    expect(guestProblem({ arrivalDetails: { date: DEPARTURE } })).toContain('does not request');
    expect(guestProblem({}, { arrivalDetails: 'required' })).toContain('arrival date, local time and pickup location');
    expect(guestProblem({ arrivalDetails: { date: DEPARTURE, time: '15:20', pickupLocation: 'Cairo airport', airport: 'CAI', flightNumber: 'MS 123' } }, { arrivalDetails: 'required' })).toBeNull();
    expect(guestProblem({ arrivalDetails: { date: '2026-09-30' } }, { arrivalDetails: 'optional' })).toContain('arrival date');
    const details = samplePackage({ rooms: { bedPreferences: ['twin'] }, bookingRequirements: { bedPreference: true } });
    expect(packageGuestDetailsProblem({ details, selection: select(), quote: good({}, details), today: TODAY })).toContain('requested bed preference');
    expect(guestProblem({ travellerNames: ['Wrong', 'Names'] })).toContain('must match');
  });
  it('snapshots all selections and metadata independently of later configuration mutation', () => {
    const details = samplePackage(configured());
    const quote = good({ extras: [{ id: 'included' }, { id: 'before', quantity: 2 }] }, details);
    const people = travellerDetails();
    const snapshot = packageBookingSnapshot({ details, quote, quoteHash: 'a'.repeat(32), travellerDetails: people, arrivalDetails: { date: DEPARTURE, time: '15:20', pickupLocation: 'Cairo airport' } });
    quote.extras[0].accommodation!.name = 'Edited';
    people[0].name = 'Edited';
    details.tiers[0].hotels[0].name = 'Edited';
    expect(snapshot.travellerDetails![0].name).toBe('First Traveller');
    expect(snapshot.extras[0].accommodation!.name).toBe('Example accommodation');
    expect(snapshot.tier.hotels[0].name).toBe('Steigenberger Pyramids');
    expect(snapshot.arrivalDetails?.pickupLocation).toBe('Cairo airport');
  });
});
