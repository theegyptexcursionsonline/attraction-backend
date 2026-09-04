import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { verifyToken } from '../utils/jwt';
import { User } from '../models/User';
import { Attraction } from '../models/Attraction';
import attractionsRouter from '../routes/attractions.routes';

jest.mock('../utils/jwt', () => ({ verifyToken: jest.fn() }));
jest.mock('../models/User', () => ({ User: { findById: jest.fn() } }));
jest.mock('../models/Attraction', () => ({
  Attraction: { findOne: jest.fn(), find: jest.fn(), create: jest.fn() },
}));
jest.mock('../models/Category', () => ({ Category: { findOne: jest.fn().mockResolvedValue(null) } }));

const app = express();
app.use(express.json());
app.use('/attractions', attractionsRouter);

const userId = new Types.ObjectId();
const ownerTenantId = new Types.ObjectId();
const otherTenantId = new Types.ObjectId();
const sourceId = new Types.ObjectId();

const sourceAttraction = () => ({
  _id: sourceId,
  slug: 'reef-trip',
  pathSlug: 'reef',
  title: 'Reef Trip',
  shortDescription: 'Short',
  description: 'Long',
  images: ['https://res.cloudinary.com/demo/image/upload/reef.jpg'],
  category: 'boat-trips',
  destination: { city: 'Hurghada', country: 'Egypt', coordinates: { lat: 27.25, lng: 33.81 } },
  duration: '4 hours',
  languages: ['English'],
  rating: 4.8,
  reviewCount: 12,
  priceFrom: 45,
  currency: 'USD',
  pricingOptions: [{
    _id: new Types.ObjectId(),
    id: 'shared', name: 'Shared', description: '', price: 45,
    timeSlots: [{ _id: new Types.ObjectId(), id: 'am', label: 'Morning', startTime: '08:00' }],
  }],
  addons: [{ _id: new Types.ObjectId(), id: 'lunch', name: 'Lunch', price: 15, pricingType: 'per_unit' }],
  entryWindows: [],
  itinerary: [{ _id: new Types.ObjectId(), title: 'Departure', time: '', duration: '', description: '' }],
  whatToBring: ['Towel'],
  needToKnow: ['Bring ID'],
  accessibility: [],
  gettingThere: [],
  highlights: ['Reef'],
  inclusions: ['Lunch'],
  exclusions: ['Tips'],
  meetingPoint: { address: 'Marina', instructions: 'Gate 2', mapUrl: '' },
  cancellationPolicy: 'Free cancellation up to 24 hours before',
  instantConfirmation: true,
  mobileTicket: true,
  hasHotelPickup: true,
  badges: ['bestseller'],
  availability: { type: 'time-slots', advanceBooking: 30 },
  seo: { metaTitle: 'Reef', metaDescription: 'Reef trip', keywords: ['reef'] },
  tenantIds: [ownerTenantId],
  ownerTenantId,
  reseller: { enabled: true, value: 20, allowedTenants: [] },
  status: 'active',
  featured: true,
  sortOrder: 7,
  archivedAt: new Date('2026-01-01'),
  trashedAt: new Date('2026-01-02'),
  statusBeforeArchive: 'active',
  createdBy: new Types.ObjectId(),
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-06-01'),
  __v: 3,
});

const authenticateAs = (role: string, assignedTenants: Types.ObjectId[]): void => {
  (verifyToken as jest.Mock).mockReturnValue({ userId: userId.toString(), sessionVersion: 0 });
  (User.findById as jest.Mock).mockResolvedValue({ _id: userId, role, status: 'active', tokenVersion: 0, assignedTenants });
};

/** In-memory stand-in for the owner-scoped lookup: honours the `$or` scope IN the query. */
const mockSourceLookup = (source: Record<string, unknown> | null): void => {
  (Attraction.findOne as jest.Mock).mockImplementation((filter: Record<string, any>) => ({
    lean: async () => {
      if (!source || String(filter._id) !== String(source._id)) return null;
      if (!filter.$or) return source; // super-admin: unscoped
      const allowed = (filter.$or[0].ownerTenantId.$in as string[]).map(String);
      return allowed.includes(String(source.ownerTenantId)) ? source : null;
    },
  }));
};

const mockSlugScan = (taken: Record<'slug' | 'pathSlug', string[]>): void => {
  (Attraction.find as jest.Mock).mockImplementation((filter: Record<string, unknown>) => {
    const field = 'slug' in filter ? 'slug' : 'pathSlug';
    const rows = taken[field].map((value) => ({ [field]: value }));
    const chain = { select: () => chain, limit: () => chain, lean: async () => rows };
    return chain;
  });
};

describe('POST /attractions/:id/duplicate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSlugScan({ slug: [], pathSlug: [] });
    (Attraction.create as jest.Mock).mockImplementation(async (doc: Record<string, unknown>) => ({ ...doc, _id: new Types.ObjectId() }));
  });

  it('creates a fresh draft copy with a unique slug (collision → -copy-2)', async () => {
    authenticateAs('brand-admin', [ownerTenantId]);
    mockSourceLookup(sourceAttraction());
    mockSlugScan({ slug: ['reef-trip-copy'], pathSlug: [] });

    const response = await request(app)
      .post(`/attractions/${sourceId}/duplicate`)
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data._id).not.toBe(sourceId.toString());

    const created = (Attraction.create as jest.Mock).mock.calls[0][0];
    expect(created).not.toHaveProperty('_id');
    expect(created.slug).toBe('reef-trip-copy-2');
    expect(created.pathSlug).toBe('reef-copy');
    expect(created.title).toBe('Reef Trip (Copy)');
    expect(created.status).toBe('draft');
    expect(created.featured).toBe(false);
    expect(created.rating).toBe(0);
    expect(created.reviewCount).toBe(0);
    expect(created.reseller).toEqual({ enabled: false, value: 0, allowedTenants: [] });
    expect(created.createdBy).toBe(userId);
    for (const operational of ['archivedAt', 'trashedAt', 'statusBeforeArchive', 'createdAt', 'updatedAt', '__v']) {
      expect(created).not.toHaveProperty(operational);
    }

    // Authoring content is carried over, with fresh subdocument ids.
    expect(created.pricingOptions).toEqual([{
      id: 'shared', name: 'Shared', description: '', price: 45,
      timeSlots: [{ id: 'am', label: 'Morning', startTime: '08:00' }],
    }]);
    expect(created.addons).toEqual([{ id: 'lunch', name: 'Lunch', price: 15, pricingType: 'per_unit' }]);
    expect(created.itinerary).toEqual([{ title: 'Departure', time: '', duration: '', description: '' }]);
    expect(created.images).toEqual(['https://res.cloudinary.com/demo/image/upload/reef.jpg']);
    expect(created.needToKnow).toEqual(['Bring ID']);
    expect(created.seo).toEqual({ metaTitle: 'Reef', metaDescription: 'Reef trip', keywords: ['reef'] });
    expect(created.tenantIds).toEqual([ownerTenantId]);
    expect(created.ownerTenantId).toEqual(ownerTenantId);
    expect(created.hasHotelPickup).toBe(true);
    expect(created.meetingPoint).toEqual({ address: 'Marina', instructions: 'Gate 2', mapUrl: '' });
    expect(created.cancellationPolicy).toBe('Free cancellation up to 24 hours before');
  });

  it('uses "-copy" when free and scopes the pathSlug scan to the copy\'s sites', async () => {
    authenticateAs('brand-admin', [ownerTenantId]);
    mockSourceLookup(sourceAttraction());
    mockSlugScan({ slug: [], pathSlug: ['reef-copy', 'reef-copy-2'] });

    const response = await request(app).post(`/attractions/${sourceId}/duplicate`).set('Authorization', 'Bearer token');

    expect(response.status).toBe(201);
    const created = (Attraction.create as jest.Mock).mock.calls[0][0];
    expect(created.slug).toBe('reef-trip-copy');
    expect(created.pathSlug).toBe('reef-copy-3');
    const pathSlugScan = (Attraction.find as jest.Mock).mock.calls.find(([filter]) => 'pathSlug' in filter)[0];
    expect(pathSlugScan.tenantIds).toEqual({ $in: [ownerTenantId] });
  });

  it('bounds and escapes a legacy stored slug before compiling the copy lookup regex', async () => {
    authenticateAs('brand-admin', [ownerTenantId]);
    mockSourceLookup({
      ...sourceAttraction(),
      slug: `.${'a'.repeat(200)}`,
      pathSlug: undefined,
    });

    const response = await request(app)
      .post(`/attractions/${sourceId}/duplicate`)
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(201);
    const expectedRoot = `.${'a'.repeat(122)}-copy`;
    const created = (Attraction.create as jest.Mock).mock.calls[0][0];
    const slugScan = (Attraction.find as jest.Mock).mock.calls.find(([filter]) => 'slug' in filter)[0];
    expect(Array.from(created.slug)).toHaveLength(128);
    expect(created.slug).toBe(expectedRoot);
    expect(slugScan.slug.$regex).toBe(`^\\.${'a'.repeat(122)}-copy(-\\d+)?$`);
  });

  it('is a 404 for a cross-tenant id — the scope lives in the query', async () => {
    authenticateAs('brand-admin', [otherTenantId]);
    mockSourceLookup(sourceAttraction());

    const response = await request(app).post(`/attractions/${sourceId}/duplicate`).set('Authorization', 'Bearer token');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Attraction not found');
    expect(Attraction.create).not.toHaveBeenCalled();
    const filter = (Attraction.findOne as jest.Mock).mock.calls[0][0];
    expect(filter.$or[0].ownerTenantId.$in).toEqual([otherTenantId.toString()]);
  });

  it('is the same 404 for an id that does not exist', async () => {
    authenticateAs('brand-admin', [ownerTenantId]);
    mockSourceLookup(null);

    const response = await request(app).post(`/attractions/${new Types.ObjectId()}/duplicate`).set('Authorization', 'Bearer token');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Attraction not found');

    const malformed = await request(app).post('/attractions/not-an-id/duplicate').set('Authorization', 'Bearer token');
    expect(malformed.status).toBe(404);
  });

  it('returns a generic 409 when a concurrent copy wins without leaking index or tenant data', async () => {
    authenticateAs('brand-admin', [ownerTenantId]);
    mockSourceLookup(sourceAttraction());
    (Attraction.create as jest.Mock).mockRejectedValue({
      code: 11000,
      keyPattern: { title: 1, 'destination.city': 1, ownerTenantId: 1 },
      keyValue: {
        title: 'Reef Trip (Copy)',
        'destination.city': 'Hurghada',
        ownerTenantId: ownerTenantId.toString(),
      },
      message: `E11000 duplicate key owner ${ownerTenantId.toString()}`,
    });

    const response = await request(app)
      .post(`/attractions/${sourceId}/duplicate`)
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('The attraction could not be duplicated because a copy already exists');
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('E11000');
    expect(serialized).not.toContain(ownerTenantId.toString());
    expect(serialized).not.toContain('destination.city');
  });

  it('lets a super-admin duplicate without a tenant scope', async () => {
    authenticateAs('super-admin', []);
    mockSourceLookup(sourceAttraction());

    const response = await request(app).post(`/attractions/${sourceId}/duplicate`).set('Authorization', 'Bearer token');

    expect(response.status).toBe(201);
    const filter = (Attraction.findOne as jest.Mock).mock.calls[0][0];
    expect(filter).not.toHaveProperty('$or');
  });

  it('rejects customers (403) and anonymous callers (401)', async () => {
    authenticateAs('customer', []);
    mockSourceLookup(sourceAttraction());
    const forbidden = await request(app).post(`/attractions/${sourceId}/duplicate`).set('Authorization', 'Bearer token');
    expect(forbidden.status).toBe(403);
    expect(Attraction.findOne).not.toHaveBeenCalled();

    const anonymous = await request(app).post(`/attractions/${sourceId}/duplicate`);
    expect(anonymous.status).toBe(401);
    expect(Attraction.create).not.toHaveBeenCalled();
  });
});
