import { Types } from 'mongoose';
import { BundleDefinition } from '../models/BundleDefinition';
import { BundleOrder } from '../models/BundleOrder';
import { publicBundleDto, customerBundleOrderDto, supplierBundleOrderDto } from '../services/bundleOrder.service';
import { bundlePaymentBindingError } from '../services/bundlePayment.service';

const storefrontTenantId = new Types.ObjectId();
const supplierA = new Types.ObjectId();
const supplierB = new Types.ObjectId();

const orderFixture = () => new BundleOrder({
  _id: new Types.ObjectId(),
  reference: 'BTW-SECURE001',
  storefrontTenantId,
  bundleDefinitionId: new Types.ObjectId(),
  bundleVersion: 1,
  quoteId: new Types.ObjectId(),
  guestDetails: {
    firstName: 'Guest', lastName: 'Example', email: 'guest@example.com', phone: '+2000000000', country: 'EG',
  },
  status: 'payment_pending',
  paymentStatus: 'intent_created',
  components: [supplierA, supplierB].map((supplierTenantId, index) => ({
    componentId: `component-${index + 1}`,
    supplyOfferId: new Types.ObjectId(),
    supplierTenantId,
    attractionId: new Types.ObjectId(),
    attractionTitle: `Experience ${index + 1}`,
    optionId: 'standard',
    optionName: 'Standard',
    date: '2030-04-01',
    time: '09:00',
    quantities: { adults: 2, children: 0, infants: 0 },
    supplierNetPricesMinor: { adult: 4000, child: 0, infant: 0 },
    supplierNetTotalMinor: 8000,
    customerAllocationMinor: 10000,
    status: 'reserved',
    settlementStatus: 'on_hold',
    refundedMinor: 0,
  })),
  currency: 'USD',
  supplierTotalMinor: 16000,
  platformAllocationMinor: 2500,
  paymentFeeReserveMinor: 1000,
  taxMinor: 500,
  totalMinor: 20000,
  refundedMinor: 0,
  holdExpiresAt: new Date('2030-04-01T10:00:00Z'),
  stripePaymentIntentId: 'pi_bundle_bound',
  idempotencyFingerprint: 'fingerprint',
  refunds: [],
  recovery: { required: false, attempts: 0 },
});

describe('bundle projections and payment binding', () => {
  it('never exposes supplier commercial terms in the public bundle DTO', () => {
    const bundle = new BundleDefinition({
      _id: new Types.ObjectId(),
      storefrontTenantId,
      slug: 'secure-bundle',
      version: 1,
      status: 'published',
      title: 'Secure bundle',
      shortDescription: 'Three experiences',
      description: 'Full itinerary',
      images: [], area: 'Hurghada', category: 'Bundle', currency: 'USD',
      customerPricesMinor: { adult: 20000, child: 0, infant: 0 },
      platformFeeReserveMinor: 1000, taxReserveMinor: 500,
      components: [{
        componentId: 'one', supplyOfferId: new Types.ObjectId(), supplyOfferVersion: 1,
        supplierTenantId: supplierA, attractionId: new Types.ObjectId(), attractionTitle: 'Experience',
        supplierNetPricesMinor: { adult: 8000, child: 0, infant: 0 }, optionIds: ['standard'],
        entryWindowLabels: [], dayNumber: 1, sortOrder: 0,
      }],
      policies: { cancellation: 'Policy', refund: 'Policy', substitution: 'None', promoStacking: false },
      createdBy: new Types.ObjectId(), updatedBy: new Types.ObjectId(),
    });
    const json = JSON.stringify(publicBundleDto(bundle));
    expect(json).not.toContain('supplierTenantId');
    expect(json).not.toContain('supplierNetPricesMinor');
    expect(json).not.toContain('supplyOfferId');
  });

  it('gives a supplier only its own component and payable', () => {
    const order = orderFixture();
    const projection = supplierBundleOrderDto(order, supplierA.toString());
    const json = JSON.stringify(projection);
    expect((projection.components as unknown[])).toHaveLength(1);
    expect(json).toContain('supplierNetTotalMinor');
    expect(json).not.toContain(supplierB.toString());
    expect(json).not.toContain('platformAllocationMinor');
    expect(json).not.toContain('guest@example.com');
  });

  it('keeps supplier payables and master margin out of the customer projection', () => {
    const json = JSON.stringify(customerBundleOrderDto(orderFixture()));
    expect(json).not.toContain('supplierNetTotalMinor');
    expect(json).not.toContain('platformAllocationMinor');
    expect(json).not.toContain('settlementStatus');
  });

  it('requires exact provider identity, tenant, amount, currency, and receipt', () => {
    const order = orderFixture();
    const valid = {
      id: 'pi_bundle_bound', clientSecret: '', amount: 20000, amountReceived: 20000,
      currency: 'usd', status: 'succeeded',
      metadata: {
        paymentKind: 'bundle',
        bundleOrderId: order._id.toString(),
        storefrontTenantId: storefrontTenantId.toString(),
      },
    };
    expect(bundlePaymentBindingError(order, valid, true)).toBeNull();
    expect(bundlePaymentBindingError(order, { ...valid, amount: 19999 }, true)).toMatch(/amount/);
    expect(bundlePaymentBindingError(order, { ...valid, amountReceived: 0 }, true)).toMatch(/fully received/);
    expect(bundlePaymentBindingError(order, {
      ...valid,
      metadata: { ...valid.metadata, storefrontTenantId: supplierA.toString() },
    }, true)).toMatch(/tenant/);
  });
});
