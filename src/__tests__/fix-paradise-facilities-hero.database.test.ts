import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Tenant } from '../models/Tenant';
import { REPLACEMENT_ALT, applyHeroSwap, planHeroSwap, revertHeroSwap } from '../scripts/fix-paradise-facilities-hero';

jest.setTimeout(120000);

let mongo: MongoMemoryReplSet;
const id = new Types.ObjectId();
const CDN = 'https://res.cloudinary.com/dm3sxllch/image/upload';
const STOCK = `${CDN}/v1790783059/attractions-network/pages/paradise-island-hurghada/facilities/l751azwmubdyzyqxb8fk.jpg`;
const HEADER_3 = `${CDN}/v1790783043/attractions-network/tenant-heroes/paradise-island-hurghada/3/vhbban66q5nm6bmqsmeb.jpg`;
const BEACH_PAGE = `${CDN}/v1/attractions-network/tenant-heroes/paradise-island-hurghada/1/beach.jpg`;

const page = async (slug: string) => (await Tenant.collection.findOne({ _id: id }))!.customPages.find((p: { slug: string }) => p.slug === slug);

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('paradise_facilities_hero'));
  await Tenant.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  await Tenant.collection.deleteMany({});
  await Tenant.collection.insertOne({
    _id: id, slug: 'paradise-island-hurghada', name: 'Paradise', domain: 'p.invalid', status: 'active', designMode: 'paradise',
    heroImages: [`${CDN}/v1/attractions-network/tenant-heroes/paradise-island-hurghada/1/a.jpg`, `${CDN}/v1/x/2/b.jpg`, HEADER_3],
    customPages: [
      { slug: 'facilities', title: 'Island Facilities', heroImage: STOCK, heroImageAlt: 'A plan drawing of Paradise Island showing where each facility sits' },
      { slug: 'paradise-beach', title: 'Paradise Beach', heroImage: BEACH_PAGE, heroImageAlt: 'The beach' },
    ],
  });
});

it('plans the swap to site header 3 without writing anything', async () => {
  const swap = await planHeroSwap();
  expect(swap).toEqual({
    from: { heroImage: STOCK, heroImageAlt: 'A plan drawing of Paradise Island showing where each facility sits' },
    to: { heroImage: HEADER_3, heroImageAlt: REPLACEMENT_ALT },
  });
  expect((await page('facilities')).heroImage).toBe(STOCK);
});

it('replaces only the facilities hero, then has nothing left to do', async () => {
  await applyHeroSwap((await planHeroSwap())!);
  expect(await page('facilities')).toMatchObject({ heroImage: HEADER_3, heroImageAlt: REPLACEMENT_ALT, title: 'Island Facilities' });
  expect(await page('paradise-beach')).toMatchObject({ heroImage: BEACH_PAGE, heroImageAlt: 'The beach' });
  expect(await planHeroSwap()).toBeNull();
});

it('refuses when the page changed after it was read, and reverts exactly', async () => {
  const swap = (await planHeroSwap())!;
  await Tenant.collection.updateOne({ _id: id, 'customPages.slug': 'facilities' }, { $set: { 'customPages.$.heroImage': `${CDN}/v1/someone-else.jpg` } });
  await expect(applyHeroSwap(swap)).rejects.toThrow('changed since it was read');
  expect((await page('facilities')).heroImage).toBe(`${CDN}/v1/someone-else.jpg`);

  await Tenant.collection.updateOne({ _id: id, 'customPages.slug': 'facilities' }, { $set: { 'customPages.$.heroImage': STOCK } });
  await applyHeroSwap(swap);
  await revertHeroSwap(swap);
  expect(await page('facilities')).toMatchObject({ heroImage: STOCK, heroImageAlt: swap.from.heroImageAlt });
});

it('refuses without the replacement photograph or outside its own design', async () => {
  await Tenant.collection.updateOne({ _id: id }, { $set: { heroImages: [] } });
  await expect(planHeroSwap()).rejects.toThrow('Site header 3');
  await Tenant.collection.updateOne({ _id: id }, { $set: { designMode: 'nautical' } });
  await expect(planHeroSwap()).rejects.toThrow('in its own design');
});
