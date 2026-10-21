import {
  FAMILY_SITES,
  UNBACKED_CLAIMS,
  copiedFactProblems,
  familyDepartures,
  familyPricing,
  familyTenantRecord,
  familyTripDocument,
  validateFamilySitesPlan,
} from '../scripts/seed-fox-family-sites';
import { FAMILY_SITE_TRIPS } from '../scripts/seed-fox-family-sites.catalogue';

// A Desert Fox programme as stored, including the parts that must never be copied.
const SOURCE = {
  _id: 'df-1',
  slug: 'desert-fox-super-safari-combo',
  category: 'adventure',
  duration: '5 hours',
  languages: ['English', 'Arabic', 'German'],
  rating: 4.6,
  reviewCount: 15,
  badges: ['Bestseller'],
  cancellationPolicy: 'Free cancellation up to 24 hours before',
  instantConfirmation: true,
  hasHotelPickup: false,
  pricingOptions: [
    { _id: 'o1', id: 'adult', name: 'Adult', description: 'Full combo experience', price: 55 },
    { _id: 'o2', id: 'child', name: 'Child (6-12)', description: 'Shared quad, own camel', price: 35 },
  ],
  addons: [{ _id: 'a1', id: 'shisha', name: 'Shisha at Camp', description: 'At the camp', price: 8 }],
  entryWindows: [{ _id: 'w1', label: 'Afternoon Departure', startTime: '14:00', endTime: '14:30' }],
  availability: { type: 'time-slots', advanceBooking: 30 },
  itinerary: [
    { _id: 'i1', time: '14:00', duration: '30 min', title: 'Hotel Pickup', description: 'Transfer to the desert camp.' },
    { _id: 'i2', time: '18:00', duration: '1 hr', title: 'The best dinner', description: 'Rated 4.9 by guests.' },
  ],
  inclusions: ['Quad bike with fuel', 'Hotel transfers', 'English guide', '#1 Bestseller'],
  exclusions: ['Gratuities'],
  whatToBring: ['Closed shoes', 'Camera'],
};

const site = (slug: string) => FAMILY_SITES.find((item) => item.slug === slug)!;
const trip = (slug: keyof typeof FAMILY_SITE_TRIPS) => FAMILY_SITE_TRIPS[slug][0];

describe('Fox family sites seed contract', () => {
  it('is a valid plan: claim-free copy, places each site serves, network-hosted images', () => {
    expect(validateFamilySitesPlan()).toEqual([]);
    expect(FAMILY_SITES.map((item) => item.slug)).toEqual(['fox-safari-hurghada', 'fox-safari-makadi-bay', 'power-safari-marsa-alam']);
  });

  it('keeps every new site on a database-valid design, pay later, AI off and alerts on the platform inbox', () => {
    for (const item of FAMILY_SITES) {
      const record = familyTenantRecord(item);
      expect(record.designMode).toBe('desertfox');
      expect(record.status).toBe('active');
      expect(record.domainMigrated).toBe(false);
      expect(record).not.toHaveProperty('customDomain');
      expect(record.paymentSettings).toEqual({ enabledGateways: ['pay-later'], ownPaymentGateway: false, stripe: { enabled: false } });
      expect(record.notificationSettings).toEqual({ bookingEmail: 'theegyptexcursionsonline@gmail.com' });
      expect(Object.values(record.aiSettings as Record<string, { enabled: boolean }>).every((setting) => !setting.enabled)).toBe(true);
      expect(record.logo).toMatch(/^https:\/\/res\.cloudinary\.com\/dm3sxllch\//);
    }
  });

  it('sells a Desert Fox city site trip at the programme price without its ratings, badges or promises', () => {
    const document = familyTripDocument(site('fox-safari-hurghada'), trip('fox-safari-hurghada'), SOURCE, 0, 'tenant-1');
    expect(document).toEqual(expect.objectContaining({
      slug: 'fox-hurghada-super-safari',
      pathSlug: 'super-safari',
      enquiryOnly: false,
      currency: 'USD',
      // The adult rate leads; the child rate (35) never becomes the trip's "from" price.
      priceFrom: 55,
      rating: 0,
      reviewCount: 0,
      instantConfirmation: false,
      hasHotelPickup: true,
      ownerTenantId: 'tenant-1',
      tenantIds: ['tenant-1'],
    }));
    expect(document).not.toHaveProperty('badges');
    expect(document).not.toHaveProperty('cancellationPolicy');
    // One option prices the whole family: adults at 55, children at 35, never adults at the child rate.
    expect(document.pricingOptions).toEqual([
      { id: 'adult', name: 'Full combo', description: 'Quad biking, camel ride and BBQ dinner', price: 55, childPrice: 35 },
    ]);
    expect(document.needToKnow).toEqual(['Children aged 6 to 12 pay the child price. They share a quad and ride their own camel.']);
    expect(document.languages).toEqual(['English', 'Arabic', 'German']);
    expect(document.inclusions).toEqual(['Quad bike with fuel', 'Hotel pickup and drop-off', 'English guide']);
    expect((document.itinerary as Array<{ title: string }>).map((step) => step.title)).toEqual(['Hotel Pickup']);
    expect(document.destination).toEqual(expect.objectContaining({ city: 'Hurghada' }));
  });

  it('sells Power Safari trips at the programme prices, departures and extras, in Marsa Alam', () => {
    expect(FAMILY_SITES.every((item) => item.priced)).toBe(true);
    const document = familyTripDocument(site('power-safari-marsa-alam'), trip('power-safari-marsa-alam'), SOURCE, 0, 'tenant-2');
    expect(document).toEqual(expect.objectContaining({ slug: 'power-safari-super-safari', enquiryOnly: false, currency: 'USD', priceFrom: 55 }));
    expect(document.pricingOptions).toEqual([
      { id: 'adult', name: 'Full combo', description: 'Quad biking, camel ride and BBQ dinner', price: 55, childPrice: 35 },
    ]);
    expect(document.addons).toEqual([{ id: 'shisha', name: 'Shisha at Camp', description: 'At the camp', price: 8 }]);
    expect(document.entryWindows).toEqual([{ label: 'Afternoon Departure', startTime: '14:00', endTime: '14:30' }]);
    expect(document.availability).toEqual({ type: 'time-slots', advanceBooking: 30 });
    expect(document.destination).toEqual(expect.objectContaining({ city: 'Marsa Alam' }));
    expect(document.meetingPoint).toEqual(expect.objectContaining({ address: 'Your hotel in Marsa Alam' }));
    expect(copiedFactProblems(site('power-safari-marsa-alam'), document)).toEqual([]);
    // Its tenant copy invites a booking, not a request for prices.
    expect(familyTenantRecord(site('power-safari-marsa-alam')).description).toMatch(/Book online and pay later/);
    expect(familyTenantRecord(site('power-safari-marsa-alam')).description).not.toMatch(/replies with prices|nothing is paid online/);
  });

  it("turns a site back into enquiries with nothing claimed about another company's guides, times or extras", () => {
    const enquiries = { ...site('power-safari-marsa-alam'), priced: false };
    const document = familyTripDocument(enquiries, trip('power-safari-marsa-alam'), SOURCE, 0, 'tenant-2');
    expect(document).toEqual(expect.objectContaining({ slug: 'power-safari-super-safari', enquiryOnly: true, pricingOptions: [], addons: [], entryWindows: [], languages: [] }));
    expect(document).not.toHaveProperty('priceFrom');
    expect(document.inclusions).toEqual(['Quad bike with fuel', 'Hotel pickup and drop-off', 'Guide']);
    expect((document.itinerary as Array<{ time: string }>).every((step) => step.time === '')).toBe(true);
    expect(document.availability).toEqual({ type: 'date-only', advanceBooking: 30 });
    expect(document.needToKnow).toEqual([]);
  });

  it('sells only the departures a trip names, and stops when the programme no longer has one', () => {
    // Every option of the dinner show ends with dinner, so its morning start is never sold.
    for (const item of FAMILY_SITES) {
      const dinnerShows = FAMILY_SITE_TRIPS[item.slug].filter((entry) => entry.source === 'wild-desert-jeep-quad-buggy-camel-dinner-show');
      expect(dinnerShows).toHaveLength(1);
      expect(dinnerShows[0].departures).toEqual(['Afternoon']);
    }
    const dinnerShow = FAMILY_SITE_TRIPS['power-safari-marsa-alam'].find((entry) => entry.path === 'jeep-combo')!;
    const programme = {
      ...SOURCE,
      slug: 'wild-desert-jeep-quad-buggy-camel-dinner-show',
      pricingOptions: [{ id: 'standard', name: 'All Activities + Dinner (5 hrs)', price: 22 }],
      entryWindows: [
        { _id: 'w1', label: 'Morning', startTime: '08:00', endTime: '09:00' },
        { _id: 'w2', label: 'Afternoon', startTime: '14:00', endTime: '15:00' },
      ],
    };
    const document = familyTripDocument(site('power-safari-marsa-alam'), dinnerShow, programme, 2, 'tenant-2');
    expect(document.entryWindows).toEqual([{ label: 'Afternoon', startTime: '14:00', endTime: '15:00' }]);
    expect(familyDepartures('x', programme.entryWindows, undefined)).toHaveLength(2);
    expect(() => familyTripDocument(site('power-safari-marsa-alam'), dinnerShow, { ...programme, entryWindows: [programme.entryWindows[0]] }, 2, 'tenant-2'))
      .toThrow('power-safari-jeep-combo: departure "Afternoon" is missing from the programme.');
  });

  it("refuses copied programme text that names a place or brand the site does not carry", () => {
    const named = { ...SOURCE, addons: [{ id: 'vip', name: 'Desert Fox VIP table', description: 'Dinner by the dunes of Hurghada', price: 20 }] };
    const power = familyTripDocument(site('power-safari-marsa-alam'), trip('power-safari-marsa-alam'), named, 0, 'tenant-2');
    expect(copiedFactProblems(site('power-safari-marsa-alam'), power)).toEqual([
      'power-safari-super-safari: copied text names another place or brand, or makes a claim: "Desert Fox VIP table"',
      'power-safari-super-safari: copied text names another place or brand, or makes a claim: "Dinner by the dunes of Hurghada"',
    ]);
    // Hurghada is the Hurghada site's own city and Desert Fox its own family.
    const hurghada = familyTripDocument(site('fox-safari-hurghada'), trip('fox-safari-hurghada'), named, 0, 'tenant-1');
    expect(copiedFactProblems(site('fox-safari-hurghada'), hurghada)).toEqual([]);
    const claimed = { ...SOURCE, pricingOptions: [{ id: 'standard', name: 'Our best seller', price: 30 }] };
    expect(copiedFactProblems(site('fox-safari-hurghada'), familyTripDocument(site('fox-safari-hurghada'), FAMILY_SITE_TRIPS['fox-safari-hurghada'][1], { ...claimed, slug: 'wild-desert-quad-atv-camel-bbq' }, 1, 'tenant-1')))
      .toEqual(['fox-hurghada-quad-camel: copied text names another place or brand, or makes a claim: "Our best seller"']);
  });

  it('prices a whole jeep or a double quad once, not per rider', () => {
    const jeep = familyPricing('desert-fox-private-jeep-safari', [
      { _id: 'o1', id: 'vehicle', name: 'Private Jeep (up to 4)', description: 'Entire vehicle for your group', price: 65 },
    ]);
    expect(jeep.options).toEqual([
      { id: 'vehicle', name: 'Private Jeep (up to 4)', description: 'Entire vehicle for your group', price: 65, pricingModel: 'per-booking', minParticipants: 1, maxParticipants: 4 },
    ]);
    expect(jeep.notes).toEqual(['The price is for the whole jeep, for up to 4 people.']);

    const quad = familyPricing('desert-fox-sunset-quad-safari', [
      { _id: 'o1', id: 'adult', name: 'Adult (Single Quad)', description: 'One rider per quad bike', price: 35 },
      { _id: 'o2', id: 'double', name: 'Double Quad', description: 'Two riders per quad bike', price: 50 },
    ]);
    expect(quad.options).toEqual([
      { id: 'adult', name: 'Adult (Single Quad)', description: 'One rider per quad bike', price: 35 },
      { id: 'double', name: 'Double Quad', description: 'Two riders per quad bike', price: 50, pricingModel: 'per-booking', minParticipants: 1, maxParticipants: 2 },
    ]);
  });

  it('stops instead of selling a family the wrong price', () => {
    // A separate child rate with no written terms for this programme.
    expect(() => familyPricing('desert-fox-sandboarding-adventure', [
      { id: 'adult', name: 'Adult', price: 30 },
      { id: 'child', name: 'Child (8-14)', price: 20 },
    ])).toThrow(/FAMILY_CHILD_TERMS/);
    // The programme no longer has the vehicle option its terms describe.
    expect(() => familyPricing('desert-fox-private-jeep-safari', [{ id: 'group', name: 'Group', price: 65 }])).toThrow(/vehicle option/);
    // Options with no child rate and no vehicle terms pass through unchanged.
    expect(familyPricing('wild-desert-quad-atv-private-experience', [{ _id: 'x', id: '3hr', name: '3-Hour Private', price: 30 }]))
      .toEqual({ options: [{ id: '3hr', name: '3-Hour Private', price: 30 }], notes: [] });
  });

  it("states a trip's own length where the programme's contradicts its options", () => {
    const privateQuad = FAMILY_SITE_TRIPS['fox-safari-hurghada'].find((item) => item.path === 'private-quad')!;
    const document = familyTripDocument(site('fox-safari-hurghada'), privateQuad, { ...SOURCE, duration: '4 hours' }, 0, 'tenant-1');
    expect(document.duration).toBe('3 or 5 hours');
    expect(familyTripDocument(site('fox-safari-hurghada'), trip('fox-safari-hurghada'), SOURCE, 0, 'tenant-1').duration).toBe('5 hours');
  });

  it('recognises the claims the network cannot back', () => {
    for (const claim of ['Our #1 bestseller', '1,800+ five-star reviews', 'Rated 4.6★', 'Small group (max 8 buggies)', 'Skip-the-line', 'Free cancellation up to 24 hours']) {
      expect(UNBACKED_CLAIMS.test(claim)).toBe(true);
    }
    for (const fact of ['Quad bike and camel ride', 'Hotel pickup and drop-off', 'Child price for ages 4 to 11']) {
      expect(UNBACKED_CLAIMS.test(fact)).toBe(false);
    }
  });
});
