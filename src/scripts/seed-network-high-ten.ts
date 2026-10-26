/**
 * The high-priority batch of ten sites that are already on the network (26 October 2026). Unlike batches
 * B01 to B03, which built new sites, every site here exists, is active and already shows a catalogue — and
 * almost none of that catalogue has a record behind it (110 trips across nine of them, 7 real; see the
 * research in planning/atn-140-sites-2026-10/high-batch-2026-10-26). This run replaces what each site
 * sells with trips that are really on sale and takes the rest off.
 *
 * What it writes, and nothing else:
 *   - the trips each site sells, built from the client's own published record (`network-sites/high-ten-snapshot.json`,
 *     checked against the live booking options before the first write) or from an operator's own record on
 *     the network, read at run time;
 *   - the site's hero photos, set to photos of the trips it now sells;
 *   - the status or the site list of the trips that have no record behind them.
 * It never touches a tenant's name, words, colours, domain, contacts, payments or languages, never creates
 * a tenant, and never deletes anything.
 *
 * Taking a trip off is soft and fenced on the exact slug: a trip only this site sells is archived, keeping
 * the status it had; a trip other sites also sell keeps its place on those and loses this site's id from
 * its own list. Every before-value goes into the journal, and `restore` puts all of it back.
 *
 * Read-only check (the default):
 *   npm run seed:network-high-ten
 * Apply, three sites at a time (owner, 25 October):
 *   npm run seed:network-high-ten -- --apply --confirm-sites=a,b,c --journal-dir=<directory outside git>
 * Put those three back exactly as they were:
 *   npm run seed:network-high-ten -- --restore --confirm-sites=a,b,c --journal-dir=<the same directory>
 */
import fs from 'fs';
import path from 'path';
import {
  copiedFactProblems, eeoSourceProgramme, sourceKey, tripDocument, FOREIGN_BRANDS, UNBACKED_CLAIMS,
  type NetworkSite, type NetworkTrip, type TripSiteFacts,
} from './seed-network-sites';
import { EEO_SOURCE, eeoLiveDrift, type EeoSnapshot } from './network-sites/eeo-source';
import SNAPSHOT from './network-sites/high-ten-snapshot.json';
import PHOTO_MAP from './network-sites/high-ten-photos.json';

/** The categories the network's own category list holds. A trip is filed under one of these or not at all. */
export const NETWORK_CATEGORIES = [
  'museums', 'theme-parks', 'tours', 'shows', 'adventures', 'food', 'day-trips', 'landmarks',
  'water-activities', 'transfers',
] as const;

/** Where the client keeps its own trip photos. A site shows its own copy, never the client's original. */
const CLIENT_PHOTO = /^https:\/\/res\.cloudinary\.com\/dm3sxllch\/image\/upload\/v\d+\/tours\//;
const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\/dm3sxllch\/image\/upload\//;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{2714}\u{2728}]/u;
const PROCESS_MARKERS = /\b(seed|preview|placeholder|TODO|lorem|QA|staging|internal)\b/i;
/** The words of the catalogue these trips were copied from; a guest never reads them. */
const CATALOGUE_TALK = /\bpublished\b|does not sell|\b(?:the|on|in the) record\b|snapshot|pretend/i;

export interface HighTenSite extends TripSiteFacts {
  /** The tenant that already exists. The run refuses to create one. */
  slug: string;
  name: string;
  pickupDestination: string;
  currency: 'USD';
  /** The one category every trip this site creates is filed under. */
  category: (typeof NETWORK_CATEGORIES)[number];
  /** The site's home photos, taken from the trips it sells. */
  heroImages: string[];
  /** Why the site shows fewer than three: the trips it sells publish fewer. */
  photoShortfall?: string;
  /** Trips on the site today that have a record behind them; this run leaves them alone. */
  keep: string[];
  /** Trips on the site today with no record behind them; this run takes them off. */
  retire: string[];
  trips: NetworkTrip[];
}

export interface HighTenBatch {
  id: string;
  /** When the client's record was read. */
  readAt: string;
  sites: HighTenSite[];
}

const photoMap = PHOTO_MAP as Record<string, string>;

/** The site's own copy of a photo, where it has been made; otherwise the address it was read from. */
export const sitePhoto = (url: string): string => photoMap[url] || url;

/** Photos a site would still be showing out of the client's own folder. Apply refuses while any remain. */
export function clientHostedPhotos(batch: HighTenBatch): string[] {
  const urls = batch.sites.flatMap((site) => [...site.heroImages, ...site.trips.flatMap((trip) => trip.images)]);
  return [...new Set(urls.map(sitePhoto))].filter((url) => CLIENT_PHOTO.test(url));
}

const copyOf = (trip: NetworkTrip) => [trip.title, trip.short, trip.description, ...trip.highlights,
  trip.seo.metaTitle, trip.seo.metaDescription, ...trip.imageAlts].join('\n');

const specCopyOf = (trip: NetworkTrip) => [
  ...Object.values(trip.price.rename || {}).flatMap((words) => [words.name, words.description]),
  ...Object.values(trip.price.extras || {}).flatMap((words) => [words.name, words.description]),
  ...Object.values(trip.price.vehicle || {}).map((vehicle) => vehicle.note),
  trip.price.childNote || '',
  trip.price.duration || '',
  ...Object.values(trip.price.departureLabels || {}),
  ...(trip.price.itinerary || []).flatMap((step) => [step.title, step.description]),
  ...(trip.price.add?.inclusions || []), ...(trip.price.add?.exclusions || []), ...(trip.price.add?.needToKnow || []),
].join('\n');

/** Every rule that can be checked without the database. An empty list is a valid batch. */
export function validateHighTen(batch: HighTenBatch): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const tripSlugs = new Set<string>();
  for (const site of batch.sites) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(site.slug)) errors.push(`${site.slug}: invalid site slug.`);
    if (seen.has(site.slug)) errors.push(`${site.slug}: the batch names this site twice.`);
    seen.add(site.slug);
    if (site.currency !== 'USD') errors.push(`${site.slug}: this batch sells in USD only.`);
    if (!(NETWORK_CATEGORIES as readonly string[]).includes(site.category)) {
      errors.push(`${site.slug}: "${site.category}" is not one of the network's categories.`);
    }
    if (!site.trips.length) errors.push(`${site.slug}: no trips.`);
    const overlap = site.keep.filter((slug) => site.retire.includes(slug));
    if (overlap.length) errors.push(`${site.slug}: ${overlap.join(', ')} is both kept and taken off.`);
    if (new Set(site.retire).size !== site.retire.length) errors.push(`${site.slug}: a trip is named twice to take off.`);

    const photos = new Set(site.trips.flatMap((trip) => trip.images));
    if (new Set(site.heroImages).size !== site.heroImages.length) errors.push(`${site.slug}: home photos must be distinct.`);
    for (const hero of site.heroImages) {
      if (!photos.has(hero)) errors.push(`${site.slug}: a home photo is not one of the photos its own trips publish: ${hero}`);
    }
    if (site.photoShortfall?.trim() ? site.heroImages.length < 1 : site.heroImages.length < 3) {
      errors.push(`${site.slug}: ${site.photoShortfall?.trim() ? 'one home photo is required' : 'three distinct home photos are required'}.`);
    }

    const paths = new Set<string>();
    for (const trip of site.trips) {
      const slug = `${site.slugPrefix}${trip.path}`;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trip.path)) errors.push(`${slug}: invalid public path.`);
      if (paths.has(trip.path)) errors.push(`${slug}: duplicate public path.`);
      if (tripSlugs.has(slug)) errors.push(`${slug}: two sites of this batch would write the same trip slug.`);
      paths.add(trip.path);
      tripSlugs.add(slug);
      if (site.retire.includes(slug) || site.keep.includes(slug)) errors.push(`${slug}: a trip cannot be created and retired in one run.`);
      if (!trip.images.length || trip.images.length !== trip.imageAlts.length) errors.push(`${slug}: every photo needs its own description.`);
      for (const url of trip.images) if (!CLOUDINARY.test(sitePhoto(url))) errors.push(`${slug}: photo is not on the network's Cloudinary: ${url}`);
      for (const alt of trip.imageAlts) if (alt.trim().length < 20) errors.push(`${slug}: a photo description is too short.`);
      const copy = `${copyOf(trip)}\n${specCopyOf(trip)}`;
      if (EMOJI.test(copy)) errors.push(`${slug}: emoji in customer copy.`);
      if (FOREIGN_BRANDS.test(copy)) errors.push(`${slug}: another brand in customer copy.`);
      if (PROCESS_MARKERS.test(copy)) errors.push(`${slug}: process marker in customer copy.`);
      if (UNBACKED_CLAIMS.test(copy)) errors.push(`${slug}: unbacked claim in customer copy.`);
      if (CATALOGUE_TALK.test(copy)) errors.push(`${slug}: the catalogue's own words in customer copy.`);
      if (site.foreignPlaces.test(copy)) errors.push(`${slug}: copy names a place this site does not serve.`);
      if (!trip.seo.metaTitle || trip.seo.metaTitle.length > 70) errors.push(`${slug}: SEO title missing or too long.`);
      if (!trip.seo.metaDescription || trip.seo.metaDescription.length > 165) errors.push(`${slug}: SEO description missing or too long.`);
      const spec = trip.price;
      if (spec.category !== site.category) errors.push(`${slug}: filed under "${spec.category}", not the site's "${site.category}".`);
      if (!spec.options.length) errors.push(`${slug}: sells no option.`);
      if (spec.addons.length) errors.push(`${slug}: this batch sells no extras.`);
      if (spec.provider === 'eeo' && spec.tenant !== EEO_SOURCE) errors.push(`${slug}: a programme from the client's main site must name ${EEO_SOURCE}.`);
      if (new Set(spec.departures).size !== spec.departures.length || spec.departures.some((label) => !label.trim())) {
        errors.push(`${slug}: departures must name distinct departures of the programme.`);
      }
      for (const id of Object.keys(spec.rename || {})) if (!spec.options.includes(id)) errors.push(`${slug}: option "${id}" to rename is not sold.`);
      for (const id of Object.keys(spec.vehicle || {})) if (!spec.options.includes(id)) errors.push(`${slug}: whole-booking option "${id}" is not sold.`);
    }
  }
  return errors;
}

type SourceDoc = Record<string, any>;

/**
 * Every programme the batch sells. The client's own come from the dated record and only while the live
 * booking options still match it; an operator's come from its own record on the network, which must be
 * active and priced in the site's currency. Anything missing is named and nothing is written.
 */
export async function loadProgrammes(batch: HighTenBatch, snapshot: EeoSnapshot = SNAPSHOT as EeoSnapshot) {
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const sources = new Map<string, SourceDoc>();
  const missing: string[] = [];
  const pairs = batch.sites.flatMap((site) => site.trips.map((trip) => ({ site, trip })));

  const owners = [...new Set(pairs.filter(({ trip }) => trip.price.provider !== 'eeo').map(({ trip }) => trip.price.tenant))];
  const ownerDocs = await Tenant.find({ slug: { $in: owners } }).select('_id slug').lean();
  const ownerIds = new Map(ownerDocs.map((owner) => [owner.slug as string, owner._id]));

  for (const { site, trip } of pairs) {
    const spec = trip.price;
    const key = `${site.slug}/${sourceKey(spec)}`;
    if (sources.has(key)) continue;
    if (spec.provider === 'eeo') {
      const tour = snapshot.tours.find((item) => item.slug === spec.source);
      if (!tour) { missing.push(`${key}: not in the record read ${snapshot.readAt}.`); continue; }
      const drift = await eeoLiveDrift(tour, spec.options, spec.addons)
        .catch((error: unknown) => [`${key}: the live check failed: ${error instanceof Error ? error.message : String(error)}`]);
      if (drift.length) { missing.push(`${key} (${drift.join('; ')})`); continue; }
      try { sources.set(key, { ...eeoSourceProgramme(spec, snapshot), category: site.category }); }
      catch (error) { missing.push(`${key} (${error instanceof Error ? error.message : String(error)})`); }
      continue;
    }
    const ownerId = ownerIds.get(spec.tenant);
    const programme = ownerId
      ? await Attraction.findOne({ slug: spec.source, ownerTenantId: ownerId, status: 'active' }).lean()
      : null;
    if (!programme) { missing.push(`${key}: the operator publishes no active programme by that name.`); continue; }
    sources.set(key, { ...(programme as SourceDoc), category: site.category });
  }
  return { sources, missing };
}

/** The trip documents of one site, with everything the copy or the schema would refuse. */
export function planSite(site: HighTenSite, sources: Map<string, SourceDoc>, tenantId: unknown, schemaCheck: SchemaCheck) {
  const problems: string[] = [];
  const documents = site.trips.flatMap((trip, index) => {
    const source = sources.get(`${site.slug}/${sourceKey(trip.price)}`);
    if (!source) return [];
    try {
      const photographed: NetworkTrip = { ...trip, images: trip.images.map(sitePhoto) };
      const document = tripDocument(site, photographed, source, index, tenantId);
      problems.push(...copiedFactProblems(site, document), ...schemaCheck(document).map((problem) => `${String(document.slug)}: ${problem}`));
      return [document];
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      return [];
    }
  });
  return { documents, problems };
}

export type SchemaCheck = (document: Record<string, unknown>) => string[];

/** A trip as it is on the network today, as far as taking it off this site needs to know. */
export interface TripOnSite { slug: string; status: string; listedOn: number }

/**
 * How each trip with no record behind it comes off this site. A trip only this site sells is archived and
 * keeps the status it had, so putting it back is one field. A trip other sites also sell keeps its place
 * on those and loses this site's id. A trip already archived is left alone, and one that is no longer on
 * the site stops the run rather than being guessed at.
 */
export function retirePlan(retire: string[], onSite: TripOnSite[]) {
  const byId = new Map(onSite.map((trip) => [trip.slug, trip]));
  const archive: Array<{ slug: string; status: string }> = [];
  const unlist: Array<{ slug: string; listedOn: number }> = [];
  const problems: string[] = [];
  for (const slug of retire) {
    const trip = byId.get(slug);
    if (!trip) { problems.push(`${slug} is no longer on the site; read the site again.`); continue; }
    if (trip.status === 'archived') continue;
    if (trip.listedOn > 1) unlist.push({ slug, listedOn: trip.listedOn });
    else archive.push({ slug, status: trip.status });
  }
  return { archive, unlist, problems };
}

/** What one site's trips on the network look like today, and what this run would do to each. */
export interface SiteState {
  site: HighTenSite;
  tenantId: unknown;
  status: string;
  domainMigrated: boolean;
  heroImagesNow: string[];
  create: string[];
  update: string[];
  archive: Array<{ slug: string; status: string }>;
  unlist: Array<{ slug: string; listedOn: number }>;
  keptWithRecord: string[];
  problems: string[];
}

export async function readSiteState(site: HighTenSite): Promise<SiteState | { site: HighTenSite; problems: string[] }> {
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const problems: string[] = [];
  const tenant = await Tenant.findOne({ slug: site.slug }).select('_id slug status domainMigrated heroImages defaultCurrency').lean();
  if (!tenant) return { site, problems: [`${site.slug}: no such site on the network. This batch never creates one.`] };
  if (tenant.defaultCurrency !== site.currency) problems.push(`${site.slug}: the site sells in ${tenant.defaultCurrency}, the batch in ${site.currency}.`);
  if (!['active', 'coming_soon', 'pending'].includes(String(tenant.status))) problems.push(`${site.slug}: protected status ${tenant.status}.`);
  if (tenant.domainMigrated) problems.push(`${site.slug}: already serves its own domain; its catalogue is not changed here.`);

  const wanted = site.trips.map((trip) => `${site.slugPrefix}${trip.path}`);
  const held = await Attraction.find({ slug: { $in: wanted } }).select('slug ownerTenantId tenantIds').lean();
  for (const record of held) {
    const ours = String(record.ownerTenantId) === String(tenant._id)
      && (record.tenantIds || []).every((id: unknown) => String(id) === String(tenant._id));
    if (!ours) problems.push(`${site.slug}: ${record.slug} is another site's trip; nothing is overwritten.`);
  }

  const onSite = await Attraction.find({ tenantIds: tenant._id }).select('slug status ownerTenantId tenantIds').lean();
  const byId = new Map(onSite.map((trip) => [trip.slug as string, trip]));
  const { archive, unlist, problems: retireProblems } = retirePlan(site.retire, onSite.map((trip) => ({
    slug: trip.slug as string, status: String(trip.status), listedOn: (trip.tenantIds || []).length,
  })));
  problems.push(...retireProblems.map((problem) => `${site.slug}: ${problem}`));
  for (const slug of site.keep) if (!byId.has(slug)) problems.push(`${site.slug}: ${slug} was to be kept but is no longer on the site.`);
  const stillThere = onSite
    .filter((trip) => trip.status !== 'archived')
    .map((trip) => trip.slug as string)
    .filter((slug) => !site.retire.includes(slug) && !site.keep.includes(slug) && !wanted.includes(slug));
  for (const slug of stillThere) problems.push(`${site.slug}: ${slug} is on the site and the batch says nothing about it; read the site again.`);

  return {
    site,
    tenantId: tenant._id,
    status: String(tenant.status),
    domainMigrated: Boolean(tenant.domainMigrated),
    heroImagesNow: (tenant.heroImages as string[]) || [],
    create: wanted.filter((slug) => !held.some((record) => record.slug === slug)),
    update: wanted.filter((slug) => held.some((record) => record.slug === slug)),
    archive,
    unlist,
    keptWithRecord: site.keep,
    problems,
  };
}

const isState = (value: SiteState | { site: HighTenSite; problems: string[] }): value is SiteState =>
  Object.prototype.hasOwnProperty.call(value, 'tenantId');

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

/** The sites this run may touch: named in full, in the batch's order, and nothing else. */
function confirmedSites(batch: HighTenBatch): HighTenSite[] {
  const named = (argValue('confirm-sites') || '').split(',').map((slug) => slug.trim()).filter(Boolean);
  if (!named.length) throw new Error(`Pass --confirm-sites=<slugs>, in this order: ${batch.sites.map((site) => site.slug).join(',')}`);
  const unknown = named.filter((slug) => !batch.sites.some((site) => site.slug === slug));
  if (unknown.length) throw new Error(`Not in this batch: ${unknown.join(', ')}.`);
  if (new Set(named).size !== named.length) throw new Error('A site is named twice.');
  const chosen = batch.sites.filter((site) => named.includes(site.slug));
  if (chosen.map((site) => site.slug).join(',') !== named.join(',')) {
    throw new Error(`Name the sites in the batch's own order: ${chosen.map((site) => site.slug).join(',')}`);
  }
  return chosen;
}

function journalFile(site: HighTenSite): string {
  const dir = argValue('journal-dir');
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('Pass --journal-dir=<existing directory outside git>.');
  return path.join(dir, `${site.slug}.json`);
}

async function schemaChecker(): Promise<SchemaCheck> {
  const { Attraction } = await import('../models/Attraction');
  const { Types } = await import('mongoose');
  return (document) => {
    const candidate = {
      ...document,
      ownerTenantId: document.ownerTenantId ?? new Types.ObjectId(),
      tenantIds: (document.tenantIds as unknown[]).map((id) => id ?? new Types.ObjectId()),
    };
    const error = new Attraction(candidate).validateSync();
    return error ? Object.values(error.errors).map((item) => item.message) : [];
  };
}

const tripSummary = (document: Record<string, unknown>) => ({
  slug: document.slug,
  title: document.title,
  from: `${String(document.priceFrom)} ${String(document.currency)}`,
  category: document.category,
  duration: document.duration ?? null,
  options: (document.pricingOptions as Array<Record<string, any>>).map((option) =>
    `${option.name}: ${option.price}${option.childPrice !== undefined ? ` (child ${option.childPrice})` : ''}${option.pricingModel === 'per-booking' ? ` per booking, up to ${option.maxParticipants}` : ''}`),
  departures: (document.entryWindows as Array<Record<string, any>>).map((window) => `${window.label} ${window.startTime}`),
  photos: (document.images as string[]).length,
});

async function check(batch: HighTenBatch): Promise<void> {
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  await connectDatabase();
  try {
    const schemaCheck = await schemaChecker();
    const { sources, missing } = await loadProgrammes(batch);
    const sites = [];
    for (const site of batch.sites) {
      const state = await readSiteState(site);
      const plan = isState(state) ? planSite(site, sources, state.tenantId, schemaCheck) : { documents: [], problems: [] };
      sites.push({
        slug: site.slug,
        tenant: isState(state) ? { status: state.status, domainMigrated: state.domainMigrated } : { missing: true },
        heroImages: isState(state) ? { now: state.heroImagesNow, after: site.heroImages.map(sitePhoto) } : null,
        wouldCreate: isState(state) ? state.create.length : 0,
        wouldUpdate: isState(state) ? state.update : [],
        wouldArchive: isState(state) ? state.archive : [],
        wouldUnlist: isState(state) ? state.unlist : [],
        keptBecauseTheyHaveARecord: site.keep,
        photoShortfall: site.photoShortfall ?? null,
        problems: [...state.problems, ...plan.problems],
        trips: plan.documents.map(tripSummary),
      });
    }
    const report = {
      mode: 'check',
      batch: batch.id,
      recordReadAt: batch.readAt,
      checkedAt: new Date().toISOString(),
      missingProgrammesOrLiveDrift: missing,
      photosStillOnTheClientsOwnFolder: clientHostedPhotos(batch),
      totals: {
        sites: sites.length,
        toCreate: sites.reduce((sum, site) => sum + site.wouldCreate, 0),
        toUpdate: sites.reduce((sum, site) => sum + site.wouldUpdate.length, 0),
        toArchive: sites.reduce((sum, site) => sum + site.wouldArchive.length, 0),
        toUnlist: sites.reduce((sum, site) => sum + site.wouldUnlist.length, 0),
        kept: sites.reduce((sum, site) => sum + site.keptBecauseTheyHaveARecord.length, 0),
        problems: sites.reduce((sum, site) => sum + site.problems.length, 0),
      },
      sites,
      writes: 'none',
    };
    const text = JSON.stringify(report, null, 2);
    const out = argValue('report');
    if (out) fs.writeFileSync(out, `${text}\n`);
    console.log(text);
  } finally {
    await disconnectDatabase();
  }
}

async function apply(batch: HighTenBatch): Promise<void> {
  const chosen = confirmedSites(batch);
  const files = chosen.map((site) => journalFile(site));
  const already = files.filter((file) => fs.existsSync(file));
  if (already.length) throw new Error(`A journal is already there for ${already.join(', ')}; restore or move it first.`);

  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  const { urlNamespaceReadiness } = await import('../plugins/urlNamespace');
  if (!urlNamespaceReadiness().writesReady) throw new Error('URL namespace writes are paused in this environment. Nothing was written.');

  await connectDatabase();
  try {
    const schemaCheck = await schemaChecker();
    const { sources, missing } = await loadProgrammes({ ...batch, sites: chosen });
    if (missing.length) throw new Error(`Programmes missing, or the live prices have moved: ${missing.join(', ')}.`);
    const stale = clientHostedPhotos({ ...batch, sites: chosen });
    if (stale.length) throw new Error(`These photos are still the client's own copies; make the site's own first: ${stale.join(', ')}.`);

    // The whole run is checked before the first write, so a refusal writes nothing at all.
    const states: SiteState[] = [];
    for (const site of chosen) {
      const state = await readSiteState(site);
      if (!isState(state)) throw new Error(state.problems.join('\n'));
      const plan = planSite(site, sources, state.tenantId, schemaCheck);
      const problems = [...state.problems, ...plan.problems];
      if (problems.length) throw new Error(`${site.slug}: nothing was written.\n- ${problems.join('\n- ')}`);
      if (plan.documents.length !== site.trips.length) throw new Error(`${site.slug}: ${site.trips.length - plan.documents.length} trips could not be built.`);
      states.push(state);
    }

    const report = [];
    for (const state of states) {
      const { site, tenantId } = state;
      const journal = {
        site: site.slug,
        appliedAt: new Date().toISOString(),
        heroImagesBefore: state.heroImagesNow,
        created: [] as string[],
        updated: [] as string[],
        archived: [] as Array<{ slug: string; status: string }>,
        unlisted: [] as string[],
      };
      const plan = planSite(site, sources, tenantId, schemaCheck);
      for (const document of plan.documents) {
        const slug = String(document.slug);
        (state.create.includes(slug) ? journal.created : journal.updated).push(slug);
        await Attraction.findOneAndUpdate(
          { slug },
          // Never carried from the programme: its cancellation promise and its badges.
          { $set: document, $unset: { cancellationPolicy: 1, badges: 1 } },
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
        );
      }
      for (const { slug, status } of state.archive) {
        const updated = await Attraction.findOneAndUpdate(
          // Fenced on the exact slug, this site's ownership and the status it was read in.
          { slug, ownerTenantId: tenantId, status },
          { $set: { status: 'archived', statusBeforeArchive: status, archivedAt: new Date() } },
          { new: true },
        );
        if (!updated) throw new Error(`${site.slug}: ${slug} changed while the run was working; the rest of this site was written. Restore it from the journal.`);
        journal.archived.push({ slug, status });
      }
      for (const { slug } of state.unlist) {
        const updated = await Attraction.findOneAndUpdate(
          { slug, tenantIds: tenantId },
          { $pull: { tenantIds: tenantId } },
          { new: true },
        );
        if (!updated) throw new Error(`${site.slug}: ${slug} changed while the run was working. Restore this site from the journal.`);
        journal.unlisted.push(slug);
      }
      const rehomed = await Tenant.findOneAndUpdate(
        // Fenced on the exact array the run read, so a hero photo changed meanwhile is never overwritten.
        { slug: site.slug, heroImages: state.heroImagesNow },
        { $set: { heroImages: site.heroImages.map(sitePhoto) } },
        { new: true, runValidators: true },
      );
      if (!rehomed) throw new Error(`${site.slug}: the home photos changed while the run was working; the trips were written. Restore this site from the journal.`);
      fs.writeFileSync(journalFile(site), JSON.stringify(journal, null, 1), { mode: 0o600 });

      const live = await Attraction.countDocuments({ tenantIds: tenantId, status: 'active' });
      const rated = await Attraction.countDocuments({ ownerTenantId: tenantId, status: 'active', $or: [{ rating: { $gt: 0 } }, { reviewCount: { $gt: 0 } }], slug: { $in: plan.documents.map((one) => String(one.slug)) } });
      const otherCurrency = await Attraction.countDocuments({ tenantIds: tenantId, status: 'active', currency: { $ne: site.currency } });
      if (rated !== 0 || otherCurrency !== 0) throw new Error(`${site.slug}: after the write, rated=${rated}, otherCurrency=${otherCurrency}.`);
      report.push({ slug: site.slug, created: journal.created.length, updated: journal.updated.length, archived: journal.archived.length, unlisted: journal.unlisted.length, liveTrips: live });
    }
    console.log(JSON.stringify({ mode: 'applied', batch: batch.id, sites: report, journal: argValue('journal-dir') }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

async function restore(batch: HighTenBatch): Promise<void> {
  const chosen = confirmedSites(batch);
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { Tenant } = await import('../models/Tenant');
  const { Attraction } = await import('../models/Attraction');
  await connectDatabase();
  try {
    const report = [];
    for (const site of chosen) {
      const file = journalFile(site);
      if (!fs.existsSync(file)) throw new Error(`${site.slug}: no journal at ${file}; there is nothing to put back.`);
      const journal = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        heroImagesBefore: string[]; created: string[]; updated: string[];
        archived: Array<{ slug: string; status: string }>; unlisted: string[];
      };
      const tenant = await Tenant.findOne({ slug: site.slug }).select('_id slug').lean();
      if (!tenant) throw new Error(`${site.slug}: no such site.`);
      for (const { slug, status } of journal.archived) {
        await Attraction.findOneAndUpdate(
          { slug, ownerTenantId: tenant._id, status: 'archived' },
          { $set: { status }, $unset: { statusBeforeArchive: 1, archivedAt: 1 } },
        );
      }
      for (const slug of journal.unlisted) {
        await Attraction.findOneAndUpdate({ slug, tenantIds: { $ne: tenant._id } }, { $addToSet: { tenantIds: tenant._id } });
      }
      // What the run created did not exist before: it is archived, never deleted.
      for (const slug of journal.created) {
        await Attraction.findOneAndUpdate(
          { slug, ownerTenantId: tenant._id, status: { $ne: 'archived' } },
          { $set: { status: 'archived', statusBeforeArchive: 'active', archivedAt: new Date() } },
        );
      }
      await Tenant.findOneAndUpdate({ slug: site.slug }, { $set: { heroImages: journal.heroImagesBefore } }, { runValidators: true });
      fs.renameSync(file, `${file}.restored`);
      report.push({
        slug: site.slug, putBack: journal.archived.length + journal.unlisted.length,
        archivedWhatWasCreated: journal.created.length,
        updatedTripsLeftAsTheyAre: journal.updated.length,
      });
    }
    console.log(JSON.stringify({ mode: 'restored', batch: batch.id, sites: report }, null, 2));
  } finally {
    await disconnectDatabase();
  }
}

export async function main(): Promise<void> {
  const { HIGH_TEN } = await import('./network-sites/high-ten');
  const errors = validateHighTen(HIGH_TEN);
  if (errors.length) throw new Error(`Batch ${HIGH_TEN.id} is invalid:\n- ${errors.join('\n- ')}`);
  if (process.argv.includes('--apply')) return apply(HIGH_TEN);
  if (process.argv.includes('--restore')) return restore(HIGH_TEN);
  return check(HIGH_TEN);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[high-ten] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
