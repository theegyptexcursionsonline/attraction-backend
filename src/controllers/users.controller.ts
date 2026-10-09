import { customerCursor, wishlistPipeline, wishlistProjection, activeSiteAttractions } from '../utils/customerLists';
import { Response, NextFunction } from 'express';
import { Types, type PipelineStage } from 'mongoose';
import { User } from '../models/User';
import { Booking } from '../models/Booking';
import { BundleOrder } from '../models/BundleOrder';
import { BundleDefinition } from '../models/BundleDefinition';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { generateRandomToken, hashToken } from '../utils/hash';
import {
  EmailTenant,
  invitationLink,
  sendAccessChangedEmail,
  sendPasswordChangedEmail,
  sendUserInvitation,
} from '../services/email.service';
import { searchRegexValue } from '../utils/helpers';
import {
  isSuperAdmin,
  callerTenantIds,
  sharesAnyTenant,
  canAssignRole,
  canManageRole,
} from '../utils/tenantScope';
import { revokeUserSessions } from '../utils/session';
import { accountSections } from '../middleware/section.middleware';
import { ADMIN_SECTIONS, SECTION_LABELS, normalizeSectionList } from '../utils/sectionAccess';
import { PUBLIC_USER_PROJECTION, redactUserSecrets } from '../utils/userProjection';
import { emailFromTravelerKey, travelerDetailKey } from '../utils/travelerKey';
import { publicAttractionOperators } from '../services/publicAttractionOperator.service';

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
       .populate({
        path:'wishlist',
        match: { status:'active',archivedAt:{$exists:false},trashedAt:{$exists:false},...(req.tenant?{tenantIds:req.tenant._id}:{}) },
        select:'slug title images priceFrom currency destination',
      })
      .lean();

    res.setHeader('Cache-Control','private, no-store');
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

    if (req.query.pagination === 'cursor') {
      if (!req.tenant) { sendError(res,'Select a site for your wishlist',400); return; }
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const base = wishlistPipeline(req.user._id,req.tenant._id,search);
      const limit = Number(req.query.limit || 20);
      const plan = customerCursor({owner:String(req.user._id),site:String(req.tenant._id),search:search || ''},req.query.cursor as string | undefined);
      const [rows,counts] = await Promise.all([
        User.aggregate([...base,{$set:plan.normalized},...(plan.seek?[{$match:plan.seek}]:[]),{$sort:plan.sort},{$limit:limit+1},{$project:{...wishlistProjection,tenantIds:1,ownerTenantId:1,_cursor0:1,_cursor1:1}}]),
        User.aggregate([...base,{$count:'total'}]),
      ]);
      const result=plan.page(rows,limit,counts[0]?.total || 0);
      // Resolve only owners of this already scoped page, excluding the lookahead row.
      const operators=await publicAttractionOperators(result.rows,req.tenant._id);
      const data=result.rows.map(({tenantIds:_tenantIds,ownerTenantId:_ownerTenantId,...row},index)=>({
        ...row,...(operators[index]?{operator:operators[index]}:{}),
      }));
      res.setHeader('Cache-Control','private, no-store');res.json({success:true,data,pagination:result.pagination});return;
    }
    const user = await User.findById(req.user._id)
      .populate({
        path: 'wishlist',
        match: { status: 'active', archivedAt: { $exists:false }, trashedAt: { $exists:false }, ...(req.tenant ? { tenantIds:req.tenant._id } : {}) },
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

    if (!Types.ObjectId.isValid(String(attractionId))) { sendError(res, 'Attraction not found',404); return; }
    // Verify attraction exists
    const attraction = await Attraction.findOne({ _id:attractionId, status:'active',archivedAt:{$exists:false},trashedAt:{$exists:false},...(req.tenant?{tenantIds:req.tenant._id}:{}) });
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

    if (!Types.ObjectId.isValid(String(attractionId))) { sendError(res,'Attraction not found',404); return; }
    if (req.tenant) {
      const allowed = await Attraction.exists({_id:attractionId,tenantIds:req.tenant._id});
      if (!allowed) { sendError(res,'Attraction not found',404); return; }
    }
    await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { wishlist: attractionId } }
    );

    sendSuccess(res, null, 'Removed from wishlist');
  } catch (error) {
    next(error);
  }
};

/** Bounded atomic removal of the displayed saved page, never another site's list. */
export const removeWishlistPage = async (req: AuthRequest,res:Response,next:NextFunction):Promise<void> => {
 try {
  if(!req.user){sendError(res,'Not authenticated',401);return;}
  if(!req.tenant){sendError(res,'Select a site for your wishlist',400);return;}
  const ids=(req.body.ids as string[]).map(id=>new Types.ObjectId(id));
  const allowed=await Attraction.find({...activeSiteAttractions(req.tenant._id),_id:{$in:ids}}).select('_id').limit(100).lean();
  if(allowed.length!==new Set(ids.map(String)).size){sendError(res,'Saved page could not be confirmed',409);return;}
  const updated=await User.findOneAndUpdate({_id:req.user._id,wishlist:{$all:ids}},{$pull:{wishlist:{$in:ids}}});
  if(!updated){sendError(res,'Saved page changed. Refresh and try again.',409);return;}
  sendSuccess(res,null,'Saved page removed');
 } catch(error){next(error);}
};

/**
 * A team member's brands as the caller may see them: a non-super admin sees only the brands they
 * work for themselves. A member shared with another brand would otherwise name that brand to
 * every brand they work for. Saving the member keeps the brands left out here (see updateUser).
 */
const withCallerBrandsOnly = <T extends object>(req: AuthRequest, user: T): T => {
  const tenants = (user as { assignedTenants?: unknown }).assignedTenants;
  if (isSuperAdmin(req.user) || !Array.isArray(tenants)) return user;
  const mine = new Set(callerTenantIds(req.user));
  return {
    ...user,
    assignedTenants: tenants.filter((tenant) => mine.has(String((tenant as { _id?: unknown })?._id ?? tenant))),
  };
};

/**
 * Why the caller may not give these sections, or null. Super admins may give any section; anyone
 * else only sections they can use themselves, so a brand admin cannot hand out a section their
 * own brand has switched off.
 */
const sectionGrantProblem = async (req: AuthRequest, sections: unknown, alreadyHas: readonly string[] = []): Promise<string | null> => {
  if (sections === undefined || isSuperAdmin(req.user)) return null;
  const own = req.user ? await accountSections(req.user) : [];
  const wanted = sections === null ? [...ADMIN_SECTIONS] : normalizeSectionList(sections as unknown[]);
  if (sections === null && own.length < ADMIN_SECTIONS.length) return 'Only a super admin can give access to every section';
  // Sections the member already had may stay; only new ones must be the caller's own.
  return wanted.every((section) => own.includes(section) || alreadyHas.includes(section))
    ? null : 'You can only give access to sections you can use yourself';
};

// Admin User Management
export const getUsers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page = 1, limit = 20, role, status, search, tenantId } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const query: Record<string, unknown> = {};
    const scopedAdmin = Boolean(req.user && req.user.role !== 'super-admin');

    const requestedTenantId = typeof tenantId === 'string' ? tenantId.trim() : '';

    if (requestedTenantId) {
      if (!Types.ObjectId.isValid(requestedTenantId)) {
        sendError(res, 'Invalid tenantId', 400);
        return;
      }

      if (scopedAdmin && req.user && !callerTenantIds(req.user).includes(requestedTenantId)) {
        sendError(res, 'Access denied to this tenant', 403);
        return;
      }

      query.assignedTenants = new Types.ObjectId(requestedTenantId);
      // An explicit request is constrained to exactly one assigned site.
    } else if (scopedAdmin && req.user) {
      // Without an explicit site, non-super-admins can only see users who share
      // at least one of their assigned tenants.
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

    const safeSearch = searchRegexValue(search);
    if (safeSearch) {
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

    // When each pending invitation stops working. Read separately so the reset expiry of a
    // member who has joined (an outstanding password reset) is never exposed.
    const pendingIds = users.filter((user) => user.status === 'pending').map((user) => user._id);
    const inviteExpiry = new Map<string, Date | undefined>();
    if (pendingIds.length) {
      const invites = await User.find({ _id: { $in: pendingIds }, status: 'pending' })
        .select('+passwordResetExpires')
        .lean();
      for (const invite of invites) inviteExpiry.set(String(invite._id), invite.passwordResetExpires);
    }

    const safeUsers = users.map((user) => {
      const row = redactUserSecrets(withCallerBrandsOnly(req, user) as unknown as Record<string, unknown>);
      if (!inviteExpiry.has(String(user._id))) return row;
      const expiresAt = inviteExpiry.get(String(user._id));
      return { ...row, invitationExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null };
    });
    sendPaginated(res, safeUsers, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
};

type TravelerRow = {
  _id: string;
  bookingCount: number;
  lastActivityAt?: Date;
  firstSeenAt?: Date;
  brands: unknown[];
  spending: Array<{ currency: string; total: number }>;
  guest?: { firstName?: string; lastName?: string; phone?: string; country?: string };
  latest?: {
    _id: unknown;
    reference: string;
    tenantId: unknown;
    status: string;
    total: number;
    currency: string;
    createdAt: Date;
    items?: Array<{ date?: string; time?: string }>;
  };
  account?: {
    _id: unknown;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    phone?: string;
    country?: string;
    status?: string;
    role?: string;
    createdAt?: Date;
    lastLogin?: Date;
  };
};

const TRAVELER_STATUSES = ['active', 'inactive', 'pending', 'suspended'];

/** The caller's brand ids as ObjectIds, or null for a super admin (every brand). */
const travelerScope = (req: AuthRequest): Types.ObjectId[] | null =>
  isSuperAdmin(req.user)
    ? null
    : callerTenantIds(req.user).filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));

/**
 * Bundle orders the caller may see as a traveller's purchases: sold on one of their brands
 * (storefront), never test checkouts. A supplier brand does not see the bundle buyer here, as on
 * Bundle Operations.
 */
const bundleOrderTravelerMatch = (scope: Types.ObjectId[] | null): Record<string, unknown> => ({
  checkoutMode: { $ne: 'test' },
  ...(scope ? { storefrontTenantId: { $in: scope } } : {}),
});

/**
 * Bookings and bundle orders grouped into one row per traveller email: count, spend per currency,
 * brands, the latest purchase and the latest contact details given at checkout. Bundle child
 * bookings belong to their master order (counted once, as the bundle order) and are left out.
 */
const travelerBookingStages = (bookingMatch: Record<string, unknown>, scope: Types.ObjectId[] | null): PipelineStage[] => [
  { $match: { bundleOrderId: { $exists: false }, 'guestDetails.email': { $type: 'string', $ne: '' }, ...bookingMatch } },
  {
    $unionWith: {
      coll: BundleOrder.collection.name,
      pipeline: [
        { $match: { ...bundleOrderTravelerMatch(scope), 'guestDetails.email': { $type: 'string', $ne: '' } } },
        {
          $project: {
            reference: 1, status: 1, currency: 1, createdAt: 1, guestDetails: 1,
            tenantId: '$storefrontTenantId',
            total: { $divide: ['$totalMinor', 100] },
            items: { $map: { input: { $slice: ['$components', 1] }, as: 'component', in: { date: '$$component.date', time: '$$component.time' } } },
          },
        },
      ],
    },
  },
  { $sort: { createdAt: -1 } },
  {
    $group: {
      _id: { email: { $toLower: '$guestDetails.email' }, currency: '$currency' },
      count: { $sum: 1 },
      total: { $sum: '$total' },
      lastAt: { $max: '$createdAt' },
      firstAt: { $min: '$createdAt' },
      brands: { $addToSet: '$tenantId' },
      latest: { $first: { createdAt: '$createdAt', _id: '$_id', reference: '$reference', tenantId: '$tenantId', status: '$status', total: '$total', currency: '$currency', items: { $slice: ['$items', 1] }, guest: '$guestDetails' } },
    },
  },
  {
    $group: {
      _id: '$_id.email',
      bookingCount: { $sum: '$count' },
      spending: { $push: { currency: '$_id.currency', total: '$total' } },
      lastActivityAt: { $max: '$lastAt' },
      firstSeenAt: { $min: '$firstAt' },
      brandSets: { $push: '$brands' },
      // Embedded documents compare field by field, so the newest `createdAt` wins.
      latest: { $max: '$latest' },
    },
  },
  {
    $project: {
      bookingCount: 1, spending: 1, lastActivityAt: 1, firstSeenAt: 1,
      brands: { $reduce: { input: '$brandSets', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } },
      latest: 1,
      guest: '$latest.guest',
    },
  },
];

/**
 * Traveller directory for the admin.
 *
 * A traveller is anyone who booked (by the email given at checkout, account or not) and, for a
 * super admin, also every registered customer account even before a first booking. Most
 * customers check out as guests, so listing only accounts (the earlier behaviour) left the
 * page empty for most of the network. Brand admins and managers see only travellers with a
 * booking on one of their brands, and only those bookings count towards the row.
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
    const offset = cursor && /^\d{1,6}$/.test(cursor) ? Number(cursor) : 0;
    if (cursor && !/^\d{1,6}$/.test(cursor)) {
      sendError(res, 'Invalid traveler cursor', 400);
      return;
    }
    const search = req.query.search ? String(req.query.search).trim() : '';
    const status = req.query.status ? String(req.query.status) : undefined;
    const tenantFilter = typeof req.query.tenantId === 'string' && req.query.tenantId.trim() ? req.query.tenantId.trim() : undefined;

    let scope = travelerScope(req);
    if (scope && scope.length === 0) {
      sendSuccess(res, { data: [], pagination: { limit, nextCursor: null, hasMore: false } });
      return;
    }
    if (tenantFilter) {
      if (!Types.ObjectId.isValid(tenantFilter) || (scope && !scope.some((id) => String(id) === tenantFilter))) {
        sendError(res, 'Access denied to this tenant', 403);
        return;
      }
      scope = [new Types.ObjectId(tenantFilter)];
    }

    const bookingMatch: Record<string, unknown> = scope ? { tenantId: { $in: scope } } : {};
    const pipeline: PipelineStage[] = [...travelerBookingStages(bookingMatch, scope)];

    // A super admin looking at the whole network also sees registered customers who have not
    // booked yet.
    if (!scope) {
      pipeline.push(
        {
          $unionWith: {
            coll: User.collection.name,
            pipeline: [
              { $match: { role: { $in: ['customer', 'guest'] } } },
              { $project: { _id: { $toLower: '$email' }, bookingCount: { $literal: 0 }, spending: { $literal: [] }, brands: { $literal: [] }, lastActivityAt: '$createdAt', firstSeenAt: '$createdAt' } },
            ],
          },
        },
        {
          $group: {
            _id: '$_id',
            bookingCount: { $sum: '$bookingCount' },
            spending: { $push: '$spending' },
            brands: { $push: '$brands' },
            lastActivityAt: { $max: '$lastActivityAt' },
            firstSeenAt: { $min: '$firstSeenAt' },
            latest: { $max: '$latest' },
            guest: { $max: '$guest' },
          },
        },
        {
          $project: {
            bookingCount: 1, lastActivityAt: 1, firstSeenAt: 1, latest: 1, guest: 1,
            spending: { $reduce: { input: '$spending', initialValue: [], in: { $concatArrays: ['$$value', '$$this'] } } },
            brands: { $reduce: { input: '$brands', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } },
          },
        }
      );
    }

    pipeline.push(
      { $lookup: { from: User.collection.name, localField: '_id', foreignField: 'email', as: 'account' } },
      { $set: { account: { $first: { $filter: { input: '$account', cond: { $in: ['$$this.role', ['customer', 'guest']] } } } } } }
    );

    const safeSearch = searchRegexValue(search);
    if (safeSearch) {
      pipeline.push({
        $match: {
          $or: [
            { _id: { $regex: safeSearch, $options: 'i' } },
            { 'guest.firstName': { $regex: safeSearch, $options: 'i' } },
            { 'guest.lastName': { $regex: safeSearch, $options: 'i' } },
            { 'account.firstName': { $regex: safeSearch, $options: 'i' } },
            { 'account.lastName': { $regex: safeSearch, $options: 'i' } },
            { 'guest.phone': { $regex: safeSearch, $options: 'i' } },
          ],
        },
      });
    }
    if (status === 'guest') pipeline.push({ $match: { account: { $exists: false } } });
    else if (status && TRAVELER_STATUSES.includes(status)) pipeline.push({ $match: { 'account.status': status } });

    pipeline.push(
      { $sort: { lastActivityAt: -1, _id: 1 } },
      { $skip: offset },
      { $limit: limit + 1 },
      {
        $project: {
          bookingCount: 1, spending: 1, lastActivityAt: 1, firstSeenAt: 1, brands: 1, guest: 1,
          latest: { _id: 1, reference: 1, tenantId: 1, status: 1, total: 1, currency: 1, createdAt: 1, items: 1 },
          account: { _id: 1, firstName: 1, lastName: 1, avatar: 1, phone: 1, country: 1, status: 1, role: 1, createdAt: 1, lastLogin: 1 },
        },
      }
    );

    const rows = await Booking.aggregate<TravelerRow>(pipeline).allowDiskUse(true);
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const brandIds = Array.from(new Set(pageRows.flatMap((row) => (row.brands || []).map(String))));
    const brands = brandIds.length
      ? await Tenant.find({ _id: { $in: brandIds } }).select('name slug').lean()
      : [];
    const brandById = new Map(brands.map((brand) => [String(brand._id), brand]));
    const brandRef = (id: unknown) => {
      const brand = brandById.get(String(id));
      return brand ? { id: String(brand._id), name: brand.name, slug: brand.slug } : null;
    };

    const travelers = pageRows.map((row) => {
      const latest = row.latest;
      const account = row.account;
      const spending = new Map<string, number>();
      for (const item of row.spending || []) {
        if (item?.currency) spending.set(item.currency, (spending.get(item.currency) || 0) + (item.total || 0));
      }
      return {
        id: account ? String(account._id) : `guest:${row._id}`,
        accountId: account ? String(account._id) : null,
        hasAccount: Boolean(account),
        email: row._id,
        // Opens the details without the email in the URL (see utils/travelerKey).
        detailKey: travelerDetailKey(row._id),
        firstName: account?.firstName || row.guest?.firstName || '',
        lastName: account?.lastName || row.guest?.lastName || '',
        avatar: account?.avatar,
        phone: row.guest?.phone || account?.phone,
        country: row.guest?.country || account?.country,
        status: account?.status || 'guest',
        createdAt: account?.createdAt || row.firstSeenAt,
        lastActiveAt: account?.lastLogin || row.lastActivityAt,
        bookingCount: row.bookingCount || 0,
        spendingByCurrency: Array.from(spending, ([currency, total]) => ({ currency, total })),
        brands: (row.brands || []).map(brandRef).filter((brand): brand is NonNullable<typeof brand> => Boolean(brand)),
        latestBooking: latest ? {
          id: String(latest._id),
          reference: latest.reference,
          status: latest.status,
          total: latest.total,
          currency: latest.currency,
          createdAt: latest.createdAt,
          travelDate: latest.items?.[0]?.date,
          travelTime: latest.items?.[0]?.time,
          brand: brandRef(latest.tenantId),
        } : null,
      };
    });

    sendSuccess(res, {
      data: travelers,
      pagination: { limit, hasMore, nextCursor: hasMore ? String(offset + limit) : null },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * One traveller's full record: contact details (account and the details given at each checkout),
 * and every booking with its brand, product, dates, guests, special requests and package
 * traveller details. Same brand scope as the directory: a brand admin sees only their brands'
 * bookings, and a traveller with none of them is not found.
 */
export const getTravelerDetail = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // The admin sends the opaque key from the directory; `email` stays accepted for screens
    // loaded before the key existed.
    const fromKey = req.query.key !== undefined ? emailFromTravelerKey(req.query.key) : undefined;
    if (fromKey === null) {
      sendError(res, 'Traveler not found', 404);
      return;
    }
    const email = String(fromKey ?? req.query.email ?? '').trim().toLowerCase();
    if (!email || email.length > 254) {
      sendError(res, 'Traveler email is required', 400);
      return;
    }
    const scope = travelerScope(req);
    if (scope && scope.length === 0) {
      sendError(res, 'Traveler not found', 404);
      return;
    }
    const [account, bookings, bundleOrders] = await Promise.all([
      User.findOne({ email, role: { $in: ['customer', 'guest'] } })
        .select('firstName lastName email avatar phone country status createdAt lastLogin language currency')
        .lean(),
      Booking.find({ 'guestDetails.email': email, ...(scope ? { tenantId: { $in: scope } } : {}) })
        .select('reference tenantId attractionId status paymentStatus total currency createdAt items guestDetails packageBooking.travellerDetails packageBooking.arrivalDetails')
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      BundleOrder.find({ 'guestDetails.email': email, ...bundleOrderTravelerMatch(scope) })
        .select('reference storefrontTenantId bundleDefinitionId status paymentStatus totalMinor currency createdAt components guestDetails')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    ]);
    if (bookings.length === 0 && bundleOrders.length === 0 && (scope || !account)) {
      sendError(res, 'Traveler not found', 404);
      return;
    }

    const tenantIds = Array.from(new Set([
      ...bookings.map((booking) => String(booking.tenantId)),
      ...bundleOrders.map((order) => String(order.storefrontTenantId)),
    ]));
    const definitionIds = Array.from(new Set(bundleOrders.map((order) => String(order.bundleDefinitionId))));
    const attractionIds = Array.from(new Set(bookings.map((booking) => String(booking.attractionId)).filter((id) => Types.ObjectId.isValid(id))));
    const [tenants, attractions, definitions] = await Promise.all([
      tenantIds.length ? Tenant.find({ _id: { $in: tenantIds } }).select('name slug').lean() : [],
      attractionIds.length ? Attraction.find({ _id: { $in: attractionIds } }).select('title slug listingType').lean() : [],
      definitionIds.length ? BundleDefinition.find({ _id: { $in: definitionIds } }).select('title slug').lean() : [],
    ]);
    const definitionById = new Map(definitions.map((definition) => [String(definition._id), definition]));
    const tenantById = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));
    const attractionById = new Map(attractions.map((attraction) => [String(attraction._id), attraction]));

    // Every distinct contact the traveller gave at checkout, newest first.
    const contacts = new Map<string, { firstName: string; lastName: string; phone?: string; country?: string; lastUsedAt: Date }>();
    const purchasesNewestFirst = [...bookings, ...bundleOrders]
      .sort((a, b) => new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime());
    for (const booking of purchasesNewestFirst) {
      const guest = booking.guestDetails as { firstName?: string; lastName?: string; phone?: string; country?: string } | undefined;
      if (!guest) continue;
      const key = [guest.firstName, guest.lastName, guest.phone, guest.country].map((part) => String(part || '').trim().toLowerCase()).join('|');
      if (!contacts.has(key)) contacts.set(key, { firstName: guest.firstName || '', lastName: guest.lastName || '', phone: guest.phone, country: guest.country, lastUsedAt: booking.createdAt as Date });
    }

    sendSuccess(res, {
      email,
      account: account ? {
        id: String(account._id),
        firstName: account.firstName,
        lastName: account.lastName,
        avatar: account.avatar,
        phone: account.phone,
        country: account.country,
        status: account.status,
        language: account.language,
        currency: account.currency,
        createdAt: account.createdAt,
        lastLogin: account.lastLogin,
      } : null,
      contacts: Array.from(contacts.values()),
      bookings: [...bookings.map((booking) => {
        const tenant = tenantById.get(String(booking.tenantId));
        const attraction = attractionById.get(String(booking.attractionId));
        const guest = booking.guestDetails as { specialRequests?: string } | undefined;
        const packageBooking = (booking as { packageBooking?: { travellerDetails?: unknown; arrivalDetails?: unknown } }).packageBooking;
        return {
          id: String(booking._id),
          reference: booking.reference,
          status: booking.status,
          paymentStatus: (booking as { paymentStatus?: string }).paymentStatus,
          total: booking.total,
          currency: booking.currency,
          createdAt: booking.createdAt,
          brand: tenant ? { id: String(tenant._id), name: tenant.name, slug: tenant.slug } : null,
          product: attraction ? { id: String(attraction._id), title: attraction.title, slug: attraction.slug, listingType: (attraction as { listingType?: string }).listingType || 'tour' } : null,
          travelDate: booking.items?.[0]?.date,
          travelTime: booking.items?.[0]?.time,
          guests: (booking.items || []).reduce((sum, item) => ({
            adults: sum.adults + (item.quantities?.adults || 0),
            children: sum.children + (item.quantities?.children || 0),
            infants: sum.infants + (item.quantities?.infants || 0),
          }), { adults: 0, children: 0, infants: 0 }),
          optionName: booking.items?.[0]?.optionName,
          specialRequests: guest?.specialRequests || null,
          travellerDetails: Array.isArray(packageBooking?.travellerDetails) ? packageBooking.travellerDetails : [],
          arrivalDetails: packageBooking?.arrivalDetails || null,
          kind: 'booking' as const,
        };
      }), ...bundleOrders.map((order) => {
        const tenant = tenantById.get(String(order.storefrontTenantId));
        const definition = definitionById.get(String(order.bundleDefinitionId));
        const components = order.components || [];
        const first = components[0];
        return {
          id: String(order._id),
          reference: order.reference,
          status: order.status,
          paymentStatus: order.paymentStatus,
          total: (order.totalMinor || 0) / 100,
          currency: order.currency,
          createdAt: order.createdAt,
          brand: tenant ? { id: String(tenant._id), name: tenant.name, slug: tenant.slug } : null,
          product: definition ? { id: String(definition._id), title: definition.title, slug: definition.slug, listingType: 'bundle' } : null,
          travelDate: first?.date,
          travelTime: first?.time,
          // Every component carries the whole party; the largest is the party size.
          guests: components.reduce((party, component) => ({
            adults: Math.max(party.adults, component.quantities?.adults || 0),
            children: Math.max(party.children, component.quantities?.children || 0),
            infants: Math.max(party.infants, component.quantities?.infants || 0),
          }), { adults: 0, children: 0, infants: 0 }),
          optionName: components.map((component) => component.attractionTitle).filter(Boolean).join(' + ') || undefined,
          specialRequests: order.guestDetails?.specialRequests || null,
          travellerDetails: [],
          arrivalDetails: null,
          kind: 'bundle' as const,
        };
      })].sort((a, b) => new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime()),
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

    sendSuccess(res, redactUserSecrets(withCallerBrandsOnly(req, user) as unknown as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
};

const USER_EMAIL_TENANT_FIELDS =
  'name slug customDomain domainMigrated theme logo contactInfo defaultLanguage defaultCurrency timezone';

/**
 * The site whose brand an account email to this user should wear: the acting admin's current
 * site when the user belongs to it, else the user's own first site. Reading `assignedTenants[0]`
 * alone dressed the mail in whichever site happened to sort first.
 */
const userEmailTenant = async (
  req: AuthRequest,
  assigned: Array<{ toString(): string }> | null | undefined
): Promise<EmailTenant | null> => {
  // Ids or populated brands: String() of a populated brand is its whole document, not its id.
  const ids = (assigned || []).map((tenant) => String((tenant as { _id?: unknown })?._id ?? tenant));
  const activeTenantId = req.tenant?._id ? String(req.tenant._id) : null;
  const chosen = activeTenantId && ids.includes(activeTenantId) ? activeTenantId : ids[0];
  if (!chosen) return null;
  const tenant = await Tenant.findById(chosen).select(USER_EMAIL_TENANT_FIELDS).lean();
  return (tenant as unknown as EmailTenant) || null;
};

export const inviteUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, firstName, lastName, role, assignedTenants, sectionAccess } = req.body;

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

    const inviteSectionProblem = await sectionGrantProblem(req, sectionAccess);
    if (inviteSectionProblem) {
      sendError(res, inviteSectionProblem, 403);
      return;
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
      ...(Array.isArray(sectionAccess) ? { sectionAccess: normalizeSectionList(sectionAccess) } : {}),
      passwordResetToken: hashToken(invitationToken),
      passwordResetExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    // Resolve the invited user's site so the invite link + email are branded for THAT site
    // (custom domain / ?tenant=) not the generic platform.
    const inviteTenant = await userEmailTenant(req, Array.isArray(assignedTenants) ? assignedTenants : []);

    // Isolated: the pending user and its 7-day token are already saved, so a provider outage
    // must not 500 the admin and leave an account nobody was told about. The invite link stays
    // recoverable from Users -> Invitation link.
    let invitationEmailed = true;
    try {
      await sendUserInvitation(
        user.email,
        invitationToken,
        req.user ? `${req.user.firstName} ${req.user.lastName}`.trim() : 'Attractions Network',
        role,
        inviteTenant
      );
    } catch (error) {
      invitationEmailed = false;
      console.error('[email] invitation send failed', {
        tenant: inviteTenant?.slug || 'platform',
        userId: String(user._id),
        error: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
      });
    }

    sendSuccess(
      res,
      user,
      invitationEmailed
        ? 'User invited successfully'
        : 'User created, but the invitation email could not be sent. Copy the invitation link to share it.',
      201
    );
  } catch (error) {
    next(error);
  }
};

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A fresh accept-invitation link for a user who has not joined yet, for sharing directly
 * (for example when the invitee's mailbox is not receiving mail). No email is sent. The new
 * token replaces the previous one, so earlier invitation links stop working.
 */
export const createInvitationLink = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const target = await User.findById(req.params.id).select('+passwordResetToken +passwordResetExpires');
    if (!target) {
      sendError(res, 'User not found', 404);
      return;
    }

    if (!isSuperAdmin(req.user)) {
      const mine = callerTenantIds(req.user);
      const theirs = (target.assignedTenants || []).map((t) => String(t));
      if (!sharesAnyTenant(mine, theirs)) {
        sendError(res, 'User not found', 404);
        return;
      }
      if (!canManageRole(req.user?.role, target.role)) {
        sendError(res, 'You are not allowed to manage this user', 403);
        return;
      }
    }

    if (target.status !== 'pending') {
      sendError(res, 'This user has already joined, so there is no invitation to share', 409);
      return;
    }

    // Brand the link for the site the caller shares with the invitee (else their first site).
    const mine = isSuperAdmin(req.user) ? [] : callerTenantIds(req.user);
    const tenantIds = (target.assignedTenants || []).map((t) => String(t));
    const siteId = tenantIds.find((t) => mine.includes(t)) ?? tenantIds[0];
    const site = siteId
      ? await Tenant.findById(siteId)
        .select('name slug customDomain domainMigrated theme logo contactInfo defaultLanguage defaultCurrency timezone')
        .lean()
      : null;

    const token = generateRandomToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    target.passwordResetToken = hashToken(token);
    target.passwordResetExpires = expiresAt;
    await target.save();

    console.info('[users] invitation link issued', {
      userId: String(target._id),
      byUserId: req.user ? String(req.user._id) : null,
      tenantId: siteId ?? null,
    });
    // The link is a sign-up credential: never cache it.
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, { inviteUrl: invitationLink(token, site), expiresAt: expiresAt.toISOString() }, 'Invitation link created');
  } catch (error) {
    next(error);
  }
};

/** Team roles a super admin may set a password for. Super admins and travellers are excluded. */
const PASSWORD_SETTABLE_ROLES = new Set(['brand-admin', 'manager', 'editor', 'viewer']);

/**
 * Super admin sets a site team member's password directly (for example when their mailbox cannot
 * receive the invitation or reset email). A pending member becomes active. Every existing session
 * of that member is signed out and any outstanding invitation or reset link stops working.
 */
export const setUserPassword = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isSuperAdmin(req.user)) {
      sendError(res, 'Only a super admin can set passwords', 403);
      return;
    }
    if (String(req.user?._id) === req.params.id) {
      sendError(res, 'Use Change password for your own account', 400);
      return;
    }

    const target = await User.findById(req.params.id).select('+passwordResetToken +passwordResetExpires');
    if (!target) {
      sendError(res, 'User not found', 404);
      return;
    }
    if (!PASSWORD_SETTABLE_ROLES.has(target.role)) {
      sendError(res, 'Passwords can only be set for site team members', 403);
      return;
    }
    if (target.status === 'suspended' || target.status === 'inactive') {
      sendError(res, 'Activate this user before setting a password', 409);
      return;
    }

    const activated = target.status === 'pending';
    target.password = req.body.password;
    target.passwordResetToken = undefined;
    target.passwordResetExpires = undefined;
    if (activated) target.status = 'active';
    revokeUserSessions(target);
    await target.save();

    console.info('[users] password set by super admin', {
      userId: String(target._id),
      byUserId: String(req.user?._id),
      activated,
    });

    // The account holder is told an administrator changed their password. Detached and guarded:
    // the password is already set, so a mail failure must not report the change as failed.
    void userEmailTenant(req, target.assignedTenants)
      .then((tenant) =>
        sendPasswordChangedEmail(
          target.email,
          { userName: `${target.firstName} ${target.lastName}`.trim(), byAdmin: true },
          tenant
        )
      )
      .catch((error) => console.error('[email] password-changed notice failed', { error: error?.message }));
    sendSuccess(res, { id: String(target._id), status: target.status, activated }, activated ? 'Password set and account activated' : 'Password set');
  } catch (error) {
    next(error);
  }
};

const TEAM_ROLES = ['super-admin', 'brand-admin', 'manager', 'editor', 'viewer'];
const ACTIVE_SUPER_ADMIN = { role: 'super-admin', status: 'active' };
const LAST_SUPER_ADMIN = 'Keep at least one active super admin: make someone else a super admin first.';

/** Whether this change leaves `target`, an active super admin now, no longer one. */
const endsActiveSuperAdmin = (target: { role?: string; status?: string }, role: unknown, status: unknown): boolean =>
  target.role === 'super-admin' && target.status === 'active' &&
  ((role !== undefined && role !== 'super-admin') || (status !== undefined && status !== 'active'));

const otherActiveSuperAdmins = (id: unknown) => User.countDocuments({ ...ACTIVE_SUPER_ADMIN, _id: { $ne: id } });

/** Section names for the access email; null when the member can use every section. */
const accessSectionNames = async (user: { role?: string; sectionAccess?: unknown; assignedTenants?: unknown[] }): Promise<string[] | null> => {
  const sections = await accountSections(user);
  return sections.length === ADMIN_SECTIONS.length ? null : sections.map((section) => SECTION_LABELS[section]);
};

export const updateUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { firstName, lastName, role, status, assignedTenants, sectionAccess } = req.body;

    // Load the target first so we can enforce tenant scope + role ceiling BEFORE
    // applying any change. Previously this blindly $set role/assignedTenants from the
    // body with no checks, so a brand-admin could PATCH any id (incl. their own) to
    // super-admin, or reassign any user to any tenant — full privilege escalation.
    const target = await User.findById(id);
    if (!target) {
      sendError(res, 'User not found', 404);
      return;
    }

    // The member's brands after this save; undefined when the request does not change them.
    let tenantsAfter: string[] | undefined = assignedTenants === undefined
      ? undefined
      : (Array.isArray(assignedTenants) ? assignedTenants : []).map(String);

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
      // May only add tenants the caller manages, and changes only those memberships: the member's
      // other brands are kept as they are. The admin screen shows (and sends back) only the
      // caller's brands, so a save must never drop the rest — nor refuse them when an older
      // screen sends them back unchanged.
      if (tenantsAfter !== undefined) {
        const requested = tenantsAfter;
        if (!requested.every((t) => mine.includes(t) || theirs.includes(t))) {
          sendError(res, 'You can only assign your own tenants', 403);
          return;
        }
        tenantsAfter = [...new Set([
          ...theirs.filter((t) => !mine.includes(t)),
          ...requested.filter((t) => mine.includes(t)),
        ])];
      }
    }

    // The platform always keeps one active super admin. Demoting or deactivating the last one,
    // themselves included, would sign them out with nobody left who can restore the account.
    const endsSuperAdmin = endsActiveSuperAdmin(target, role, status);
    if (endsSuperAdmin && (await otherActiveSuperAdmins(target._id)) === 0) {
      sendError(res, LAST_SUPER_ADMIN, 409);
      return;
    }

    // Only a real change is checked: re-saving a member's existing access (with a name edit, say)
    // must not need the right to give it.
    const currentSections = Array.isArray(target.sectionAccess) ? normalizeSectionList(target.sectionAccess) : null;
    const requestedSections = sectionAccess === null ? null : Array.isArray(sectionAccess) ? normalizeSectionList(sectionAccess) : undefined;
    const sectionsChanged = requestedSections !== undefined && JSON.stringify(requestedSections) !== JSON.stringify(currentSections);
    const updateSectionProblem = sectionsChanged ? await sectionGrantProblem(req, sectionAccess, currentSections ?? []) : null;
    if (updateSectionProblem) {
      sendError(res, updateSectionProblem, 403);
      return;
    }

    const securityContextChanged =
      (role !== undefined && role !== target.role) ||
      (status !== undefined && status !== target.status) ||
      (tenantsAfter !== undefined &&
        JSON.stringify((target.assignedTenants || []).map(String).sort()) !==
          JSON.stringify([...tenantsAfter].sort()));

    if (firstName !== undefined) target.firstName = firstName;
    if (lastName !== undefined) target.lastName = lastName;
    if (role !== undefined) target.role = role;
    if (status !== undefined) target.status = status;
    // Mongoose casts the ids (and rejects a malformed one) exactly as it did for the raw body.
    if (tenantsAfter !== undefined) target.assignedTenants = tenantsAfter as unknown as Types.ObjectId[];
    if (sectionsChanged) target.sectionAccess = requestedSections ?? undefined;
    if (securityContextChanged) revokeUserSessions(target);
    await target.save();

    // Two super admins removing each other at the same moment both pass the check above; whoever
    // finds none left afterwards puts their target back.
    if (endsSuperAdmin && (await User.countDocuments(ACTIVE_SUPER_ADMIN)) === 0) {
      await User.updateOne({ _id: target._id }, { $set: ACTIVE_SUPER_ADMIN });
      sendError(res, LAST_SUPER_ADMIN, 409);
      return;
    }
    await target.populate('assignedTenants', 'name slug');

    // A change to what the person can do (role, status, sites or sections) is a security fact
    // they are entitled to know, and the email says whether it signed them out (role, status and
    // site changes do; sections apply at once without one). A pure name edit does not qualify.
    if (securityContextChanged || sectionsChanged) {
      const siteNames = (target.assignedTenants as unknown as Array<{ name?: string }> | undefined || [])
        .map((site) => site?.name)
        .filter((name): name is string => !!name);
      void Promise.all([userEmailTenant(req, target.assignedTenants), accessSectionNames(target)])
        .then(([tenant, sectionNames]) =>
          sendAccessChangedEmail(
            target.email,
            {
              userName: `${target.firstName} ${target.lastName}`.trim(),
              role: target.role,
              status: target.status,
              siteNames,
              changedBy: req.user ? `${req.user.firstName} ${req.user.lastName}`.trim() : 'An administrator',
              sectionNames,
              signedOut: securityContextChanged,
            },
            tenant
          )
        )
        .catch((error) => console.error('[email] access-changed notice failed', { error: error?.message }));
    }

    sendSuccess(res, withCallerBrandsOnly(req, target.toJSON()), 'User updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Signs a team member out everywhere: their current sessions and refresh tokens stop working at
 * once. For a lost device or a suspected compromise. Same scope rules as editing the member.
 */
export const revokeUserSessionsById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const target = await User.findById(req.params.id);
    if (!target || !['super-admin', 'brand-admin', 'manager', 'editor', 'viewer'].includes(target.role)) {
      sendError(res, 'User not found', 404);
      return;
    }
    if (!isSuperAdmin(req.user)) {
      if (!sharesAnyTenant(callerTenantIds(req.user), (target.assignedTenants || []).map(String))) {
        sendError(res, 'User not found', 404);
        return;
      }
      if (String(target._id) !== String(req.user?._id) && !canManageRole(req.user?.role, target.role)) {
        sendError(res, 'You are not allowed to manage this user', 403);
        return;
      }
    }
    revokeUserSessions(target);
    await target.save();
    sendSuccess(res, { id: String(target._id) }, 'All sessions signed out');
  } catch (error) {
    next(error);
  }
};

/**
 * Withdraws an invitation nobody has accepted yet. A super admin removes the account; a brand admin
 * removes only their own brands from it, so an invitee shared with another brand stays invited
 * there (and that brand is never named). Someone who has signed in is a member, not an
 * invitation: they are deactivated instead, which keeps their history.
 */
export const withdrawInvitation = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const target = Types.ObjectId.isValid(String(id)) ? await User.findById(id) : null;
    if (!target || !TEAM_ROLES.includes(target.role)) {
      sendError(res, 'User not found', 404);
      return;
    }

    const theirs = (target.assignedTenants || []).map(String);
    const mine = isSuperAdmin(req.user) ? null : callerTenantIds(req.user);
    if (mine) {
      if (!sharesAnyTenant(mine, theirs)) {
        sendError(res, 'User not found', 404);
        return;
      }
      if (!canManageRole(req.user?.role, target.role)) {
        sendError(res, 'You are not allowed to manage this user', 403);
        return;
      }
    }

    if (target.status !== 'pending' || target.lastLogin) {
      sendError(res, 'This person has already joined. Deactivate them instead.', 409);
      return;
    }

    // Written only while the invitation is still unaccepted, even if it is accepted right now.
    const unaccepted = { _id: target._id, status: 'pending', lastLogin: null };
    const changed = 'This invitation has just changed. Refresh and try again.';
    const othersKeep = mine ? theirs.filter((tenant) => !mine.includes(tenant)) : [];
    if (mine && othersKeep.length > 0) {
      const updated = await User.findOneAndUpdate(
        unaccepted,
        { $pull: { assignedTenants: { $in: mine.map((tenant) => new Types.ObjectId(tenant)) } } },
        { new: true }
      );
      if (!updated) {
        sendError(res, changed, 409);
        return;
      }
      // Normally their other brands keep the invitation; if those went meanwhile, nothing does.
      if ((updated.assignedTenants || []).length > 0) {
        console.info('[users] invitation withdrawn', { userId: String(target._id), byUserId: String(req.user?._id), accountRemoved: false });
        sendSuccess(res, { id: String(target._id), accountRemoved: false }, 'Invitation withdrawn for your sites');
        return;
      }
    }

    const removed = await User.findOneAndDelete(unaccepted);
    if (!removed) {
      sendError(res, changed, 409);
      return;
    }
    console.info('[users] invitation withdrawn', { userId: String(target._id), byUserId: String(req.user?._id), accountRemoved: true });
    sendSuccess(res, { id: String(target._id), accountRemoved: true }, 'Invitation withdrawn');
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

    const user = Types.ObjectId.isValid(String(id)) ? await User.findById(id) : null;
    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }
    // Defensive: the caller is an active super admin, so this holds unless data changed under us.
    if (user.role === 'super-admin' && user.status === 'active' && (await otherActiveSuperAdmins(user._id)) === 0) {
      sendError(res, LAST_SUPER_ADMIN, 409);
      return;
    }
    await User.deleteOne({ _id: user._id });

    sendSuccess(res, null, 'User deleted successfully');
  } catch (error) {
    next(error);
  }
};
