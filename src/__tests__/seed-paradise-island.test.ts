import {
  PARADISE_FACILITY_INDEX,
  PARADISE_FACILITY_PAGES,
  PARADISE_HERO_SOURCES,
  PARADISE_SOURCE_LOGO,
  PARADISE_TENANT,
  PARADISE_TOURS,
  RESERVED_PAGE_SLUGS,
  catalogueCollision,
  facilityPageId,
  isApprovedSourceAsset,
  validateParadiseIslandPlan,
} from '../scripts/seed-paradise-island';

describe('Paradise Island seed contract', () => {
  it('is a valid launch package on the paradise design with no domain claimed', () => {
    expect(validateParadiseIslandPlan()).toEqual([]);
    expect(PARADISE_TENANT.designMode).toBe('paradise');
    expect(PARADISE_TENANT.status).toBe('active');
    expect(PARADISE_TENANT.domainMigrated).toBe(false);
    expect(PARADISE_TENANT.customDomainStatus).toBe('unconfigured');
    expect(PARADISE_TENANT).not.toHaveProperty('customDomain');
    expect(PARADISE_TENANT.flatUrls).toBe(false);
  });

  it('takes no card payment, ships no bundle and keeps booking alerts off the operator inbox', () => {
    expect(PARADISE_TENANT.paymentSettings).toEqual({
      enabledGateways: ['pay-later'],
      ownPaymentGateway: false,
      stripe: { enabled: false },
    });
    expect(PARADISE_TENANT.bundleSettings.mode).toBe('off');
    expect(PARADISE_TENANT.notificationSettings.bookingEmail).toBe('theegyptexcursionsonline@gmail.com');
  });

  it("uses the operator's published contact points and the agreed palette", () => {
    expect(PARADISE_TENANT.contactInfo).toEqual(expect.objectContaining({
      email: 'admin@queenmagicorp.com',
      phone: '+20 107 099 7804',
      whatsapp: '+201070997804',
    }));
    expect(PARADISE_TENANT.theme).toEqual({ primaryColor: '#0B4F5C', secondaryColor: '#F2E7D5', accentColor: '#D96C4A' });
    expect(PARADISE_TENANT.fonts).toEqual({ heading: 'Playfair Display', body: 'Inter' });
  });

  it('routes the navigation the designs are built against', () => {
    const hrefs = PARADISE_TENANT.navigation.map((item) => item.href);
    expect(hrefs).toEqual(expect.arrayContaining(['/experiences', '/facilities', '/destinations', '/about', '/contact']));
    expect(PARADISE_TENANT.aiSettings.searchWidget.placeholder).toBe('Search island cruises, snorkelling and dolphin trips');
  });

  it('collects only from network destinations the published listings name', () => {
    expect(PARADISE_TENANT.pickupDestinationSlugs).toEqual(['makadi-bay', 'sahl-hasheesh', 'el-gouna', 'soma-bay']);
  });

  it('carries the two live catalogue products at their published EGP prices', () => {
    expect(PARADISE_TENANT.defaultCurrency).toBe('EGP');
    expect(PARADISE_TOURS.map((tour) => [tour.slug, tour.pricingOptions.map((option) => option.price)])).toEqual([
      ['paradise-island-cruise-with-lunch-and-snorkelling', [2100]],
      ['paradise-island-dolphin-experience-by-speedboat', [2950]],
    ]);
    for (const tour of PARADISE_TOURS) {
      for (const option of tour.pricingOptions) {
        expect(option.price).toBeGreaterThan(0);
        // The operator publishes no child fare for either product.
        expect(option.childPrice).toBeUndefined();
      }
      expect(tour.openDecisions.some((item) => /child fare/i.test(item))).toBe(true);
    }
  });

  it('publishes a departure only where the operator publishes one, and says so otherwise', () => {
    const byslug = Object.fromEntries(PARADISE_TOURS.map((tour) => [tour.slug, tour]));
    expect(byslug['paradise-island-cruise-with-lunch-and-snorkelling'].entryWindows)
      .toEqual([{ label: 'Morning departure', startTime: '09:30', endTime: '16:30' }]);
    expect(byslug['paradise-island-dolphin-experience-by-speedboat'].entryWindows).toEqual([]);
    expect(byslug['paradise-island-dolphin-experience-by-speedboat'].openDecisions.some((item) => /departure/i.test(item))).toBe(true);
  });

  it('claims hotel pickup on no product, because none of them include the transfer', () => {
    expect(PARADISE_TOURS.every((tour) => tour.hasHotelPickup === false)).toBe(true);
    for (const tour of PARADISE_TOURS) {
      expect(tour.exclusions.some((item) => /transfer/i.test(item))).toBe(true);
    }
  });

  it('never names the other venue and always says the ticket does not admit to it', () => {
    for (const tour of PARADISE_TOURS) {
      const copy = JSON.stringify([
        tour.title, tour.shortDescription, tour.description, tour.highlights,
        tour.itinerary, tour.inclusions, tour.exclusions, tour.needToKnow, tour.seo,
      ]);
      expect(copy).not.toMatch(/hula/i);
      expect(copy).toMatch(/does not admit/);
    }
    for (const page of [PARADISE_FACILITY_INDEX, ...PARADISE_FACILITY_PAGES]) {
      expect(JSON.stringify(page)).not.toMatch(/hula/i);
    }
  });

  it('never publishes a marketplace brand, a rating or a claim the operator has not made', () => {
    for (const tour of PARADISE_TOURS) {
      const copy = JSON.stringify([tour.description, tour.shortDescription, tour.highlights, tour.needToKnow]).toLowerCase();
      expect(copy).not.toMatch(/getyourguide|tripadvisor|wanderlog/);
      expect(copy).not.toMatch(/free cancellation|years of experience|\bbest\b|\baward|guaranteed/);
      // No rating or review count is carried over from any marketplace.
      expect(tour).not.toHaveProperty('rating');
      expect(tour).not.toHaveProperty('reviewCount');
    }
  });

  it('only mirrors client-owned imagery through a raw archive replay or the operator media library', () => {
    expect(isApprovedSourceAsset(PARADISE_SOURCE_LOGO)).toBe(true);
    expect(PARADISE_HERO_SOURCES.length).toBeGreaterThanOrEqual(3);
    expect(PARADISE_HERO_SOURCES.every(isApprovedSourceAsset)).toBe(true);
    expect(PARADISE_TOURS.every((tour) => tour.sourceImages.length >= 3 && tour.sourceImages.every(isApprovedSourceAsset))).toBe(true);

    // The raw replay form only: it returns the stored bytes with no redirect.
    expect(isApprovedSourceAsset('https://web.archive.org/web/20231031104206id_/https://www.paradiseislandhurghada.com/wp-content/uploads/Assets/a.jpg')).toBe(true);
    // Any other archive form is refused: the banner form, a short timestamp, a live fetch.
    expect(isApprovedSourceAsset('https://web.archive.org/web/20231031104206im_/https://www.paradiseislandhurghada.com/wp-content/uploads/Assets/a.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://web.archive.org/web/20231031104206/https://www.paradiseislandhurghada.com/wp-content/uploads/Assets/a.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://web.archive.org/web/20251008id_/https://www.paradiseislandhurghada.com/wp-content/uploads/Assets/a.jpg')).toBe(false);
    // The lost domain is hostile now; it is never fetched directly.
    expect(isApprovedSourceAsset('https://www.paradiseislandhurghada.com/wp-content/uploads/Assets/a.jpg')).toBe(false);
    // Archive replay of anything other than the venue's own media library.
    expect(isApprovedSourceAsset('https://web.archive.org/web/20231031104206id_/https://evil.test/a.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://web.archive.org/web/20231031104206id_/https://www.paradiseislandhurghada.com/a.jpg')).toBe(false);
    // Operator media library rules.
    expect(isApprovedSourceAsset('https://www.queenmagicorp.com/web/image/5977-358421c9/PARADISE01.jpg')).toBe(true);
    expect(isApprovedSourceAsset('http://www.queenmagicorp.com/web/image/5977-358421c9/PARADISE01.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://www.queenmagicorp.com.evil.test/web/image/1-a/x.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://www.queenmagicorp.com/web/image/5977-358421c9/x.jpg?w=10')).toBe(false);
    expect(isApprovedSourceAsset('not a url')).toBe(false);
  });

  it('ships the six published island facilities behind an index page the storefront can route', () => {
    expect(PARADISE_FACILITY_PAGES.map((page) => page.slug)).toEqual([
      'paradise-beach',
      'paradise-island-restaurant',
      'tropicana-bar',
      'ice-cream-and-waffles-zone',
      'kids-area',
      'shisha-corner',
    ]);
    expect(PARADISE_FACILITY_INDEX.slug).toBe('facilities');
    for (const page of [PARADISE_FACILITY_INDEX, ...PARADISE_FACILITY_PAGES]) {
      expect(RESERVED_PAGE_SLUGS.has(page.slug)).toBe(false);
      expect(isApprovedSourceAsset(page.heroImage)).toBe(true);
      expect(facilityPageId(page.slug)).toMatch(/^[0-9a-f]{24}$/);
    }
    // Stable, distinct page identifiers so the index can link them on the first write.
    const ids = [PARADISE_FACILITY_INDEX, ...PARADISE_FACILITY_PAGES].map((page) => facilityPageId(page.slug));
    expect(new Set(ids).size).toBe(ids.length);
    expect(facilityPageId('paradise-beach')).toBe(facilityPageId('paradise-beach'));
  });

  it('refuses to touch a tour slug another site owns or lists', () => {
    const slug = 'paradise-island-cruise-with-lunch-and-snorkelling';
    expect(catalogueCollision([])).toBeNull();
    expect(catalogueCollision([{ slug, ownedByParadise: true, hasOwner: true, listedByOtherTenant: false }])).toBeNull();
    expect(catalogueCollision([{ slug, ownedByParadise: false, hasOwner: true, listedByOtherTenant: false }]))
      .toBe(`Refusing cross-tenant catalogue overwrite: ${slug}.`);
    expect(catalogueCollision([{ slug, ownedByParadise: true, hasOwner: true, listedByOtherTenant: true }]))
      .toBe(`Refusing cross-tenant catalogue overwrite: ${slug}.`);
    expect(catalogueCollision([{ slug, ownedByParadise: false, hasOwner: false, listedByOtherTenant: false }]))
      .toBe(`Refusing to adopt an unowned catalogue record: ${slug}.`);
  });

  it('records what the operator still has to answer before launch', () => {
    for (const tour of PARADISE_TOURS) {
      expect(tour.openDecisions.length).toBeGreaterThanOrEqual(3);
      expect(tour.sourceUrls.length).toBeGreaterThan(0);
    }
    // The park fee and the marina are the two that block a correct checkout.
    const all = PARADISE_TOURS.flatMap((tour) => tour.openDecisions).join(' ');
    expect(all).toMatch(/national park fee/i);
    expect(all).toMatch(/marina/i);
  });
});
