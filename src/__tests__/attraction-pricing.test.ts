import { calculateTourLinePrice, minimumTourPrice } from '../utils/attractionPricing';
import { createAttractionRequestSchema, createAttractionSchema } from '../utils/validators';

const baseTour = {
  slug: 'reef-trip',
  title: 'Reef trip',
  shortDescription: 'A reef trip',
  description: 'A complete reef trip',
  category: 'boat-trips',
  destination: { city: 'Hurghada', country: 'Egypt', coordinates: { lat: 27.25, lng: 33.81 } },
  duration: '4 hours',
  priceFrom: 10,
  currency: 'USD',
  pricingOptions: [{ id: 'shared', name: 'Shared tour', price: 100 }],
};

describe('tour pricing options', () => {
  it('accepts a title-only draft but keeps the publish contract complete', () => {
    expect(createAttractionRequestSchema.safeParse({
      slug: 'unfinished-reef-trip',
      title: 'Unfinished reef trip',
      status: 'draft',
      tenantIds: [],
    }).success).toBe(true);

    expect(createAttractionRequestSchema.safeParse({
      slug: 'unfinished-reef-trip',
      title: 'Unfinished reef trip',
      status: 'active',
      tenantIds: [],
    }).success).toBe(false);
  });

  it('prices adults, children and infants independently and applies the option discount', () => {
    expect(calculateTourLinePrice({
      option: { price: 100, childPrice: 50, infantPrice: 10, discountPercentage: 20 },
      quantities: { adults: 2, children: 1, infants: 1 },
    })).toEqual({
      totalPrice: 208,
      unitPrice: 52,
      pricingBreakdown: {
        adultUnitPrice: 80,
        childUnitPrice: 40,
        infantUnitPrice: 8,
        discountPercentage: 20,
      },
    });
  });

  it('uses prices from the selected slot and falls back by category', () => {
    expect(calculateTourLinePrice({
      option: {
        price: 90,
        childPrice: 45,
        infantPrice: 5,
        timeSlots: [{ id: 'sunset', label: 'Sunset', startTime: '16:00', adultPrice: 120, childPrice: 60 }],
      },
      time: '16:00',
      quantities: { adults: 1, children: 2, infants: 1 },
    }).totalPrice).toBe(245);
  });

  it('preserves legacy child and entry-window behavior', () => {
    expect(calculateTourLinePrice({
      option: { price: 75 },
      legacyEntryWindows: [{ startTime: '09:00', price: 50 }],
      time: '09:00',
      quantities: { adults: 1, children: 1, infants: 2 },
    }).totalPrice).toBe(100);
  });

  it('accepts nested slot pricing and rejects invalid fields with exact paths', () => {
    const accepted = createAttractionSchema.safeParse({
      ...baseTour,
      pricingOptions: [{
        id: 'private', name: 'Private', price: 100, childPrice: 50, infantPrice: 0,
        discountPercentage: 15,
        timeSlots: [{ id: 'morning', label: 'Morning', startTime: '09:00', endTime: '12:00', adultPrice: 120 }],
      }],
    });
    expect(accepted.success).toBe(true);

    const rejected = createAttractionSchema.safeParse({
      ...baseTour,
      pricingOptions: [{ id: 'private', name: 'Private', price: 100, discountPercentage: 100 }],
    });
    expect(rejected.success).toBe(false);
    expect(rejected.error?.issues[0]).toMatchObject({
      path: ['pricingOptions', 0, 'discountPercentage'],
      message: 'Discount must be below 100%',
    });
  });

  it('derives the listing price from the lowest adult option or slot after discount', () => {
    expect(minimumTourPrice([{
      price: 100,
      childPrice: 50,
      infantPrice: 0,
      discountPercentage: 20,
      timeSlots: [{ id: 'morning', label: 'Morning', startTime: '09:00', adultPrice: 80, childPrice: 40 }],
    }])).toBe(64);
  });
});
