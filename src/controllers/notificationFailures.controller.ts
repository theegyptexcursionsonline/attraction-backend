import { NextFunction, Response } from 'express';
import { PipelineStage, Types } from 'mongoose';
import { z } from 'zod';
import { AuthRequest } from '../types';
import { BookingCustomerNotification } from '../models/BookingCustomerNotification';
import { BookingPaymentNotification } from '../models/BookingPaymentNotification';
import { BookingOperatorNotification } from '../models/BookingOperatorNotification';
import { BundleOutboxEvent } from '../models/BundleOutboxEvent';
import { sendError, sendSuccess } from '../utils/response';

const sourceSchema = z.enum(['booking', 'bundle']);
const querySchema = z.object({ source: sourceSchema, limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(), tenantId: z.string().optional(), status: z.enum(['unresolved', 'resolved']).default('unresolved') }).strict();
const bodySchema = z.object({ expectedUpdatedAt: z.string().datetime(),
  decision: z.enum(['confirmed_delivered', 'closed_without_resend']),
  note: z.string().trim().min(10).max(500).refine((value) => !/[\x00-\x1f<>]/.test(value), 'Use plain text') }).strict();
const validId = (source: string, id: string): boolean => source === 'booking' ? /^[a-f0-9]{64}$/.test(id) : /^[a-f0-9]{24}$/.test(id);
const failures = ['retry', 'manual_review', 'dead_letter'];
const publicReason = (code: unknown): string => {
  const known = ['DELIVERY_UNCERTAIN', 'DELIVERY_UNCERTAIN_COMPLETION', 'DELIVERY_UNCERTAIN_LEASE_EXPIRED', 'DELIVERY_SKIPPED',
    'DELIVERY_SKIPPED_PROVIDER_NOT_CONFIGURED', 'DELIVERY_SKIPPED_NON_PRODUCTION_NO_QA_INBOX',
    'DELIVERY_NOT_STARTED', 'NOTIFICATION_SCOPE_MISSING', 'NOTIFICATION_PREPARATION_FAILED', 'OPERATOR_RECIPIENT_MISSING', 'CUSTOMER_RECIPIENT_MISSING'];
  return typeof code === 'string' && (known.includes(code) || /^PROVIDER_REJECTED_4[0-9]{2}$/.test(code)) ? code : 'DELIVERY_REVIEW_REQUIRED';
};

/** Explicit route tenant wins; body/query/header overrides have no authority. */
function scope(req: AuthRequest, res: Response): string | null {
  const tenantId = String(req.params.tenantId);
  if (!/^[a-f0-9]{24}$/.test(tenantId)) { sendError(res, 'Invalid tenant', 400); return null; }
  if (!req.user) { sendError(res, 'Authentication required', 401); return null; }
  if (!['super-admin', 'brand-admin'].includes(req.user.role) ||
    (req.user.role !== 'super-admin' && !req.user.assignedTenants.some((id) => String(id) === tenantId))) {
    sendError(res, 'Access denied to this tenant', 403); return null;
  }
  res.set('Cache-Control', 'no-store');
  return tenantId;
}

export const listNotificationFailures = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = scope(req, res); if (!tenantId) return;
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) { sendError(res, 'Invalid notification query', 400); return; }
    const { source, limit, cursor, status } = parsed.data;
    if (parsed.data.tenantId && parsed.data.tenantId !== tenantId) { sendError(res, 'Tenant query does not match this site', 400); return; }
    if (cursor && !validId(source, cursor)) { sendError(res, 'Invalid cursor', 400); return; }
    const match = { tenantId: new Types.ObjectId(tenantId),
      ...(status === 'resolved' ? { reconciliation: { $exists: true } } : { status: { $in: failures } }),
      ...(cursor ? { _id: { $lt: source === 'booking' ? cursor : new Types.ObjectId(cursor) } } : {}) };
    const ownership = source === 'booking'
      ? { $eq: ['$tenantId', '$$recipientTenant'] }
      : { $or: [
          { $and: [{ $ne: ['$$audience', 'supplier'] }, { $eq: ['$storefrontTenantId', '$$recipientTenant'] }] },
          { $and: [{ $eq: ['$$audience', 'supplier'] }, { $in: ['$$recipientTenant', '$components.supplierTenantId'] }] },
        ] };
    const pipeline: PipelineStage[] = [ { $match: match },
      ...(source === 'booking' ? [{ $unionWith: { coll: BookingCustomerNotification.collection.name, pipeline: [{ $match: match }] } } as PipelineStage] : []),
      ...(source === 'booking' ? [{ $unionWith: { coll: BookingPaymentNotification.collection.name, pipeline: [{ $match: match }] } } as PipelineStage] : []),
      { $sort: { _id: -1 } }, { $limit: limit + 1 },
      { $lookup: { from: source === 'booking' ? 'bookings' : 'bundleorders',
        let: { entity: source === 'booking' ? '$bookingId' : '$orderId', recipientTenant: '$tenantId', audience: '$audience' },
        pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$_id', '$$entity'] }, ownership] } } }, { $project: { reference: 1 } }], as: 'entity' } },
      { $project: { _id: 1, kind: 1, audience: 1, eventType: 1, status: 1, attempts: 1, lastError: 1, createdAt: 1, updatedAt: 1, reconciliation: 1, entity: 1 } } ];
    const rows = source === 'booking' ? await BookingOperatorNotification.aggregate(pipeline) : await BundleOutboxEvent.aggregate(pipeline);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    sendSuccess(res, { data: page.map((row) => ({ id: String(row._id), source, eventType: row.kind || row.eventType, audience: row.audience || 'operator',
      status: row.status, attempts: row.attempts,
      ...(row.entity?.[0] ? { entityId: String(row.entity[0]._id), reference: row.entity[0].reference } : {}),
      // Old bundle errors could contain provider details. Only controlled codes cross the API.
      lastError: publicReason(row.lastError),
      createdAt: row.createdAt, updatedAt: row.updatedAt,
      ...(row.reconciliation ? { reconciliation: { decision: row.reconciliation.decision, note: row.reconciliation.note, at: row.reconciliation.at } } : {}),
    })), pageInfo: { hasMore, nextCursor: hasMore ? String(page[page.length - 1]._id) : null } });
  } catch (error) { next(error); }
};

/** Records a human reconciliation only. This endpoint never enqueues or sends mail. */
export const reconcileNotificationFailure = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = scope(req, res); if (!tenantId) return;
    const source = sourceSchema.safeParse(req.params.source);
    const parsed = bodySchema.safeParse(req.body);
    if (!source.success || !validId(source.data, req.params.id) || !parsed.success) { sendError(res, 'Invalid reconciliation', 400); return; }
    const { expectedUpdatedAt, decision, note } = parsed.data;
    const filter = { _id: req.params.id, tenantId, status: { $in: failures }, updatedAt: new Date(expectedUpdatedAt) };
    const reconciliation = { decision, note, actorId: req.user!._id, at: new Date() };
    const completedStatus = source.data === 'booking' ? 'sent' : 'delivered';
    const update = { $set: { status: decision === 'confirmed_delivered' ? completedStatus : 'resolved', reconciliation,
      ...(source.data === 'bundle' ? { manualRecoveryRequired: false } : {}) }, $unset: { leaseUntil: 1, leaseToken: 1 } };
    const updated = source.data === 'booking'
      ? (await BookingOperatorNotification.findOneAndUpdate(filter, update, { new: true, runValidators: true })
        || await BookingCustomerNotification.findOneAndUpdate(filter, update, { new: true, runValidators: true })
        || await BookingPaymentNotification.findOneAndUpdate(filter, update, { new: true, runValidators: true }))
      : await BundleOutboxEvent.findOneAndUpdate(filter, update, { new: true, runValidators: true });
    if (!updated) { sendError(res, 'Delivery item changed or is unavailable; refresh before reconciling', 409); return; }
    sendSuccess(res, { id: String(updated._id), source: source.data, status: updated.status, updatedAt: updated.updatedAt, reconciliation: { decision, note, at: reconciliation.at } });
  } catch (error) { next(error); }
};
