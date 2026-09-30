/**
 * Six city-departure enquiries backed by existing Grand Rock activities.
 * Default: offline plan. --check: scoped read-only database plan.
 * Apply: --apply --confirm-tenant=grand-rock-safari --receipt-out=<new.json>
 * Rollback: --archive-receipt=<receipt.json> --confirm-tenant=grand-rock-safari
 * Existing records are NEVER refreshed: operator edits survive every rerun.
 * Global destinations and the nine source activities are never written.
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose, { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Destination } from '../models/Destination';
import { Tenant } from '../models/Tenant';

export const TENANT_SLUG = 'grand-rock-safari';
export const TENANT_ID = '6abcd8158e601a0ba8d55306';
const CITIES = [
  { slug: 'hurghada', name: 'Hurghada' },
  { slug: 'el-gouna', name: 'El Gouna' },
  { slug: 'marsa-alam', name: 'Marsa Alam' },
];
const SOURCES = [
  { slug: 'quad-safari-vip', id: '6abcd81626f932a904cbaa63', title: 'Quad Safari VIP', location: 'Makadi Bay', url: 'https://grandrocksafari.com/tours/quad-safari-vip/' },
  { slug: 'private-speed-boat-snorkeling-sahl-hasheesh', id: '6abcd81926f932a904cbab0d', title: 'Private Boat Snorkelling', location: 'Sahl Hasheesh', url: 'https://grandrocksafari.com/tours/private-speed-boat/' },
];
export const CITY_ENQUIRIES = CITIES.flatMap(city => SOURCES.map(source => ({
  slug: `${source.slug}-from-${city.slug}`, city, source,
  title: `${source.title} — ${city.name} Enquiry`,
})));
type Value = Record<string, any>;
const provenance = SOURCES.map(source => ({ id: source.id, slug: source.slug, url: source.url, activityLocation: source.location }));
export type CityPlan = { tenantId: string; records: Value[]; existing: string[]; provenance: typeof provenance };
export type Receipt = { version: 1; tenantId: string; tenantSlug: string; created: Array<{ id: string; slug: string; updatedAt: string }>; preserved: string[]; provenance: typeof provenance; pending?: { id: string; slug: string; updatedAt: string } };
const tenantScope = () => ({ _id: new Types.ObjectId(TENANT_ID), slug: TENANT_SLUG, name: 'Grand Rock Safari', customDomain: 'grandrocksafari.com', status: 'active', designMode: 'savanna' });
const tourScope = (slug: string) => ({ slug, ownerTenantId: new Types.ObjectId(TENANT_ID), tenantIds: [new Types.ObjectId(TENANT_ID)] });

export function buildEnquiry(spec: typeof CITY_ENQUIRIES[number], source: Value, city: Value): Value {
  if (String(source._id) !== spec.source.id || source.slug !== spec.source.slug || String(source.ownerTenantId) !== TENANT_ID
    || source.status !== 'active' || source.destination?.city !== spec.source.location
    || source.tenantIds?.length !== 1 || String(source.tenantIds[0]) !== TENANT_ID) throw new Error(`Source activity identity mismatch: ${spec.source.slug}`);
  if (city.slug !== spec.city.slug || city.name !== spec.city.name || city.country !== 'Egypt' || city.isActive !== true
    || !Number.isFinite(city.coordinates?.lat) || !Number.isFinite(city.coordinates?.lng)) throw new Error(`Missing or invalid shared destination: ${spec.city.slug}`);
  const lead = source.images?.[0];
  if (typeof lead !== 'string' || !lead.startsWith('https://res.cloudinary.com/') || !lead.includes(`/tours/${TENANT_SLUG}/${spec.source.slug}/`)) throw new Error(`Missing owned source lead photo: ${spec.source.slug}`);
  const description = `Staying in ${spec.city.name}? Ask Grand Rock Safari whether this experience can be arranged for your hotel and dates. This is a departure enquiry, not a confirmed tour or transfer package.\n\nThe activity takes place in ${spec.source.location}, not ${spec.city.name}. It is based on our ${spec.source.title} experience.\n\nBefore reserving, the team must confirm transfer feasibility, the pickup arrangements, travel time, activity availability, participant requirements, the complete quote and cancellation terms. Transfers are not included or guaranteed by this listing. No payment or booking can be made online for this enquiry.`;
  return {
    slug: spec.slug, pathSlug: spec.slug, parentPage: { label: 'Safaris', path: '/safaris' }, title: spec.title,
    shortDescription: `Enquire from ${spec.city.name} about ${spec.source.title} in ${spec.source.location}. Hotel transfer availability, dates and the complete quote must be confirmed before reserving.`,
    description, images: [lead], imageAltTexts: [{ url: lead, alt: `${spec.source.title} activity in ${spec.source.location}` }],
    category: source.category, destination: { city: city.name, country: city.country, coordinates: city.coordinates },
    enquiryOnly: true, currency: 'EUR', pricingOptions: [], addons: [], entryWindows: [], itinerary: [],
    languages: source.languages || [], highlights: [`Departure enquiry for guests staying in ${spec.city.name}`, `Actual activity location: ${spec.source.location}`, 'Full quote and arrangements confirmed directly before reservation'],
    inclusions: [], exclusions: [], needToKnow: ['This listing accepts enquiries only; availability and hotel transfer feasibility are not confirmed.', 'Ask for the complete price, pickup arrangements, travel time, participant requirements and cancellation terms before reserving.'],
    meetingPoint: { address: '', instructions: 'Pickup or meeting arrangements are confirmed only after your enquiry is reviewed.', mapUrl: '' },
    hasHotelPickup: false, instantConfirmation: false, mobileTicket: false, cancellationPolicy: undefined,
    badges: [], availability: { type: 'flexible', advanceBooking: 0 }, ownerTenantId: new Types.ObjectId(TENANT_ID), tenantIds: [new Types.ObjectId(TENANT_ID)],
    reseller: { enabled: false, value: 0, allowedTenants: [] }, status: 'active', featured: false,
    sortOrder: 10 + CITY_ENQUIRIES.findIndex(item => item.slug === spec.slug),
    seo: { metaTitle: spec.title, metaDescription: `Ask about ${spec.source.title} in ${spec.source.location} while staying in ${spec.city.name}. Availability and complete quote confirmed directly.` },
  };
}

export async function prepareCityPlan(): Promise<CityPlan> {
  if (!await Tenant.exists(tenantScope())) throw new Error('Exact active Grand Rock production tenant did not match');
  const sources = await Attraction.find({ ownerTenantId: new Types.ObjectId(TENANT_ID), tenantIds: new Types.ObjectId(TENANT_ID), _id: { $in: SOURCES.map(source => new Types.ObjectId(source.id)) } }).lean();
  const cities = await Destination.find({ slug: { $in: CITIES.map(city => city.slug) } }).lean();
  const records = CITY_ENQUIRIES.map(spec => buildEnquiry(spec, sources.find(source => source.slug === spec.source.slug) || {}, cities.find(city => city.slug === spec.city.slug) || {}));
  // Validate actual persistence shape before ANY write, including absent price/duration.
  for (const record of records) await new Attraction(record).validate();
  const existing: string[] = [];
  for (const record of records) {
    const owned = await Attraction.findOne(tourScope(record.slug)).lean();
    if (owned) {
      if (owned.enquiryOnly !== true) throw new Error(`Existing record is not an enquiry; refusing to overwrite: ${record.slug}`);
      existing.push(record.slug);
    }
  }
  return { tenantId: TENANT_ID, records, existing, provenance };
}

export async function applyCityPlan(plan: CityPlan, checkpoint: (receipt: Receipt) => void = () => undefined): Promise<Receipt> {
  // Rebuild from current source records immediately before applying. Caller cannot inject data.
  const current = await prepareCityPlan();
  if (plan.tenantId !== TENANT_ID || JSON.stringify(plan.records) !== JSON.stringify(current.records)) throw new Error('Plan/source changed; review a fresh plan before applying');
  const receipt: Receipt = { version: 1, tenantId: TENANT_ID, tenantSlug: TENANT_SLUG, created: [], preserved: [], provenance: current.provenance };
  checkpoint(receipt);
  for (const record of current.records) {
    if (!await Tenant.exists(tenantScope())) throw new Error('Tenant changed during apply; rerun after review');
    // Compare-and-set creation only: a concurrent owned enquiry matches and is preserved;
    // a conflicting/converted/foreign record hits the unique slug fence and aborts untouched.
    const now = new Date();
    const candidateId = new Types.ObjectId();
    receipt.pending = { id: String(candidateId), slug: record.slug, updatedAt: now.toISOString() };
    checkpoint(receipt); // write-ahead: rollback can discover a commit interrupted before its receipt update.
    const result = await Attraction.findOneAndUpdate(
      { ...tourScope(record.slug), enquiryOnly: true }, { $setOnInsert: { ...record, _id: candidateId, createdAt: now, updatedAt: now } },
      { upsert: true, new: true, timestamps: false, setDefaultsOnInsert: false, runValidators: true, includeResultMetadata: true },
    );
    if (!result.value) throw new Error(`No record returned: ${record.slug}`);
    if (result.lastErrorObject?.updatedExisting) receipt.preserved.push(record.slug);
    else receipt.created.push({ id: String(result.value._id), slug: record.slug, updatedAt: result.value.updatedAt.toISOString() });
    delete receipt.pending;
    checkpoint(receipt); // durable after each successful creation; partial failure is resumable.
  }
  return receipt;
}

export async function archiveReceipt(receipt: Receipt): Promise<number> {
  if (receipt.version !== 1 || receipt.tenantId !== TENANT_ID || receipt.tenantSlug !== TENANT_SLUG || !Array.isArray(receipt.created) || !await Tenant.exists(tenantScope())) throw new Error('Invalid receipt or target tenant');
  const candidates = [...receipt.created];
  if (receipt.pending) {
    const pending = receipt.pending;
    if (!Types.ObjectId.isValid(pending.id) || !CITY_ENQUIRIES.some(spec => spec.slug === pending.slug) || !Number.isFinite(Date.parse(pending.updatedAt))) throw new Error('Invalid pending receipt creation');
    if (await Attraction.exists({ ...tourScope(pending.slug), _id: new Types.ObjectId(pending.id) })) candidates.push(pending);
  }
  const seen = new Set<string>();
  const active: typeof candidates = [];
  for (const item of candidates) {
    if (!Types.ObjectId.isValid(item.id) || !CITY_ENQUIRIES.some(spec => spec.slug === item.slug) || seen.has(item.id) || !Number.isFinite(Date.parse(item.updatedAt))) throw new Error('Receipt contains invalid or duplicate creation');
    seen.add(item.id);
    const record = await Attraction.findOne({ ...tourScope(item.slug), _id: new Types.ObjectId(item.id), enquiryOnly: true }).select('status updatedAt').lean();
    if (record?.status === 'archived') continue; // repeating rollback never revives or rewrites an archived record.
    if (record?.status !== 'active' || record.updatedAt?.getTime() !== new Date(item.updatedAt).getTime()) throw new Error(`Record changed; refusing archive: ${item.slug}`);
    active.push(item);
  }
  let archived = 0;
  for (const item of active) {
    if (!await Tenant.exists(tenantScope())) throw new Error('Tenant changed during archive');
    const result = await Attraction.updateOne({ ...tourScope(item.slug), _id: new Types.ObjectId(item.id), enquiryOnly: true, status: 'active', updatedAt: new Date(item.updatedAt) }, { $set: { status: 'archived', archivedAt: new Date() } });
    if (result.modifiedCount !== 1) throw new Error(`Concurrent edit preserved; archive stopped: ${item.slug}`);
    archived += 1;
  }
  return archived;
}

export function parseCityArgs(args: string[]) {
  const apply = args.includes('--apply'), check = args.includes('--check');
  const archive = args.find(arg => arg.startsWith('--archive-receipt='))?.slice('--archive-receipt='.length);
  const receiptOut = args.find(arg => arg.startsWith('--receipt-out='))?.slice('--receipt-out='.length);
  const allowed = args.every(arg => ['--apply', '--check', '--confirm-tenant=grand-rock-safari'].includes(arg) || arg.startsWith('--archive-receipt=') || arg.startsWith('--receipt-out='));
  if (!allowed || [apply, check, Boolean(archive)].filter(Boolean).length > 1) throw new Error('Unknown or conflicting arguments');
  if ((apply || archive) && !args.includes(`--confirm-tenant=${TENANT_SLUG}`)) throw new Error('Explicit Grand Rock tenant confirmation required');
  if (apply && !receiptOut) throw new Error('Apply requires a new receipt output path');
  if (receiptOut && fs.existsSync(receiptOut)) throw new Error('Receipt output already exists; choose a new path');
  return { apply, check, archive, receiptOut };
}

async function main(): Promise<void> {
  const options = parseCityArgs(process.argv.slice(2));
  if (!options.apply && !options.check && !options.archive) {
    console.log(JSON.stringify({ mode: 'offline-dry-run', tenantId: TENANT_ID, variants: CITY_ENQUIRIES, policy: 'Enquiry only; no prices, transfer promise or total duration; existing records preserved; shared destinations untouched.' }, null, 2));
    return;
  }
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  await connectDatabase();
  try {
    if (options.archive) {
      const receipt = JSON.parse(fs.readFileSync(options.archive, 'utf8')) as Receipt;
      console.log(JSON.stringify({ mode: 'archive-preview', receipt }, null, 2));
      console.log(JSON.stringify({ archived: await archiveReceipt(receipt) }));
      return;
    }
    const plan = await prepareCityPlan();
    console.log(JSON.stringify({ mode: options.apply ? 'apply-preview' : 'read-only-check', plan }, null, 2));
    if (options.apply) {
      const filename = path.resolve(options.receiptOut!);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      // Reserve the new path before writing; never overwrite another run's receipt.
      fs.writeFileSync(filename, '', { flag: 'wx', mode: 0o600 });
      const receipt = await applyCityPlan(plan, value => {
        const checkpoint = `${filename}.checkpoint`;
        fs.writeFileSync(checkpoint, JSON.stringify(value, null, 2), { mode: 0o600 });
        fs.renameSync(checkpoint, filename);
      });
      console.log(JSON.stringify({ mode: 'applied', receipt }, null, 2));
    }
  } finally { await disconnectDatabase(); }
}
if (require.main === module) main().catch(() => { console.error('Grand Rock city enquiry operation failed; review the last checkpoint. No existing tour was overwritten.'); process.exitCode = 1; });
