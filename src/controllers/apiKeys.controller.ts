import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { ApiKey } from '../models/ApiKey';
import { Tenant } from '../models/Tenant';
import { AuthRequest, ApiKeyScope } from '../types';
import { sendSuccess, sendError } from '../utils/response';
import { generateApiKey, apiKeyPreview, hashToken } from '../utils/hash';

const VALID_SCOPES: ApiKeyScope[] = ['read', 'write', '*'];

// Which tenant is this admin acting on, and may they?
//  - super-admin: any tenant (must be supplied), no membership requirement
//  - other admins: must resolve to one of their assignedTenants (or active req.tenant)
const resolveTargetTenantId = (
  req: AuthRequest,
  explicit?: string
): { tenantId?: string; error?: string } => {
  const isSuper = req.user?.role === 'super-admin';
  const candidate = explicit || req.tenant?._id?.toString();

  if (isSuper) {
    if (!candidate) return { error: 'tenantId is required' };
    if (!Types.ObjectId.isValid(candidate)) return { error: 'Invalid tenantId' };
    return { tenantId: candidate };
  }

  const assigned = (req.user?.assignedTenants || []).map((t) => t.toString());
  // Default to the admin's single tenant when none is specified.
  const target = candidate || (assigned.length === 1 ? assigned[0] : undefined);
  if (!target) return { error: 'tenantId is required' };
  if (!Types.ObjectId.isValid(target)) return { error: 'Invalid tenantId' };
  if (!assigned.includes(target)) {
    return { error: 'Access denied to this tenant' };
  }
  return { tenantId: target };
};

// Tenant ids this admin may read keys for (undefined => super-admin: all).
const readableTenantScope = (req: AuthRequest): string[] | undefined => {
  if (req.user?.role === 'super-admin') {
    return req.tenant ? [req.tenant._id.toString()] : undefined;
  }
  if (req.tenant) return [req.tenant._id.toString()];
  return (req.user?.assignedTenants || []).map((t) => t.toString());
};

export const createApiKey = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { label, scopes, tenantId: bodyTenantId } = req.body as {
      label?: string;
      scopes?: ApiKeyScope[];
      tenantId?: string;
    };

    if (!label || !label.trim()) {
      sendError(res, 'label is required', 400);
      return;
    }

    const { tenantId, error } = resolveTargetTenantId(req, bodyTenantId);
    if (error || !tenantId) {
      sendError(res, error || 'tenantId is required', error === 'Access denied to this tenant' ? 403 : 400);
      return;
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    let normalizedScopes: ApiKeyScope[] = ['read', 'write'];
    if (Array.isArray(scopes) && scopes.length > 0) {
      const invalid = scopes.filter((s) => !VALID_SCOPES.includes(s));
      if (invalid.length) {
        sendError(res, `Invalid scope(s): ${invalid.join(', ')}`, 400);
        return;
      }
      normalizedScopes = scopes;
    }

    // Generate the plaintext ONCE; store only its hash.
    const plaintext = generateApiKey();
    const apiKey = await ApiKey.create({
      tenantId,
      label: label.trim(),
      hashedKey: hashToken(plaintext),
      keyPrefix: apiKeyPreview(plaintext),
      scopes: normalizedScopes,
      createdBy: req.user?._id,
    });

    sendSuccess(
      res,
      {
        id: apiKey._id,
        tenantId: apiKey.tenantId,
        label: apiKey.label,
        scopes: apiKey.scopes,
        keyPrefix: apiKey.keyPrefix,
        // Returned exactly once — the caller must store it now.
        key: plaintext,
        createdAt: apiKey.createdAt,
      },
      'API key created. Store this key securely — it will not be shown again.',
      201
    );
  } catch (error) {
    next(error);
  }
};

export const listApiKeys = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const scope = readableTenantScope(req);
    const query: Record<string, unknown> = {};
    if (scope) {
      if (scope.length === 0) {
        sendSuccess(res, []);
        return;
      }
      query.tenantId = { $in: scope };
    }

    const keys = await ApiKey.find(query).sort({ createdAt: -1 }).lean();
    // Never expose the hash; lean() bypasses the toJSON transform.
    const sanitized = keys.map((k) => {
      const { hashedKey, __v, ...rest } = k as Record<string, unknown>;
      return rest;
    });
    sendSuccess(res, sanitized);
  } catch (error) {
    next(error);
  }
};

export const revokeApiKey = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      sendError(res, 'Invalid API key id', 400);
      return;
    }

    const apiKey = await ApiKey.findById(id);
    if (!apiKey) {
      sendError(res, 'API key not found', 404);
      return;
    }

    // Tenant isolation: a non-super admin can only touch keys of their tenants.
    const scope = readableTenantScope(req);
    if (scope && !scope.includes(apiKey.tenantId.toString())) {
      // 404 (not 403) so cross-tenant ids are not even confirmed to exist.
      sendError(res, 'API key not found', 404);
      return;
    }

    if (apiKey.revoked) {
      sendSuccess(res, { id: apiKey._id, revoked: true }, 'API key already revoked');
      return;
    }

    apiKey.revoked = true;
    apiKey.revokedAt = new Date();
    await apiKey.save();

    sendSuccess(res, { id: apiKey._id, revoked: true }, 'API key revoked');
  } catch (error) {
    next(error);
  }
};
