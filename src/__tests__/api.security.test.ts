import request from 'supertest';
import { Types } from 'mongoose';
import app from '../app';
import { Attraction } from '../models/Attraction';
import { Booking } from '../models/Booking';
import { User } from '../models/User';
import { Availability } from '../models/Availability';
import { PromoCode } from '../models/PromoCode';
import { SpecialOffer } from '../models/SpecialOffer';
import { IdempotencyKey } from '../models/IdempotencyKey';
import { verifyToken } from '../utils/jwt';
import { generateBookingAccessToken } from '../utils/bookingAccess';
import { getTenantStripeConfig } from '../services/tenantPayment.service';
import { generateTicketPdf } from '../services/pdf.service';

// Valid MongoDB ObjectIds for tests
const ATTR_ID = new Types.ObjectId().toHexString();
const TENANT_ID = new Types.ObjectId().toHexString();

const validBookingPayload = () => ({
  attractionId: ATTR_ID,
  items: [{
    optionId: 'adult-option',
    optionName: 'Adult Ticket',
    date: '2030-03-10',
    quantities: { adults: 1, children: 0, infants: 0 },
    unitPrice: 50,
    totalPrice: 50,
  }],
  guestDetails: {
    firstName: 'RDMI',
    lastName: 'Team',
    email: 'info@rdmiwebservices.com',
    phone: '+123456789',
    country: 'US',
  },
});

jest.mock('../utils/jwt', () => ({
  ...jest.requireActual('../utils/jwt'),
  verifyToken: jest.fn(),
}));

jest.mock('../models/Attraction', () => ({
  Attraction: {
    findById: jest.fn(),
  },
}));

jest.mock('../models/Booking', () => ({
  Booking: {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  },
}));

jest.mock('../models/IdempotencyKey', () => ({
  IdempotencyKey: {
    create: jest.fn(),
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
  },
}));

jest.mock('../models/User', () => ({
  User: {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

jest.mock('../models/Availability', () => ({
  Availability: {
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    findOneAndUpdate: jest.fn().mockResolvedValue({ _id: 'availability-1' }),
  },
}));

jest.mock('../models/PromoCode', () => ({
  PromoCode: {
    findOne: jest.fn().mockResolvedValue(null),
    findOneAndUpdate: jest.fn().mockResolvedValue(null),
  },
}));

// createBooking fires a booking-notification email side-effect. NEVER let the test
// suite send real mail — stub the senders (belt-and-suspenders with the global
// Mailgun disable in setup-env.ts). Keep the rest of the module (getEmailBrand, etc.).
jest.mock('../services/email.service', () => ({
  ...jest.requireActual('../services/email.service'),
  sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
  sendAdminBookingNotification: jest.fn().mockResolvedValue(undefined),
}));

// createBooking fires a non-blocking email side-effect that looks up the tenant
// (Tenant.findById(...).select(...).lean()). Mock it so the fire-and-forget path
// resolves instantly instead of buffering against a real (absent) DB connection.
jest.mock('../models/Tenant', () => ({
  Tenant: {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    }),
  },
}));

// createBooking dynamically imports SpecialOffer to apply an active discount;
// mock it so the pricing/auth tests don't hit an unconnected real model.
jest.mock('../models/SpecialOffer', () => ({
  SpecialOffer: {
    // createBooking does SpecialOffer.findOne(...).sort(...), so the mock must be chainable.
    findOne: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(null) }),
    findOneAndUpdate: jest.fn().mockResolvedValue(null),
    findByIdAndUpdate: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../services/webhook.service', () => ({
  ...jest.requireActual('../services/webhook.service'),
  safeEmitEvent: jest.fn(),
}));

jest.mock('../services/tenantPayment.service', () => ({
  ...jest.requireActual('../services/tenantPayment.service'),
  getTenantStripeConfig: jest.fn(),
}));

jest.mock('../services/pdf.service', () => ({
  generateTicketPdf: jest.fn(),
}));

describe('API security and pricing guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (IdempotencyKey.create as jest.Mock).mockResolvedValue({ _id: new Types.ObjectId() });
    (IdempotencyKey.findByIdAndUpdate as jest.Mock).mockResolvedValue({});
    (IdempotencyKey.deleteOne as jest.Mock).mockResolvedValue({ deletedCount: 1 });
    (Booking.create as jest.Mock).mockImplementation(async (payload) => payload);
    (Availability.updateOne as jest.Mock).mockResolvedValue({ acknowledged: true });
    (Availability.findOneAndUpdate as jest.Mock).mockResolvedValue({ _id: 'availability-1' });
    (PromoCode.findOne as jest.Mock).mockResolvedValue(null);
    (PromoCode.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
    (SpecialOffer.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    (SpecialOffer.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
    (SpecialOffer.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);
    (getTenantStripeConfig as jest.Mock).mockResolvedValue(null);
    (generateTicketPdf as jest.Mock).mockResolvedValue(Buffer.from('%PDF-RDMI'));
  });

  const adminUser = {
    _id: { toString: () => 'admin-1' },
    role: 'brand-admin',
    status: 'active',
    assignedTenants: ['tenant-1'],
  };

  it('allows guest booking and partner API credentials through CORS preflight', async () => {
    const response = await request(app)
      .options('/api/bookings/reference/ATT-RDMI-CORS')
      .set('Origin', 'https://makadihorseclub.com')
      .set('Access-Control-Request-Method', 'GET')
      .set(
        'Access-Control-Request-Headers',
        'x-booking-access-token,x-api-key,x-tenant-id'
      );

    expect(response.status).toBe(204);
    const allowed = String(response.headers['access-control-allow-headers']).toLowerCase();
    expect(allowed).toContain('x-booking-access-token');
    expect(allowed).toContain('x-api-key');
    expect(allowed).toContain('x-tenant-id');
  });

  it('requires authentication for protected booking/payment endpoints', async () => {
    // NB: GET /bookings/:id/ticket is intentionally optionalAuth (guests must be
    // able to download their own ticket), so it is deliberately NOT in this
    // protected-endpoints list.
    const [cancelRes, createIntentRes, paymentStatusRes] = await Promise.all([
      request(app).patch('/api/bookings/booking-id/cancel'),
      request(app).post('/api/payments/create-intent').send({ bookingId: 'booking-id' }),
      request(app).get('/api/payments/booking-id/status'),
    ]);

    expect(cancelRes.status).toBe(401);
    expect(createIntentRes.status).toBe(401);
    expect(paymentStatusRes.status).toBe(401);
  });

  it('recalculates booking line-item prices on the server', async () => {
    (Attraction.findById as jest.Mock).mockResolvedValue({
      _id: ATTR_ID,
      status: 'active',
      currency: 'USD',
      tenantIds: [TENANT_ID],
      pricingOptions: [
        { id: 'adult-option', name: 'Adult Ticket', price: 50 },
      ],
    });

    (Booking.create as jest.Mock).mockImplementation(async (payload) => payload);

    const response = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'booking-test-key-0001')
      .send({
        attractionId: ATTR_ID,
        items: [
          {
            optionId: 'adult-option',
            optionName: 'Tampered Name',
            date: '2030-03-10',
            quantities: { adults: 2, children: 1, infants: 0 },
            unitPrice: 0.01,
            totalPrice: 0.01,
          },
        ],
        guestDetails: {
          firstName: 'RDMI',
          lastName: 'Team',
          email: 'info@rdmiwebservices.com',
          phone: '+123456789',
          country: 'US',
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items[0].optionName).toBe('Adult Ticket');
    expect(response.body.data.items[0].unitPrice).toBe(50);
    expect(response.body.data.items[0].totalPrice).toBe(150);
    expect(response.body.data.subtotal).toBe(150);
    expect(response.body.data.fees).toBe(7.5);
    expect(response.body.data.total).toBe(157.5);
    expect(response.body.data.guestAccessToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ $inc: expect.objectContaining({ totalSpent: expect.anything() }) })
    );
    const idempotencyClaim = (IdempotencyKey.create as jest.Mock).mock.calls[0][0];
    expect(idempotencyClaim.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(idempotencyClaim.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(idempotencyClaim)).not.toContain('booking-test-key-0001');
    expect(JSON.stringify(idempotencyClaim)).not.toContain('info@rdmiwebservices.com');
  });

  it('requires a valid idempotency key before looking up an attraction', async () => {
    const response = await request(app)
      .post('/api/bookings')
      .send(validBookingPayload());

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('A valid Idempotency-Key header is required');
    expect(Attraction.findById).not.toHaveBeenCalled();
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('replays a completed idempotent booking without reserving inventory twice', async () => {
    (Attraction.findById as jest.Mock).mockResolvedValue({
      _id: ATTR_ID,
      status: 'active',
      currency: 'USD',
      tenantIds: [TENANT_ID],
      pricingOptions: [{ id: 'adult-option', name: 'Adult Ticket', price: 50 }],
    });

    const existingBooking = {
      ...validBookingPayload(),
      _id: new Types.ObjectId(),
      reference: 'AN-IDEMPOTENT',
      tenantId: TENANT_ID,
      status: 'confirmed',
      paymentStatus: 'pending',
      paymentMethod: 'pay-later',
      subtotal: 50,
      fees: 2.5,
      discount: 0,
      total: 52.5,
      currency: 'USD',
    };

    (IdempotencyKey.create as jest.Mock).mockImplementation(async (claim) => {
      (IdempotencyKey.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          ...claim,
          status: 'completed',
          resourceId: existingBooking._id,
        }),
      });
      throw Object.assign(new Error('duplicate key'), { code: 11000 });
    });
    (Booking.findById as jest.Mock).mockResolvedValue(existingBooking);

    const response = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'booking-replay-key-0001')
      .send(validBookingPayload());

    expect(response.status).toBe(200);
    expect(response.headers['idempotency-replayed']).toBe('true');
    expect(response.body.data.reference).toBe('AN-IDEMPOTENT');
    expect(response.body.data.guestAccessToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Booking.create).not.toHaveBeenCalled();
    expect(Availability.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Availability.updateOne).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for a different booking request', async () => {
    (Attraction.findById as jest.Mock).mockResolvedValue({
      _id: ATTR_ID,
      status: 'active',
      currency: 'USD',
      tenantIds: [TENANT_ID],
      pricingOptions: [{ id: 'adult-option', name: 'Adult Ticket', price: 50 }],
    });
    (IdempotencyKey.create as jest.Mock).mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: 11000 })
    );
    (IdempotencyKey.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        requestHash: 'different-request-hash',
        status: 'completed',
        resourceId: new Types.ObjectId(),
      }),
    });

    const response = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'booking-collision-key-0001')
      .send(validBookingPayload());

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('different booking request');
    expect(Booking.findById).not.toHaveBeenCalled();
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('returns a retry hint while an identical booking request is processing', async () => {
    (Attraction.findById as jest.Mock).mockResolvedValue({
      _id: ATTR_ID,
      status: 'active',
      currency: 'USD',
      tenantIds: [TENANT_ID],
      pricingOptions: [{ id: 'adult-option', name: 'Adult Ticket', price: 50 }],
    });
    (IdempotencyKey.create as jest.Mock).mockImplementation(async (claim) => {
      (IdempotencyKey.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({ ...claim, status: 'processing' }),
      });
      throw Object.assign(new Error('duplicate key'), { code: 11000 });
    });

    const response = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'booking-processing-key-0001')
      .send(validBookingPayload());

    expect(response.status).toBe(409);
    expect(response.headers['retry-after']).toBe('2');
    expect(response.body.error).toContain('already processing');
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('rejects unknown pricing options', async () => {
    (Attraction.findById as jest.Mock).mockResolvedValue({
      _id: ATTR_ID,
      status: 'active',
      currency: 'USD',
      tenantIds: [TENANT_ID],
      pricingOptions: [{ id: 'known-option', name: 'Known', price: 40 }],
    });

    const response = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'booking-test-key-0002')
      .send({
        attractionId: ATTR_ID,
        items: [
          {
            optionId: 'unknown-option',
            optionName: 'Unknown',
            date: '2030-03-10',
            quantities: { adults: 1, children: 0, infants: 0 },
            unitPrice: 1,
            totalPrice: 1,
          },
        ],
        guestDetails: {
          firstName: 'RDMI',
          lastName: 'Team',
          email: 'info@rdmiwebservices.com',
          phone: '+123456789',
          country: 'US',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid pricing option selected');
  });

  it('rejects a booking for a date in the past', async () => {
    (Attraction.findById as jest.Mock).mockResolvedValue({
      _id: ATTR_ID,
      status: 'active',
      currency: 'USD',
      tenantIds: [TENANT_ID],
      pricingOptions: [{ id: 'adult-option', name: 'Adult Ticket', price: 50 }],
    });

    const response = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'booking-test-key-0003')
      .send({
        attractionId: ATTR_ID,
        items: [
          {
            optionId: 'adult-option',
            optionName: 'Adult Ticket',
            date: '2020-01-01', // firmly in the past
            quantities: { adults: 2, children: 0, infants: 0 },
            unitPrice: 50,
            totalPrice: 100,
          },
        ],
        guestDetails: {
          firstName: 'RDMI',
          lastName: 'Team',
          email: 'info@rdmiwebservices.com',
          phone: '+123456789',
          country: 'US',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Cannot book a date in the past');
  });

  it('blocks tenant admins from cancelling bookings outside assigned tenants', async () => {
    (verifyToken as jest.Mock).mockReturnValue({ userId: 'admin-1' });
    (User.findById as jest.Mock).mockResolvedValue(adminUser);
    (Booking.findById as jest.Mock).mockResolvedValue({
      _id: 'booking-1',
      userId: { toString: () => 'customer-1' },
      tenantId: { toString: () => 'tenant-2' },
      status: 'pending',
      paymentStatus: 'pending',
    });

    const response = await request(app)
      .patch('/api/bookings/booking-1/cancel')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Not authorized to cancel this booking');
  });

  it('blocks tenant admins from reading payment status outside assigned tenants', async () => {
    (verifyToken as jest.Mock).mockReturnValue({ userId: 'admin-1' });
    (User.findById as jest.Mock).mockResolvedValue(adminUser);

    const selectMock = jest.fn().mockResolvedValue({
      _id: 'booking-1',
      reference: 'AN-TEST123',
      paymentStatus: 'pending',
      status: 'pending',
      total: 100,
      currency: 'USD',
      userId: { toString: () => 'customer-1' },
      tenantId: { toString: () => 'tenant-2' },
    });

    (Booking.findById as jest.Mock).mockReturnValue({ select: selectMock });

    const response = await request(app)
      .get('/api/payments/booking-1/status')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Not authorized to view this payment');
  });

  it('scopes admin booking stats to assigned tenants when tenant context is absent', async () => {
    (verifyToken as jest.Mock).mockReturnValue({ userId: 'admin-1' });
    (User.findById as jest.Mock).mockResolvedValue({
      ...adminUser,
      role: 'manager',
      assignedTenants: ['tenant-1', 'tenant-2'],
    });

    (Booking.countDocuments as jest.Mock)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2);
    (Booking.aggregate as jest.Mock).mockResolvedValue([{ total: 1500 }]);

    const response = await request(app)
      .get('/api/bookings/admin/stats')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    const firstStatsQuery = (Booking.countDocuments as jest.Mock).mock.calls[0][0];
    expect(firstStatsQuery).toHaveProperty('tenantId');
    expect(firstStatsQuery.tenantId).toHaveProperty('$in');
    expect(firstStatsQuery.tenantId.$in).toEqual(['tenant-1', 'tenant-2']);
  });

  it('requires a guest token for reference lookup and returns only confirmation-safe fields', async () => {
    const bookingId = new Types.ObjectId().toHexString();
    const reference = 'ATT-RDMI-SAFE';
    const bookingDocument: Record<string, any> = {
      _id: bookingId,
      reference,
      userId: undefined,
      tenantId: TENANT_ID,
      attractionId: ATTR_ID,
      status: 'confirmed',
      paymentStatus: 'pending',
      paymentMethod: 'pay-later',
      items: [{
        optionName: 'Sunrise Ride',
        date: '2030-03-10',
        time: '09:00',
        quantities: { adults: 1, children: 0, infants: 1 },
        unitPrice: 50,
        totalPrice: 50,
        hotelPickup: { hotelName: 'RDMI Hotel', roomNumber: '214' },
      }],
      guestDetails: {
        firstName: 'RDMI',
        lastName: 'Team',
        email: 'info@rdmiwebservices.com',
        phone: '+201000000000',
      },
      subtotal: 50,
      fees: 2.5,
      discount: 0,
      total: 52.5,
      currency: 'USD',
      stripePaymentIntentId: 'pi_secret_internal',
      revenueBreakdown: { supplierEarnings: 40 },
      populate: jest.fn(async function (this: Record<string, any>) {
        this.attractionId = {
          _id: ATTR_ID,
          title: 'Sunrise Ride',
          slug: 'sunrise-ride',
          images: ['https://images.example/ride.jpg'],
          destination: { city: 'Hurghada' },
        };
        this.tenantId = { _id: TENANT_ID, name: 'RDMI Adventures', logo: '/logo.png' };
        return this;
      }),
      toObject: function (this: Record<string, any>) { return { ...this }; },
    };
    (Booking.findOne as jest.Mock).mockResolvedValue(bookingDocument);

    const withoutToken = await request(app).get(`/api/bookings/reference/${reference}`);
    expect(withoutToken.status).toBe(401);

    const invalidToken = await request(app)
      .get(`/api/bookings/reference/${reference}`)
      .set('x-booking-access-token', 'invalid-token');
    expect(invalidToken.status).toBe(403);

    const token = generateBookingAccessToken(bookingId, reference);
    const response = await request(app)
      .get(`/api/bookings/reference/${reference}`)
      .set('x-booking-access-token', token);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: reference,
      reference,
      status: 'confirmed',
      total: 52.5,
      attraction: { title: 'Sunrise Ride' },
      tenant: { name: 'RDMI Adventures' },
    });
    expect(response.body.data).not.toHaveProperty('_id');
    expect(response.body.data).not.toHaveProperty('guestDetails');
    expect(response.body.data).not.toHaveProperty('tenantId');
    expect(response.body.data).not.toHaveProperty('attractionId');
    expect(response.body.data).not.toHaveProperty('stripePaymentIntentId');
    expect(response.body.data).not.toHaveProperty('revenueBreakdown');
    expect(response.body.data.items[0]).not.toHaveProperty('hotelPickup');
  });

  it('requires authenticated ownership/admin access or the HMAC token for ticket download', async () => {
    const bookingId = new Types.ObjectId().toHexString();
    const reference = 'ATT-RDMI-TICKET';
    const bookingDocument: Record<string, any> = {
      _id: bookingId,
      reference,
      userId: undefined,
      tenantId: TENANT_ID,
      attractionId: ATTR_ID,
      status: 'confirmed',
      paymentStatus: 'pending',
      paymentMethod: 'pay-later',
      items: [{
        optionName: 'Sunrise Ride',
        date: '2030-03-10',
        time: '09:00',
        quantities: { adults: 1, children: 0, infants: 0 },
      }],
      guestDetails: {
        firstName: 'RDMI',
        lastName: 'Team',
        email: 'info@rdmiwebservices.com',
        phone: '+201000000000',
        country: 'EG',
      },
      subtotal: 50,
      fees: 2.5,
      discount: 0,
      total: 52.5,
      currency: 'USD',
      populate: jest.fn(async function (this: Record<string, any>) {
        this.attractionId = { title: 'Sunrise Ride' };
        this.tenantId = { name: 'RDMI Adventures', theme: {}, logo: '/logo.png' };
        return this;
      }),
    };
    (Booking.findById as jest.Mock).mockResolvedValue(bookingDocument);

    const withoutToken = await request(app).get(`/api/bookings/${bookingId}/ticket`);
    expect(withoutToken.status).toBe(401);
    expect(generateTicketPdf).not.toHaveBeenCalled();

    const token = generateBookingAccessToken(bookingId, reference);
    const response = await request(app)
      .get(`/api/bookings/${bookingId}/ticket`)
      .query({ accessToken: token });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(generateTicketPdf).toHaveBeenCalledTimes(1);
  });

  it('atomically rejects a missing, blocked, full, or unknown availability slot', async () => {
    (Attraction.findById as jest.Mock).mockResolvedValue({
      _id: ATTR_ID,
      status: 'active',
      currency: 'USD',
      tenantIds: [TENANT_ID],
      availability: { type: 'time-slots' },
      pricingOptions: [{ id: 'ride', name: 'Sunrise Ride', price: 50 }],
    });
    (Availability.findOneAndUpdate as jest.Mock).mockResolvedValueOnce(null);

    const response = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'booking-test-key-0004')
      .send({
      attractionId: ATTR_ID,
      items: [{
        optionId: 'ride',
        date: '2030-03-10',
        time: '09:00',
        quantities: { adults: 1, children: 0, infants: 2 },
      }],
      guestDetails: {
        firstName: 'RDMI',
        lastName: 'Team',
        email: 'info@rdmiwebservices.com',
        phone: '+201000000000',
        country: 'EG',
      },
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('blocked, full, or unavailable');
    expect(Booking.create).not.toHaveBeenCalled();
    const [query, update] = (Availability.findOneAndUpdate as jest.Mock).mock.calls[0];
    expect(query).toMatchObject({ attractionId: ATTR_ID, isBlocked: { $ne: true } });
    expect(query).toHaveProperty('$expr');
    expect(update).toEqual({ $inc: { 'timeSlots.$[slot].booked': 3 } });
  });

  it('scopes promo codes by tenant and currency and consumes only the selected discount', async () => {
    (Attraction.findById as jest.Mock).mockResolvedValue({
      _id: ATTR_ID,
      status: 'active',
      currency: 'USD',
      tenantIds: [TENANT_ID],
      pricingOptions: [{ id: 'ride', name: 'Sunrise Ride', price: 100 }],
    });
    const promo = {
      _id: 'promo-1',
      code: 'RDMI10',
      currency: 'USD',
      discountType: 'percentage',
      discountValue: 10,
      usageCount: 0,
      usageLimit: 1,
      minOrderAmount: 0,
    };
    (PromoCode.findOne as jest.Mock).mockResolvedValueOnce(promo);
    (PromoCode.findOneAndUpdate as jest.Mock).mockResolvedValueOnce({ ...promo, usageCount: 1 });

    const response = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'booking-test-key-0005')
      .send({
      attractionId: ATTR_ID,
      promoCode: 'rdmi10',
      items: [{
        optionId: 'ride',
        date: '2030-03-10',
        quantities: { adults: 1, children: 0, infants: 0 },
      }],
      guestDetails: {
        firstName: 'RDMI',
        lastName: 'Team',
        email: 'info@rdmiwebservices.com',
        phone: '+201000000000',
        country: 'EG',
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.data.discount).toBe(10);
    expect(response.body.data.total).toBe(95);
    expect((PromoCode.findOne as jest.Mock).mock.calls[0][0]).toMatchObject({
      code: 'RDMI10',
      currency: 'USD',
      tenantId: TENANT_ID,
    });
    expect(PromoCode.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(SpecialOffer.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('restores all capacity-consuming guests exactly once on cancellation', async () => {
    (verifyToken as jest.Mock).mockReturnValue({ userId: 'customer-1' });
    (User.findById as jest.Mock).mockResolvedValue({
      _id: { toString: () => 'customer-1' },
      role: 'customer',
      status: 'active',
      assignedTenants: [],
    });
    const baseBooking = {
      _id: 'booking-1',
      reference: 'ATT-RDMI-CANCEL',
      userId: { toString: () => 'customer-1' },
      tenantId: TENANT_ID,
      attractionId: ATTR_ID,
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'card',
      total: 52.5,
      currency: 'USD',
      inventoryReservedAt: new Date('2030-03-01T00:00:00Z'),
      items: [{
        optionId: 'ride',
        optionName: 'Sunrise Ride',
        date: '2030-03-10',
        time: '09:00',
        quantities: { adults: 1, children: 0, infants: 1 },
        unitPrice: 50,
        totalPrice: 50,
      }],
      guestDetails: { firstName: 'RDMI', lastName: 'Team', email: 'info@rdmiwebservices.com' },
    };
    const current: Record<string, any> = {
      ...baseBooking,
      save: jest.fn().mockResolvedValue(undefined),
    };
    (Booking.findById as jest.Mock).mockResolvedValue(baseBooking);
    (Booking.findOne as jest.Mock).mockResolvedValue(current);

    const response = await request(app)
      .patch('/api/bookings/booking-1/cancel')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    const [, update] = (Availability.findOneAndUpdate as jest.Mock).mock.calls[0];
    expect(update).toEqual({ $inc: { 'timeSlots.$[slot].booked': -2 } });
    expect(current.status).toBe('cancelled');
    expect(current.inventoryReleasedAt).toBeInstanceOf(Date);
    expect(current.save).toHaveBeenCalledTimes(1);
  });

  it('fails paid cancellation closed when the tenant gateway is unavailable', async () => {
    (verifyToken as jest.Mock).mockReturnValue({ userId: 'customer-1' });
    (User.findById as jest.Mock).mockResolvedValue({
      _id: { toString: () => 'customer-1' },
      role: 'customer',
      status: 'active',
      assignedTenants: [],
    });
    (Booking.findById as jest.Mock).mockResolvedValue({
      _id: 'booking-paid',
      userId: { toString: () => 'customer-1' },
      tenantId: TENANT_ID,
      status: 'confirmed',
      paymentStatus: 'succeeded',
      paymentMethod: 'card',
      stripePaymentIntentId: 'pi_rdmi_paid',
    });

    const response = await request(app)
      .patch('/api/bookings/booking-paid/cancel')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(503);
    expect(response.body.error).toContain('gateway is not configured');
    expect(Booking.findOne).not.toHaveBeenCalled();
    expect(Availability.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects ordinary admin attempts to write payment status', async () => {
    (verifyToken as jest.Mock).mockReturnValue({ userId: 'admin-1' });
    (User.findById as jest.Mock).mockResolvedValue(adminUser);

    const response = await request(app)
      .patch('/api/bookings/admin/booking-1')
      .set('Authorization', 'Bearer valid-token')
      .send({ paymentStatus: 'succeeded' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(Booking.findById).not.toHaveBeenCalled();
  });

  it('prevents admins from confirming an unpaid card booking', async () => {
    (verifyToken as jest.Mock).mockReturnValue({ userId: 'admin-1' });
    (User.findById as jest.Mock).mockResolvedValue(adminUser);
    (Booking.findById as jest.Mock).mockResolvedValue({
      _id: 'booking-1',
      userId: undefined,
      tenantId: 'tenant-1',
      status: 'pending',
      paymentMethod: 'card',
      paymentStatus: 'processing',
      save: jest.fn(),
    });

    const response = await request(app)
      .patch('/api/bookings/admin/booking-1')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'confirmed' });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('provider-verified payment');
  });

  it('refuses to settle cancelled, refunded, or unpaid-card resale bookings', async () => {
    (verifyToken as jest.Mock).mockReturnValue({ userId: 'admin-1' });
    (User.findById as jest.Mock).mockResolvedValue(adminUser);
    (Booking.findById as jest.Mock).mockResolvedValue({
      _id: 'booking-1',
      isResale: true,
      supplierTenantId: 'tenant-1',
      status: 'cancelled',
      paymentMethod: 'card',
      paymentStatus: 'failed',
    });

    const response = await request(app)
      .patch('/api/bookings/admin/booking-1/settlement')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'settled' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('eligible confirmed or completed revenue');
  });
});
