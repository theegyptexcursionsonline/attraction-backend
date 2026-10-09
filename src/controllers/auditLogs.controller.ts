import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog';
import { User } from '../models/User';
import { AuthRequest } from '../types';
import { sendError, sendSuccess } from '../utils/response';
import { searchRegexValue } from '../utils/helpers';
import { callerTenantIds, isSuperAdmin } from '../utils/tenantScope';

const TEAM_ROLES = ['brand-admin', 'manager', 'editor', 'viewer'];

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

/**
 * The user log. A super admin reads every entry. A brand admin reads what happened on their own
 * brands and their own team's sign-ins (never a super admin's), which covers their own actions.
 */
export const listAuditLogs = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { cursor, actorId, action, outcome, resource, from, to, search } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 100);
    if (cursor && !Types.ObjectId.isValid(cursor)) { sendError(res, 'Invalid cursor', 400); return; }
    if (actorId && !Types.ObjectId.isValid(actorId)) { sendError(res, 'Invalid team member', 400); return; }

    const query: Record<string, unknown> = {};
    const superAdmin = isSuperAdmin(req.user);
    const callerBrands = new Set(superAdmin ? [] : callerTenantIds(req.user));
    if (!superAdmin) {
      if (callerBrands.size === 0) { sendSuccess(res, { data: [], pagination: { limit, hasMore: false, nextCursor: null } }); return; }
      query.$and = [await brandAdminVisibility([...callerBrands])];
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
        const populated = row.tenantId as unknown as { _id?: unknown; name?: string; slug?: string } | undefined;
        // A team sign-in can carry the brand that was open at the time; a brand admin sees only
        // their own brands named.
        const tenant = populated && (superAdmin || callerBrands.has(String(populated._id))) ? populated : undefined;
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
