import { Response, NextFunction } from 'express';
import type { PipelineStage } from 'mongoose';
import { User } from '../models/User';
import { Booking } from '../models/Booking';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { generateRandomToken, hashToken } from '../utils/hash';
import { sendUserInvitation } from '../services/email.service';
import { escapeRegex } from '../utils/helpers';
import {
  isSuperAdmin,
  callerTenantIds,
  sharesAnyTenant,
  canAssignRole,
  canManageRole,
} from '../utils/tenantScope';
import { revokeUserSessions } from '../utils/session';
import { PUBLIC_USER_PROJECTION, redactUserSecrets } from '../utils/userProjection';

// User Profile Endpoints
export const getProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const user = await User.findById(req.user._id)
      .select(PUBLIC_USER_PROJECTION)
      .populate('wishlist', 'slug title images priceFrom currency destination')
      .lean();

    sendSuccess(
      res,
      user ? redactUserSecrets(user as unknown as Record<string, unknown>) : user
    );
  } catch (error) {
    next(error);
  }
};

export const getWishlist = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const user = await User.findById(req.user._id)
      .populate({
        path: 'wishlist',
        match: { status: 'active' },
        select: 'slug title images priceFrom currency destination rating reviewCount badges',
      })
      .lean();

    sendSuccess(res, user?.wishlist || []);
  } catch (error) {
    next(error);
  }
};

export const addToWishlist = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { attractionId } = req.params;

    // Verify attraction exists
    const attraction = await Attraction.findById(attractionId);
    if (!attraction) {
      sendError(res, 'Attraction not found', 404);
      return;
    }

    // Add to wishlist if not already there
    await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { wishlist: attractionId } }
    );

    sendSuccess(res, null, 'Added to wishlist');
  } catch (error) {
    next(error);
  }
};

export const removeFromWishlist = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { attractionId } = req.params;

    await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { wishlist: attractionId } }
    );

    sendSuccess(res, null, 'Removed from wishlist');
  } catch (error) {
    next(error);
  }
};

// Admin User Management
export const getUsers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page = 1, limit = 20, role, status, search } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const query: Record<string, unknown> = {};
    const scopedAdmin = Boolean(req.user && req.user.role !== 'super-admin');

    // Non-super-admins can only see users who share at least one of their assigned tenants
    if (scopedAdmin && req.user) {
      const userTenantIds = req.user.assignedTenants || [];
      if (userTenantIds.length > 0) {
        query.assignedTenants = { $in: userTenantIds };
      } else {
        // No assigned tenants — return empty
        sendPaginated(res, [], pageNum, limitNum, 0);
        return;
      }
    }

    const teamRoles = ['super-admin', 'brand-admin', 'manager', 'editor', 'viewer'];

    if (role) {
      if (!teamRoles.includes(String(role))) {
        sendPaginated(res, [], pageNum, limitNum, 0);
        return;
      }
      if (scopedAdmin && role === 'super-admin') {
        sendPaginated(res, [], pageNum, limitNum, 0);
        return;
      }
      query.role = role;
    } else if (scopedAdmin) {
      // Platform super-admin identities are not tenant team members and should not
      // be disclosed to delegated tenant operators even if legacy seed data happens
      // to associate them with a tenant.
      query.role = { $in: teamRoles.filter((teamRole) => teamRole !== 'super-admin') };
    } else {
      // The Team endpoint is deliberately staff-only. Customer and guest identities
      // are exposed through the tenant-scoped Travelers endpoint below.
      query.role = { $in: teamRoles };
    }

    if (status) {
      query.status = status;
    }

    if (search) {
      const safeSearch = escapeRegex(search as string);
      query.$or = [
        { email: { $regex: safeSearch, $options: 'i' } },
        { firstName: { $regex: safeSearch, $options: 'i' } },
        { lastName: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select(PUBLIC_USER_PROJECTION)
        .populate('assignedTenants', 'name slug')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query),
    ]);

    const safeUsers = users.map((user) =>
      redactUserSecrets(user as unknown as Record<string, unknown>)
    );
    sendPaginated(res, safeUsers, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
};

type TravelerRollup = {
  _id: unknown;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  phone?: string;
  country?: string;
  status: string;
  createdAt: Date;
  lastLogin?: Date;
  bookingRollup?: Array<{
    summary?: Array<{ count: number }>;
    brands?: Array<{ _id: unknown }>;
    spending?: Array<{ _id: string; total: number }>;
    latest?: Array<{
      _id: unknown;
      reference: string;
      tenantId: unknown;
      status: string;
      total: number;
      currency: string;
      createdAt: Date;
      items?: Array<{ date?: string; time?: string }>;
    }>;
  }>;
};

/**
 * Tenant-safe traveler directory for admin users.
 *
 * A traveler is a registered customer/guest identity. Booking relationships are
 * matched by userId and normalized guest email because checkout can precede account
 * creation. Non-super-admins only see travelers with a booking in one of their
 * assigned tenants; the booking lookup is scoped before any PII is returned.
 */
export const getTravelers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const requestedLimit = Number.parseInt(String(req.query.limit ?? '25'), 10);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 25, 1), 50);
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    const search = req.query.search ? String(req.query.search).trim() : '';
    const status = req.query.status ? String(req.query.status) : undefined;

    const mongoose = await import('mongoose');
    if (cursor && !mongoose.Types.ObjectId.isValid(cursor)) {
      sendError(res, 'Invalid traveler cursor', 400);
      return;
    }

    const scopedTenantIds = isSuperAdmin(req.user)
      ? null
      : callerTenantIds(req.user).filter(mongoose.Types.ObjectId.isValid).map((id) => new mongoose.Types.ObjectId(id));

    if (scopedTenantIds && scopedTenantIds.length === 0) {
      sendSuccess(res, { data: [], pagination: { limit, nextCursor: null, hasMore: false } });
      return;
    }

    const userMatch: Record<string, unknown> = {
      role: { $in: ['customer', 'guest'] },
    };
    if (cursor) userMatch._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    if (status) userMatch.status = status;
    if (search) {
      const safeSearch = escapeRegex(search);
      userMatch.$or = [
        { email: { $regex: safeSearch, $options: 'i' } },
        { firstName: { $regex: safeSearch, $options: 'i' } },
        { lastName: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const bookingExpressions: Record<string, unknown>[] = [
      {
        $or: [
          { $eq: ['$userId', '$$travelerId'] },
          { $eq: [{ $toLower: '$guestDetails.email' }, '$$travelerEmail'] },
        ],
      },
    ];
    if (scopedTenantIds) bookingExpressions.unshift({ $in: ['$tenantId', scopedTenantIds] });

    const pipeline: PipelineStage[] = [
      { $match: userMatch },
      {
        $lookup: {
          from: Booking.collection.name,
          let: { travelerId: '$_id', travelerEmail: { $toLower: '$email' } },
          pipeline: [
            { $match: { $expr: { $and: bookingExpressions } } },
            {
              $facet: {
                summary: [{ $count: 'count' }],
                brands: [{ $group: { _id: '$tenantId' } }],
                spending: [{ $group: { _id: '$currency', total: { $sum: '$total' } } }],
                latest: [
                  { $sort: { createdAt: -1 } },
                  { $limit: 1 },
                  { $project: { reference: 1, tenantId: 1, status: 1, total: 1, currency: 1, createdAt: 1, items: { $slice: ['$items', 1] } } },
                ],
              },
            },
          ],
          as: 'bookingRollup',
        },
      },
    ];

    if (scopedTenantIds) {
      pipeline.push({ $match: { 'bookingRollup.0.summary.0.count': { $gt: 0 } } });
    }
    pipeline.push(
      { $sort: { _id: -1 } },
      { $limit: limit + 1 },
      {
        $project: {
          email: 1,
          firstName: 1,
          lastName: 1,
          avatar: 1,
          phone: 1,
          country: 1,
          status: 1,
          createdAt: 1,
          lastLogin: 1,
          bookingRollup: 1,
        },
      }
    );

    const rows = await User.aggregate<TravelerRollup>(pipeline);
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const brandIds = Array.from(new Set(pageRows.flatMap((row) =>
      (row.bookingRollup?.[0]?.brands || []).map((brand) => String(brand._id))
    )));
    const brands = brandIds.length
      ? await Tenant.find({ _id: { $in: brandIds } }).select('name slug').lean()
      : [];
    const brandById = new Map(brands.map((brand) => [String(brand._id), brand]));

    const travelers = pageRows.map((row) => {
      const rollup = row.bookingRollup?.[0];
      const latest = rollup?.latest?.[0];
      const travelerBrands = (rollup?.brands || [])
        .map((brand) => brandById.get(String(brand._id)))
        .filter(Boolean)
        .map((brand) => ({ id: String(brand!._id), name: brand!.name, slug: brand!.slug }));
      const latestBrand = latest ? brandById.get(String(latest.tenantId)) : undefined;

      return {
        id: String(row._id),
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        avatar: row.avatar,
        phone: row.phone,
        country: row.country,
        status: row.status,
        createdAt: row.createdAt,
        lastActiveAt: row.lastLogin,
        bookingCount: rollup?.summary?.[0]?.count || 0,
        spendingByCurrency: (rollup?.spending || []).map((item) => ({ currency: item._id, total: item.total })),
        brands: travelerBrands,
        latestBooking: latest ? {
          id: String(latest._id),
          reference: latest.reference,
          status: latest.status,
          total: latest.total,
          currency: latest.currency,
          createdAt: latest.createdAt,
          travelDate: latest.items?.[0]?.date,
          travelTime: latest.items?.[0]?.time,
          brand: latestBrand ? { id: String(latestBrand._id), name: latestBrand.name, slug: latestBrand.slug } : null,
        } : null,
      };
    });

    sendSuccess(res, {
      data: travelers,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore && pageRows.length ? String(pageRows[pageRows.length - 1]._id) : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select(PUBLIC_USER_PROJECTION)
      .populate('assignedTenants', 'name slug')
      .lean();

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    // Tenant scope: a non-super admin may only read a user who shares at least one
    // of their assigned tenants — otherwise it's a cross-tenant PII read. 404 (not
    // 403) so ids can't be enumerated.
    if (req.user && !isSuperAdmin(req.user)) {
      if (user.role === 'super-admin') {
        sendError(res, 'User not found', 404);
        return;
      }
      const mine = callerTenantIds(req.user);
      const theirs = (user.assignedTenants || []).map((t) =>
        String((t as { _id?: unknown })?._id ?? t)
      );
      if (!sharesAnyTenant(mine, theirs)) {
        sendError(res, 'User not found', 404);
        return;
      }
    }

    sendSuccess(res, redactUserSecrets(user as unknown as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
};

export const inviteUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, firstName, lastName, role, assignedTenants } = req.body;

    // Role ceiling: a non-super admin (e.g. brand-admin) must not be able to mint a
    // super-admin or another brand-admin — that would be a privilege-escalation path.
    if (!canAssignRole(req.user?.role, role)) {
      sendError(res, 'You are not allowed to assign that role', 403);
      return;
    }

    // Tenant ownership: a non-super admin may only invite users into tenants they
    // themselves manage, and must scope the invite to at least one tenant.
    if (!isSuperAdmin(req.user)) {
      const mine = callerTenantIds(req.user);
      const requested = (Array.isArray(assignedTenants) ? assignedTenants : []).map(String);
      if (!requested.length || !requested.every((t) => mine.includes(t))) {
        sendError(res, 'You can only invite users to your own tenants', 403);
        return;
      }
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      sendError(res, 'User with this email already exists', 409);
      return;
    }

    // Generate secure temporary password and dedicated invitation token
    const tempPassword = generateRandomToken(24);
    const invitationToken = generateRandomToken();

    // Create user with pending status
    const user = await User.create({
      email: email.toLowerCase(),
      password: tempPassword,
      firstName,
      lastName,
      role,
      status: 'pending',
      assignedTenants,
      passwordResetToken: hashToken(invitationToken),
      passwordResetExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    // Resolve the invited user's primary site so the invite link + email are
    // branded for THAT site (custom domain / ?tenant=) not the generic platform.
    let inviteTenant = null;
    if (Array.isArray(assignedTenants) && assignedTenants.length > 0) {
      inviteTenant = await Tenant.findById(assignedTenants[0])
        .select('name slug customDomain domainMigrated theme logo contactInfo defaultLanguage defaultCurrency timezone')
        .lean();
    }

    // Send invitation email
    await sendUserInvitation(
      user.email,
      invitationToken,
      req.user ? `${req.user.firstName} ${req.user.lastName}`.trim() : 'Attractions Network',
      role,
      inviteTenant
    );

    sendSuccess(res, user, 'User invited successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { firstName, lastName, role, status, assignedTenants } = req.body;

    // Load the target first so we can enforce tenant scope + role ceiling BEFORE
    // applying any change. Previously this blindly $set role/assignedTenants from the
    // body with no checks, so a brand-admin could PATCH any id (incl. their own) to
    // super-admin, or reassign any user to any tenant — full privilege escalation.
    const target = await User.findById(id);
    if (!target) {
      sendError(res, 'User not found', 404);
      return;
    }

    if (!isSuperAdmin(req.user)) {
      const mine = callerTenantIds(req.user);
      const theirs = (target.assignedTenants || []).map((t) => String(t));

      // Must share a tenant with the target (else it's a cross-tenant user) — 404.
      if (!sharesAnyTenant(mine, theirs)) {
        sendError(res, 'User not found', 404);
        return;
      }
      // Cannot manage a peer or a higher-privileged user (e.g. edit a super-admin).
      if (!canManageRole(req.user?.role, target.role)) {
        sendError(res, 'You are not allowed to manage this user', 403);
        return;
      }
      // Cannot grant a role above the caller's ceiling.
      if (role !== undefined && !canAssignRole(req.user?.role, role)) {
        sendError(res, 'You are not allowed to assign that role', 403);
        return;
      }
      // Cannot change one's own role (prevents self-escalation).
      if (
        role !== undefined &&
        role !== target.role &&
        String(target._id) === String(req.user?._id)
      ) {
        sendError(res, 'You cannot change your own role', 403);
        return;
      }
      // May only (re)assign tenants the caller manages.
      if (assignedTenants !== undefined) {
        const requested = (Array.isArray(assignedTenants) ? assignedTenants : []).map(String);
        if (!requested.every((t) => mine.includes(t))) {
          sendError(res, 'You can only assign your own tenants', 403);
          return;
        }
      }
    }

    const securityContextChanged =
      (role !== undefined && role !== target.role) ||
      (status !== undefined && status !== target.status) ||
      (assignedTenants !== undefined &&
        JSON.stringify((target.assignedTenants || []).map(String).sort()) !==
          JSON.stringify((assignedTenants || []).map(String).sort()));

    if (firstName !== undefined) target.firstName = firstName;
    if (lastName !== undefined) target.lastName = lastName;
    if (role !== undefined) target.role = role;
    if (status !== undefined) target.status = status;
    if (assignedTenants !== undefined) target.assignedTenants = assignedTenants;
    if (securityContextChanged) revokeUserSessions(target);
    await target.save();
    await target.populate('assignedTenants', 'name slug');

    sendSuccess(res, target, 'User updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Don't allow deleting yourself
    if (req.user?._id.toString() === id) {
      sendError(res, 'Cannot delete your own account', 400);
      return;
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    sendSuccess(res, null, 'User deleted successfully');
  } catch (error) {
    next(error);
  }
};
