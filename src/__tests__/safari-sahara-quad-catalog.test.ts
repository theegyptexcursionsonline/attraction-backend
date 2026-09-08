import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Attraction } from '../models/Attraction';
import { Category } from '../models/Category';
import { Tenant } from '../models/Tenant';
import {
  SAFARI_QUAD_MANIFEST,
  applySafariQuadDatabaseMigration,
  buildSafariQuadBackup,
  buildSafariQuadNavigation,
  buildSafariQuadPage,
  isMirroredGallery,
  type SafariQuadManifest,
  type SafariTourPlan,
  validateSafariQuadManifest,
} from '../scripts/migrate-safari-sahara-quad-catalog';

jest.setTimeout(180_000);

let mongo: MongoMemoryReplSet;

const cloneManifest = (): SafariQuadManifest => JSON.parse(JSON.stringify(SAFARI_QUAD_MANIFEST)) as SafariQuadManifest;
const baseTenant = {
  slug: 'safari-sahara-hurghada',
  name: 'Safari Sahara Hurghada',
  domain: 'safari-sahara.invalid',
  logo: '/logo.png',
  theme: { primaryColor: '#000000', secondaryColor: '#ffffff', accentColor: '#d4a843' },
  defaultCurrency: 'EUR',
  defaultLanguage: 'en',
  supportedLanguages: ['en'],
  flatUrls: true,
};
const basePublishedTour = (id: string, slug: string, tenantId: Types.ObjectId) => ({
  _id: new Types.ObjectId(id),
  slug,
  pathSlug: slug,
  title: 'Superseded quad tour',
  shortDescription: 'Superseded source-backed quad tour.',
  description: 'A complete record used to verify safe archival.',
  images: ['https://res.cloudinary.com/test/image/upload/v1/retired.jpg'],
  category: 'adventures',
  destination: { city: 'Hurghada', country: 'Egypt', coordinates: { lat: 27.2579, lng: 33.8116 } },
  duration: '3 Hours',
  languages: ['English'],
  priceFrom: 20,
  currency: 'EUR',
  pricingOptions: [{ id: '1', name: 'Standard', price: 20, pricingModel: 'per-person', timeSlots: [{ id: 'departure-1', label: '08:00', startTime: '08:00', endTime: '11:00' }] }],
  highlights: [], inclusions: [], exclusions: [], itinerary: [],
  instantConfirmation: true, mobileTicket: true,
  tenantIds: [tenantId], ownerTenantId: tenantId, status: 'active' as const,
});
const mirroredGallery = (plan: SafariTourPlan): string[] => plan.sourceImages.map((source, index) => {
  const id = `legacy-${String(index + 1).padStart(2, '0')}-${createHash('sha256').update(source).digest('hex').slice(0, 12)}`;
  return `https://res.cloudinary.com/test/image/upload/v1/attractions-network/tours/safari-sahara-hurghada/${plan.target.pathSlug}/${id}.jpg`;
});

async function seedMigrationState(): Promise<{ manifest: SafariQuadManifest; media: Map<string, string[]>; tenantId: Types.ObjectId }> {
  const manifest = cloneManifest();
  const tenantId = new Types.ObjectId();
  await Category.create({ slug: 'adventures', name: 'Adventures', icon: 'compass', isActive: true });
  await Tenant.create({
    ...baseTenant,
    _id: tenantId,
    navigationRevision: manifest.expectedNavigationRevision,
    navigation: [
      { label: 'Explore safaris', href: '/tours', columns: [
        { label: 'Find your adventure', links: [{ label: 'All tours', href: '/tours' }] },
        { label: 'Quad biking', links: [{ label: 'Old sunset', href: '/hurghada-sunset-desert-safari-trip-by-quad-bike-old' }] },
      ] },
      { label: 'About us', href: '/about-us', columns: [] },
    ],
    customPages: [{
      _id: new Types.ObjectId(manifest.pageId),
      slug: 'hurghada-quad-biking-tours',
      title: 'Quad biking',
      body: '<p>Old landing copy.</p>',
      revision: manifest.expectedPageRevision,
      sections: [
        { id: 'quad-tours', type: 'tours', title: 'Old tours', layout: 'vertical', attractionIds: [] },
        { id: 'planning', type: 'content', title: 'Planning', body: '<p>Old planning copy.</p>' },
        { id: 'more-pages', type: 'pages', title: 'More', layout: 'horizontal', pageIds: [] },
      ],
    }],
  });

  const canonical = await Attraction.create(manifest.tours.map((plan, index) => ({
    _id: new Types.ObjectId(plan.targetId),
    slug: `safari-sahara-canonical-${index + 1}`,
    pathSlug: plan.target.pathSlug,
    title: plan.target.title,
    destination: { city: 'Hurghada', country: 'Egypt', coordinates: { lat: 27.2579, lng: 33.8116 } },
    pricingOptions: [{ id: '1' }],
    tenantIds: [tenantId], ownerTenantId: tenantId, status: 'draft',
  })));
  for (const plan of manifest.tours) {
    const saved = canonical.find(tour => String(tour._id) === plan.targetId)!;
    plan.expectedUpdatedAt = saved.updatedAt.toISOString();
  }

  const retired = await Attraction.create(manifest.retireRecords.map((plan, index) => basePublishedTour(plan.id, `superseded-quad-${index + 1}`, tenantId)));
  for (const plan of manifest.retireRecords) {
    const saved = retired.find(tour => String(tour._id) === plan.id)!;
    plan.expectedUpdatedAt = saved.updatedAt.toISOString();
  }
  const media = new Map(manifest.tours.map(plan => [plan.targetId, mirroredGallery(plan)]));
  return { manifest, media, tenantId };
}

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  const localVersion = systemBinary ? spawnSync(systemBinary, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([\d.]+)/)?.[1] : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: localVersion || '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('safari_quad_catalog'));
  await Promise.all([Tenant.init(), Attraction.init(), Category.init()]);
});

afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  process.env.URL_NAMESPACE_WRITES_READY = 'true';
  await Promise.all([Tenant.collection.deleteMany({}), Attraction.collection.deleteMany({}), Category.collection.deleteMany({})]);
});

describe('Safari Sahara quad catalogue manifest', () => {
  it('pins eight unique source paths, EUR prices, stable option IDs and all 90 source images', () => {
    expect(validateSafariQuadManifest()).toEqual([]);
    expect(SAFARI_QUAD_MANIFEST.tours).toHaveLength(8);
    expect(SAFARI_QUAD_MANIFEST.tours.reduce((count, plan) => count + plan.sourceImages.length, 0)).toBe(90);
    expect(SAFARI_QUAD_MANIFEST.tours.every(plan => plan.target.currency === 'EUR' && plan.target.pricingOptions[0].id === '1')).toBe(true);
  });

  it('rejects an off-domain image and duplicate public path', () => {
    const manifest = cloneManifest();
    manifest.tours[0].sourceImages[0] = 'https://untrusted.invalid/image.jpg';
    manifest.tours[1].target.pathSlug = manifest.tours[0].target.pathSlug;
    const errors = validateSafariQuadManifest(manifest);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('outside the source allowlist'),
      expect.stringContaining('public path is duplicated'),
    ]));
  });

  it('keeps the landing order exact and replaces only the quad mega-menu links', () => {
    const manifest = cloneManifest();
    const page = buildSafariQuadPage({ sections: [
      { id: 'quad-tours', type: 'tours', layout: 'horizontal', attractionIds: ['old'] },
      { id: 'planning', type: 'content', body: 'old' },
      { id: 'more-pages', type: 'pages', pageIds: ['page-1'] },
    ] }, manifest);
    const section = (page.sections as Array<Record<string, unknown>>).find(item => item.id === 'quad-tours')!;
    expect(section.attractionIds).toEqual(manifest.tours.map(plan => plan.targetId));
    expect((page.sections as Array<Record<string, unknown>>).find(item => item.id === 'more-pages')).toMatchObject({ pageIds: ['page-1'] });

    const navigation = [{ label: 'Explore safaris', href: '/tours', columns: [
      { label: 'Quad biking', links: [{ label: 'Old', href: '/old' }] },
      { label: 'Jeep & buggy', links: [{ label: 'Jeep', href: '/jeep' }] },
    ] }, { label: 'Contact us', href: '/contact-us', columns: [] }];
    const updated = buildSafariQuadNavigation(navigation, manifest) as typeof navigation;
    expect(updated[0].columns[0].links).toHaveLength(8);
    expect(updated[0].columns[0].links.map(link => link.href)).toEqual(manifest.tours.map(plan => `/${plan.target.pathSlug}`));
    expect(updated[0].columns[1]).toEqual(navigation[0].columns[1]);
    expect(updated[1]).toEqual(navigation[1]);
  });

  it('recognizes only the exact ordered deterministic Cloudinary gallery', () => {
    const plan = cloneManifest().tours[0];
    const gallery = mirroredGallery(plan);
    expect(isMirroredGallery(plan, gallery)).toBe(true);
    expect(isMirroredGallery(plan, [...gallery].reverse())).toBe(false);
    expect(isMirroredGallery(plan, gallery.slice(1))).toBe(false);
  });
});

describe('Safari Sahara quad catalogue database migration', () => {
  it('publishes eight records, retires four, updates landing/menu atomically and is retry-safe', async () => {
    const { manifest, media } = await seedMigrationState();
    const result = await applySafariQuadDatabaseMigration(manifest, media, new Date('2026-09-08T19:00:00.000Z'));
    expect(result.changed).toBe(true);
    const backupShape = buildSafariQuadBackup(result.state, manifest);
    expect((backupShape.canonicalTours as Array<{ _id: string }>).map(tour => tour._id)).toEqual(manifest.tours.map(plan => plan.targetId));
    expect((backupShape.retiredTours as Array<{ _id: string }>).map(tour => tour._id)).toEqual(manifest.retireRecords.map(plan => plan.id));
    expect(((backupShape.tenant as { page: { _id: string } }).page)._id).toBe(manifest.pageId);

    const canonical = await Attraction.find({ _id: { $in: manifest.tours.map(plan => plan.targetId) } }).sort({ sortOrder: 1 }).lean();
    expect(canonical).toHaveLength(8);
    expect(canonical.every(tour => tour.status === 'active' && tour.currency === 'EUR')).toBe(true);
    expect(canonical.map(tour => tour.pathSlug)).toEqual(manifest.tours.map(plan => plan.target.pathSlug));
    expect(canonical.map(tour => tour.images.length)).toEqual(manifest.tours.map(plan => plan.sourceImages.length));

    const retired = await Attraction.find({ _id: { $in: manifest.retireRecords.map(plan => plan.id) } }).lean();
    expect(retired.every(tour => tour.status === 'archived' && tour.archivedAt?.toISOString() === '2026-09-08T19:00:00.000Z')).toBe(true);
    const tenant = await Tenant.findOne({ slug: manifest.tenantSlug }).lean();
    const page = tenant!.customPages!.find(item => String((item as unknown as { _id: unknown })._id) === manifest.pageId)!;
    expect(page.revision).toBe(manifest.expectedPageRevision + 1);
    const tourSection = page.sections!.find(section => section.id === 'quad-tours') as { attractionIds?: string[] };
    expect(tourSection.attractionIds).toEqual(manifest.tours.map(plan => plan.targetId));
    expect(tenant!.navigationRevision).toBe(manifest.expectedNavigationRevision + 1);

    const retry = await applySafariQuadDatabaseMigration(manifest, media, new Date('2026-09-08T20:00:00.000Z'));
    expect(retry.changed).toBe(false);
  });

  it('aborts without partial writes when a canonical record changed after the snapshot', async () => {
    const { manifest, media } = await seedMigrationState();
    await Attraction.updateOne({ _id: manifest.tours[4].targetId }, { $set: { title: 'A newer editorial title' } });

    await expect(applySafariQuadDatabaseMigration(manifest, media)).rejects.toThrow('changed after the migration snapshot');
    expect(await Attraction.countDocuments({ _id: { $in: manifest.tours.map(plan => plan.targetId) }, status: 'active' })).toBe(0);
    expect(await Attraction.countDocuments({ _id: { $in: manifest.retireRecords.map(plan => plan.id) }, status: 'archived' })).toBe(0);
    const tenant = await Tenant.findOne({ slug: manifest.tenantSlug }).lean();
    expect(tenant!.navigationRevision).toBe(manifest.expectedNavigationRevision);
    expect(tenant!.customPages![0].revision).toBe(manifest.expectedPageRevision);
  });

  it('refuses a record outside the single owned tenant boundary before any write', async () => {
    const { manifest, media } = await seedMigrationState();
    await Attraction.updateOne({ _id: manifest.tours[0].targetId }, { $set: { ownerTenantId: new Types.ObjectId() } });

    await expect(applySafariQuadDatabaseMigration(manifest, media)).rejects.toThrow('outside the single owned Safari Sahara boundary');
    expect(await Attraction.countDocuments({ _id: { $in: manifest.tours.map(plan => plan.targetId) }, status: 'active' })).toBe(0);
    expect(await Attraction.countDocuments({ _id: { $in: manifest.retireRecords.map(plan => plan.id) }, status: 'archived' })).toBe(0);
  });
});
