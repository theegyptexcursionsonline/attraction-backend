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
  'hurghada-jeep-safari-redsea': {
    slug: 'hurghada-jeep-safari-redsea',
    currency: 'USD',
    pricingOptions: [{ _id: 'o1', id: 'adult', name: 'Adult', price: 35 }, { _id: 'o2', id: 'child', name: 'Child', price: 24 }],
    addons: [
      { _id: 'a1', id: 'addon-photo', name: 'Photography Package', description: 'Professional photos of your experience', price: 15 },
      { _id: 'a2', id: 'addon-drinks', name: 'Cold Drinks Package', description: 'Unlimited cold drinks during trip', price: 8 },
      { _id: 'a3', id: 'addon-dinner', name: 'Traditional Bedouin Dinner', description: 'Authentic BBQ dinner under the stars', price: 20 },
      { _id: 'a4', id: 'addon-camel', name: 'Camel Ride Add-on', description: '30-minute camel ride experience', price: 15 },
    ],
    entryWindows: [
      { _id: 'w1', label: 'Morning Session', startTime: '08:00', endTime: '08:30' },
      { _id: 'w2', label: 'Late Afternoon Session', startTime: '15:00', endTime: '15:30' },
    ],
  },
  'desert-sea-horse-ride-optional-swimming': {
    slug: 'desert-sea-horse-ride-optional-swimming',
    currency: 'USD',
    pricingOptions: [{ _id: 'o1', id: '0d1d0b54', name: 'Standard', description: 'Per person', price: 29 }],
    addons: [
      { _id: 'a1', id: '26bca453', name: 'Professional Photos', description: 'Photos of your ride', price: 15 },
      { _id: 'a2', id: '4b618211', name: 'Extended Beach Time', description: 'Extra hour at the beach', price: 10 },
    ],
    entryWindows: [
      { _id: 'w1', label: 'Morning', startTime: '07:00', endTime: '08:00' },
      { _id: 'w2', label: 'Afternoon', startTime: '15:00', endTime: '16:00' },
      { _id: 'w3', label: 'Sunset', startTime: '17:00', endTime: '18:00' },
    ],
  },
  'luxor-day-trip-valley-kings': {
    slug: 'luxor-day-trip-valley-kings',
    currency: 'USD',
    pricingOptions: [
      { _id: 'o1', id: 'adult', name: 'Adult', description: 'Full tour', price: 55 },
      { _id: 'o2', id: 'child', name: 'Child (6-12)', description: 'Full tour', price: 35 },
    ],
    addons: [
      { _id: 'a1', id: 'tut-tomb', name: 'Tutankhamun Tomb Entry', description: 'Enter the tomb of Tutankhamun', price: 20 },
      { _id: 'a2', id: 'balloon', name: 'Hot Air Balloon at Sunrise', description: 'Early morning balloon ride over West Bank', price: 45 },
    ],
    entryWindows: [
      { _id: 'w1', label: 'Morning', startTime: '07:00', endTime: '08:00' },
      { _id: 'w2', label: 'Afternoon', startTime: '13:00', endTime: '14:00' },
    ],
  },
  'fts-hurghada-city-tour-bazaar-sand-museum': {
    slug: 'fts-hurghada-city-tour-bazaar-sand-museum',
    currency: 'USD',
    pricingOptions: [
      { _id: 'o1', id: 'adult', name: 'Adult', description: 'City tour with Sand Museum', price: 18 },
      { _id: 'o2', id: 'child', name: 'Child (6-12)', description: 'City tour with Sand Museum', price: 12 },
      { _id: 'o3', id: 'no-museum', name: 'Adult (without Sand Museum)', description: 'City tour only', price: 12 },
    ],
    addons: [{ _id: 'a1', id: 'aquarium', name: 'Add Grand Aquarium', description: 'Visit Hurghada Grand Aquarium', price: 15 }],
    entryWindows: [
      { _id: 'w1', label: 'Morning Departure', startTime: '03:00', endTime: '04:00' },
      { _id: 'w2', label: 'Standard Departure', startTime: '07:00', endTime: '08:00' },
    ],
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
    expect(Object.keys(FOX_PROGRAMME_PRICES).sort()).toEqual([
      'buggy-spider', 'camel-ride', 'desert-atv-adventure', 'el-quseir-city-tour', 'horse-ride', 'jeep-safari', 'luxor-day-trip', 'quad-sunset-bbq', 'super-safari',
    ]);
    // Desert Fox's own programmes unless another site is named, and no source in another currency.
    expect(Object.entries(FOX_PROGRAMME_PRICES).filter(([, spec]) => spec?.tenant).map(([path, spec]) => `${path}<${spec!.tenant}`).sort()).toEqual([
      'el-quseir-city-tour<future-travel-service', 'horse-ride<sea-horse-sahl-hashesh', 'luxor-day-trip<luxor-tour-from-hurghada',
    ]);
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
    for (const path of ['airport-transfers']) {
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

    // The jeep safari includes its dinner and camel ride, so those extras of the source are not sold again.
    expect(built['jeep-safari']).toEqual(expect.objectContaining({ enquiryOnly: false, priceFrom: 35 }));
    expect(built['jeep-safari'].pricingOptions).toEqual([
      { id: 'adult', name: 'Jeep safari', description: 'Jeep, Bedouin village, camel ride, sunset and BBQ dinner with a show', price: 35, childPrice: 24 },
    ]);
    expect((built['jeep-safari'].addons as Array<{ id: string }>).map((addon) => addon.id)).toEqual(['addon-photo', 'addon-drinks']);
    expect(built['jeep-safari'].entryWindows).toEqual([{ label: 'Late Afternoon Session', startTime: '15:00', endTime: '15:30' }]);
    expect(built['jeep-safari'].needToKnow).toEqual(expect.arrayContaining([expect.stringMatching(/team confirms which ages count as children/)]));
    // The horse ride sells the two-hour ride under its own name and says how to ask for one hour.
    expect(built['horse-ride']).toEqual(expect.objectContaining({ priceFrom: 29 }));
    expect(built['horse-ride'].pricingOptions).toEqual([{ id: '0d1d0b54', name: 'Horse ride (2 hours)', description: 'Beach and desert ride with a guide', price: 29 }]);
    expect((built['horse-ride'].entryWindows as Array<{ label: string }>).map((window) => window.label)).toEqual(['Morning', 'Afternoon', 'Sunset']);
    expect((built['horse-ride'].addons as Array<{ id: string }>).map((addon) => addon.id)).toEqual(['26bca453']);
    expect(built['horse-ride'].needToKnow).toEqual(expect.arrayContaining([expect.stringMatching(/For a one-hour ride, say so when you book/)]));
    // The Luxor day is sold by the day: the source's departures cannot fit a 16-hour day from Marsa Alam.
    expect(built['luxor-day-trip']).toEqual(expect.objectContaining({ priceFrom: 55, entryWindows: [] }));
    expect(built['luxor-day-trip'].availability).toEqual({ type: 'date-only', advanceBooking: 365 });
    expect(built['luxor-day-trip'].pricingOptions).toEqual([
      { id: 'adult', name: 'Luxor day trip', description: 'Karnak, the Valley of the Kings and the Temple of Hatshepsut, with lunch', price: 55, childPrice: 35 },
    ]);
    // The tomb is an entrance ticket: each guest who enters pays for one, chosen at booking.
    expect(built['luxor-day-trip'].addons).toEqual([
      { id: 'tut-tomb', name: 'Tutankhamun Tomb Entry', description: 'Enter the tomb of Tutankhamun', price: 20, pricingModel: 'per-person', pricingType: 'per_person' },
    ]);
    // Every other copied extra keeps the source's once-per-booking charge.
    for (const pathSlug of ['jeep-safari', 'horse-ride']) {
      for (const addon of built[pathSlug].addons as Array<Record<string, unknown>>) {
        expect(addon).not.toHaveProperty('pricingModel');
        expect(addon).not.toHaveProperty('pricingType');
      }
    }
    // The town tour keeps its morning departure and leaves out another town's aquarium.
    expect(built['el-quseir-city-tour']).toEqual(expect.objectContaining({ priceFrom: 18, addons: [] }));
    expect(built['el-quseir-city-tour'].pricingOptions).toEqual([
      { id: 'adult', name: 'City tour', description: 'Guided tour with the entrance to the Ottoman fort', price: 18, childPrice: 12 },
    ]);
    expect(built['el-quseir-city-tour'].entryWindows).toEqual([{ label: 'Standard Departure', startTime: '07:00', endTime: '08:00' }]);
    // Nothing copied from another site names that site's town or sights.
    const copied = Object.values(built).map((doc) => [doc.pricingOptions, doc.addons, doc.entryWindows]);
    expect(JSON.stringify(copied)).not.toMatch(/Hurghada|Sand Museum|Aquarium/);
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
    // Renaming an option the trip does not sell.
    const horse = FOX_MARSA_ALAM_TOURS.find((tour) => tour.pathSlug === 'horse-ride')!;
    expect(() => foxProgrammeFacts(horse, { ...FOX_PROGRAMME_PRICES['horse-ride']!, rename: { other: { name: 'Ride', description: 'Ride' } } }, PROGRAMMES['desert-sea-horse-ride-optional-swimming']))
      .toThrow(/option "other" to rename is not sold/);
    // Charging per guest for an extra the trip does not sell.
    const luxor = FOX_MARSA_ALAM_TOURS.find((tour) => tour.pathSlug === 'luxor-day-trip')!;
    expect(() => foxProgrammeFacts(luxor, { ...FOX_PROGRAMME_PRICES['luxor-day-trip']!, perPerson: ['balloon'] }, PROGRAMMES['luxor-day-trip-valley-kings']))
      .toThrow(/extra "balloon" to charge per guest is not sold/);
    // Copied text naming another place, brand or claim.
    expect(() => foxProgrammeFacts(superSafari, spec, {
      ...PROGRAMMES['wild-desert-jeep-quad-buggy-camel-dinner-show'],
      addons: [{ id: 'private', name: 'Private Guide', description: 'Back to Hurghada by 9pm', price: 20 }, { id: 'sandboard', name: 'Our best sandboarding', price: 8 }],
    })).toThrow(/"Back to Hurghada by 9pm", "Our best sandboarding"/);
  });

  it('refuses a plan that charges per guest for an extra the trip does not sell', () => {
    const spec = FOX_PROGRAMME_PRICES['luxor-day-trip']!;
    const original = spec.perPerson;
    spec.perPerson = ['balloon'];
    try {
      expect(validateFoxMarsaAlamPlan()).toEqual(['luxor-day-trip: charges per guest an extra it does not sell.']);
    } finally {
      spec.perPerson = original;
    }
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
    const transfers = FOX_MARSA_ALAM_TOURS.find((tour) => tour.pathSlug === 'airport-transfers')!;
    expect((buildTourDocument(transfers, 9, [], 'tenant-id').availability as { type: string }).type).toBe('date-only');
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
