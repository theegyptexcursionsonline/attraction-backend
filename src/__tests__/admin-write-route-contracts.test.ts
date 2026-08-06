import fs from 'fs';
import path from 'path';

const source = (file: string) => fs.readFileSync(path.resolve(__dirname, `../routes/${file}`), 'utf8');

describe('admin write route contracts', () => {
  it('keeps site creation Super Admin only and settings Brand Admin or stronger', () => {
    const routes = source('tenants.routes.ts');
    expect(routes).toMatch(/router\.post\(\s*['"]\/['"],\s*authenticate,\s*requireSuperAdmin,/s);
    expect(routes).toMatch(/['"]\/:id\/settings['"],\s*authenticate,\s*requireRole\('super-admin', 'brand-admin'\),/s);
  });

  it.each([
    ['attractions.routes.ts', "requireRole('super-admin', 'brand-admin', 'manager'), blockDates"],
    ['promo.routes.ts', "requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, createPromoCode"],
    ['reviews.routes.ts', "requireRole('super-admin', 'brand-admin', 'manager'), updateReviewStatus"],
    ['rsvps.routes.ts', "requireRole('super-admin', 'brand-admin', 'manager'), updateRsvpStatus"],
    ['preview.routes.ts', "requireRole('super-admin', 'brand-admin'), getPreviewCode"],
  ])('%s blocks editor/viewer mutation at the route boundary', (file, contract) => {
    expect(source(file)).toContain(contract);
  });

  it.each([
    ['promo.routes.ts', "requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, getPromoCodes"],
    ['specialOffers.routes.ts', "requireRole('super-admin', 'brand-admin', 'manager'), getOfferStats"],
    ['reviews.routes.ts', "requireRole('super-admin', 'brand-admin', 'manager'), getAdminReviews"],
    ['rsvps.routes.ts', "requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, getAllRsvps"],
    ['users.routes.ts', "requireRole('super-admin', 'brand-admin', 'manager'),"],
    ['apiKeys.routes.ts', "requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, listApiKeys"],
    ['bookings.routes.ts', "requireRole('super-admin', 'brand-admin', 'manager'), optionalTenant, getSettlement"],
  ])('%s protects operational or PII reads from editor/viewer roles', (file, contract) => {
    expect(source(file)).toContain(contract);
  });

  it('keeps attraction archival aligned with the UI permission matrix', () => {
    expect(source('attractions.routes.ts')).toMatch(
      /router\.delete\(\s*['"]\/:id['"],\s*authenticate,\s*requireRole\('super-admin', 'brand-admin'\),/s
    );
  });
});
