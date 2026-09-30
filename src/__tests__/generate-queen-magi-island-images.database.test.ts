import fs from 'fs';
import os from 'os';
import path from 'path';
import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { generateImageFromPrompt } from '../services/image-generation.service';
import { uploadBase64Image } from '../services/upload.service';
import { QUEEN_MAGI_ISLAND_IMAGE_PLANS, frameFromSourceDir, main } from '../scripts/generate-queen-magi-island-images';

// The test owns the connection; the script's own connect/disconnect must not touch it.
jest.mock('../config/database', () => ({
  connectDatabase: jest.fn(async () => undefined),
  disconnectDatabase: jest.fn(async () => undefined),
}));
jest.mock('../services/image-generation.service', () => ({
  generateImageFromPrompt: jest.fn(async () => ({ base64: 'AAAA', mimeType: 'image/jpeg' })),
}));
jest.mock('../services/upload.service', () => ({
  uploadBase64Image: jest.fn(async (_data: string, folder: string, options: { publicId: string }) => ({
    url: `https://res.cloudinary.com/dm3sxllch/image/upload/v1/attractions-network/${folder}/${options.publicId}.jpg`,
  })),
}));

jest.setTimeout(120000);

const generate = generateImageFromPrompt as jest.MockedFunction<typeof generateImageFromPrompt>;
const upload = uploadBase64Image as unknown as jest.Mock;
const CLOUDINARY = 'https://res.cloudinary.com/dm3sxllch/image/upload/v1790783052/attractions-network';
const paradisePlan = QUEEN_MAGI_ISLAND_IMAGE_PLANS.find((plan) => plan.tenantSlug === 'paradise-island-hurghada')!;
const hulaPlan = QUEEN_MAGI_ISLAND_IMAGE_PLANS.find((plan) => plan.tenantSlug === 'hula-hula-island')!;
const [cruise, dolphin] = paradisePlan.tours.map((tour) => tour.slug) as [string, string];

/** What the seed stores: real photographs mirrored into the site's own tour and header folders. */
const realTourPhoto = (slug: string, id: string) => `${CLOUDINARY}/tours/paradise-island-hurghada/${slug}/${id}.jpg`;
const realHeader = (tenant: string, index: number) => `${CLOUDINARY}/tenant-heroes/${tenant}/${index}/real${index}.jpg`;

let mongo: MongoMemoryReplSet;
const paradiseId = new Types.ObjectId();
const hulaId = new Types.ObjectId();
const originalArgv = process.argv;

const runFor = async (tenantSlug: string, extra: string[] = []) => {
  process.argv = ['node', 'generate-queen-magi-island-images', '--apply', `--confirm-tenant=${tenantSlug}`, '--confirm-assets=generated-only', ...extra];
  try {
    await main();
  } finally {
    process.argv = originalArgv;
  }
};

const tourDocument = (tenantId: Types.ObjectId, slug: string, images: string[]) => ({
  _id: new Types.ObjectId(),
  slug,
  title: slug,
  status: 'active',
  ownerTenantId: tenantId,
  tenantIds: [tenantId],
  images,
});

const tour = (slug: string) => Attraction.collection.findOne({ slug });

let quiet: jest.SpyInstance;

beforeAll(async () => {
  // The script reports each write as JSON; the assertions below read the database instead.
  quiet = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('queen_magi_island_images'));
  await Promise.all([Attraction.init(), Tenant.init()]);
});

afterAll(async () => {
  quiet.mockRestore();
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  generate.mockClear();
  upload.mockClear();
  await Attraction.collection.deleteMany({});
  await Tenant.collection.deleteMany({});
  await Tenant.collection.insertMany([
    {
      _id: paradiseId,
      slug: 'paradise-island-hurghada',
      name: 'Paradise Island Hurghada',
      domain: 'paradise-island-hurghada.invalid',
      status: 'active',
      designMode: 'paradise',
      heroImages: [1, 2, 3, 4].map((index) => realHeader('paradise-island-hurghada', index)),
      customPages: [],
    },
    {
      _id: hulaId,
      slug: 'hula-hula-island',
      name: 'Hula Hula Island',
      domain: 'hula-hula-island.invalid',
      status: 'active',
      designMode: 'hulahula',
      heroImages: [1, 2].map((index) => realHeader('hula-hula-island', index)),
      customPages: hulaPlan.facilities.map((facility, index) => ({
        slug: facility.slug,
        title: facility.slug,
        // One page already has a real photograph of its own.
        ...(index === 0 ? { heroImage: `${CLOUDINARY}/pages/hula-hula-island/${facility.slug}/real.jpg`, heroImageAlt: 'The real page photograph' } : {}),
      })),
    },
  ]);
  await Attraction.collection.insertMany([
    // Real photographs that the seed mirrored into the site's tour folder: the regression.
    tourDocument(paradiseId, dolphin, ['d1', 'd2', 'd3', 'd4'].map((id) => realTourPhoto(dolphin, id))),
    // Header photographs reused on a tour, plus one mirrored into the tour folder.
    tourDocument(paradiseId, cruise, [
      ...[1, 2, 3, 4].map((index) => realHeader('paradise-island-hurghada', index)),
      realTourPhoto(cruise, 'c1'),
    ]),
    ...hulaPlan.tours.map((item) => tourDocument(hulaId, item.slug, [])),
  ]);
});

it('keeps every real photograph first and fills the gap from the first scene, even inside the site tour folder', async () => {
  const dolphinBefore = (await tour(dolphin))!.images as string[];
  const cruiseBefore = (await tour(cruise))!.images as string[];
  await runFor('paradise-island-hurghada');

  const dolphinAfter = (await tour(dolphin))!;
  expect(dolphinAfter.images.slice(0, 4)).toEqual(dolphinBefore);
  expect(dolphinAfter.images.slice(4)).toEqual([1, 2].map((index) => (
    `https://res.cloudinary.com/dm3sxllch/image/upload/v1/attractions-network/tours/paradise-island-hurghada/generated/${dolphin}-generated-0${index}.jpg`
  )));
  // Each generated frame declares itself; real photographs gain no description.
  expect(dolphinAfter.imageAltTexts.map((row: { url: string }) => row.url)).toEqual(dolphinAfter.images.slice(4));
  expect(dolphinAfter.imageAltTexts.every((row: { alt: string }) => row.alt.startsWith('Illustrative image: '))).toBe(true);
  expect(dolphinAfter.presentationRevision).toBe(2);

  const cruiseAfter = (await tour(cruise))!;
  expect(cruiseAfter.images.slice(0, 5)).toEqual(cruiseBefore);
  // Five real photographs leave room for one frame, and it is the plan's first scene.
  expect(cruiseAfter.images).toHaveLength(6);
  expect(cruiseAfter.images[5]).toMatch(/\/generated\/paradise-island-cruise-with-lunch-and-snorkelling-generated-01\.jpg$/);
  expect(cruiseAfter.imageAltTexts).toEqual([{
    url: cruiseAfter.images[5],
    alt: expect.stringMatching(/^Illustrative image: the open upper deck of a generic excursion yacht/),
  }]);

  const tenant = (await Tenant.collection.findOne({ _id: paradiseId }))!;
  expect(tenant.heroImages.slice(0, 4)).toEqual([1, 2, 3, 4].map((index) => realHeader('paradise-island-hurghada', index)));
  expect(tenant.heroImages).toHaveLength(paradisePlan.heroTarget);
  expect(tenant.heroImages.slice(4).every((url: string) => url.includes('/tours/paradise-island-hurghada/generated/hero-generated-'))).toBe(true);

  // 2 dolphin + 1 cruise + 3 headers, each uploaded into the generated folder only.
  expect(generate).toHaveBeenCalledTimes(6);
  expect(upload.mock.calls.every(([, folder]) => folder === 'tours/paradise-island-hurghada/generated')).toBe(true);
});

it('does nothing on a second run', async () => {
  await runFor('paradise-island-hurghada');
  const snapshot = await Attraction.collection.find({}, { sort: { slug: 1 } }).toArray();
  const headers = (await Tenant.collection.findOne({ _id: paradiseId }))!.heroImages;
  generate.mockClear();
  upload.mockClear();

  await runFor('paradise-island-hurghada');

  expect(generate).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
  expect(await Attraction.collection.find({}, { sort: { slug: 1 } }).toArray()).toEqual(snapshot);
  expect((await Tenant.collection.findOne({ _id: paradiseId }))!.heroImages).toEqual(headers);
});

it('refuses to attach a frame over an edit an administrator saved mid-run, and resumes cleanly', async () => {
  const before = (await tour(dolphin))!;
  // An administrator saves the tour while the first frame is being generated.
  upload.mockImplementationOnce(async (_data: string, folder: string, options: { publicId: string }) => {
    await Attraction.collection.updateOne({ slug: dolphin }, { $inc: { presentationRevision: 1 } });
    return { url: `https://res.cloudinary.com/dm3sxllch/image/upload/v1/attractions-network/${folder}/${options.publicId}.jpg` };
  });

  await expect(runFor('paradise-island-hurghada')).rejects.toThrow(`Concurrent image edit detected on ${dolphin}`);
  const refused = (await tour(dolphin))!;
  expect(refused.images).toEqual(before.images);
  expect(refused.imageAltTexts).toBeUndefined();
  expect(refused.presentationRevision).toBe(1);

  await runFor('paradise-island-hurghada');
  const resumed = (await tour(dolphin))!;
  expect(resumed.images).toHaveLength(6);
  expect(resumed.images.slice(0, 4)).toEqual(before.images);
  expect(resumed.presentationRevision).toBe(3);
});

it('fills a site with no photography and only the pages that have no photograph of their own', async () => {
  await runFor('hula-hula-island');

  for (const item of hulaPlan.tours) {
    const record = (await tour(item.slug))!;
    expect(record.images).toHaveLength(Math.min(6, item.scenes.length));
    expect(record.images.every((url: string) => url.includes('/tours/hula-hula-island/generated/'))).toBe(true);
    expect(record.imageAltTexts.map((row: { url: string }) => row.url)).toEqual(record.images);
    expect(record.imageAltTexts.every((row: { alt: string }) => row.alt.startsWith('Illustrative image: '))).toBe(true);
  }

  const tenant = (await Tenant.collection.findOne({ _id: hulaId }))!;
  const [kept, ...filled] = tenant.customPages;
  expect(kept.heroImage).toBe(`${CLOUDINARY}/pages/hula-hula-island/${hulaPlan.facilities[0]!.slug}/real.jpg`);
  expect(kept.heroImageAlt).toBe('The real page photograph');
  for (const page of filled) {
    expect(page.heroImage).toMatch(/\/tours\/hula-hula-island\/generated\/page-/);
    expect(page.heroImageAlt).toMatch(/^Illustrative image: /);
  }
  expect(tenant.heroImages.slice(0, 2)).toEqual([1, 2].map((index) => realHeader('hula-hula-island', index)));
  expect(tenant.heroImages).toHaveLength(hulaPlan.heroTarget);

  // The other site is never touched.
  expect((await tour(dolphin))!.images).toHaveLength(4);
});

describe('frames generated elsewhere', () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(512, 7)]);
  let dir: string;
  const paradiseFrames = [
    `${dolphin}-generated-01`, `${dolphin}-generated-02`, `${cruise}-generated-01`,
    'hero-generated-01', 'hero-generated-02', 'hero-generated-03',
  ];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'island-frames-'));
    generate.mockImplementation(async () => { throw new Error('the image API must not be called'); });
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    generate.mockImplementation(async () => ({ base64: 'AAAA', mimeType: 'image/jpeg' }));
  });

  it('attaches each file through the same audited path without calling the image API', async () => {
    for (const name of paradiseFrames) fs.writeFileSync(path.join(dir, `${name}.png`), PNG);
    await runFor('paradise-island-hurghada', [`--source-dir=${dir}`]);
    expect(generate).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(paradiseFrames.length);
    expect(upload.mock.calls.every(([data]) => String(data).startsWith('data:image/png;base64,'))).toBe(true);
    const record = (await tour(dolphin))!;
    expect(record.images).toHaveLength(6);
    expect(record.imageAltTexts.every((row: { alt: string }) => row.alt.startsWith('Illustrative image: '))).toBe(true);
  });

  it('refuses a missing frame and attaches nothing for it, keeping what was already attached', async () => {
    fs.writeFileSync(path.join(dir, `${cruise}-generated-01.png`), PNG);
    fs.writeFileSync(path.join(dir, `${dolphin}-generated-01.png`), PNG);
    await expect(runFor('paradise-island-hurghada', [`--source-dir=${dir}`])).rejects.toThrow(`Missing generated frame for ${dolphin}-generated-02`);
    expect((await tour(dolphin))!.images).toHaveLength(5);
    expect(generate).not.toHaveBeenCalled();
  });

  it('refuses a file whose bytes are not an image, whatever its name says', async () => {
    fs.writeFileSync(path.join(dir, `${cruise}-generated-01.png`), 'not an image');
    await expect(runFor('paradise-island-hurghada', [`--source-dir=${dir}`])).rejects.toThrow('is not a PNG, JPEG or WebP image');
    expect((await tour(cruise))!.images).toHaveLength(5);
  });

  it('reads JPEG and WebP by their own bytes', () => {
    fs.writeFileSync(path.join(dir, 'a.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    fs.writeFileSync(path.join(dir, 'b.webp'), Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]));
    expect(frameFromSourceDir(dir, 'a').mimeType).toBe('image/jpeg');
    expect(frameFromSourceDir(dir, 'b').mimeType).toBe('image/webp');
  });
});
