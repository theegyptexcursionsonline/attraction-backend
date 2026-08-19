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
  Attraction: { create: jest.fn(), exists: jest.fn() },
}));
jest.mock('../models/Category', () => ({
  Category: { findOne: jest.fn().mockResolvedValue(null) },
}));

const app = express();
app.use(express.json());
app.use('/attractions', attractionsRouter);

const userId = new Types.ObjectId();
const tenantId = new Types.ObjectId();

const authenticateAsBrandAdmin = (): void => {
  (verifyToken as jest.Mock).mockReturnValue({ userId: userId.toString(), sessionVersion: 0 });
  (User.findById as jest.Mock).mockResolvedValue({
    _id: userId,
    role: 'brand-admin',
    status: 'active',
    tokenVersion: 0,
    assignedTenants: [tenantId],
  });
};

/**
 * The body the admin tour editor posts for "Save as Draft" when the author has
 * only typed a title and short description. Blank strings are pruned client
 * side, but the form still submits a `destination` shell and an empty
 * `pricingOptions` array — the two values that used to fail validation.
 */
const partialDraftBody = () => ({
  slug: 'sunset-camel-trek-k3f9x',
  title: 'Sunset Camel Trek',
  shortDescription: 'Draft short description typed before saving',
  status: 'draft' as const,
  tenantIds: [tenantId.toString()],
  currency: 'USD',
  languages: ['English'],
  destination: { city: '', country: 'Egypt', coordinates: { lat: 0, lng: 0 } },
  pricingOptions: [],
  images: [],
  availability: { type: 'time-slots' as const, advanceBooking: 30 },
});

describe('POST /attractions — saving a tour draft (ATN rows 109 / 114)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticateAsBrandAdmin();
    (Attraction.exists as jest.Mock).mockResolvedValue(false);
    (Attraction.create as jest.Mock).mockImplementation(async (doc: Record<string, unknown>) => ({
      ...doc,
      _id: new Types.ObjectId(),
    }));
  });

  it('stores a partially filled draft instead of rejecting it', async () => {
    const response = await request(app)
      .post('/attractions')
      .set('Authorization', 'Bearer token')
      .send(partialDraftBody());

    expect(response.status).toBe(201);
    expect(Attraction.create).toHaveBeenCalledTimes(1);
  });

  it('persists what the author actually typed, not just the title', async () => {
    await request(app)
      .post('/attractions')
      .set('Authorization', 'Bearer token')
      .send(partialDraftBody());

    const created = (Attraction.create as jest.Mock).mock.calls[0][0];
    expect(created.title).toBe('Sunset Camel Trek');
    expect(created.shortDescription).toBe('Draft short description typed before saving');
    expect(created.status).toBe('draft');
    expect(created.tenantIds).toEqual([tenantId.toString()]);
  });

  it('accepts a draft carrying nothing but slug, title and status', async () => {
    const response = await request(app)
      .post('/attractions')
      .set('Authorization', 'Bearer token')
      .send({
        slug: 'untitled-draft-a1b2',
        title: 'Untitled draft',
        status: 'draft',
        tenantIds: [tenantId.toString()],
      });

    expect(response.status).toBe(201);
  });

  it('still refuses a draft with no title', async () => {
    const response = await request(app)
      .post('/attractions')
      .set('Authorization', 'Bearer token')
      .send({ slug: 'no-title', status: 'draft', tenantIds: [tenantId.toString()] });

    expect(response.status).toBe(400);
    expect(Attraction.create).not.toHaveBeenCalled();
    expect(response.body.errors.some((e: { field: string }) => e.field === 'title')).toBe(true);
  });

  it('names the offending field instead of an unnamed ": Invalid input"', async () => {
    // Publishing an incomplete tour fails BOTH union branches. The union used to
    // collapse that into one issue with an empty path, which the admin saw as
    // ": Invalid input" with nothing to act on (ATN row 81).
    const response = await request(app)
      .post('/attractions')
      .set('Authorization', 'Bearer token')
      .send({
        slug: 'incomplete-publish',
        title: 'Incomplete publish',
        status: 'active',
        tenantIds: [tenantId.toString()],
        pricingOptions: [],
      });

    expect(response.status).toBe(400);
    expect(Attraction.create).not.toHaveBeenCalled();
    expect(response.body.errors.length).toBeGreaterThan(0);
    expect(response.body.errors.every((e: { field: string }) => e.field !== '')).toBe(true);
    expect(
      response.body.errors.some((e: { message: string }) => e.message === 'Invalid input')
    ).toBe(false);
  });

  it('does not let a draft body publish itself by claiming active status', async () => {
    const response = await request(app)
      .post('/attractions')
      .set('Authorization', 'Bearer token')
      .send({ ...partialDraftBody(), status: 'active' });

    expect(response.status).toBe(400);
    expect(Attraction.create).not.toHaveBeenCalled();
  });

  it('keeps tenant ownership enforced on drafts', async () => {
    const foreignTenant = new Types.ObjectId().toString();
    const response = await request(app)
      .post('/attractions')
      .set('Authorization', 'Bearer token')
      .send({ ...partialDraftBody(), tenantIds: [foreignTenant] });

    expect(response.status).toBe(403);
    expect(Attraction.create).not.toHaveBeenCalled();
  });

  it('rejects a draft that names no site at all', async () => {
    const response = await request(app)
      .post('/attractions')
      .set('Authorization', 'Bearer token')
      .send({ ...partialDraftBody(), tenantIds: [] });

    expect(response.status).toBe(400);
    expect(Attraction.create).not.toHaveBeenCalled();
  });
});
