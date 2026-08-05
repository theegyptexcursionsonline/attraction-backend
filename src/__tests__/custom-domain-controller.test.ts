import { NextFunction, Response } from 'express';
import { Types } from 'mongoose';

const mockNetlify = {
  isConfigured: jest.fn(),
  getDnsTargets: jest.fn(),
  addDomain: jest.fn(),
  rollbackAliases: jest.fn(),
  getReadiness: jest.fn(),
  removeDomain: jest.fn(),
};

jest.mock('../services/netlifyDomain.service', () => {
  const actual = jest.requireActual('../services/netlifyDomain.service');
  return { ...actual, netlifyDomainService: mockNetlify };
});

jest.mock('../models/Tenant', () => ({
  Tenant: {
    findById: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));
jest.mock('../models/DomainClaim', () => ({
  DomainClaim: {
    create: jest.fn(),
    findById: jest.fn(),
    deleteOne: jest.fn(),
  },
}));

import {
  configureCustomDomain,
  getTenantByCustomDomain,
  verifyCustomDomain,
} from '../controllers/tenants.controller';
import { DomainClaim } from '../models/DomainClaim';
import { Tenant } from '../models/Tenant';
import { AuthRequest } from '../types';

const response = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
};

const queryResult = <T>(value: T) => ({
  select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }),
});

describe('custom-domain tenant controllers', () => {
  const tenantId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const next = jest.fn() as NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNetlify.isConfigured.mockReturnValue(true);
    mockNetlify.getDnsTargets.mockReturnValue({
      apex: 'apex-loadbalancer.netlify.com',
      www: 'foxes-network.netlify.app',
    });
  });

  it('resolves www hostnames to the minimum public tenant identity', async () => {
    (Tenant.findOne as jest.Mock).mockReturnValue(queryResult({
      _id: tenantId,
      slug: 'future-tenant',
      name: 'Future Tenant',
      customDomain: 'future-domain.com',
      status: 'active',
      internalSecret: 'never-return',
    }));
    const { res, status, json } = response();

    await getTenantByCustomDomain(
      { params: { hostname: 'www.future-domain.com' } } as unknown as AuthRequest,
      res,
      next
    );

    expect(Tenant.findOne).toHaveBeenCalledWith(expect.objectContaining({
      customDomain: 'future-domain.com',
    }));
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ slug: 'future-tenant' }),
    }));
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('internalSecret');
  });

  it('does not call Netlify when another tenant already owns the domain', async () => {
    (Tenant.findById as jest.Mock).mockResolvedValue({
      _id: tenantId,
      customDomain: undefined,
    });
    (Tenant.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    });
    const { res, status } = response();

    await configureCustomDomain(
      {
        params: { id: String(tenantId) },
        body: { domain: 'future-domain.com' },
        user: { _id: userId },
      } as unknown as AuthRequest,
      res,
      next
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(DomainClaim.create).not.toHaveBeenCalled();
    expect(mockNetlify.addDomain).not.toHaveBeenCalled();
  });

  it('uses the unique claim to stop concurrent cross-tenant assignment', async () => {
    (Tenant.findById as jest.Mock).mockResolvedValue({ _id: tenantId });
    (Tenant.findOne as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    (DomainClaim.create as jest.Mock).mockRejectedValue({ code: 11000 });
    (DomainClaim.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ tenantId: new Types.ObjectId() }),
    });
    const { res, status } = response();

    await configureCustomDomain(
      {
        params: { id: String(tenantId) },
        body: { domain: 'future-domain.com' },
        user: { _id: userId },
      } as unknown as AuthRequest,
      res,
      next
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(mockNetlify.addDomain).not.toHaveBeenCalled();
  });

  it('stores a pending domain only after Netlify aliases are attached', async () => {
    const tenant = { _id: tenantId, customDomain: undefined };
    (Tenant.findById as jest.Mock).mockResolvedValue(tenant);
    (Tenant.findOne as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    (DomainClaim.create as jest.Mock).mockResolvedValue({ _id: 'future-domain.com' });
    mockNetlify.addDomain.mockResolvedValue({
      aliases: ['future-domain.com', 'www.future-domain.com'],
      aliasesAdded: ['future-domain.com', 'www.future-domain.com'],
      aliasesAttached: true,
      certificateReady: false,
      certificateState: 'processing',
      dnsTargets: mockNetlify.getDnsTargets(),
    });
    (Tenant.findOneAndUpdate as jest.Mock).mockResolvedValue({
      ...tenant,
      customDomain: 'future-domain.com',
      customDomainStatus: 'pending_dns',
      domainMigrated: false,
    });
    const { res, status, json } = response();

    await configureCustomDomain(
      {
        params: { id: String(tenantId) },
        body: { domain: 'WWW.Future-Domain.com.' },
        user: { _id: userId },
      } as unknown as AuthRequest,
      res,
      next
    );

    expect(mockNetlify.addDomain).toHaveBeenCalledWith('future-domain.com');
    expect(Tenant.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: tenantId }),
      expect.objectContaining({
        $set: expect.objectContaining({
          customDomain: 'future-domain.com',
          customDomainStatus: 'pending_dns',
          domainMigrated: false,
        }),
      }),
      expect.objectContaining({ new: true, runValidators: true })
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'pending_dns' }),
    }));
  });

  it('rolls back only newly added aliases when the tenant update loses a race', async () => {
    (Tenant.findById as jest.Mock).mockResolvedValue({ _id: tenantId });
    (Tenant.findOne as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    (DomainClaim.create as jest.Mock).mockResolvedValue({ _id: 'future-domain.com' });
    mockNetlify.addDomain.mockResolvedValue({
      aliases: ['future-domain.com', 'www.future-domain.com'],
      aliasesAdded: ['future-domain.com'],
      aliasesAttached: true,
      certificateReady: false,
      certificateState: 'processing',
      dnsTargets: mockNetlify.getDnsTargets(),
    });
    (Tenant.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
    mockNetlify.rollbackAliases.mockResolvedValue(undefined);
    (DomainClaim.deleteOne as jest.Mock).mockResolvedValue({ deletedCount: 1 });
    const { res } = response();

    await configureCustomDomain(
      {
        params: { id: String(tenantId) },
        body: { domain: 'future-domain.com' },
        user: { _id: userId },
      } as unknown as AuthRequest,
      res,
      next
    );

    expect(mockNetlify.rollbackAliases).toHaveBeenCalledWith(['future-domain.com']);
    expect(DomainClaim.deleteOne).toHaveBeenCalledWith({ _id: 'future-domain.com' });
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('activates only after Netlify confirms both aliases and the TLS certificate', async () => {
    const tenant = { _id: tenantId, customDomain: 'future-domain.com' };
    (Tenant.findById as jest.Mock).mockResolvedValue(tenant);
    mockNetlify.getReadiness.mockResolvedValue({
      aliases: ['future-domain.com', 'www.future-domain.com'],
      aliasesAdded: [],
      aliasesAttached: true,
      certificateReady: true,
      certificateState: 'issued',
      dnsTargets: mockNetlify.getDnsTargets(),
    });
    (Tenant.findOneAndUpdate as jest.Mock).mockResolvedValue({
      ...tenant,
      customDomainStatus: 'ready',
      domainMigrated: true,
    });
    const { res, status, json } = response();

    await verifyCustomDomain(
      {
        params: { id: String(tenantId) },
        user: { _id: userId },
      } as unknown as AuthRequest,
      res,
      next
    );

    expect(Tenant.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ customDomain: 'future-domain.com' }),
      expect.objectContaining({
        $set: expect.objectContaining({ customDomainStatus: 'ready', domainMigrated: true }),
      }),
      { new: true }
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ready', certificateReady: true }),
    }));
  });
});
