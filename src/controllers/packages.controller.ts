import crypto from 'crypto';
import { NextFunction, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { IdempotencyKey } from '../models/IdempotencyKey';
import { User } from '../models/User';
import { AuthRequest, IAttraction, IBooking } from '../types';
import { generateBookingReference } from '../utils/hash';
import { resaleFieldsFor } from '../utils/resaleSplit';
import { bookingDate, runBookingTransaction, sessionOption } from '../services/bookingInventory.service';
import { getTenantStripeConfig } from '../services/tenantPayment.service';
import { assertTenantIdsBookingCreationAllowed, assertTenantPaymentMethodAllowed } from '../services/tenantBookingPolicy.service';
import { safeEmitEvent } from '../services/webhook.service';
import { createAdminNotifications } from '../services/notification.service';
import { bookingEventPayload, bookingResponse } from './bookings.controller';
import {
  cancellationPolicyText,
  packageBookingItem,
  packageBookingSnapshot,
  PackageSeatsUnavailableError,
  reservePackageSeats,
} from '../services/packageBooking.service';
import { resolveBookingTimeZone } from '../utils/bookingCutoff';
import { sendError, sendSuccess } from '../utils/response';
import { callerTenantIds, isSuperAdmin } from '../utils/tenantScope';
import { createAttractionSchema, createBookingSchema } from '../utils/validators';
import {
  isRealIsoDate,
  PACKAGE_LIMITS,
  PackageDetails,
  packageDetailsSchema,
  packagePublishProblems,
  readPackageDetails,
} from '../utils/packageDetails';
import {
  addDays,
  addMonths,
  datePerPersonFrom,
  firstBookableDate,
  packageCalendar,
  packageDateStatus,
  PackageDepartureState,
  packageFromPrice,
  packageQuoteHash,
  packageSelectionSchema,
  PackageSelection,
  pricePackageSelection,
  seatsLeftOn,
  todayInZone,
} from '../services/packagePricing.service';
import { openDepartureDates, packagePublishingEnabled, packageRevisionFilter } from '../services/packageCatalog.service';

/**
 * Package listings: the package editor (details, publication, departures) and the public
 * calendar and quote. Prices are computed only by packagePricing.service; this file decides who
 * may see or change which package and what the database says about seats.
 *
 * Scoping: a delegated admin reaches a package only through a site assigned to them; anything
 * else is "not found", exactly like a missing package. Public reads require a published package
 * listed on the requesting site.
 */

const NOT_FOUND = 'Package not found';
const CHANGED = 'This package changed since you opened it. Reload to see the latest version, then try again.';
const MAX_DEPARTURE_RANGE_DAYS = 400;

const asObjectId = (value: string): Types.ObjectId => new Types.ObjectId(value);
const utcDay = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const isoDay = (value: Date): string => value.toISOString().slice(0, 10);

const adminScope = (req: AuthRequest, id: string): Record<string, unknown> => ({
  _id: asObjectId(id),
  listingType: 'package',
  trashedAt: { $exists: false },
  ...(isSuperAdmin(req.user) ? {} : { tenantIds: { $in: callerTenantIds(req.user).map(asObjectId) } }),
});

const publicScope = (req: AuthRequest, id: string): Record<string, unknown> => ({
  _id: asObjectId(id),
  listingType: 'package',
  status: 'active',
  archivedAt: { $exists: false },
  trashedAt: { $exists: false },
  ...(req.tenant ? { tenantIds: req.tenant._id } : {}),
});

/** The operator's calendar day for this request (every Attraction Network site operates in Egypt). */
const operatorToday = (req: AuthRequest): string => todayInZone(resolveBookingTimeZone(req.tenant?.timezone));

const durationLabel = (details: PackageDetails): string | undefined => (details.durationDays && details.durationNights !== undefined
  ? `${details.durationDays} days / ${details.durationNights} night${details.durationNights === 1 ? '' : 's'}`
  : undefined);

const NO_BOOKABLE_DATE = 'No date can be booked yet — check the seasons, start days, notice period and departures';

interface EditorRecord {
  _id: Types.ObjectId;
  status?: string;
  currency?: string;
  packageDetails?: unknown;
  packageRevision?: number;
}

async function editorView(record: EditorRecord, today: string) {
  const details = readPackageDetails(record.packageDetails) ?? packageDetailsSchema.parse({ version: 1 });
  const departures = details.departureMode === 'fixed' ? await openDepartureDates(record._id, today) : [];
  const firstDate = firstBookableDate(details, today, departures);
  const problems = packagePublishProblems(details, today);
  if (!firstDate && problems.length === 0) problems.push(NO_BOOKABLE_DATE);
  return {
    packageDetails: details,
    packageRevision: record.packageRevision ?? 0,
    status: record.status ?? 'draft',
    currency: record.currency ?? 'USD',
    problems,
    fromPrice: packageFromPrice(details, today, departures),
    firstBookableDate: firstDate,
  };
}

const EDITOR_FIELDS = '_id status currency packageDetails packageRevision';

const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Package ID must be valid') });
const departureParams = idParams.extend({ date: z.string().refine(isRealIsoDate, 'Use a real date (YYYY-MM-DD)') });

const firstIssue = (error: z.ZodError): string => {
  const issue = error.issues[0];
  return issue ? (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message) : 'Invalid request';
};

// ── package editor ────────────────────────────────────────────────────────────────────────────

export const getPackageForEditor = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const params = idParams.safeParse(req.params);
    if (!params.success) { sendError(res, NOT_FOUND, 404); return; }
    const record = await Attraction.findOne(adminScope(req, params.data.id)).select(EDITOR_FIELDS).lean<EditorRecord>();
    if (!record) { sendError(res, NOT_FOUND, 404); return; }
    res.setHeader('Cache-Control', 'private, no-store');
    sendSuccess(res, await editorView(record, operatorToday(req)));
  } catch (error) {
    next(error);
  }
};

export const savePackageDetailsSchema = z.object({
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  packageDetails: z.unknown(),
}).strict();

export const savePackageDetails = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const params = idParams.safeParse(req.params);
    if (!params.success) { sendError(res, NOT_FOUND, 404); return; }
    const body = savePackageDetailsSchema.safeParse(req.body);
    if (!body.success) { sendError(res, firstIssue(body.error), 400); return; }
    const parsed = packageDetailsSchema.safeParse(body.data.packageDetails);
    if (!parsed.success) {
      sendError(res, 'Some package details are not valid', 400, parsed.error.issues.slice(0, 25).map((issue) => ({
        field: issue.path.join('.') || 'packageDetails',
        message: issue.message,
      })));
      return;
    }
    const scope = adminScope(req, params.data.id);
    const record = await Attraction.findOne(scope).select(EDITOR_FIELDS).lean<EditorRecord>();
    if (!record) { sendError(res, NOT_FOUND, 404); return; }
    if ((record.packageRevision ?? 0) !== body.data.expectedRevision) { sendError(res, CHANGED, 409); return; }

    const details = parsed.data;
    const today = operatorToday(req);
    const departures = details.departureMode === 'fixed' ? await openDepartureDates(record._id, today) : [];
    const live = record.status === 'active';
    if (live) {
      // A published package keeps selling while it is edited: never save it into a state that
      // cannot be sold. Unpublish first to rework it.
      const problems = packagePublishProblems(details, today);
      if (problems.length === 0 && !firstBookableDate(details, today, departures)) problems.push(NO_BOOKABLE_DATE);
      if (problems.length > 0) {
        sendError(res, 'This package is live. Fix these before saving, or unpublish it first.', 400,
          problems.map((message) => ({ field: 'packageDetails', message })));
        return;
      }
    }
    const fromPrice = packageFromPrice(details, today, departures);
    const duration = durationLabel(details);
    const updated = await Attraction.findOneAndUpdate(
      { ...scope, status: record.status, ...packageRevisionFilter(body.data.expectedRevision) },
      {
        $set: {
          packageDetails: details,
          ...(fromPrice ? { priceFrom: fromPrice.perPerson } : {}),
          ...(duration ? { duration } : {}),
          // Emails, tickets and pages state the package's own schedule, not the tour default.
          ...(details.cancellation.length ? { cancellationPolicy: cancellationPolicyText(details.cancellation) } : {}),
        },
        ...(!fromPrice && !live ? { $unset: { priceFrom: 1 } } : {}),
        $inc: { packageRevision: 1 },
      },
      { new: true, runValidators: true, context: 'query' },
    ).select(EDITOR_FIELDS).lean<EditorRecord>();
    if (!updated) { sendError(res, CHANGED, 409); return; }
    console.info('[packages] details saved', {
      attractionId: String(record._id),
      userId: req.user?._id ? String(req.user._id) : undefined,
      revision: updated.packageRevision,
      live,
    });
    sendSuccess(res, await editorView(updated, today), 'Package saved');
  } catch (error) {
    next(error);
  }
};

const publishSchema = z.object({ expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1) }).strict();

export const publishPackage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const params = idParams.safeParse(req.params);
    if (!params.success) { sendError(res, NOT_FOUND, 404); return; }
    const body = publishSchema.safeParse(req.body);
    if (!body.success) { sendError(res, firstIssue(body.error), 400); return; }
    if (!packagePublishingEnabled()) {
      sendError(res, 'Packages cannot go live on the websites yet. Keep this one as a draft; it can be published once package pages open.', 409);
      return;
    }
    const scope = adminScope(req, params.data.id);
    const record = await Attraction.findOne(scope).lean<Record<string, unknown> & EditorRecord>();
    if (!record) { sendError(res, NOT_FOUND, 404); return; }
    if ((record.packageRevision ?? 0) !== body.data.expectedRevision) { sendError(res, CHANGED, 409); return; }
    if (record.archivedAt || record.status === 'archived') { sendError(res, 'Restore this package from the archive before publishing it', 409); return; }
    const today = operatorToday(req);
    if (record.status === 'active') { sendSuccess(res, await editorView(record, today), 'Package is already published'); return; }

    const details = readPackageDetails(record.packageDetails);
    if (!details) { sendError(res, 'Add the trip details before publishing', 400); return; }
    const departures = details.departureMode === 'fixed' ? await openDepartureDates(record._id, today) : [];
    const problems = packagePublishProblems(details, today);
    if (problems.length === 0 && !firstBookableDate(details, today, departures)) problems.push(NO_BOOKABLE_DATE);
    if (record.enquiryOnly === true) problems.push('Packages always show their prices — turn off enquiry only');
    // The listing itself (title, descriptions, category, destination, currency) meets the same
    // publishing rules as every tour; prices and dates come from the package instead.
    const candidate: Record<string, unknown> = {
      ...record,
      status: 'active',
      tenantIds: ((record.tenantIds as unknown[]) || []).map(String),
    };
    // Prices, schedule and duration are the package's own; the tour fields stay unused.
    for (const field of ['priceFrom', 'pricingOptions', 'entryWindows', 'addons', 'duration']) delete candidate[field];
    const listing = createAttractionSchema.innerType().safeParse(candidate);
    if (!listing.success) {
      problems.push(...listing.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
    }
    const fromPrice = packageFromPrice(details, today, departures);
    if (problems.length > 0 || !fromPrice) {
      sendError(res, 'Complete these before publishing', 400,
        (problems.length ? problems : [NO_BOOKABLE_DATE]).map((message) => ({ field: 'packageDetails', message })));
      return;
    }
    const duration = durationLabel(details);
    const published = await Attraction.findOneAndUpdate(
      { ...scope, status: record.status, archivedAt: { $exists: false }, ...packageRevisionFilter(body.data.expectedRevision) },
      {
        $set: {
          status: 'active',
          priceFrom: fromPrice.perPerson,
          cancellationPolicy: cancellationPolicyText(details.cancellation),
          ...(duration ? { duration } : {}),
        },
        $inc: { packageRevision: 1 },
      },
      { new: true, runValidators: true, context: 'query' },
    ).select(EDITOR_FIELDS).lean<EditorRecord>();
    if (!published) { sendError(res, CHANGED, 409); return; }
    console.info('[packages] published', {
      attractionId: String(record._id),
      userId: req.user?._id ? String(req.user._id) : undefined,
      revision: published.packageRevision,
    });
    sendSuccess(res, await editorView(published, today), 'Package published');
  } catch (error) {
    next(error);
  }
};

// ── departures (fixed-departure packages) ─────────────────────────────────────────────────────

const departureRangeSchema = z.object({
  from: z.string().refine(isRealIsoDate, 'Use a real date (YYYY-MM-DD)'),
  to: z.string().refine(isRealIsoDate, 'Use a real date (YYYY-MM-DD)'),
}).refine(({ from, to }) => from <= to && (Date.parse(to) - Date.parse(from)) / 86_400_000 <= MAX_DEPARTURE_RANGE_DAYS, {
  message: `Ask for at most ${MAX_DEPARTURE_RANGE_DAYS} days, earliest date first`,
});

export const listPackageDepartures = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const params = idParams.safeParse(req.params);
    if (!params.success) { sendError(res, NOT_FOUND, 404); return; }
    const range = departureRangeSchema.safeParse(req.query);
    if (!range.success) { sendError(res, firstIssue(range.error), 400); return; }
    const record = await Attraction.findOne(adminScope(req, params.data.id)).select('_id packageDetails').lean<EditorRecord>();
    if (!record) { sendError(res, NOT_FOUND, 404); return; }
    const details = readPackageDetails(record.packageDetails);
    const rows = await Availability.find({
      attractionId: record._id,
      date: { $gte: utcDay(range.data.from), $lte: utcDay(range.data.to) },
    }).select('date allDayCapacity allDayBooked isBlocked').sort({ date: 1 }).limit(MAX_DEPARTURE_RANGE_DAYS + 1).lean();
    res.setHeader('Cache-Control', 'private, no-store');
    sendSuccess(res, {
      departureMode: details?.departureMode ?? 'daily',
      departures: rows.map((row) => ({
        date: isoDay(row.date),
        seats: details?.departureMode === 'daily' ? details.daily.dailyCapacity : row.allDayCapacity ?? null,
        booked: row.allDayBooked ?? 0,
        closed: row.isBlocked === true,
      })),
    });
  } catch (error) {
    next(error);
  }
};

const seatsSchema = z.number().int().min(1, 'A departure needs at least one seat').max(PACKAGE_LIMITS.dailyCapacity);
export const upsertDepartureSchema = z.object({ seats: seatsSchema, closed: z.boolean().default(false) }).strict();
export const addDeparturesSchema = z.object({
  dates: z.array(z.string().refine(isRealIsoDate, 'Use real dates (YYYY-MM-DD)')).min(1).max(MAX_DEPARTURE_RANGE_DAYS)
    .refine((dates) => new Set(dates).size === dates.length, 'Each date can be listed once'),
  seats: seatsSchema,
}).strict();

/** The fixed-departure package an admin may manage, or a response already sent. */
async function departurePackage(req: AuthRequest, res: Response, id: string): Promise<{ _id: Types.ObjectId; details: PackageDetails } | null> {
  const record = await Attraction.findOne(adminScope(req, id)).select('_id packageDetails').lean<EditorRecord>();
  if (!record) { sendError(res, NOT_FOUND, 404); return null; }
  const details = readPackageDetails(record.packageDetails);
  if (details?.departureMode !== 'fixed') {
    sendError(res, 'This package starts on any allowed day. Switch it to fixed departures to manage dated departures; close single days with stop sale.', 409);
    return null;
  }
  return { _id: record._id, details };
}

export const upsertPackageDeparture = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const params = departureParams.safeParse(req.params);
    if (!params.success) { sendError(res, firstIssue(params.error), 400); return; }
    const body = upsertDepartureSchema.safeParse(req.body);
    if (!body.success) { sendError(res, firstIssue(body.error), 400); return; }
    const pkg = await departurePackage(req, res, params.data.id);
    if (!pkg) return;
    if (params.data.date < operatorToday(req)) { sendError(res, 'Departures in the past cannot be changed', 400); return; }
    const { seats, closed } = body.data;
    const date = utcDay(params.data.date);
    let inserted = false;
    try {
      const created = await Availability.updateOne(
        { attractionId: pkg._id, date },
        { $setOnInsert: { timeSlots: [], allDayCapacity: seats, allDayBooked: 0, isBlocked: closed, ...(closed ? { blockReason: 'other' } : {}) } },
        { upsert: true },
      );
      inserted = created.upsertedCount > 0;
    } catch (error) {
      // Another admin created this departure at the same moment: carry on as an update.
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    if (!inserted) {
      // Seats can never drop below what is already sold: checked in the same write as the change,
      // so a booking landing between the read and the write cannot be oversold.
      const changed = await Availability.updateOne(
        { attractionId: pkg._id, date, $expr: { $lte: [{ $ifNull: ['$allDayBooked', 0] }, seats] } },
        {
          $set: { allDayCapacity: seats, isBlocked: closed, ...(closed ? { blockReason: 'other' } : {}) },
          ...(closed ? {} : { $unset: { blockReason: 1 } }),
        },
      );
      if (changed.matchedCount === 0) {
        const current = await Availability.findOne({ attractionId: pkg._id, date }).select('allDayBooked').lean();
        const booked = current?.allDayBooked ?? 0;
        sendError(res, `${booked} place${booked === 1 ? ' is' : 's are'} already booked on this departure. Seats cannot go below that.`, 409);
        return;
      }
    }
    const row = await Availability.findOne({ attractionId: pkg._id, date }).select('date allDayCapacity allDayBooked isBlocked').lean();
    console.info('[packages] departure saved', { attractionId: String(pkg._id), date: params.data.date, seats, closed, userId: req.user?._id ? String(req.user._id) : undefined });
    sendSuccess(res, { date: params.data.date, seats: row?.allDayCapacity ?? seats, booked: row?.allDayBooked ?? 0, closed: row?.isBlocked === true }, 'Departure saved');
  } catch (error) {
    next(error);
  }
};

export const addPackageDepartures = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const params = idParams.safeParse(req.params);
    if (!params.success) { sendError(res, NOT_FOUND, 404); return; }
    const body = addDeparturesSchema.safeParse(req.body);
    if (!body.success) { sendError(res, firstIssue(body.error), 400); return; }
    const pkg = await departurePackage(req, res, params.data.id);
    if (!pkg) return;
    const today = operatorToday(req);
    if (body.data.dates.some((date) => date < today)) { sendError(res, 'Departures cannot be added in the past', 400); return; }
    // Existing departures keep their seats and bookings; only missing dates are created.
    let createdCount: number;
    try {
      const result = await Availability.bulkWrite(body.data.dates.map((date) => ({
        updateOne: {
          filter: { attractionId: pkg._id, date: utcDay(date) },
          update: { $setOnInsert: { timeSlots: [], allDayCapacity: body.data.seats, allDayBooked: 0, isBlocked: false } },
          upsert: true,
        },
      })), { ordered: false });
      createdCount = result.upsertedCount;
    } catch (error) {
      // A date created by someone else at the same moment already exists, which is the outcome
      // asked for; anything else is a real failure.
      const failure = error as { writeErrors?: Array<{ code?: number }>; result?: { upsertedCount?: number; insertedCount?: number } };
      const writeErrors = Array.isArray(failure.writeErrors) ? failure.writeErrors : [];
      if (writeErrors.length === 0 || writeErrors.some((writeError) => writeError.code !== 11000)) throw error;
      createdCount = failure.result?.upsertedCount ?? 0;
    }
    console.info('[packages] departures added', { attractionId: String(pkg._id), requested: body.data.dates.length, created: createdCount, userId: req.user?._id ? String(req.user._id) : undefined });
    sendSuccess(res, { created: createdCount, existing: body.data.dates.length - createdCount }, 'Departures added');
  } catch (error) {
    next(error);
  }
};

export const deletePackageDeparture = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const params = departureParams.safeParse(req.params);
    if (!params.success) { sendError(res, firstIssue(params.error), 400); return; }
    const pkg = await departurePackage(req, res, params.data.id);
    if (!pkg) return;
    const date = utcDay(params.data.date);
    const removed = await Availability.deleteOne({
      attractionId: pkg._id,
      date,
      $or: [{ allDayBooked: { $exists: false } }, { allDayBooked: { $lte: 0 } }],
    });
    if (removed.deletedCount === 0) {
      const exists = await Availability.exists({ attractionId: pkg._id, date });
      sendError(res, exists ? 'This departure has bookings. Close it to stop new bookings instead.' : 'There is no departure on this date', exists ? 409 : 404);
      return;
    }
    console.info('[packages] departure removed', { attractionId: String(pkg._id), date: params.data.date, userId: req.user?._id ? String(req.user._id) : undefined });
    sendSuccess(res, { date: params.data.date }, 'Departure removed');
  } catch (error) {
    next(error);
  }
};

// ── public calendar and quote ─────────────────────────────────────────────────────────────────

interface PublicPackage {
  _id: Types.ObjectId;
  currency?: string;
  packageDetails?: unknown;
}

async function loadPublicPackage(req: AuthRequest, res: Response): Promise<{ record: PublicPackage; details: PackageDetails } | null> {
  const params = idParams.safeParse(req.params);
  if (!params.success) { sendError(res, NOT_FOUND, 404); return null; }
  const record = await Attraction.findOne(publicScope(req, params.data.id)).select('_id currency packageDetails').lean<PublicPackage>();
  const details = record ? readPackageDetails(record.packageDetails) : null;
  if (!record || !details) { sendError(res, NOT_FOUND, 404); return null; }
  return { record, details };
}

const departureStates = async (attractionId: Types.ObjectId, from: string, to: string): Promise<Map<string, PackageDepartureState>> => {
  const rows = await Availability.find({ attractionId, date: { $gte: utcDay(from), $lte: utcDay(to) } })
    .select('date allDayCapacity allDayBooked isBlocked').lean();
  return new Map(rows.map((row) => [isoDay(row.date), {
    capacity: typeof row.allDayCapacity === 'number' ? row.allDayCapacity : undefined,
    booked: row.allDayBooked ?? 0,
    blocked: row.isBlocked === true,
  }]));
};

// Not strict: the storefront client adds its site scope (tenantId) to every request.
const calendarQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-11'),
  travellers: z.coerce.number().int().min(1).max(PACKAGE_LIMITS.travellers).default(2),
});

export const getPackageCalendar = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = calendarQuerySchema.safeParse(req.query);
    if (!query.success) { sendError(res, firstIssue(query.error), 400); return; }
    const today = operatorToday(req);
    const { month, travellers } = query.data;
    if (month < today.slice(0, 7) || month > addMonths(today, PACKAGE_LIMITS.horizonMonths).slice(0, 7)) {
      sendError(res, 'Choose a month within the next two years', 400);
      return;
    }
    const loaded = await loadPublicPackage(req, res);
    if (!loaded) return;
    const { record, details } = loaded;
    const monthEnd = addDays(addMonths(`${month}-01`, 1), -1);
    const days = packageCalendar({ details, month, today, travellers, departures: await departureStates(record._id, `${month}-01`, monthEnd) });
    const nextAvailableDate = days.some((day) => day.status === 'available')
      ? null
      : await nextAvailableAfter(record._id, details, monthEnd, today, travellers);
    res.setHeader('Cache-Control', 'private, no-store');
    sendSuccess(res, { month, currency: record.currency ?? 'USD', travellers, days, nextAvailableDate });
  } catch (error) {
    next(error);
  }
};

/** The first day after `after` that can start the trip for this many travellers, or null. */
async function nextAvailableAfter(attractionId: Types.ObjectId, details: PackageDetails, after: string, today: string, travellers: number): Promise<string | null> {
  const horizonEnd = addMonths(today, details.departureMode === 'daily' ? details.daily.horizonMonths : PACKAGE_LIMITS.horizonMonths);
  let from = addDays(after, 1);
  while (from <= horizonEnd) {
    const to = addDays(from, 61) < horizonEnd ? addDays(from, 61) : horizonEnd;
    const states = await departureStates(attractionId, from, to);
    for (let date = from; date <= to; date = addDays(date, 1)) {
      if (packageDateStatus(details, date, today) !== 'open') continue;
      const seats = seatsLeftOn(details, states.get(date));
      if (seats !== null && seats >= travellers && datePerPersonFrom(details, date, travellers)) return date;
    }
    if (details.departureMode === 'fixed') {
      // Jump to the next dated departure instead of scanning empty months.
      const later = await Availability.findOne({ attractionId, date: { $gt: utcDay(to) }, isBlocked: { $ne: true }, allDayCapacity: { $type: 'number' } })
        .select('date').sort({ date: 1 }).lean();
      if (!later) return null;
      from = isoDay(later.date);
    } else {
      from = addDays(to, 1);
    }
  }
  return null;
}

type QuoteRefusal = { code: string; message: string; room?: number; extraId?: string; dateStatus?: string; seatsLeft?: number };

const sendRefusal = (res: Response, refusal: QuoteRefusal): void => {
  const { code, message, room, extraId, dateStatus, seatsLeft } = refusal;
  res.status(409).json({
    success: false,
    error: message,
    code,
    ...(room !== undefined ? { room } : {}),
    ...(extraId !== undefined ? { extraId } : {}),
    ...(dateStatus !== undefined ? { dateStatus } : {}),
    ...(seatsLeft !== undefined ? { seatsLeft } : {}),
  });
};

/** Seats for the party on the chosen day, by the database. Infants do not take a seat. */
const seatRefusal = (state: PackageDepartureState | undefined, seatsLeft: number | null, travellers: number): QuoteRefusal | null => {
  if (state?.blocked) return { code: 'DATE_UNAVAILABLE', message: 'This date is closed for booking. Choose another date.' };
  if (seatsLeft === null) return { code: 'NO_DEPARTURE', message: 'There is no departure on this date. Choose one of the dates shown.' };
  if (seatsLeft === 0) return { code: 'SOLD_OUT', message: 'This date is full. Choose another date.', seatsLeft };
  if (seatsLeft < travellers) return { code: 'NOT_ENOUGH_SEATS', message: `Only ${seatsLeft} place${seatsLeft === 1 ? ' is' : 's are'} left on this date.`, seatsLeft };
  return null;
};

export const quotePackage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const selection = packageSelectionSchema.safeParse(req.body);
    if (!selection.success) { sendError(res, firstIssue(selection.error), 400); return; }
    const loaded = await loadPublicPackage(req, res);
    if (!loaded) return;
    const { record, details } = loaded;
    const today = operatorToday(req);
    const currency = record.currency ?? 'USD';
    const chosen: PackageSelection = selection.data;
    const priced = pricePackageSelection({ details, currency, selection: chosen, today });
    if (!priced.ok) { sendRefusal(res, priced); return; }
    const state = (await departureStates(record._id, chosen.date, chosen.date)).get(chosen.date);
    const seatsLeft = seatsLeftOn(details, state);
    const seats = seatRefusal(state, seatsLeft, priced.quote.travellers.adults + priced.quote.travellers.children);
    if (seats) { sendRefusal(res, seats); return; }

    // Each level priced for the same party, date and extras. `tripPerPerson` leaves the extras out,
    // so a level's own price does not move when an extra is added.
    const alternatives = details.tiers.map((tier) => {
      const other = tier.key === chosen.tierKey ? priced : pricePackageSelection({ details, currency, selection: { ...chosen, tierKey: tier.key }, today });
      return other.ok
        ? {
          key: tier.key,
          name: tier.name,
          total: other.quote.total,
          perPerson: other.quote.perPerson,
          tripPerPerson: other.quote.tripPerPerson,
          difference: Math.round((other.quote.total - priced.quote.total) * 100) / 100,
        }
        : { key: tier.key, name: tier.name, unavailable: other.message };
    });
    const cancellation = [...details.cancellation]
      .sort((left, right) => right.daysBefore - left.daysBefore)
      .map((rule) => ({ ...rule, cancelBy: addDays(chosen.date, -rule.daysBefore) }));
    res.setHeader('Cache-Control', 'private, no-store');
    sendSuccess(res, {
      quote: priced.quote,
      alternatives,
      cancellation,
      seatsLeft,
      quoteHash: packageQuoteHash(String(record._id), chosen, priced.quote),
      quotedAt: new Date().toISOString(),
      // The operator's calendar day, so the storefront can tell which cancellation deadlines
      // have already passed for a booking made now.
      today,
    });
  } catch (error) {
    next(error);
  }
};

// ── booking ───────────────────────────────────────────────────────────────────────────────────

export const bookPackageSchema = z.object({
  selection: packageSelectionSchema,
  quoteHash: z.string().regex(/^[a-f0-9]{32}$/, 'Review the price before booking'),
  guestDetails: createBookingSchema.shape.guestDetails,
  /** Names as on passports, lead traveller first; optional at booking. */
  travellerNames: z.array(z.string().trim().min(1).max(120)).max(PACKAGE_LIMITS.travellers).optional(),
}).strict();

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,128}$/;
const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');
const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

/**
 * Books a package on the requesting site: re-prices the selection on the server, refuses a price
 * that changed since the customer's quote (409 PRICE_CHANGED with the new figure), takes the seats
 * and writes a pending card booking in one transaction. Payment continues through the shared card
 * payment endpoints; an unpaid hold is released by the shared hold sweep. A retry with the same
 * Idempotency-Key returns the same booking.
 *
 * Card only: a multi-day trip commits hotels, so it is never booked to be paid on arrival
 * (deposits are designed separately). A site that cannot take cards is told to send an enquiry.
 */
export const bookPackage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  let idempotencyRecordId: Types.ObjectId | undefined;
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      sendError(res, 'A valid Idempotency-Key header is required', 400);
      return;
    }
    const body = bookPackageSchema.safeParse(req.body);
    if (!body.success) { sendError(res, firstIssue(body.error), 400); return; }
    if (!req.tenant) { sendError(res, 'Book this trip from the website that lists it', 400); return; }
    const params = idParams.safeParse(req.params);
    if (!params.success) { sendError(res, NOT_FOUND, 404); return; }
    const attraction = await Attraction.findOne(publicScope(req, params.data.id)).lean<IAttraction>();
    const details = attraction ? readPackageDetails(attraction.packageDetails) : null;
    if (!attraction || !details) { sendError(res, NOT_FOUND, 404); return; }

    const tenantId = req.tenant._id;
    const currency = attraction.currency ?? 'USD';
    const { selection, guestDetails, travellerNames } = body.data;
    const priced = pricePackageSelection({ details, currency, selection, today: operatorToday(req) });
    if (!priced.ok) { sendRefusal(res, priced); return; }
    const quote = priced.quote;
    const quoteHash = packageQuoteHash(String(attraction._id), selection, quote);
    if (quoteHash !== body.data.quoteHash) {
      res.status(409).json({
        success: false,
        code: 'PRICE_CHANGED',
        error: `The price for this trip is now ${currency} ${quote.total.toFixed(2)}. Review it before booking.`,
        quote,
        quoteHash,
      });
      return;
    }
    // The same seat answers the quote gives (no departure, full, only N left); the booking
    // transaction below remains the authority when two customers race for the last places.
    const state = (await departureStates(attraction._id, selection.date, selection.date)).get(selection.date);
    const seats = seatRefusal(state, seatsLeftOn(details, state), quote.travellers.adults + quote.travellers.children);
    if (seats) { sendRefusal(res, seats); return; }
    const travellers = quote.travellers.adults + quote.travellers.children + quote.travellers.infants;
    if (travellerNames && travellerNames.length > travellers) {
      sendError(res, `Enter at most ${travellers} traveller name${travellers === 1 ? '' : 's'}`, 400);
      return;
    }
    const gateway = await getTenantStripeConfig(tenantId);
    if (!gateway?.enabled || !gateway.secretKey || !gateway.publishableKey) {
      sendError(res, 'This website does not take card payments online yet. Please send an enquiry for this trip.', 409);
      return;
    }

    const keyHash = sha256(idempotencyKey);
    const requestHash = sha256(stableStringify({
      tenantId: String(tenantId),
      attractionId: String(attraction._id),
      selection,
      guestDetails,
      travellerNames: travellerNames ?? null,
      paymentMethod: 'card',
      quoteHash,
    }));
    try {
      const record = await IdempotencyKey.create({
        scope: 'booking.create', tenantId, keyHash, requestHash, status: 'processing',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      idempotencyRecordId = record._id as Types.ObjectId;
    } catch (claimError) {
      if ((claimError as { code?: number }).code !== 11000) throw claimError;
      const existing = await IdempotencyKey.findOne({ scope: 'booking.create', tenantId, keyHash }).lean();
      if (!existing || existing.requestHash !== requestHash) {
        sendError(res, 'Idempotency key was already used for a different booking request', 409);
        return;
      }
      if (existing.status === 'completed' && existing.resourceId) {
        const replayed = await Booking.findById(existing.resourceId);
        if (replayed) {
          res.setHeader('Idempotency-Replayed', 'true');
          sendSuccess(res, bookingResponse(replayed as IBooking), 'Booking already created');
          return;
        }
      }
      res.setHeader('Retry-After', '2');
      sendError(res, 'An identical booking request is already processing', 409);
      return;
    }

    await assertTenantIdsBookingCreationAllowed([tenantId]);
    await assertTenantPaymentMethodAllowed(tenantId, 'card');

    const guests = quote.travellers.adults + quote.travellers.children;
    const bookingId = new Types.ObjectId();
    const reference = generateBookingReference();
    const packageBooking = packageBookingSnapshot({ details, quote, quoteHash, travellerNames });
    const booking = await runBookingTransaction<IBooking>(async (session) => {
      await reservePackageSeats(attraction._id, details, selection.date, guests, session);
      const payload = {
        _id: bookingId,
        reference,
        inventoryReservedAt: new Date(),
        inventoryReservations: [{ date: bookingDate(selection.date), guests }],
        userId: req.user?._id,
        tenantId,
        attractionId: attraction._id,
        items: [packageBookingItem(details, quote)],
        guestDetails,
        // Every figure includes the service fee, as quoted; the fee itself is in packageBooking.
        subtotal: quote.total,
        fees: 0,
        discount: 0,
        total: quote.total,
        currency,
        paymentMethod: 'card',
        status: 'pending',
        paymentStatus: 'pending',
        packageBooking,
        ...resaleFieldsFor(attraction, tenantId, quote.total),
      };
      const created = session ? (await Booking.create([payload], { session }))[0] : await Booking.create(payload);
      await IdempotencyKey.findByIdAndUpdate(idempotencyRecordId, {
        $set: { status: 'completed', resourceId: created._id, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      }, sessionOption(session));
      if (req.user) await User.findByIdAndUpdate(req.user._id, { $inc: { totalBookings: 1 } }, sessionOption(session));
      return created as IBooking;
    });

    safeEmitEvent(tenantId, 'booking.created', bookingEventPayload(booking));
    createAdminNotifications({
      type: 'booking',
      title: 'New package booking',
      message: `${guestDetails.firstName} ${guestDetails.lastName} booked "${attraction.title}" for ${selection.date} — ${currency} ${quote.total.toFixed(2)}, awaiting card payment`,
      link: '/admin/bookings',
      data: { bookingId: booking._id, reference: booking.reference },
      tenantId: String(tenantId),
    }).catch(() => undefined);
    console.info('[packages] booking created', {
      bookingId: String(booking._id), attractionId: String(attraction._id), tenantId: String(tenantId), guests, total: quote.total, currency,
    });
    sendSuccess(res, bookingResponse(booking), 'Booking created successfully', 201);
  } catch (error) {
    if (idempotencyRecordId) {
      await IdempotencyKey.deleteOne({ _id: idempotencyRecordId, status: 'processing' }).catch(() => undefined);
    }
    if (error instanceof PackageSeatsUnavailableError) {
      res.status(409).json({ success: false, code: 'SEATS_UNAVAILABLE', error: 'Those places were just taken. Choose another date or fewer travellers.' });
      return;
    }
    next(error);
  }
};
