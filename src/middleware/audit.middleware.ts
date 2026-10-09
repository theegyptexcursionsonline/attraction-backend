import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AuthRequest } from '../types';
import { AUDITED_ROLES, recordAudit, requestTenantId, type AuditDetail } from '../services/auditLog.service';
import {
  MAX_CHANGES,
  attributeBrand,
  auditActionForVerb,
  auditSummary,
  createdRecordId,
  diffSnapshots,
  matchAuditRoute,
  needsBeforeSnapshot,
  subjectSpec,
  takeSnapshot,
  type AuditRouteMatch,
  type RecordSnapshot,
} from '../services/auditSubjects';
import { verifyToken } from '../utils/jwt';
import type { AuditAction } from '../models/AuditLog';

const ACTION_BY_METHOD: Record<string, AuditAction> = {
  POST: 'record.create',
  PUT: 'record.update',
  PATCH: 'record.update',
  DELETE: 'record.delete',
};

// Housekeeping and look-ups that change nothing anyone needs to review. Sign-in events are written
// by the auth controller itself, with the account they concern.
const SKIPPED = [
  /^\/api\/notifications(\/|$)/i,
  /^\/api\/auth\//i,
  /^\/api\/users\/wishlist(\/|$)/i,
  /^\/api\/promo-codes\/validate$/i,
  /^\/api\/bundles\/[^/]+\/quote$/i,
  /^\/api\/packages\/[^/]+\/quote$/i,
  /^\/api\/preview\/unlock(-by-code)?$/i,
];

interface AuditContext {
  match?: AuditRouteMatch;
  before?: RecordSnapshot | null;
  createdId?: string;
  siteId?: string;
}

/**
 * Only an admin's request is worth a "before" read. The session token says who is asking without a
 * database read; `authenticate` still decides access, and the entry is written only for the user it
 * sets. A token that does not verify gets no read at all.
 */
const looksLikeAdmin = (req: AuthRequest): boolean => {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.cookies as Record<string, string> | undefined)?.accessToken;
    return Boolean(token) && AUDITED_ROLES.has(String(verifyToken(token as string).role));
  } catch {
    return false;
  }
};

const recordIdFor = (context: AuditContext): string | undefined => {
  const from = context.match?.rule.idFrom;
  return from === 'response' ? context.createdId : from === 'site-header' ? context.siteId : context.match?.recordId;
};

/** Name, brands and changes of the record, from the pictures taken before and after the request. */
const describe = async (req: AuthRequest, res: Response, context: AuditContext): Promise<{ detail: AuditDetail; tenantId: Types.ObjectId | null }> => {
  const { rule, params } = context.match as AuditRouteMatch;
  const success = res.statusCode < 400;
  const created = rule.idFrom === 'response';
  const recordId = recordIdFor(context);
  let after: RecordSnapshot | null | undefined;
  if (rule.spec && success && (recordId || (subjectSpec(rule.spec).find && Object.keys(params).length))) {
    after = await takeSnapshot(rule.spec, recordId, params);
  }
  const before = context.before;
  const known = after || before || undefined;
  const { changes, changedFields } = success ? diffSnapshots(before, after, { created }) : { changes: [], changedFields: [] };
  const pathChanges = success && rule.pathChanges ? rule.pathChanges(params) : [];
  const subject = known?.subject || rule.subject;
  const outcome = success ? 'success' : 'failure';
  const recordBrands = Array.from(new Set([...(before?.brands || []), ...(after?.brands || [])]));
  const brand = attributeBrand({ recordBrands, requestTenant: requestTenantId(req)?.toString(), actor: req.user });
  return {
    detail: {
      subject,
      verb: rule.verb,
      resourceLabel: known?.label,
      resourceId: recordId,
      summary: auditSummary(rule.verb, subject, known?.label, outcome, res.statusCode),
      changes: [...pathChanges, ...changes].slice(0, MAX_CHANGES),
      changedFields,
    },
    tenantId: brand ? new Types.ObjectId(brand) : null,
  };
};

/**
 * User log for the admin team: after the response is sent, every create / change / delete made
 * by an admin account is written with who, when, from where, which record (its name), what changed
 * in its allow-listed fields and whether it was allowed. Mounted once in front of the API routes;
 * `authenticate` sets `req.user` on the same request object before the response finishes, so the
 * actor is known by then. For an admin's change to an existing record, the record's allow-listed
 * fields are read once before the route runs and once after the response is sent.
 */
export const auditTrail = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const action = ACTION_BY_METHOD[req.method];
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (!action || SKIPPED.some((pattern) => pattern.test(path))) { next(); return; }
  const context: AuditContext = { match: matchAuditRoute(req.method, path) };
  if (context.match?.rule.idFrom === 'site-header') {
    const header = req.headers['x-tenant-id'];
    if (typeof header === 'string' && /^[a-f0-9]{24}$/i.test(header)) context.siteId = header.toLowerCase();
  }
  if (context.match?.rule.idFrom === 'response' && typeof res.json === 'function') {
    // Only the new record's id is read from the reply; nothing else in it reaches the log.
    const json = res.json.bind(res);
    res.json = ((body: unknown) => {
      try { context.createdId = createdRecordId(body); } catch { /* the entry is written without the id */ }
      return json(body);
    }) as Response['json'];
  }
  res.on('finish', () => {
    const user = req.user;
    if (!user || !AUDITED_ROLES.has(user.role)) return;
    const outcome = res.statusCode < 400 ? 'success' : 'failure';
    if (!context.match) {
      recordAudit(req, { action, outcome, actor: user, statusCode: res.statusCode, includeRequest: true });
      return;
    }
    const verbAction = auditActionForVerb(context.match.rule.verb);
    void describe(req, res, context)
      .then(({ detail, tenantId }) => recordAudit(req, { action: verbAction, outcome, actor: user, statusCode: res.statusCode, includeRequest: true, detail, tenantId }))
      .catch((error: unknown) => {
        console.error('[audit] change could not be described', { error: error instanceof Error ? error.message : 'unknown' });
        // Without the record its brand is unknown, so the entry is filed under no brand rather
        // than under whichever brand happened to be open.
        recordAudit(req, { action: verbAction, outcome, actor: user, statusCode: res.statusCode, includeRequest: true, tenantId: null });
      });
  });
  if (!needsBeforeSnapshot(context.match) || !looksLikeAdmin(req)) { next(); return; }
  const { rule, params } = context.match as AuditRouteMatch;
  void takeSnapshot(rule.spec!, recordIdFor(context), params)
    .then((snapshot) => { context.before = snapshot; })
    .catch(() => { context.before = undefined; })
    .finally(() => next());
};
