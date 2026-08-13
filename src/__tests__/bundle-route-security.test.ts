import fs from 'fs';
import path from 'path';

const source = (file: string) => fs.readFileSync(path.resolve(__dirname, `../routes/${file}`), 'utf8');
const sourceFrom = (file: string) => fs.readFileSync(path.resolve(__dirname, `../${file}`), 'utf8');

describe('Bundle to Win route permission matrix', () => {
  it('keeps bundle composition, publishing, refunds, and settlement release Super Admin only', () => {
    const bundles = source('bundles.routes.ts');
    const orders = source('bundleOrders.routes.ts');
    expect(bundles).toMatch(/router\.post\('\/admin', authenticate, requireSuperAdmin/s);
    expect(bundles).toMatch(/'\/admin\/:id\/status\/:status',[\s\S]*requireSuperAdmin/s);
    expect(orders).toMatch(/'\/admin\/:id\/refund',[\s\S]*requireSuperAdmin/s);
    expect(orders).toMatch(/release-settlement',[\s\S]*requireSuperAdmin/s);
    expect(orders).toMatch(/mark-settled',[\s\S]*requireSuperAdmin/s);
    expect(orders).toMatch(/resolve-settlement-dispute',[\s\S]*requireSuperAdmin[\s\S]*validate\(bundleSettlementDisputeSchema\)/s);
    expect(orders).toMatch(/'\/admin\/:id\/recover',[\s\S]*requireBundleFeature\('recovery'\)[\s\S]*requireSuperAdmin/s);
    expect(bundles).toMatch(/router\.put\([\s\S]*'\/admin\/readiness',[\s\S]*requireSuperAdmin[\s\S]*validate\(updateBundleLaunchModeSchema\)/s);
  });

  it('exposes tenant-scoped readiness without exposing cross-tenant launch mutation', () => {
    const bundles = source('bundles.routes.ts');
    expect(bundles).toMatch(/router\.get\([\s\S]*'\/admin\/readiness',[\s\S]*requireRole\('super-admin', 'brand-admin', 'manager', 'viewer'\)[\s\S]*validateQuery\(bundleReadinessQuerySchema\)[\s\S]*optionalAdminTenant[\s\S]*requireTenant/s);
    expect(bundles.indexOf("'/admin/readiness'")).toBeLessThan(bundles.indexOf("'/admin/:id'"));
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
    expect(bundles).toMatch(/'\/:slug\/quote',[\s\S]*requireTenantBundleMode\(\['test', 'live'\]\)/s);
    expect(bundles).toMatch(/'\/:slug\/quote',[\s\S]*requireBundleFeature\('recovery'\)[\s\S]*requireTenantBundleCheckoutReady/s);
    expect(orders).toMatch(/router\.post\([\s\S]*requireBundleFeature\('checkout'\)[\s\S]*bookingLimiter[\s\S]*requireTenant[\s\S]*validate\(createBundleOrderSchema\)/s);
    expect(orders).toMatch(/router\.post\([\s\S]*requireTenantBundleMode\(\['test', 'live'\]\)[\s\S]*validate\(createBundleOrderSchema\)/s);
    expect(orders).toMatch(/router\.post\([\s\S]*requireTenantBundleCheckoutReady[\s\S]*validate\(createBundleOrderSchema\)/s);
    expect(orders).toMatch(/'\/:id\/payment-intent',[\s\S]*paymentLimiter[\s\S]*requireTenant/s);
    expect(orders).toMatch(/'\/:id\/payment-intent',[\s\S]*requireBundleFeature\('recovery'\)/s);
    expect(orders).toMatch(/'\/:id\/cancel',[\s\S]*optionalAuth[\s\S]*validate\(cancelBundleOrderSchema\)/s);
  });

  it('persists the captured tenant checkout environment on every new master order', () => {
    const controller = sourceFrom('controllers/bundleOrders.controller.ts');
    const service = sourceFrom('services/bundleOrder.service.ts');
    const quoteModel = sourceFrom('models/BundleQuote.ts');
    expect(controller).toMatch(/const checkoutMode = req\.tenant\.bundleSettings\?\.mode/);
    expect(controller).toMatch(/createBundleOrder\(\{[\s\S]*checkoutMode,[\s\S]*\}\)/);
    expect(service).toMatch(/BundleOrder\.create\(\[\{[\s\S]*checkoutMode: input\.checkoutMode,[\s\S]*\}\]/);
    expect(service).toMatch(/BundleQuote\.findOne\(\{[\s\S]*checkoutMode: input\.checkoutMode/s);
    expect(quoteModel).toMatch(/checkoutMode: \{ type: String, enum: \['test', 'live'\], required: true, immutable: true \}/);
  });

  it('keeps Bundle child projections out of every generic Booking query and aggregate', () => {
    const bookingModel = sourceFrom('models/Booking.ts');
    const paymentController = sourceFrom('controllers/payments.controller.ts');
    const bookingController = sourceFrom('controllers/bookings.controller.ts');
    expect(bookingModel).toContain('explicitlyScopesBundleChildren');
    expect(bookingModel).toMatch(/bookingSchema\.pre\([\s\S]*'findOneAndUpdate'[\s\S]*'updateMany'[\s\S]*'findOneAndDelete'/s);
    expect(bookingModel).toMatch(/bookingSchema\.pre\('aggregate'[\s\S]*bundleOrderId: \{ \$exists: false \}/s);
    expect(paymentController).toContain('rejectBundleComponentBooking');
    expect(bookingController).toContain('rejectBundleComponentBooking');
  });
});
