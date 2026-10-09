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
    const assignedTenants = (req.user.assignedTenants || []).map(String).filter(Types.ObjectId.isValid).map(id => new Types.ObjectId(id));
    const scope = { _id: new Types.ObjectId(req.params.id), ...standaloneBookingClause,
      ...(req.user.role === 'super-admin' ? req.tenant ? { tenantId: req.tenant._id } : {}
        : { tenantId: { $in: assignedTenants, ...(req.tenant ? { $eq: req.tenant._id } : {}) } }),
    };
    const booking = await Booking.findOne(scope).lean();
    if (!booking) { sendError(res, 'Booking not found', 404); return; }
    const tenant = await Tenant.findOne({ _id: booking.tenantId }).select('timezone').lean();
    if (!tenant) { sendError(res, 'Booking website not found', 404); return; }
    const { attendanceStatus, expectedRevision } = parsed.data;
    const currentStatus = booking.attendanceStatus || 'not-recorded';
    if (currentStatus === attendanceStatus) { sendSuccess(res, { ...booking, attendanceStatus: currentStatus, attendanceRevision: booking.attendanceRevision || 0, attendanceEligibility: { ...attendanceEligibility(booking, tenant.timezone), canUndoNoShow: currentStatus === 'no-show' } }, 'Attendance already recorded'); return; }
    const eligibility = attendanceEligibility(booking, tenant.timezone);
    if (attendanceStatus === 'no-show' && !eligibility.canMarkNoShow) { sendError(res, eligibility.reason!, 409); return; }
    const updated = await runBookingTransaction(async (session) => {
      if (attendanceStatus === 'no-show') {
        const fence = await Tenant.updateOne({ _id: booking.tenantId, timezone: tenant.timezone ?? { $in: [null, ''] } }, { $inc: { attendanceBookingFence: 1 } }, { ...sessionOption(session), timestamps: false });
        if (fence.matchedCount !== 1) return null;
      }
      const record = await Booking.collection.findOneAndUpdate({ ...scope,
        attendanceStatus: currentStatus === 'not-recorded' ? { $in: ['not-recorded', null] } : currentStatus,
        attendanceRevision: expectedRevision === 0 ? { $in: [0, null] } : expectedRevision,
        ...(attendanceStatus === 'no-show' ? { $expr: { $eq: ['$items', { $literal: booking.items }] }, status: booking.status, paymentStatus: booking.paymentStatus, cancellationRequestedAt: { $exists: false } } : {}),
      }, { $set: { attendanceStatus, attendanceRevision: expectedRevision + 1, attendanceRecordedAt: new Date(), attendanceRecordedBy: req.user!._id, updatedAt: new Date() } }, { returnDocument: 'after', ...sessionOption(session) });
      if (!record) return null;
      await BookingAttendanceRevision.create([{ bookingId: record._id, tenantId: record.tenantId, revision: expectedRevision + 1,
        previousStatus: currentStatus, attendanceStatus, actorId: req.user!._id }], sessionOption(session));
      return record;
    });
    if (!updated) { sendError(res, 'Booking changed. Refresh it before updating attendance.', 409); return; }
    sendSuccess(res, { ...updated, attendanceEligibility: { ...attendanceEligibility(updated as any, tenant.timezone), canUndoNoShow: updated.attendanceStatus === 'no-show' } }, attendanceStatus === 'no-show' ? 'No-show recorded' : 'No-show cleared');
  } catch (error) { next(error); }
}
