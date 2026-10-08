import { Request } from 'express';
import mongoose, { Types } from 'mongoose';
import { AuditLog, AuditAction } from '../models/AuditLog';

export const AUDITED_ROLES = new Set(['super-admin', 'brand-admin', 'manager', 'editor', 'viewer']);

interface AuditActor {
  _id?: unknown;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

/** Path without query string; long opaque tokens are masked so a link secret never lands in the log. */
export const auditPath = (url: string): string =>
  url.split('?')[0].replace(/[A-Za-z0-9_-]{40,}/g, ':token').slice(0, 300);

/** The API area a path belongs to, e.g. `/api/bundle-orders/admin/123` -> `bundle-orders`. */
export const auditResource = (path: string): string | undefined =>
  path.replace(/^\/api\//, '').split('/').filter(Boolean)[0]?.slice(0, 60);

/** The last record id named in a path. */
export const auditResourceId = (path: string): string | undefined =>
  path.split('/').reverse().find((part) => Types.ObjectId.isValid(part) && /^[a-f0-9]{24}$/i.test(part));

const requestTenantId = (req: Request & { tenant?: { _id?: unknown } }): Types.ObjectId | undefined => {
  const candidate = req.tenant?._id ? String(req.tenant._id) : req.headers['x-tenant-id'];
  return typeof candidate === 'string' && /^[a-f0-9]{24}$/i.test(candidate) ? new Types.ObjectId(candidate) : undefined;
};

/**
 * Writes one entry. Never throws and never delays the response: a log write that fails is
 * reported to the server log and the request carries on.
 */
export const recordAudit = (
  req: Request & { tenant?: { _id?: unknown } },
  entry: {
    action: AuditAction;
    outcome: 'success' | 'failure';
    actor?: AuditActor | null;
    email?: string;
    statusCode?: number;
    includeRequest?: boolean;
  }
): void => {
  const email = (entry.actor?.email || entry.email || '').toLowerCase().trim();
  // No database connection means nowhere to write; queueing the write would only stall.
  if (!email || mongoose.connection.readyState !== 1) return;
  const path = entry.includeRequest ? auditPath(req.originalUrl || req.url || '') : undefined;
  const name = entry.actor ? `${entry.actor.firstName || ''} ${entry.actor.lastName || ''}`.trim() : undefined;
  const actorId = entry.actor?._id && Types.ObjectId.isValid(String(entry.actor._id)) ? new Types.ObjectId(String(entry.actor._id)) : undefined;
  void AuditLog.create({
    action: entry.action,
    outcome: entry.outcome,
    actorId,
    actorEmail: email,
    actorName: name || undefined,
    actorRole: entry.actor?.role,
    ...(path ? { method: req.method, path, resource: auditResource(path), resourceId: auditResourceId(path) } : {}),
    tenantId: requestTenantId(req),
    statusCode: entry.statusCode,
    ip: (req.ip || '').slice(0, 64) || undefined,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300) || undefined,
  }).catch((error: unknown) => {
    console.error('[audit] entry could not be written', { action: entry.action, error: error instanceof Error ? error.message : 'unknown' });
  });
};
