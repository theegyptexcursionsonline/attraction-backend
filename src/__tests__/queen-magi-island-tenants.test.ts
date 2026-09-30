import mongoose from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import {
  PARADISE_FACILITY_INDEX,
  PARADISE_FACILITY_PAGES,
  PARADISE_TENANT,
  PARADISE_TOURS,
  buildCustomPages as buildParadisePages,
  buildTourDocument as buildParadiseTour,
} from '../scripts/seed-paradise-island';
import {
  HULA_HULA_FACILITY_INDEX,
  HULA_HULA_FACILITY_PAGES,
  HULA_HULA_TENANT,
  HULA_HULA_TOURS,
  buildCustomPages as buildHulaPages,
  buildTourDocument as buildHulaTour,
} from '../scripts/seed-hula-hula-island';
import {
  QUEEN_MAGI_ISLAND_IMAGE_PLANS,
  sceneNeedsQualifier,
  validateIslandImagePlan,
} from '../scripts/generate-queen-magi-island-images';

const baseTenant = {
  slug: 'design-mode-probe',
  name: 'Design Mode Probe',
  domain: 'design-mode-probe.foxesnetwork.com',
  logo: 'https://res.cloudinary.com/demo/image/upload/logo.png',
};

/** The model is the authority on which designs exist; validate without a database. */
const designModeError = (designMode: string): string | undefined =>
  new Tenant({ ...baseTenant, designMode }).validateSync()?.errors?.designMode?.message;

describe('Queen Magi island design modes', () => {
  it('accepts the two new island designs', () => {
    expect(designModeError('paradise')).toBeUndefined();
    expect(designModeError('hulahula')).toBeUndefined();
  });

  it('still rejects a design that does not exist', () => {
    expect(designModeError('hula-hula')).toBeDefined();
    expect(designModeError('paradise-island')).toBeDefined();
    expect(designModeError('not-a-design')).toBeDefined();
  });

  it('leaves the designs already in use untouched', () => {
    for (const mode of ['default', 'nautical', 'savanna', 'premium', 'meridian', 'depth']) {
      expect(designModeError(mode)).toBeUndefined();
    }
  });

  it('is the design each seed asks for', () => {
    expect(designModeError(PARADISE_TENANT.designMode)).toBeUndefined();
    expect(designModeError(HULA_HULA_TENANT.designMode)).toBeUndefined();
    expect(PARADISE_TENANT.designMode).not.toBe(HULA_HULA_TENANT.designMode);
  });
});

describe('Queen Magi island tenant separation', () => {
  it('gives the two venues separate sites on separate addresses', () => {
    expect(PARADISE_TENANT.slug).toBe('paradise-island-hurghada');
    expect(HULA_HULA_TENANT.slug).toBe('hula-hula-island');
    expect(PARADISE_TENANT.slug).not.toBe(HULA_HULA_TENANT.slug);
    expect(PARADISE_TENANT.domain).not.toBe(HULA_HULA_TENANT.domain);
    expect(PARADISE_TENANT.name).not.toBe(HULA_HULA_TENANT.name);
  });

  it('never lets the two catalogues collide on the global slug index', () => {
    const paradise = PARADISE_TOURS.map((tour) => tour.slug);
    const hula = HULA_HULA_TOURS.map((tour) => tour.slug);
    const shared = paradise.filter((slug) => hula.includes(slug));
    expect(shared).toEqual([]);
    // The venue prefix is what makes that guarantee structural rather than lucky.
    expect(paradise.every((slug) => slug.startsWith('paradise-'))).toBe(true);
    expect(hula.every((slug) => slug.startsWith('hula-hula-'))).toBe(true);
    expect(new Set([...paradise, ...hula]).size).toBe(paradise.length + hula.length);
  });

  it('keeps the two venues out of each other’s customer copy', () => {
    expect(JSON.stringify(PARADISE_TOURS)).not.toMatch(/hula/i);
    expect(JSON.stringify(HULA_HULA_TOURS)).not.toMatch(/paradise island|paradise beach/i);
    for (const tour of [...PARADISE_TOURS, ...HULA_HULA_TOURS]) {
      expect(JSON.stringify([tour.description, tour.needToKnow])).toMatch(/does not admit/);
    }
  });

  it('keeps every page slug clear of the tours on the same site', () => {
    // A site's pages and its tours share one public URL namespace.
    const paradiseTours = new Set(PARADISE_TOURS.map((tour) => tour.slug));
    for (const page of [PARADISE_FACILITY_INDEX, ...PARADISE_FACILITY_PAGES]) {
      expect(paradiseTours.has(page.slug)).toBe(false);
    }
    const hulaTours = new Set(HULA_HULA_TOURS.map((tour) => tour.slug));
    for (const page of [HULA_HULA_FACILITY_INDEX, ...HULA_HULA_FACILITY_PAGES]) {
      expect(hulaTours.has(page.slug)).toBe(false);
    }
  });

  it('separates the page namespaces the two sites publish', () => {
    const paradisePages = [PARADISE_FACILITY_INDEX, ...PARADISE_FACILITY_PAGES].map((page) => page.slug);
    const hulaPages = [HULA_HULA_FACILITY_INDEX, ...HULA_HULA_FACILITY_PAGES].map((page) => page.slug);
    // Pages are scoped to their tenant, so only the shared index name repeats.
    expect(paradisePages.filter((slug) => hulaPages.includes(slug))).toEqual(['facilities']);
    expect(new Set(paradisePages).size).toBe(paradisePages.length);
    expect(new Set(hulaPages).size).toBe(hulaPages.length);
  });

  it('sells both venues in EGP with pay-later only and no bundle', () => {
    for (const tenant of [PARADISE_TENANT, HULA_HULA_TENANT]) {
      expect(tenant.defaultCurrency).toBe('EGP');
      expect(tenant.paymentSettings.enabledGateways).toEqual(['pay-later']);
      expect(tenant.paymentSettings.stripe.enabled).toBe(false);
      expect(tenant.bundleSettings.mode).toBe('off');
      expect(tenant.domainMigrated).toBe(false);
      expect(tenant.notificationSettings.bookingEmail).toBe('theegyptexcursionsonline@gmail.com');
    }
  });
});

describe('Queen Magi island seed payloads against the real schemas', () => {
  const mirrored = 'https://res.cloudinary.com/demo/image/upload/v1/x.jpg';

  const cases = [
    {
      label: 'Paradise Island',
      tenant: PARADISE_TENANT as Record<string, unknown>,
      pages: buildParadisePages(() => mirrored),
      pageCount: 1 + PARADISE_FACILITY_PAGES.length,
      tours: PARADISE_TOURS.map((tour, index) => ({ slug: tour.slug, build: (id: unknown) => buildParadiseTour(tour, index, [mirrored, mirrored, mirrored], id) })),
    },
    {
      label: 'Hula Hula Island',
      tenant: HULA_HULA_TENANT as Record<string, unknown>,
      pages: buildHulaPages(),
      pageCount: 1 + HULA_HULA_FACILITY_PAGES.length,
      // This venue ships without imagery; the empty gallery must still validate.
      tours: HULA_HULA_TOURS.map((tour, index) => ({ slug: tour.slug, build: (id: unknown) => buildHulaTour(tour, index, [], id) })),
    },
  ];

  it.each(cases)('$label writes a tenant the schema accepts, pages and all', ({ tenant, pages, pageCount }) => {
    const document = new Tenant({
      ...tenant,
      logo: mirrored,
      logoDark: mirrored,
      favicon: mirrored,
      heroImages: [mirrored],
      customPages: pages,
    });
    expect(document.validateSync()?.errors).toBeUndefined();

    // Read the cast subdocuments back the way the database stores them.
    type StoredPage = { _id: unknown; slug: string; sections?: { pageIds: unknown[] }[] };
    const stored = (document.toObject() as { customPages?: StoredPage[] }).customPages ?? [];
    expect(stored).toHaveLength(pageCount);
    // The index page links the facility pages by identifier on the first write.
    const index = stored.find((page) => page.slug === 'facilities')!;
    const linked = (index.sections?.[0]?.pageIds ?? []).map(String);
    const others = stored.filter((page) => page.slug !== 'facilities').map((page) => String(page._id));
    expect(linked.sort()).toEqual(others.sort());
  });

  it('never wipes a facility image a later image run added', () => {
    const generated = 'https://res.cloudinary.com/demo/image/upload/v1/attractions-network/tours/hula-hula-island/page-island-lunch.jpg';
    const carried = buildHulaPages([{ slug: 'island-lunch', heroImage: generated, heroImageAlt: 'A buffet lunch under shade' }]);
    expect(carried.find((page) => page.slug === 'island-lunch')).toMatchObject({
      heroImage: generated,
      heroImageAlt: 'A buffet lunch under shade',
    });
    // A page nothing has filled still ships without an image rather than a borrowed one.
    expect(carried.find((page) => page.slug === 'beach-access')).not.toHaveProperty('heroImage');
    expect(buildHulaPages().every((page) => !page.heroImage)).toBe(true);

    // On the venue with recovered photography, the real image still wins.
    const real = 'https://res.cloudinary.com/demo/image/upload/v1/pages/paradise-beach.jpg';
    const paradise = buildParadisePages(() => real, [{ slug: 'paradise-beach', heroImage: generated }]);
    expect(paradise.find((page) => page.slug === 'paradise-beach')).toMatchObject({ heroImage: real });
  });

  it.each(cases)('$label writes catalogue records the schema accepts', ({ tours }) => {
    const tenantId = new mongoose.Types.ObjectId();
    for (const tour of tours) {
      const document = new Attraction(tour.build(tenantId));
      expect({ slug: tour.slug, errors: document.validateSync()?.errors }).toEqual({ slug: tour.slug, errors: undefined });
      expect(document.currency).toBe('EGP');
      expect(document.status).toBe('active');
      expect(String(document.ownerTenantId)).toBe(String(tenantId));
      expect(document.tenantIds.map(String)).toEqual([String(tenantId)]);
      expect(document.priceFrom).toBeGreaterThan(0);
    }
  });
});

describe('Queen Magi island generated-image plan', () => {
  it('is a valid plan for both sites', () => {
    expect(validateIslandImagePlan()).toEqual([]);
    expect(QUEEN_MAGI_ISLAND_IMAGE_PLANS.map((plan) => plan.tenantSlug))
      .toEqual(['paradise-island-hurghada', 'hula-hula-island']);
  });

  it('plans three to four site headers and covers every gallery it targets', () => {
    for (const plan of QUEEN_MAGI_ISLAND_IMAGE_PLANS) {
      expect(plan.heroScenes.length).toBeGreaterThanOrEqual(3);
      expect(plan.heroScenes.length).toBeLessThanOrEqual(4);
      expect(plan.heroTarget).toBeGreaterThanOrEqual(plan.heroScenes.length);
      for (const tour of plan.tours) expect(tour.scenes.length).toBeGreaterThan(0);
    }
  });

  it('fills the venue that has no photography and only tops up the one that has some', () => {
    const paradise = QUEEN_MAGI_ISLAND_IMAGE_PLANS.find((plan) => plan.tenantSlug === 'paradise-island-hurghada')!;
    const hula = QUEEN_MAGI_ISLAND_IMAGE_PLANS.find((plan) => plan.tenantSlug === 'hula-hula-island')!;
    // Every product without a photograph is covered; the recovered venue needs no page images.
    expect(hula.tours.map((tour) => tour.slug).sort()).toEqual(HULA_HULA_TOURS.map((tour) => tour.slug).sort());
    expect(hula.facilities.map((item) => item.slug).sort()).toEqual(HULA_HULA_FACILITY_PAGES.map((page) => page.slug).sort());
    expect(paradise.facilities).toEqual([]);
    expect(paradise.tours.map((tour) => tour.slug).sort()).toEqual(PARADISE_TOURS.map((tour) => tour.slug).sort());
  });

  it('keeps each site’s assets and targets inside its own namespace', () => {
    for (const plan of QUEEN_MAGI_ISLAND_IMAGE_PLANS) {
      expect(plan.folder).toContain(plan.tenantSlug);
      expect(plan.urlMarker).toContain(plan.tenantSlug);
      const otherPrefix = plan.tenantSlug === 'hula-hula-island' ? 'paradise-' : 'hula-hula-';
      expect(plan.tours.every((tour) => !tour.slug.startsWith(otherPrefix))).toBe(true);
    }
  });

  it('never asks for a real venue, vessel, person, brand or any text', () => {
    const scenes = QUEEN_MAGI_ISLAND_IMAGE_PLANS.flatMap((plan) => [
      ...plan.heroScenes,
      ...plan.tours.flatMap((tour) => tour.scenes),
      ...plan.facilities.map((item) => item.scene),
    ]);
    expect(scenes.length).toBeGreaterThan(0);
    for (const scene of scenes) {
      expect(scene.length).toBeGreaterThanOrEqual(80);
      // A scene may never name either venue, the operator, or a real place.
      expect(scene).not.toMatch(/hula|paradise island|paradise beach|queen magi|orange bay/i);
      // Anything that could carry a brand, a vessel name or a face says so itself.
      expect(sceneNeedsQualifier(scene)).toBe(false);
    }
    // The guard is real: a scene with a boat in it and no qualifier is refused.
    expect(sceneNeedsQualifier('A yacht at anchor off a low sandy island in flat early light, seen from the water.')).toBe(true);
    expect(sceneNeedsQualifier('A generic yacht at anchor off a low sandy island in flat early light.')).toBe(false);
    expect(sceneNeedsQualifier('Pale sand and clear shallow water along an empty island shore at midday.')).toBe(false);
  });
});
