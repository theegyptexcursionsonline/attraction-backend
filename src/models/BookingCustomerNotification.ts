import mongoose, { Schema } from 'mongoose';
import type { IBookingOperatorNotification } from './BookingOperatorNotification';

// Separate physical collection: legacy operator workers cannot claim customer
// rows during a rolling deployment or rollback. Rollback leaves these rows
// untouched until a compatible customer worker is restored.
const schema = new Schema<IBookingOperatorNotification>({
  _id: { type: String, required: true },
  bookingId: { type: Schema.Types.ObjectId, required: true, ref: 'Booking' },
  tenantId: { type: Schema.Types.ObjectId, required: true, ref: 'Tenant' },
  audience: { type: String, enum: ['customer'], default: 'customer', required: true },
  kind: { type: String, required: true, enum: ['cancelled', 'refunded'] },
  refundAmount: { type: Number, min: 0, validate: Number.isFinite },
  fullRefund: Boolean,
  status: { type: String, enum: ['pending', 'processing', 'retry', 'sent', 'manual_review', 'resolved'], default: 'pending' },
  attempts: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: Date,
  leaseToken: String,
  lastError: { type: String, maxlength: 80 },
  reconciliation: { decision: { type: String, enum: ['confirmed_delivered', 'closed_without_resend'] }, note: { type: String, maxlength: 500 }, actorId: Schema.Types.ObjectId, at: Date },
  sentAt: Date,
}, { timestamps: true });
schema.index({ status: 1, nextAttemptAt: 1 });
schema.index({ status: 1, leaseUntil: 1 });
schema.index({ tenantId: 1, bookingId: 1 });
schema.index({ tenantId: 1, status: 1, _id: -1 });

export const BookingCustomerNotification = mongoose.model<IBookingOperatorNotification>(
  'BookingCustomerNotification', schema, 'bookingcustomernotifications'
);
