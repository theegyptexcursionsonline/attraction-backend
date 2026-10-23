import {
  FOREIGN_BRANDS,
  UNBACKED_CLAIMS,
  copiedFactProblems,
  programmeFacts,
  tenantRecord,
  tripDocument,
  validateBatch,
  type NetworkBatch,
  type NetworkSite,
  type NetworkTrip,
} from '../scripts/seed-network-sites';
import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { B01_SAFARI } from '../scripts/network-sites/b01-safari';

const CLOUD = 'https://res.cloudinary.com/dm3sxllch/image/upload/v1/attractions-network/test';

// A desert programme as another operator stores it, including the parts that must never be copied.
const PROGRAMME = {
  _id: 'p-1',
  slug: 'desert-super-safari',
  currency: 'USD',
  category: 'adventure',
  duration: '5 hours',
  languages: ['English', 'German'],
  rating: 4.6,
  reviewCount: 120,
  badges: ['Bestseller'],
  instantConfirmation: true,
  cancellationPolicy: 'Free cancellation up to 24 hours before',
  hasHotelPickup: false,
  pricingOptions: [
    { _id: 'o1', id: 'adult', name: 'Adult', description: 'Full trip', price: 55 },
    { _id: 'o2', id: 'child', name: 'Child (6-12)', description: 'Shares a quad', price: 35 },
    { _id: 'o3', id: 'double', name: 'Double Quad', description: 'Two riders', price: 70 },
  ],
  addons: [
    { _id: 'a1', id: 'dinner', name: 'VIP Dinner Upgrade', description: '', price: 20 },
    { _id: 'a2', id: 'photos', name: 'Photo Package', description: '', price: 15 },
    { _id: 'a3', id: 'camel', name: 'Camel Ride Add-on', description: '', price: 15 },
  ],
  entryWindows: [
    { _id: 'w1', label: 'Afternoon Departure', startTime: '14:00', endTime: '14:30' },
    { _id: 'w2', label: '15:00 PM', startTime: '15:00', endTime: '19:00' },
    { _id: 'w3', label: 'Morning', startTime: '08:00', endTime: '08:30' },
  ],
  availability: { type: 'time-slots', advanceBooking: 30 },
  itinerary: [
    { _id: 'i1', time: '14:00', duration: '30 min', title: 'Hotel pickup', description: 'Transfer to the desert camp.' },
    { _id: 'i2', time: '18:00', duration: '1 hr', title: 'The best dinner', description: 'Rated 4.9 by guests.' },
  ],
  inclusions: ['Quad bike with fuel', 'Hotel transfers', 'English guide', '#1 Bestseller'],
  exclusions: ['Gratuities'],
  whatToBring: ['Closed shoes'],
  needToKnow: ['Drivers must be 16.'],
};

const spec = (overrides: Partial<NetworkTrip['price']> = {}): NetworkTrip['price'] => ({
  tenant: 'operator',
  source: 'desert-super-safari',
  options: ['adult'],
  child: { adult: 'adult', child: 'child', name: 'Super Safari', description: 'Quad, camel and dinner', note: 'Children aged 6 to 12 pay the child price.' },
  addons: ['dinner', 'photos'],
  perPerson: ['dinner'],
  departures: ['Afternoon Departure'],
  ...overrides,
});

const trip = (overrides: Partial<NetworkTrip> = {}): NetworkTrip => ({
  path: 'super-safari',
  price: spec(),
  title: 'Super Safari with dinner',
  short: 'Quad, camel and a BBQ dinner in the desert.',
  description: 'A quad ride, a camel ride and dinner.\n\nHotel pickup is included.',
  highlights: ['Quad bike ride', 'Camel ride', 'BBQ dinner', 'Hotel pickup'],
  seo: { metaTitle: 'Super Safari from El Gouna', metaDescription: 'Quad, camel and BBQ dinner with hotel pickup in El Gouna.' },
  images: [`${CLOUD}/a.jpg`],
  imageAlts: ['Guests on quad bikes'],
  ...overrides,
});

const site = (overrides: Partial<NetworkSite> = {}): NetworkSite => ({
  slug: 'safari-test-town',
  name: 'Safari Test Town',
  domain: 'safaritesttown.com',
  city: 'El Gouna',
  area: 'El Gouna',
  coordinates: { lat: 27.39, lng: 33.67 },
  currency: 'USD',
  slugPrefix: 'stt-',
  foreignPlaces: /Hurghada|Makadi|Marsa Alam/i,
  pickupNote: 'Pickup from hotels in El Gouna can carry a transfer charge.',
  tagline: 'Desert trips from El Gouna',
  description: 'Desert trips for El Gouna guests.\n\nReserve online and pay later.',
  seo: { metaTitle: 'Safari Test Town', metaDescription: 'Desert trips from El Gouna.', keywords: ['El Gouna safari'] },
  theme: { primaryColor: '#9D174D', secondaryColor: '#2A1420', accentColor: '#F6E7E4' },
  heroImages: [`${CLOUD}/h1.jpg`, `${CLOUD}/h2.jpg`, `${CLOUD}/h3.jpg`],
  logo: `${CLOUD}/logo.png`,
  trips: [trip()],
  ...overrides,
});

describe('network sites seed: the trip facts a site copies from a programme', () => {
  it('turns a separate child rate into one option with a child price and its age band', () => {
    const facts = programmeFacts(site(), trip(), PROGRAMME);
    expect(facts.pricingOptions).toEqual([
      expect.objectContaining({ id: 'adult', name: 'Super Safari', description: 'Quad, camel and dinner', price: 55, childPrice: 35 }),
    ]);
    expect(facts.notes).toContain('Children aged 6 to 12 pay the child price.');
    // The adult rate leads; the child rate never becomes the "from" price.
    expect(facts.priceFrom).toBe(55);
  });

  it('refuses a programme that sells children separately when the trip gives no terms for it', () => {
    expect(() => programmeFacts(site(), trip({ price: spec({ child: undefined }) }), PROGRAMME)).toThrow(/separate child rate/);
  });

  it('prices a vehicle option for the vehicle, and never lets it lead the "from" price', () => {
    const facts = programmeFacts(site(), trip({ price: spec({ options: ['adult', 'double'], vehicle: { double: { riders: 2, note: 'A double quad takes up to 2 riders.' } } }) }), PROGRAMME);
    expect(facts.pricingOptions.find((option) => option.id === 'double')).toEqual(expect.objectContaining({ pricingModel: 'per-booking', minParticipants: 1, maxParticipants: 2, price: 70 }));
    expect(facts.notes).toContain('A double quad takes up to 2 riders.');
    expect(facts.priceFrom).toBe(55);
  });

  it('charges each extra on purpose: per guest who takes it, or once per booking', () => {
    const facts = programmeFacts(site(), trip(), PROGRAMME);
    expect(facts.addons).toEqual([
      expect.objectContaining({ id: 'dinner', pricingModel: 'per-person', pricingType: 'per_person', price: 20 }),
      expect.objectContaining({ id: 'photos', pricingModel: 'per-booking', pricingType: 'per_unit', price: 15 }),
    ]);
    // An extra the programme has but the trip does not sell (a camel ride the trip already includes) stays out.
    expect(facts.addons.map((addon) => addon.id)).not.toContain('camel');
  });

  it('sells only the named departures, under a clearer label where the programme uses a bare time', () => {
    const facts = programmeFacts(site(), trip({ price: spec({ departures: ['15:00 PM'], departureLabels: { '15:00 PM': 'Afternoon' } }) }), PROGRAMME);
    expect(facts.entryWindows).toEqual([{ label: 'Afternoon', startTime: '15:00', endTime: '19:00' }]);
  });

  it('fails closed on a missing option, extra or departure, a missing price, or another currency', () => {
    expect(() => programmeFacts(site(), trip({ price: spec({ options: ['adult', 'vip'] }) }), PROGRAMME)).toThrow(/option "vip" is missing/);
    expect(() => programmeFacts(site(), trip({ price: spec({ addons: ['shisha'] }) }), PROGRAMME)).toThrow(/extra "shisha" is missing/);
    expect(() => programmeFacts(site(), trip({ price: spec({ departures: ['Evening'] }) }), PROGRAMME)).toThrow(/departure "Evening" is missing/);
    const unpriced = { ...PROGRAMME, addons: [{ id: 'dinner', name: 'Dinner', price: 0 }, PROGRAMME.addons[1]] };
    expect(() => programmeFacts(site(), trip(), unpriced)).toThrow(/extra "dinner" has no valid price/);
    expect(() => programmeFacts(site({ currency: 'EUR' }), trip(), PROGRAMME)).toThrow(/priced in USD and the site sells in EUR/);
  });
});

describe('network sites seed: the trip document', () => {
  const document = tripDocument(site(), trip(), PROGRAMME, 0, 'tenant-1');

  it('sells at the programme price on the site, without its ratings, badges or promises', () => {
    expect(document).toEqual(expect.objectContaining({
      slug: 'stt-super-safari',
      pathSlug: 'super-safari',
      currency: 'USD',
      priceFrom: 55,
      rating: 0,
      reviewCount: 0,
      enquiryOnly: false,
      instantConfirmation: false,
      hasHotelPickup: true,
      ownerTenantId: 'tenant-1',
      tenantIds: ['tenant-1'],
      reseller: { enabled: false, value: 0, allowedTenants: [] },
      status: 'active',
    }));
    expect(document).not.toHaveProperty('badges');
    expect(document).not.toHaveProperty('cancellationPolicy');
    expect(document.destination).toEqual({ city: 'El Gouna', country: 'Egypt', coordinates: { lat: 27.39, lng: 33.67 } });
  });

  it('copies the programme facts in the site words: pickup lines, no claims, the site pickup note', () => {
    expect(document.inclusions).toEqual(['Quad bike with fuel', 'Hotel pickup and drop-off', 'English guide']);
    expect(document.itinerary).toEqual([{ time: '14:00', duration: '30 min', title: 'Hotel pickup', description: 'Transfer to the desert camp.' }]);
    expect(document.needToKnow).toEqual(['Drivers must be 16.', 'Children aged 6 to 12 pay the child price.', 'Pickup from hotels in El Gouna can carry a transfer charge.']);
    expect(document.meetingPoint).toEqual(expect.objectContaining({ address: 'Your hotel in El Gouna' }));
  });

  it('leaves the pickup note out where the programme itself collects from the area, and uses the site schedule when given', () => {
    const own = tripDocument(site(), trip({ pickupIncluded: true, price: spec({ itinerary: [{ duration: '30 min', title: 'Hotel pickup', description: 'To the stables.' }] }) }), PROGRAMME, 1, 'tenant-1');
    expect(own.needToKnow).not.toContain('Pickup from hotels in El Gouna can carry a transfer charge.');
    expect(own.itinerary).toEqual([{ time: '', duration: '30 min', title: 'Hotel pickup', description: 'To the stables.' }]);
  });

  it('leaves out the exact lines that describe an option the trip does not sell, and adds what the sold option includes', () => {
    const withDinner = { ...PROGRAMME, exclusions: ['Gratuities', 'BBQ dinner (included in BBQ option)'] };
    const sold = tripDocument(site(), trip({ price: spec({ omit: { exclusions: ['BBQ dinner (included in BBQ option)'], needToKnow: ['Drivers must be 16.'] }, add: { inclusions: ['BBQ dinner and show'] } }) }), withDinner, 0, 'tenant-1');
    expect(sold.exclusions).toEqual(['Gratuities']);
    expect(sold.inclusions).toEqual(['Quad bike with fuel', 'Hotel pickup and drop-off', 'English guide', 'BBQ dinner and show']);
    expect(sold.needToKnow).not.toContain('Drivers must be 16.');
    // A line the programme no longer carries means the programme changed: the run stops.
    expect(() => tripDocument(site(), trip({ price: spec({ omit: { exclusions: ['Dinner on request'] } }) }), withDinner, 0, 'tenant-1')).toThrow(/"Dinner on request" is not in the programme's exclusions/);
  });

  it('drops the clock times from a copied schedule whose times contradict the departures sold', () => {
    const untimed = tripDocument(site(), trip({ price: spec({ untimedItinerary: true }) }), PROGRAMME, 0, 'tenant-1');
    expect(untimed.itinerary).toEqual([{ time: '', duration: '30 min', title: 'Hotel pickup', description: 'Transfer to the desert camp.' }]);
  });

  it('is a document the attraction schema accepts as it stands, enums included', () => {
    // The schema, not the seed, is the authority on stored values: a value it refuses would stop the
    // production run halfway through a batch.
    const tenantId = new Types.ObjectId();
    const vehicle = tripDocument(site(), trip({ price: spec({ options: ['adult', 'double'], vehicle: { double: { riders: 2, note: 'Two riders.' } } }) }), PROGRAMME, 0, tenantId);
    for (const candidate of [tripDocument(site(), trip(), PROGRAMME, 0, tenantId), vehicle]) {
      const error = new Attraction(candidate).validateSync();
      expect(error?.errors ?? {}).toEqual({});
    }
  });

  it('refuses a programme that does not include hotel pickup', () => {
    const noPickup = { ...PROGRAMME, inclusions: ['Quad bike'] };
    expect(() => tripDocument(site(), trip(), noPickup, 0, 'tenant-1')).toThrow(/does not include hotel pickup/);
  });

  it('flags copied text that names another place or brand, or makes a claim, before any write', () => {
    const named = tripDocument(site(), trip(), { ...PROGRAMME, exclusions: ['Transfers from Hurghada', 'Desert Fox merchandise'], whatToBring: ['The best shoes'] }, 0, 'tenant-1');
    expect(copiedFactProblems(site(), named)).toEqual([
      'stt-super-safari: copied text names another place or brand, or makes a claim: "Transfers from Hurghada"',
      'stt-super-safari: copied text names another place or brand, or makes a claim: "Desert Fox merchandise"',
    ]);
    // A claim in a copied list is dropped by the copy itself, not just reported.
    expect(named.whatToBring).toEqual([]);
    expect(copiedFactProblems(site(), document)).toEqual([]);
  });
});

describe('network sites seed: the tenant record', () => {
  it('keeps a new site on a database-valid design, pay later, AI off, alerts on the platform inbox and no domain yet', () => {
    const record = tenantRecord(site({ currency: 'EUR' }));
    expect(record).toEqual(expect.objectContaining({
      designMode: 'desertfox',
      status: 'active',
      domainMigrated: false,
      defaultCurrency: 'EUR',
      supportedLanguages: ['en'],
      flatUrls: true,
      notificationSettings: { bookingEmail: 'theegyptexcursionsonline@gmail.com' },
      paymentSettings: { enabledGateways: ['pay-later'], ownPaymentGateway: false, stripe: { enabled: false } },
    }));
    expect(record).not.toHaveProperty('customDomain');
    // No phone or email is published for the site until its operator confirms its own.
    expect(record.contactInfo).toEqual({ address: 'El Gouna, Red Sea, Egypt' });
    expect(Object.values(record.aiSettings as Record<string, { enabled: boolean }>).every((setting) => !setting.enabled)).toBe(true);
  });
});

describe('network sites seed: what the batch check refuses', () => {
  const batch = (sites: NetworkSite[]): NetworkBatch => ({ id: 'test', sites });

  it('accepts a clean site', () => {
    expect(validateBatch(batch([site()]))).toEqual([]);
  });

  it('refuses claims, brands, other places, missing photos and paths it cannot serve', () => {
    const errors = validateBatch(batch([site({
      tagline: 'The best desert trips',
      trips: [
        trip({ title: 'Desert Fox super safari' }),
        trip({ path: 'super-safari', short: 'From Hurghada into the desert.' }),
        trip({ path: 'Bad Path', images: ['https://example.com/photo.jpg'], imageAlts: [] }),
      ],
    })]));
    expect(errors).toEqual(expect.arrayContaining([
      'safari-test-town: site copy carries a claim, an emoji, a brand, a process word or another place.',
      'stt-super-safari: another brand in customer copy.',
      'stt-super-safari: duplicate public path.',
      'stt-super-safari: copy names a place this site does not serve.',
      'stt-Bad Path: invalid public path.',
      'stt-Bad Path: every photo needs its own description.',
    ]));
  });

  it('refuses an extra charged per guest that is not sold, or a vehicle option that is not sold', () => {
    const errors = validateBatch(batch([site({ trips: [trip({ price: spec({ perPerson: ['shisha'], vehicle: { double: { riders: 2, note: 'Two riders.' } } }) })] })]));
    expect(errors).toEqual(expect.arrayContaining([
      'stt-super-safari: extra "shisha" to charge per guest is not sold.',
      'stt-super-safari: vehicle option "double" is not sold.',
    ]));
  });

  it('knows the brands and claims it refuses', () => {
    for (const brand of ['Desert Fox', 'Gamila', 'Safari Sahara', 'Polaris RZR', 'Viator']) expect(FOREIGN_BRANDS.test(brand)).toBe(true);
    for (const claim of ['the best trip', 'Rated 4.8', '1,800 reviews', 'Skip the queue', 'Full refund', 'Instant confirmation']) expect(UNBACKED_CLAIMS.test(claim)).toBe(true);
    expect(UNBACKED_CLAIMS.test('Hotel pickup and drop-off')).toBe(false);
  });
});

describe('batch B01: the ten HIGH safari domains', () => {
  it('is a valid batch: claim-free copy, places each site serves, network-hosted photos', () => {
    expect(validateBatch(B01_SAFARI)).toEqual([]);
  });

  it('builds exactly the ten sites on Fouad\'s list, each with its own catalogue', () => {
    expect(B01_SAFARI.sites.map((item) => item.domain)).toEqual([
      'safarielgouna.com', 'hurghadadesertsafari.com', 'hurghadahorseclub.com', 'hurghadaquadbikesafaris.com', 'safarisahlhashesh.com',
      'saharahurghada.com', 'saharaparkhurghada.com', 'makadibayhorseride.com', 'safarimakadibay.com', 'marsaalamdesertsafaris.com',
    ]);
    for (const item of B01_SAFARI.sites) {
      expect(item.trips.length).toBeGreaterThanOrEqual(4);
      expect(new Set(item.heroImages).size).toBe(3);
      expect(item.slug).toMatch(/^[a-z0-9-]+$/);
    }
    // Neighbouring sites never open on the same photo.
    const firstHeroes = B01_SAFARI.sites.map((item) => item.heroImages[0]);
    expect(new Set(firstHeroes).size).toBe(firstHeroes.length);
  });

  it('sells each site in one currency: euros only where the only published trips to the place are priced in euros', () => {
    for (const item of B01_SAFARI.sites) expect(item.currency).toBe(item.slug === 'sahara-park-hurghada' ? 'EUR' : 'USD');
    const saharaPark = B01_SAFARI.sites.find((item) => item.slug === 'sahara-park-hurghada')!;
    expect(new Set(saharaPark.trips.map((item) => item.price.tenant))).toEqual(new Set(['safari-sahara-hurghada']));
  });

  it('notes a possible transfer charge where the programmes are run from Hurghada, and only there', () => {
    const noted = B01_SAFARI.sites.filter((item) => item.pickupNote).map((item) => item.slug);
    expect(noted).toEqual(['safari-el-gouna', 'safari-sahl-hashesh']);
    const sahl = B01_SAFARI.sites.find((item) => item.slug === 'safari-sahl-hashesh')!;
    // The horse rides collect from Sahl Hasheesh themselves.
    expect(sahl.trips.filter((item) => item.pickupIncluded).map((item) => item.price.tenant)).toEqual(['gamila-horse-stable', 'gamila-horse-stable']);
  });
});
