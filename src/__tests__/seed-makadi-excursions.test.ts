import {
  MAKADI_HERO_TOUR_PATHS,
  MAKADI_EXCURSIONS_TENANT,
  MAKADI_EXCURSIONS_TOURS,
  validateMakadiExcursionsPlan,
} from '../scripts/seed-makadi-excursions';

describe('Makadi Excursions seed contract', () => {
  it('is a valid, inactive launch package with nine source tours', () => {
    expect(validateMakadiExcursionsPlan()).toEqual([]);
    expect(MAKADI_EXCURSIONS_TENANT.status).toBe('coming_soon');
    expect(MAKADI_EXCURSIONS_TENANT.domainMigrated).toBe(false);
    expect(MAKADI_EXCURSIONS_TENANT.designMode).toBe('meridian');
    expect(MAKADI_EXCURSIONS_TOURS).toHaveLength(9);
  });

  it('uses the source-site logo, contact record, catalog images, and no invented social profiles', () => {
    expect(MAKADI_EXCURSIONS_TENANT.logo).toBe(
      'https://www.makadi-excursions.com/wp-content/uploads/2025/12/logo_white_transparent.png'
    );
    expect(MAKADI_EXCURSIONS_TENANT.contactInfo).toEqual(expect.objectContaining({
      email: 'contact@makadi-excursions.com',
      phone: '+20 100 374 5505 / +31 6 16 93 75 22',
      address: expect.stringContaining('Makadi Bay'),
    }));
    expect(MAKADI_EXCURSIONS_TENANT.socialLinks).toEqual({});
    expect(MAKADI_EXCURSIONS_TOURS.every((tour) => (
      tour.sourceImage.startsWith('https://www.makadi-excursions.com/wp-content/uploads/')
    ))).toBe(true);
    expect(MAKADI_HERO_TOUR_PATHS).toEqual([
      'marsa-alam-quad-tour',
      'makadi-quad-tour',
      'makadi-spider-buggy',
    ]);
    expect(MAKADI_EXCURSIONS_TOURS.map((tour) => [tour.title, tour.priceFrom])).toEqual([
      ['Makadi Bay Camel Ride', 15],
      ['Makadi Bay Desert Adventure, Dinner & Show', 35],
      ['Makadi Bay Quad Tour', 15],
      ['Makadi Bay Spider Buggy Tour', 50],
      ['Makadi Bay Horse Riding Tour', 15],
      ['Marsa Alam Spider Buggy Tour', 250],
      ['Marsa Alam Horse Riding Tour', 50],
      ['Marsa Alam Desert Adventure, Dinner & Show', 50],
      ['Marsa Alam Quad Tour', 30],
    ]);
  });

  it('models both buggy products as bounded once-per-booking packages', () => {
    const buggyTours = MAKADI_EXCURSIONS_TOURS.filter((tour) => tour.pathSlug.includes('spider-buggy'));
    expect(buggyTours).toHaveLength(2);
    for (const tour of buggyTours) {
      expect(tour.pricingOptions).toEqual(expect.arrayContaining([
        expect.objectContaining({ pricingModel: 'per-booking', minParticipants: 1, maxParticipants: 2 }),
        expect.objectContaining({ pricingModel: 'per-booking', minParticipants: 3, maxParticipants: 4 }),
      ]));
    }
  });

  it('keeps the El Gouna transfer per paying guest and only on Makadi tours', () => {
    for (const tour of MAKADI_EXCURSIONS_TOURS) {
      const transfer = tour.addons.find((addon) => addon.id === 'el-gouna-transfer');
      if (tour.city === 'Makadi Bay') {
        expect(transfer).toEqual(expect.objectContaining({ price: 10, pricingModel: 'per-person' }));
      } else {
        expect(transfer).toBeUndefined();
      }
    }
  });
});
