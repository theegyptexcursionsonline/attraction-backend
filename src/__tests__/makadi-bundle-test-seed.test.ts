import {
  buildMakadiTestSeedManifest,
  MAKADI_TEST_BUNDLE_SLUG,
  MAKADI_TEST_TERMS_VERSION,
  pendingBundleSeedTransitions,
  pendingOfferSeedTransitions,
} from '../bundles/makadiTestSeed';

describe('Makadi TEST Bundle seed contract', () => {
  it('uses three unique attractions owned by three supplier tenants', () => {
    const manifest = buildMakadiTestSeedManifest();
    expect(manifest.offers).toHaveLength(3);
    expect(new Set(manifest.offers.map((offer) => offer.attractionSlug))).toHaveProperty('size', 3);
    expect(new Set(manifest.offers.map((offer) => offer.supplierTenantSlug))).toHaveProperty('size', 3);
    expect(manifest.offers.map((offer) => offer.capacityDate)).toEqual([
      '2027-01-12T00:00:00.000Z',
      '2027-01-13T00:00:00.000Z',
      '2027-01-14T00:00:00.000Z',
    ]);
    expect(manifest.offers.every((offer) => offer.startTime === '08:00')).toBe(true);
  });

  it('is visibly TEST-only and keeps a stable idempotency identity', () => {
    const manifest = buildMakadiTestSeedManifest();
    expect(manifest.bundleSlug).toBe(MAKADI_TEST_BUNDLE_SLUG);
    expect(manifest.termsVersion).toBe(MAKADI_TEST_TERMS_VERSION);
    expect(`${manifest.bundle.title} ${manifest.bundle.description} ${manifest.bundle.category}`)
      .toMatch(/TEST/);
    expect(manifest.bundle.description).toMatch(/not a live commercial supplier commitment/i);
  });

  it('keeps customer prices above supplier returns and fixed obligations', () => {
    expect(() => buildMakadiTestSeedManifest()).not.toThrow();
  });

  it('resumes interrupted state transitions without replaying completed commands', () => {
    expect(pendingOfferSeedTransitions('draft')).toEqual(['submitted', 'approved', 'active']);
    expect(pendingOfferSeedTransitions('submitted')).toEqual(['approved', 'active']);
    expect(pendingOfferSeedTransitions('approved')).toEqual(['active']);
    expect(pendingOfferSeedTransitions('active')).toEqual([]);
    expect(pendingBundleSeedTransitions('in_review')).toEqual(['approved', 'published']);
    expect(pendingBundleSeedTransitions('published')).toEqual([]);
  });

  it('fails closed instead of modifying terminal or paused records', () => {
    expect(() => pendingOfferSeedTransitions('paused')).toThrow(/cannot resume/i);
    expect(() => pendingBundleSeedTransitions('retired')).toThrow(/cannot resume/i);
  });
});
