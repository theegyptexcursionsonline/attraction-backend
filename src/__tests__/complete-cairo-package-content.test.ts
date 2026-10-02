import { packageDetailsSchema } from '../utils/packageDetails';
import { pricePackageSelection, packageSelectionSchema } from '../services/packagePricing.service';
import { samplePackage } from '../test/packageFixture';
import { applyCairoContent, assertCompletionSchema, buildCairoContentPlan, CAIRO_TARGET, cairoMongoStore, CairoPlan, CairoReceipt, CairoRecord, CairoStore, main, rollbackCairoContent, verifyCairoPlan } from '../scripts/complete-cairo-package-content';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const current = (): CairoRecord => ({
  _id: CAIRO_TARGET.packageId, slug: CAIRO_TARGET.slug, ownerTenantId: CAIRO_TARGET.tenantId, tenantIds: [CAIRO_TARGET.tenantId],
  listingType: 'package', status: 'active', currency: 'USD', packageRevision: 4, presentationRevision: 1, __v: 0, updatedAt: '2026-10-02T12:36:58.295Z',
  inclusions: ['1 night in a 5-star hotel in Cairo', '1 night in a 5-star hotel in Luxor', '3 nights on a 5-star Nile cruise (full board)', 'Meals as mentioned per day', 'Domestic flights'],
  exclusions: ['Tips (optional)', 'Spanish-, German-, Italian- or French-speaking guide (available as an add-on)'], participantRequirements: [],
  packageDetails: samplePackage({ durationDays: 6, durationNights: 5, departureMode: 'fixed', minNoticeDays: 7,
    tiers: ['premium', 'deluxe', 'luxury'].map(key => ({ key, name: key, description: 'Existing level description', hotels: [] })),
    rates: ['premium', 'deluxe', 'luxury'].map((tierKey, i) => ({ tierKey, seasonKey: 'winter', bandKey: 'two-adults', double: [2100, 2200, 2250][i], single: null, triple: null, child: null, infant: null })),
    groupBands: [{ key: 'two-adults', min: 2, max: 2 }], rooms: { allowSingle: false, allowTriple: false, maxChildrenPerRoom: 0, maxInfantsPerRoom: 0 },
    travellers: { allowChildren: false, allowInfants: false, childMinAge: 6, childMaxAge: 17, childWithOneAdult: 'double' }, extras: [],
    itinerary: Array.from({ length: 6 }, (_, index) => ({ day: index + 1, title: `Day ${index + 1}`, description: 'Existing verified itinerary', meals: [], overnight: '', stops: [{ name: 'Cairo', lat: 30.04, lng: 31.23 }] })),
  }) as CairoRecord['packageDetails'],
});
const receiptFor = (plan: CairoPlan): CairoReceipt => ({ version: 1, state: 'prepared', plan, writeAt: '2026-10-03T12:00:00.000Z' });
function fakeStore(record = current()) {
  let row = copy(record);
  let collision = false;
  const store: CairoStore = {
    read: jest.fn(async () => copy(row)),
    cas: jest.fn(async (expected, before, after, time) => {
      if (collision) { row.updatedAt = '2026-10-03T13:00:00.000Z'; return false; }
      if (row.updatedAt !== expected.updatedAt || row.packageRevision !== expected.packageRevision || JSON.stringify(row.packageDetails) !== JSON.stringify(before.packageDetails)) return false;
      row = { ...row, ...copy(after), packageRevision: row.packageRevision + 1, presentationRevision: row.presentationRevision + 1, __v: row.__v + 1, updatedAt: time };
      return true;
    }),
  };
  return { store, value: () => copy(row), change: (patch: Partial<CairoRecord>) => { row = { ...row, ...patch }; }, race: () => { collision = true; } };
}

describe('source-backed Cairo content plan', () => {
  it('completes only verified content and preserves inventory, maps, images, daily meals and policies', () => {
    const record = current(), original = copy(record), plan = buildCairoContentPlan(record), next = plan.after.packageDetails;
    expect(record).toEqual(original);
    expect(next.travellers).toMatchObject({ allowChildren: true, allowInfants: false, childMinAge: 6, childMaxAge: 12, childWithOneAdult: 'child' });
    expect(next.rates.map(row => row.child)).toEqual([1400, 1650, 1750]);
    expect(next.rates.map(row => row.double)).toEqual([2100, 2200, 2250]);
    expect(next.rooms).toEqual({ allowSingle: false, allowTriple: false, maxChildrenPerRoom: 1, maxInfantsPerRoom: 0, bedPreferences: ['double', 'twin'] });
    for (const field of ['groupBands', 'departureMode', 'minNoticeDays', 'daily', 'seasons', 'cancellation']) expect(next[field]).toEqual(original.packageDetails[field]);
    expect(next.itinerary.map(day => day.stops)).toEqual(original.packageDetails.itinerary.map(day => day.stops));
    expect(next.itinerary.map(day => day.meals)).toEqual([[], [], [], [], [], []]);
    expect(next.itinerary.map(day => day.overnight)).toEqual(['Cairo', 'Luxor', 'Nile cruise', 'Nile cruise', 'Nile cruise', '']);
    expect(next.tiers[0].hotels).toEqual(expect.arrayContaining([expect.objectContaining({ name: '5-star hotel in Cairo', nights: 1 }), expect.objectContaining({ name: '5-star hotel in Luxor', nights: 1 }), expect.objectContaining({ name: '5-star Nile cruise', nights: 3 })]));
    expect(JSON.stringify(next.tiers)).not.toContain('imageUrls');
    expect(plan.after.inclusions).toContain('3 nights on a 5-star Nile cruise (full board)');
    expect(plan.after.inclusions).not.toContain('Meals as mentioned per day');
    expect(plan.changedPaths).toContain('packageDetails.rates');
    expect(plan.changedPaths).not.toContain('packageDetails.itinerary.stops');
    verifyCairoPlan(plan);
  });
  it('creates exactly one-language choice with included English and four sourced supplements', () => {
    const plan = buildCairoContentPlan(current());
    expect(plan.after.packageDetails.extras.map(extra => extra.price)).toEqual([0, 250, 250, 250, 250]);
    expect(plan.after.packageDetails.extras.every(extra => extra.unit === 'per_booking' && extra.maxQuantity === 1)).toBe(true);
    expect(plan.after.packageDetails.optionGroups).toEqual([{ id: 'guide-language', name: 'Guide language', kind: 'guide', required: true, extraIds: ['guide-english', 'guide-german', 'guide-spanish', 'guide-french', 'guide-italian'] }]);
    expect(plan.after.packageDetails.bookingRequirements).toEqual({ travellerNames: true, dateOfBirth: true, nationality: false, arrivalDetails: 'optional', bedPreference: true });
  });
  it('round trips through the real schema and prices one adult with one child using the source rates', () => {
    const plan = buildCairoContentPlan(current());
    assertCompletionSchema(plan);
    const details = packageDetailsSchema.parse(plan.after.packageDetails);
    for (const [tierKey, total] of [['premium', 3675], ['deluxe', 4042.5], ['luxury', 4200]] as const) {
      const selection = packageSelectionSchema.parse({ date: '2026-11-10', tierKey, rooms: [{ adults: 1, children: 1, bedPreference: 'twin' }], extras: [{ id: 'guide-english', quantity: 1 }] });
      const priced = pricePackageSelection({ details, currency: 'USD', today: '2026-10-03', selection });
      expect(priced).toMatchObject({ ok: true, quote: { bookingReady: true, total, travellers: { adults: 1, children: 1, infants: 0 } } });
      selection.extras = [{ id: 'guide-german', quantity: 1 }];
      expect(pricePackageSelection({ details, currency: 'USD', today: '2026-10-03', selection })).toMatchObject({ ok: true, quote: { total: total + 262.5 } });
    }
  });
  it('is idempotent and preserves operator-supplied properties and stricter requirements', () => {
    const record = current(); record.packageDetails.tiers[0].hotels = [{ name: 'Operator-selected hotel', city: 'Cairo', nights: 1 }];
    record.packageDetails.bookingRequirements = { nationality: true, arrivalDetails: 'required' };
    const plan = buildCairoContentPlan(record);
    expect(plan.after.packageDetails.tiers[0].hotels).toEqual(record.packageDetails.tiers[0].hotels);
    expect(plan.after.packageDetails.bookingRequirements).toMatchObject({ nationality: true, arrivalDetails: 'required' });
    expect(buildCairoContentPlan({ ...record, ...plan.after }).changedPaths).toEqual([]);
  });
  it.each(['_id', 'ownerTenantId', 'slug', 'currency', 'listingType', 'status'])('refuses a foreign or incompatible %s', key => {
    expect(() => buildCairoContentPlan({ ...current(), [key]: 'foreign' })).toThrow();
  });
  it('refuses additional tenants, changed tariffs, groups and unknown extras', () => {
    const cases = [current(), current(), current(), current()];
    cases[0].tenantIds.push('another-tenant'); cases[1].packageDetails.rates[0].double = 999;
    cases[2].packageDetails.groupBands[0].max = 3; cases[3].packageDetails.extras = [{ id: 'operator-extra', price: 42 }];
    for (const record of cases) expect(() => buildCairoContentPlan(record)).toThrow();
  });
  it('detects edited plan content and schema incompatibility before apply', () => {
    const plan = buildCairoContentPlan(current()); plan.after.packageDetails.rates[0].child = 1;
    expect(() => verifyCairoPlan(plan)).toThrow('invalid or changed');
    const broken = buildCairoContentPlan(current()); broken.after.packageDetails.durationDays = -1;
    expect(() => assertCompletionSchema(broken)).toThrow('Completion schema');
  });
  it('rejects apply fences and unknown arguments without opening a database', async () => {
    await expect(main(['--apply'])).rejects.toThrow('confirm-tenant');
    await expect(main(['--rollback=receipt'])).rejects.toThrow('requires --apply');
    await expect(main(['--force'])).rejects.toThrow('Unknown');
  });
});

describe('Cairo content CAS and recovery', () => {
  it('applies once, replays a prepared receipt after a lost response, and supports a no-op fresh plan', async () => {
    const f = fakeStore(), plan = buildCairoContentPlan(current()), receipt = receiptFor(plan);
    await expect(applyCairoContent(f.store, plan, receipt, CAIRO_TARGET.tenantSlug)).resolves.toBe('applied');
    await expect(applyCairoContent(f.store, plan, receipt, CAIRO_TARGET.tenantSlug)).resolves.toBe('already-applied');
    expect(f.store.cas).toHaveBeenCalledTimes(1);
    const next = buildCairoContentPlan(f.value());
    await expect(applyCairoContent(f.store, next, receiptFor(next), CAIRO_TARGET.tenantSlug)).resolves.toBe('unchanged');
    expect(f.store.cas).toHaveBeenCalledTimes(1);
  });
  it.each(['packageRevision', 'presentationRevision', '__v'])('refuses stale %s even when requested content matches', async key => {
    const f = fakeStore(), plan = buildCairoContentPlan(current()); f.change({ [key]: 99 });
    await expect(applyCairoContent(f.store, plan, receiptFor(plan), CAIRO_TARGET.tenantSlug)).rejects.toThrow('Concurrent edit');
    expect(f.store.cas).not.toHaveBeenCalled();
  });
  it('refuses changed listing fields, package content and timestamp', async () => {
    for (const patch of [{ inclusions: ['Operator edit'] }, { updatedAt: '2026-10-03T11:00:00.000Z' }, { packageDetails: { ...current().packageDetails, startCity: 'Giza' } }]) {
      const f = fakeStore(), plan = buildCairoContentPlan(current()); f.change(patch);
      await expect(applyCairoContent(f.store, plan, receiptFor(plan), CAIRO_TARGET.tenantSlug)).rejects.toThrow('Concurrent edit');
      expect(f.store.cas).not.toHaveBeenCalled();
    }
  });
  it('refuses a race between read and atomic write without overwriting it', async () => {
    const f = fakeStore(), plan = buildCairoContentPlan(current()); f.race();
    await expect(applyCairoContent(f.store, plan, receiptFor(plan), CAIRO_TARGET.tenantSlug)).rejects.toThrow('compare-and-set');
    expect(f.value().packageDetails).toEqual(current().packageDetails);
  });
  it('refuses foreign tenant or receipt and malformed confirmation before any write', async () => {
    const plan = buildCairoContentPlan(current()), f = fakeStore();
    await expect(applyCairoContent(f.store, plan, receiptFor(plan), 'other')).rejects.toThrow('confirmation');
    f.change({ ownerTenantId: 'other' });
    await expect(applyCairoContent(f.store, plan, receiptFor(plan), CAIRO_TARGET.tenantSlug)).rejects.toThrow('Exact owned');
    expect(f.store.cas).not.toHaveBeenCalled();
  });
  it('refuses malformed recovery timestamps without writing', async () => {
    const f = fakeStore(), plan = buildCairoContentPlan(current()), receipt = receiptFor(plan);
    receipt.writeAt = 'invalid';
    await expect(applyCairoContent(f.store, plan, receipt, CAIRO_TARGET.tenantSlug)).rejects.toThrow('receipt');
    await expect(rollbackCairoContent(f.store, receipt, CAIRO_TARGET.tenantSlug, 'invalid')).rejects.toThrow('timestamps');
    expect(f.store.cas).not.toHaveBeenCalled();
  });
  it('rolls back only its own exact result, keeps revision counters monotonic, and recovers a lost rollback response', async () => {
    const f = fakeStore(), plan = buildCairoContentPlan(current()), receipt = receiptFor(plan), time = '2026-10-03T14:00:00.000Z';
    await applyCairoContent(f.store, plan, receipt, CAIRO_TARGET.tenantSlug);
    await expect(rollbackCairoContent(f.store, receipt, CAIRO_TARGET.tenantSlug, time)).resolves.toBe('rolled-back');
    expect(f.value().packageDetails).toEqual(current().packageDetails);
    expect(f.value()).toMatchObject({ packageRevision: 6, presentationRevision: 3, __v: 2 });
    await expect(rollbackCairoContent(f.store, receipt, CAIRO_TARGET.tenantSlug, time)).resolves.toBe('already-rolled-back');
    expect(f.store.cas).toHaveBeenCalledTimes(2);
  });
  it('does not roll back a later operator edit', async () => {
    const f = fakeStore(), plan = buildCairoContentPlan(current()), receipt = receiptFor(plan);
    await applyCairoContent(f.store, plan, receipt, CAIRO_TARGET.tenantSlug); f.change({ presentationRevision: 6 });
    await expect(rollbackCairoContent(f.store, receipt, CAIRO_TARGET.tenantSlug, '2026-10-03T14:00:00.000Z')).rejects.toThrow('Concurrent edit');
    expect(f.store.cas).toHaveBeenCalledTimes(1);
  });
});


describe('Cairo Mongo tenant and write fences', () => {
  it('reads only public content of the exact owned and exclusively listed package', async () => {
    const findOne = jest.fn(async () => null), collection = jest.fn((_name: string) => ({ findOne }));
    const store = cairoMongoStore({ collection } as unknown as Parameters<typeof cairoMongoStore>[0]);
    await expect(store.read()).resolves.toBeNull();
    expect(collection).toHaveBeenCalledWith('attractions');
    const [filter, options] = findOne.mock.calls[0] as unknown as [Record<string, unknown>, { projection: Record<string, unknown> }];
    expect(JSON.parse(JSON.stringify(filter))).toEqual({ _id: CAIRO_TARGET.packageId, ownerTenantId: CAIRO_TARGET.tenantId, tenantIds: [CAIRO_TARGET.tenantId], slug: CAIRO_TARGET.slug, listingType: 'package', status: 'active', currency: 'USD', archivedAt: { $exists: false }, trashedAt: { $exists: false } });
    expect(Object.keys(options.projection)).not.toEqual(expect.arrayContaining(['bookings', 'paymentSettings', 'guestDetails']));
  });
  it('matches all original content and both revisions atomically, updating only scoped content', async () => {
    const updateOne = jest.fn(async () => ({ matchedCount: 0 })), collection = jest.fn((_name: string) => ({ updateOne }));
    const store = cairoMongoStore({ collection } as unknown as Parameters<typeof cairoMongoStore>[0]);
    const plan = buildCairoContentPlan(current()), time = '2026-10-03T12:00:00.000Z';
    await expect(store.cas(plan.expected, plan.before, plan.after, time)).resolves.toBe(false);
    const [filter, update] = updateOne.mock.calls[0] as unknown as [Record<string, unknown>, { $set: Record<string, unknown>; $inc: Record<string, number> }];
    expect(filter).toMatchObject({ ...plan.before, packageRevision: 4, presentationRevision: 1, __v: 0, status: 'active', currency: 'USD', updatedAt: new Date(current().updatedAt) });
    expect(Object.keys(update.$set).sort()).toEqual(['packageDetails', 'inclusions', 'exclusions', 'participantRequirements', 'updatedAt'].sort());
    expect(update.$inc).toEqual({ packageRevision: 1, presentationRevision: 1, __v: 1 });
    expect(collection.mock.calls.every(([name]) => name === 'attractions')).toBe(true);
  });
});
