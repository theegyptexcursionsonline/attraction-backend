/**
 * Read-only source export for a network batch's Arabic records, built to run on the Railway ops-runner
 * (docs/OPS_RUNNER.md), where a written file does not survive the run: everything is printed as JSON
 * log lines (`network-arabic/text.ts` cuts each payload into tagged base64 pieces with its digest).
 *
 *   OPS_TASK="src/scripts/export-network-arabic-sources.ts --batch=b14a,b14b"
 *
 * For every site of the named groups it prints what the two repository exporters build
 * (`export-tenant-presentation-localization.ts` and `export-attraction-localization.ts`): the tenant's
 * presentation sources with their snapshots and digest, and each live trip's and destination's
 * translatable fields with their versions and snapshot digests. It then reads the Arabic already
 * published on the network and prints, for the batch's own English strings, the renderings already in
 * use, plus examples for the shared terms, so one term keeps one Arabic reading on every site.
 *
 * It never writes: no insert, update, replace or delete, and the connection creates no index or collection.
 */
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Destination } from '../models/Destination';
import { AttractionTranslation } from '../models/AttractionTranslation';
import { DestinationTranslation } from '../models/DestinationTranslation';
import { TenantPresentationTranslation } from '../models/TenantPresentationTranslation';
import { translationSourceTemplate } from '../services/attractionLocalization.service';
import { sourceMatches, sourceSnapshot } from '../services/localizationSourceSnapshot.service';
import { localizationDigest } from '../services/localizationMigration.service';
import { presentationSourceSnapshot, presentationSourceTemplate, ownedPresentationSource, type PresentationKind } from '../services/tenantPresentationLocalization.service';
import { exportTenantPresentationSource, presentationDigest } from '../services/tenantPresentationMigration.service';
import { tenantPickupDestinationSlugs } from '../utils/pickupDestinations';
import type { NetworkBatch } from './seed-network-sites';
import { B12A, B12B } from './network-sites/b12';
import { B13A, B13B } from './network-sites/b13';
import { B14A, B14B } from './network-sites/b14';
import { B17A, B17B, B17C } from './network-arabic/b17';
import { GLOSSARY_TERMS, TranslationMemory, alignPairs, flattenStrings, logChunks } from './network-arabic/text';

export const NETWORK_BATCHES: Record<string, NetworkBatch> = { b12a: B12A, b12b: B12B, b13a: B13A, b13b: B13B, b14a: B14A, b14b: B14B, b17a: B17A, b17b: B17B, b17c: B17C };
/** The batches whose published Arabic is printed in full, as the model for wording and record shape. */
const MODEL_BATCHES = ['b13a', 'b13b'];
const TENANT_FIELDS = '_id slug name status domain customDomain supportedLanguages defaultLanguage designMode tagline description heroImages seoSettings pageSeo navigation customPages pickupDestinationSlugs updatedAt';
const DESTINATION_FIELDS = ['name', 'country', 'description', 'shortDescription', 'highlights', 'bestTimeToVisit', 'tags'] as const;

export function exportArguments(args: string[]): { batches: string[] } {
  if (args.length !== 1 || !args[0].startsWith('--batch=')) throw new Error('Provide --batch=<group>[,<group>]');
  const batches = args[0].slice('--batch='.length).split(',');
  if (!batches.length || batches.some((id) => !NETWORK_BATCHES[id]) || new Set(batches).size !== batches.length) throw new Error(`Unknown group; known: ${Object.keys(NETWORK_BATCHES).join(', ')}`);
  return { batches };
}

const pause = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });
async function emit(part: string, payload: unknown): Promise<void> {
  for (const line of logChunks(part, payload)) {
    process.stdout.write(`${JSON.stringify(line)}\n`);
    await pause(20);
  }
}

/** The destination fields a translation carries, as `export-attraction-localization.ts` prints them. */
export function destinationTemplate(destination: Record<string, any>): Record<string, unknown> {
  return Object.fromEntries(DESTINATION_FIELDS.map((field) => [field, destination[field] ?? (field === 'highlights' || field === 'tags' ? [] : '')]));
}

/** The presentation sources `exportTenantPresentationSource` lists: the tenant, then each published page. */
export function presentationSources(tenant: Record<string, any>): Array<{ kind: PresentationKind; id: string }> {
  return [
    { kind: 'tenant', id: String(tenant._id) },
    ...(tenant.customPages || []).filter((page: any) => page.isPublished !== false && page.status !== 'archived' && !page.trashedAt).map((page: any) => ({ kind: 'page' as const, id: String(page._id) })),
  ];
}

const metaOf = (row: Record<string, any>) => ({
  keys: Object.keys(row).sort(),
  locale: row.locale,
  status: row.status,
  slug: row.slug,
  kind: row.kind,
  revision: row.revision,
  snapshotVersion: row.sourceSnapshot?.version ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  sourceUpdatedAt: row.sourceUpdatedAt,
});

async function main() {
  const { batches } = exportArguments(process.argv.slice(2));
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Database configuration is required');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  try {
    const parts: string[] = [];
    const englishStrings = new Set<string>();

    // 1. The batch's own sources, as the two exporters build them.
    for (const id of batches) {
      for (const site of NETWORK_BATCHES[id].sites) {
        const tenant: any = await Tenant.findOne({ slug: site.slug }).select(TENANT_FIELDS).lean();
        if (!tenant) { await emit(`missing:${site.slug}`, { slug: site.slug, found: false }); parts.push(`missing:${site.slug}`); continue; }
        let repoExporter: string = 'accepted';
        try { exportTenantPresentationSource(tenant); } catch (error) { repoExporter = (error as Error).message; }
        const sources = presentationSources(tenant).map((item) => {
          const source = ownedPresentationSource(tenant, item.kind, item.id);
          return { kind: item.kind, sourceId: item.id, template: presentationSourceTemplate(item.kind, source), snapshot: presentationSourceSnapshot(item.kind, source) };
        });
        const presentationExport = { version: 1, tenantId: String(tenant._id), tenantSlug: tenant.slug, domain: tenant.customDomain || site.domain, sources: sources.map(({ kind, sourceId, snapshot }) => ({ kind, sourceId, snapshot })) };
        const tours: any[] = [];
        const cities = new Set<string>();
        for await (const tour of Attraction.find({ tenantIds: tenant._id, status: 'active', archivedAt: { $exists: false }, trashedAt: { $exists: false } }).sort({ _id: 1 }).lean().cursor()) {
          const record = tour as any;
          cities.add(record.destination?.city);
          tours.push({ id: String(record._id), slug: record.slug, pathSlug: record.pathSlug ?? null, listingType: record.listingType ?? null, ownerTenantId: record.ownerTenantId ? String(record.ownerTenantId) : null, sourceUpdatedAt: record.updatedAt?.toISOString() ?? null, snapshotDigest: localizationDigest(sourceSnapshot('tour', record)), content: translationSourceTemplate(record) });
        }
        const destinations: any[] = [];
        for await (const destination of Destination.find({ isActive: true, $or: [{ name: { $in: [...cities] } }, { slug: { $in: tenantPickupDestinationSlugs(tenant) } }] }).sort({ _id: 1 }).lean().cursor()) {
          const record = destination as any;
          destinations.push({ id: String(record._id), slug: record.slug, sourceUpdatedAt: record.updatedAt?.toISOString() ?? null, snapshotDigest: localizationDigest(sourceSnapshot('destination', record)), content: destinationTemplate(record) });
        }
        for (const item of [...sources.map((source) => source.template), ...tours.map((tour) => tour.content), ...destinations.map((destination) => destination.content)]) for (const text of flattenStrings(item).values()) if (text.trim()) englishStrings.add(text.trim());
        const existing = {
          tours: await AttractionTranslation.countDocuments({ tenantId: tenant._id }),
          presentation: await TenantPresentationTranslation.countDocuments({ tenantId: tenant._id }),
          destinations: await DestinationTranslation.countDocuments({ tenantId: tenant._id }),
        };
        const part = `source:${site.slug}`;
        await emit(part, {
          batch: id,
          slug: site.slug,
          plannedDomain: site.domain,
          tenant: { id: String(tenant._id), status: tenant.status, domain: tenant.domain, customDomain: tenant.customDomain ?? null, supportedLanguages: tenant.supportedLanguages ?? [], defaultLanguage: tenant.defaultLanguage, designMode: tenant.designMode, updatedAt: tenant.updatedAt },
          repoPresentationExporter: repoExporter,
          presentation: { export: presentationExport, sha256: presentationDigest(presentationExport), templates: sources.map(({ kind, sourceId, template }) => ({ kind, sourceId, template })) },
          tours,
          destinations,
          existingTranslationRows: existing,
        });
        parts.push(part);
      }
    }

    // 2. The Arabic already on the network: record shapes, per-site counts and a translation memory.
    const memory = new TranslationMemory();
    const tenantCache = new Map<string, any>();
    const tenantOf = async (tenantId: unknown) => {
      const key = String(tenantId);
      if (!tenantCache.has(key)) tenantCache.set(key, await Tenant.findById(key).select(TENANT_FIELDS).lean());
      return tenantCache.get(key);
    };
    const summary = new Map<string, any>();
    const siteSummary = (tenant: any) => {
      const key = tenant?.slug || 'unknown';
      if (!summary.has(key)) summary.set(key, { slug: key, status: tenant?.status, domain: tenant?.domain, customDomain: tenant?.customDomain ?? null, supportedLanguages: tenant?.supportedLanguages ?? [], designMode: tenant?.designMode, tours: {}, presentation: {}, destinations: {}, samples: {} });
      return summary.get(key);
    };
    const count = (bucket: Record<string, number>, key: string) => { bucket[key] = (bucket[key] || 0) + 1; };
    const modelSlugs = new Set(MODEL_BATCHES.flatMap((id) => NETWORK_BATCHES[id].sites.map((site) => site.slug)));
    const modelRows: any[] = [];

    for await (const row of AttractionTranslation.collection.find({ locale: 'ar' }).sort({ _id: 1 })) {
      const tenant = await tenantOf(row.tenantId);
      const entry = siteSummary(tenant);
      const source: any = await Attraction.findById(row.attractionId).lean();
      const current = !!source?.updatedAt && sourceMatches('tour', source, row);
      count(entry.tours, `${row.status}:${current ? 'current' : 'stale'}`);
      if (!entry.samples.tour) entry.samples.tour = { ...metaOf(row), sourceSlug: source?.slug, sourcePathSlug: source?.pathSlug ?? null };
      if (current && row.status === 'published' && source) memory.add(alignPairs(translationSourceTemplate(source), row.content), entry.slug);
      if (tenant && modelSlugs.has(tenant.slug)) modelRows.push({ kind: 'tour', site: tenant.slug, sourceSlug: source?.slug, arSlug: row.slug, status: row.status, current, content: row.content });
    }
    for await (const row of TenantPresentationTranslation.collection.find({}).sort({ _id: 1 })) {
      const tenant = await tenantOf(row.tenantId);
      const entry = siteSummary(tenant);
      let source: any = null;
      try { source = tenant ? ownedPresentationSource(tenant, row.kind, row.sourceId) : null; } catch { source = null; }
      const current = !!source && presentationDigest(row.sourceSnapshot) === presentationDigest(presentationSourceSnapshot(row.kind, source));
      count(entry.presentation, `${row.kind}:${row.locale}:${row.status}:${current ? 'current' : 'stale'}`);
      if (!entry.samples.presentation && row.locale === 'ar') entry.samples.presentation = metaOf(row);
      if (row.locale !== 'ar') continue;
      if (current && row.status === 'published') memory.add(alignPairs(presentationSourceTemplate(row.kind, source), row.content), entry.slug);
      if (tenant && modelSlugs.has(tenant.slug)) modelRows.push({ kind: `presentation:${row.kind}`, site: tenant.slug, status: row.status, current, revision: row.revision, content: row.content });
    }
    const destinationRows: any[] = [];
    for await (const row of DestinationTranslation.collection.find({ locale: 'ar' }).sort({ _id: 1 })) {
      const tenant = await tenantOf(row.tenantId);
      const entry = siteSummary(tenant);
      const source: any = await Destination.findById(row.destinationId).lean();
      const current = !!source?.updatedAt && sourceMatches('destination', source, row);
      count(entry.destinations, `${source?.slug || 'unknown'}:${row.status}:${current ? 'current' : 'stale'}`);
      if (!entry.samples.destination) entry.samples.destination = { ...metaOf(row), sourceSlug: source?.slug };
      if (current && row.status === 'published' && source) memory.add(alignPairs(destinationTemplate(source), row.content), entry.slug);
      if (source && ['hurghada', 'marsa-alam'].includes(source.slug) && destinationRows.filter((item) => item.sourceSlug === source.slug).length < 3) destinationRows.push({ site: tenant?.slug, sourceSlug: source.slug, arSlug: row.slug, status: row.status, current, content: row.content });
    }
    const otherLocales = await AttractionTranslation.collection.aggregate([{ $group: { _id: '$locale', rows: { $sum: 1 } } }]).toArray();

    await emit('existing:summary', { sites: [...summary.values()], localesAcrossNetwork: otherLocales, memoryStrings: memory.size });
    await emit('existing:model-rows', modelRows);
    await emit('existing:destinations', destinationRows);
    const reuse = [...englishStrings].map((text) => memory.lookup(text)).filter(Boolean);
    await emit('memory:reuse', { batchStrings: englishStrings.size, reused: reuse.length, entries: reuse });
    await emit('memory:glossary', GLOSSARY_TERMS.map((term) => ({ term, examples: memory.examples(term, 8) })));
    parts.push('existing:summary', 'existing:model-rows', 'existing:destinations', 'memory:reuse', 'memory:glossary');
    console.log(JSON.stringify({ t: 'netar-done', batches: batches.join(','), parts: parts.length, batchStrings: englishStrings.size, reused: reuse.length, databaseWrites: 0 }));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error && !/mongodb|password|srv|uri/i.test(error.message) ? error.message : 'Read-only export could not complete.';
    console.error(`[export-network-arabic-sources] ${message}`);
    process.exitCode = 1;
  });
}
