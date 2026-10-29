import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Tenant } from '../models/Tenant';
import {
  ADDRESS_SITES, applyAddressChanges, planAddress, planAddressChanges, revertAddressChanges, seededAddress,
} from '../scripts/fix-network-site-addresses';
import { siteAddress } from '../scripts/seed-network-sites';

jest.setTimeout(120000);

let mongo: MongoMemoryReplSet;

const address = (slug: string) => Tenant.collection.findOne({ slug }).then((record) => record?.contactInfo?.address);
const site = (slug: string, value: string) => ({ _id: new Types.ObjectId(), slug, name: slug, domain: `${slug}.invalid`, status: 'active', designMode: 'desertfox', contactInfo: { address: value } });

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('network_site_addresses'));
  await Tenant.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  await Tenant.collection.deleteMany({});
  await Tenant.collection.insertMany([
    ...ADDRESS_SITES.map(({ slug, city }) => site(slug, seededAddress(city))),
    // A Red Sea site is right as it is, and is not this script's to touch.
    site('safari-el-gouna', 'El Gouna, Red Sea, Egypt'),
  ]);
});

describe('siteAddress', () => {
  it('names the Red Sea governorate only for the Red Sea towns', () => {
    expect(siteAddress('El Gouna')).toBe('El Gouna, Red Sea, Egypt');
    expect(siteAddress('Marsa Alam')).toBe('Marsa Alam, Red Sea, Egypt');
    expect(siteAddress('Sharm El Sheikh')).toBe('Sharm El Sheikh, South Sinai, Egypt');
    expect(siteAddress('Cairo')).toBe('Cairo, Egypt');
    expect(siteAddress('Luxor')).toBe('Luxor, Egypt');
    expect(siteAddress('Dahab')).toBe('Dahab, South Sinai, Egypt');
  });

  it('refuses a town it has no region for, so nothing is published under a guessed one', () => {
    expect(() => siteAddress('Siwa')).toThrow('Siwa: no region on record for this town.');
  });
});

describe('planAddress', () => {
  it('replaces the seeded value, leaves a corrected one alone and refuses anything edited since', () => {
    const sharm = { slug: 'white-island-sharm', city: 'Sharm El Sheikh' };
    expect(planAddress(sharm, 'Sharm El Sheikh, Red Sea, Egypt')).toEqual({
      site: 'white-island-sharm', before: 'Sharm El Sheikh, Red Sea, Egypt', after: 'Sharm El Sheikh, South Sinai, Egypt',
    });
    expect(planAddress(sharm, 'Sharm El Sheikh, South Sinai, Egypt')).toBeNull();
    expect(() => planAddress(sharm, 'Naama Bay, Sharm El Sheikh')).toThrow('left untouched');
    expect(() => planAddress(sharm, undefined)).toThrow('left untouched');
  });
});

describe('the database run', () => {
  it('plans all eight sites without writing, then applies, then reverts exactly', async () => {
    const planned = await planAddressChanges();
    expect(planned.map((change) => change.site)).toEqual(ADDRESS_SITES.map((entry) => entry.slug));
    expect(await address('giza-plateau-pyramids')).toBe('Cairo, Red Sea, Egypt');

    const journal: string[][] = [];
    expect(await applyAddressChanges(planned, (done) => journal.push(done.map((change) => change.site)))).toBe(8);
    expect(journal).toHaveLength(8);
    expect(await address('giza-plateau-pyramids')).toBe('Cairo, Egypt');
    expect(await address('shark-reef-sharm')).toBe('Sharm El Sheikh, South Sinai, Egypt');
    expect(await address('safari-el-gouna')).toBe('El Gouna, Red Sea, Egypt');
    // A second run finds nothing to do.
    expect(await planAddressChanges()).toEqual([]);

    expect(await revertAddressChanges(planned)).toBe(8);
    expect(await address('giza-plateau-pyramids')).toBe('Cairo, Red Sea, Egypt');
    expect(await address('tunis-village-fayoum')).toBe('Cairo, Red Sea, Egypt');
  });

  it('stops before writing anything when one address was edited by hand', async () => {
    await Tenant.collection.updateOne({ slug: 'tiran-island-sharm' }, { $set: { 'contactInfo.address': 'Tiran, Sharm El Sheikh' } });
    await expect(planAddressChanges()).rejects.toThrow('tiran-island-sharm');
    expect(await address('ras-mohamed-nature-reserve')).toBe('Sharm El Sheikh, Red Sea, Egypt');
  });

  it('never overwrites a value that changed between the plan and the write', async () => {
    const planned = await planAddressChanges();
    await Tenant.collection.updateOne({ slug: 'memphis-and-sakkara' }, { $set: { 'contactInfo.address': 'Saqqara, Giza, Egypt' } });
    await expect(applyAddressChanges(planned)).rejects.toThrow('memphis-and-sakkara: the address changed since it was read');
    expect(await address('memphis-and-sakkara')).toBe('Saqqara, Giza, Egypt');
  });

  it('refuses a missing site', async () => {
    await Tenant.collection.deleteOne({ slug: 'white-island-sharm' });
    await expect(planAddressChanges()).rejects.toThrow('white-island-sharm: no such site.');
  });
});
