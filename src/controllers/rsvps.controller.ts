import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { EventRsvp } from '../models/EventRsvp';
import { Tenant } from '../models/Tenant';
import { AuthRequest } from '../types';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { sendEventRsvpNotification, sendEventRsvpConfirmation } from '../services/email.service';
import { escapeRegex } from '../utils/helpers';

const adminRoles = ['super-admin', 'brand-admin', 'manager'];
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const hasTenantAccess = (req: AuthRequest, tenantId?: unknown): boolean => {
  if (!req.user || !tenantId) return false;
  if (req.user.role === 'super-admin') return true;
  if (!adminRoles.includes(req.user.role)) return false;
  return (req.user.assignedTenants || []).some(
    (assignedTenantId) => assignedTenantId.toString() === String(tenantId)
  );
};

export const createRsvp = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      eventSlug,
      eventName,
      eventDate,
      eventLocation,
      firstName,
      lastName,
      email,
      phone,
      adultsCount,
      childrenCount,
      message,
      tenantSlug,
    } = req.body as Record<string, unknown>;

    if (!eventSlug || !eventName || !eventDate || !firstName || !lastName || !email || !phone) {
      sendError(res, 'Missing required fields', 400);
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (normalizedEmail.length > 254 || !emailPattern.test(normalizedEmail)) {
      sendError(res, 'A valid email address is required', 400);
      return;
    }
    const requiredText = [eventSlug, eventName, firstName, lastName, phone];
    if (requiredText.some((value) => String(value).trim().length > 160)) {
      sendError(res, 'One or more fields exceed the maximum length', 400);
      return;
    }
    const parsedEventDate = new Date(String(eventDate));
    if (Number.isNaN(parsedEventDate.getTime())) {
      sendError(res, 'A valid event date is required', 400);
      return;
    }

    const adults = Number(adultsCount);
    const children = Number(childrenCount ?? 0);
    if (!Number.isFinite(adults) || adults < 1 || adults > 50) {
      sendError(res, 'Adults must be between 1 and 50', 400);
      return;
    }
    if (!Number.isFinite(children) || children < 0 || children > 50) {
      sendError(res, 'Children must be between 0 and 50', 400);
      return;
    }

    // Resolve tenant: prefer req.tenant (from X-Tenant-ID header/query), fall back to body slug
    let tenant = req.tenant;
    if (!tenant && typeof tenantSlug === 'string' && tenantSlug.trim()) {
      tenant = (await Tenant.findOne({ slug: tenantSlug.trim() })) || undefined;
    }
    if (!tenant) {
      sendError(res, 'Tenant context required', 400);
      return;
    }

    const rsvp = await EventRsvp.create({
      tenantId: tenant._id,
      eventSlug: String(eventSlug),
      eventName: String(eventName),
      eventDate: new Date(String(eventDate)),
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: normalizedEmail,
      phone: String(phone).trim(),
      adultsCount: adults,
      childrenCount: children,
      message: typeof message === 'string' ? message.trim().slice(0, 1000) : undefined,
      status: 'pending',
    });

    const eventDateDisplay = parsedEventDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const tenantName = tenant.name || 'Attractions Network';
    const locationString = (typeof eventLocation === 'string' && eventLocation.trim())
      ? eventLocation.trim()
      : (tenant.contactInfo?.address || 'Makadi Bay, Egypt');

    const rsvpEmailDetails = {
        eventName: String(eventName),
        eventDate: eventDateDisplay,
        eventLocation: locationString,
        tenantName,
        firstName: String(firstName),
        lastName: String(lastName),
        email: normalizedEmail,
        phone: String(phone),
        adultsCount: adults,
        childrenCount: children,
        message: typeof message === 'string' ? message : undefined,
    };
    const emails: Promise<void>[] = [
      sendEventRsvpConfirmation(normalizedEmail, {
        eventName: String(eventName),
        eventDate: eventDateDisplay,
        eventLocation: locationString,
        tenantName,
        firstName: String(firstName),
        adultsCount: adults,
        childrenCount: children,
      }, tenant),
    ];
    if (tenant.contactInfo?.email) {
      emails.push(sendEventRsvpNotification(tenant.contactInfo.email, rsvpEmailDetails, tenant));
    }

    // Fan out emails in parallel — never block the user response on them.
    Promise.allSettled(emails).then((results) => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`RSVP email ${i === 0 ? 'confirmation' : 'notification'} failed:`, r.reason);
        }
      });
    });

    sendSuccess(
      res,
      { id: rsvp._id.toString(), status: rsvp.status },
      'RSVP received successfully',
      201
    );
  } catch (error) {
    next(error);
  }
};

export const getAllRsvps = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
    const status = req.query.status as string | undefined;
    const eventSlug = req.query.eventSlug as string | undefined;
    const search = req.query.search as string | undefined;
    const tenantIdParam = req.query.tenantId as string | undefined;

    const query: Record<string, unknown> = {};

    // Tenant scoping
    if (req.user?.role === 'super-admin') {
      // super-admin sees all unless they filter by tenant
      if (tenantIdParam && Types.ObjectId.isValid(tenantIdParam)) {
        query.tenantId = new Types.ObjectId(tenantIdParam);
      } else if (req.tenant) {
        query.tenantId = req.tenant._id;
      }
    } else {
      // brand-admin/manager: only their assigned tenants
      const assigned = (req.user?.assignedTenants || []).map((t) => new Types.ObjectId(t.toString()));
      if (assigned.length === 0) {
        sendPaginated(res, [], page, limit, 0);
        return;
      }
      if (req.tenant && !hasTenantAccess(req, req.tenant._id)) {
        sendError(res, 'Access denied to this tenant', 403);
        return;
      }
      query.tenantId = req.tenant ? req.tenant._id : { $in: assigned };
    }

    if (status && ['pending', 'confirmed', 'cancelled'].includes(status)) {
      query.status = status;
    }
    if (eventSlug) {
      query.eventSlug = eventSlug;
    }
    if (search && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }, { phone: rx }];
    }

    const [rows, total] = await Promise.all([
      EventRsvp.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('tenantId', 'name slug')
        .lean(),
      EventRsvp.countDocuments(query),
    ]);

    sendPaginated(res, rows, page, limit, total);
  } catch (error) {
    next(error);
  }
};

export const getRsvpStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const eventSlug = req.query.eventSlug as string | undefined;

    const matchStage: Record<string, unknown> = {};
    if (req.user?.role === 'super-admin') {
      if (req.tenant) matchStage.tenantId = req.tenant._id;
    } else {
      const assigned = (req.user?.assignedTenants || []).map((t) => new Types.ObjectId(t.toString()));
      if (assigned.length === 0) {
        sendSuccess(res, { totalRsvps: 0, totalAdults: 0, totalChildren: 0, totalGuests: 0, byStatus: { pending: 0, confirmed: 0, cancelled: 0 } });
        return;
      }
      matchStage.tenantId = req.tenant ? req.tenant._id : { $in: assigned };
    }
    if (eventSlug) matchStage.eventSlug = eventSlug;

    const agg = await EventRsvp.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalRsvps: { $sum: 1 },
          totalAdults: { $sum: '$adultsCount' },
          totalChildren: { $sum: '$childrenCount' },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        },
      },
    ]);

    const row = agg[0] || {
      totalRsvps: 0,
      totalAdults: 0,
      totalChildren: 0,
      pending: 0,
      confirmed: 0,
      cancelled: 0,
    };

    sendSuccess(res, {
      totalRsvps: row.totalRsvps,
      totalAdults: row.totalAdults,
      totalChildren: row.totalChildren,
      totalGuests: row.totalAdults + row.totalChildren,
      byStatus: {
        pending: row.pending,
        confirmed: row.confirmed,
        cancelled: row.cancelled,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateRsvpStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status?: string };

    if (!status || !['pending', 'confirmed', 'cancelled'].includes(status)) {
      sendError(res, 'Invalid status', 400);
      return;
    }

    const rsvp = await EventRsvp.findById(id);
    if (!rsvp) {
      sendError(res, 'RSVP not found', 404);
      return;
    }

    if (req.user?.role !== 'super-admin' && !hasTenantAccess(req, rsvp.tenantId)) {
      sendError(res, 'Access denied', 403);
      return;
    }

    rsvp.status = status as 'pending' | 'confirmed' | 'cancelled';
    await rsvp.save();

    sendSuccess(res, { id: rsvp._id.toString(), status: rsvp.status }, 'Status updated');
  } catch (error) {
    next(error);
  }
};

export const deleteRsvp = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const rsvp = await EventRsvp.findById(id);
    if (!rsvp) {
      sendError(res, 'RSVP not found', 404);
      return;
    }
    if (req.user?.role !== 'super-admin' && !hasTenantAccess(req, rsvp.tenantId)) {
      sendError(res, 'Access denied', 403);
      return;
    }
    await rsvp.deleteOne();
    sendSuccess(res, null, 'RSVP deleted');
  } catch (error) {
    next(error);
  }
};
