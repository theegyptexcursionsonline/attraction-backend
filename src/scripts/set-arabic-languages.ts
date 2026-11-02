/**
 * Switches Arabic on for a network group's sites by adding `ar` to each tenant's `supportedLanguages`, the
 * step earlier batches took once their Arabic records were published and the storefront's Arabic pages were
 * live. A production write: it needs the owner's approval for the run.
 *
 *   OPS_TASK="src/scripts/set-arabic-languages.ts --group=b14a"                         (dry run, read-only)
 *   OPS_TASK="src/scripts/set-arabic-languages.ts --group=b14a --apply --approve=<approval>"
 *
 * The dry run prints, per site, the languages it has, the languages it would have, and whether every record
 * the site shows already has a current published Arabic row, judged by the same checks the public API uses
 * (`sourceMatches` plus the content validators for tours and destinations, `currentPresentationRows` for the
 * presentation). A site that is not ready blocks the whole group, so the switch can never advertise Arabic
 * over missing pages. `--apply` refuses unless the approval digest it computes equals the approved one, and
 * each write is conditional on the languages the dry run saw. A site that already offers Arabic is left alone.
 */
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Destination } from '../models/Destination';
import { AttractionTranslation } from '../models/AttractionTranslation';
import { DestinationTranslation } from '../models/DestinationTranslation';
import { TenantPresentationTranslation } from '../models/TenantPresentationTranslation';
import { attractionTranslationContent, cleanTranslation, validateTranslationSource } from '../services/attractionLocalization.service';
import { destinationTranslationContent, cleanDestinationTranslation, validateDestinationTranslation } from '../services/destinationLocalization.service';
import { sourceMatches } from '../services/localizationSourceSnapshot.service';
import { localizationDigest } from '../services/localizationMigration.service';
import { currentPresentationRows, presentationReadScope, type PresentationRow } from '../services/tenantPresentationLocalization.service';
import { tenantPickupDestinationSlugs } from '../utils/pickupDestinations';
import { PUBLISH_BATCHES } from './network-arabic/publish';

const LOCALE = 'ar';

export function languagesArguments(args: string[]): { group: string; apply: boolean; approve: string } {
  const group = args.find((arg) => arg.startsWith('--group='))?.slice('--group='.length) || '';
  const apply = args.includes('--apply');
  const approve = args.find((arg) => arg.startsWith('--approve='))?.slice('--approve='.length) || '';
  const known = args.every((arg) => arg.startsWith('--group=') || arg === '--apply' || arg.startsWith('--approve='));
  if (!known || !PUBLISH_BATCHES[group] || (apply ? !/^[a-f\d]{64}$/.test(approve) || args.length !== 3 : args.length !== 1)) throw new Error('Provide --group=<group> for a dry run, or --group=<group> --apply --approve=<digest from the dry run>');
  return { group, apply, approve };
}

/** The languages after the switch: Arabic added once, at the end, nothing else touched. */
export function withArabic(languages: unknown): string[] {
  const list = Array.isArray(languages) ? languages.filter((item): item is string => typeof item === 'string') : [];
  return list.includes(LOCALE) ? list : [...list, LOCALE];
}

export interface LanguagePlan { site: string; tenantId: string; before: string[]; after: string[]; change: boolean; ready: boolean; missing: string[] }
export function languagesApprovalDigest(group: string, plans: LanguagePlan[]): string {
  return localizationDigest({ version: 1, group, locale: LOCALE, sites: plans.map((plan) => ({ site: plan.site, tenantId: plan.tenantId, before: plan.before, after: plan.after })) });
}

/** Reads only: is every tour, destination and presentation source of this site served in Arabic now? */
export async function planLanguages(slug: string): Promise<LanguagePlan> {
  const tenant: any = await Tenant.findOne({ slug, domain: `${slug}.foxesnetwork.com`, status: 'active' }).select('_id slug status domain designMode supportedLanguages tagline description heroImages seoSettings pageSeo navigation customPages pickupDestinationSlugs').lean();
  if (!tenant) throw new Error(`${slug}: active network site not found`);
  const missing: string[] = [];
  const cities = new Set<string>();
  const tours: any[] = await Attraction.find({ tenantIds: tenant._id, status: 'active', archivedAt: { $exists: false }, trashedAt: { $exists: false } }).lean();
  if (!tours.length) missing.push('the site sells no tour');
  for (const tour of tours) {
    cities.add(tour.destination?.city);
    const row: any = await AttractionTranslation.findOne({ tenantId: tenant._id, attractionId: tour._id, locale: LOCALE, status: 'published' }).lean();
    const parsed = row ? attractionTranslationContent.safeParse(row.content) : null;
    let valid = !!parsed?.success && sourceMatches('tour', tour, row);
    if (valid) { try { validateTranslationSource(tour, cleanTranslation(parsed!.data!)); } catch { valid = false; } }
    if (!valid) missing.push(`tour ${tour.slug}`);
  }
  const destinations: any[] = await Destination.find({ isActive: true, $or: [{ name: { $in: [...cities] } }, { slug: { $in: tenantPickupDestinationSlugs(tenant) } }] }).lean();
  for (const destination of destinations) {
    const row: any = await DestinationTranslation.findOne({ tenantId: tenant._id, destinationId: destination._id, locale: LOCALE, status: 'published' }).lean();
    const parsed = row ? destinationTranslationContent.safeParse(row.content) : null;
    let valid = !!parsed?.success && sourceMatches('destination', destination, row);
    if (valid) { try { validateDestinationTranslation(destination, cleanDestinationTranslation(parsed!.data!)); } catch { valid = false; } }
    if (!valid) missing.push(`destination ${destination.slug}`);
  }
  const rows = (await TenantPresentationTranslation.find(presentationReadScope(tenant)).lean()) as unknown as PresentationRow[];
  if (!currentPresentationRows(tenant._id, 'tenant', tenant, rows).some((row) => row.locale === LOCALE)) missing.push('presentation tenant');
  for (const page of (tenant.customPages || []).filter((item: any) => item.isPublished !== false && item.status !== 'archived' && !item.trashedAt)) {
    if (!currentPresentationRows(tenant._id, 'page', { ...page, tenantId: tenant._id }, rows).some((row) => row.locale === LOCALE)) missing.push(`presentation page ${page.slug || page._id}`);
  }
  const before = Array.isArray(tenant.supportedLanguages) ? [...tenant.supportedLanguages] : [];
  const after = withArabic(before);
  return { site: slug, tenantId: String(tenant._id), before, after, change: JSON.stringify(before) !== JSON.stringify(after), ready: !missing.length, missing };
}

/** Writes one site's languages, only if they are still exactly what the dry run saw. */
export async function applyLanguages(plan: LanguagePlan): Promise<{ site: string; changed: boolean }> {
  if (!plan.change) return { site: plan.site, changed: false };
  const result = await Tenant.updateOne({ _id: plan.tenantId, slug: plan.site, status: 'active', supportedLanguages: plan.before }, { $set: { supportedLanguages: plan.after } });
  if (result.matchedCount !== 1) throw new Error(`${plan.site}: languages changed since the dry run; nothing written for this site`);
  const stored: any = await Tenant.findById(plan.tenantId).select('supportedLanguages').lean();
  if (JSON.stringify(stored?.supportedLanguages) !== JSON.stringify(plan.after)) throw new Error(`${plan.site}: readback differs; inspect before retrying`);
  return { site: plan.site, changed: true };
}

async function main() {
  const { group, apply, approve } = languagesArguments(process.argv.slice(2));
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Database configuration is required');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  try {
    const plans: LanguagePlan[] = [];
    for (const site of PUBLISH_BATCHES[group].batch.sites) {
      const plan = await planLanguages(site.slug);
      plans.push(plan);
      console.log(JSON.stringify({ languages: 'arabic', group, ...plan }));
    }
    const ready = plans.every((plan) => plan.ready);
    const digest = ready ? languagesApprovalDigest(group, plans) : '';
    console.log(JSON.stringify({ languages: 'arabic', group, mode: apply ? 'apply' : 'dry-run', sites: plans.length, toChange: plans.filter((plan) => plan.change).length, ready, approval: digest || null, ...(apply ? {} : { databaseWrites: 0 }) }));
    if (!ready) { process.exitCode = 1; return; }
    if (!apply) return;
    if (digest !== approve) {
      console.log(JSON.stringify({ languages: 'arabic', group, refused: 'The plan differs from the approved one. Run the dry run again; nothing was written.' }));
      process.exitCode = 1;
      return;
    }
    for (const plan of plans) console.log(JSON.stringify({ languages: 'arabic', group, ...(await applyLanguages(plan)) }));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error && !/mongodb|password|srv|uri/i.test(error.message) ? error.message : 'Language switch could not complete. Run the dry run before retrying.';
    console.error(`[set-arabic-languages] ${message}`);
    process.exitCode = 1;
  });
}
