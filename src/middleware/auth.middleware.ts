import { Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { User } from '../models/User';
import { AuthRequest, AdminRole } from '../types';
import { sendError } from '../utils/response';

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from Authorization header or cookies
    let token: string | undefined;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      sendError(res, 'Authentication required', 401);
      return;
    }

    // Verify token
    const decoded = verifyToken(token);

    // Find user
    const user = await User.findById(decoded.userId);

    if (!user) {
      sendError(res, 'User not found', 401);
      return;
    }

    if (user.status !== 'active') {
      sendError(res, 'Account is not active', 403);
      return;
    }

    if ((decoded.sessionVersion || 0) !== (user.tokenVersion || 0)) {
      sendError(res, 'Session has been revoked', 401);
      return;
    }

    req.user = user;
    next();
  } catch {
    sendError(res, 'Invalid or expired token', 401);
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (token) {
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId);
      if (
        user &&
        user.status === 'active' &&
        (decoded.sessionVersion || 0) === (user.tokenVersion || 0)
      ) {
        req.user = user;
      }
    }

    next();
  } catch {
    // Token is invalid, but we continue without user
    next();
  }
};

export const requireRole = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Authentication required', 401);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }

    next();
  };
};

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    sendError(res, 'Authentication required', 401);
    return;
  }

  const adminRoles: AdminRole[] = ['super-admin', 'brand-admin', 'manager', 'editor', 'viewer'];
  
  if (!adminRoles.includes(req.user.role as AdminRole)) {
    sendError(res, 'Admin access required', 403);
    return;
  }

  next();
};

export const requireSuperAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    sendError(res, 'Authentication required', 401);
    return;
  }

  if (req.user.role !== 'super-admin') {
    sendError(res, 'Super admin access required', 403);
    return;
  }

  next();
};

// Check if user can access specific tenant
export const canAccessTenant = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    sendError(res, 'Authentication required', 401);
    return;
  }

  // Super admins can access all tenants
  if (req.user.role === 'super-admin') {
    next();
    return;
  }

  const tenantId = req.params.id || req.params.tenantId || req.body.tenantId || req.query.tenantId;

  if (!tenantId) {
    next();
    return;
  }

  // Check if user is assigned to this tenant
  const hasAccess = req.user.assignedTenants.some(
    (t) => t.toString() === tenantId
  );

  if (!hasAccess) {
    sendError(res, 'Access denied to this tenant', 403);
    return;
  }

  next();
};
