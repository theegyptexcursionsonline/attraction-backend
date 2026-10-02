/**
 * Source-backed Cairo package completion. Dry run is the default and reads only this package.
 *   npx ts-node src/scripts/complete-cairo-package-content.ts --env-file=.env --plan-out=<file>
 * Apply a previously reviewed plan (after releasing the completion schema):
 *   ... --apply --confirm-tenant=cairo-tours-packages --plan=<file> --receipt=<file>
 * Recover by repeating the same command. Rollback is CAS-protected and never restores inventory:
 *   ... --apply --confirm-tenant=cairo-tours-packages --rollback=<receipt-file>
 * No bookings, messages, media, availability, payment or tenant records are written.
 */
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, openSync, fsyncSync, closeSync } from 'fs';
import { dirname } from 'path';
import { parse as parseEnv } from 'dotenv';
import { Db, MongoClient, ObjectId } from 'mongodb';
import { packageDetailsSchema } from '../utils/packageDetails';

export const CAIRO_TARGET = {
  tenantId: '699895e47169d9820932b9c4', tenantSlug: 'cairo-tours-packages',
  packageId: '6abf86c1df4d26fd0bc8f220',
  slug: 'cairo-nile-cruise-6-day-egypt-highlights-abu-simbel-hot-air-balloon',
} as const;
export const CAIRO_SOURCE = {
  url: 'https://egypt-excursionsonline.com/cairo-nile-cruise-6-day-egypt-highlights-abu-simbel-hot-air-balloon',
  recordId: 'e40322391cfb00993d1de8a3', updatedAt: '2026-09-05T09:10:17.017Z',
  tariffs: { premium: { adult: 2100, child: 1400 }, deluxe: { adult: 2200, child: 1650 }, luxury: { adult: 2250, child: 1750 } },
  guideSupplement: 250, currency: 'USD',
  provenance: 'Exact published first-party record, read-only on 3 October 2026. One-language exclusivity and conservative age floor are approved product decisions. Overnight cities follow the published itinerary and 1+1+3-night inclusions; named properties and daily meal allocations are unconfirmed.',
} as const;

type Details = Record<string, unknown> & {
  version: number; durationDays: number; durationNights: number; startCity: string; endCity: string;
  groupBands: Array<{ key: string; min: number; max: number }>;
  tiers: Array<{ key: string; name: string; description: string; hotels: unknown[] }>;
  rates: Array<{ tierKey: string; double: number | null; child: number | null; [key: string]: unknown }>;
  rooms: Record<string, unknown>; travellers: Record<string, unknown>;
  extras: Array<{ id: string; [key: string]: unknown }>;
  optionGroups?: Array<{ id: string; [key: string]: unknown }>;
  bookingRequirements?: Record<string, unknown>;
  itinerary: Array<{ day: number; overnight: string; [key: string]: unknown }>;
};
type Mutable = { packageDetails: Details; inclusions: string[]; exclusions: string[]; participantRequirements: string[] };
export type CairoRecord = Mutable & {
  _id: string; slug: string; ownerTenantId: string; tenantIds: string[]; listingType: string; status: string; currency: string;
  packageRevision: number; presentationRevision: number; __v: number; updatedAt: string;
};
type Expected = Omit<CairoRecord, keyof Mutable>;
export type CairoPlan = { version: 1; target: typeof CAIRO_TARGET; source: typeof CAIRO_SOURCE; expected: Expected; before: Mutable; after: Mutable; changedPaths: string[]; checksum: string };
export type CairoReceipt = { version: 1; state: 'prepared' | 'applied' | 'rolled-back'; plan: CairoPlan; writeAt: string; rollbackAt?: string };
export interface CairoStore {
  read(): Promise<CairoRecord | null>;
  cas(expected: Expected, before: Mutable, after: Mutable, writeAt: string): Promise<boolean>;
}
export class CairoContentError extends Error {}
const fail = (message: string): never => { throw new CairoContentError(message); };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};
const equal = (a: unknown, b: unknown): boolean => stable(a) === stable(b);
const digest = (value: unknown): string => createHash('sha256').update(stable(value)).digest('hex');
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const MUTABLE = ['packageDetails', 'inclusions', 'exclusions', 'participantRequirements'] as const;
const mutable = (record: CairoRecord): Mutable => Object.fromEntries(MUTABLE.map(key => [key, clone(record[key])])) as Mutable;
const expectedOf = (record: CairoRecord): Expected => Object.fromEntries(['_id', 'slug', 'ownerTenantId', 'tenantIds', 'listingType', 'status', 'currency', 'packageRevision', 'presentationRevision', '__v', 'updatedAt'].map(key => [key, record[key as keyof CairoRecord]])) as Expected;
const scope = (record: CairoRecord): void => {
  if (record._id !== CAIRO_TARGET.packageId || record.slug !== CAIRO_TARGET.slug || record.ownerTenantId !== CAIRO_TARGET.tenantId
    || !equal(record.tenantIds, [CAIRO_TARGET.tenantId]) || record.listingType !== 'package' || record.status !== 'active' || record.currency !== 'USD') fail('Exact owned Cairo package not found; no write allowed.');
  for (const key of ['packageRevision', 'presentationRevision', '__v'] as const) if (!Number.isSafeInteger(record[key]) || record[key] < 0) fail('Package revision is unavailable; review required.');
  if (!timestamp(record.updatedAt)) fail('Listing modification timestamp is unavailable.');
  for (const key of ['inclusions', 'exclusions', 'participantRequirements'] as const) if (!Array.isArray(record[key]) || record[key].some(value => typeof value !== 'string')) fail('Listing text is not in the expected format.');
};
const changes = (before: unknown, after: unknown, path = ''): string[] => {
  if (equal(before, after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    const a = before as Record<string, unknown>, b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key => changes(a[key], b[key], path ? `${path}.${key}` : key));
  }
  return [path];
};
const guideExtras = ['English', 'German', 'Spanish', 'French', 'Italian'].map(language => ({
  id: `guide-${language.toLowerCase()}`, name: `${language}-speaking guide`,
  description: language === 'English' ? 'Included English-speaking Egyptologist guide.' : `Choose ${language} as the guide language for the booking. Replaces the included English-language choice.`,
  unit: 'per_booking', price: language === 'English' ? 0 : 250, priceChild: null, maxQuantity: 1,
}));
const guideGroup = { id: 'guide-language', name: 'Guide language', kind: 'guide', required: true, extraIds: guideExtras.map(extra => extra.id) };
const accommodation = [
  { name: '5-star hotel in Cairo', city: 'Cairo', nights: 1, stars: 5, accommodationType: 'hotel', description: 'The exact property will be confirmed by the operator. Double or twin beds may be requested, subject to availability.' },
  { name: '5-star hotel in Luxor', city: 'Luxor', nights: 1, stars: 5, accommodationType: 'hotel', description: 'The exact property will be confirmed by the operator. Double or twin beds may be requested, subject to availability.' },
  { name: '5-star Nile cruise', city: 'Nile cruise', nights: 3, stars: 5, accommodationType: 'cruise', description: 'Three cruise nights with full board. The exact vessel will be confirmed by the operator; bed requests are subject to availability.' },
];

export function buildCairoContentPlan(record: CairoRecord): CairoPlan {
  scope(record);
  const before = mutable(record), after = clone(before), details = after.packageDetails;
  if (details.version !== 1 || details.durationDays !== 6 || details.durationNights !== 5 || details.startCity !== 'Cairo' || details.endCity !== 'Cairo'
    || details.groupBands.length !== 1 || details.groupBands[0].min !== 2 || details.groupBands[0].max !== 2) fail('Trip structure or two-person allocation changed; review required.');
  const tariffKeys = Object.keys(CAIRO_SOURCE.tariffs);
  if (details.tiers.length !== 3 || !equal(details.tiers.map(t => t.key).sort(), tariffKeys.sort())) fail('Hotel levels changed; review required.');
  if (details.rooms.allowSingle !== false || details.rooms.allowTriple !== false || details.travellers.allowInfants !== false) fail('Room policy changed; review required.');
  for (const row of details.rates) {
    const tariff = CAIRO_SOURCE.tariffs[row.tierKey as keyof typeof CAIRO_SOURCE.tariffs];
    if (!tariff || row.double !== tariff.adult || (row.child !== null && row.child !== tariff.child)) fail('A source-backed tariff changed; review required.');
    row.child = tariff.child;
  }
  if (new Set(details.rates.map(row => row.tierKey)).size !== 3) fail('A hotel level has no rate; review required.');
  details.travellers = { ...details.travellers, allowChildren: true, childMinAge: 6, childMaxAge: 12, childWithOneAdult: 'child' };
  details.rooms = { ...details.rooms, maxChildrenPerRoom: 1, maxInfantsPerRoom: 0, bedPreferences: ['double', 'twin'] };
  details.bookingRequirements = { nationality: false, arrivalDetails: 'optional', ...details.bookingRequirements, travellerNames: true, dateOfBirth: true, bedPreference: true };
  if (details.bookingRequirements.arrivalDetails === 'hidden') details.bookingRequirements.arrivalDetails = 'optional';
  for (const tier of details.tiers) if (!tier.hotels.length) tier.hotels = clone(accommodation);
  if (details.extras.some(extra => !guideExtras.some(guide => guide.id === extra.id)) || (details.optionGroups ?? []).some(group => group.id !== guideGroup.id)) fail('Additional choices now exist; review them before applying this source patch.');
  if (details.extras.length && !equal(details.extras, guideExtras)) fail('Guide choices were edited; review required.');
  if ((details.optionGroups?.length ?? 0) && !equal(details.optionGroups, [guideGroup])) fail('Guide choice grouping was edited; review required.');
  details.extras = clone(guideExtras);
  details.optionGroups = [clone(guideGroup)];
  if (!equal(details.itinerary.map(day => day.day), [1, 2, 3, 4, 5, 6])) fail('Itinerary order changed; review required.');
  for (const day of details.itinerary) {
    const overnight = ['', 'Cairo', 'Luxor', 'Nile cruise', 'Nile cruise', 'Nile cruise'][day.day];
    if (!overnight) continue;
    if (day.overnight && day.overnight !== overnight) fail('An overnight city was edited; review required.');
    day.overnight = overnight;
  }
  after.inclusions = after.inclusions.filter(line => !/^Meals as mentioned per day\.?$/i.test(line.trim()));
  after.exclusions = after.exclusions.map(line => line === 'Spanish-, German-, Italian- or French-speaking guide (available as an add-on)'
    ? 'Optional German-, Spanish-, French- or Italian-speaking guide (choose one language)' : line);
  const notices = ['Children must be 6–12 years old; adults are 13 or older. Children under 6 cannot join this package because of the included balloon flight.', 'Double or twin beds may be requested, subject to availability.'];
  after.participantRequirements = [...new Set([...after.participantRequirements, ...notices])];
  const body = { version: 1 as const, target: CAIRO_TARGET, source: CAIRO_SOURCE, expected: expectedOf(record), before, after, changedPaths: changes(before, after) };
  return { ...body, checksum: digest(body) };
}

export function verifyCairoPlan(plan: CairoPlan): void {
  const { checksum, ...body } = plan;
  if (plan.version !== 1 || !equal(plan.target, CAIRO_TARGET) || digest(body) !== checksum) fail('The reviewed plan is invalid or changed.');
  const rebuilt = buildCairoContentPlan({ ...plan.expected, ...plan.before });
  if (!equal(rebuilt, plan)) fail('Plan no longer matches the source-backed transformation.');
}
export function assertCompletionSchema(plan: CairoPlan): void {
  const parsed = packageDetailsSchema.safeParse(plan.after.packageDetails);
  if (!parsed.success || !equal(parsed.data, plan.after.packageDetails)) fail('Completion schema is unavailable or rejects this plan. Integrate and release the supporting backend first.');
}
const appliedExpected = (receipt: CairoReceipt): Expected => ({ ...receipt.plan.expected, packageRevision: receipt.plan.expected.packageRevision + 1, presentationRevision: receipt.plan.expected.presentationRevision + 1, __v: receipt.plan.expected.__v + 1, updatedAt: receipt.writeAt });
const matches = (record: CairoRecord, expected: Expected, content: Mutable): boolean => equal(expectedOf(record), expected) && equal(mutable(record), content);

/** Receipt must be durably saved before the single atomic write. Replays use its original timestamp. */
export async function applyCairoContent(store: CairoStore, plan: CairoPlan, receipt: CairoReceipt, confirmation: string): Promise<'applied' | 'already-applied' | 'unchanged'> {
  if (confirmation !== CAIRO_TARGET.tenantSlug) fail('Exact tenant confirmation required.');
  verifyCairoPlan(plan);
  assertCompletionSchema(plan);
  if (receipt.version !== 1 || !equal(receipt.plan, plan) || receipt.state === 'rolled-back' || !timestamp(receipt.writeAt)) fail('Recovery receipt does not match this plan.');
  const current = await store.read(); if (!current) fail('Exact owned Cairo package not found.'); scope(current!);
  if (!plan.changedPaths.length && matches(current!, plan.expected, plan.before)) return 'unchanged';
  if (matches(current!, appliedExpected(receipt), plan.after)) return 'already-applied';
  if (!matches(current!, plan.expected, plan.before)) fail('Concurrent edit detected; no content was written. Create and review a fresh plan.');
  if (!await store.cas(plan.expected, plan.before, plan.after, receipt.writeAt)) fail('Concurrent edit detected during compare-and-set; nothing overwritten.');
  const verified = await store.read();
  if (!verified || !matches(verified, appliedExpected(receipt), plan.after)) fail('Write outcome needs recovery using the same receipt; do not create a new plan.');
  return 'applied';
}
export async function rollbackCairoContent(store: CairoStore, receipt: CairoReceipt, confirmation: string, rollbackAt: string): Promise<'rolled-back' | 'already-rolled-back'> {
  if (confirmation !== CAIRO_TARGET.tenantSlug) fail('Exact tenant confirmation required.'); verifyCairoPlan(receipt.plan);
  if (receipt.version !== 1 || !timestamp(receipt.writeAt) || !timestamp(rollbackAt)) fail('Recovery receipt timestamps are invalid.');
  const prior = appliedExpected(receipt), current = await store.read(); if (!current) fail('Exact owned Cairo package not found.'); scope(current!);
  const final = { ...prior, packageRevision: prior.packageRevision + 1, presentationRevision: prior.presentationRevision + 1, __v: prior.__v + 1, updatedAt: rollbackAt };
  if (matches(current!, final, receipt.plan.before)) return 'already-rolled-back';
  if (!matches(current!, prior, receipt.plan.after)) fail('Concurrent edit prevents rollback; nothing overwritten.');
  if (!await store.cas(prior, receipt.plan.after, receipt.plan.before, rollbackAt)) fail('Concurrent edit prevents rollback; nothing overwritten.');
  const verified = await store.read(); if (!verified || !matches(verified, final, receipt.plan.before)) fail('Rollback needs recovery with the same receipt.');
  return 'rolled-back';
}

export function cairoMongoStore(db: Pick<Db, 'collection'>): CairoStore {
    const id = new ObjectId(CAIRO_TARGET.packageId), tenantId = new ObjectId(CAIRO_TARGET.tenantId);
    const filter = { _id: id, ownerTenantId: tenantId, tenantIds: [tenantId], slug: CAIRO_TARGET.slug, listingType: 'package', status: 'active', currency: 'USD', archivedAt: { $exists: false }, trashedAt: { $exists: false } };
    const projection = Object.fromEntries([...MUTABLE, '_id', 'slug', 'ownerTenantId', 'tenantIds', 'listingType', 'status', 'currency', 'packageRevision', 'presentationRevision', '__v', 'updatedAt'].map(key => [key, 1]));
    return {
      read: async () => { const row = await db.collection('attractions').findOne(filter, { projection }); return row ? clone(row) as unknown as CairoRecord : null; },
      cas: async (expected, before, after, writeAt) => (await db.collection('attractions').updateOne({ ...filter, ...before,
        status: expected.status, currency: expected.currency, packageRevision: expected.packageRevision, presentationRevision: expected.presentationRevision, __v: expected.__v, updatedAt: new Date(expected.updatedAt),
      }, { $set: { ...after, updatedAt: new Date(writeAt) }, $inc: { packageRevision: 1, presentationRevision: 1, __v: 1 } })).matchedCount === 1,
    };
}

const syncFile = (file: string): void => { const fd = openSync(file, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } };
const save = (file: string, value: unknown, exclusive = false): void => {
  mkdirSync(dirname(file), { recursive: true });
  if (exclusive) { writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); syncFile(file); syncFile(dirname(file)); return; }
  const temp = `${file}.tmp`; writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); syncFile(temp); renameSync(temp, file); syncFile(dirname(file));
};
export async function main(args = process.argv.slice(2)): Promise<void> {
  const flag = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const apply = args.includes('--apply'), confirm = flag('confirm-tenant');
  if (args.some(arg => arg !== '--apply' && !/^--(?:confirm-tenant|env-file|plan-out|plan|receipt|rollback)=.+/.test(arg))) fail('Unknown or empty argument.');
  if (flag('rollback') && (flag('plan') || flag('receipt') || flag('plan-out'))) fail('Choose apply or rollback, not both.');
  if (apply && flag('plan-out')) fail('Use --plan-out only for a dry run.');
  if (apply && confirm !== CAIRO_TARGET.tenantSlug) fail('Apply requires --confirm-tenant=cairo-tours-packages.');
  if (!apply && (flag('rollback') || flag('plan') || flag('receipt'))) fail('Use --plan-out for a dry run; apply/rollback requires --apply.');
  if (apply && !flag('rollback') && (!flag('plan') || !flag('receipt'))) fail('Apply requires the reviewed --plan and a recovery --receipt.');
  const values = args.filter(arg => arg.startsWith('--env-file=')).reduce<Record<string, string>>((all, arg) => ({ ...all, ...parseEnv(readFileSync(arg.slice(11))) }), {});
  const uri = process.env.MONGODB_URI || values.MONGODB_URI;
  if (!uri) fail('MONGODB_URI is required through the environment or an approved --env-file.');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const db = client.db(), tenantId = new ObjectId(CAIRO_TARGET.tenantId);
    const tenant = await db.collection('tenants').findOne({ _id: tenantId, slug: CAIRO_TARGET.tenantSlug }, { projection: { _id: 1 } });
    if (!tenant) fail('Exact Cairo tenant not found.');
    const store = cairoMongoStore(db);
    if (!apply) {
      const current = await store.read(); if (!current) fail('Exact owned Cairo package not found.'); const plan = buildCairoContentPlan(current!);
      let schemaReady = true; try { assertCompletionSchema(plan); } catch { schemaReady = false; }
      if (flag('plan-out')) save(flag('plan-out')!, plan, true);
      console.log(JSON.stringify({ mode: 'dry-run', target: CAIRO_TARGET, packageRevision: plan.expected.packageRevision, presentationRevision: plan.expected.presentationRevision, changedPaths: plan.changedPaths, schemaReady, checksum: plan.checksum, before: plan.before, proposed: plan.after, productionWrites: 0 }, null, 2)); return;
    }
    const receiptFile = flag('rollback') ?? flag('receipt')!;
    if (flag('rollback')) {
      const receipt = JSON.parse(readFileSync(receiptFile, 'utf8')) as CairoReceipt;
      const rollbackAt = receipt.rollbackAt ?? new Date().toISOString(); receipt.rollbackAt = rollbackAt; save(receiptFile, receipt);
      const result = await rollbackCairoContent(store, receipt, confirm!, rollbackAt); receipt.state = 'rolled-back'; save(receiptFile, receipt); console.log(JSON.stringify({ result, target: CAIRO_TARGET })); return;
    }
    const plan = JSON.parse(readFileSync(flag('plan')!, 'utf8')) as CairoPlan; verifyCairoPlan(plan); assertCompletionSchema(plan);
    const receipt: CairoReceipt = existsSync(receiptFile) ? JSON.parse(readFileSync(receiptFile, 'utf8')) as CairoReceipt : { version: 1, state: 'prepared', plan, writeAt: new Date().toISOString() };
    if (!existsSync(receiptFile)) save(receiptFile, receipt, true);
    console.log(JSON.stringify({ mode: 'apply', matched: CAIRO_TARGET, expectedRevision: plan.expected.packageRevision, changedPaths: plan.changedPaths }));
    const result = await applyCairoContent(store, plan, receipt, confirm!); receipt.state = 'applied'; save(receiptFile, receipt); console.log(JSON.stringify({ result, target: CAIRO_TARGET }));
  } finally { await client.close(); }
}
if (require.main === module) main().catch(error => { console.error(error instanceof CairoContentError ? error.message : 'Operation failed; connection and credential details withheld. Reuse any prepared recovery receipt.'); process.exitCode = 1; });
