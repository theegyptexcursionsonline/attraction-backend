/**
 * Complete the eight-tour Safari Sahara quad catalogue from the operator's
 * legacy site. The default command validates the immutable manifest without
 * touching a provider. Live audit and apply modes require an exact tenant
 * fence. Media is mirrored first with retry-stable Cloudinary IDs; all MongoDB
 * changes then commit in one transaction guarded by record timestamps and
 * page/menu revisions.
 *
 * Dry run:
 *   npm run migrate:safari-sahara-quads
 * Live audit:
 *   npm run migrate:safari-sahara-quads -- --audit-live --confirm-tenant=safari-sahara-hurghada
 * Apply:
 *   npm run migrate:safari-sahara-quads -- --apply --confirm-tenant=safari-sahara-hurghada \
 *     --backup-file=readiness-proof/safari-quad-backup.json \
 *     --receipt-file=readiness-proof/safari-quad-receipt.json
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { isDeepStrictEqual } from 'util';
import mongoose, { Types } from 'mongoose';
import rawManifest from '../data/safari-sahara-quad-catalog.json';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { Category } from '../models/Category';
import { Tenant } from '../models/Tenant';
import { uploadBase64Image } from '../services/upload.service';
import { createAttractionSchema } from '../utils/validators';
import { navigationSchema } from '../utils/siteContent';

const TENANT_SLUG = 'safari-sahara-hurghada';
const SOURCE_HOST = 'safari-sahara.com';
const SOURCE_PREFIX = '/wp-content/uploads/';
const MIRROR_ROOT = `attractions-network/tours/${TENANT_SLUG}`;
const QUAD_SECTION_ID = 'quad-tours';
const PUBLIC_PAGE_PATH = '/hurghada-quad-biking-tours';
const PUBLIC_TOUR_FIELDS = [
  'title', 'pathSlug', 'parentPage', 'shortDescription', 'description', 'category',
  'duration', 'languages', 'priceFrom', 'currency', 'pricingOptions', 'entryWindows',
  'hasHotelPickup', 'participantRequirements', 'needToKnow', 'inclusions', 'exclusions',
  'highlights', 'itinerary', 'instantConfirmation', 'mobileTicket',
  'cancellationPolicy', 'seo', 'sortOrder', 'status', 'images',
] as const;

type PlainObject = Record<string, unknown>;
type TargetFields = PlainObject & {
  title: string;
  pathSlug: string;
  priceFrom: number;
  currency: string;
  pricingOptions: Array<{ id: string; timeSlots?: Array<{ id: string; startTime: string; endTime?: string }> }>;
  status: 'active';
};
export interface SafariTourPlan {
  expectedStatus?: 'draft' | 'active';
  sourceUrl: string;
  targetId: string;
  expectedUpdatedAt: string;
  target: TargetFields;
  sourceImages: string[];
}
export interface SafariRetirementPlan {
  expectedStatus?: 'active' | 'archived';
  id: string;
  replacementId: string;
  expectedUpdatedAt: string;
}
export interface SafariQuadManifest {
  schemaVersion: number;
  tenantSlug: string;
  sourceLandingUrl: string;
  pageId: string;
  expectedPageRevision: number;
  expectedNavigationRevision: number;
  tours: SafariTourPlan[];
  retireRecords: SafariRetirementPlan[];
}

export const SAFARI_QUAD_MANIFEST = rawManifest as unknown as SafariQuadManifest;

const objectId = (value: string): boolean => Types.ObjectId.isValid(value) && String(new Types.ObjectId(value)) === value.toLowerCase();
const isoDate = (value: string): boolean => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
const plain = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Types.ObjectId) return value.toString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    const source = typeof (value as { toObject?: () => unknown }).toObject === 'function'
      ? (value as { toObject: () => unknown }).toObject()
      : value;
    return Object.fromEntries(Object.entries(source as PlainObject)
      .filter(([key]) => !['_id', '__v'].includes(key))
      .map(([key, item]) => [key, plain(item)]));
  }
  return value;
};
const serializable = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Types.ObjectId) return value.toString();
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === 'object') {
    const source = typeof (value as { toObject?: () => unknown }).toObject === 'function'
      ? (value as { toObject: () => unknown }).toObject()
      : value;
    return Object.fromEntries(Object.entries(source as PlainObject)
      .filter(([key]) => key !== '__v')
      .map(([key, item]) => [key, serializable(item)]));
  }
  return value;
};
const equal = (left: unknown, right: unknown): boolean => isDeepStrictEqual(plain(left), plain(right));
const recordObject = (value: unknown): PlainObject => {
  if (!value || typeof value !== 'object') return {};
  const result = typeof (value as { toObject?: () => unknown }).toObject === 'function'
    ? (value as { toObject: () => unknown }).toObject()
    : value;
  return result as PlainObject;
};
const dateString = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value || '');

export function validateSafariQuadManifest(manifest: SafariQuadManifest = SAFARI_QUAD_MANIFEST): string[] {
  const errors: string[] = [];
  if (manifest.schemaVersion !== 1) errors.push('Unsupported manifest schema version.');
  if (manifest.tenantSlug !== TENANT_SLUG) errors.push('Manifest tenant does not match the Safari Sahara migration fence.');
  if (!objectId(manifest.pageId)) errors.push('Landing-page ID is invalid.');
  if (!Number.isInteger(manifest.expectedPageRevision) || manifest.expectedPageRevision < 0) errors.push('Landing-page revision is invalid.');
  if (!Number.isInteger(manifest.expectedNavigationRevision) || manifest.expectedNavigationRevision < 0) errors.push('Navigation revision is invalid.');
  if (manifest.tours.length !== 8) errors.push('Exactly eight canonical tours are required.');

  const targetIds = new Set<string>();
  const paths = new Set<string>();
  for (const [index, tour] of manifest.tours.entries()) {
    const label = `Tour ${index + 1}`;
    if (!objectId(tour.targetId)) errors.push(`${label} target ID is invalid.`);
    if (targetIds.has(tour.targetId)) errors.push(`${label} target ID is duplicated.`);
    targetIds.add(tour.targetId);
    if (!isoDate(tour.expectedUpdatedAt)) errors.push(`${label} expected timestamp is invalid.`);
    let source: URL | null = null;
    try { source = new URL(tour.sourceUrl); } catch { errors.push(`${label} source URL is invalid.`); }
    if (source && (source.protocol !== 'https:' || source.hostname !== SOURCE_HOST || source.pathname !== `/${tour.target.pathSlug}/`)) {
      errors.push(`${label} source URL does not match its canonical path.`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tour.target.pathSlug)) errors.push(`${label} public path is invalid.`);
    if (paths.has(tour.target.pathSlug)) errors.push(`${label} public path is duplicated.`);
    paths.add(tour.target.pathSlug);
    if (!tour.target.title.trim() || !String(tour.target.shortDescription || '').trim() || !String(tour.target.description || '').trim()) errors.push(`${label} copy is incomplete.`);
    if (String(tour.target.shortDescription || '').length > 180) errors.push(`${label} card summary exceeds 180 characters.`);
    if (tour.target.currency !== 'EUR' || !Number.isFinite(tour.target.priceFrom) || tour.target.priceFrom <= 0) errors.push(`${label} source-backed EUR price is invalid.`);
    if (tour.target.status !== 'active') errors.push(`${label} must publish as active.`);
    if (!Array.isArray(tour.target.pricingOptions) || tour.target.pricingOptions.length !== 1 || tour.target.pricingOptions[0].id !== '1') errors.push(`${label} must preserve its stable pricing option ID.`);
    if (tour.sourceImages.length < 8 || new Set(tour.sourceImages).size !== tour.sourceImages.length) errors.push(`${label} source gallery is incomplete or duplicated.`);
    for (const image of tour.sourceImages) {
      try {
        const url = new URL(image);
        if (url.protocol !== 'https:' || url.hostname !== SOURCE_HOST || !url.pathname.startsWith(SOURCE_PREFIX)) errors.push(`${label} image is outside the source allowlist: ${image}`);
      } catch { errors.push(`${label} image URL is invalid: ${image}`); }
    }
  }
  if (manifest.retireRecords.length !== 4) errors.push('Exactly four superseded catalogue records must be retired.');
  const retired = new Set<string>();
  for (const record of manifest.retireRecords) {
    if (!objectId(record.id) || !objectId(record.replacementId) || !isoDate(record.expectedUpdatedAt)) errors.push(`Retirement plan is invalid: ${record.id}`);
    if (retired.has(record.id) || targetIds.has(record.id)) errors.push(`Retirement target is duplicated or canonical: ${record.id}`);
    if (!targetIds.has(record.replacementId)) errors.push(`Retirement replacement is outside the canonical set: ${record.replacementId}`);
    retired.add(record.id);
  }
  return [...new Set(errors)];
}

const sourceAssetId = (tour: SafariTourPlan, index: number): string =>
  `legacy-${String(index + 1).padStart(2, '0')}-${createHash('sha256').update(tour.sourceImages[index]).digest('hex').slice(0, 12)}`;

const expectedMirrorFragment = (tour: SafariTourPlan, index: number): string =>
  `/${MIRROR_ROOT}/${tour.target.pathSlug}/${sourceAssetId(tour, index)}`;

export function isMirroredGallery(tour: SafariTourPlan, images: unknown): images is string[] {
  if (!Array.isArray(images) || images.length !== tour.sourceImages.length) return false;
  return images.every((image, index) => {
    if (typeof image !== 'string') return false;
    try {
      const url = new URL(image);
      return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com'
        && decodeURIComponent(url.pathname).includes(expectedMirrorFragment(tour, index));
    } catch { return false; }
  });
}

export function buildSafariQuadPage(currentPage: PlainObject, manifest: SafariQuadManifest = SAFARI_QUAD_MANIFEST): PlainObject {
  const sections = Array.isArray(currentPage.sections) ? currentPage.sections.map(section => ({ ...recordObject(section) })) : [];
  const tourSection = sections.find(section => section.id === QUAD_SECTION_ID);
  const planning = sections.find(section => section.id === 'planning');
  if (!tourSection || tourSection.type !== 'tours') throw new Error(`Landing page is missing its ${QUAD_SECTION_ID} tour section.`);
  if (!planning || planning.type !== 'content') throw new Error('Landing page is missing its planning content section.');
  Object.assign(tourSection, {
    title: 'Choose from eight quad-bike adventures',
    layout: 'vertical',
    attractionIds: manifest.tours.map(tour => tour.targetId),
  });
  Object.assign(planning, {
    title: 'Plan your desert ride',
    body: '<p>Compare the route, duration and departure times on each tour page. Drivers must be 16 or older. Hotel pickup is included in the advertised area; transfers from other resort areas may cost €5–€10 and are confirmed before booking.</p>',
  });
  return {
    ...currentPage,
    title: 'Hurghada Quad Biking Tours',
    metaTitle: 'Hurghada Quad Biking Tours | Safari Sahara',
    metaDescription: 'Compare eight Safari Sahara quad-bike adventures in Hurghada and Makadi Bay, with current EUR prices, departure times and booking details.',
    body: '<p>Explore Hurghada and Makadi Bay by quad bike. Choose from easy, high-speed, morning, sunset, Sahara Park, stargazing, private and Red Sea coastal adventures.</p>',
    sections,
  };
}

const quadLinks = (manifest: SafariQuadManifest): Array<{ label: string; href: string }> => {
  const labels = [
    'Easy Ride', 'Power Tour', 'Morning Quad Biking', 'Sunset Quad Safari',
    'Half-Day Sahara Park', 'Quad & Stargazing', 'Private Sahara Park', 'Makadi Sea & Camel',
  ];
  return manifest.tours.map((tour, index) => ({ label: labels[index], href: `/${tour.target.pathSlug}` }));
};

export function buildSafariQuadNavigation(current: unknown, manifest: SafariQuadManifest = SAFARI_QUAD_MANIFEST): unknown[] {
  const navigation = Array.isArray(current) ? current.map(item => ({
    ...recordObject(item),
    ...(Array.isArray(recordObject(item).columns) ? { columns: (recordObject(item).columns as unknown[]).map(column => ({ ...recordObject(column), links: Array.isArray(recordObject(column).links) ? [...recordObject(column).links as unknown[]] : [] })) } : {}),
  })) : [];
  const explore = navigation.find(item => String((item as PlainObject).label).toLowerCase() === 'explore safaris') as PlainObject | undefined;
  const columns = Array.isArray(explore?.columns) ? explore.columns as PlainObject[] : [];
  const quad = columns.find(column => String(column.label).toLowerCase() === 'quad biking');
  if (!explore || !quad) throw new Error('Saved menu is missing the Safari Sahara quad-biking mega-menu group.');
  quad.links = quadLinks(manifest);
  return navigationSchema.parse(navigation);
}

const desiredTourFields = (plan: SafariTourPlan, images: string[]): PlainObject => {
  const seo = recordObject(plan.target.seo);
  return { ...plan.target, seo: { ...seo, keywords: Array.isArray(seo.keywords) ? seo.keywords : [] }, images };
};
export function tourMatchesPlan(tour: unknown, plan: SafariTourPlan, images: string[]): boolean {
  const current = recordObject(tour);
  const desired = desiredTourFields(plan, images);
  return PUBLIC_TOUR_FIELDS.every(field => equal(current[field], desired[field]));
}
const retirementMatches = (tour: unknown): boolean => recordObject(tour).status === 'archived' && Boolean(recordObject(tour).archivedAt);

interface LoadedState {
  tenant: InstanceType<typeof Tenant>;
  page: PlainObject;
  targets: Map<string, InstanceType<typeof Attraction>>;
  retirements: Map<string, InstanceType<typeof Attraction>>;
}

async function loadState(manifest: SafariQuadManifest, session?: mongoose.ClientSession): Promise<LoadedState> {
  const tenantQuery = Tenant.findOne({ slug: manifest.tenantSlug });
  if (session) tenantQuery.session(session);
  const tenant = await tenantQuery;
  if (!tenant) throw new Error(`Tenant not found: ${manifest.tenantSlug}`);
  const targetIds = manifest.tours.map(tour => tour.targetId);
  const retireIds = manifest.retireRecords.map(record => record.id);
  const tourQuery = Attraction.find({ _id: { $in: [...targetIds, ...retireIds] } });
  if (session) tourQuery.session(session);
  const tours = await tourQuery;
  if (tours.length !== targetIds.length + retireIds.length) throw new Error('One or more fenced Safari Sahara records are missing.');
  const byId = new Map(tours.map(tour => [String(tour._id), tour]));
  const assertOwned = (id: string): InstanceType<typeof Attraction> => {
    const tour = byId.get(id);
    if (!tour) throw new Error(`Fenced tour not found: ${id}`);
    const tenantIds = (tour.tenantIds || []).map(value => String(value));
    if (String(tour.ownerTenantId || '') !== String(tenant._id) || tenantIds.length !== 1 || tenantIds[0] !== String(tenant._id)) {
      throw new Error(`Refusing a tour outside the single owned Safari Sahara boundary: ${id}`);
    }
    return tour;
  };
  const pageDocument = tenant.customPages?.find(candidate => String((candidate as unknown as { _id: unknown })._id) === manifest.pageId);
  if (!pageDocument) throw new Error(`Landing page not found: ${manifest.pageId}`);
  return {
    tenant,
    page: recordObject(pageDocument),
    targets: new Map(targetIds.map(id => [id, assertOwned(id)])),
    retirements: new Map(retireIds.map(id => [id, assertOwned(id)])),
  };
}

const pageMatches = (state: LoadedState, manifest: SafariQuadManifest): boolean => {
  const desired = buildSafariQuadPage(state.page, manifest);
  return ['title', 'metaTitle', 'metaDescription', 'body', 'sections'].every(field => equal(state.page[field], desired[field]));
};
const navigationMatches = (state: LoadedState, manifest: SafariQuadManifest): boolean =>
  equal(state.tenant.navigation || [], buildSafariQuadNavigation(state.tenant.navigation || [], manifest));

function assertPreimages(state: LoadedState, manifest: SafariQuadManifest): void {
  for (const plan of manifest.tours) {
    const current = state.targets.get(plan.targetId)!;
    if (current.status !== (plan.expectedStatus || 'draft')) throw new Error(`Canonical tour status changed after the migration snapshot: ${plan.target.pathSlug}`);
    if (dateString(current.updatedAt) !== plan.expectedUpdatedAt) throw new Error(`Canonical tour changed after the migration snapshot: ${plan.target.pathSlug}`);
    if (current.pricingOptions?.length !== 1 || current.pricingOptions[0].id !== plan.target.pricingOptions[0].id) throw new Error(`Pricing-option identity changed: ${plan.target.pathSlug}`);
  }
  for (const plan of manifest.retireRecords) {
    const current = state.retirements.get(plan.id)!;
    if (current.status !== (plan.expectedStatus || 'active') || dateString(current.updatedAt) !== plan.expectedUpdatedAt) throw new Error(`Superseded tour changed after the migration snapshot: ${plan.id}`);
  }
  if (Number(state.page.revision || 0) !== manifest.expectedPageRevision) throw new Error('Landing page changed after the migration snapshot.');
  if (Number(state.tenant.navigationRevision || 0) !== manifest.expectedNavigationRevision) throw new Error('Website menu changed after the migration snapshot.');
}

async function sourceBytes(source: string): Promise<{ bytes: Buffer; mimeType: string }> {
  let finalError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(source, { signal: controller.signal, redirect: 'error', headers: { 'User-Agent': 'Safari-Sahara-catalog-migration/1.0' } });
      if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
      const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || '';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error(`Unsupported source media type: ${mimeType || 'missing'}`);
      const declared = Number(response.headers.get('content-length') || 0);
      if (declared > 15 * 1024 * 1024) throw new Error('Source image exceeds 15 MB.');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error('Source image size is invalid.');
      return { bytes, mimeType };
    } catch (error) {
      finalError = error;
      if (attempt < 3) await new Promise(resolveDelay => setTimeout(resolveDelay, attempt * 350));
    } finally { clearTimeout(timeout); }
  }
  throw new Error(`Could not read source image after three attempts: ${finalError instanceof Error ? finalError.message : String(finalError)}`);
}

async function mirrorGallery(plan: SafariTourPlan): Promise<string[]> {
  const folder = `tours/${TENANT_SLUG}/${plan.target.pathSlug}`;
  const results = new Array<string>(plan.sourceImages.length);
  for (let offset = 0; offset < plan.sourceImages.length; offset += 3) {
    await Promise.all(plan.sourceImages.slice(offset, offset + 3).map(async (source, batchIndex) => {
      const index = offset + batchIndex;
      const { bytes, mimeType } = await sourceBytes(source);
      const upload = await uploadBase64Image(
        `data:${mimeType};base64,${bytes.toString('base64')}`,
        folder,
        { publicId: sourceAssetId(plan, index), overwrite: true },
      );
      const url = new URL(upload.url);
      if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !decodeURIComponent(url.pathname).includes(expectedMirrorFragment(plan, index))) {
        throw new Error(`Media provider returned an unexpected asset path for ${plan.target.pathSlug} image ${index + 1}.`);
      }
      results[index] = upload.url;
    }));
    console.log(`[safari-quad-migration] Mirrored ${Math.min(offset + 3, plan.sourceImages.length)}/${plan.sourceImages.length} images for ${plan.target.pathSlug}.`);
  }
  if (!isMirroredGallery(plan, results)) throw new Error(`Mirrored gallery verification failed: ${plan.target.pathSlug}`);
  return results;
}

async function prepareMedia(state: LoadedState, manifest: SafariQuadManifest, apply: boolean): Promise<Map<string, string[]>> {
  const media = new Map<string, string[]>();
  for (const plan of manifest.tours) {
    const current = state.targets.get(plan.targetId)!;
    if (isMirroredGallery(plan, current.images)) {
      media.set(plan.targetId, [...current.images]);
      continue;
    }
    if (apply) media.set(plan.targetId, await mirrorGallery(plan));
  }
  return media;
}

function stateMismatches(state: LoadedState, manifest: SafariQuadManifest, media: Map<string, string[]>): string[] {
  const mismatches: string[] = [];
  for (const plan of manifest.tours) {
    const images = media.get(plan.targetId);
    if (!images) { mismatches.push(`${plan.target.pathSlug}: verified media is missing`); continue; }
    const current = recordObject(state.targets.get(plan.targetId));
    const desired = desiredTourFields(plan, images);
    const fields = PUBLIC_TOUR_FIELDS.filter(field => !equal(current[field], desired[field]));
    if (fields.length) mismatches.push(`${plan.target.pathSlug}: ${fields.join(', ')}`);
  }
  for (const plan of manifest.retireRecords) {
    if (!retirementMatches(state.retirements.get(plan.id))) mismatches.push(`${plan.id}: retirement state`);
  }
  if (!pageMatches(state, manifest)) mismatches.push('landing page');
  if (!navigationMatches(state, manifest)) mismatches.push('website menu');
  return mismatches;
}

async function stateIsComplete(state: LoadedState, manifest: SafariQuadManifest, media: Map<string, string[]>): Promise<boolean> {
  return stateMismatches(state, manifest, media).length === 0;
}

async function validateOperationalState(state: LoadedState, manifest: SafariQuadManifest, session?: mongoose.ClientSession): Promise<void> {
  const targetIds = manifest.tours.map(plan => new Types.ObjectId(plan.targetId));
  const retireIds = manifest.retireRecords.map(plan => new Types.ObjectId(plan.id));
  const bookingsQuery = Booking.countDocuments({ attractionId: { $in: [...targetIds, ...retireIds] } });
  const availabilityQuery = Availability.find({ attractionId: { $in: targetIds } }).select('attractionId timeSlots allDayBooked');
  const categoryQuery = Category.exists({ slug: 'adventures', isActive: true });
  if (session) { bookingsQuery.session(session); availabilityQuery.session(session); categoryQuery.session(session); }
  const [bookings, availability, category] = await Promise.all([bookingsQuery, availabilityQuery.lean(), categoryQuery]);
  if (bookings !== 0) throw new Error('A fenced canonical or superseded record gained a booking; refusing to change catalogue identity or pricing.');
  if (!category) throw new Error('The active adventures category is unavailable.');
  for (const row of availability) {
    const booked = Number(row.allDayBooked || 0) + (row.timeSlots || []).reduce((sum, slot) => sum + Number(slot.booked || 0), 0);
    if (booked > 0) throw new Error(`A canonical tour gained booked inventory: ${row.attractionId}`);
  }
}

export function buildSafariQuadBackup(state: LoadedState, manifest: SafariQuadManifest): PlainObject {
  return {
    schemaVersion: 1,
    tenantSlug: manifest.tenantSlug,
    expectedManifestSnapshot: manifest.tours.map(plan => ({ targetId: plan.targetId, expectedUpdatedAt: plan.expectedUpdatedAt })),
    tenant: {
      id: String(state.tenant._id),
      navigation: serializable(state.tenant.navigation || []),
      navigationRevision: state.tenant.navigationRevision || 0,
      page: serializable(state.page),
    },
    canonicalTours: manifest.tours.map(plan => serializable(recordObject(state.targets.get(plan.targetId)))),
    retiredTours: manifest.retireRecords.map(plan => serializable(recordObject(state.retirements.get(plan.id)))),
  };
}

function writeStableJson(file: string, payload: PlainObject): void {
  const target = resolve(file);
  mkdirSync(dirname(target), { recursive: true });
  const content = `${JSON.stringify(payload, null, 2)}\n`;
  if (existsSync(target)) {
    const existing = JSON.parse(readFileSync(target, 'utf8')) as PlainObject;
    if (!isDeepStrictEqual(existing, payload)) throw new Error(`Refusing to replace a different evidence file: ${target}`);
    return;
  }
  writeFileSync(target, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}

function receiptPayload(mode: 'applied' | 'already-complete', manifest: SafariQuadManifest, media: Map<string, string[]>, completedAt = new Date()): PlainObject {
  return {
    mode,
    completedAt: completedAt.toISOString(),
    tenant: TENANT_SLUG,
    tours: manifest.tours.map(plan => ({
      id: plan.targetId,
      path: plan.target.pathSlug,
      priceFrom: plan.target.priceFrom,
      currency: plan.target.currency,
      images: media.get(plan.targetId)?.length || 0,
    })),
    retiredRecords: manifest.retireRecords.map(plan => plan.id),
    landingPage: { id: manifest.pageId, revision: manifest.expectedPageRevision + 1, tourCount: manifest.tours.length },
    menuRevision: manifest.expectedNavigationRevision + 1,
  };
}

function writeReceipt(file: string, payload: PlainObject): void {
  const target = resolve(file);
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target)) {
    const existing = JSON.parse(readFileSync(target, 'utf8')) as PlainObject;
    const stable = (value: PlainObject): PlainObject => Object.fromEntries(Object.entries(value).filter(([key]) => !['mode', 'completedAt'].includes(key)));
    if (!isDeepStrictEqual(stable(existing), stable(payload))) throw new Error(`Refusing to replace a receipt for a different migration state: ${target}`);
    return;
  }
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}

export async function applySafariQuadDatabaseMigration(
  manifest: SafariQuadManifest,
  media: Map<string, string[]>,
  now: Date = new Date(),
): Promise<{ changed: boolean; state: LoadedState }> {
  const session = await mongoose.startSession();
  let changed = false;
  try {
    await session.withTransaction(async () => {
      const state = await loadState(manifest, session);
      if (await stateIsComplete(state, manifest, media)) return;
      assertPreimages(state, manifest);
      await validateOperationalState(state, manifest, session);

      for (const plan of manifest.tours) {
        const tour = state.targets.get(plan.targetId)!;
        const images = media.get(plan.targetId);
        if (!images || !isMirroredGallery(plan, images)) throw new Error(`Verified media is missing: ${plan.target.pathSlug}`);
        const update = desiredTourFields(plan, images);
        const candidate = {
          ...recordObject(tour), ...update,
          tenantIds: (tour.tenantIds || []).map(value => String(value)),
        };
        const validation = createAttractionSchema.safeParse(candidate);
        if (!validation.success) {
          throw new Error(`${plan.target.pathSlug} is not publishable: ${validation.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
        }
        Object.assign(tour, update);
        await tour.save({ session, validateModifiedOnly: false });
      }

      for (const plan of manifest.retireRecords) {
        const tour = state.retirements.get(plan.id)!;
        if (retirementMatches(tour)) continue;
        tour.statusBeforeArchive = 'active';
        tour.status = 'archived';
        tour.archivedAt = now;
        await tour.save({ session, validateModifiedOnly: true });
      }

      const pageDocument = state.tenant.customPages?.find(candidate => String((candidate as unknown as { _id: unknown })._id) === manifest.pageId);
      if (!pageDocument) throw new Error('Landing page disappeared during the migration transaction.');
      const desiredPage = buildSafariQuadPage(recordObject(pageDocument), manifest);
      Object.assign(pageDocument, desiredPage, { revision: manifest.expectedPageRevision + 1 });
      state.tenant.navigation = buildSafariQuadNavigation(state.tenant.navigation || [], manifest) as never;
      state.tenant.navigationRevision = manifest.expectedNavigationRevision + 1;
      state.tenant.markModified('customPages');
      state.tenant.markModified('navigation');
      await state.tenant.save({ session, validateModifiedOnly: false });
      changed = true;
    });
  } finally { await session.endSession(); }
  const state = await loadState(manifest);
  const mismatches = stateMismatches(state, manifest, media);
  if (mismatches.length) throw new Error(`Post-transaction verification did not match the complete migration manifest: ${mismatches.join('; ')}`);
  return { changed, state };
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find(argument => argument.startsWith(prefix))?.slice(prefix.length);
}

export async function main(): Promise<void> {
  const errors = validateSafariQuadManifest();
  if (errors.length) throw new Error(`Safari Sahara migration manifest is invalid:\n- ${errors.join('\n- ')}`);
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const auditLive = args.has('--audit-live');
  if (apply && auditLive) throw new Error('Choose either --apply or --audit-live.');
  if (!apply && !auditLive) {
    console.log(JSON.stringify({
      mode: 'manifest-only', tenant: TENANT_SLUG, source: SAFARI_QUAD_MANIFEST.sourceLandingUrl,
      tours: SAFARI_QUAD_MANIFEST.tours.length,
      images: SAFARI_QUAD_MANIFEST.tours.reduce((total, tour) => total + tour.sourceImages.length, 0),
      prices: SAFARI_QUAD_MANIFEST.tours.map(tour => ({ path: tour.target.pathSlug, from: tour.target.priceFrom, currency: tour.target.currency })),
      safeguards: ['no database connection', 'no media upload', 'exact record timestamps', 'page/menu revisions', 'single database transaction', 'pre-mutation backup'],
    }, null, 2));
    return;
  }
  if (!args.has(`--confirm-tenant=${TENANT_SLUG}`)) throw new Error(`Tenant fence missing. Pass --confirm-tenant=${TENANT_SLUG}.`);
  const backupFile = argValue('backup-file');
  const receiptFile = argValue('receipt-file');
  if (apply && (!backupFile || !receiptFile)) throw new Error('Apply mode requires --backup-file and --receipt-file.');

  await connectDatabase();
  try {
    const before = await loadState(SAFARI_QUAD_MANIFEST);
    const existingMedia = await prepareMedia(before, SAFARI_QUAD_MANIFEST, false);
    if (await stateIsComplete(before, SAFARI_QUAD_MANIFEST, existingMedia)) {
      const receipt = receiptPayload('already-complete', SAFARI_QUAD_MANIFEST, existingMedia);
      if (receiptFile) writeReceipt(receiptFile, receipt);
      console.log(JSON.stringify(receipt, null, 2));
      return;
    }
    assertPreimages(before, SAFARI_QUAD_MANIFEST);
    await validateOperationalState(before, SAFARI_QUAD_MANIFEST);
    if (!apply) {
      console.log(JSON.stringify({
        mode: 'live-audit', observedAt: new Date().toISOString(), tenant: TENANT_SLUG,
        canonicalDrafts: SAFARI_QUAD_MANIFEST.tours.length,
        mirroredGalleries: existingMedia.size,
        imagesToMirror: SAFARI_QUAD_MANIFEST.tours.filter(plan => !existingMedia.has(plan.targetId)).reduce((total, plan) => total + plan.sourceImages.length, 0),
        pageRevision: Number(before.page.revision || 0), navigationRevision: before.tenant.navigationRevision || 0,
        result: 'ready-to-apply',
      }, null, 2));
      return;
    }

    writeStableJson(backupFile!, buildSafariQuadBackup(before, SAFARI_QUAD_MANIFEST));
    const media = await prepareMedia(before, SAFARI_QUAD_MANIFEST, true);
    const result = await applySafariQuadDatabaseMigration(SAFARI_QUAD_MANIFEST, media);
    const receipt = receiptPayload(result.changed ? 'applied' : 'already-complete', SAFARI_QUAD_MANIFEST, media);
    writeReceipt(receiptFile!, receipt);
    console.log(JSON.stringify(receipt, null, 2));
  } finally { await disconnectDatabase(); }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[safari-quad-migration] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
