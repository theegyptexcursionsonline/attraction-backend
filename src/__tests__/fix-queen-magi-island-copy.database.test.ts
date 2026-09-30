import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { applyCopyChanges, planCopyChanges, revertCopyChanges } from '../scripts/fix-queen-magi-island-copy';

jest.setTimeout(120000);

let mongo: MongoMemoryReplSet;
const paradise = new Types.ObjectId();
const hula = new Types.ObjectId();
const other = new Types.ObjectId();
const OLD_SCOPE = 'Which venue does this ticket admit to? Paradise Island. It does not admit to the operator’s other beach venue.';
const OLD_SECOND = 'Great day. The operator runs a second beach venue on the same island with its own ticket, and the two are not interchangeable.';

const tourDoc = (tenantId: Types.ObjectId, slug: string, description: string, needToKnow: string[]) => ({
  _id: new Types.ObjectId(), slug, title: slug, status: 'active', ownerTenantId: tenantId, tenantIds: [tenantId], description, needToKnow, images: [],
});
const tour = (slug: string) => Attraction.collection.findOne({ slug });

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('queen_magi_island_copy'));
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
    { _id: paradise, slug: 'paradise-island-hurghada', name: 'P', domain: 'p.invalid', status: 'active', designMode: 'paradise', customPages: [{ slug: 'facilities', heroDescription: 'Untouched.' }] },
    {
      _id: hula, slug: 'hula-hula-island', name: 'H', domain: 'h.invalid', status: 'active', designMode: 'hulahula',
      customPages: [
        { slug: 'facilities', heroDescription: 'What the operator confirms is on the island: the beach itself, water sports on every day.', metaDescription: 'What the operator confirms about Hula Hula Island: beach entry.' },
        { slug: 'hula-hula-water-sports', body: 'Included. That is a genuine difference from the operator’s other venue, where the speedboat trips do not carry them.' },
      ],
    },
    { _id: other, slug: 'other-site', name: 'O', domain: 'o.invalid', status: 'active', designMode: 'nautical', customPages: [] },
  ]);
  await Attraction.collection.insertMany([
    tourDoc(paradise, 'paradise-cruise', OLD_SECOND, [OLD_SCOPE, 'Bring a towel.']),
    tourDoc(hula, 'hula-beach', 'Two hours on the beach.', ['Bring a towel.']),
    // Another site's identical wording is not this script's to change.
    tourDoc(other, 'other-cruise', OLD_SECOND, [OLD_SCOPE]),
  ]);
});

it('plans only the island fields that carry a sentence to rewrite, without writing', async () => {
  const planned = await planCopyChanges();
  expect(planned.map(({ site, label, field }) => `${site}/${label}.${field}`).sort()).toEqual([
    'hula-hula-island/facilities.heroDescription',
    'hula-hula-island/facilities.metaDescription',
    'hula-hula-island/hula-hula-water-sports.body',
    'paradise-island-hurghada/paradise-cruise.description',
    'paradise-island-hurghada/paradise-cruise.needToKnow',
  ]);
  expect((await tour('paradise-cruise'))!.description).toBe(OLD_SECOND);
});

it('rewrites exactly those sentences, speaks as the venue, never names the other one, and then finds nothing', async () => {
  await applyCopyChanges(await planCopyChanges());
  const cruise = (await tour('paradise-cruise'))!;
  expect(cruise.description).toBe('Great day. We also run a second beach venue on the same island, with its own ticket, and the two tickets are not interchangeable.');
  expect(cruise.needToKnow).toEqual(['Which venue does this ticket admit to? Paradise Island. It does not admit to our other beach venue on the island.', 'Bring a towel.']);
  expect(JSON.stringify(cruise)).not.toMatch(/hula/i);
  const site = (await Tenant.collection.findOne({ _id: hula }))!;
  expect(site.customPages[0]).toMatchObject({ heroDescription: 'What is on the island: the beach itself, water sports every day.', metaDescription: 'What is on Hula Hula Island: beach entry.' });
  expect(site.customPages[1].body).toBe('Included. That is a genuine difference from our other venue on the island, where the speedboat trips do not include them.');
  expect((await tour('other-cruise'))!.description).toBe(OLD_SECOND);
  expect(await planCopyChanges()).toEqual([]);
});

it('refuses a field someone changed after it was read, and reverts exactly what it applied', async () => {
  const planned = await planCopyChanges();
  const first = planned.find((change) => change.label === 'paradise-cruise' && change.field === 'description')!;
  await Attraction.collection.updateOne({ slug: 'paradise-cruise' }, { $set: { description: 'Edited by the team.' } });
  await expect(applyCopyChanges([first])).rejects.toThrow('changed since it was read');
  expect((await tour('paradise-cruise'))!.description).toBe('Edited by the team.');

  await Attraction.collection.updateOne({ slug: 'paradise-cruise' }, { $set: { description: OLD_SECOND } });
  const fresh = await planCopyChanges();
  const recorded: number[] = [];
  await applyCopyChanges(fresh, (done) => recorded.push(done.length));
  expect(recorded).toEqual(fresh.map((_, index) => index + 1));
  await revertCopyChanges(fresh);
  expect((await tour('paradise-cruise'))!.description).toBe(OLD_SECOND);
  expect((await Tenant.collection.findOne({ _id: hula }))!.customPages[0].heroDescription).toBe('What the operator confirms is on the island: the beach itself, water sports on every day.');
});
