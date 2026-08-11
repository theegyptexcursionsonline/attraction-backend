import { Types } from 'mongoose';
import { Attraction } from '../models/Attraction';
import { Category } from '../models/Category';
import { createAttraction } from '../controllers/attractions.controller';
import { AuthRequest } from '../types';

jest.mock('../models/Attraction', () => ({
  Attraction: { create: jest.fn(), exists: jest.fn() },
}));
jest.mock('../models/Category', () => ({
  Category: { findById: jest.fn() },
}));

const response = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('attraction category normalization', () => {
  beforeEach(() => jest.clearAllMocks());

  it('converts a legacy category ObjectId to the canonical slug before create', async () => {
    const categoryId = new Types.ObjectId().toString();
    const lean = jest.fn().mockResolvedValue({ slug: 'desert-safari', isActive: true });
    const select = jest.fn().mockReturnValue({ lean });
    (Category.findById as jest.Mock).mockReturnValue({ select });
    (Attraction.create as jest.Mock).mockResolvedValue({ _id: new Types.ObjectId() });
    const req = {
      body: { category: categoryId, tenantIds: [] },
      user: { _id: new Types.ObjectId(), role: 'super-admin', assignedTenants: [] },
    } as unknown as AuthRequest;
    const res = response();

    await createAttraction(req, res, jest.fn());

    expect(Attraction.create).toHaveBeenCalledWith(expect.objectContaining({ category: 'desert-safari' }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects an unknown category ObjectId rather than storing it', async () => {
    const lean = jest.fn().mockResolvedValue(null);
    const select = jest.fn().mockReturnValue({ lean });
    (Category.findById as jest.Mock).mockReturnValue({ select });
    const req = {
      body: { category: new Types.ObjectId().toString(), tenantIds: [] },
      user: { _id: new Types.ObjectId(), role: 'super-admin', assignedTenants: [] },
    } as unknown as AuthRequest;
    const res = response();

    await createAttraction(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Attraction.create).not.toHaveBeenCalled();
  });
});
