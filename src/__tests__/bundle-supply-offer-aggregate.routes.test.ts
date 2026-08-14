import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { verifyToken } from '../utils/jwt';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import { BundleSupplyOffer } from '../models/BundleSupplyOffer';
import bundleSupplyOffersRouter from '../routes/bundleSupplyOffers.routes';

jest.mock('../utils/jwt', () => ({ verifyToken: jest.fn() }));
jest.mock('../models/User', () => ({ User: { findById: jest.fn() } }));
jest.mock('../models/Tenant', () => ({ Tenant: { findOne: jest.fn() } }));
jest.mock('../models/BundleSupplyOffer', () => ({
  BundleSupplyOffer: { find: jest.fn(), findOne: jest.fn() },
}));

const app = express();
app.use(express.json());
app.use('/bundle-supply-offers', bundleSupplyOffersRouter);

const userId = new Types.ObjectId();
const selectedTenantId = new Types.ObjectId();
const supplierA = new Types.ObjectId();
const supplierB = new Types.ObjectId();
const newestOfferId = new Types.ObjectId();
const middleOfferId = new Types.ObjectId();
const oldestOfferId = new Types.ObjectId();

const offers = [
  { _id: newestOfferId, supplierTenantId: supplierA, status: 'active' },
  { _id: middleOfferId, supplierTenantId: supplierB, status: 'active' },
  { _id: oldestOfferId, supplierTenantId: supplierA, status: 'active' },
];

const authenticateAs = (role: 'super-admin' | 'brand-admin'): void => {
  (verifyToken as jest.Mock).mockReturnValue({
    userId: userId.toString(),
    sessionVersion: 0,
  });
  (User.findById as jest.Mock).mockResolvedValue({
    _id: userId,
    role,
    status: 'active',
    tokenVersion: 0,
    assignedTenants: role === 'brand-admin' ? [selectedTenantId] : [],
  });
};

const resultForQuery = (query: Record<string, unknown>): typeof offers => {
  if (query.supplierTenantId) {
    return offers.filter(
      (offer) => offer.supplierTenantId.toString() === String(query.supplierTenantId)
    );
  }
  if (query._id) return [offers[2]];
  return offers;
};

describe('Bundle supply-offer aggregate route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Tenant.findOne as jest.Mock).mockResolvedValue({
      _id: selectedTenantId,
      status: 'active',
    });
    (BundleSupplyOffer.find as jest.Mock).mockImplementation(
      (query: Record<string, unknown>) => ({
        sort: jest.fn(() => ({
          limit: jest.fn().mockResolvedValue(resultForQuery(query)),
        })),
      })
    );
  });

  it('keeps multiple suppliers and the cursor tail reachable for a Super Admin with a tenant header', async () => {
    authenticateAs('super-admin');

    const firstPage = await request(app)
      .get('/bundle-supply-offers?allSuppliers=true&status=active&limit=2')
      .set('Authorization', 'Bearer token')
      .set('x-tenant-id', selectedTenantId.toString());

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.data).toHaveLength(2);
    expect(firstPage.body.data.pageInfo).toEqual({
      hasMore: true,
      nextCursor: middleOfferId.toString(),
    });
    expect(BundleSupplyOffer.find).toHaveBeenLastCalledWith({ status: 'active' });

    const secondPage = await request(app)
      .get(
        `/bundle-supply-offers?allSuppliers=true&status=active&limit=2&cursor=${firstPage.body.data.pageInfo.nextCursor}`
      )
      .set('Authorization', 'Bearer token')
      .set('x-tenant-id', selectedTenantId.toString());

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data.data).toHaveLength(1);
    expect(secondPage.body.data.data[0]._id).toBe(oldestOfferId.toString());
    expect(secondPage.body.data.pageInfo).toEqual({
      hasMore: false,
      nextCursor: null,
    });
    expect(BundleSupplyOffer.find).toHaveBeenLastCalledWith({
      status: 'active',
      _id: { $lt: middleOfferId.toString() },
    });

    const supplierIds = [
      ...firstPage.body.data.data,
      ...secondPage.body.data.data,
    ].map((offer: { supplierTenantId: string }) => offer.supplierTenantId);
    expect(new Set(supplierIds)).toEqual(
      new Set([supplierA.toString(), supplierB.toString()])
    );
  });

  it('keeps allSuppliers tenant-scoped for a brand admin', async () => {
    authenticateAs('brand-admin');

    const response = await request(app)
      .get('/bundle-supply-offers?allSuppliers=true&status=active&limit=20')
      .set('Authorization', 'Bearer token')
      .set('x-tenant-id', selectedTenantId.toString());

    expect(response.status).toBe(200);
    expect(BundleSupplyOffer.find).toHaveBeenCalledWith({
      supplierTenantId: selectedTenantId.toString(),
      status: 'active',
    });
  });
});
