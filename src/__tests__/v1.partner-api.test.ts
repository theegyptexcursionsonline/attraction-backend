import request from 'supertest';
import { Types } from 'mongoose';

import { ApiKey } from '../models/ApiKey';
import { Tenant } from '../models/Tenant';
import { Booking } from '../models/Booking';
import { Attraction } from '../models/Attraction';
import { hashToken, generateApiKey } from '../utils/hash';

// Drive the real app/router through supertest, with the data + auth models
// stubbed (matches the repo's existing api-webhook-kit test style — no live DB).
jest.mock('../models/ApiKey', () => ({ ApiKey: { findOne: jest.fn(), updateOne: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: { findOne: jest.fn(), findById: jest.fn() } }));
jest.mock('../models/Booking', () => ({ Booking: { find: jest.fn(), findOne: jest.fn(), countDocuments: jest.fn() } }));
jest.mock('../models/Attraction', () => ({ Attraction: { find: jest.fn(), countDocuments: jest.fn() } }));

import app from '../app';

const TENANT_A = new Types.ObjectId().toHexString();
const TENANT_B = new Types.ObjectId().toHexString();

const keyA = generateApiKey();

// Chainable query builder stub: .populate().sort().skip().limit().lean() -> rows
const findChain = (rows: unknown[]) => {
  const chain: Record<string, unknown> = {};
  for (const m of ['populate', 'sort', 'skip', 'limit']) {
    chain[m] = jest.fn(() => chain);
  }
  chain.lean = jest.fn(async () => rows);
  return chain;
};
// findOne chain: .populate().lean() -> row
const findOneChain = (row: unknown) => {
  const chain: Record<string, unknown> = {};
  chain.populate = jest.fn(() => chain);
  chain.lean = jest.fn(async () => row);
  return chain;
};

const bookingA = { _id: new Types.ObjectId().toHexString(), tenantId: TENANT_A, reference: 'ATT-AAAAA-AAAA' };

beforeEach(() => {
  (ApiKey.updateOne as jest.Mock).mockResolvedValue({});
  (ApiKey.findOne as jest.Mock).mockImplementation(async (q: { hashedKey: string }) => {
    if (q.hashedKey === hashToken(keyA)) {
      return { _id: new Types.ObjectId(), tenantId: TENANT_A, scopes: ['read', 'write'], revoked: false };
    }
    return null;
  });
  (Tenant.findOne as jest.Mock).mockImplementation(async (q: { _id: string }) => ({ _id: q._id, status: 'active' }));
});

describe('Partner API /api/v1 — auth', () => {
  it('rejects a request with no API key (401)', async () => {
    const res = await request(app).get('/api/v1/bookings');
    expect(res.status).toBe(401);
    expect(Booking.find).not.toHaveBeenCalled();
  });

  it('rejects an unknown/revoked key (401)', async () => {
    const res = await request(app).get('/api/v1/bookings').set('x-api-key', 'fxs_att_not-real');
    expect(res.status).toBe(401);
  });

  it('returns 200 and only the key tenant\'s bookings for a valid key', async () => {
    (Booking.find as jest.Mock).mockReturnValue(findChain([bookingA]));
    (Booking.countDocuments as jest.Mock).mockResolvedValue(1);

    const res = await request(app).get('/api/v1/bookings').set('x-api-key', keyA);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].tenantId).toBe(TENANT_A);

    // The query is scoped to the key's tenant — never a caller-supplied one.
    const queryArg = (Booking.find as jest.Mock).mock.calls[0][0];
    const ors = queryArg.$or as Array<Record<string, unknown>>;
    const scopedIds = ors.map((c) => String(c.tenantId ?? c.supplierTenantId));
    expect(scopedIds.every((id) => id === TENANT_A)).toBe(true);
    expect(JSON.stringify(queryArg)).not.toContain(TENANT_B);
  });

  it('caps the page size at 100', async () => {
    (Booking.find as jest.Mock).mockReturnValue(findChain([]));
    (Booking.countDocuments as jest.Mock).mockResolvedValue(0);

    await request(app).get('/api/v1/bookings?limit=5000').set('x-api-key', keyA);

    const chain = (Booking.find as jest.Mock).mock.results[0].value;
    expect(chain.limit).toHaveBeenCalledWith(100);
  });
});

describe('Partner API /api/v1 — tenant isolation on :id', () => {
  it('returns the booking when it belongs to the key\'s tenant', async () => {
    (Booking.findOne as jest.Mock).mockReturnValue(findOneChain(bookingA));

    const res = await request(app).get(`/api/v1/bookings/${bookingA._id}`).set('x-api-key', keyA);

    expect(res.status).toBe(200);
    expect(res.body.data.tenantId).toBe(TENANT_A);
    // The id lookup ALSO carries the tenant scope, so cross-tenant ids can't match.
    const queryArg = (Booking.findOne as jest.Mock).mock.calls[0][0];
    expect(queryArg.$or).toBeDefined();
    expect(JSON.stringify(queryArg.$or)).not.toContain(TENANT_B);
  });

  it('NEGATIVE: 404 for a booking owned by another tenant', async () => {
    // Mongo returns null because the tenant-scoped filter excludes tenant B's
    // booking — the route can never see another tenant's data.
    (Booking.findOne as jest.Mock).mockReturnValue(findOneChain(null));

    const otherTenantBookingId = new Types.ObjectId().toHexString();
    const res = await request(app).get(`/api/v1/bookings/${otherTenantBookingId}`).set('x-api-key', keyA);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('Partner API /api/v1 — attractions catalog', () => {
  it('returns only the key tenant\'s attractions', async () => {
    // The attractions query adds .select() to the chain, so build a chain that
    // supports it: .select().sort().skip().limit().lean() -> rows.
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'populate', 'sort', 'skip', 'limit']) chain[m] = jest.fn(() => chain);
    chain.lean = jest.fn(async () => [{ slug: 'a', title: 'A' }]);
    (Attraction.find as jest.Mock).mockReturnValue(chain);
    (Attraction.countDocuments as jest.Mock).mockResolvedValue(1);

    const res = await request(app).get('/api/v1/attractions').set('x-api-key', keyA);

    expect(res.status).toBe(200);
    const queryArg = (Attraction.find as jest.Mock).mock.calls[0][0];
    expect(String(queryArg.tenantIds)).toBe(TENANT_A);
  });
});
