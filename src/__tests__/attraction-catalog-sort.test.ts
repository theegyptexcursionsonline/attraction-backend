import express from 'express';
import request from 'supertest';
import { Attraction } from '../models/Attraction';
import attractionsRouter from '../routes/attractions.routes';

jest.mock('../utils/jwt', () => ({ verifyToken: jest.fn() }));
jest.mock('../models/User', () => ({ User: { findById: jest.fn() } }));
jest.mock('../models/Attraction', () => ({ Attraction: { find: jest.fn(), countDocuments: jest.fn() } }));
jest.mock('../models/Category', () => ({ Category: { findOne: jest.fn().mockResolvedValue(null) } }));

const app = express();
app.use(express.json());
app.use('/attractions', attractionsRouter);

/** Capture the sort the controller hands Mongo for a given `?sort=` value. */
const sortFor = async (query: string): Promise<Record<string, 1 | -1>> => {
  let captured: Record<string, 1 | -1> = {};
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn(function (this: unknown, value: Record<string, 1 | -1>) { captured = value; return this; }),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
  };
  (Attraction.find as jest.Mock).mockReturnValue(chain);
  (Attraction.countDocuments as jest.Mock).mockResolvedValue(0);

  const response = await request(app).get(`/attractions${query}`);
  expect(response.status).toBe(200);
  return captured;
};

describe('GET /attractions sort contract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('honours the curated sortOrder the admin sets on each tour', async () => {
    // The storefront home asks for this. Before it was handled, the request
    // fell through to newest-first and the curated order never shipped.
    await expect(sortFor('?sort=sortOrder')).resolves.toEqual({ sortOrder: 1, featured: -1, rating: -1 });
  });

  it('keeps the price and editorial sorts it already supported', async () => {
    await expect(sortFor('?sort=price-low')).resolves.toEqual({ priceFrom: 1 });
    await expect(sortFor('?sort=price-high')).resolves.toEqual({ priceFrom: -1 });
    await expect(sortFor('?sort=recommended')).resolves.toEqual({ featured: -1, rating: -1 });
    await expect(sortFor('?sort=rating')).resolves.toEqual({ rating: -1 });
    await expect(sortFor('?sort=popularity')).resolves.toEqual({ reviewCount: -1 });
  });

  it('falls back to newest-first for an absent or unknown sort', async () => {
    await expect(sortFor('')).resolves.toEqual({ createdAt: -1 });
    await expect(sortFor('?sort=not-a-sort')).resolves.toEqual({ createdAt: -1 });
  });
});
