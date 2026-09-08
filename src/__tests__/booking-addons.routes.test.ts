import request from 'supertest';
import { Types } from 'mongoose';
import app from '../app';
import { Attraction } from '../models/Attraction';
import { Booking } from '../models/Booking';
import { Availability } from '../models/Availability';
import { IdempotencyKey } from '../models/IdempotencyKey';
import { generateBookingAccessToken } from '../utils/bookingAccess';

/**
 * Add-on quantity is server-authoritative: the catalogue decides name, unit
 * price and pricing type; the request only chooses which add-ons and how many.
 */

const ATTR_ID = new Types.ObjectId().toHexString();
const TENANT_ID = new Types.ObjectId().toHexString();

jest.mock('../utils/jwt', () => ({ ...jest.requireActual('../utils/jwt'), verifyToken: jest.fn() }));
jest.mock('../models/Attraction', () => ({ Attraction: { findById: jest.fn(), findOne: jest.fn() } }));
jest.mock('../models/Booking', () => ({
  Booking: { create: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn(), findById: jest.fn(), countDocuments: jest.fn(), aggregate: jest.fn() },
}));
jest.mock('../models/IdempotencyKey', () => ({
  IdempotencyKey: { create: jest.fn(), findOne: jest.fn(), findByIdAndUpdate: jest.fn(), deleteOne: jest.fn() },
}));
jest.mock('../models/User', () => ({ User: { findById: jest.fn(), findByIdAndUpdate: jest.fn() } }));
jest.mock('../models/Availability', () => ({
  Availability: {
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    findOneAndUpdate: jest.fn().mockResolvedValue({ _id: 'availability-1' }),
  },
}));
jest.mock('../models/PromoCode', () => ({
  PromoCode: { findOne: jest.fn().mockResolvedValue(null), findOneAndUpdate: jest.fn().mockResolvedValue(null) },
}));
// Never send real mail from the suite.
jest.mock('../services/email.service', () => ({
  ...jest.requireActual('../services/email.service'),
  sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
  sendAdminBookingNotification: jest.fn().mockResolvedValue(undefined),
  sendBookingPaymentLinkEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../models/Tenant', () => ({
  Tenant: {
    findOne: jest.fn(),
    findById: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) }),
  },
}));
jest.mock('../models/SpecialOffer', () => ({
  SpecialOffer: {
    findOne: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(null) }),
    findOneAndUpdate: jest.fn().mockResolvedValue(null),
    findByIdAndUpdate: jest.fn().mockResolvedValue(null),
  },
}));
jest.mock('../services/webhook.service', () => ({ ...jest.requireActual('../services/webhook.service'), safeEmitEvent: jest.fn() }));
jest.mock('../services/tenantPayment.service', () => ({
  ...jest.requireActual('../services/tenantPayment.service'),
  getTenantStripeConfig: jest.fn().mockResolvedValue(null),
}));
jest.mock('../services/pdf.service', () => ({ generateTicketPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-QA')) }));

const catalogAttraction = () => ({
  _id: ATTR_ID,
  status: 'active',
  currency: 'USD',
  tenantIds: [TENANT_ID],
  pricingOptions: [{ id: 'adult-option', name: 'Adult Ticket', price: 50 }],
  addons: [
    { id: 'lunch', name: 'Lunch', price: 15 },                                   // legacy add-on → per_unit
    { id: 'gear', name: 'Snorkel gear', price: 10, pricingType: 'per_person' },
  ],
});

const payload = (addons: unknown[], quantities = { adults: 2, children: 1, infants: 0 }) => ({
  attractionId: ATTR_ID,
  items: [{ optionId: 'adult-option', date: '2030-03-10', quantities, addons }],
  guestDetails: {
    firstName: 'Egypt Excursions',
    lastName: 'Online QA',
    email: 'theegyptexcursionsonline@gmail.com',
    phone: '+20100000000',
    country: 'Egypt',
  },
});

const post = (body: Record<string, unknown>, key = `qa-addons-${Math.random().toString(36).slice(2, 12)}-0001`) =>
  request(app).post('/api/bookings').set('Idempotency-Key', key).send(body);

describe('POST /api/bookings — add-on quantities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Attraction.findById as jest.Mock).mockResolvedValue(catalogAttraction());
    (IdempotencyKey.create as jest.Mock).mockResolvedValue({ _id: new Types.ObjectId() });
    (IdempotencyKey.findByIdAndUpdate as jest.Mock).mockResolvedValue({});
    (IdempotencyKey.deleteOne as jest.Mock).mockResolvedValue({ deletedCount: 1 });
    (Booking.create as jest.Mock).mockImplementation(async (doc) => ({ ...doc, _id: new Types.ObjectId() }));
  });

  it('rejects missing pickup before inventory or booking writes when enabled', async () => {
    (Attraction.findById as jest.Mock).mockResolvedValue({...catalogAttraction(),hasHotelPickup:true});
    const response = await post(payload([]));
    expect(response.status).toBe(400);
    expect(Booking.create).not.toHaveBeenCalled();
    expect(Availability.updateOne).not.toHaveBeenCalled();
    expect(Availability.findOneAndUpdate).not.toHaveBeenCalled();
    expect(IdempotencyKey.deleteOne).toHaveBeenCalledWith(expect.objectContaining({ status: 'processing' }));
  });

  it('persists the explicit later choice on pickup-enabled tours', async () => {
    (Attraction.findById as jest.Mock).mockResolvedValue({...catalogAttraction(),hasHotelPickup:true});
    const body = payload([]);
    const response = await post({...body,items:body.items.map(item=>({...item,hotelPickup:{status:'provide_later',hotelName:''}}))});
    expect(response.status).toBe(201);
    expect(Booking.create).toHaveBeenCalledWith(expect.objectContaining({items:expect.arrayContaining([expect.objectContaining({hotelPickup:{status:'provide_later',hotelName:''}})])}));
  });

  it.each([true, false])('replays the original receipt after pickup availability changes from %s', async (wasEnabled) => {
    (Attraction.findById as jest.Mock).mockResolvedValue({ ...catalogAttraction(), hasHotelPickup: wasEnabled });
    const base = payload([]);
    const body = wasEnabled ? { ...base, items: base.items.map((item) => ({ ...item, hotelPickup: { hotelName: 'Original Hotel' } })) } : base;
    const key = `qa-pickup-replay-${wasEnabled}-0001`;
    const created = await post(body, key);
    expect(created.status).toBe(201);
    const claim = (IdempotencyKey.create as jest.Mock).mock.calls[0][0];
    const originalBooking = await (Booking.create as jest.Mock).mock.results[0].value;
    (Attraction.findById as jest.Mock).mockResolvedValue({ ...catalogAttraction(), hasHotelPickup: !wasEnabled });
    (IdempotencyKey.create as jest.Mock).mockRejectedValueOnce({ code: 11000 });
    (IdempotencyKey.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue({
      ...claim, status: 'completed', resourceId: originalBooking._id,
    }) });
    (Booking.findById as jest.Mock).mockResolvedValue(originalBooking);
    const inventoryWrites = (Availability.updateOne as jest.Mock).mock.calls.length;
    const inventoryClaims = (Availability.findOneAndUpdate as jest.Mock).mock.calls.length;
    const replay = await post(body, key);
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body.data.reference).toBe(created.body.data.reference);
    expect(replay.body.data.items).toEqual(created.body.data.items);
    expect(Booking.create).toHaveBeenCalledTimes(1);
    expect(Availability.updateOne).toHaveBeenCalledTimes(inventoryWrites);
    expect(Availability.findOneAndUpdate).toHaveBeenCalledTimes(inventoryClaims);
  });

  it('charges price × quantity from the catalogue and persists quantity + pricing type', async () => {
    const response = await post(payload([
      { id: 'lunch', name: 'Tampered', price: 0.01, quantity: 1 },
      { id: 'gear', name: 'Snorkel gear', price: 0.01, quantity: 3 },
    ]));

    expect(response.status).toBe(201);
    const item = response.body.data.items[0];
    expect(item.totalPrice).toBe(150);
    expect(item.addons).toEqual([
      { id: 'lunch', name: 'Lunch', price: 15, quantity: 1, pricingType: 'per_unit', pricingModel: 'per-booking', totalPrice: 15 },
      { id: 'gear', name: 'Snorkel gear', price: 10, quantity: 3, pricingType: 'per_person', pricingModel: 'per-person', totalPrice: 30 },
    ]);
    expect(response.body.data.subtotal).toBe(195);
    expect(response.body.data.fees).toBe(9.75);
    expect(response.body.data.total).toBe(204.75);
    const stored = (Booking.create as jest.Mock).mock.calls[0][0];
    expect(stored.items[0].addons[1]).toMatchObject({ quantity: 3, pricingType: 'per_person', pricingModel: 'per-person', price: 10 });
    expect(stored.total).toBe(204.75);
  });

  it('rejects a per_unit add-on with quantity > 1 (400, fail closed)', async () => {
    const response = await post(payload([{ id: 'lunch', name: 'Lunch', price: 15, quantity: 2 }]));
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Add-on "Lunch" can only be added once');
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown add-on id instead of silently changing the basket', async () => {
    const response = await post(payload([{ id: 'retired-addon', quantity: 1 }]));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('A selected add-on is no longer available');
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('rejects a per_person add-on above the participants on the line', async () => {
    const response = await post(payload([{ id: 'gear', name: 'Snorkel gear', price: 10, quantity: 4 }]));
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Add-on "Snorkel gear" can be added for at most 3 participants');
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('counts infants as participants for the per_person bound', async () => {
    const response = await post(payload(
      [{ id: 'gear', name: 'Snorkel gear', price: 10, quantity: 4 }],
      { adults: 2, children: 1, infants: 1 }
    ));
    expect(response.status).toBe(201);
    expect(response.body.data.items[0].addons[0].quantity).toBe(4);
    expect(response.body.data.subtotal).toBe(190); // 150 + 4 × 10
  });

  it('merges a repeated add-on id instead of double charging it', async () => {
    const merged = await post(payload([
      { id: 'gear', name: 'Snorkel gear', price: 10, quantity: 1 },
      { id: 'gear', name: 'Snorkel gear', price: 10, quantity: 2 },
    ]));
    expect(merged.status).toBe(201);
    expect(merged.body.data.items[0].addons).toHaveLength(1);
    expect(merged.body.data.items[0].addons[0].quantity).toBe(3);
    expect(merged.body.data.subtotal).toBe(180);

    const doubled = await post(payload([
      { id: 'lunch', name: 'Lunch', price: 15 },
      { id: 'lunch', name: 'Lunch', price: 15 },
    ]));
    expect(doubled.status).toBe(400);
    expect(doubled.body.error).toBe('Add-on "Lunch" can only be added once');
  });

  it('still accepts the legacy request shape without quantity', async () => {
    const response = await post(payload([{ id: 'lunch', name: 'Lunch', price: 15 }]));
    expect(response.status).toBe(201);
    expect(response.body.data.items[0].addons[0]).toMatchObject({ quantity: 1, pricingType: 'per_unit' });
    expect(response.body.data.subtotal).toBe(165);
  });

  it('rejects an out-of-range quantity at the schema layer', async () => {
    const response = await post(payload([{ id: 'gear', name: 'Snorkel gear', price: 10, quantity: 0 }]));
    expect(response.status).toBe(400);
    expect(response.body.errors.some((e: { field: string }) => e.field === 'items.0.addons.0.quantity')).toBe(true);
  });
});

describe('GET /api/bookings/reference/:reference — add-on echo', () => {
  it('renders quantity and line total, treating a legacy add-on as one unit', async () => {
    const bookingId = new Types.ObjectId();
    const raw = {
      _id: bookingId,
      reference: 'ATT-QA-LEGACY',
      status: 'confirmed',
      paymentStatus: 'succeeded',
      paymentMethod: 'card',
      tenantId: new Types.ObjectId(),
      items: [{
        optionName: 'Adult Ticket',
        date: '2030-03-10',
        quantities: { adults: 2, children: 1, infants: 0 },
        unitPrice: 50,
        totalPrice: 150,
        addons: [
          { id: 'lunch', name: 'Lunch', price: 15 },                                         // written before quantity existed
          { id: 'gear', name: 'Snorkel gear', price: 10, quantity: 3, pricingType: 'per_person' },
        ],
      }],
      subtotal: 195,
      fees: 9.75,
      discount: 0,
      total: 204.75,
      currency: 'USD',
      guestDetails: { firstName: 'Egypt Excursions', lastName: 'Online QA', email: 'theegyptexcursionsonline@gmail.com' },
    };
    (Booking.findOne as jest.Mock).mockResolvedValue({
      ...raw,
      populate: jest.fn().mockResolvedValue(undefined),
      toObject: () => raw,
    });

    const response = await request(app)
      .get('/api/bookings/reference/ATT-QA-LEGACY')
      .set('x-booking-access-token', generateBookingAccessToken(String(bookingId), 'ATT-QA-LEGACY'));

    expect(response.status).toBe(200);
    expect(response.body.data.items[0].addons).toEqual([
      { name: 'Lunch', price: 15, quantity: 1, totalPrice: 15, lineTotal: 15 },
      { name: 'Snorkel gear', price: 10, quantity: 3, pricingType: 'per_person', totalPrice: 30, lineTotal: 30 },
    ]);
  });
});
