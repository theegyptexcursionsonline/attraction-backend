import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog';
import { User } from '../models/User';
import { AuthRequest } from '../types';
import { sendError, sendSuccess } from '../utils/response';
import { searchRegexValue } from '../utils/helpers';
import { callerTenantIds, isSuperAdmin } from '../utils/tenantScope';

/**
 * The user log. A super admin reads every entry. A brand admin reads the entries of their own
 * brands' team (never a super admin's), which covers their own actions too.
 */
export const listAuditLogs = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { cursor, actorId, action, outcome, resource, from, to, search } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 100);
    if (cursor && !Types.ObjectId.isValid(cursor)) { sendError(res, 'Invalid cursor', 400); return; }
    if (actorId && !Types.ObjectId.isValid(actorId)) { sendError(res, 'Invalid team member', 400); return; }

    const query: Record<string, unknown> = {};
    if (!isSuperAdmin(req.user)) {
      const brands = callerTenantIds(req.user);
      if (brands.length === 0) { sendSuccess(res, { data: [], pagination: { limit, hasMore: false, nextCursor: null } }); return; }
      const team = await User.find({ assignedTenants: { $in: brands }, role: { $in: ['brand-admin', 'manager', 'editor', 'viewer'] } })
        .select('_id').lean();
      const teamIds = team.map((member) => String(member._id));
      if (actorId && !teamIds.includes(actorId)) { sendSuccess(res, { data: [], pagination: { limit, hasMore: false, nextCursor: null } }); return; }
      query.actorId = { $in: team.map((member) => member._id) };
    }
    if (actorId) query.actorId = new Types.ObjectId(actorId);
    if (action === 'auth.*' || action === 'record.*') query.action = { $regex: action === 'auth.*' ? '^auth\\.' : '^record\\.' };
    else if (action) query.action = action;
    if (outcome === 'success' || outcome === 'failure') query.outcome = outcome;
    if (resource) query.resource = resource;
    const created: Record<string, Date> = {};
    if (from && !Number.isNaN(Date.parse(from))) created.$gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) created.$lte = new Date(to);
    if (Object.keys(created).length) query.createdAt = created;
    const safeSearch = searchRegexValue(search);
    if (safeSearch) query.$or = [{ actorEmail: { $regex: safeSearch, $options: 'i' } }, { actorName: { $regex: safeSearch, $options: 'i' } }, { path: { $regex: safeSearch, $options: 'i' } }];
    if (cursor) query._id = { $lt: new Types.ObjectId(cursor) };

    const rows = await AuditLog.find(query).sort({ _id: -1 }).limit(limit + 1).populate('tenantId', 'name slug').lean();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    sendSuccess(res, {
      data: page.map((row) => {
        const tenant = row.tenantId as unknown as { _id?: unknown; name?: string; slug?: string } | undefined;
        return {
          id: String(row._id),
          action: row.action,
          outcome: row.outcome,
          actor: { id: row.actorId ? String(row.actorId) : null, email: row.actorEmail, name: row.actorName || null, role: row.actorRole || null },
          method: row.method || null,
          path: row.path || null,
          resource: row.resource || null,
          resourceId: row.resourceId || null,
          brand: tenant && tenant._id ? { id: String(tenant._id), name: tenant.name, slug: tenant.slug } : null,
          statusCode: row.statusCode ?? null,
          ip: row.ip || null,
          userAgent: row.userAgent || null,
          createdAt: row.createdAt,
        };
      }),
      pagination: { limit, hasMore, nextCursor: hasMore && page.length ? String(page[page.length - 1]._id) : null },
    });
  } catch (error) {
    next(error);
  }
};
