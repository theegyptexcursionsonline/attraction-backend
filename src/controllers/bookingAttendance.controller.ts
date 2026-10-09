import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Booking } from '../models/Booking';
import { BookingAttendanceRevision } from '../models/BookingAttendanceRevision';
import { runBookingTransaction, sessionOption } from '../services/bookingInventory.service';
import { Tenant } from '../models/Tenant';
import { AuthRequest } from '../types';
import { standaloneBookingClause } from '../services/bookingRecordScope.service';
import { attendanceEligibility } from '../utils/bookingAttendance';
import { sendError, sendSuccess } from '../utils/response';

const input = z.object({ attendanceStatus: z.enum(['not-recorded', 'no-show']), expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1) }).strict();
export async function updateBookingAttendance(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || !['super-admin', 'brand-admin', 'manager'].includes(req.user.role)) { sendError(res, 'Booking manager access required', req.user ? 403 : 401); return; }
    if (!Types.ObjectId.isValid(req.params.id)) { sendError(res, 'Booking not found', 404); return; }
    const parsed = input.safeParse(req.body);
    if (!parsed.success) { sendError(res, 'Choose a valid attendance status and current revision.', 400); return; }
    const scope = { _id: req.params.id, ...standaloneBookingClause,
      ...(req.user.role === 'super-admin' ? req.tenant ? { tenantId: req.tenant._id } : {}
        : { tenantId: { $in: req.user.assignedTenants || [], ...(req.tenant ? { $eq: req.tenant._id } : {}) } }),
    };
    const booking = await Booking.findOne(scope);
    if (!booking) { sendError(res, 'Booking not found', 404); return; }
    const tenant = await Tenant.findOne({ _id: booking.tenantId }).select('timezone').lean();
    if (!tenant) { sendError(res, 'Booking website not found', 404); return; }
    const { attendanceStatus, expectedRevision } = parsed.data;
    const currentStatus = booking.attendanceStatus || 'not-recorded';
    if (currentStatus === attendanceStatus) { sendSuccess(res, { ...booking.toJSON(), attendanceStatus: currentStatus, attendanceRevision: booking.attendanceRevision || 0, attendanceEligibility: attendanceEligibility(booking, tenant.timezone) }, 'Attendance already recorded'); return; }
    const eligibility = attendanceEligibility(booking, tenant.timezone);
    if (attendanceStatus === 'no-show' && !eligibility.canMarkNoShow) { sendError(res, eligibility.reason!, 409); return; }
    const updated = await runBookingTransaction(async (session) => {
      const record = await Booking.findOneAndUpdate({ ...scope,
        attendanceStatus: currentStatus === 'not-recorded' ? { $in: ['not-recorded', null] } : currentStatus,
        attendanceRevision: expectedRevision === 0 ? { $in: [0, null] } : expectedRevision,
        ...(attendanceStatus === 'no-show' ? { status: booking.status, paymentStatus: booking.paymentStatus, cancellationRequestedAt: { $exists: false } } : {}),
      }, { $set: { attendanceStatus, attendanceRevision: expectedRevision + 1, attendanceRecordedAt: new Date(), attendanceRecordedBy: req.user!._id } }, { new: true, runValidators: true, ...sessionOption(session) });
      if (!record) return null;
      await BookingAttendanceRevision.create([{ bookingId: record._id, tenantId: record.tenantId, revision: expectedRevision + 1,
        previousStatus: currentStatus, attendanceStatus, actorId: req.user!._id }], sessionOption(session));
      return record;
    });
    if (!updated) { sendError(res, 'Booking changed. Refresh it before updating attendance.', 409); return; }
    sendSuccess(res, { ...updated.toJSON(), attendanceEligibility: attendanceEligibility(updated, tenant.timezone) }, attendanceStatus === 'no-show' ? 'No-show recorded' : 'No-show cleared');
  } catch (error) { next(error); }
}
