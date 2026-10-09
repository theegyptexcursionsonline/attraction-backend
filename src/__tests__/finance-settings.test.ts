import { calculateFinance, customerFeeLines, customerFinance, financePolicy, financeSettingsUpdateSchema, initialFinanceFees, withoutFinanceFields } from '../utils/financeSettings';

const policy = () => ({ tenantId: 'site-a', revision: 2, configured: true, fees: initialFinanceFees() });

describe('website Finance policy and arithmetic', () => {
  it('distinguishes an unconfigured site from an explicitly saved all-off policy', () => {
    const initial = financePolicy({ _id: 'site-a' });
    expect(initial.configured).toBe(false);
    expect(initial.fees.booking).toMatchObject({ enabled: true, percentage: 5 });
    const fees = initialFinanceFees();
    fees.booking.enabled = false;
    const disabled = financePolicy({ _id: 'site-a', financeRevision: 1, financeSettings: { version: 1, fees } });
    expect(disabled.configured).toBe(true);
    expect(calculateFinance({ policy: disabled, currency: 'USD', serviceSubtotalMinor: 10000, discountMinor: 0 }).totalMinor).toBe(10000);
  });

  it('uses discounted service value for every percentage without fee-on-fee', () => {
    const configured = policy();
    configured.fees.transaction = { enabled: true, type: 'percentage', payer: 'customer', percentage: 3 };
    configured.fees.tax = { enabled: true, type: 'percentage', payer: 'customer', percentage: 10 };
    const result = calculateFinance({ policy: configured, currency: 'USD', serviceSubtotalMinor: 10000, discountMinor: 2000 });
    expect(result).toMatchObject({ discountedServiceMinor: 8000, customerFeesMinor: 1440, businessFeesMinor: 0, totalMinor: 9440 });
    expect(result.lines.map(line => line.amountMinor)).toEqual([240, 800, 400]);
  });

  it('charges a fixed fee once in the original currency and keeps business costs private', () => {
    const configured = policy();
    configured.fees.transaction = { enabled: true, type: 'fixed', payer: 'customer', fixedAmounts: { EUR: 2.5, USD: 4 } };
    configured.fees.payout = { enabled: true, type: 'fixed', payer: 'business', fixedAmounts: { EUR: 3, USD: 6 } };
    const result = calculateFinance({ policy: configured, currency: 'EUR', serviceSubtotalMinor: 10000, discountMinor: 0 });
    expect(result).toMatchObject({ customerFeesMinor: 750, businessFeesMinor: 300, totalMinor: 10750 });
    const publicView = customerFinance(result);
    expect(publicView.lines.map(line => line.kind)).toEqual(['transaction', 'booking']);
    expect(publicView).not.toHaveProperty('businessFeesMinor');
    expect(JSON.stringify(publicView)).not.toContain('business');
    expect(result.lines).toHaveLength(3);
  });

  it('rounds each percentage to the nearest minor unit deterministically', () => {
    const configured = policy();
    configured.fees.booking = { enabled: true, type: 'percentage', payer: 'customer', percentage: 2.5 };
    expect(calculateFinance({ policy: configured, currency: 'USD', serviceSubtotalMinor: 20, discountMinor: 0 }).customerFeesMinor).toBe(1);
    expect(calculateFinance({ policy: configured, currency: 'USD', serviceSubtotalMinor: 19, discountMinor: 0 }).customerFeesMinor).toBe(0);
  });

  it('refuses a fixed fee missing the booking currency, never borrowing another amount', () => {
    const configured = policy();
    configured.fees.booking = { enabled: true, type: 'fixed', payer: 'customer', fixedAmounts: { EUR: 5 } };
    expect(() => calculateFinance({ policy: configured, currency: 'USD', serviceSubtotalMinor: 10000, discountMinor: 0 })).toThrow('no amount configured for USD');
  });

  it.each(['JPY', 'KWD', '$'])('refuses %s instead of assuming incompatible minor units', currency => {
    expect(() => calculateFinance({ policy: policy(), currency, serviceSubtotalMinor: 10000, discountMinor: 0 })).toThrow();
  });

  it('refuses corrupt policy, invalid amounts and unsafe arithmetic', () => {
    expect(() => financePolicy({ _id: 'site-a', financeRevision: 1 })).toThrow();
    expect(() => financePolicy({ _id: 'site-a', financeSettings: { version: 1, fees: {} }, financeRevision: 1 })).toThrow();
    expect(() => calculateFinance({ policy: policy(), currency: 'USD', serviceSubtotalMinor: 100, discountMinor: 101 })).toThrow();
    expect(() => calculateFinance({ policy: policy(), currency: 'USD', serviceSubtotalMinor: Number.MAX_SAFE_INTEGER, discountMinor: 0 })).toThrow();
  });

  it('strictly validates rule type, precision, bounds, keys, and version expectation', () => {
    const body = { expectedRevision: 0, fees: initialFinanceFees() };
    expect(financeSettingsUpdateSchema.safeParse(body).success).toBe(true);
    for (const rule of [
      { enabled: 'true', type: 'percentage', payer: 'customer', percentage: 5 },
      { enabled: true, type: 'percentage', payer: 'customer', percentage: -1 },
      { enabled: true, type: 'percentage', payer: 'customer', percentage: 101 },
      { enabled: true, type: 'percentage', payer: 'customer', percentage: 1.001 },
      { enabled: true, type: 'percentage', payer: 'customer', percentage: 1, fixedAmounts: {} },
      { enabled: true, type: 'fixed', payer: 'business', fixedAmounts: { USD: 1_000_001 } },
      { enabled: true, type: 'fixed', payer: 'supplier', fixedAmounts: { USD: 1 } },
      { enabled: true, type: 'fixed', payer: 'business', fixedAmounts: { usd: 1 } },
    ]) expect(financeSettingsUpdateSchema.safeParse({ ...body, fees: { ...body.fees, booking: rule } }).success).toBe(false);
    expect(financeSettingsUpdateSchema.safeParse({ ...body, expectedRevision: -1 }).success).toBe(false);
    expect(financeSettingsUpdateSchema.safeParse({ ...body, financeRevision: 4 }).success).toBe(false);
  });

  it('drops Finance fields and dotted paths from general settings updates', () => {
    expect(withoutFinanceFields({ name: 'Site', financeSettings: {}, 'financeSettings.fees.booking.enabled': false, financeRevision: 8, financeBookingFence: 0 })).toEqual({ name: 'Site' });
  });
});

describe('the customer\'s fee lines on receipts and tickets', () => {
  it('lists every customer-paid fee with its rate, and never a business-paid one', () => {
    const configured = { tenantId: 'site-a', revision: 2, configured: true, fees: initialFinanceFees() };
    configured.fees.tax = { enabled: true, type: 'percentage', payer: 'customer', percentage: 14 };
    configured.fees.transaction = { enabled: true, type: 'percentage', payer: 'business', percentage: 2.9 };
    configured.fees.payout = { enabled: true, type: 'fixed', payer: 'customer', fixedAmounts: { USD: 1 } };
    const snapshot = calculateFinance({ policy: configured, currency: 'USD', serviceSubtotalMinor: 9000, discountMinor: 0 });
    expect(customerFeeLines(snapshot)).toEqual([
      { label: 'Tax fee (14%)', amount: 12.6 },
      { label: 'Booking fee (5%)', amount: 4.5 },
      { label: 'Payout fee', amount: 1 },
    ]);
    expect(customerFeeLines(undefined)).toBeUndefined();
  });
});
