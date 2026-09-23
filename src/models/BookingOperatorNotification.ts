import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IBookingOperatorNotification extends Document<string> {
  _id: string;
  bookingId: Types.ObjectId;
  tenantId: Types.ObjectId;
  audience: 'operator' | 'customer';
  kind: 'cancelled' | 'refunded';
  refundAmount?: number;
  fullRefund?: boolean;
  status: 'pending' | 'processing' | 'retry' | 'sent' | 'manual_review' | 'resolved';
  attempts: number;
  nextAttemptAt: Date;
  leaseUntil?: Date;
  leaseToken?: string;
  lastError?: string;
  reconciliation?: { decision: string; note: string; actorId: Types.ObjectId; at: Date };
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IBookingOperatorNotification>({
  _id: { type: String, required: true },
  bookingId: { type: Schema.Types.ObjectId, required: true, ref: 'Booking' },
  tenantId: { type: Schema.Types.ObjectId, required: true, ref: 'Tenant' },
  audience: { type: String, enum: ['operator', 'customer'], default: 'operator' },
  kind: { type: String, required: true, enum: ['cancelled', 'refunded'] },
  refundAmount: { type: Number, min: 0, validate: Number.isFinite },
  fullRefund: Boolean,
  status: { type: String, enum: ['pending', 'processing', 'retry', 'sent', 'manual_review', 'resolved'], default: 'pending' },
  attempts: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: Date,
  leaseToken: String,
  // Only controlled codes, never provider payloads containing message/recipient data.
  lastError: { type: String, maxlength: 80 },
  reconciliation: { decision: String, note: String, actorId: Schema.Types.ObjectId, at: Date },
  sentAt: Date,
}, { timestamps: true });
schema.index({ status: 1, nextAttemptAt: 1 });
schema.index({ status: 1, leaseUntil: 1 });
schema.index({ tenantId: 1, bookingId: 1 });
schema.index({ tenantId: 1, status: 1, _id: -1 });

export const BookingOperatorNotification = mongoose.model<IBookingOperatorNotification>(
  'BookingOperatorNotification', schema
);
