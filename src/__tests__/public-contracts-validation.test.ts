import { Request, Response, NextFunction } from 'express';
import {
  PUBLIC_ATTRACTION_PROJECTION,
  toPublicAttractionDto,
} from '../controllers/attractions.controller';
import {
  PUBLIC_TENANT_PROJECTION,
  toPublicTenantDto,
} from '../controllers/tenants.controller';
import { validate } from '../middleware/validate.middleware';
import { createBookingSchema } from '../utils/validators';

const validBooking = {
  attractionId: '507f1f77bcf86cd799439011',
  items: [{
    optionId: 'adult',
    optionName: ' Adult Ticket ',
    date: '2030-03-10',
    time: '08:30',
    category: 'resident',
    quantities: { adults: 2, children: 0, infants: 1 },
    unitPrice: 50,
    totalPrice: 100,
    addons: [{ id: 'lunch', name: ' Lunch ', price: 15 }],
    hotelPickup: {
      hotelName: ' Makadi Resort ',
      roomNumber: ' 214 ',
      pickupTime: '07:30',
    },
  }],
  guestDetails: {
    firstName: ' Rdmi ',
    lastName: ' Team ',
    email: ' INFO@RDMIWEBSERVICES.COM ',
    phone: ' +20 100 000 0000 ',
    country: ' Egypt ',
    specialRequests: ' Window seat ',
  },
  promoCode: ' SUMMER10 ',
  paymentMethod: 'card',
  ignoredField: 'must be stripped',
};

describe('public API DTO contracts', () => {
  it('keeps storefront attraction fields and removes operational ownership data', () => {
    const dto = toPublicAttractionDto({
      _id: 'attraction-1',
      slug: 'reef-tour',
      title: 'Reef Tour',
      pricingOptions: [{ id: 'adult', price: 50 }],
      availability: { type: 'time-slots', advanceBooking: 30 },
      tenantIds: ['tenant-1'],
      ownerTenantId: 'tenant-1',
      reseller: { enabled: true, value: 25, allowedTenants: ['tenant-2'] },
      createdBy: 'user-1',
      __v: 7,
      internalNote: 'private',
    });

    expect(dto).toMatchObject({
      _id: 'attraction-1',
      slug: 'reef-tour',
      title: 'Reef Tour',
      pricingOptions: [{ id: 'adult', price: 50 }],
      availability: { type: 'time-slots', advanceBooking: 30 },
    });
    expect(dto).not.toHaveProperty('tenantIds');
    expect(dto).not.toHaveProperty('ownerTenantId');
    expect(dto).not.toHaveProperty('reseller');
    expect(dto).not.toHaveProperty('createdBy');
    expect(dto).not.toHaveProperty('__v');
    expect(dto).not.toHaveProperty('internalNote');
    expect(PUBLIC_ATTRACTION_PROJECTION).not.toMatch(/tenantIds|ownerTenantId|reseller|createdBy|__v/);
  });

  it('exposes only public tenant fields and checkout-safe Stripe settings', () => {
    const dto = toPublicTenantDto({
      _id: 'tenant-1',
      slug: 'makadi-horse-club',
      name: 'Makadi Horse Club',
      status: 'active',
      paymentSettings: {
        stripeAccountId: 'acct_private',
        enabledGateways: ['stripe'],
        ownPaymentGateway: true,
        stripe: {
          enabled: true,
          publishableKey: 'pk_test_public',
          secretKeyEnc: 'encrypted-secret',
          webhookSecretEnc: 'encrypted-webhook',
          configuredAt: '2030-01-01',
        },
      },
      previewAccessCode: 'private-code',
      __v: 4,
    });

    expect(dto).toEqual({
      _id: 'tenant-1',
      slug: 'makadi-horse-club',
      name: 'Makadi Horse Club',
      status: 'active',
      paymentSettings: {
        stripe: { enabled: true, publishableKey: 'pk_test_public' },
      },
    });
    expect(PUBLIC_TENANT_PROJECTION).toContain('paymentSettings.stripe.enabled');
    expect(PUBLIC_TENANT_PROJECTION).toContain('paymentSettings.stripe.publishableKey');
    expect(PUBLIC_TENANT_PROJECTION).not.toMatch(
      /stripeAccountId|enabledGateways|ownPaymentGateway|secretKeyEnc|webhookSecretEnc|previewAccessCode|__v/
    );
  });
});

describe('booking input validation', () => {
  it('preserves legitimate checkout fields while normalizing and stripping unknown input', async () => {
    const req = { body: structuredClone(validBooking) } as Request;
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const res = { status, json } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await validate(createBookingSchema)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(status).not.toHaveBeenCalled();
    expect(req.body).not.toHaveProperty('ignoredField');
    expect(req.body.paymentMethod).toBe('card');
    expect(req.body.items[0]).toMatchObject({
      category: 'resident',
      time: '08:30',
      hotelPickup: {
        hotelName: 'Makadi Resort',
        roomNumber: '214',
        pickupTime: '07:30',
      },
    });
    expect(req.body.guestDetails).toMatchObject({
      firstName: 'Rdmi',
      lastName: 'Team',
      email: 'info@rdmiwebservices.com',
      phone: '+20 100 000 0000',
      country: 'Egypt',
    });
  });

  it.each([
    ['invalid calendar date', { items: [{ ...validBooking.items[0], date: '2030-02-30' }] }],
    ['invalid time', { items: [{ ...validBooking.items[0], time: '25:00' }] }],
    ['negative add-on', {
      items: [{ ...validBooking.items[0], addons: [{ id: 'lunch', name: 'Lunch', price: -1 }] }],
    }],
    ['excessive quantity', {
      items: [{
        ...validBooking.items[0],
        quantities: { adults: 51, children: 0, infants: 0 },
      }],
    }],
    ['unsupported payment method', { paymentMethod: 'bank-transfer' }],
  ])('rejects %s', async (_label, override) => {
    const payload = {
      ...structuredClone(validBooking),
      ...override,
    };
    await expect(createBookingSchema.parseAsync(payload)).rejects.toBeDefined();
  });
});
