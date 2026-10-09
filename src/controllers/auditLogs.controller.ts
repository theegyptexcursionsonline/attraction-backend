import { once } from 'events';
import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AuditLog, type IAuditLog } from '../models/AuditLog';
import { User } from '../models/User';
import { AuthRequest } from '../types';
import { sendError, sendSuccess } from '../utils/response';
import { searchRegexValue } from '../utils/helpers';
import { callerTenantIds, isSuperAdmin } from '../utils/tenantScope';
import { recordAudit } from '../services/auditLog.service';
import { auditSummary, type AuditChange, type AuditSubject, type AuditVerb } from '../services/auditSubjects';
import { auditCsvHeader, auditCsvRow, cairoDate } from '../utils/auditCsv';

const TEAM_ROLES = ['brand-admin', 'manager', 'editor', 'viewer'];
// The admin downloads through its own same-origin proxy, which holds the whole reply in memory;
// 5,000 rows (about 2–3 MB) stays well inside what that hosting returns in one response.
const DEFAULT_EXPORT_MAX = 5_000;

/**
 * The entries a brand admin may read. Team members can work for several brands, so who did
 * something does not decide whose it is; the brand it happened on does:
 * - changes made on one of the caller's brands, except by a super admin (they stay visible after
 *   the person leaves the brand);
 * - changes no brand was named for, only when the person works for none but the caller's brands
 *   (otherwise the change may concern another brand);
 * - sign-ins and sign-outs of the caller's current team.
 */
const brandAdminVisibility = async (brands: string[]): Promise<Record<string, unknown>> => {
  const brandIds = brands.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  const team = await User.find({ assignedTenants: { $in: brandIds }, role: { $in: TEAM_ROLES } })
    .select('_id assignedTenants').lean<Array<{ _id: Types.ObjectId; assignedTenants?: Types.ObjectId[] }>>();
  const own = new Set(brands);
  const exclusive = team.filter((member) => (member.assignedTenants || []).every((tenant) => own.has(String(tenant))));
  return {
    $or: [
      { action: { $regex: '^record\\.' }, tenantId: { $in: brandIds }, actorRole: { $ne: 'super-admin' } },
      { action: { $regex: '^record\\.' }, tenantId: null, actorId: { $in: exclusive.map((member) => member._id) } },
      { action: { $regex: '^auth\\.' }, actorId: { $in: team.map((member) => member._id) } },
    ],
  };
};

interface AuditScope {
  query: Record<string, unknown>;
  superAdmin: boolean;
  callerBrands: Set<string>;
  /** A brand admin with no brand: nothing is visible and nothing is queried. */
  empty: boolean;
}

/**
 * One scope for the list, its counts and the CSV report, so a report can never hold an entry the
 * list would not show. Filters are ANDed onto the brand rule, never in place of it.
 */
const auditScope = async (req: AuthRequest): Promise<AuditScope> => {
  const { actorId, action, outcome, resource, subject, from, to, search } = req.query as Record<string, string | undefined>;
  const query: Record<string, unknown> = {};
  const superAdmin = isSuperAdmin(req.user);
  const callerBrands = new Set(superAdmin ? [] : callerTenantIds(req.user));
  if (!superAdmin) {
    if (callerBrands.size === 0) return { query, superAdmin, callerBrands, empty: true };
    query.$and = [await brandAdminVisibility([...callerBrands])];
  }
  if (actorId) query.actorId = new Types.ObjectId(actorId);
  if (action === 'auth.*' || action === 'record.*') query.action = { $regex: action === 'auth.*' ? '^auth\\.' : '^record\\.' };
  else if (action) query.action = action;
  if (outcome === 'success' || outcome === 'failure') query.outcome = outcome;
  if (resource) query.resource = resource;
  if (subject) query.subject = subject;
  const created: Record<string, Date> = {};
  if (from && !Number.isNaN(Date.parse(from))) created.$gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) created.$lte = new Date(to);
  if (Object.keys(created).length) query.createdAt = created;
  const safeSearch = searchRegexValue(search);
  if (safeSearch) {
    const fields = ['actorEmail', 'actorName', 'resourceLabel', ...(superAdmin ? ['path'] : [])];
    query.$or = fields.map((field) => ({ [field]: { $regex: safeSearch, $options: 'i' } }));
  }
  return { query, superAdmin, callerBrands, empty: false };
};

type PopulatedTenant = { _id?: unknown; name?: string; slug?: string } | undefined;

/**
 * An entry as a caller may see it. A brand admin never gets another brand's name, the API route
 * or the record id; the record's name and its changes only on entries filed under their brands
 * (the scope already guarantees it; this holds even if it did not).
 */
const presentEntry = (row: IAuditLog, scope: AuditScope) => {
  const populated = row.tenantId as unknown as PopulatedTenant;
  const tenantKey = populated?._id ? String(populated._id) : row.tenantId ? String(row.tenantId) : null;
  const tenant = populated?._id && (scope.superAdmin || scope.callerBrands.has(String(populated._id))) ? populated : undefined;
  const ownRecord = scope.superAdmin || !tenantKey || scope.callerBrands.has(tenantKey);
  const subject = (row.subject || null) as AuditSubject | null;
  const verb = (row.verb || null) as AuditVerb | null;
  const summary = ownRecord
    ? row.summary || null
    : verb ? auditSummary(verb, subject || undefined, undefined, row.outcome, row.statusCode) : null;
  return {
    id: String(row._id),
    action: row.action,
    outcome: row.outcome,
    actor: { id: row.actorId ? String(row.actorId) : null, email: row.actorEmail, name: row.actorName || null, role: row.actorRole || null },
    method: scope.superAdmin ? row.method || null : null,
    path: scope.superAdmin ? row.path || null : null,
    resource: row.resource || null,
    resourceId: scope.superAdmin ? row.resourceId || null : null,
    subject,
    verb,
    resourceLabel: ownRecord ? row.resourceLabel || null : null,
    summary,
    changes: (ownRecord ? row.changes || [] : []) as AuditChange[],
    changedFields: ownRecord ? row.changedFields || [] : [],
    brand: tenant && tenant._id ? { id: String(tenant._id), name: tenant.name || '', slug: tenant.slug || '' } : null,
    statusCode: row.statusCode ?? null,
    ip: row.ip || null,
    userAgent: row.userAgent || null,
    createdAt: row.createdAt,
  };
};
export type PresentedAuditEntry = ReturnType<typeof presentEntry>;

/** Midnight in Cairo today, as an instant. */
export const startOfCairoDay = (now = new Date()): Date => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((part) => [part.type, Number(part.value)]));
  const wallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offset = wallClock - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - offset);
};

/**
 * The user log. A super admin reads every entry. A brand admin reads what happened on their own
 * brands and their own team's sign-ins (never a super admin's), which covers their own actions.
 * The first page also carries counts for the same filters.
 */
export const listAuditLogs = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { cursor, actorId } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 100);
    if (cursor && !Types.ObjectId.isValid(cursor)) { sendError(res, 'Invalid cursor', 400); return; }
    if (actorId && !Types.ObjectId.isValid(actorId)) { sendError(res, 'Invalid team member', 400); return; }

    const scope = await auditScope(req);
    if (scope.empty) {
      sendSuccess(res, { data: [], pagination: { limit, hasMore: false, nextCursor: null }, ...(cursor ? {} : { stats: { total: 0, today: 0, needsAttention: 0 } }) });
      return;
    }
    const stats = cursor ? undefined : await Promise.all([
      AuditLog.countDocuments(scope.query),
      AuditLog.countDocuments({ $and: [scope.query, { createdAt: { $gte: startOfCairoDay() } }] }),
      AuditLog.countDocuments({ $and: [scope.query, { outcome: 'failure' }] }),
    ]).then(([total, today, needsAttention]) => ({ total, today, needsAttention }));
    const pageQuery = cursor ? { $and: [scope.query, { _id: { $lt: new Types.ObjectId(cursor) } }] } : scope.query;

    const rows = await AuditLog.find(pageQuery).sort({ _id: -1 }).limit(limit + 1).populate('tenantId', 'name slug').lean<IAuditLog[]>();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    sendSuccess(res, {
      data: page.map((row) => presentEntry(row, scope)),
      pagination: { limit, hasMore, nextCursor: hasMore && page.length ? String(page[page.length - 1]._id) : null },
      ...(stats ? { stats } : {}),
    });
  } catch (error) {
    next(error);
  }
};

/** The most entries one CSV report may hold (AUDIT_EXPORT_MAX, 1–50,000). */
export const auditExportMax = (): number => {
  const configured = Number.parseInt(process.env.AUDIT_EXPORT_MAX || '', 10);
  return Number.isSafeInteger(configured) && configured >= 1 && configured <= 50_000 ? configured : DEFAULT_EXPORT_MAX;
};

/** A report is filed under the caller's brand when they manage exactly one, else under none. */
const exportBrand = (scope: AuditScope): Types.ObjectId | null =>
  !scope.superAdmin && scope.callerBrands.size === 1 ? new Types.ObjectId([...scope.callerBrands][0]) : null;

/** The report itself is logged: who took which share of the log, with how many entries. */
const logExport = (req: AuthRequest, scope: AuditScope, outcome: 'success' | 'failure', statusCode: number, count: number) => {
  const size = `${count.toLocaleString('en-US')} ${count === 1 ? 'entry' : 'entries'}`;
  recordAudit(req, {
    action: 'record.export',
    outcome,
    actor: req.user,
    statusCode,
    includeRequest: true,
    detail: { subject: 'user-log', verb: 'export', summary: auditSummary('export', 'user-log', size, outcome, statusCode), changes: [{ field: 'entryCount', after: count }] },
    tenantId: exportBrand(scope),
  });
};

/**
 * CSV report of the current filters, in the same brand scope as the list. Counted first and
 * refused (never cut short) above the limit; Cairo and UTC times; cells a spreadsheet could run as
 * formulas are neutralised; a UTF-8 byte-order mark keeps Arabic names readable in Excel. The
 * report itself is logged.
 */
export const exportAuditLogs = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  let scope: AuditScope | undefined;
  let count = 0;
  try {
    const { actorId } = req.query as Record<string, string | undefined>;
    if (actorId && !Types.ObjectId.isValid(actorId)) { sendError(res, 'Invalid team member', 400); return; }
    scope = await auditScope(req);
    const max = auditExportMax();
    count = scope.empty ? 0 : await AuditLog.countDocuments(scope.query);
    if (count > max) {
      logExport(req, scope, 'failure', 400, count);
      res.status(400).json({
        success: false,
        error: `This report would hold ${count.toLocaleString('en-US')} entries; the limit is ${max.toLocaleString('en-US')}. Narrow the dates or filters and try again.`,
        code: 'EXPORT_TOO_LARGE',
        count,
        limit: max,
      });
      return;
    }
    res.status(200);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="user-log-${cairoDate(new Date())}.csv"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.write(`﻿${auditCsvHeader(scope.superAdmin)}`);
    let abandoned = false;
    if (!scope.empty) {
      // The limit is applied again while reading: entries written after the count stay out.
      const rows = AuditLog.find(scope.query).sort({ _id: -1 }).limit(max).populate('tenantId', 'name slug').lean<IAuditLog[]>().cursor();
      for await (const row of rows) {
        if (res.write(auditCsvRow(presentEntry(row as IAuditLog, scope), scope.superAdmin))) continue;
        // A reader that went away never drains; stop reading instead of waiting for ever.
        await Promise.race([once(res, 'drain'), once(res, 'close')]);
        if (res.destroyed) { abandoned = true; break; }
      }
    }
    if (abandoned) { logExport(req, scope, 'failure', 499, count); return; }
    res.end();
    logExport(req, scope, 'success', 200, count);
  } catch (error) {
    if (scope) logExport(req, scope, 'failure', 500, count);
    if (!res.headersSent) { next(error); return; }
    res.destroy(error instanceof Error ? error : undefined);
  }
};
