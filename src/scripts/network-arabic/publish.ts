/**
 * Planning and publication of a network site's Arabic records: the tour, destination and presentation
 * rows earlier network batches published (AttractionTranslation, DestinationTranslation and
 * TenantPresentationTranslation, locale `ar`, status `published`, tour and destination URLs `<slug>-ar`).
 *
 * Network sites have no custom domain until their DNS is connected, and the repository planners
 * (`planLocalization`, `planTenantPresentation`) verify a site by its custom domain and, for presentation,
 * require all four languages. This module plans the same rows for a network site verified by its id, slug,
 * platform domain and active status instead, with Arabic only. Everything else is the repository's own:
 * the content schemas, cleaning and completeness validation, the source snapshots, the digests, the URL
 * collision checks, the row shape (`filter`, `before`, `after`) and, on publication, the same transaction,
 * index readiness, source fence and readback as `executeLocalizationPlan` / `executeTenantPresentation`.
 *
 * A site that has its own domain is refused here: the repository planners are the path for it.
 *
 * Because a file written on the ops-runner does not survive the run, a plan cannot be saved and approved
 * later. The approval digest is therefore computed over everything that decides the write and nothing that
 * is generated (new ids, timestamps): the site identity, each row's identity, the digest of the row as it
 * stands, and the exact row to be written. A later run that sees the same state computes the same digest,
 * and a publication refuses to start unless the digest it computes equals the approved one.
 */
import fs from 'fs';
import path from 'path';
import mongoose, { Types, type ClientSession } from 'mongoose';
import { Tenant } from '../../models/Tenant';
import { Attraction } from '../../models/Attraction';
import { Destination } from '../../models/Destination';
import { AttractionTranslation } from '../../models/AttractionTranslation';
import { DestinationTranslation } from '../../models/DestinationTranslation';
import { TenantPresentationTranslation } from '../../models/TenantPresentationTranslation';
import { attractionTranslationContent, cleanTranslation, validateTranslationSource } from '../../services/attractionLocalization.service';
import { destinationTranslationContent, cleanDestinationTranslation, validateDestinationTranslation } from '../../services/destinationLocalization.service';
import { sourceSnapshot } from '../../services/localizationSourceSnapshot.service';
import { localizationDigest } from '../../services/localizationMigration.service';
import { cleanPresentationContent, ownedPresentationSource, presentationSourceSnapshot, type PresentationKind } from '../../services/tenantPresentationLocalization.service';
import { presentationDigest } from '../../services/tenantPresentationMigration.service';
import { tenantPickupDestinationSlugs } from '../../utils/pickupDestinations';
import type { NetworkBatch } from '../seed-network-sites';
import { B14A, B14B } from '../network-sites/b14';

export const LOCALE = 'ar' as const;
export const PUBLISH_BATCHES: Record<string, { batch: NetworkBatch; folder: string }> = {
  b14a: { batch: B14A, folder: 'b14' },
  b14b: { batch: B14B, folder: 'b14' },
};
const PAYLOAD_ROOT = __dirname;
const HEX24 = /^[a-f\d]{24}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Json = Record<string, any>;
export interface RecordEntry { id: string; sourceSlug: string; slug: string; sourceUpdatedAt: string; sourceDigest: string; english: Json; arabic: Json }
export interface PresentationEntry { kind: PresentationKind; sourceId: string; sourceDigest: string; english: Json; arabic: Json }
export interface SitePayload {
  version: 1;
  batch: string;
  locale: typeof LOCALE;
  tenant: { id: string; slug: string; domain: string };
  presentationSha256: string;
  presentation: PresentationEntry[];
  tours: RecordEntry[];
  destinations: RecordEntry[];
}

export class NetworkArabicError extends Error {}
const fail = (site: string, message: string): never => { throw new NetworkArabicError(`${site}: ${message}`); };

/** The committed payloads of one group, in the batch file's site order. */
export function loadGroupPayloads(group: string, root = PAYLOAD_ROOT): SitePayload[] {
  const entry = PUBLISH_BATCHES[group];
  if (!entry) throw new NetworkArabicError(`Unknown group ${group}`);
  return entry.batch.sites.map((site) => {
    const file = path.join(root, entry.folder, `${site.slug}.json`);
    const payload = JSON.parse(fs.readFileSync(file, 'utf8')) as SitePayload;
    assertPayloadShape(payload, group, site.slug);
    return payload;
  });
}

export function assertPayloadShape(payload: SitePayload, group: string, slug: string): void {
  if (payload?.version !== 1 || payload.batch !== group || payload.locale !== LOCALE) fail(slug, 'payload version, group or language differs');
  if (payload.tenant?.slug !== slug || !HEX24.test(payload.tenant?.id || '') || payload.tenant.domain !== `${slug}.foxesnetwork.com`) fail(slug, 'payload site identity differs');
  if (!/^[a-f\d]{64}$/.test(payload.presentationSha256 || '')) fail(slug, 'presentation digest missing');
  for (const entry of [...payload.tours, ...payload.destinations]) {
    if (!HEX24.test(entry.id) || !SLUG.test(entry.slug) || entry.slug !== `${entry.sourceSlug}-ar` || !/^[a-f\d]{64}$/.test(entry.sourceDigest)) fail(slug, `record ${entry.id} has no valid identity, URL or digest`);
  }
  for (const entry of payload.presentation) if (!HEX24.test(entry.sourceId) || !/^[a-f\d]{64}$/.test(entry.sourceDigest)) fail(slug, 'presentation source has no valid identity or digest');
}

const TENANT_FIELDS = '_id slug status domain customDomain designMode tagline description heroImages seoSettings pageSeo navigation customPages pickupDestinationSlugs supportedLanguages updatedAt';

/** A network site with no custom domain, verified by id, slug, platform domain and active status. */
export async function networkTenant(target: SitePayload['tenant'], session?: ClientSession): Promise<Json> {
  const tenant: any = await Tenant.findOne({ _id: target.id, slug: target.slug, domain: target.domain, status: 'active' }).select(TENANT_FIELDS).session(session || null).lean();
  if (!tenant) fail(target.slug, 'active site, slug and platform domain did not match');
  if (tenant.customDomain) fail(target.slug, 'the site has its own domain; plan it with the repository planners');
  return tenant;
}

/** The presentation sources `exportTenantPresentationSource` lists, and its export digest for this site. */
export function presentationExport(tenant: Json, plannedDomain: string) {
  const sources = [
    { kind: 'tenant' as const, id: String(tenant._id) },
    ...(tenant.customPages || []).filter((page: Json) => page.isPublished !== false && page.status !== 'archived' && !page.trashedAt).map((page: Json) => ({ kind: 'page' as const, id: String(page._id) })),
  ];
  const exported = { version: 1, tenantId: String(tenant._id), tenantSlug: tenant.slug, domain: tenant.customDomain || plannedDomain, sources: sources.map((item) => ({ kind: item.kind, sourceId: item.id, snapshot: presentationSourceSnapshot(item.kind, ownedPresentationSource(tenant, item.kind, item.id)) })) };
  return { sources, exported, sha256: presentationDigest(exported) };
}

export type RowKind = 'tour' | 'destination' | 'presentation';
export interface PlannedRow {
  kind: RowKind;
  sourceId: string;
  label: string;
  sourceMatched: boolean;
  filter: Json;
  before: Json | null;
  after: Json;
  /** False when the stored row already says exactly this: nothing is written for it. */
  write: boolean;
}
export interface SitePlan { site: string; group: string; tenantId: string; domain: string; rows: PlannedRow[]; mismatches: string[]; approval: string }

const collectionFor = (kind: RowKind) => (kind === 'tour' ? AttractionTranslation : kind === 'destination' ? DestinationTranslation : TenantPresentationTranslation).collection;

/** What decides a row: never its generated id or its timestamps. */
function decidingFields(row: PlannedRow): Json {
  const { _id, createdAt, updatedAt, revision, ...rest } = row.after;
  return { kind: row.kind, filter: row.filter, before: row.before ? localizationDigest(row.before) : null, write: row.write, after: row.write ? { ...rest, ...(row.kind === 'presentation' ? { revision } : {}) } : null };
}
export function siteApprovalDigest(plan: Pick<SitePlan, 'site' | 'tenantId' | 'domain' | 'rows'>): string {
  return localizationDigest({ version: 1, locale: LOCALE, site: plan.site, tenantId: plan.tenantId, domain: plan.domain, rows: plan.rows.map(decidingFields) });
}
export function groupApprovalDigest(plans: SitePlan[]): string {
  return localizationDigest({ version: 1, locale: LOCALE, sites: plans.map((plan) => [plan.site, plan.approval]) });
}

/** A stored tour or destination row that already says this needs no write. */
const STORED_KEYS = ['slug', 'content', 'status', 'sourceUpdatedAt', 'sourceSnapshot'];
const sameStored = (before: Json | null, after: Json, keys: string[]) => !!before && keys.every((key) => localizationDigest(before[key] ?? null) === localizationDigest(after[key] ?? null));

/**
 * Plans one site's Arabic rows in memory. Reads only. Source drift is reported in `mismatches` and the
 * plan then carries no approval digest; content that fails the repository validation throws.
 */
export async function planSite(payload: SitePayload, now = new Date()): Promise<SitePlan> {
  const group = PUBLISH_BATCHES[payload.batch];
  const site = group?.batch.sites.find((item) => item.slug === payload.tenant.slug);
  if (!site) throw new NetworkArabicError(`${payload.tenant.slug}: site is not in its group`);
  const tenant = await networkTenant(payload.tenant);
  const rows: PlannedRow[] = [];
  const mismatches: string[] = [];
  const stamp = (before: Json | null) => ({ createdAt: before?.createdAt || now, updatedAt: new Date(Math.max(+now, before?.updatedAt ? +new Date(before.updatedAt) + 1 : +now)) });

  // Tours: every live tour of the site, exactly once.
  const liveTours: any[] = await Attraction.find({ tenantIds: tenant._id, status: 'active', archivedAt: { $exists: false }, trashedAt: { $exists: false } }).sort({ _id: 1 }).lean();
  const tourIds = liveTours.map((tour) => String(tour._id));
  if (tourIds.length !== payload.tours.length || tourIds.some((id) => !payload.tours.some((entry) => entry.id === id)) || new Set(payload.tours.map((entry) => entry.id)).size !== payload.tours.length) mismatches.push(`tours: the site sells ${tourIds.length}, the payload carries ${payload.tours.length} or different ones`);
  const cities = new Set<string>();
  for (const entry of payload.tours) {
    const source = liveTours.find((tour) => String(tour._id) === entry.id);
    if (!source?.updatedAt) { mismatches.push(`tour ${entry.sourceSlug}: not a live tour of this site`); continue; }
    cities.add(source.destination?.city);
    const snapshot = sourceSnapshot('tour', source);
    const matched = source.updatedAt.toISOString() === entry.sourceUpdatedAt && localizationDigest(snapshot) === entry.sourceDigest && source.slug === entry.sourceSlug;
    if (!matched) mismatches.push(`tour ${entry.sourceSlug}: source changed after export`);
    const content = cleanTranslation(attractionTranslationContent.parse(entry.arabic));
    validateTranslationSource(source, content);
    const canonical = await Attraction.exists({ _id: { $ne: source._id }, tenantIds: tenant._id, $or: [{ slug: entry.slug }, { pathSlug: entry.slug }] });
    const alias = await AttractionTranslation.collection.findOne({ tenantId: tenant._id, slug: entry.slug, $or: [{ attractionId: { $ne: source._id } }, { locale: { $ne: LOCALE } }] });
    if (canonical || alias) fail(payload.tenant.slug, `the URL ${entry.slug} belongs to another record`);
    const filter = { tenantId: tenant._id, attractionId: source._id, locale: LOCALE };
    const before = await AttractionTranslation.collection.findOne(filter);
    const after = { ...(before || {}), _id: before?._id || new Types.ObjectId(), ...filter, slug: entry.slug, content, status: 'published', sourceUpdatedAt: source.updatedAt, sourceSnapshot: snapshot, ...stamp(before) };
    const unchanged = sameStored(before, after, STORED_KEYS);
    rows.push({ kind: 'tour', sourceId: entry.id, label: entry.sourceSlug, sourceMatched: matched, filter, before, after: unchanged ? before as Json : after, write: !unchanged });
  }

  // Destinations: the ones `export-attraction-localization.ts` lists for the site, exactly once.
  const liveDestinations: any[] = await Destination.find({ isActive: true, $or: [{ name: { $in: [...cities] } }, { slug: { $in: tenantPickupDestinationSlugs(tenant) } }] }).sort({ _id: 1 }).lean();
  if (liveDestinations.length !== payload.destinations.length || liveDestinations.some((item) => !payload.destinations.some((entry) => entry.id === String(item._id)))) mismatches.push(`destinations: the site lists ${liveDestinations.length}, the payload carries ${payload.destinations.length} or different ones`);
  for (const entry of payload.destinations) {
    const source = liveDestinations.find((item) => String(item._id) === entry.id);
    if (!source?.updatedAt) { mismatches.push(`destination ${entry.sourceSlug}: not listed for this site`); continue; }
    const snapshot = sourceSnapshot('destination', source);
    const matched = source.updatedAt.toISOString() === entry.sourceUpdatedAt && localizationDigest(snapshot) === entry.sourceDigest && source.slug === entry.sourceSlug;
    if (!matched) mismatches.push(`destination ${entry.sourceSlug}: source changed after export`);
    const content = cleanDestinationTranslation(destinationTranslationContent.parse(entry.arabic));
    validateDestinationTranslation(source, content);
    const canonical = await Destination.exists({ _id: { $ne: source._id }, slug: entry.slug });
    const alias = await DestinationTranslation.collection.findOne({ tenantId: tenant._id, slug: entry.slug, destinationId: { $ne: source._id } });
    if (canonical || alias) fail(payload.tenant.slug, `the URL ${entry.slug} belongs to another record`);
    const filter = { tenantId: tenant._id, destinationId: source._id, locale: LOCALE };
    const before = await DestinationTranslation.collection.findOne(filter);
    const after = { ...(before || {}), _id: before?._id || new Types.ObjectId(), ...filter, slug: entry.slug, content, status: 'published', sourceUpdatedAt: source.updatedAt, sourceSnapshot: snapshot, ...stamp(before) };
    const unchanged = sameStored(before, after, STORED_KEYS);
    rows.push({ kind: 'destination', sourceId: entry.id, label: entry.sourceSlug, sourceMatched: matched, filter, before, after: unchanged ? before as Json : after, write: !unchanged });
  }

  // Presentation: the tenant and each published page, exactly once, as `planTenantPresentation` builds them.
  const exported = presentationExport(tenant, site.domain);
  if (exported.sha256 !== payload.presentationSha256) mismatches.push('presentation: the authored source changed after export');
  if (exported.sources.length !== payload.presentation.length || exported.sources.some((item) => !payload.presentation.some((entry) => entry.kind === item.kind && entry.sourceId === item.id))) mismatches.push('presentation: the payload does not cover every published source exactly once');
  for (const entry of payload.presentation) {
    let source: Json;
    try { source = ownedPresentationSource(tenant, entry.kind, entry.sourceId); } catch { mismatches.push(`presentation ${entry.kind} ${entry.sourceId}: not a source of this site`); continue; }
    const snapshot = presentationSourceSnapshot(entry.kind, source);
    const matched = presentationDigest(snapshot) === entry.sourceDigest;
    if (!matched) mismatches.push(`presentation ${entry.kind}: source changed after export`);
    const content = cleanPresentationContent(entry.kind, source, entry.arabic);
    const filter = { tenantId: new Types.ObjectId(String(tenant._id)), kind: entry.kind, sourceId: new Types.ObjectId(entry.sourceId), locale: LOCALE };
    const before = await TenantPresentationTranslation.collection.findOne(filter);
    if (before && (!Number.isSafeInteger(before.revision) || before.revision < 0 || before.revision >= Number.MAX_SAFE_INTEGER)) fail(payload.tenant.slug, 'invalid stored presentation revision');
    const unchanged = !!before && before.status === 'published' && presentationDigest(before.content) === presentationDigest(content) && presentationDigest(before.sourceSnapshot) === presentationDigest(snapshot);
    const after = unchanged ? before as Json : { _id: before?._id || new Types.ObjectId(), ...filter, status: 'published', sourceSnapshot: snapshot, content, revision: (before?.revision || 0) + 1, ...stamp(before) };
    rows.push({ kind: 'presentation', sourceId: entry.sourceId, label: entry.kind, sourceMatched: matched, filter, before, after, write: !unchanged });
  }

  const plan = { site: payload.tenant.slug, group: payload.batch, tenantId: String(tenant._id), domain: tenant.domain, rows, mismatches };
  return { ...plan, approval: mismatches.length ? '' : siteApprovalDigest(plan) };
}

/** One line a reader can check: rows to write, rows already present, sources matched and the digest. */
export function planSummary(plan: SitePlan) {
  const count = (kind: RowKind, write: boolean) => plan.rows.filter((row) => row.kind === kind && row.write === write).length;
  return {
    site: plan.site,
    group: plan.group,
    rowsToWrite: plan.rows.filter((row) => row.write).length,
    rowsPresent: plan.rows.filter((row) => !row.write).length,
    byKind: Object.fromEntries((['tour', 'destination', 'presentation'] as const).map((kind) => [kind, { write: count(kind, true), present: count(kind, false) }])),
    sourcesMatched: plan.rows.filter((row) => row.sourceMatched).length,
    sourcesMismatched: plan.rows.filter((row) => !row.sourceMatched).map((row) => `${row.kind}:${row.label}`),
    mismatches: plan.mismatches,
    rows: plan.rows.map((row) => ({ kind: row.kind, source: row.label, slug: row.after.slug ?? null, write: row.write, stored: row.before ? 'present' : 'absent' })),
    approval: plan.approval || null,
  };
}

async function indexesReady(): Promise<void> {
  const required: Array<[mongoose.mongo.Collection, Json[]]> = [
    [AttractionTranslation.collection, [{ tenantId: 1, attractionId: 1, locale: 1 }, { tenantId: 1, slug: 1 }]],
    [DestinationTranslation.collection, [{ tenantId: 1, destinationId: 1, locale: 1 }, { tenantId: 1, locale: 1, slug: 1 }]],
    [TenantPresentationTranslation.collection, [{ tenantId: 1, kind: 1, sourceId: 1, locale: 1 }]],
  ];
  for (const [collection, keys] of required) {
    const indexes = await collection.indexes();
    const ready = keys.every((key) => indexes.some((index) => index.unique === true && !index.sparse && !index.partialFilterExpression && (!index.collation || index.collation.locale === 'simple') && JSON.stringify(index.key) === JSON.stringify(key)));
    if (!ready) throw new NetworkArabicError('Translation identity and URL uniqueness indexes are not ready');
  }
}

/**
 * Publishes one planned site in a single transaction, only when the plan's approval digest is the approved
 * one. Inside the transaction the site, every source and every stored row are read again; anything that
 * moved since the plan stops the run with nothing written. Rows already present are not touched.
 */
export async function executeSitePlan(plan: SitePlan, payload: SitePayload, approvedDigest: string) {
  if (!plan.approval || plan.mismatches.length || siteApprovalDigest(plan) !== plan.approval || plan.approval !== approvedDigest) throw new NetworkArabicError(`${plan.site}: plan digest is not the approved one; nothing written`);
  const writes = plan.rows.filter((row) => row.write);
  if (!writes.length) return { site: plan.site, changed: false, verified: true, rows: 0, digest: plan.approval };
  await indexesReady();
  const session = await mongoose.startSession();
  let changed = false;
  try {
    await session.withTransaction(async () => {
      changed = false;
      const tenant = await networkTenant(payload.tenant, session);
      if (String(tenant._id) !== plan.tenantId) throw new NetworkArabicError(`${plan.site}: site changed; nothing written`);
      for (const row of plan.rows) {
        if (row.kind === 'tour') {
          const source: any = await Attraction.findOne({ _id: row.sourceId, tenantIds: tenant._id, status: 'active', archivedAt: { $exists: false }, trashedAt: { $exists: false } }).session(session).lean();
          if (!source || localizationDigest(sourceSnapshot('tour', source)) !== localizationDigest(row.after.sourceSnapshot) || +source.updatedAt !== +new Date(row.after.sourceUpdatedAt)) throw new NetworkArabicError(`${plan.site}: a tour changed since the plan; nothing written`);
          if (await Attraction.exists({ _id: { $ne: source._id }, tenantIds: tenant._id, $or: [{ slug: row.after.slug }, { pathSlug: row.after.slug }] }).session(session)) throw new NetworkArabicError(`${plan.site}: a translated URL was claimed since the plan; nothing written`);
        } else if (row.kind === 'destination') {
          const source: any = await Destination.findOne({ _id: row.sourceId, isActive: true }).session(session).lean();
          if (!source || localizationDigest(sourceSnapshot('destination', source)) !== localizationDigest(row.after.sourceSnapshot) || +source.updatedAt !== +new Date(row.after.sourceUpdatedAt)) throw new NetworkArabicError(`${plan.site}: a destination changed since the plan; nothing written`);
        } else {
          const source = ownedPresentationSource(tenant, row.filter.kind, row.sourceId);
          if (presentationDigest(presentationSourceSnapshot(row.filter.kind, source)) !== presentationDigest(row.after.sourceSnapshot)) throw new NetworkArabicError(`${plan.site}: the presentation source changed since the plan; nothing written`);
          cleanPresentationContent(row.filter.kind, source, row.after.content);
        }
      }
      const current: Array<Json | null> = [];
      for (const row of plan.rows) current.push(await collectionFor(row.kind).findOne(row.filter, { session }));
      const digestOf = (row: PlannedRow, value: unknown) => (row.kind === 'presentation' ? presentationDigest(value) : localizationDigest(value));
      if (plan.rows.every((row, index) => digestOf(row, current[index]) === digestOf(row, row.after))) return;
      if (!plan.rows.every((row, index) => digestOf(row, current[index]) === digestOf(row, row.before))) throw new NetworkArabicError(`${plan.site}: stored rows changed since the plan; nothing written`);
      // The repository's presentation fence: a transaction-only marker on the site record takes its document
      // lock, so the authored source cannot change under the publication; it is removed before commit.
      const marker = new Types.ObjectId().toHexString();
      const fence = await Tenant.updateOne({ _id: tenant._id, updatedAt: tenant.updatedAt, __presentationPublicationFence: { $exists: false } }, { $set: { __presentationPublicationFence: marker } }, { session, strict: false, timestamps: false });
      if (fence.matchedCount !== 1) throw new NetworkArabicError(`${plan.site}: the site changed before publication; nothing written`);
      for (const row of writes) await collectionFor(row.kind).replaceOne(row.filter, row.after, { session, upsert: true });
      const restored = await Tenant.updateOne({ _id: tenant._id, __presentationPublicationFence: marker }, { $unset: { __presentationPublicationFence: '' } }, { session, strict: false, timestamps: false });
      if (restored.matchedCount !== 1) throw new NetworkArabicError(`${plan.site}: the source fence was lost; nothing written`);
      changed = true;
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    for (const row of plan.rows) {
      const stored = await collectionFor(row.kind).findOne(row.filter);
      const same = row.kind === 'presentation' ? presentationDigest(stored) === presentationDigest(row.after) : localizationDigest(stored) === localizationDigest(row.after);
      if (!same) throw new NetworkArabicError(`${plan.site}: readback differs from the plan; inspect before retrying`);
    }
    return { site: plan.site, changed, verified: true, rows: writes.length, digest: plan.approval };
  } finally {
    await session.endSession();
  }
}
