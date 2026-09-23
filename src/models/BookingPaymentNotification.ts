import mongoose, { Document, Schema, Types } from 'mongoose';

export type BookingPaymentNotificationKind = 'payment_failed' | 'checkout_expired';
export interface IBookingPaymentNotification extends Document<string> {
  _id: string;
  bookingId: Types.ObjectId;
  tenantId: Types.ObjectId;
  kind: BookingPaymentNotificationKind;
  audience: 'customer' | 'operator';
  status: 'pending' | 'processing' | 'retry' | 'sent' | 'suppressed' | 'manual_review' | 'resolved';
  attempts: number;
  nextAttemptAt: Date;
  leaseToken?: string;
  leaseUntil?: Date;
  lastError?: string;
  sentAt?: Date;
  reconciliation?: { decision: string; note: string; actorId: Types.ObjectId; at: Date };
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IBookingPaymentNotification>({
  _id: { type: String, required: true },
  bookingId: { type: Schema.Types.ObjectId, required: true, ref: 'Booking' },
  tenantId: { type: Schema.Types.ObjectId, required: true, ref: 'Tenant' },
  kind: { type: String, enum: ['payment_failed', 'checkout_expired'], required: true },
  audience: { type: String, enum: ['customer', 'operator'], required: true },
  status: { type: String, enum: ['pending', 'processing', 'retry', 'sent', 'suppressed', 'manual_review', 'resolved'], default: 'pending' },
  attempts: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseToken: String,
  leaseUntil: Date,
  lastError: { type: String, maxlength: 80 },
  sentAt: Date,
  reconciliation: {
    decision: { type: String, enum: ['confirmed_delivered', 'closed_without_resend'] },
    note: { type: String, maxlength: 500 }, actorId: Schema.Types.ObjectId, at: Date,
  },
}, { timestamps: true });
schema.index({ status: 1, nextAttemptAt: 1 });
schema.index({ status: 1, leaseUntil: 1 });
schema.index({ tenantId: 1, status: 1, _id: -1 });
schema.index({ tenantId: 1, bookingId: 1 });

// Legacy cancellation/refund workers never see this collection during rollout.
export const BookingPaymentNotification = mongoose.model<IBookingPaymentNotification>(
  'BookingPaymentNotification', schema, 'bookingpaymentnotifications'
);
