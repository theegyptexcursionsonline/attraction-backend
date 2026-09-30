import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { spawnSync } from 'node:child_process';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { Destination } from '../models/Destination';
import { applyCityPlan, archiveReceipt, CITY_ENQUIRIES, parseCityArgs, prepareCityPlan, TENANT_ID } from '../scripts/seed-grand-rock-city-enquiries';

jest.setTimeout(120_000);
let mongo: MongoMemoryReplSet;
const owner = new Types.ObjectId(TENANT_ID);
const sourceSlugs = ['quad-safari-vip', 'private-speed-boat-snorkeling-sahl-hasheesh'];
const query = { ownerTenantId: owner, slug: { $in: CITY_ENQUIRIES.map(spec => spec.slug) } };
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const binary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = binary ? spawnSync(binary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: version || '7.0.14', ...(binary ? { systemBinary: binary } : {}) } });
  await mongoose.connect(mongo.getUri('grand_rock_city_enquiries'));
  await Promise.all([Attraction.init(), Tenant.init(), Destination.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
afterEach(() => jest.restoreAllMocks());
beforeEach(async () => {
  await Promise.all([Attraction, Tenant, Destination].map(model => model.collection.deleteMany({})));
  await Tenant.collection.insertOne({ _id: owner, slug: 'grand-rock-safari', name: 'Grand Rock Safari', customDomain: 'grandrocksafari.com', status: 'active', designMode: 'savanna' });
  await Destination.collection.insertMany([
    { slug: 'hurghada', name: 'Hurghada', country: 'Egypt', coordinates: { lat: 27.2, lng: 33.8 }, isActive: true },
    { slug: 'el-gouna', name: 'El Gouna', country: 'Egypt', coordinates: { lat: 27.3, lng: 33.7 }, isActive: true },
    { slug: 'marsa-alam', name: 'Marsa Alam', country: 'Egypt', coordinates: { lat: 25.9, lng: 34.5 }, isActive: true },
  ]);
  await Attraction.collection.insertMany(CITY_ENQUIRIES.slice(0, 2).map(spec => ({
    _id: new Types.ObjectId(spec.source.id), slug: spec.source.slug, title: spec.source.title, category: 'Outdoor', status: 'active', ownerTenantId: owner, tenantIds: [owner],
    destination: { city: spec.source.location }, images: [`https://res.cloudinary.com/demo/image/upload/tours/grand-rock-safari/${spec.source.slug}/owned-photo.jpg`], languages: ['English'],
  })));
});

it('requires exact tenant confirmation, separates modes and defaults to offline dry run', () => {
  expect(parseCityArgs([])).toMatchObject({ apply: false, check: false });
  expect(() => parseCityArgs(['--apply', '--receipt-out=new.json'])).toThrow('confirmation');
  expect(() => parseCityArgs(['--apply', '--confirm-tenant=grand-rock-safari'])).toThrow('receipt');
  expect(() => parseCityArgs(['--apply', '--check'])).toThrow('conflicting');
  expect(() => parseCityArgs(['--confirm-tenant=other'])).toThrow('Unknown');
});
it('builds two enquiries per existing city with truthful activity locations and no bookable price or total duration', async () => {
  const before = await Destination.collection.find({}).toArray();
  const plan = await prepareCityPlan();
  expect(plan.records).toHaveLength(6);
  expect(plan.provenance).toHaveLength(2);
  expect(plan.provenance[0].url).toBe('https://grandrocksafari.com/tours/quad-safari-vip/');
  for (const record of plan.records) {
    expect(record.enquiryOnly).toBe(true);
    expect(record.priceFrom).toBeUndefined();
    expect(record.duration).toBeUndefined();
    expect(record.cancellationPolicy).toBeUndefined();
    expect(record.pricingOptions).toEqual([]);
    expect(record.hasHotelPickup).toBe(false);
    expect(record.description).toContain('Transfers are not included or guaranteed');
    expect(record.description).not.toContain('/safaris/');
    expect(record.description).toContain('It is based on our');
    expect(record.images).toHaveLength(1);
    expect(record.imageAltTexts[0].url).toBe(record.images[0]);
    expect(record.images[0]).toContain('/owned-photo.jpg');
  }
  expect(await Destination.collection.find({}).toArray()).toEqual(before);
  expect(await Attraction.countDocuments(query)).toBe(0);
});
it.each(['customDomain', 'status', '_id'])('refuses a mismatched tenant %s before writing', async field => {
  if (field === '_id') await Tenant.collection.deleteOne({ _id: owner });
  else await Tenant.collection.updateOne({ _id: owner }, { $set: { [field]: 'wrong' } });
  await expect(prepareCityPlan()).rejects.toThrow('tenant did not match');
  expect(await Attraction.countDocuments(query)).toBe(0);
});
it('fails closed for missing shared destination or foreign-owned source activity', async () => {
  await Destination.collection.deleteOne({ slug: 'el-gouna' });
  await expect(prepareCityPlan()).rejects.toThrow('shared destination');
  await Destination.collection.insertOne({ slug: 'el-gouna', name: 'El Gouna', country: 'Egypt', coordinates: { lat: 27, lng: 33 }, isActive: true });
  await Attraction.collection.updateOne({ slug: sourceSlugs[0], ownerTenantId: owner }, { $set: { ownerTenantId: new Types.ObjectId() } });
  await expect(prepareCityPlan()).rejects.toThrow('Source activity identity');
});
it('persists all six without Mongoose cancellation defaults and preserves edits on rerun', async () => {
  const sources = await Attraction.collection.find({ slug: { $in: sourceSlugs } }).toArray();
  const destinations = await Destination.collection.find({}).toArray();
  const receipt = await applyCityPlan(await prepareCityPlan());
  expect(receipt.created).toHaveLength(6);
  const first = receipt.created[0];
  await Attraction.updateOne({ _id: new Types.ObjectId(first.id), ownerTenantId: owner }, { $set: { title: 'Operator edited title', images: ['https://res.cloudinary.com/demo/edited.jpg'] } });
  const edited = await Attraction.findOne({ _id: first.id, ownerTenantId: owner }).lean();
  const rerun = await applyCityPlan(await prepareCityPlan());
  expect((await Attraction.findOne({ _id: first.id, ownerTenantId: owner }).lean())?.updatedAt).toEqual(edited?.updatedAt);
  expect(rerun.created).toEqual([]);
  expect(rerun.preserved).toHaveLength(6);
  expect(await Attraction.findOne({ _id: first.id, ownerTenantId: owner }).lean()).toMatchObject({ title: 'Operator edited title', images: ['https://res.cloudinary.com/demo/edited.jpg'] });
  for (const record of await Attraction.find(query).lean()) {
    expect(record.priceFrom).toBeUndefined(); expect(record.duration).toBeUndefined(); expect(record.cancellationPolicy).toBeUndefined();
  }
  expect(await Attraction.collection.find({ slug: { $in: sourceSlugs } }).toArray()).toEqual(sources);
  expect(await Destination.collection.find({}).toArray()).toEqual(destinations);
});
it('refuses changed source snapshots and injected plan data', async () => {
  const plan = await prepareCityPlan();
  plan.records[0].priceFrom = 123;
  await expect(applyCityPlan(plan)).rejects.toThrow('Plan/source changed');
  expect(await Attraction.countDocuments(query)).toBe(0);
});
it('concurrent applies converge to six records and leave concurrent operator edits untouched', async () => {
  const plan = await prepareCityPlan();
  const receipts = await Promise.all([applyCityPlan(plan), applyCityPlan(plan)]);
  expect(await Attraction.countDocuments(query)).toBe(6);
  expect(receipts.flatMap(receipt => receipt.created)).toHaveLength(6);
  const fresh = await prepareCityPlan();
  await Attraction.updateOne({ slug: CITY_ENQUIRIES[0].slug, ownerTenantId: owner }, { $set: { description: 'Concurrent operator text' } });
  await applyCityPlan(fresh);
  expect(await Attraction.findOne({ slug: CITY_ENQUIRIES[0].slug, ownerTenantId: owner }).lean()).toMatchObject({ description: 'Concurrent operator text' });
});
it('never overwrites a foreign-owned slug or an existing converted bookable record', async () => {
  const plan = await prepareCityPlan();
  const foreignOwner = new Types.ObjectId();
  await Attraction.collection.insertOne({ ...plan.records[0], _id: new Types.ObjectId(), title: 'Foreign record', ownerTenantId: foreignOwner, tenantIds: [foreignOwner] });
  await expect(applyCityPlan(plan)).rejects.toThrow();
  expect(await Attraction.collection.findOne({ slug: plan.records[0].slug, ownerTenantId: foreignOwner })).toMatchObject({ title: 'Foreign record' });
  expect(await Attraction.countDocuments(query)).toBe(0);
  await Attraction.collection.deleteOne({ slug: plan.records[0].slug, ownerTenantId: foreignOwner });
  await Attraction.collection.insertOne({ ...plan.records[0], _id: new Types.ObjectId(), enquiryOnly: false, priceFrom: 99 });
  await expect(prepareCityPlan()).rejects.toThrow('not an enquiry');
});
it('checkpoints partial progress and resumes without recreating records', async () => {
  let checkpoint: any;
  await expect(applyCityPlan(await prepareCityPlan(), value => { checkpoint = JSON.parse(JSON.stringify(value)); if (value.created.length === 2) throw new Error('disk failure'); })).rejects.toThrow('disk failure');
  expect(checkpoint.created).toHaveLength(2);
  expect(await Attraction.countDocuments(query)).toBe(2);
  const resumed = await applyCityPlan(await prepareCityPlan());
  expect(resumed.created).toHaveLength(4);
  expect(resumed.preserved).toHaveLength(2);
});
it('archives only receipt-created unchanged records and refuses any edit before rollback', async () => {
  const receipt = await applyCityPlan(await prepareCityPlan());
  await Attraction.updateOne({ _id: receipt.created[0].id, ownerTenantId: owner }, { $set: { title: 'Keep my edit' } });
  await expect(archiveReceipt(receipt)).rejects.toThrow('Record changed');
  expect(await Attraction.countDocuments({ ...query, status: 'active' })).toBe(6);
  const untouched = { ...receipt, created: receipt.created.slice(1) };
  expect(await archiveReceipt(untouched)).toBe(5);
  expect(await archiveReceipt(untouched)).toBe(0);
  expect(await Attraction.countDocuments({ ...query, status: 'archived' })).toBe(5);
  expect(await Attraction.countDocuments({ ...query, status: 'active' })).toBe(1);
  expect(await Attraction.countDocuments({ ownerTenantId: owner, slug: { $in: sourceSlugs }, status: 'active' })).toBe(2);
});

it('write-ahead receipt recovers a commit interrupted before its completion checkpoint', async () => {
  let persisted: any;
  await expect(applyCityPlan(await prepareCityPlan(), value => {
    if (value.pending) persisted = JSON.parse(JSON.stringify(value));
    else if (value.created.length === 1) throw new Error('checkpoint unavailable');
  })).rejects.toThrow('checkpoint unavailable');
  expect(persisted.pending.slug).toBe(CITY_ENQUIRIES[0].slug);
  expect(await Attraction.countDocuments(query)).toBe(1);
  expect(await archiveReceipt(persisted)).toBe(1);
});
