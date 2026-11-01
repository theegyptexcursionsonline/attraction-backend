import { spawnSync } from 'child_process';
import mongoose from 'mongoose';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Tenant } from '../models/Tenant';
import { ContactMessage } from '../models/ContactMessage';
import previewRoutes from '../routes/preview.routes';
import request from '../test/loopbackRequest';
import { generatePreviewAccessCode } from '../utils/hash';
import { coralAssetManifestSchema, coralSeedFailureMessage, coralTenantFields, prepareCoralSeed, inspectCoralSeed, applyCoralSeed, retireCoralSeed } from '../scripts/seed-coral-request-site';

jest.setTimeout(90_000);
const assets = { logo: 'https://res.cloudinary.com/test/image/upload/coral-logo.svg', heroImages: ['https://res.cloudinary.com/test/image/upload/coral.jpg'] };
const previewCode = 'ABCD-2345';
let mongo: MongoMemoryServer;
beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const version = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryServer.create({ binary: { version: version || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('coral_seed'), { autoIndex: false });
});
beforeEach(async () => { await Tenant.collection.deleteMany({}); await ContactMessage.collection.deleteMany({}); });
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

it('builds a protected request site without invented stock, prices, contacts or custom-domain assignment', () => {
  expect(coralTenantFields(assets, previewCode)).toMatchObject({
    designMode: 'default', slug: 'coral-safari-hurghada', domainMigrated: false, customDomainStatus: 'unconfigured',
    contactInfo: { address: 'Coral hotel, Hurghada 1, Red Sea Governorate 84511, Egypt' }, notificationSettings: {},
    paymentSettings: { enabledGateways: [], allowPayAtLocation: false, ownPaymentGateway: false, stripe: { enabled: false } },
    bundleSettings: { mode: 'off' },
  });
  expect(coralTenantFields(assets, previewCode)).not.toHaveProperty('customDomain');
  expect(() => coralTenantFields(assets, 'short')).toThrow('preview code');
  expect(coralAssetManifestSchema.safeParse({ ...assets, logo: '/invented.png' }).success).toBe(false);
  expect(coralAssetManifestSchema.safeParse({ ...assets, heroImages: ['https://other.example/image.jpg'] }).success).toBe(false);
  expect(coralAssetManifestSchema.safeParse({ ...assets, heroImages: [] }).success).toBe(false);
});

it('checks without writing, creates once from a secret-free journal and replays without changes', async () => {
  expect(await inspectCoralSeed()).toEqual([]);
  const journal = await prepareCoralSeed(assets, previewCode);
  expect(JSON.stringify(journal)).not.toContain(previewCode);
  expect(await Tenant.countDocuments()).toBe(0);
  expect(await applyCoralSeed(assets, previewCode, journal)).toBe('created');
  const before = await Tenant.collection.findOne({ slug: 'coral-safari-hurghada' });
  // These are the actual Coral storefront routes; the saved tenant must not advertise a generic-site URL.
  expect(before?.navigation.map((item: { href: string }) => item.href)).toEqual(['/', '/safari', '/request']);
  expect(await applyCoralSeed(assets, previewCode, journal)).toBe('unchanged');
  expect(await Tenant.collection.findOne({ slug: 'coral-safari-hurghada' })).toEqual(before);
  expect(await Tenant.countDocuments()).toBe(1);
  const collections = (await mongoose.connection.db!.listCollections().toArray()).map(row => row.name);
  expect(collections).not.toContain('attractions');
  expect(collections).not.toContain('bookings');
});

it('refuses an existing same-slug website from any other journal without overwriting it', async () => {
  const first = await prepareCoralSeed(assets, previewCode);
  await applyCoralSeed(assets, previewCode, first);
  const second = await prepareCoralSeed(assets, previewCode);
  const before = await Tenant.collection.findOne({ slug: 'coral-safari-hurghada' });
  await expect(applyCoralSeed(assets, previewCode, second)).rejects.toThrow('already exists');
  expect(await Tenant.collection.findOne({ slug: 'coral-safari-hurghada' })).toEqual(before);
});

it('recovers a committed creation after the response was lost, using the original journal', async () => {
  const journal = await prepareCoralSeed(assets, previewCode);
  const original = Tenant.prototype.save;
  const save = jest.spyOn(Tenant.prototype, 'save').mockImplementationOnce(async function (this: InstanceType<typeof Tenant>, options?: mongoose.SaveOptions) {
    await original.call(this, options);
    throw new Error('Response lost after database write');
  } as typeof original);
  await expect(applyCoralSeed(assets, previewCode, journal)).rejects.toThrow('Response lost');
  save.mockRestore();
  expect(await applyCoralSeed(assets, previewCode, journal)).toBe('unchanged');
  expect(await Tenant.countDocuments()).toBe(1);
});

it('collapses simultaneous apply calls with one journal without creating another website', async () => {
  const journal = await prepareCoralSeed(assets, previewCode);
  const results = await Promise.all([applyCoralSeed(assets, previewCode, journal), applyCoralSeed(assets, previewCode, journal)]);
  expect(results.sort()).toEqual(['created', 'unchanged']);
  expect(await Tenant.countDocuments()).toBe(1);
});

it('refuses changing assets or preview settings after the creation plan', async () => {
  const journal = await prepareCoralSeed(assets, previewCode);
  await expect(applyCoralSeed({ ...assets, logo: 'https://res.cloudinary.com/test/image/upload/different.svg' }, previewCode, journal)).rejects.toThrow('differ');
  await expect(applyCoralSeed(assets, 'EFGH-6789', journal)).rejects.toThrow('differ');
  expect(await Tenant.countDocuments()).toBe(0);
});

it('retires only the unchanged owned website and keeps all records and requests', async () => {
  const journal = await prepareCoralSeed(assets, previewCode);
  await applyCoralSeed(assets, previewCode, journal);
  const tenantId = new mongoose.Types.ObjectId(journal.tenantId);
  await ContactMessage.collection.insertOne({ tenantId, reference: 'MSG-KEEP01', name: 'QA', email: 'theegyptexcursionsonline@gmail.com', message: 'Keep this request' });
  expect(await retireCoralSeed(journal)).toBe('retired');
  expect(await Tenant.countDocuments()).toBe(1);
  expect(await ContactMessage.countDocuments({ tenantId })).toBe(1);
  expect((await Tenant.findById(tenantId).lean())?.status).toBe('inactive');
  // The database may have committed before the process could mark its journal retired.
  expect(await retireCoralSeed(journal)).toBe('unchanged');
  expect(await retireCoralSeed({ ...journal, state: 'retired' })).toBe('unchanged');
  await expect(applyCoralSeed(assets, previewCode, { ...journal, state: 'retired' })).rejects.toThrow('retired');
  await Tenant.updateOne({ _id: tenantId }, { $set: { tagline: 'Later operator change' } });
  await expect(retireCoralSeed({ ...journal, state: 'retired' })).rejects.toThrow('changed after creation');
});

it('refuses both replay and retirement after an operator changed the website', async () => {
  const journal = await prepareCoralSeed(assets, previewCode);
  await applyCoralSeed(assets, previewCode, journal);
  await Tenant.updateOne({ slug: 'coral-safari-hurghada' }, { $set: { tagline: 'Operator changed the wording' } });
  await expect(applyCoralSeed(assets, previewCode, journal)).rejects.toThrow('differs');
  await expect(retireCoralSeed(journal)).rejects.toThrow('changed after creation');
  expect((await Tenant.findOne({ slug: 'coral-safari-hurghada' }).lean())?.status).toBe('active');
});

it('refuses a supplied custom-domain collision and leaves the other tenant untouched', async () => {
  await Tenant.create({ slug: 'existing-owner', name: 'Existing owner', domain: 'coralsafarihurghada.com', logo: assets.logo, status: 'active' });
  const journal = await prepareCoralSeed(assets, previewCode);
  await expect(applyCoralSeed(assets, previewCode, journal)).rejects.toThrow('already exists');
  expect(await Tenant.countDocuments()).toBe(1);
  expect((await Tenant.findOne().lean())?.slug).toBe('existing-owner');
});


it('never formats native connection or filesystem errors with their sensitive details', () => {
  const credentialUri = ['mongodb+srv:', '//qa:', 'redaction-sentinel', '@db.invalid/site'].join('');
  for (const error of [new Error(credentialUri), new Error('/private/qa-sensitive-file'), { message: credentialUri }, undefined]) {
    const output = coralSeedFailureMessage(error);
    expect(output).toContain('operation did not complete');
    expect(output).not.toContain('redaction-sentinel');
    expect(output).not.toContain('qa-sensitive-file');
    expect(output).not.toContain('mongodb');
  }
  try { coralTenantFields(assets, 'short'); } catch (error) {
    expect(coralSeedFailureMessage(error)).toContain('Supply the 8-character preview code securely');
  }
});

it('unlocks the seeded tenant through the existing platform endpoints using the code its UI formats', async () => {
  const code = generatePreviewAccessCode();
  const journal = await prepareCoralSeed(assets, code);
  await applyCoralSeed(assets, code, journal);
  const app = express();
  app.use(express.json());
  app.use('/preview', previewRoutes);
  // Same eight-character normalization and grouping used by PreviewUnlockClient.
  const compact = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const uiCode = `${compact.slice(0, 4)}-${compact.slice(4)}`;
  const bySite = await request(app).post('/preview/unlock').send({ tenantSlug: 'coral-safari-hurghada', code: uiCode }).expect(200);
  expect(bySite.body.data.tenant.slug).toBe('coral-safari-hurghada');
  expect(JSON.stringify(bySite.body)).not.toContain(code);
  await request(app).post('/preview/unlock-by-code').send({ code: uiCode }).expect(200);
  await expect(prepareCoralSeed(assets, 'A'.repeat(36))).rejects.toThrow('8-character');
  expect(coralTenantFields(assets, compact.toLowerCase()).previewAccessCode).toBe(uiCode);
});
