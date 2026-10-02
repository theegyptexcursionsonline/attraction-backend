import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Attraction } from '../models/Attraction';
import { packageDetailsSchema } from '../utils/packageDetails';
import { pricePackageSelection, packageSelectionSchema } from '../services/packagePricing.service';
import { packageSelfCancellationProblem } from '../services/packageBooking.service';
import { samplePackage } from '../test/packageFixture';
import { applyCairoContent, assertCompletionSchema, buildCairoContentPlan, CAIRO_TARGET, cairoContentModel, cairoMongoStore, CairoPlan, CairoReceipt, CairoRecord, CairoStore, main, rollbackCairoContent, verifyCairoPlan } from '../scripts/complete-cairo-package-content';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const current = (): CairoRecord => ({
  _id: CAIRO_TARGET.packageId, slug: CAIRO_TARGET.slug, ownerTenantId: CAIRO_TARGET.tenantId, tenantIds: [CAIRO_TARGET.tenantId],
  listingType: 'package', status: 'active', currency: 'USD', packageRevision: 4, presentationRevision: 1, __v: 0, updatedAt: '2026-10-02T12:36:58.295Z',
  inclusions: ['1 night in a 5-star hotel in Cairo', '1 night in a 5-star hotel in Luxor', '3 nights on a 5-star Nile cruise (full board)', 'Meals as mentioned per day', 'Domestic flights'],
  exclusions: ['Tips (optional)', 'Spanish-, German-, Italian- or French-speaking guide (available as an add-on)'], participantRequirements: [],
  needToKnow: ['This package is for two adults sharing one room. Single rooms, triple rooms, children and infants are not offered.', 'Select an available departure date when booking.', 'Existing pickup arrangements remain unchanged.', 'Cancellation refunds: 100% at least seven days before departure; 50% from three to fewer than seven days; no refund within three days. Online cancellation closes 24 hours before departure.'],
  packageDetails: samplePackage({ durationDays: 6, durationNights: 5, departureMode: 'fixed', minNoticeDays: 7,
    tiers: ['premium', 'deluxe', 'luxury'].map(key => ({ key, name: key, description: 'Existing level description', hotels: [] })),
    rates: ['premium', 'deluxe', 'luxury'].map((tierKey, i) => ({ tierKey, seasonKey: 'winter', bandKey: 'two-adults', double: [2100, 2200, 2250][i], single: null, triple: null, child: null, infant: null })),
    groupBands: [{ key: 'two-adults', min: 2, max: 2 }], rooms: { allowSingle: false, allowTriple: false, maxChildrenPerRoom: 0, maxInfantsPerRoom: 0 },
    travellers: { allowChildren: false, allowInfants: false, childMinAge: 6, childMaxAge: 17, childWithOneAdult: 'double' }, extras: [],
    cancellation: [{ daysBefore: 7, refundPercent: 100 }, { daysBefore: 3, refundPercent: 50 }, { daysBefore: 0, refundPercent: 0 }],
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
  it('replaces the exact live adult-only notice without changing calendar or unrelated terms', () => {
    const record = current(), plan = buildCairoContentPlan(record);
    expect(plan.after.needToKnow[0]).toBe('This package is for two travellers sharing one room: two adults, or one adult aged 13 or older and one child aged 6–12. Single rooms, triple rooms, infants and children under 6 are not offered.');
    expect(plan.after.needToKnow.slice(1, 3)).toEqual(record.needToKnow.slice(1, 3));
    expect(plan.changedPaths).toContain('needToKnow');
    expect(buildCairoContentPlan({ ...record, ...plan.after }).changedPaths).toEqual([]);
  });
  it('replaces the exact stale local draft notices without inventing dates or seat allocations', () => {
    const record = current();
    record.needToKnow[0] = 'This draft is configured for two adults sharing one room. Single rooms, triple rooms, children and infants are not offered in this configuration.';
    record.needToKnow[1] = 'No departure dates or seats have been entered. Travel cannot be booked until the operator confirms and adds departure availability.';
    record.needToKnow[3] = 'Refund schedule chosen for this configuration: 100% at least seven days before departure; 50% from three days to fewer than seven days; no refund below three days. The source operator’s self-service cancellation cutoff is 24 hours before departure.';
    const plan = buildCairoContentPlan(record);
    expect(plan.after.needToKnow[0]).not.toMatch(/draft|children and infants are not offered/);
    expect(plan.after.needToKnow[1]).toBe('Select an available departure date when booking.');
    expect(plan.after.needToKnow[2]).toBe(record.needToKnow[2]);
    expect(plan.after.needToKnow[3]).not.toMatch(/configuration|24 hours|source operator/);
    expect(plan.after.packageDetails.daily).toEqual(record.packageDetails.daily);
    expect(plan.after.packageDetails.departureMode).toEqual(record.packageDetails.departureMode);
  });
  it('states the actual online cancellation boundary while preserving every refund percentage', () => {
    const record = current(), plan = buildCairoContentPlan(record);
    expect(plan.after.packageDetails.cancellation).toEqual(record.packageDetails.cancellation);
    expect(plan.after.needToKnow[3]).toBe('Cancellation refunds: 100% at least seven days before departure; 50% from three to fewer than seven days; no refund within three days. Online cancellation with a full refund is available at least seven days before departure. Contact the operator for later cancellation or refund requests under these terms.');
    const booking = { paymentStatus: 'succeeded', packageBooking: { version: 1, departureDate: '2026-11-10', returnDate: '2026-11-15', cancellation: plan.after.packageDetails.cancellation.map(rule => ({ ...rule, cancelBy: ['2026-11-03', '2026-11-07', '2026-11-10'][[7, 3, 0].indexOf(rule.daysBefore)] })) } };
    expect(packageSelfCancellationProblem(booking, '2026-11-03')).toBeNull();
    expect(packageSelfCancellationProblem(booking, '2026-11-04')).toContain('50%');
    expect(packageSelfCancellationProblem(booking, '2026-11-08')).toContain('not refundable');
  });
  it('refuses changed cancellation rules or notices instead of imposing an old schedule', () => {
    const record = current(); record.packageDetails.cancellation[0].daysBefore = 14;
    expect(() => buildCairoContentPlan(record)).toThrow('Cancellation terms were edited');
    const changedText = current(); changedText.needToKnow[3] = 'New operator cancellation terms';
    expect(() => buildCairoContentPlan(changedText)).toThrow('Cancellation terms were edited');
  });
  it('refuses changed or missing party/departure notices for an explicit review', () => {
    for (const index of [0, 1]) {
      const record = current(); record.needToKnow[index] = 'An operator edited this notice.';
      expect(() => buildCairoContentPlan(record)).toThrow('party or departure notice was edited');
    }
    expect(() => buildCairoContentPlan({ ...current(), needToKnow: undefined } as unknown as CairoRecord)).toThrow('Listing text');
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
    for (const patch of [{ inclusions: ['Operator edit'] }, { needToKnow: ['Operator edit'] }, { updatedAt: '2026-10-03T11:00:00.000Z' }, { packageDetails: { ...current().packageDetails, startCity: 'Giza' } }]) {
      const f = fakeStore(), plan = buildCairoContentPlan(current()); f.change(patch);
      await expect(applyCairoContent(f.store, plan, receiptFor(plan), CAIRO_TARGET.tenantSlug)).rejects.toThrow('Concurrent edit');
      expect(f.store.cas).not.toHaveBeenCalled();
    }
  });
  it('refuses a race between read and atomic write without overwriting it', async () => {
    const f = fakeStore(), plan = buildCairoContentPlan(current()); f.race();
    await expect(applyCairoContent(f.store, plan, receiptFor(plan), CAIRO_TARGET.tenantSlug)).rejects.toThrow('compare-and-set');
    expect(f.value().packageDetails).toEqual(current().packageDetails);
    expect(f.value().needToKnow).toEqual(current().needToKnow);
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
    expect(f.value().needToKnow).toEqual(current().needToKnow);
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
  it('does not roll back later edits to practical information even without a revision change', async () => {
    const f = fakeStore(), plan = buildCairoContentPlan(current()), receipt = receiptFor(plan);
    await applyCairoContent(f.store, plan, receipt, CAIRO_TARGET.tenantSlug); f.change({ needToKnow: ['Updated pickup arrangements'] });
    await expect(rollbackCairoContent(f.store, receipt, CAIRO_TARGET.tenantSlug, '2026-10-03T14:00:00.000Z')).rejects.toThrow('Concurrent edit');
    expect(f.store.cas).toHaveBeenCalledTimes(1);
  });
});


describe('Cairo Mongo tenant and write fences', () => {
  it('reads only public content of the exact owned and exclusively listed package', async () => {
    const findOne = jest.fn(async () => null), collection = jest.fn((_name: string) => ({ findOne }));
    const store = cairoMongoStore({ collection } as unknown as Parameters<typeof cairoMongoStore>[0], { updateOne: jest.fn() } as unknown as Parameters<typeof cairoMongoStore>[1]);
    await expect(store.read()).resolves.toBeNull();
    expect(collection).toHaveBeenCalledWith('attractions');
    const [filter, options] = findOne.mock.calls[0] as unknown as [Record<string, unknown>, { projection: Record<string, unknown> }];
    expect(JSON.parse(JSON.stringify(filter))).toEqual({ _id: CAIRO_TARGET.packageId, ownerTenantId: CAIRO_TARGET.tenantId, tenantIds: [CAIRO_TARGET.tenantId], slug: CAIRO_TARGET.slug, listingType: 'package', status: 'active', currency: 'USD', archivedAt: { $exists: false }, trashedAt: { $exists: false } });
    expect(Object.keys(options.projection)).not.toEqual(expect.arrayContaining(['bookings', 'paymentSettings', 'guestDetails']));
  });
  it('matches all original content and both revisions atomically, updating only scoped content', async () => {
    const updateOne = jest.fn(async () => ({ matchedCount: 0 })), collection = jest.fn((_name: string) => ({ updateOne }));
    const store = cairoMongoStore({ collection } as unknown as Parameters<typeof cairoMongoStore>[0], { updateOne } as unknown as Parameters<typeof cairoMongoStore>[1]);
    const plan = buildCairoContentPlan(current()), time = '2026-10-03T12:00:00.000Z';
    await expect(store.cas(plan.expected, plan.before, plan.after, time)).resolves.toBe(false);
    const [filter, update, options] = updateOne.mock.calls[0] as unknown as [Record<string, unknown>, { $set: Record<string, unknown>; $inc: Record<string, number> }, Record<string, unknown>];
    expect(filter).toMatchObject({ ...plan.before, packageRevision: 4, presentationRevision: 1, __v: 0, status: 'active', currency: 'USD', updatedAt: new Date(current().updatedAt) });
    expect(Object.keys(update.$set).sort()).toEqual(['inclusions', 'exclusions', 'participantRequirements', 'needToKnow', 'updatedAt', 'packageDetails'].sort());
    expect(update.$inc).toEqual({ packageRevision: 1, presentationRevision: 1, __v: 1 });
    expect(options).toEqual({ timestamps: false, runValidators: true, context: 'query' });
    expect(collection).not.toHaveBeenCalled();
  });
});

describe('Cairo guarded model persistence', () => {
  it('preserves exact legacy JSON and receipt timestamps through apply, replay and monotonic rollback', async () => {
    const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
    const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
    const localVersion = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
    const mongo = await MongoMemoryServer.create({ binary: { version: localVersion || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
    const connection = await mongoose.createConnection(mongo.getUri('cairo_content'), { autoIndex: false, autoCreate: false }).asPromise();
    const previousReady = process.env.URL_NAMESPACE_WRITES_READY;
    try {
      const original = current();
      delete original.packageDetails.bookingRequirements; delete original.packageDetails.optionGroups; delete original.packageDetails.rooms.bedPreferences;
      await connection.db!.collection('attractions').insertOne({ ...original, _id: new Types.ObjectId(original._id), ownerTenantId: new Types.ObjectId(original.ownerTenantId), tenantIds: original.tenantIds.map(id => new Types.ObjectId(id)), updatedAt: new Date(original.updatedAt) });
      const model = cairoContentModel(connection), store = cairoMongoStore(connection.db!, model);
      const plan = buildCairoContentPlan((await store.read())!), receipt = receiptFor(plan), rollbackAt = '2026-10-03T14:00:00.000Z';
      // Content updates pass through the guard even while URL changes are paused. No URL field changes.
      process.env.URL_NAMESPACE_WRITES_READY = 'false';
      await expect(model.updateOne({ _id: new Types.ObjectId(original._id) }, { $set: { slug: 'forbidden-new-url' } })).rejects.toThrow('URL updates are temporarily paused');
      await expect(model.updateOne({ _id: new Types.ObjectId(original._id) }, { $set: { packageDetails: { version: 99 } } }, { runValidators: true })).rejects.toThrow('Validation failed');
      expect(Attraction.schema.path('packageDetails').options.set).toBeDefined();
      await expect(applyCairoContent(store, plan, receipt, CAIRO_TARGET.tenantSlug)).resolves.toBe('applied');
      await expect(applyCairoContent(store, plan, receipt, CAIRO_TARGET.tenantSlug)).resolves.toBe('already-applied');
      expect(await store.read()).toMatchObject({ ...plan.after, packageRevision: 5, presentationRevision: 2, __v: 1, updatedAt: receipt.writeAt });
      await expect(rollbackCairoContent(store, receipt, CAIRO_TARGET.tenantSlug, rollbackAt)).resolves.toBe('rolled-back');
      await expect(rollbackCairoContent(store, receipt, CAIRO_TARGET.tenantSlug, rollbackAt)).resolves.toBe('already-rolled-back');
      expect(await store.read()).toEqual({ ...original, packageRevision: 6, presentationRevision: 3, __v: 2, updatedAt: rollbackAt });
      expect(await connection.db!.listCollections({}, { nameOnly: true }).toArray()).toEqual([expect.objectContaining({ name: 'attractions' })]);
    } finally {
      if (previousReady === undefined) delete process.env.URL_NAMESPACE_WRITES_READY; else process.env.URL_NAMESPACE_WRITES_READY = previousReady;
      await connection.close(); await mongo.stop();
    }
  }, 120_000);
});
