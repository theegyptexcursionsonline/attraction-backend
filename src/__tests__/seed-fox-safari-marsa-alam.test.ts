import {
  FOX_HERO_SOURCES,
  FOX_MARSA_ALAM_TOURS,
  FOX_PROGRAMME_PRICES,
  FOX_SLUG_PREFIX,
  FOX_SOURCE_LOGO,
  FOX_TENANT,
  SOURCE_SITE,
  buildTourDocument,
  catalogueCollision,
  foxProgrammeFacts,
  isApprovedSourceAsset,
  validateFoxMarsaAlamPlan,
  type FoxTour,
} from '../scripts/seed-fox-safari-marsa-alam';

// The Desert Fox programmes as stored (production shape, 22 October 2026), with the ids Mongo adds.
const PROGRAMMES: Record<string, Record<string, any>> = {
  'wild-desert-jeep-quad-buggy-camel-dinner-show': {
    slug: 'wild-desert-jeep-quad-buggy-camel-dinner-show',
    currency: 'USD',
    pricingOptions: [
      { _id: 'o1', id: 'standard', name: 'All Activities + Dinner (5 hrs)', description: 'Full combo with dinner', price: 22 },
      { _id: 'o2', id: 'extended', name: 'Extended + Stargazing (7 hrs)', description: 'Add stargazing after dinner', price: 32 },
    ],
    addons: [
      { _id: 'a1', id: 'private', name: 'Private Guide', description: 'Your own guide and schedule', price: 20 },
      { _id: 'a2', id: 'sandboard', name: 'Add Sandboarding', description: '30-min sandboarding session', price: 8 },
    ],
    entryWindows: [
      { _id: 'w1', label: 'Morning', startTime: '08:00', endTime: '09:00' },
      { _id: 'w2', label: 'Afternoon', startTime: '14:00', endTime: '15:00' },
    ],
  },
  'wild-desert-dune-buggy-optional-bbq': {
    slug: 'wild-desert-dune-buggy-optional-bbq',
    currency: 'USD',
    pricingOptions: [
      { _id: 'o1', id: 'short', name: 'Buggy Only (2 hrs)', description: 'Pure buggy adrenaline', price: 58 },
      { _id: 'o2', id: 'bbq', name: 'Buggy + BBQ Dinner (5 hrs)', description: 'Buggy ride + Bedouin dinner', price: 72 },
    ],
    addons: [
      { _id: 'a1', id: 'gopro', name: 'GoPro Rental', description: 'Action camera for the ride', price: 10 },
      { _id: 'a2', id: 'camel', name: 'Add Camel Ride', description: '30-min camel ride at camp', price: 8 },
    ],
    entryWindows: [
      { _id: 'w1', label: 'Morning', startTime: '08:00', endTime: '09:00' },
      { _id: 'w2', label: 'Afternoon', startTime: '14:00', endTime: '15:00' },
    ],
  },
  'wild-desert-quad-atv-camel-bbq': {
    slug: 'wild-desert-quad-atv-camel-bbq',
    currency: 'USD',
    pricingOptions: [
      { _id: 'o1', id: 'standard', name: 'Quad + Camel (3 hrs)', description: 'Quad bike and camel ride, no dinner', price: 28 },
      { _id: 'o2', id: 'bbq', name: 'Quad + Camel + BBQ Dinner (5 hrs)', description: 'Full experience with Bedouin dinner', price: 38 },
      { _id: 'o3', id: 'private', name: 'Private Quad + Camel + BBQ', description: 'Private group experience', price: 55 },
    ],
    addons: [
      { _id: 'a1', id: 'buggy-upgrade', name: 'Dune Buggy Upgrade', description: 'Upgrade from quad to dune buggy', price: 15 },
      { _id: 'a2', id: 'photos', name: 'Photo Package', description: 'Professional desert photos', price: 8 },
      { _id: 'a3', id: 'shisha', name: 'Shisha at Camp', description: 'Traditional hookah', price: 5 },
    ],
    entryWindows: [
      { _id: 'w1', label: 'Morning', startTime: '08:00', endTime: '09:00' },
      { _id: 'w2', label: 'Afternoon', startTime: '14:00', endTime: '15:00' },
    ],
  },
  'desert-fox-camel-trek-sunset': {
    slug: 'desert-fox-camel-trek-sunset',
    currency: 'USD',
    pricingOptions: [
      { _id: 'o1', id: 'adult', name: 'Adult', description: 'Own camel', price: 25 },
      { _id: 'o2', id: 'child', name: 'Child (4-11)', description: 'Shares camel with adult', price: 15 },
    ],
    addons: [{ _id: 'a1', id: 'henna', name: 'Henna Painting', description: 'Traditional hand henna design', price: 5 }],
    entryWindows: [{ _id: 'w1', label: 'Afternoon', startTime: '15:30', endTime: '16:00' }],
  },
};
const programmeFor = (tour: FoxTour) => {
  const spec = FOX_PROGRAMME_PRICES[tour.pathSlug];
  return spec ? PROGRAMMES[spec.source] : undefined;
};

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

  it('sells in US dollars, the currency of the programme prices its desert trips carry', () => {
    expect(FOX_TENANT.defaultCurrency).toBe('USD');
    for (const [index, tour] of FOX_MARSA_ALAM_TOURS.entries()) {
      expect(buildTourDocument(tour, index, [], 'tenant-id', programmeFor(tour)).currency).toBe('USD');
    }
  });

  it('sells a desert trip only at the prices of the Desert Fox programme with the same activities, never an invented one', () => {
    expect(Object.keys(FOX_PROGRAMME_PRICES).sort()).toEqual(['buggy-spider', 'camel-ride', 'desert-atv-adventure', 'quad-sunset-bbq', 'super-safari']);
    const built = Object.fromEntries(FOX_MARSA_ALAM_TOURS.map((tour, index) => [tour.pathSlug, buildTourDocument(tour, index, ['https://res.cloudinary.com/demo/image/upload/a.jpg'], 'tenant-id', programmeFor(tour))]));
    for (const doc of Object.values(built)) {
      expect(doc.rating).toBe(0);
      expect(doc.reviewCount).toBe(0);
      expect(doc.instantConfirmation).toBe(false);
      expect(doc.ownerTenantId).toBe('tenant-id');
      expect(doc.tenantIds).toEqual(['tenant-id']);
      expect(doc.reseller).toEqual({ enabled: false, value: 0, allowedTenants: [] });
    }
    // Trips with no programme of the same activities stay enquiries with no price.
    for (const path of ['jeep-safari', 'horse-ride', 'el-quseir-city-tour', 'luxor-day-trip', 'airport-transfers']) {
      expect(built[path]).toEqual(expect.objectContaining({ enquiryOnly: true, pricingOptions: [], addons: [], entryWindows: [] }));
      expect(built[path]).not.toHaveProperty('priceFrom');
      expect((built[path].availability as { type: string }).type).toBe('date-only');
    }
    // The full desert evening: both programme options, its extras, and only the afternoon start (it ends with dinner).
    expect(built['super-safari']).toEqual(expect.objectContaining({ enquiryOnly: false, priceFrom: 22 }));
    expect(built['super-safari'].pricingOptions).toEqual([
      { id: 'standard', name: 'All Activities + Dinner (5 hrs)', description: 'Full combo with dinner', price: 22 },
      { id: 'extended', name: 'Extended + Stargazing (7 hrs)', description: 'Add stargazing after dinner', price: 32 },
    ]);
    expect(built['super-safari'].entryWindows).toEqual([{ label: 'Afternoon', startTime: '14:00', endTime: '15:00' }]);
    expect((built['super-safari'].addons as Array<{ id: string }>).map((addon) => addon.id)).toEqual(['private', 'sandboard']);
    expect(built['super-safari'].availability).toEqual({ type: 'time-slots', advanceBooking: 365 });
    // The buggy ride already includes its camel ride, so the programme's camel extra is not sold again.
    expect((built['buggy-spider'].addons as Array<{ id: string }>).map((addon) => addon.id)).toEqual(['gopro']);
    expect((built['buggy-spider'].entryWindows as Array<{ label: string }>).map((window) => window.label)).toEqual(['Morning', 'Afternoon']);
    // One programme, two trips: the sunset ride with dinner and the shorter ride without.
    expect(built['quad-sunset-bbq']).toEqual(expect.objectContaining({ priceFrom: 38 }));
    expect((built['quad-sunset-bbq'].pricingOptions as Array<{ id: string }>).map((option) => option.id)).toEqual(['bbq']);
    expect((built['quad-sunset-bbq'].entryWindows as Array<{ label: string }>).map((window) => window.label)).toEqual(['Afternoon']);
    expect(built['desert-atv-adventure']).toEqual(expect.objectContaining({ priceFrom: 28 }));
    // A family pays the child rate for its children, and the age band is stated.
    expect(built['camel-ride'].pricingOptions).toEqual([
      { id: 'adult', name: 'Camel ride', description: 'Adults ride their own camel', price: 25, childPrice: 15 },
    ]);
    expect(built['camel-ride'].needToKnow).toEqual(expect.arrayContaining(['Children aged 4 to 11 pay the child price and share a camel with an adult.']));
    expect(built['camel-ride'].addons).toEqual([]);
    // The operator's own words stay: languages, itinerary, durations.
    expect(built['camel-ride'].languages).toEqual(['English', 'German', 'Russian', 'Italian', 'Czech', 'Polish']);
    expect(built['camel-ride'].duration).toBe('About 1 hour of riding');
    for (const tour of FOX_MARSA_ALAM_TOURS) expect(tour.openDecisions.some((item) => /price/i.test(item))).toBe(true);
  });

  it('stops before any write when a programme cannot price a trip faithfully', () => {
    const camel = FOX_MARSA_ALAM_TOURS.find((tour) => tour.pathSlug === 'camel-ride')!;
    const superSafari = FOX_MARSA_ALAM_TOURS[0];
    const spec = FOX_PROGRAMME_PRICES['super-safari']!;
    // Not loaded at all.
    expect(() => buildTourDocument(superSafari, 0, [], 'tenant-id')).toThrow(/wild-desert-jeep-quad-buggy-camel-dinner-show, which was not loaded/);
    // Priced in another currency: never converted.
    expect(() => foxProgrammeFacts(superSafari, spec, { ...PROGRAMMES['wild-desert-jeep-quad-buggy-camel-dinner-show'], currency: 'EUR' })).toThrow(/priced in EUR and the site sells in USD/);
    // A named option, extra or departure the programme no longer has.
    expect(() => foxProgrammeFacts(superSafari, spec, { ...PROGRAMMES['wild-desert-jeep-quad-buggy-camel-dinner-show'], entryWindows: [] })).toThrow(/departure "Afternoon" is missing/);
    expect(() => foxProgrammeFacts(superSafari, spec, { ...PROGRAMMES['wild-desert-jeep-quad-buggy-camel-dinner-show'], addons: [] })).toThrow(/extra "private" is missing/);
    expect(() => foxProgrammeFacts(superSafari, spec, { ...PROGRAMMES['wild-desert-jeep-quad-buggy-camel-dinner-show'], pricingOptions: [{ id: 'standard', name: 'Standard', price: 0 }, { id: 'extended', name: 'Extended', price: 32 }] })).toThrow(/option "standard" has no valid price/);
    // A child rate appears with no terms for it: children would pay the adult rate.
    expect(() => foxProgrammeFacts(superSafari, spec, {
      ...PROGRAMMES['wild-desert-jeep-quad-buggy-camel-dinner-show'],
      pricingOptions: [...PROGRAMMES['wild-desert-jeep-quad-buggy-camel-dinner-show'].pricingOptions, { id: 'kid', name: 'Child (6-12)', price: 15 }],
    })).toThrow(/separate child rate/);
    expect(() => foxProgrammeFacts(camel, FOX_PROGRAMME_PRICES['camel-ride']!, { ...PROGRAMMES['desert-fox-camel-trek-sunset'], pricingOptions: [{ id: 'adult', name: 'Adult', price: 25 }] })).toThrow(/option "child" is missing/);
    // Copied text naming another place, brand or claim.
    expect(() => foxProgrammeFacts(superSafari, spec, {
      ...PROGRAMMES['wild-desert-jeep-quad-buggy-camel-dinner-show'],
      addons: [{ id: 'private', name: 'Private Guide', description: 'Back to Hurghada by 9pm', price: 20 }, { id: 'sandboard', name: 'Our best sandboarding', price: 8 }],
    })).toThrow(/"Back to Hurghada by 9pm", "Our best sandboarding"/);
  });

  it('publishes a departure time or a duration only where the operator or the matching programme states one', () => {
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
    const superSafari = buildTourDocument(FOX_MARSA_ALAM_TOURS[0], 0, [], 'tenant-id', programmeFor(FOX_MARSA_ALAM_TOURS[0]));
    expect(superSafari).not.toHaveProperty('duration');
    const horseRide = FOX_MARSA_ALAM_TOURS.find((tour) => tour.pathSlug === 'horse-ride')!;
    expect((buildTourDocument(horseRide, 6, [], 'tenant-id').availability as { type: string }).type).toBe('date-only');
  });

  it('says how a shared quad or the buggy dinner is booked, now that the trips are bookable', () => {
    const copy = JSON.stringify(FOX_MARSA_ALAM_TOURS.filter((tour) => FOX_PROGRAMME_PRICES[tour.pathSlug]).map((tour) => [tour.description, tour.highlights, tour.needToKnow, tour.exclusions]));
    expect(copy).not.toMatch(/on request at sunset|ask to add|unless added to a sunset ride|Book a single quad for one rider or a double quad/);
    expect(copy).toMatch(/Say so when you book and the team gives you a double quad to share/);
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
