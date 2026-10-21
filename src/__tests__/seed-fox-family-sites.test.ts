import {
  FAMILY_SITES,
  UNBACKED_CLAIMS,
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

  it("asks instead of selling on Power Safari, and claims nothing about another company's guides, times or extras", () => {
    const document = familyTripDocument(site('power-safari-marsa-alam'), trip('power-safari-marsa-alam'), SOURCE, 0, 'tenant-2');
    expect(document).toEqual(expect.objectContaining({ slug: 'power-safari-super-safari', enquiryOnly: true, pricingOptions: [], addons: [], entryWindows: [], languages: [] }));
    expect(document).not.toHaveProperty('priceFrom');
    expect(document.inclusions).toEqual(['Quad bike with fuel', 'Hotel pickup and drop-off', 'Guide']);
    expect((document.itinerary as Array<{ time: string }>).every((step) => step.time === '')).toBe(true);
    expect(document.availability).toEqual({ type: 'date-only', advanceBooking: 30 });
    expect(document.needToKnow).toEqual([]);
    expect(document.destination).toEqual(expect.objectContaining({ city: 'Marsa Alam' }));
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
