import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import {
  applyDepartureFixes,
  planDepartureFixes,
  revertDepartureFixes,
} from '../scripts/fix-queen-magi-island-departures';

jest.setTimeout(120000);

let mongo: MongoMemoryReplSet;
const paradise = new Types.ObjectId();
const hula = new Types.ObjectId();
const other = new Types.ObjectId();

const tour = (tenantId: Types.ObjectId, slug: string, type: string, departures: string[]) => ({
  _id: new Types.ObjectId(),
  slug,
  title: slug,
  status: 'active',
  ownerTenantId: tenantId,
  tenantIds: [tenantId],
  availability: { type, advanceBooking: 365 },
  entryWindows: departures.map((startTime) => ({ label: 'Departure', startTime })),
  images: [],
});

const typeOf = async (slug: string) => (await Attraction.collection.findOne({ slug }))?.availability?.type;

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('queen_magi_island_departures'));
  await Promise.all([Attraction.init(), Tenant.init()]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  await Attraction.collection.deleteMany({});
  await Tenant.collection.deleteMany({});
  await Tenant.collection.insertMany([
    { _id: paradise, slug: 'paradise-island-hurghada', name: 'Paradise', domain: 'p.invalid', status: 'active', designMode: 'paradise' },
    { _id: hula, slug: 'hula-hula-island', name: 'Hula Hula', domain: 'h.invalid', status: 'active', designMode: 'hulahula' },
    { _id: other, slug: 'other-site', name: 'Other', domain: 'o.invalid', status: 'active', designMode: 'nautical' },
  ]);
  await Attraction.collection.insertMany([
    tour(paradise, 'paradise-cruise', 'date-only', ['09:30']),
    tour(paradise, 'paradise-dolphin', 'date-only', []),
    tour(hula, 'hula-speedboat', 'date-only', ['09:00']),
    tour(hula, 'hula-beach', 'date-only', []),
    tour(hula, 'hula-scheduled-already', 'time-slots', ['11:30']),
    // Another site with the same shape is not this script's to change.
    tour(other, 'other-cruise', 'date-only', ['10:00']),
  ]);
});

it('plans only the island tours that publish a departure but are sold by the day, and writes nothing', async () => {
  const planned = await planDepartureFixes();
  expect(planned.map((fix) => fix.slug).sort()).toEqual(['hula-speedboat', 'paradise-cruise']);
  expect(planned.find((fix) => fix.slug === 'paradise-cruise')).toMatchObject({ site: 'paradise-island-hurghada', departures: ['09:30'], from: 'date-only', to: 'time-slots' });
  expect(await typeOf('paradise-cruise')).toBe('date-only');
  expect(await typeOf('hula-speedboat')).toBe('date-only');
});

it('moves exactly those tours to time slots, touches nothing else, and a second run finds nothing', async () => {
  const before = await Attraction.collection.find({}, { sort: { slug: 1 } }).toArray();
  const applied = await applyDepartureFixes(await planDepartureFixes());
  expect(applied.map((fix) => fix.slug).sort()).toEqual(['hula-speedboat', 'paradise-cruise']);

  const after = await Attraction.collection.find({}, { sort: { slug: 1 } }).toArray();
  for (const record of after) {
    const original = before.find((row) => String(row._id) === String(record._id))!;
    if (record.slug === 'hula-speedboat' || record.slug === 'paradise-cruise') {
      expect(record.availability).toEqual({ ...original.availability, type: 'time-slots' });
      // The only other change is the model's own write timestamp.
      expect(record.updatedAt).toBeInstanceOf(Date);
      const { updatedAt: _stamp, ...rest } = record;
      expect({ ...rest, availability: original.availability }).toEqual(original);
    } else {
      expect(record).toEqual(original);
    }
  }
  expect(await planDepartureFixes()).toEqual([]);
});

it('refuses a tour that changed after it was planned, and leaves it as it found it', async () => {
  const planned = await planDepartureFixes();
  await Attraction.collection.updateOne({ slug: 'paradise-cruise' }, { $set: { 'availability.type': 'flexible' } });
  const ordered = [...planned].sort((a) => (a.slug === 'paradise-cruise' ? -1 : 1));
  await expect(applyDepartureFixes(ordered)).rejects.toThrow('paradise-cruise changed since it was read');
  expect(await typeOf('paradise-cruise')).toBe('flexible');
  expect(await typeOf('hula-speedboat')).toBe('date-only');
});

it('reverts exactly what it applied, and refuses to revert a tour someone has since changed', async () => {
  const applied = await applyDepartureFixes(await planDepartureFixes());
  expect(await revertDepartureFixes(applied)).toBe(2);
  expect(await typeOf('paradise-cruise')).toBe('date-only');
  expect(await typeOf('hula-speedboat')).toBe('date-only');
  expect(await typeOf('hula-scheduled-already')).toBe('time-slots');

  const again = await applyDepartureFixes(await planDepartureFixes());
  await Attraction.collection.updateOne({ slug: 'hula-speedboat' }, { $set: { 'availability.type': 'flexible' } });
  const ordered = [...again].sort((a) => (a.slug === 'hula-speedboat' ? -1 : 1));
  await expect(revertDepartureFixes(ordered)).rejects.toThrow('hula-speedboat is no longer as this script left it');
  expect(await typeOf('hula-speedboat')).toBe('flexible');
});

it('refuses to run when an island site is missing or in an unexpected design', async () => {
  await Tenant.collection.updateOne({ _id: hula }, { $set: { designMode: 'nautical' } });
  await expect(planDepartureFixes()).rejects.toThrow('unexpected design: hula-hula-island');
  await Tenant.collection.deleteOne({ _id: hula });
  await expect(planDepartureFixes()).rejects.toThrow('Expected both island sites');
});
