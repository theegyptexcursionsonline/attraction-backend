import { Response, NextFunction } from 'express';
import { ApiKey } from '../models/ApiKey';
import { Tenant } from '../models/Tenant';
import { AuthRequest, ApiKeyScope } from '../types';
import { hashToken, API_KEY_PREFIX } from '../utils/hash';
import { sendError } from '../utils/response';

const PUBLIC_TENANT_STATUSES = ['active', 'coming_soon', 'pending'];

// Extract the presented key from `x-api-key` or a `Bearer fxs_att_…` header.
const extractApiKey = (req: AuthRequest): string | undefined => {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    // Only treat Bearer tokens that look like our API keys as API keys, so JWT
    // Bearer auth on shared routes is never accidentally consumed here.
    if (token.startsWith(API_KEY_PREFIX)) {
      return token;
    }
  }
  return undefined;
};

/**
 * Authenticate a programmatic request via API key and RESOLVE its tenant.
 *
 * The tenant is derived solely from the key record — a caller can never select
 * or override the tenant. On success `req.apiKey` and `req.tenant` are set.
 */
export const authenticateApiKey = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const presented = extractApiKey(req);
    if (!presented) {
      sendError(res, 'API key required', 401);
      return;
    }

    const apiKey = await ApiKey.findOne({
      hashedKey: hashToken(presented),
      revoked: false,
    });

    if (!apiKey) {
      sendError(res, 'Invalid or revoked API key', 401);
      return;
    }

    const tenant = await Tenant.findOne({
      _id: apiKey.tenantId,
      status: { $in: PUBLIC_TENANT_STATUSES },
    });

    if (!tenant) {
      // Key belongs to a tenant that no longer exists / is suspended.
      sendError(res, 'Tenant for this API key is unavailable', 403);
      return;
    }

    req.apiKey = apiKey;
    req.tenant = tenant;

    // Best-effort usage timestamp; never blocks the request.
    ApiKey.updateOne({ _id: apiKey._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Require a given scope on the authenticating API key. `*` grants everything.
 * Must run AFTER `authenticateApiKey`.
 */
export const requireScope = (scope: ApiKeyScope) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const scopes = req.apiKey?.scopes || [];
    if (scopes.includes('*') || scopes.includes(scope)) {
      next();
      return;
    }
    sendError(res, `API key missing required scope: ${scope}`, 403);
  };
};
