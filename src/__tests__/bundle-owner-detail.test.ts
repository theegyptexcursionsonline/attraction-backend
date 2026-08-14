import { NextFunction, Response } from 'express';
import { Types } from 'mongoose';
import {
  getBundleSupplyOffer,
  listBundleSupplyOffers,
  reviseBundleSupplyOfferHandler,
} from '../controllers/bundleSupplyOffers.controller';
import {
  getAdminBundle,
  listAdminBundles,
  updateBundleDefinitionHandler,
} from '../controllers/bundles.controller';
import { BundleDefinition } from '../models/BundleDefinition';
import { BundleSupplyOffer } from '../models/BundleSupplyOffer';
import { AuthRequest } from '../types';

jest.mock('../models/BundleDefinition', () => ({
  BundleDefinition: { findOne: jest.fn(), find: jest.fn() },
}));
jest.mock('../models/BundleSupplyOffer', () => ({
  BundleSupplyOffer: { findOne: jest.fn(), find: jest.fn() },
}));

const response = (): Response => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const next = jest.fn() as NextFunction;

describe('Bundle admin detail owner scopes', () => {
  const selectedTenantId = new Types.ObjectId();
  const otherTenantId = new Types.ObjectId();
  const entityId = new Types.ObjectId().toString();
  const superAdmin = {
    _id: new Types.ObjectId(),
    role: 'super-admin',
    assignedTenants: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (BundleDefinition.findOne as jest.Mock).mockResolvedValue(null);
    (BundleSupplyOffer.findOne as jest.Mock).mockResolvedValue(null);
    const emptyPage = () => ({
      sort: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([]) })),
    });
    (BundleDefinition.find as jest.Mock).mockImplementation(emptyPage);
    (BundleSupplyOffer.find as jest.Mock).mockImplementation(emptyPage);
  });

  it('preserves deliberate Super Admin aggregate Bundle browsing without a selected tenant', async () => {
    const req = {
      query: { limit: 20 },
      user: superAdmin,
    } as unknown as AuthRequest;
    const res = response();

    await listAdminBundles(req, res, next);

    expect(BundleDefinition.find).toHaveBeenCalledWith({});
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('constrains Bundle history/list browsing when a tenant is selected', async () => {
    const req = {
      query: { limit: 20 },
      tenant: { _id: selectedTenantId },
      user: superAdmin,
    } as unknown as AuthRequest;
    const res = response();

    await listAdminBundles(req, res, next);

    expect(BundleDefinition.find).toHaveBeenCalledWith({
      storefrontTenantId: selectedTenantId.toString(),
    });
  });

  it('preserves explicit Super Admin all-supplier browsing with or without selected tenant context', async () => {
    const aggregateReq = {
      query: { limit: 20, allSuppliers: true },
      user: superAdmin,
    } as unknown as AuthRequest;
    const aggregateRes = response();
    await listBundleSupplyOffers(aggregateReq, aggregateRes, next);
    expect(BundleSupplyOffer.find).toHaveBeenLastCalledWith({});

    const scopedReq = {
      query: { limit: 20, allSuppliers: true },
      tenant: { _id: selectedTenantId },
      user: superAdmin,
    } as unknown as AuthRequest;
    const scopedRes = response();
    await listBundleSupplyOffers(scopedReq, scopedRes, next);
    expect(BundleSupplyOffer.find).toHaveBeenLastCalledWith({});
  });

  it('queries Bundle definitions by id and explicit storefront owner', async () => {
    const req = {
      params: { id: entityId },
      query: { tenantId: selectedTenantId.toString() },
      tenant: { _id: selectedTenantId },
      user: superAdmin,
    } as unknown as AuthRequest;
    const res = response();

    await getAdminBundle(req, res, next);

    expect(BundleDefinition.findOne).toHaveBeenCalledWith({
      _id: entityId,
      storefrontTenantId: selectedTenantId.toString(),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('does not read a Bundle when the requested owner differs from selected scope', async () => {
    const req = {
      params: { id: entityId },
      query: { tenantId: otherTenantId.toString() },
      tenant: { _id: selectedTenantId },
      user: superAdmin,
    } as unknown as AuthRequest;
    const res = response();

    await getAdminBundle(req, res, next);

    expect(BundleDefinition.findOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('queries supply offers by id and explicit supplier owner', async () => {
    const req = {
      params: { id: entityId },
      query: { tenantId: selectedTenantId.toString() },
      tenant: { _id: selectedTenantId },
      user: superAdmin,
    } as unknown as AuthRequest;
    const res = response();

    await getBundleSupplyOffer(req, res, next);

    expect(BundleSupplyOffer.findOne).toHaveBeenCalledWith({
      _id: entityId,
      supplierTenantId: selectedTenantId.toString(),
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('does not read an offer when the requested owner differs from selected scope', async () => {
    const req = {
      params: { id: entityId },
      query: { tenantId: otherTenantId.toString() },
      tenant: { _id: selectedTenantId },
      user: superAdmin,
    } as unknown as AuthRequest;
    const res = response();

    await getBundleSupplyOffer(req, res, next);

    expect(BundleSupplyOffer.findOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('fails closed before a Bundle mutation when the immutable owner differs from selected scope', async () => {
    const req = {
      params: { id: entityId },
      body: {
        storefrontTenantId: otherTenantId.toString(),
        revision: 1,
        title: 'Cross-tenant attempt',
      },
      tenant: { _id: selectedTenantId },
      user: superAdmin,
    } as unknown as AuthRequest;
    const res = response();

    await updateBundleDefinitionHandler(req, res, next);

    expect(BundleDefinition.findOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('fails closed before an offer mutation when the immutable owner differs from selected scope', async () => {
    const req = {
      params: { id: entityId },
      body: {
        supplierTenantId: otherTenantId.toString(),
        revision: 1,
        termsVersion: 'v2',
      },
      tenant: { _id: selectedTenantId },
      user: superAdmin,
    } as unknown as AuthRequest;
    const res = response();

    await reviseBundleSupplyOfferHandler(req, res, next);

    expect(BundleSupplyOffer.findOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
