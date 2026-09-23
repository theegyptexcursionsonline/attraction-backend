import mongoose, { Schema, Types } from 'mongoose';

/** One durable cancellation command per booking; no payment credentials are stored. */
export interface IBookingCancellation {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  status: 'pending' | 'processing' | 'retry' | 'completed' | 'manual_review';
  attempts: number;
  nextAttemptAt: Date;
  leaseToken?: string;
  leaseUntil?: Date;
  providerAttemptedAt?: Date;
  refundAmountMinor?: number;
  lastError?: string;
}
const schema = new Schema<IBookingCancellation>({
  _id: { type: Schema.Types.ObjectId, required: true, ref: 'Booking' },
  tenantId: { type: Schema.Types.ObjectId, required: true, ref: 'Tenant' },
  status: { type: String, enum: ['pending', 'processing', 'retry', 'completed', 'manual_review'], default: 'pending' },
  attempts: { type: Number, default: 0, min: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseToken: String,
  leaseUntil: Date,
  providerAttemptedAt: Date,
  refundAmountMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
  lastError: { type: String, maxlength: 80 },
}, { timestamps: true });
schema.index({ status: 1, nextAttemptAt: 1 });
export const BookingCancellation = mongoose.model<IBookingCancellation>('BookingCancellation', schema);
