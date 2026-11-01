/**
 * Creates one protected request-only website, never tour inventory or a payment configuration.
 * Check is the default. Apply needs an explicit confirmation, existing journal directory, uploaded
 * asset manifest and a preview code supplied by the environment. Journal files contain no secrets.
 * Retire only disables this script's unchanged record; it never deletes a tenant or a request.
 */
import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { Tenant } from '../models/Tenant';
import { CORAL_REQUEST_TENANT_SLUG } from '../utils/coralRequestPolicy';

class CoralSeedRefusal extends Error {}

/** Only our fixed refusal strings are safe to show; native errors may contain connection credentials. */
export function coralSeedFailureMessage(error: unknown): string {
  return error instanceof CoralSeedRefusal
    ? error.message
    : 'Coral site operation did not complete. Review the saved journal and approved configuration; no connection or record details have been printed.';
}

const DOMAIN = 'coral-safari-hurghada.foxesnetwork.com';
const assetUrl = z.string().url().refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && !url.username && !url.password;
  } catch { return false; }
}, 'Use an actual Cloudinary upload URL');
export const coralAssetManifestSchema = z.object({
  logo: assetUrl,
  logoDark: assetUrl.optional(),
  heroImages: z.array(assetUrl).min(1).max(4),
}).strict();
export type CoralAssets = z.infer<typeof coralAssetManifestSchema>;
const journalSchema = z.object({
  version: z.literal(1),
  kind: z.literal('coral-request-site'),
  tenantId: z.string().regex(/^[a-f0-9]{24}$/),
  createdAt: z.string().datetime(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(['prepared', 'applied', 'retired']),
}).strict();
export type CoralSeedJournal = z.infer<typeof journalSchema>;

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
};
const fingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonical(JSON.parse(JSON.stringify(value))))).digest('hex');

export function coralTenantFields(assets: CoralAssets, previewCode: string) {
  // Match PreviewUnlockClient and the platform generator: eight alphanumeric characters, XXXX-XXXX.
  const normalizedCode = previewCode.replace(/[-\s]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(normalizedCode)) throw new CoralSeedRefusal('Supply the 8-character preview code securely in CORAL_PREVIEW_CODE.');
  return {
    slug: CORAL_REQUEST_TENANT_SLUG, name: 'Coral Safari Hurghada', domain: DOMAIN,
    // The requested custom domain is not assigned until its ownership and registration are confirmed.
    domainMigrated: false, customDomainStatus: 'unconfigured', designMode: 'default',
    logo: assets.logo, logoDark: assets.logoDark || assets.logo, heroImages: assets.heroImages,
    tagline: 'Horse riding, quad safaris and camel rides',
    description: 'Request a horse ride, quad safari or camel ride. Share your preferred date and pickup area; the arrangements are confirmed separately.',
    theme: { primaryColor: '#174C47', secondaryColor: '#F5EFE4', accentColor: '#BC573D' },
    defaultCurrency: 'USD', defaultLanguage: 'en', supportedLanguages: ['en'], timezone: 'Africa/Cairo',
    status: 'active', previewAccessCode: `${normalizedCode.slice(0, 4)}-${normalizedCode.slice(4)}`, flatUrls: false,
    // The operator's supplied Google business listing; no phone or email has been inferred.
    contactInfo: { address: 'Coral hotel, Hurghada 1, Red Sea Governorate 84511, Egypt' }, notificationSettings: {}, socialLinks: {},
    enabledSections: [],
    paymentSettings: { enabledGateways: [], allowPayAtLocation: false, ownPaymentGateway: false, stripe: { enabled: false } },
    bundleSettings: { mode: 'off', reason: 'This website accepts activity requests only.' },
    aiSettings: {
      bookingWidget: { enabled: false }, voiceAgent: { enabled: false }, searchWidget: { enabled: false },
    },
    navigation: [{ label: 'Home', href: '/' }, { label: 'Experiences', href: '/safari' }, { label: 'Request a trip', href: '/request' }],
  };
}

function candidate(assets: CoralAssets, previewCode: string, tenantId: string, createdAt: string) {
  const timestamp = new Date(createdAt);
  const fields = coralTenantFields(assets, previewCode);
  // Mongoose gives navigation items random IDs; derive them from this journal so retry fingerprints stay stable.
  const navigation = fields.navigation.map((item, index) => ({ ...item, _id: new Types.ObjectId(createHash('sha256').update(`${tenantId}:navigation:${index}`).digest('hex').slice(0, 24)) }));
  return new Tenant({ ...fields, navigation, _id: new Types.ObjectId(tenantId), createdAt: timestamp, updatedAt: timestamp, previewAccessCodeUpdatedAt: timestamp, __v: 0 });
}

export async function prepareCoralSeed(assets: CoralAssets, previewCode: string): Promise<CoralSeedJournal> {
  coralAssetManifestSchema.parse(assets);
  const tenantId = new Types.ObjectId().toHexString();
  const createdAt = new Date().toISOString();
  const doc = candidate(assets, previewCode, tenantId, createdAt);
  await doc.validate();
  return { version: 1, kind: 'coral-request-site', tenantId, createdAt, fingerprint: fingerprint(doc.toObject()), state: 'prepared' };
}

export async function inspectCoralSeed() {
  const records = await Tenant.find({ $or: [{ slug: CORAL_REQUEST_TENANT_SLUG }, { domain: DOMAIN }, { domain: 'coralsafarihurghada.com' }, { customDomain: 'coralsafarihurghada.com' }] }).select('_id slug domain status').limit(10).lean();
  return records.map(record => ({ id: String(record._id), slug: record.slug, domain: record.domain, status: record.status }));
}

export async function applyCoralSeed(assets: CoralAssets, previewCode: string, rawJournal: CoralSeedJournal): Promise<'created' | 'unchanged'> {
  const journal = journalSchema.parse(rawJournal);
  if (journal.state === 'retired') throw new CoralSeedRefusal('This creation journal was retired; reopening requires a new decision.');
  coralAssetManifestSchema.parse(assets);
  const doc = candidate(assets, previewCode, journal.tenantId, journal.createdAt);
  await doc.validate();
  if (fingerprint(doc.toObject()) !== journal.fingerprint) throw new CoralSeedRefusal('The asset manifest or preview settings differ from the prepared journal.');
  const records = await inspectCoralSeed();
  const existing = await Tenant.collection.findOne({ _id: doc._id });
  if (existing) {
    if (fingerprint(existing) !== journal.fingerprint || records.some(record => record.id !== journal.tenantId)) throw new CoralSeedRefusal('The existing website differs from this creation journal; refusing to overwrite it.');
    return 'unchanged';
  }
  if (records.length) throw new CoralSeedRefusal('A matching website already exists; this create-only seed will not modify it.');
  await Tenant.createIndexes();
  try {
    await doc.save({ timestamps: false });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const concurrent = await Tenant.collection.findOne({ _id: doc._id });
    if (concurrent && fingerprint(concurrent) === journal.fingerprint) return 'unchanged';
    throw new CoralSeedRefusal('A matching website was created concurrently; refusing to overwrite it.');
  }
  const stored = await Tenant.collection.findOne({ _id: doc._id });
  if (!stored || fingerprint(stored) !== journal.fingerprint) throw new CoralSeedRefusal('Creation needs inspection: stored state does not match the prepared journal.');
  return 'created';
}

export async function retireCoralSeed(rawJournal: CoralSeedJournal): Promise<'retired' | 'unchanged'> {
  const journal = journalSchema.parse(rawJournal);
  const _id = new Types.ObjectId(journal.tenantId);
  const existing = await Tenant.collection.findOne({ _id, slug: CORAL_REQUEST_TENANT_SLUG });
  if (!existing) throw new CoralSeedRefusal('The journal does not identify an existing Coral website.');
  // Recover a committed retirement even if the process stopped before updating the journal.
  // Only its exact status/timestamp effect is ignored; every other field must still be ours.
  if (existing.status === 'inactive' && fingerprint({ ...existing, status: 'active', updatedAt: new Date(journal.createdAt) }) === journal.fingerprint) return 'unchanged';
  if (journal.state === 'retired' || fingerprint(existing) !== journal.fingerprint) throw new CoralSeedRefusal('The website changed after creation; refusing to retire it automatically.');
  const result = await Tenant.updateOne({ _id, slug: CORAL_REQUEST_TENANT_SLUG, updatedAt: existing.updatedAt, status: 'active' }, { $set: { status: 'inactive' } });
  if (result.modifiedCount !== 1) throw new CoralSeedRefusal('The website changed during retirement; no automatic rollback was made.');
  return 'retired';
}

function writeJournal(filename: string, journal: CoralSeedJournal, exclusive = false) {
  const contents = `${JSON.stringify(journal, null, 2)}\n`;
  if (exclusive) { fs.writeFileSync(filename, contents, { flag: 'wx', mode: 0o600 }); return; }
  const pending = path.join(path.dirname(filename), `.coral-journal-${randomUUID()}.tmp`);
  fs.writeFileSync(pending, contents, { flag: 'wx', mode: 0o600 });
  fs.renameSync(pending, filename);
}

async function main() {
  const args = new Map(process.argv.slice(2).map(arg => { const [key, ...value] = arg.replace(/^--/, '').split('='); return [key, value.join('=')]; }));
  const command = args.has('apply') ? 'apply' : args.has('retire') ? 'retire' : 'check';
  if (args.has('apply') && args.has('retire')) throw new CoralSeedRefusal('Choose apply or retire, never both.');
  if (!process.env.MONGODB_URI) throw new CoralSeedRefusal('MONGODB_URI must be explicitly supplied by the approved environment.');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  try {
    console.log(JSON.stringify({ command, target: CORAL_REQUEST_TENANT_SLUG, database: mongoose.connection.name, found: await inspectCoralSeed() }));
    if (command === 'check') return;
    if (args.get('confirm') !== CORAL_REQUEST_TENANT_SLUG) throw new CoralSeedRefusal('Confirm exactly --confirm=coral-safari-hurghada.');
    if (args.get('database') !== mongoose.connection.name) throw new CoralSeedRefusal('Confirm the exact database from the read-only check with --database.');
    const filename = args.get('journal');
    if (!filename || !fs.existsSync(path.dirname(filename))) throw new CoralSeedRefusal('Pass --journal in an existing private evidence directory.');
    if (command === 'retire') {
      const journal = journalSchema.parse(JSON.parse(fs.readFileSync(filename, 'utf8')));
      console.log(JSON.stringify({ action: await retireCoralSeed(journal), target: CORAL_REQUEST_TENANT_SLUG }));
      writeJournal(filename, { ...journal, state: 'retired' });
      return;
    }
    const assetFile = args.get('assets');
    if (!assetFile) throw new CoralSeedRefusal('Pass the real upload manifest with --assets.');
    const assets = coralAssetManifestSchema.parse(JSON.parse(fs.readFileSync(assetFile, 'utf8')));
    for (const url of new Set([assets.logo, assets.logoDark, ...assets.heroImages].filter((value): value is string => Boolean(value)))) {
      const response = await fetch(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new CoralSeedRefusal('An uploaded asset is not available as an image.');
    }
    const previewCode = process.env.CORAL_PREVIEW_CODE || '';
    const journal = fs.existsSync(filename)
      ? journalSchema.parse(JSON.parse(fs.readFileSync(filename, 'utf8')))
      : await prepareCoralSeed(assets, previewCode);
    if (!fs.existsSync(filename)) writeJournal(filename, journal, true);
    const action = await applyCoralSeed(assets, previewCode, journal);
    writeJournal(filename, { ...journal, state: 'applied' });
    console.log(JSON.stringify({ action, target: CORAL_REQUEST_TENANT_SLUG, requestOnly: true, inventoryCreated: 0, messagesSent: 0 }));
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) main().catch(error => { console.error(coralSeedFailureMessage(error)); process.exitCode = 1; });
