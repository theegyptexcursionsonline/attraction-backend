import {
  GRAND_ROCK_HERO_SOURCES,
  GRAND_ROCK_SOURCE_LOGO,
  GRAND_ROCK_TENANT,
  GRAND_ROCK_TOURS,
  catalogueCollision,
  isApprovedSourceAsset,
  validateGrandRockPlan,
} from '../scripts/seed-grand-rock-safari';

describe('Grand Rock Safari seed contract', () => {
  it('is a valid launch package for an unmigrated domain on the savanna design', () => {
    expect(validateGrandRockPlan()).toEqual([]);
    expect(GRAND_ROCK_TENANT.designMode).toBe('savanna');
    expect(GRAND_ROCK_TENANT.domainMigrated).toBe(false);
    expect(GRAND_ROCK_TENANT.customDomainStatus).toBe('unconfigured');
    expect(GRAND_ROCK_TENANT.customDomain).toBe('grandrocksafari.com');
    expect(GRAND_ROCK_TENANT.defaultCurrency).toBe('EUR');
    expect(GRAND_ROCK_TENANT.flatUrls).toBe(false);
  });

  it("uses the operator's published contact points and social profiles only", () => {
    expect(GRAND_ROCK_TENANT.contactInfo).toEqual(expect.objectContaining({
      email: 'info@grandrocksafari.com',
      phone: '+20 103 230 0489',
      whatsapp: '+201032300489',
    }));
    expect(GRAND_ROCK_TENANT.socialLinks).toEqual({
      facebook: 'https://www.facebook.com/GrandRockSafari',
      instagram: 'https://www.instagram.com/_grandrocksafari_',
      tiktok: 'https://www.tiktok.com/@grand.rock.safari',
    });
    expect(GRAND_ROCK_TENANT.theme).toEqual({ primaryColor: '#13478A', secondaryColor: '#0A2547', accentColor: '#F79508' });
  });

  it('keeps booking alerts away from the operator inbox and takes no online payment', () => {
    expect(GRAND_ROCK_TENANT.notificationSettings.bookingEmail).toBe('theegyptexcursionsonline@gmail.com');
    expect(GRAND_ROCK_TENANT.paymentSettings).toEqual({ enabledGateways: ['pay-later'], ownPaymentGateway: false, stripe: { enabled: false } });
    expect(GRAND_ROCK_TENANT.bundleSettings.mode).toBe('off');
  });

  it('carries the nine published tours at their published prices', () => {
    expect(GRAND_ROCK_TOURS.map((tour) => [tour.slug, tour.pricingOptions.map((option) => [option.price, option.originalPrice ?? null])])).toEqual([
      ['quad-safari-vip', [[40, null]]],
      ['buggy-car-safari-2-seats', [[100, 120]]],
      ['buggy-car-safari-4-seats', [[150, 160]]],
      ['horse-riding-by-the-sea', [[35, null]]],
      ['motocross-ktm-350cc-vip', [[130, 160]]],
      ['motocross-ktm-530cc-vip', [[130, 160]]],
      ['motocross-yamaha-250cc-vip', [[80, 100]]],
      ['private-speed-boat-snorkeling-sahl-hasheesh', [[120, 150]]],
      ['private-speed-boat-fishing-sahl-hasheesh', [[130, 150]]],
    ]);
    expect(GRAND_ROCK_TOURS.filter((tour) => tour.city === 'Sahl Hasheesh').map((tour) => tour.category)).toEqual(['Sea Trips', 'Sea Trips']);
    expect(GRAND_ROCK_TOURS.filter((tour) => tour.city === 'Makadi Bay')).toHaveLength(7);
  });

  it('prices buggies and private boats once per vehicle with a seat limit', () => {
    const bounds = Object.fromEntries(GRAND_ROCK_TOURS.map((tour) => [tour.slug, tour.pricingOptions.map((option) => [option.pricingModel, option.minParticipants, option.maxParticipants])]));
    expect(bounds['buggy-car-safari-2-seats']).toEqual([['per-booking', 1, 2]]);
    expect(bounds['buggy-car-safari-4-seats']).toEqual([['per-booking', 1, 4]]);
    expect(bounds['private-speed-boat-snorkeling-sahl-hasheesh']).toEqual([['per-booking', 1, 6]]);
    expect(bounds['private-speed-boat-fishing-sahl-hasheesh']).toEqual([['per-booking', 1, 6]]);
    for (const slug of ['quad-safari-vip', 'horse-riding-by-the-sea', 'motocross-ktm-350cc-vip', 'motocross-ktm-530cc-vip', 'motocross-yamaha-250cc-vip']) {
      expect(bounds[slug][0][0]).toBe('per-person');
    }
  });

  it('never publishes a claim the source contradicts or does not make', () => {
    const horse = GRAND_ROCK_TOURS.find((tour) => tour.slug === 'horse-riding-by-the-sea');
    const horseCopy = JSON.stringify([horse?.description, horse?.highlights, horse?.inclusions, horse?.exclusions]).toLowerCase();
    expect(horseCopy).not.toMatch(/photo/);
    expect(horse?.openDecisions.some((item) => item.includes('Photographer Service'))).toBe(true);
    for (const tour of GRAND_ROCK_TOURS) {
      const copy = JSON.stringify([tour.description, tour.shortDescription, tour.highlights, tour.needToKnow]).toLowerCase();
      expect(copy).not.toMatch(/free cancellation|years of experience|\bbest\b|\baward/);
    }
  });

  it('only mirrors images from the operator media library', () => {
    expect(isApprovedSourceAsset(GRAND_ROCK_SOURCE_LOGO)).toBe(true);
    expect(GRAND_ROCK_HERO_SOURCES.every(isApprovedSourceAsset)).toBe(true);
    expect(GRAND_ROCK_TOURS.every((tour) => tour.sourceImages.length >= 3 && tour.sourceImages.every(isApprovedSourceAsset))).toBe(true);
    expect(isApprovedSourceAsset('https://grandrocksafari.com/wp-content/uploads/2025/01/a.jpg')).toBe(true);
    expect(isApprovedSourceAsset('http://grandrocksafari.com/wp-content/uploads/2025/01/a.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://grandrocksafari.com.evil.test/wp-content/uploads/a.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://grandrocksafari.com/tours/a.jpg')).toBe(false);
    expect(isApprovedSourceAsset('https://grandrocksafari.com/wp-content/uploads/a.jpg?w=10')).toBe(false);
    expect(isApprovedSourceAsset('not a url')).toBe(false);
  });

  it('refuses to touch a tour slug another site owns or lists', () => {
    expect(catalogueCollision([])).toBeNull();
    expect(catalogueCollision([{ slug: 'quad-safari-vip', ownedByGrandRock: true, hasOwner: true, listedByOtherTenant: false }])).toBeNull();
    expect(catalogueCollision([{ slug: 'quad-safari-vip', ownedByGrandRock: false, hasOwner: true, listedByOtherTenant: false }]))
      .toBe('Refusing cross-tenant catalogue overwrite: quad-safari-vip.');
    expect(catalogueCollision([{ slug: 'quad-safari-vip', ownedByGrandRock: true, hasOwner: true, listedByOtherTenant: true }]))
      .toBe('Refusing cross-tenant catalogue overwrite: quad-safari-vip.');
    expect(catalogueCollision([{ slug: 'quad-safari-vip', ownedByGrandRock: false, hasOwner: false, listedByOtherTenant: false }]))
      .toBe('Refusing to adopt an unowned catalogue record: quad-safari-vip.');
  });
});
