import { calculateAddonPrice, calculateTourLinePrice, minimumTourPrice } from '../utils/attractionPricing';
import { createAttractionRequestSchema, createAttractionSchema } from '../utils/validators';
import { Attraction } from '../models/Attraction';

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
        pricingModel: 'per-person',
      },
    });
  });

  it('charges a fixed package once and snapshots the pricing model', () => {
    expect(calculateTourLinePrice({
      option: { price: 75, pricingModel: 'per-booking', minParticipants: 3, maxParticipants: 4 },
      quantities: { adults: 2, children: 2, infants: 0 },
    })).toEqual({
      totalPrice: 75,
      unitPrice: 75,
      pricingBreakdown: {
        adultUnitPrice: 75,
        childUnitPrice: 0,
        infantUnitPrice: 0,
        discountPercentage: 0,
        pricingModel: 'per-booking',
        packagePrice: 75,
        participantCount: 4,
        minParticipants: 3,
        maxParticipants: 4,
      },
    });
  });

  it('keeps legacy add-ons per booking and supports paying-guest add-ons', () => {
    const quantities = { adults: 2, children: 1, infants: 1 };
    expect(calculateAddonPrice({ price: 10 }, quantities)).toEqual({
      pricingModel: 'per-booking', quantity: 1, totalPrice: 10,
    });
    expect(calculateAddonPrice({ price: 10, pricingModel: 'per-person' }, quantities)).toEqual({
      pricingModel: 'per-person', quantity: 3, totalPrice: 30,
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

  it('validates package participant bounds and rejects category prices on a package', () => {
    const accepted = createAttractionSchema.safeParse({
      ...baseTour,
      pricingOptions: [{
        id: 'buggy-3-4', name: 'Buggy for 3-4 people', price: 75,
        pricingModel: 'per-booking', minParticipants: 3, maxParticipants: 4,
      }],
      addons: [{ id: 'transfer', name: 'El Gouna transfer', price: 10, pricingModel: 'per-person' }],
    });
    expect(accepted.success).toBe(true);

    const reversed = createAttractionSchema.safeParse({
      ...baseTour,
      pricingOptions: [{
        id: 'bad-package', name: 'Bad package', price: 75,
        pricingModel: 'per-booking', minParticipants: 4, maxParticipants: 2,
      }],
    });
    expect(reversed.success).toBe(false);
    expect(reversed.error?.issues[0]).toMatchObject({
      path: ['pricingOptions', 0, 'maxParticipants'],
    });

    const categoryPrice = createAttractionSchema.safeParse({
      ...baseTour,
      pricingOptions: [{
        id: 'bad-package', name: 'Bad package', price: 75,
        pricingModel: 'per-booking', childPrice: 20,
      }],
    });
    expect(categoryPrice.success).toBe(false);
    expect(categoryPrice.error?.issues[0]).toMatchObject({
      path: ['pricingOptions', 0, 'pricingModel'],
    });
  });

  it('rejects duplicate catalog ids in both the HTTP and direct-model paths', () => {
    const duplicateHttp = createAttractionSchema.safeParse({
      ...baseTour,
      pricingOptions: [
        { id: 'same', name: 'One', price: 10 },
        { id: 'same', name: 'Two', price: 20 },
      ],
      addons: [
        { id: 'transfer', name: 'Transfer one', price: 5 },
        { id: 'transfer', name: 'Transfer two', price: 6 },
      ],
    });
    expect(duplicateHttp.success).toBe(false);
    expect(duplicateHttp.error?.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining(['pricingOptions.1.id', 'addons.1.id'])
    );

    const duplicateModel = new Attraction({
      ...baseTour,
      images: ['https://res.cloudinary.com/example/image/upload/tour.jpg'],
      pricingOptions: [
        { id: 'same', name: 'One', price: 10 },
        { id: 'same', name: 'Two', price: 20 },
      ],
    });
    expect(duplicateModel.validateSync()?.errors.pricingOptions?.message).toBe('Pricing option IDs must be unique');
  });

  it('enforces package bounds for scripts that bypass the HTTP schema', () => {
    const direct = new Attraction({
      ...baseTour,
      images: ['https://res.cloudinary.com/example/image/upload/tour.jpg'],
      pricingOptions: [{
        id: 'buggy', name: 'Buggy', price: 75, pricingModel: 'per-booking',
        minParticipants: 4, maxParticipants: 2,
      }],
    });
    expect(direct.validateSync()?.errors['pricingOptions.0.maxParticipants']?.message)
      .toBe('Maximum participants must be at least the minimum participants');
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
