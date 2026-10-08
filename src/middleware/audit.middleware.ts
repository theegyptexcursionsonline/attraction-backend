import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { AUDITED_ROLES, recordAudit } from '../services/auditLog.service';
import type { AuditAction } from '../models/AuditLog';

const ACTION_BY_METHOD: Record<string, AuditAction> = {
  POST: 'record.create',
  PUT: 'record.update',
  PATCH: 'record.update',
  DELETE: 'record.delete',
};

// Housekeeping that changes nothing anyone needs to review. Sign-in events are written by the
// auth controller itself, with the account they concern.
const SKIPPED = [/^\/api\/notifications(\/|$)/, /^\/api\/auth\//];

/**
 * User log for the admin team: after the response is sent, every create / change / delete made
 * by an admin account is written with who, when, from where, what record and whether it was
 * allowed. Mounted once in front of the API routes; `authenticate` sets `req.user` on the same
 * request object before the response finishes, so the actor is known by then.
 */
export const auditTrail = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const action = ACTION_BY_METHOD[req.method];
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (!action || SKIPPED.some((pattern) => pattern.test(path))) { next(); return; }
  res.on('finish', () => {
    const user = req.user;
    if (!user || !AUDITED_ROLES.has(user.role)) return;
    recordAudit(req, {
      action,
      outcome: res.statusCode < 400 ? 'success' : 'failure',
      actor: user,
      statusCode: res.statusCode,
      includeRequest: true,
    });
  });
  next();
};
