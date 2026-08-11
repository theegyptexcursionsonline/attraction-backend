import fs from 'fs';
import path from 'path';

const source = (file: string) => fs.readFileSync(path.resolve(__dirname, `../routes/${file}`), 'utf8');

describe('Bundle to Win route permission matrix', () => {
  it('keeps bundle composition, publishing, refunds, and settlement release Super Admin only', () => {
    const bundles = source('bundles.routes.ts');
    const orders = source('bundleOrders.routes.ts');
    expect(bundles).toMatch(/router\.post\('\/admin', authenticate, requireSuperAdmin/s);
    expect(bundles).toMatch(/'\/admin\/:id\/status\/:status',[\s\S]*requireSuperAdmin/s);
    expect(orders).toMatch(/'\/admin\/:id\/refund',[\s\S]*requireSuperAdmin/s);
    expect(orders).toMatch(/release-settlement',[\s\S]*requireSuperAdmin/s);
    expect(orders).toMatch(/mark-settled',[\s\S]*requireSuperAdmin/s);
    expect(orders).toMatch(/'\/admin\/:id\/recover',[\s\S]*requireBundleFeature\('recovery'\)[\s\S]*requireSuperAdmin/s);
  });

  it('allows only commercial supplier admins to mutate offers', () => {
    const offers = source('bundleSupplyOffers.routes.ts');
    expect(offers).toContain("router.use(authenticate, requireRole('super-admin', 'brand-admin'), optionalTenant)");
    expect(offers).not.toContain("'manager'");
    expect(offers).not.toContain("'editor'");
    expect(offers).not.toContain("'viewer'");
  });

  it('requires feature gates, tenant context, validation, and rate limits on checkout writes', () => {
    const bundles = source('bundles.routes.ts');
    const orders = source('bundleOrders.routes.ts');
    expect(bundles).toMatch(/'\/:slug\/quote',[\s\S]*requireBundleFeature\('checkout'\)[\s\S]*requireTenant[\s\S]*validate\(createBundleQuoteSchema\)/s);
    expect(orders).toMatch(/router\.post\([\s\S]*requireBundleFeature\('checkout'\)[\s\S]*bookingLimiter[\s\S]*requireTenant[\s\S]*validate\(createBundleOrderSchema\)/s);
    expect(orders).toMatch(/'\/:id\/payment-intent',[\s\S]*paymentLimiter[\s\S]*requireTenant/s);
    expect(orders).toMatch(/'\/:id\/cancel',[\s\S]*optionalAuth[\s\S]*validate\(cancelBundleOrderSchema\)/s);
  });
});
