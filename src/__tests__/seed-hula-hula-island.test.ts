import {
  HULA_HULA_FACILITY_INDEX,
  HULA_HULA_FACILITY_PAGES,
  HULA_HULA_HERO_SOURCES,
  HULA_HULA_OPEN_DECISIONS,
  HULA_HULA_SOURCE_LOGO,
  HULA_HULA_TENANT,
  HULA_HULA_TOURS,
  RESERVED_PAGE_SLUGS,
  catalogueCollision,
  facilityPageId,
  isApprovedSourceAsset,
  validateHulaHulaIslandPlan,
} from '../scripts/seed-hula-hula-island';

describe('Hula Hula Island seed contract', () => {
  it('is a valid launch package on the hulahula design with no domain claimed', () => {
    expect(validateHulaHulaIslandPlan()).toEqual([]);
    expect(HULA_HULA_TENANT.designMode).toBe('hulahula');
    expect(HULA_HULA_TENANT.status).toBe('active');
    expect(HULA_HULA_TENANT.domainMigrated).toBe(false);
    expect(HULA_HULA_TENANT.customDomainStatus).toBe('unconfigured');
    expect(HULA_HULA_TENANT).not.toHaveProperty('customDomain');
    expect(HULA_HULA_TENANT.flatUrls).toBe(false);
  });

  it('takes no card payment, ships no bundle and keeps booking alerts off the operator inbox', () => {
    expect(HULA_HULA_TENANT.paymentSettings).toEqual({
      enabledGateways: ['pay-later'],
      ownPaymentGateway: false,
      stripe: { enabled: false },
    });
    expect(HULA_HULA_TENANT.bundleSettings.mode).toBe('off');
    expect(HULA_HULA_TENANT.notificationSettings.bookingEmail).toBe('theegyptexcursionsonline@gmail.com');
  });

  it("uses the venue's own published contact points and the agreed palette", () => {
    expect(HULA_HULA_TENANT.contactInfo).toEqual(expect.objectContaining({
      email: 'admin@queenmagicorp.com',
      phone: '+20 10 70997763',
      whatsapp: '+201070997763',
      address: 'Big Giftun Island, Hurghada, Red Sea, Egypt, 84517',
    }));
    expect(HULA_HULA_TENANT.theme).toEqual({ primaryColor: '#121014', secondaryColor: '#E8A33D', accentColor: '#D96A6A' });
    expect(HULA_HULA_TENANT.fonts).toEqual({ heading: 'Playfair Display', body: 'Inter' });
  });

  it('routes the navigation the designs are built against', () => {
    const hrefs = HULA_HULA_TENANT.navigation.map((item) => item.href);
    expect(hrefs).toEqual(expect.arrayContaining(['/experiences', '/facilities', '/destinations', '/about', '/contact']));
    expect(HULA_HULA_TENANT.aiSettings.searchWidget.placeholder)
      .toBe('Search beach access, cruises, speedboat and semi-submarine trips');
  });

  it('collects only from network destinations the published listings name', () => {
    expect(HULA_HULA_TENANT.pickupDestinationSlugs).toEqual(['makadi-bay', 'sahl-hasheesh', 'el-gouna', 'soma-bay']);
  });

  it('carries the nine live catalogue products at their published EGP prices', () => {
    expect(HULA_HULA_TENANT.defaultCurrency).toBe('EGP');
    expect(HULA_HULA_TOURS.map((tour) => [
      tour.slug,
      tour.pricingOptions[0].price,
      tour.pricingOptions[0].childPrice ?? null,
      tour.pricingOptions[0].pricingModel,
    ])).toEqual([
      ['hula-hula-island-beach-access', 560, null, 'per-person'],
      ['hula-hula-island-cruise-with-lunch-and-snorkelling', 1570, 785, 'per-person'],
      ['hula-hula-island-sunset-cruise-with-lunch-and-snorkelling', 1570, 785, 'per-person'],
      ['hula-hula-island-semi-submarine', 1730, 865, 'per-person'],
      ['hula-hula-island-speedboat-morning-escape', 2360, null, 'per-person'],
      ['hula-hula-island-speedboat-sunset', 2360, null, 'per-person'],
      ['hula-hula-island-dolphin-experience-by-speedboat', 2880, null, 'per-person'],
      ['hula-hula-island-private-speedboat-morning', 15000, null, 'per-booking'],
      ['hula-hula-island-private-speedboat-sunset', 15000, null, 'per-booking'],
    ]);
    // The product the operator currently lists at zero belongs to the other
    // venue and is not carried into either catalogue.
    expect(HULA_HULA_TOURS.every((tour) => tour.pricingOptions.every((option) => option.price > 0))).toBe(true);
  });

  it('shows a child fare only on the three products that publish one, at exactly half', () => {
    const withChild = HULA_HULA_TOURS.filter((tour) => tour.pricingOptions[0].childPrice !== undefined);
    expect(withChild.map((tour) => tour.slug)).toEqual([
      'hula-hula-island-cruise-with-lunch-and-snorkelling',
      'hula-hula-island-sunset-cruise-with-lunch-and-snorkelling',
      'hula-hula-island-semi-submarine',
    ]);
    for (const tour of withChild) {
      expect(tour.pricingOptions[0].childPrice).toBe(tour.pricingOptions[0].price / 2);
      expect(tour.openDecisions.some((item) => /child age band/i.test(item))).toBe(true);
    }
    // No under-five allowance is published by the operator, so none is set.
    for (const tour of HULA_HULA_TOURS) {
      for (const option of tour.pricingOptions) expect(option).not.toHaveProperty('infantPrice');
      if (option0Missing(tour.pricingOptions[0].childPrice)) {
        expect(tour.openDecisions.some((item) => /child fare/i.test(item))).toBe(true);
      }
    }
  });

  it('publishes a departure only where the operator publishes one, and says so otherwise', () => {
    const departures = Object.fromEntries(HULA_HULA_TOURS.map((tour) => [tour.slug, tour.entryWindows.map((w) => w.startTime)]));
    expect(departures).toEqual({
      'hula-hula-island-beach-access': [],
      'hula-hula-island-cruise-with-lunch-and-snorkelling': ['09:30'],
      'hula-hula-island-sunset-cruise-with-lunch-and-snorkelling': ['11:30'],
      'hula-hula-island-semi-submarine': [],
      'hula-hula-island-speedboat-morning-escape': ['09:00'],
      'hula-hula-island-speedboat-sunset': ['13:00'],
      'hula-hula-island-dolphin-experience-by-speedboat': [],
      'hula-hula-island-private-speedboat-morning': [],
      'hula-hula-island-private-speedboat-sunset': ['13:00'],
    });
    for (const tour of HULA_HULA_TOURS.filter((item) => !item.entryWindows.length)) {
      expect(tour.openDecisions.some((item) => /departure|daily hours/i.test(item))).toBe(true);
    }
  });

  it('claims hotel pickup only on the one product whose name includes the transfer', () => {
    const withPickup = HULA_HULA_TOURS.filter((tour) => tour.hasHotelPickup);
    expect(withPickup.map((tour) => tour.slug)).toEqual(['hula-hula-island-cruise-with-lunch-and-snorkelling']);
    expect(withPickup[0].inclusions).toContain('Hotel pickup and drop-off');
    for (const tour of HULA_HULA_TOURS.filter((item) => !item.hasHotelPickup)) {
      expect(tour.exclusions.some((item) => /transfer/i.test(item))).toBe(true);
    }
  });

  it('never names the other venue and always says the ticket does not admit to it', () => {
    for (const tour of HULA_HULA_TOURS) {
      const copy = JSON.stringify([
        tour.title, tour.shortDescription, tour.description, tour.highlights,
        tour.itinerary, tour.inclusions, tour.exclusions, tour.needToKnow, tour.seo,
      ]);
      expect(copy).not.toMatch(/paradise/i);
      expect(copy).toMatch(/does not admit/);
    }
    for (const page of [HULA_HULA_FACILITY_INDEX, ...HULA_HULA_FACILITY_PAGES]) {
      expect(JSON.stringify(page)).not.toMatch(/paradise/i);
    }
  });

  it('never publishes a marketplace brand, a rating or a claim the operator has not made', () => {
    for (const tour of HULA_HULA_TOURS) {
      const copy = JSON.stringify([tour.description, tour.shortDescription, tour.highlights, tour.needToKnow]).toLowerCase();
      expect(copy).not.toMatch(/getyourguide|tripadvisor|wanderlog/);
      expect(copy).not.toMatch(/free cancellation|years of experience|\baward|guaranteed/);
      expect(tour).not.toHaveProperty('rating');
      expect(tour).not.toHaveProperty('reviewCount');
    }
  });

  it('mirrors only the two client images filed under this venue, and nothing ambiguous', () => {
    expect(isApprovedSourceAsset(HULA_HULA_SOURCE_LOGO)).toBe(true);
    expect(HULA_HULA_HERO_SOURCES).toEqual([
      'https://www.queenmagicorp.com/web/image/5980-473d1497/hulapp.jpg',
      'https://www.queenmagicorp.com/web/image/5981-efa4558d/Hula%20P.jpg',
    ]);
    expect(HULA_HULA_HERO_SOURCES.every(isApprovedSourceAsset)).toBe(true);
    // The corporate file that names both venues at once is in neither site.
    expect(JSON.stringify([HULA_HULA_HERO_SOURCES, HULA_HULA_TOURS, HULA_HULA_FACILITY_PAGES]))
      .not.toMatch(/HULAPARADISE/i);
    // This venue has no recoverable site of its own, so no archive source is allowed.
    expect(isApprovedSourceAsset('https://web.archive.org/web/20231031104206id_/https://www.paradiseislandhurghada.com/wp-content/uploads/Assets/a.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://www.queenmagicorp.com/web/image/5980-473d1497/hulapp.jpg')).toBe(true);
    expect(isApprovedSourceAsset('http://www.queenmagicorp.com/web/image/5980-473d1497/hulapp.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://www.queenmagicorp.com.evil.test/web/image/1-a/x.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://www.queenmagicorp.com/tours/x.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://www.queenmagicorp.com/web/image/5980-473d1497/x.jpg?w=10')).toBe(false);
    expect(isApprovedSourceAsset('not a url')).toBe(false);
  });

  it('leaves every tour and facility without a photograph and names the gap instead of faking one', () => {
    for (const tour of HULA_HULA_TOURS) {
      expect(tour.sourceImages).toEqual([]);
      expect(tour.openDecisions.some((item) => /photograph/i.test(item))).toBe(true);
    }
    for (const page of HULA_HULA_FACILITY_PAGES) expect(page.heroImage).toBe('');
    expect(HULA_HULA_OPEN_DECISIONS.some((item) => /photograph/i.test(item))).toBe(true);
    expect(HULA_HULA_OPEN_DECISIONS.some((item) => /wordmark/i.test(item))).toBe(true);
    expect(HULA_HULA_OPEN_DECISIONS.some((item) => /custom domain/i.test(item))).toBe(true);
  });

  it('ships only the facilities the sources confirm, on slugs the storefront can route', () => {
    expect(HULA_HULA_FACILITY_PAGES.map((page) => page.slug)).toEqual([
      'beach-access',
      'hula-hula-water-sports',
      'hula-hula-massage',
      'island-lunch',
    ]);
    expect(HULA_HULA_FACILITY_INDEX.slug).toBe('facilities');
    for (const page of [HULA_HULA_FACILITY_INDEX, ...HULA_HULA_FACILITY_PAGES]) {
      expect(RESERVED_PAGE_SLUGS.has(page.slug)).toBe(false);
      expect(facilityPageId(page.slug)).toMatch(/^[0-9a-f]{24}$/);
    }
    // The bare slug the storefront already routes is avoided by the prefix.
    expect(RESERVED_PAGE_SLUGS.has('water-sports')).toBe(true);
    const ids = [HULA_HULA_FACILITY_INDEX, ...HULA_HULA_FACILITY_PAGES].map((page) => facilityPageId(page.slug));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('refuses to touch a tour slug another site owns or lists', () => {
    const slug = 'hula-hula-island-beach-access';
    expect(catalogueCollision([])).toBeNull();
    expect(catalogueCollision([{ slug, ownedByHulaHula: true, hasOwner: true, listedByOtherTenant: false }])).toBeNull();
    expect(catalogueCollision([{ slug, ownedByHulaHula: false, hasOwner: true, listedByOtherTenant: false }]))
      .toBe(`Refusing cross-tenant catalogue overwrite: ${slug}.`);
    expect(catalogueCollision([{ slug, ownedByHulaHula: true, hasOwner: true, listedByOtherTenant: true }]))
      .toBe(`Refusing cross-tenant catalogue overwrite: ${slug}.`);
    expect(catalogueCollision([{ slug, ownedByHulaHula: false, hasOwner: false, listedByOtherTenant: false }]))
      .toBe(`Refusing to adopt an unowned catalogue record: ${slug}.`);
  });

  it('records what the operator still has to answer before launch', () => {
    for (const tour of HULA_HULA_TOURS) {
      expect(tour.openDecisions.length).toBeGreaterThanOrEqual(3);
      expect(tour.sourceUrls.length).toBeGreaterThan(0);
    }
    const all = [...HULA_HULA_OPEN_DECISIONS, ...HULA_HULA_TOURS.flatMap((tour) => tour.openDecisions)].join(' ');
    expect(all).toMatch(/national park fee/i);
    expect(all).toMatch(/transfer zones/i);
    expect(all).toMatch(/cancellation policy/i);
    // The beach-access product has two conflicting shapes on the operator's own site.
    expect(all).toMatch(/1\.5-hour stay at 650 EGP/);
  });
});

/** A product with no published child fare must name that as an open question. */
function option0Missing(childPrice: number | undefined): boolean {
  return childPrice === undefined;
}
