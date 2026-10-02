import { Types } from 'mongoose';
import { localizedPresentation, localizationIdentity, translationSourceTemplate, validateTranslationSource, attractionTranslationContent } from '../services/attractionLocalization.service';
import { localizationSourceProjection, sourceSnapshot } from '../services/localizationSourceSnapshot.service';
import { routeClosure } from '../services/publicRouteComposition.service';
import { serviceFeeOn } from '../utils/serviceFee';

const owner = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
const source = { _id: new Types.ObjectId(), tenantIds: [owner], status: 'active', title: 'Trip', shortDescription: 'Summary', description: 'Source', duration: '2 hours', images: [], pricingOptions: [], addons: [], updatedAt: new Date('2026-01-01'), priceFrom: 49, currency: 'EUR' };
const content = attractionTranslationContent.parse(translationSourceTemplate(source));
const rows = ['ar', 'de', 'ru', 'fr'].map(locale => ({ tenantId: owner, attractionId: source._id, status: 'published', locale, slug: `trip-${locale}`, sourceSnapshot: sourceSnapshot('tour', source), content }));

describe('packages cannot inherit native tour publication', () => {
  test.each([{ listingType: 'package' }, { packageDetails: { version: 1, itinerary: [{ title: 'Source itinerary' }] } }])('rejects legacy translation qualification with %j', patch => {
    const packageSource = { ...source, ...patch, __translations: rows };
    expect(() => validateTranslationSource(packageSource, content)).toThrow('complete package translation contract');
    for (const locale of ['ar', 'de', 'ru', 'fr'] as const) {
      expect(localizationIdentity(packageSource, locale)).toMatchObject({ resolvedLocale: 'en', translationStatus: 'missing', localizedSlugs: {} });
      expect(localizedPresentation(packageSource, packageSource, locale)).toMatchObject({ title: source.title, priceFrom: 49, currency: 'EUR', resolvedLocale: 'en', translationStatus: 'missing' });
    }
    const tenant = { _id: owner, slug: 'grand-rock-safari', customDomain: 'grandrocksafari.com', status: 'active', designMode: 'savanna' };
    const closure = routeClosure({ tenantSlug: 'grand-rock-safari', domain: 'grandrocksafari.com', route: 'home', locale: 'ar' }, tenant, { _id: String(owner), slug: tenant.slug, publishedPresentationLocales: ['ar', 'de', 'ru', 'fr'] });
    closure.push('tour', packageSource);
    expect(closure.finish().receipt.contentLocales).toEqual([]);
  });
  test('keeps existing tour snapshots and all four reviewed tour translations unchanged', () => {
    const tour = { ...source, __translations: rows };
    expect(sourceSnapshot('tour', { ...source, listingType: 'tour' })).toEqual(sourceSnapshot('tour', source));
    for (const locale of ['ar', 'de', 'ru', 'fr'] as const) expect(localizationIdentity(tour, locale)).toMatchObject({ resolvedLocale: locale, translationStatus: 'translated' });
    expect(localizationSourceProjection('tour')).toMatchObject({ listingType: 1, packageDetails: 1 });
    expect(localizationSourceProjection('destination')).not.toHaveProperty('packageDetails');
  });
  test.each([0, 0.1, 40, 100, 150, 130, 999.99])('preserves the exact existing tour fee for subtotal %s', subtotal => {
    expect(serviceFeeOn(subtotal)).toBe(Math.round(subtotal * 0.05 * 100) / 100);
  });
});
