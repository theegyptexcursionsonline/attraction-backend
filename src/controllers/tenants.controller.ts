import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Tenant } from '../models/Tenant';
import { Attraction } from '../models/Attraction';
import { Booking } from '../models/Booking';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { escapeRegex } from '../utils/helpers';
import { sanitizeCustomPages } from '../utils/sanitizeHtml';
import { DomainClaim } from '../models/DomainClaim';
import {
  NetlifyDomainError,
  NetlifyDomainReadiness,
  netlifyDomainService,
} from '../services/netlifyDomain.service';
import {
  CustomDomainValidationError,
  aliasesForCustomDomain,
  normalizeCustomDomain,
} from '../utils/customDomain';

const PUBLIC_TENANT_FIELDS = [
  '_id',
  'slug',
  'name',
  'domain',
  'customDomain',
  'logo',
  'logoDark',
  'favicon',
  'heroImages',
  'tagline',
  'description',
  'theme',
  'fonts',
  'designMode',
  'defaultCurrency',
  'defaultLanguage',
  'supportedLanguages',
  'timezone',
  'status',
  'seoSettings',
  'contactInfo',
  'socialLinks',
  'aiSettings',
  'navigation',
  'pricingSettings',
  'flatUrls',
  'customPages',
] as const;

export const PUBLIC_TENANT_PROJECTION = [
  ...PUBLIC_TENANT_FIELDS,
  'paymentSettings.stripe.enabled',
  'paymentSettings.stripe.publishableKey',
].join(' ');

export const toPublicTenantDto = (source: unknown): Record<string, unknown> => {
  if (!source || typeof source !== 'object') return {};
  const record = source as Record<string, unknown>;
  const dto = Object.fromEntries(
    PUBLIC_TENANT_FIELDS
      .filter((field) => record[field] !== undefined)
      .map((field) => [field, record[field]])
  ) as Record<string, unknown>;

  if (dto.customPages !== undefined) {
    dto.customPages = sanitizeCustomPages(dto.customPages);
  }

  const paymentSettings = record.paymentSettings;
  if (paymentSettings && typeof paymentSettings === 'object') {
    const stripe = (paymentSettings as Record<string, unknown>).stripe;
    if (stripe && typeof stripe === 'object') {
      const stripeRecord = stripe as Record<string, unknown>;
      const publicStripe: Record<string, unknown> = {};
      if (typeof stripeRecord.enabled === 'boolean') publicStripe.enabled = stripeRecord.enabled;
      if (typeof stripeRecord.publishableKey === 'string') {
        publicStripe.publishableKey = stripeRecord.publishableKey;
      }
      if (Object.keys(publicStripe).length > 0) {
        dto.paymentSettings = { stripe: publicStripe };
      }
    }
  }

  return dto;
};

export const getTenants = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const query: Record<string, unknown> = {};

    // Non-super-admins can only see their assigned tenants
    if (req.user?.role !== 'super-admin') {
      query._id = { $in: req.user?.assignedTenants ?? [] };
    }

    if (status) {
      query.status = status;
    }

    if (search) {
      const safeSearch = escapeRegex(search as string);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { slug: { $regex: safeSearch, $options: 'i' } },
        { domain: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const [tenants, total] = await Promise.all([
      Tenant.find(query)
        .sort({ name: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Tenant.countDocuments(query),
    ]);

    sendPaginated(res, tenants, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
};

// Admin-safe network directory used only for configuring marketplace access.
// It deliberately exposes the minimum brand identity and paginates through the
// database so Brand Admins can reach every active reseller without gaining
// access to another tenant's private settings.
export const getMarketplaceBrands = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pageNum = Number(req.query.page || 1);
    const limitNum = Number(req.query.limit || 100);
    const query = { status: 'active' };
    const [brands, total] = await Promise.all([
      Tenant.find(query).select('_id name slug logo status').sort({ name: 1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
      Tenant.countDocuments(query),
    ]);
    sendPaginated(res, brands.map((brand) => ({ id: brand._id, name: brand.name, slug: brand.slug, logo: brand.logo, status: brand.status })), pageNum, limitNum, total);
  } catch (error) { next(error); }
};

export const getTenantById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const tenant = await Tenant.findById(id).lean();

    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    // Get stats
    const [attractionCount, bookingStats, revenueAgg] = await Promise.all([
      Attraction.countDocuments({ tenantIds: tenant._id, status: 'active' }),
      Booking.countDocuments({ tenantId: tenant._id }),
      Booking.aggregate([
        { $match: { tenantId: tenant._id } },
        {
          $group: {
            _id: null,
            // Booked = confirmed/completed commitments (includes pay-later).
            // Collected = payments actually cleared (paymentStatus succeeded).
            bookedRevenue: { $sum: { $cond: [{ $in: ['$status', ['confirmed', 'completed']] }, '$total', 0] } },
            collectedRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'succeeded'] }, '$total', 0] } },
          },
        },
      ]),
    ]);

    const rev = revenueAgg[0] || { bookedRevenue: 0, collectedRevenue: 0 };
    sendSuccess(res, {
      ...tenant,
      stats: {
        totalAttractions: attractionCount,
        totalBookings: bookingStats,
        totalRevenue: rev.bookedRevenue,
        bookedRevenue: rev.bookedRevenue,
        collectedRevenue: rev.collectedRevenue,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Public endpoint – returns all active + coming_soon tenants (no auth required).
 * Used by the frontend LayoutWrapper for tenant resolution.
 */
export const getPublicTenants = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenants = await Tenant.find({ status: { $in: ['active', 'coming_soon'] } })
      .select(PUBLIC_TENANT_PROJECTION)
      .sort({ name: 1 })
      .lean();

    sendSuccess(res, tenants.map(toPublicTenantDto));
  } catch (error) {
    next(error);
  }
};

/**
 * Public endpoint – returns a single tenant by ID (no auth required).
 * Uses the same storefront-safe contract as the public tenant list.
 */
export const getPublicTenantById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const tenant = await Tenant.findById(id)
      .select(PUBLIC_TENANT_PROJECTION)
      .lean();

    if (!tenant || !['active', 'coming_soon'].includes(tenant.status)) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    sendSuccess(res, toPublicTenantDto(tenant));
  } catch (error) {
    next(error);
  }
};

export const getTenantBySlug = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { slug } = req.params;

    const tenant = await Tenant.findOne({ slug, status: { $in: ['active', 'coming_soon'] } })
      .select(PUBLIC_TENANT_PROJECTION)
      .lean();

    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    sendSuccess(res, toPublicTenantDto(tenant));
  } catch (error) {
    next(error);
  }
};

/**
 * Public edge-resolution endpoint. It intentionally returns only the minimum
 * tenant identity needed by Next.js middleware, never the full tenant record.
 */
export const getTenantByCustomDomain = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let domain: string;
    try {
      domain = normalizeCustomDomain(req.params.hostname);
    } catch {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    const tenant = await Tenant.findOne({
      customDomain: domain,
      status: { $in: ['active', 'coming_soon'] },
    })
      .select('_id slug name customDomain status')
      .lean();

    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    sendSuccess(res, {
      id: tenant._id,
      slug: tenant.slug,
      name: tenant.name,
      customDomain: tenant.customDomain,
    });
  } catch (error) {
    next(error);
  }
};

type DomainTenantSnapshot = {
  _id: unknown;
  customDomain?: string;
  customDomainStatus?: 'unconfigured' | 'pending_dns' | 'ready' | 'error';
  customDomainAliasesAddedAt?: Date;
  customDomainLastCheckedAt?: Date;
  customDomainLastError?: string;
  domainMigrated?: boolean;
};

const domainStatusDto = (
  tenant: DomainTenantSnapshot,
  readiness?: NetlifyDomainReadiness
) => {
  const inferredStatus = tenant.customDomainStatus || (
    tenant.domainMigrated ? 'ready' : tenant.customDomain ? 'pending_dns' : 'unconfigured'
  );
  const domain = tenant.customDomain || null;

  return {
    domain,
    aliases: domain ? aliasesForCustomDomain(domain) : [],
    status: readiness
      ? readiness.certificateReady && readiness.aliasesAttached
        ? 'ready'
        : 'pending_dns'
      : inferredStatus,
    migrated: Boolean(tenant.domainMigrated),
    aliasesAttached: readiness?.aliasesAttached ?? Boolean(tenant.customDomainAliasesAddedAt),
    certificateReady: readiness?.certificateReady ?? Boolean(tenant.domainMigrated),
    certificateState: readiness?.certificateState || (tenant.domainMigrated ? 'issued' : 'unknown'),
    providerConfigured: netlifyDomainService.isConfigured(),
    dnsTargets: netlifyDomainService.getDnsTargets(),
    lastCheckedAt: tenant.customDomainLastCheckedAt || null,
    lastError: tenant.customDomainLastError || null,
  };
};

const sendNetlifyError = (res: Response, error: NetlifyDomainError): void => {
  const statusByCode: Record<string, number> = {
    NETLIFY_NOT_CONFIGURED: 503,
    NETLIFY_ALIAS_LIMIT: 409,
    NETLIFY_PRIMARY_DOMAIN: 409,
    NETLIFY_TIMEOUT: 504,
    NETLIFY_UNAVAILABLE: 503,
    NETLIFY_REQUEST_FAILED: 502,
  };
  sendError(res, error.message, statusByCode[error.code] || 502);
};

export const getCustomDomainStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenant = await Tenant.findById(req.params.id).lean();
    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }
    sendSuccess(res, domainStatusDto(tenant));
  } catch (error) {
    next(error);
  }
};

export const configureCustomDomain = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let domain: string;
  try {
    domain = normalizeCustomDomain(req.body.domain);
  } catch (error) {
    const message = error instanceof CustomDomainValidationError
      ? error.message
      : 'Enter a valid public domain';
    sendError(res, message, 400);
    return;
  }

  let claimCreated = false;
  let aliasesAdded: string[] = [];
  try {
    if (!netlifyDomainService.isConfigured()) {
      throw new NetlifyDomainError(
        'NETLIFY_NOT_CONFIGURED',
        'Custom-domain automation is not configured on the server'
      );
    }

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }
    if (tenant.customDomain && tenant.customDomain !== domain) {
      sendError(res, 'Remove the current custom domain before assigning a different one', 409);
      return;
    }

    const conflict = await Tenant.findOne({
      _id: { $ne: tenant._id },
      $or: [{ customDomain: domain }, { domain }],
    }).select('_id');
    if (conflict) {
      sendError(res, 'This domain is already assigned to another tenant', 409);
      return;
    }

    try {
      await DomainClaim.create({
        _id: domain,
        tenantId: tenant._id,
        createdBy: req.user?._id,
      });
      claimCreated = true;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const claim = await DomainClaim.findById(domain).lean();
      if (!claim || String(claim.tenantId) !== String(tenant._id)) {
        sendError(res, 'This domain is already being configured for another tenant', 409);
        return;
      }
    }

    const readiness = await netlifyDomainService.addDomain(domain);
    aliasesAdded = readiness.aliasesAdded;
    const now = new Date();
    const ready = readiness.aliasesAttached && readiness.certificateReady;
    const updated = await Tenant.findOneAndUpdate(
      {
        _id: tenant._id,
        $or: [
          { customDomain: { $exists: false } },
          { customDomain: null },
          { customDomain: '' },
          { customDomain: domain },
        ],
      },
      {
        $set: {
          customDomain: domain,
          customDomainStatus: ready ? 'ready' : 'pending_dns',
          domainMigrated: ready,
          customDomainAliasesAddedAt: now,
          customDomainLastCheckedAt: now,
          customDomainLastChangedBy: req.user?._id,
        },
        $unset: { customDomainLastError: 1 },
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      throw new Error('Tenant domain changed while configuration was in progress');
    }

    sendSuccess(
      res,
      domainStatusDto(updated, readiness),
      ready
        ? 'Custom domain connected and active'
        : 'Domain added to Netlify. Update DNS, then verify the connection.'
    );
  } catch (error) {
    if (aliasesAdded.length > 0) {
      await netlifyDomainService.rollbackAliases(aliasesAdded).catch(() => undefined);
    }
    if (claimCreated) {
      await DomainClaim.deleteOne({ _id: domain }).catch(() => undefined);
    }
    if (error instanceof NetlifyDomainError) {
      sendNetlifyError(res, error);
      return;
    }
    next(error);
  }
};

export const verifyCustomDomain = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }
    if (!tenant.customDomain) {
      sendError(res, 'No custom domain is configured for this tenant', 400);
      return;
    }

    const readiness = await netlifyDomainService.getReadiness(tenant.customDomain);
    const ready = readiness.aliasesAttached && readiness.certificateReady;
    const updated = await Tenant.findOneAndUpdate(
      { _id: tenant._id, customDomain: tenant.customDomain },
      {
        $set: {
          customDomainStatus: ready ? 'ready' : 'pending_dns',
          domainMigrated: ready,
          customDomainLastCheckedAt: new Date(),
          customDomainLastChangedBy: req.user?._id,
        },
        $unset: { customDomainLastError: 1 },
      },
      { new: true }
    );
    if (!updated) {
      sendError(res, 'Tenant domain changed while verification was in progress', 409);
      return;
    }

    sendSuccess(
      res,
      domainStatusDto(updated, readiness),
      ready ? 'Custom domain is active' : 'DNS or TLS is not ready yet'
    );
  } catch (error) {
    if (error instanceof NetlifyDomainError) {
      sendNetlifyError(res, error);
      return;
    }
    next(error);
  }
};

export const removeCustomDomain = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }
    if (!tenant.customDomain) {
      sendSuccess(res, domainStatusDto(tenant), 'No custom domain was configured');
      return;
    }

    const domain = tenant.customDomain;
    await netlifyDomainService.removeDomain(domain);
    const updated = await Tenant.findOneAndUpdate(
      { _id: tenant._id, customDomain: domain },
      {
        $set: {
          customDomainStatus: 'unconfigured',
          domainMigrated: false,
          customDomainLastCheckedAt: new Date(),
          customDomainLastChangedBy: req.user?._id,
        },
        $unset: {
          customDomain: 1,
          customDomainAliasesAddedAt: 1,
          customDomainLastError: 1,
        },
      },
      { new: true }
    );
    if (!updated) {
      await netlifyDomainService.addDomain(domain).catch(() => undefined);
      sendError(res, 'Tenant domain changed while removal was in progress', 409);
      return;
    }

    await DomainClaim.deleteOne({ _id: domain, tenantId: tenant._id });
    sendSuccess(res, domainStatusDto(updated), 'Custom domain removed');
  } catch (error) {
    if (error instanceof NetlifyDomainError) {
      sendNetlifyError(res, error);
      return;
    }
    next(error);
  }
};

export const createTenant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenant = await Tenant.create({
      ...req.body,
      ...(req.body.customPages !== undefined
        ? { customPages: sanitizeCustomPages(req.body.customPages) }
        : {}),
    });
    sendSuccess(res, tenant, 'Tenant created successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const updateTenant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const updates = {
      ...req.body,
      ...(req.body.customPages !== undefined
        ? { customPages: sanitizeCustomPages(req.body.customPages) }
        : {}),
    };

    const tenant = await Tenant.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    sendSuccess(res, tenant, 'Tenant updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deleteTenant = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const tenant = await Tenant.findByIdAndUpdate(
      id,
      { status: 'inactive' },
      { new: true }
    );

    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    sendSuccess(res, null, 'Tenant deactivated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Brand-admin safe endpoint – only allows updating a restricted set of fields.
 * Full tenant update (name, status, slug, domain, etc.) stays super-admin only.
 */
export const updateTenantSettings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Allow-list of fields brand-admins may change on their own sites
    const allowedFields = [
      'contactInfo',
      'socialLinks',
      // NOTE: paymentSettings is intentionally NOT here — the Stripe keys live in an
      // encrypted subdoc and are managed only via PUT /payments/gateway/:tenantId, so
      // a wholesale settings write can't overwrite/wipe or expose them.
      'seoSettings',
      'aiSettings',
      'theme',
      'fonts',
      'designMode',
      'tagline',
      'description',
      'logo',
      'logoDark',
      'favicon',
      'heroImages',
      'defaultCurrency',
      'defaultLanguage',
      'supportedLanguages',
      'timezone',
      'pricingSettings',
      'navigation', // custom nav menu links per tenant
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      sendError(res, 'No valid fields to update', 400);
      return;
    }

    const tenant = await Tenant.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    sendSuccess(res, tenant, 'Site settings updated successfully');
  } catch (error) {
    next(error);
  }
};

// Portfolio-wide totals for the admin Sites list page. Super-admin sees the
// full network; brand-admin sees only the sites they're assigned to.
//
// We aggregate live from the bookings collection because the legacy
// `Tenant.stats` field was only ever populated on mock data and is
// `undefined` on every real tenant — which is why the Sites list tiles
// were showing 0 bookings / $0 revenue despite ~110 real bookings.
export const getPortfolioStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const adminRoles = ['super-admin', 'brand-admin', 'manager'];
    if (!req.user || !adminRoles.includes(req.user.role)) {
      sendError(res, 'Forbidden', 403);
      return;
    }

    const match: Record<string, unknown> = {};
    if (req.user.role !== 'super-admin') {
      const assigned = (req.user.assignedTenants || []) as Types.ObjectId[];
      if (assigned.length === 0) {
        sendSuccess(res, {
          totalBookings: 0,
          totalRevenue: 0,
          bookedRevenue: 0,
          collectedRevenue: 0,
        });
        return;
      }
      match.tenantId = { $in: assigned };
    }

    const agg = await Booking.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          // Booked revenue = anything that's a real, non-cancelled commitment.
          // We treat 'confirmed' and 'completed' as locked-in bookings (this
          // includes pay-later, where the booking is sealed even though the
          // money hasn't cleared yet).
          bookedRevenue: {
            $sum: {
              $cond: [{ $in: ['$status', ['confirmed', 'completed']] }, '$total', 0],
            },
          },
          // Collected = money that actually cleared.
          collectedRevenue: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'succeeded'] }, '$total', 0] },
          },
        },
      },
    ]);

    const row = agg[0] || { totalBookings: 0, bookedRevenue: 0, collectedRevenue: 0 };
    sendSuccess(res, {
      totalBookings: row.totalBookings,
      // Default totalRevenue to bookedRevenue so the Sites list tile reflects
      // what the operator intuitively thinks of as revenue (every confirmed
      // pay-later booking still counts).
      totalRevenue: row.bookedRevenue,
      bookedRevenue: row.bookedRevenue,
      collectedRevenue: row.collectedRevenue,
    });
  } catch (error) {
    next(error);
  }
};

// Dashboard stats for tenant
export const getTenantStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { period = '30d' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [
      totalAttractions,
      totalBookings,
      confirmedBookings,
      revenue,
      dailyBookings,
    ] = await Promise.all([
      Attraction.countDocuments({ tenantIds: id, status: 'active' }),
      Booking.countDocuments({ tenantId: id, createdAt: { $gte: startDate } }),
      Booking.countDocuments({
        tenantId: id,
        status: 'confirmed',
        createdAt: { $gte: startDate },
      }),
      Booking.aggregate([
        {
          $match: {
            tenantId: new Types.ObjectId(id as string),
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: null,
            // Booked = confirmed/completed commitments (includes pay-later, which
            // never reaches paymentStatus 'succeeded'). Collected = money cleared.
            bookedRevenue: { $sum: { $cond: [{ $in: ['$status', ['confirmed', 'completed']] }, '$total', 0] } },
            collectedRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'succeeded'] }, '$total', 0] } },
          },
        },
      ]),
      Booking.aggregate([
        {
          $match: {
            tenantId: new Types.ObjectId(id as string),
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            bookings: { $sum: 1 },
            // Daily revenue tracks booked revenue so the chart matches the headline.
            revenue: { $sum: { $cond: [{ $in: ['$status', ['confirmed', 'completed']] }, '$total', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    sendSuccess(res, {
      overview: {
        totalAttractions,
        totalBookings,
        confirmedBookings,
        totalRevenue: revenue[0]?.bookedRevenue || 0,
        bookedRevenue: revenue[0]?.bookedRevenue || 0,
        collectedRevenue: revenue[0]?.collectedRevenue || 0,
        conversionRate: totalBookings > 0
          ? ((confirmedBookings / totalBookings) * 100).toFixed(2) 
          : 0,
      },
      dailyData: dailyBookings.map((d) => ({
        date: d._id,
        bookings: d.bookings,
        revenue: d.revenue,
      })),
    });
  } catch (error) {
    next(error);
  }
};
