import mongoose, { Types } from 'mongoose';
import { spawnSync } from 'child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Destination } from '../models/Destination';
import { AttractionTranslation } from '../models/AttractionTranslation';
import { DestinationTranslation } from '../models/DestinationTranslation';
import { TenantPresentationTranslation } from '../models/TenantPresentationTranslation';
import { translationSourceTemplate } from '../services/attractionLocalization.service';
import { sourceMatches, sourceSnapshot } from '../services/localizationSourceSnapshot.service';
import { localizationDigest, planLocalization } from '../services/localizationMigration.service';
import { currentPresentationRows, ownedPresentationSource, presentationSourceSnapshot, presentationSourceTemplate, type PresentationRow } from '../services/tenantPresentationLocalization.service';
import { exportTenantPresentationSource, planTenantPresentation, presentationDigest } from '../services/tenantPresentationMigration.service';
import { executeSitePlan, planSite, presentationExport, siteApprovalDigest, type SitePayload } from '../scripts/network-arabic/publish';
import { applyLanguages, languagesApprovalDigest, languagesArguments, planLanguages, withArabic } from '../scripts/set-arabic-languages';
import { checkArguments } from '../scripts/check-network-arabic-apply';
import { applyArguments } from '../scripts/apply-network-arabic';

jest.setTimeout(180000);
let mongo: MongoMemoryReplSet;
const SLUG = 'shaab-abu-nugar';
const tenantId = new Types.ObjectId();
const tourId = new Types.ObjectId();
const destinationId = new Types.ObjectId();
const at = new Date('2026-11-02T05:45:13.333Z');
const nav = ['Home', 'Trips', 'About', 'FAQ', 'Contact'].map((label, index) => ({ label, href: ['/', '/trips', '/about', '/faq', '/contact'][index] }));
const tenantDoc = { _id: tenantId, slug: SLUG, name: 'Shaab Abu Nugar', domain: `${SLUG}.foxesnetwork.com`, status: 'active', designMode: 'desertfox', defaultLanguage: 'en', supportedLanguages: ['en'], tagline: 'Dolphin House days out of Hurghada', description: 'First paragraph.\n\nSecond paragraph.', seoSettings: { metaTitle: 'Title', metaDescription: 'Description', keywords: ['one'] }, navigation: nav, heroImages: ['https://res.cloudinary.com/x/a.png'], pickupDestinationSlugs: ['hurghada'], createdAt: at, updatedAt: at };
const tourDoc = { _id: tourId, slug: 'abn-morning', pathSlug: 'morning', title: 'Morning', shortDescription: 'Short', description: 'One.\n\nTwo.', duration: '5 hours', cancellationPolicy: '', images: ['https://res.cloudinary.com/x/t.jpg'], imageAltTexts: [{ url: 'https://res.cloudinary.com/x/t.jpg', alt: 'A boat' }], tenantIds: [tenantId], ownerTenantId: tenantId, status: 'active', category: 'water-activities', destination: { city: 'Hurghada', country: 'Egypt' }, priceFrom: 30, currency: 'USD', pricingOptions: [{ id: 'opt', name: 'Morning cruise', description: 'Breakfast', price: 30, timeSlots: [] }], addons: [], entryWindows: [{ label: '08:30' }], itinerary: [{ title: 'Hotel pickup', description: 'The car collects you.' }], gettingThere: [], highlights: ['Two sessions'], inclusions: ['Breakfast'], exclusions: [], participantRequirements: [], whatToBring: [], needToKnow: [], accessibility: [], meetingPoint: { instructions: 'The team confirms your pickup time.' }, seo: { metaTitle: 'Morning', metaDescription: 'A morning boat' }, createdAt: at, updatedAt: at };
const destinationDoc = { _id: destinationId, slug: 'hurghada', name: 'Hurghada', country: 'Egypt', description: 'Red Sea', shortDescription: 'Sea', highlights: ['Reefs'], bestTimeToVisit: 'All year', tags: ['beach'], isActive: true, createdAt: at, updatedAt: at };

/** Every non-empty English string becomes its own Arabic stand-in; presentation text stays on one line. */
const arabize = (value: any): any => typeof value === 'string' ? (value.trim() ? `ع ${value}` : value) : Array.isArray(value) ? value.map(arabize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, ['id', 'index', 'url', 'key', 'type'].includes(key) ? child : arabize(child)])) : value;
const oneLine = (value: any): any => typeof value === 'string' ? value.replace(/\n+/g, ' ') : Array.isArray(value) ? value.map(oneLine) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, oneLine(child)])) : value;

async function payload(): Promise<SitePayload> {
  const tenant: any = await Tenant.findById(tenantId).lean();
  const tour: any = await Attraction.findById(tourId).lean();
  const destination: any = await Destination.findById(destinationId).lean();
  const presentationEnglish = presentationSourceTemplate('tenant', tenant);
  return {
    version: 1, batch: 'b14a', locale: 'ar',
    tenant: { id: String(tenantId), slug: SLUG, domain: `${SLUG}.foxesnetwork.com` },
    presentationSha256: presentationExport(tenant, 'shaababunugar.com').sha256,
    presentation: [{ kind: 'tenant', sourceId: String(tenantId), sourceDigest: presentationDigest(presentationSourceSnapshot('tenant', tenant)), english: presentationEnglish, arabic: oneLine(arabize(presentationEnglish)) }],
    tours: [{ id: String(tourId), sourceSlug: tour.slug, slug: `${tour.slug}-ar`, sourceUpdatedAt: tour.updatedAt.toISOString(), sourceDigest: localizationDigest(sourceSnapshot('tour', tour)), english: translationSourceTemplate(tour), arabic: arabize(translationSourceTemplate(tour)) }],
    destinations: [{ id: String(destinationId), sourceSlug: 'hurghada', slug: 'hurghada-ar', sourceUpdatedAt: destination.updatedAt.toISOString(), sourceDigest: localizationDigest(sourceSnapshot('destination', destination)), english: { name: 'Hurghada' }, arabic: { name: 'الغردقة', country: 'مصر', description: 'البحر الأحمر', shortDescription: 'بحر', highlights: ['شعاب'], bestTimeToVisit: 'طوال العام', tags: ['شاطئ'] } }],
  };
}
const strip = ({ _id, createdAt, updatedAt, ...rest }: any) => rest;

beforeAll(async () => {
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  const systemBinary = located.status === 0 ? located.stdout.trim() : undefined;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14', ...(systemBinary ? { systemBinary } : {}) } });
  await mongoose.connect(mongo.getUri('network_arabic'));
  await Promise.all([Tenant.init(), Attraction.init(), Destination.init(), AttractionTranslation.init(), DestinationTranslation.init(), TenantPresentationTranslation.init()]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  for (const model of [Tenant, Attraction, Destination, AttractionTranslation, DestinationTranslation, TenantPresentationTranslation] as any[]) await model.collection.deleteMany({});
  await Tenant.collection.insertOne(tenantDoc as any);
  await Attraction.collection.insertOne(tourDoc as any);
  await Destination.collection.insertOne(destinationDoc as any);
});

it('plans exactly the rows the repository planners would write for the same site', async () => {
  const site = await payload();
  // The repository planners need a custom domain; give the site one for the comparison only.
  await Tenant.updateOne({ _id: tenantId }, { $set: { customDomain: 'shaababunugar.com' } }, { timestamps: false });
  const exportFor = { tenantId: String(tenantId), tenantSlug: SLUG, domain: 'shaababunugar.com', tours: [{ id: String(tourId), sourceUpdatedAt: at.toISOString() }], destinations: [{ id: String(destinationId), sourceUpdatedAt: at.toISOString() }] };
  const repo = await planLocalization(exportFor, { ...exportFor, sourceSha256: 'a'.repeat(64), locales: ['ar'], tours: site.tours.map((tour) => ({ id: tour.id, locale: 'ar', slug: tour.slug, sourceUpdatedAt: tour.sourceUpdatedAt, content: tour.arabic })), destinations: site.destinations.map((item) => ({ id: item.id, locale: 'ar', slug: item.slug, sourceUpdatedAt: item.sourceUpdatedAt, content: item.arabic })) }, 'a'.repeat(64));
  const tenant: any = await Tenant.findById(tenantId).lean();
  const sourceExport = exportTenantPresentationSource(tenant);
  const repoPresentation = await planTenantPresentation(sourceExport, { tenantId: String(tenantId), tenantSlug: SLUG, domain: 'shaababunugar.com', sourceSha256: presentationDigest(sourceExport), locales: ['ar', 'de', 'ru', 'fr'], rows: ['ar', 'de', 'ru', 'fr'].map((locale) => ({ kind: 'tenant', sourceId: String(tenantId), locale, content: site.presentation[0].arabic })) });
  await Tenant.updateOne({ _id: tenantId }, { $unset: { customDomain: '' } }, { timestamps: false });

  const plan = await planSite(site);
  expect(plan.mismatches).toEqual([]);
  expect(plan.approval).toMatch(/^[a-f\d]{64}$/);
  const ours = (kind: string) => plan.rows.find((row) => row.kind === kind)!;
  expect(strip(ours('tour').after)).toEqual(strip(repo.rows.find((row) => row.kind === 'tour')!.after));
  expect(strip(ours('destination').after)).toEqual(strip(repo.rows.find((row) => row.kind === 'destination')!.after));
  expect(strip(ours('presentation').after)).toEqual(strip(repoPresentation.rows.find((row) => row.filter.locale === 'ar')!.after));
  expect(plan.rows.every((row) => row.write && row.sourceMatched && row.before === null)).toBe(true);
});

it('refuses a site that has its own domain, and reports source drift without an approval digest', async () => {
  const site = await payload();
  await Tenant.updateOne({ _id: tenantId }, { $set: { customDomain: 'shaababunugar.com' } }, { timestamps: false });
  await expect(planSite(site)).rejects.toThrow('its own domain');
  await Tenant.updateOne({ _id: tenantId }, { $unset: { customDomain: '' } }, { timestamps: false });
  await Attraction.collection.updateOne({ _id: tourId }, { $set: { title: 'Changed', updatedAt: new Date() } });
  const plan = await planSite(site);
  expect(plan.approval).toBe('');
  expect(plan.mismatches).toEqual(['tour abn-morning: source changed after export']);
  await expect(executeSitePlan(plan, site, 'f'.repeat(64))).rejects.toThrow('not the approved one');
});

it('publishes only with the approved digest, as rows the public read path accepts, and is idempotent', async () => {
  const site = await payload();
  const plan = await planSite(site);
  await expect(executeSitePlan(plan, site, 'e'.repeat(64))).rejects.toThrow('not the approved one');
  expect(await AttractionTranslation.countDocuments({})).toBe(0);
  expect(siteApprovalDigest(await planSite(site))).toBe(plan.approval);

  const receipt = await executeSitePlan(plan, site, plan.approval);
  expect(receipt).toMatchObject({ site: SLUG, changed: true, verified: true, rows: 3 });
  const tour: any = await Attraction.findById(tourId).lean();
  const row: any = await AttractionTranslation.findOne({ tenantId, attractionId: tourId, locale: 'ar' }).lean();
  expect(row).toMatchObject({ slug: 'abn-morning-ar', status: 'published' });
  expect(sourceMatches('tour', tour, row)).toBe(true);
  expect(await DestinationTranslation.countDocuments({ tenantId, locale: 'ar', slug: 'hurghada-ar', status: 'published' })).toBe(1);
  const tenant: any = await Tenant.findById(tenantId).lean();
  expect(tenant.__presentationPublicationFence).toBeUndefined();
  const rows = (await TenantPresentationTranslation.find({ tenantId }).lean()) as unknown as PresentationRow[];
  expect(currentPresentationRows(tenantId, 'tenant', ownedPresentationSource(tenant, 'tenant', tenantId), rows).map((item) => item.locale)).toEqual(['ar']);

  const again = await planSite(site);
  expect(again.rows.every((item) => !item.write)).toBe(true);
  expect(again.approval).not.toBe(plan.approval);
  expect(await executeSitePlan(again, site, again.approval)).toMatchObject({ changed: false, rows: 0 });
});

it('stops inside the transaction when a source moves between the plan and the publication', async () => {
  const site = await payload();
  const plan = await planSite(site);
  await Attraction.collection.updateOne({ _id: tourId }, { $set: { title: 'Moved', updatedAt: new Date() } });
  await expect(executeSitePlan(plan, site, plan.approval)).rejects.toThrow('a tour changed since the plan');
  expect(await AttractionTranslation.countDocuments({})).toBe(0);
  expect(await TenantPresentationTranslation.countDocuments({})).toBe(0);
});

it('switches Arabic on only for a site whose every record is published in Arabic, with the approved digest', async () => {
  const before = await planLanguages(SLUG);
  expect(before).toMatchObject({ ready: false, change: true, before: ['en'], after: ['en', 'ar'] });
  expect(before.missing).toEqual(['tour abn-morning', 'destination hurghada', 'presentation tenant']);
  const site = await payload();
  const plan = await planSite(site);
  await executeSitePlan(plan, site, plan.approval);
  const ready = await planLanguages(SLUG);
  expect(ready).toMatchObject({ ready: true, change: true, missing: [] });
  expect(languagesApprovalDigest('b14a', [ready])).toMatch(/^[a-f\d]{64}$/);
  await Tenant.updateOne({ _id: tenantId }, { $set: { supportedLanguages: ['en', 'de'] } });
  await expect(applyLanguages(ready)).rejects.toThrow('changed since the dry run');
  await Tenant.updateOne({ _id: tenantId }, { $set: { supportedLanguages: ['en'] } });
  expect(await applyLanguages(ready)).toEqual({ site: SLUG, changed: true });
  expect(((await Tenant.findById(tenantId).lean()) as any).supportedLanguages).toEqual(['en', 'ar']);
  expect((await planLanguages(SLUG)).change).toBe(false);
});

it('reads only the arguments each step documents', () => {
  expect(checkArguments(['--group=b14a'])).toEqual({ groups: ['b14a'] });
  expect(checkArguments(['--group=b14a,b14b'])).toEqual({ groups: ['b14a', 'b14b'] });
  expect(() => checkArguments(['--group=b14a,b14a'])).toThrow();
  expect(() => checkArguments(['--group=b99'])).toThrow();
  expect(applyArguments(['--group=b14b', `--approve=${'a'.repeat(64)}`])).toEqual({ group: 'b14b', approve: 'a'.repeat(64) });
  expect(() => applyArguments(['--group=b14b'])).toThrow();
  expect(languagesArguments(['--group=b14a'])).toEqual({ group: 'b14a', apply: false, approve: '' });
  expect(languagesArguments(['--group=b14a', '--apply', `--approve=${'b'.repeat(64)}`])).toEqual({ group: 'b14a', apply: true, approve: 'b'.repeat(64) });
  expect(() => languagesArguments(['--group=b14a', '--apply'])).toThrow();
  expect(withArabic(['en'])).toEqual(['en', 'ar']);
  expect(withArabic(['en', 'ar'])).toEqual(['en', 'ar']);
});
