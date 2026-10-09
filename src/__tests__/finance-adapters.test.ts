import { initialFinanceFees, financePolicy, calculateFinance } from '../utils/financeSettings';
import { resaleFieldsFor, sameResaleFields } from '../utils/resaleSplit';
import { packageCalendar, packageSelectionSchema, pricePackageSelection } from '../services/packagePricing.service';
import { applyPackageFinance, packageFinanceTotal } from '../services/packageFinance.service';
import { samplePackage } from '../test/packageFixture';
const policy = () => { const fees = initialFinanceFees(); fees.transaction = { enabled: true, type: 'percentage', percentage: 3, payer: 'business' }; return financePolicy({ _id: 'seller', financeRevision: 1, financeSettings: { version: 1, fees } }); };
it('keeps gross commission and 2.9% separate while deducting configured expenses only from seller net', () => {
 const snapshot = calculateFinance({ policy: policy(), currency: 'USD', serviceSubtotalMinor: 10000, discountMinor: 0 });
 const listing = { ownerTenantId: 'supplier', reseller: { enabled: true, value: 20 } };
 const legacy = resaleFieldsFor(listing, 'seller', 105);
 const configured = resaleFieldsFor(listing, 'seller', 105, snapshot);
 expect(configured).toMatchObject({ revenueBreakdown: { commissionPercent: 20, sellerEarnings: 21, paymentFee: 3.05, supplierEarnings: 80.95, configuredBusinessFees: 3, sellerNetAfterConfiguredFees: 18 } });
 expect(sameResaleFields(legacy, configured)).toBe(false); expect(sameResaleFields(configured, configured)).toBe(true);
});
it('refuses a negative seller margin and leaves owned tours outside reseller accounting', () => {
 const snapshot = calculateFinance({ policy: policy(), currency: 'USD', serviceSubtotalMinor: 10000, discountMinor: 0 });
 expect(() => resaleFieldsFor({ ownerTenantId: 'supplier', reseller: { enabled: true, value: 1 } }, 'seller', 105, snapshot)).toThrow('fees exceed');
 expect(resaleFieldsFor({ ownerTenantId: 'seller', reseller: { enabled: true, value: 1 } }, 'seller', 105, snapshot)).toEqual({ isResale: false });
});
it('calculates configured package fees once after a discount and keeps a price-changing commitment for private edits', () => {
 const details = samplePackage(); const result = pricePackageSelection({ details, currency: 'USD', today: '2026-10-01', selection: packageSelectionSchema.parse({ date: '2026-11-10', tierKey: 'gold', rooms: [{ adults: 2 }] }), feeBasisPoints: 0 });
 if (!result.ok) throw new Error(result.code);
 result.quote.discount = 100;
 const first = applyPackageFinance(result.quote, policy())!;
 expect(first).toMatchObject({ serviceSubtotalMinor: 200000, discountedServiceMinor: 190000, customerFeesMinor: 9500, businessFeesMinor: 5700, totalMinor: 199500 });
 const hash = result.quote.financeHash;
 const changed = policy(); changed.revision = 2; applyPackageFinance(result.quote, changed);
 expect(result.quote.financeHash).not.toBe(hash); expect(result.quote.total).toBe(1995);
});
it('rounds a fixed package fee only after pricing the whole actual room party', () => {
 const details = samplePackage(); const configured = policy(); configured.fees.booking = { enabled: true, type: 'fixed', payer: 'customer', fixedAmounts: { USD: 0.01 } };
 const calendar = packageCalendar({ details, month: '2026-11', today: '2026-10-01', travellers: 3, rooms: [{ adults: 2, children: 1, infants: 0 }], departures: new Map(), feeBasisPoints: 0, priceTotal: packageFinanceTotal('USD', configured) });
 expect(calendar.find(day => day.date === '2026-11-10')?.perPersonFrom).toBe(833.34);
});
