import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import attractionsRouter from '../routes/attractions.routes';
import { Attraction } from '../models/Attraction';
import { Review } from '../models/Review';
import { Tenant } from '../models/Tenant';

jest.mock('../models/Attraction', () => ({
  Attraction: { exists: jest.fn() },
}));
jest.mock('../models/Review', () => ({
  Review: { create: jest.fn() },
}));
jest.mock('../models/Tenant', () => ({
  Tenant: { findOne: jest.fn() },
}));
jest.mock('../services/notification.service', () => ({
  createAdminNotifications: jest.fn().mockResolvedValue(undefined),
}));

const tenantId = new Types.ObjectId();
const attractionId = new Types.ObjectId().toHexString();

const app = express();
app.use(express.json());
app.use('/attractions', attractionsRouter);

const reviewBody = {
  rating: 5,
  title: '<script>alert(1)</script>Excellent',
  content: '<img src=x onerror=alert(1)>Safe words',
  author: '<b>QA Guest</b>',
  country: 'GB',
};

describe('attraction review compatibility route security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Tenant.findOne as jest.Mock).mockResolvedValue({ _id: tenantId });
  });

  it('rejects a cross-tenant attraction selected through the path', async () => {
    (Attraction.exists as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .post(`/attractions/${attractionId}/reviews`)
      .set('x-tenant-id', tenantId.toHexString())
      .send({ ...reviewBody, attractionId: new Types.ObjectId().toHexString() });

    expect(response.status).toBe(404);
    expect(Attraction.exists).toHaveBeenCalledWith({
      _id: attractionId,
      tenantIds: { $in: [tenantId.toHexString()] },
    });
    expect(Review.create).not.toHaveBeenCalled();
  });

  it('uses the hardened sanitizer and ignores a forged body attraction id', async () => {
    (Attraction.exists as jest.Mock).mockResolvedValue({ _id: attractionId });
    const populated = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });
    (Review.create as jest.Mock).mockImplementation(async (data) => ({
      _id: new Types.ObjectId(),
      ...data,
      populate: populated,
    }));

    const response = await request(app)
      .post(`/attractions/${attractionId}/reviews`)
      .set('x-tenant-id', tenantId.toHexString())
      .send({ ...reviewBody, attractionId: new Types.ObjectId().toHexString() });

    expect(response.status).toBe(201);
    expect(Review.create).toHaveBeenCalledWith(expect.objectContaining({
      attractionId,
      title: 'Excellent',
      content: 'Safe words',
      author: 'QA Guest',
      status: 'pending',
    }));
  });
});
