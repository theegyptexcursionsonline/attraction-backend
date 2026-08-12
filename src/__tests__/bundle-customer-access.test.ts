import { NextFunction, Response } from 'express';
import { Types } from 'mongoose';
import { verifyBundleAccessToken } from '../bundles/guestAccess';
import {
  getBundleOrderByReferenceHandler,
  getBundleOrderHandler,
} from '../controllers/bundleOrders.controller';
import { BundleOrder } from '../models/BundleOrder';
import { AuthRequest } from '../types';

jest.mock('../bundles/guestAccess', () => ({
  generateBundleAccessToken: jest.fn(() => 'test-token'),
  verifyBundleAccessToken: jest.fn(),
}));
jest.mock('../models/BundleOrder', () => ({
  BundleOrder: { findOne: jest.fn() },
}));
jest.mock('../services/bundleOrder.service', () => ({
  BundleOrderError: class BundleOrderError extends Error {},
  createBundleOrder: jest.fn(),
  customerBundleOrderDto: jest.fn((order) => ({ id: order._id.toString(), reference: order.reference })),
  supplierBundleOrderDto: jest.fn(),
}));

const response = (): Response => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const next = jest.fn() as NextFunction;
const TENANT_ID = new Types.ObjectId();
const ORDER_ID = new Types.ObjectId();
const order = {
  _id: ORDER_ID,
  reference: 'BTW-ACCESS01',
  storefrontTenantId: TENANT_ID,
  userId: null,
};

describe('bundle customer order access isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (verifyBundleAccessToken as jest.Mock).mockReturnValue(false);
  });

  it('puts the resolved tenant in the by-id database query', async () => {
    (BundleOrder.findOne as jest.Mock).mockResolvedValue(null);
    const req = {
      params: { id: ORDER_ID.toString() },
      headers: {},
      tenant: { _id: TENANT_ID },
    } as unknown as AuthRequest;
    const res = response();

    await getBundleOrderHandler(req, res, next);

    expect(BundleOrder.findOne).toHaveBeenCalledWith({
      _id: ORDER_ID.toString(),
      storefrontTenantId: TENANT_ID,
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('puts the resolved tenant in the reference database query', async () => {
    (BundleOrder.findOne as jest.Mock).mockResolvedValue(null);
    const req = {
      params: { reference: order.reference },
      headers: {},
      tenant: { _id: TENANT_ID },
    } as unknown as AuthRequest;
    const res = response();

    await getBundleOrderByReferenceHandler(req, res, next);

    expect(BundleOrder.findOne).toHaveBeenCalledWith({
      reference: order.reference,
      storefrontTenantId: TENANT_ID,
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it.each([
    ['by id', getBundleOrderHandler, { id: ORDER_ID.toString() }],
    ['by reference', getBundleOrderByReferenceHandler, { reference: order.reference }],
  ])('returns the same not-found response for a wrong guest capability %s', async (_label, handler, params) => {
    (BundleOrder.findOne as jest.Mock).mockResolvedValue(order);
    const req = {
      params,
      headers: { 'x-bundle-access-token': 'wrong-token' },
      tenant: { _id: TENANT_ID },
    } as unknown as AuthRequest;
    const res = response();

    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Bundle order not found',
    }));
  });
});
