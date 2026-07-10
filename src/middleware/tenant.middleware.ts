import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { AuthRequest } from '../types';
import { sendError } from '../utils/response';

// Pending tenants are not public storefronts. Keeping them out here prevents
// an explicit tenant header from exposing unpublished catalog data.
const PUBLIC_TENANT_STATUSES = ['active', 'coming_soon'] as const;
const TENANT_SCOPED_ADMIN_ROLES = ['brand-admin', 'manager', 'editor', 'viewer'];

const canUseTenant = (req: AuthRequest, tenantId: string): boolean => {
  if (!req.user || req.user.role === 'super-admin') return true;
  if (!TENANT_SCOPED_ADMIN_ROLES.includes(req.user.role)) return true;

  return (req.user.assignedTenants || []).some((assignedTenantId) =>
    assignedTenantId.toString() === tenantId
  );
};

const rejectUnassignedTenant = (
  req: AuthRequest,
  res: Response,
  tenantId: string
): boolean => {
  if (canUseTenant(req, tenantId)) return false;

  sendError(res, 'Access denied to this tenant', 403);
  return true;
};

export const resolveTenant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get tenant from header, query, or host
    let tenantIdentifier: string | undefined;

    // Check X-Tenant-ID header first
    if (req.headers['x-tenant-id']) {
      tenantIdentifier = req.headers['x-tenant-id'] as string;
    }
    // Check query parameter
    else if (req.query.tenantId) {
      tenantIdentifier = req.query.tenantId as string;
    }
    // Try to resolve from host
    else {
      const host = req.headers.host;
      if (host) {
        // Check if it's a subdomain
        const subdomain = host.split('.')[0];
        if (subdomain && subdomain !== 'www' && subdomain !== 'api' && subdomain !== 'localhost') {
          tenantIdentifier = subdomain;
        }
      }
    }

    if (!tenantIdentifier) {
      // No tenant specified, continue without tenant context
      next();
      return;
    }

    // Find tenant by ID, slug, or domain
    const isObjectId = Types.ObjectId.isValid(tenantIdentifier);
    const tenant = await Tenant.findOne({
      $or: [
        ...(isObjectId ? [{ _id: tenantIdentifier }] : []),
        { slug: tenantIdentifier },
        { domain: tenantIdentifier },
        { customDomain: tenantIdentifier },
      ],
      status: { $in: PUBLIC_TENANT_STATUSES },
    });

    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    if (rejectUnassignedTenant(req, res, tenant._id.toString())) return;

    req.tenant = tenant;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireTenant = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.tenant) {
    sendError(res, 'Tenant context required', 400);
    return;
  }
  next();
};

export const optionalTenant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let tenantIdentifier: string | undefined;

    if (req.headers['x-tenant-id']) {
      tenantIdentifier = req.headers['x-tenant-id'] as string;
    } else if (req.query.tenantId) {
      tenantIdentifier = req.query.tenantId as string;
    }

    if (tenantIdentifier) {
      const isObjectId = Types.ObjectId.isValid(tenantIdentifier);
      const tenant = await Tenant.findOne({
        $or: [
          ...(isObjectId ? [{ _id: tenantIdentifier }] : []),
          { slug: tenantIdentifier },
          { domain: tenantIdentifier },
          { customDomain: tenantIdentifier },
        ],
        status: { $in: PUBLIC_TENANT_STATUSES },
      });

      if (!tenant) {
        sendError(res, 'Tenant not found', 404);
        return;
      }

      if (rejectUnassignedTenant(req, res, tenant._id.toString())) return;

      req.tenant = tenant;
    }

    next();
  } catch (error) {
    next(error);
  }
};
