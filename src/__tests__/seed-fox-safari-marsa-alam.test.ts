import {
  FOX_HERO_SOURCES,
  FOX_MARSA_ALAM_TOURS,
  FOX_SLUG_PREFIX,
  FOX_SOURCE_LOGO,
  FOX_TENANT,
  SOURCE_SITE,
  buildTourDocument,
  catalogueCollision,
  isApprovedSourceAsset,
  validateFoxMarsaAlamPlan,
} from '../scripts/seed-fox-safari-marsa-alam';

describe('Fox Marsa Alam seed contract', () => {
  it('is a valid launch package on the Desert Fox family design with no domain claimed', () => {
    expect(validateFoxMarsaAlamPlan()).toEqual([]);
    expect(FOX_TENANT.slug).toBe('fox-safari-marsa-alam');
    expect(FOX_TENANT.name).toBe('Fox Marsa Alam');
    expect(FOX_TENANT.designMode).toBe('desertfox');
    expect(FOX_TENANT.status).toBe('active');
    expect(FOX_TENANT.domainMigrated).toBe(false);
    expect(FOX_TENANT.customDomainStatus).toBe('unconfigured');
    expect(FOX_TENANT).not.toHaveProperty('customDomain');
    expect(FOX_TENANT.flatUrls).toBe(true);
  });

  it('takes no card payment, ships no bundle, keeps the AI widgets off and booking alerts on the platform inbox', () => {
    expect(FOX_TENANT.paymentSettings).toEqual({ enabledGateways: ['pay-later'], ownPaymentGateway: false, stripe: { enabled: false } });
    expect(FOX_TENANT.bundleSettings.mode).toBe('off');
    expect(FOX_TENANT.notificationSettings.bookingEmail).toBe('theegyptexcursionsonline@gmail.com');
    expect(Object.values(FOX_TENANT.aiSettings).map((setting) => setting.enabled)).toEqual([false, false, false]);
  });

  it("uses the operator's published contact points and the family palette", () => {
    expect(FOX_TENANT.contactInfo).toEqual(expect.objectContaining({
      email: 'info@foxmarsaalam.com',
      phone: '+20 103 968 8089',
      whatsapp: '+201039688089',
    }));
    // The operator publishes two contradicting sets of hours, so none is claimed.
    expect(FOX_TENANT.contactInfo).not.toHaveProperty('supportHours');
    expect(FOX_TENANT.theme).toEqual({ primaryColor: '#D9612A', secondaryColor: '#2D1810', accentColor: '#F1E5C9' });
    expect(FOX_TENANT.navigation.map((item) => item.href)).toEqual(['/', '/safaris', '/about', '/faq', '/contact']);
    expect(FOX_TENANT.pickupDestinationSlugs).toEqual(['marsa-alam']);
  });

  it('carries the ten trips the operator publishes, each with its own short public address', () => {
    expect(FOX_MARSA_ALAM_TOURS.map((tour) => tour.pathSlug)).toEqual([
      'super-safari',
      'jeep-safari',
      'buggy-spider',
      'quad-sunset-bbq',
      'desert-atv-adventure',
      'camel-ride',
      'horse-ride',
      'el-quseir-city-tour',
      'luxor-day-trip',
      'airport-transfers',
    ]);
    for (const tour of FOX_MARSA_ALAM_TOURS) {
      expect(tour.slug).toBe(`${FOX_SLUG_PREFIX}${tour.pathSlug}`);
      expect(tour.sourceUrls.every((url) => url.startsWith(SOURCE_SITE))).toBe(true);
    }
  });

  it('sells nothing at an invented price: every trip is enquiry-only until the operator confirms prices', () => {
    for (const [index, tour] of FOX_MARSA_ALAM_TOURS.entries()) {
      const doc = buildTourDocument(tour, index, ['https://res.cloudinary.com/demo/image/upload/a.jpg'], 'tenant-id');
      expect(doc.enquiryOnly).toBe(true);
      expect(doc.pricingOptions).toEqual([]);
      expect(doc).not.toHaveProperty('priceFrom');
      expect(doc.rating).toBe(0);
      expect(doc.reviewCount).toBe(0);
      expect(doc.instantConfirmation).toBe(false);
      expect(doc.ownerTenantId).toBe('tenant-id');
      expect(doc.tenantIds).toEqual(['tenant-id']);
      expect(doc.reseller).toEqual({ enabled: false, value: 0, allowedTenants: [] });
      expect(tour.openDecisions.some((item) => /price/i.test(item))).toBe(true);
    }
  });

  it('publishes a departure time or a duration only where the operator states one', () => {
    expect(FOX_MARSA_ALAM_TOURS.every((tour) => tour.entryWindows.length === 0)).toBe(true);
    const withDuration = Object.fromEntries(FOX_MARSA_ALAM_TOURS.filter((tour) => tour.duration).map((tour) => [tour.pathSlug, tour.duration]));
    expect(withDuration).toEqual({
      'quad-sunset-bbq': 'About 4–5 hours',
      'desert-atv-adventure': 'About 3 hours',
      'camel-ride': 'About 1 hour of riding',
      'horse-ride': '1 or 2 hours',
      'el-quseir-city-tour': 'About 4 hours',
      'luxor-day-trip': 'Full day (about 16 hours)',
    });
    const superSafari = buildTourDocument(FOX_MARSA_ALAM_TOURS[0], 0, [], 'tenant-id');
    expect(superSafari).not.toHaveProperty('duration');
    expect((superSafari.availability as { type: string }).type).not.toBe('time-slots');
  });

  it('states the quad age rule where the operator does, and the off-road warning on desert trips', () => {
    const bySlug = Object.fromEntries(FOX_MARSA_ALAM_TOURS.map((tour) => [tour.pathSlug, tour]));
    for (const slug of ['super-safari', 'quad-sunset-bbq', 'desert-atv-adventure']) {
      expect(bySlug[slug].participantRequirements.join(' ')).toMatch(/16 or older/);
    }
    for (const slug of ['super-safari', 'jeep-safari', 'buggy-spider', 'quad-sunset-bbq', 'desert-atv-adventure']) {
      expect(bySlug[slug].accessibility.join(' ')).toMatch(/pregnancy|back problems/);
    }
  });

  it('never publishes a marketplace brand, a rating or a claim the operator has not made', () => {
    for (const tour of FOX_MARSA_ALAM_TOURS) {
      const copy = JSON.stringify([tour.title, tour.shortDescription, tour.description, tour.highlights, tour.itinerary, tour.needToKnow]).toLowerCase();
      expect(copy).not.toMatch(/getyourguide|tripadvisor|viator|shinetheme/);
      expect(copy).not.toMatch(/free cancellation|years of experience|\bbest\b|premier|\baward|guaranteed|instant confirmation/);
      expect(tour).not.toHaveProperty('rating');
    }
  });

  it("mirrors only the operator's own imagery, from its media library or the image host its pages embed", () => {
    expect(isApprovedSourceAsset(FOX_SOURCE_LOGO)).toBe(true);
    expect(FOX_HERO_SOURCES).toHaveLength(3);
    expect(FOX_HERO_SOURCES.every(isApprovedSourceAsset)).toBe(true);
    for (const tour of FOX_MARSA_ALAM_TOURS) {
      expect(tour.sourceImages.length).toBeGreaterThanOrEqual(5);
      expect(tour.sourceImages.every(isApprovedSourceAsset)).toBe(true);
      expect(new Set(tour.sourceImages).size).toBe(tour.sourceImages.length);
      expect(tour.imageAlts).toHaveLength(tour.sourceImages.length);
    }
    expect(isApprovedSourceAsset('https://i.ibb.co/DDRtdp0f/1.jpg')).toBe(true);
    expect(isApprovedSourceAsset('https://foxmarsaalam.com/wp-content/uploads/2025/04/cropped-033.png')).toBe(true);
    expect(isApprovedSourceAsset('http://i.ibb.co/DDRtdp0f/1.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://i.ibb.co/DDRtdp0f/1.jpg?w=10')).toBe(false);
    expect(isApprovedSourceAsset('https://i.ibb.co.evil.test/DDRtdp0f/1.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://i.ibb.co/DDRtdp0f/nested/1.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://i.ibb.co/DDRtdp0f/1.svg')).toBe(false);
    expect(isApprovedSourceAsset('https://foxmarsaalam.com/some/other/path.jpg')).toBe(false);
    expect(isApprovedSourceAsset('not a url')).toBe(false);
  });

  it('refuses to touch a trip slug another site owns or lists', () => {
    const slug = 'fox-marsa-alam-super-safari';
    expect(catalogueCollision([])).toBeNull();
    expect(catalogueCollision([{ slug, ownedByFox: true, hasOwner: true, listedByOtherTenant: false }])).toBeNull();
    expect(catalogueCollision([{ slug, ownedByFox: false, hasOwner: true, listedByOtherTenant: false }])).toBe(`Refusing cross-tenant catalogue overwrite: ${slug}.`);
    expect(catalogueCollision([{ slug, ownedByFox: true, hasOwner: true, listedByOtherTenant: true }])).toBe(`Refusing cross-tenant catalogue overwrite: ${slug}.`);
    expect(catalogueCollision([{ slug, ownedByFox: false, hasOwner: false, listedByOtherTenant: false }])).toBe(`Refusing to adopt an unowned catalogue record: ${slug}.`);
  });

  it('records what the operator still has to answer before trips become bookable', () => {
    const all = FOX_MARSA_ALAM_TOURS.flatMap((tour) => tour.openDecisions).join(' ');
    expect(all).toMatch(/price/i);
    expect(all).toMatch(/departure times|pickup time/i);
    expect(all).toMatch(/original photo files/i);
  });

  it('keeps every SEO title and description inside search-result limits', () => {
    for (const tour of FOX_MARSA_ALAM_TOURS) {
      expect(tour.seo.metaTitle.length).toBeLessThanOrEqual(70);
      expect(tour.seo.metaDescription.length).toBeLessThanOrEqual(165);
    }
    expect(FOX_TENANT.seoSettings.metaTitle.length).toBeLessThanOrEqual(70);
    expect(FOX_TENANT.seoSettings.metaDescription.length).toBeLessThanOrEqual(165);
  });
});
