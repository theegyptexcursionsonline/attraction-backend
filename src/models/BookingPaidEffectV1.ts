import mongoose, { Document, Schema, Types } from 'mongoose';

export interface PaidAttractionPresentation {
  title: string;
  duration?: string;
  cancellationPolicy?: string;
  instantConfirmation?: boolean;
  meetingPoint?: { address?: string };
  destination?: { city?: string; coordinates?: { lat?: number; lng?: number } };
}

export interface IBookingPaidEffectV1 extends Document<string> {
  _id: string;
  bookingId: Types.ObjectId;
  tenantId: Types.ObjectId;
  audience: 'customer' | 'operator';
  kind: 'paid_confirmation';
  paymentIntentId: string;
  total: number;
  currency: string;
  recipientFingerprint?: string;
  attractionPresentation?: PaidAttractionPresentation;
  ticketQueuedAt?: Date;
  status: 'pending' | 'processing' | 'retry' | 'sent' | 'manual_review' | 'resolved';
  attempts: number;
  nextAttemptAt: Date;
  leaseUntil?: Date;
  leaseToken?: string;
  providerAttemptedAt?: Date;
  lastError?: string;
  sentAt?: Date;
  reconciliation?: { decision: string; note: string; actorId: Types.ObjectId; at: Date };
  createdAt: Date;
  updatedAt: Date;
}

// A separate collection prevents older cancellation/refund workers from claiming
// confirmation work during a rolling deployment or rollback. Never backfill it.
const schema = new Schema<IBookingPaidEffectV1>({
  _id: { type: String, required: true },
  bookingId: { type: Schema.Types.ObjectId, required: true, ref: 'Booking' },
  tenantId: { type: Schema.Types.ObjectId, required: true, ref: 'Tenant' },
  audience: { type: String, enum: ['customer', 'operator'], required: true },
  kind: { type: String, enum: ['paid_confirmation'], default: 'paid_confirmation' },
  paymentIntentId: { type: String, required: true },
  total: { type: Number, required: true, min: 0, validate: Number.isFinite },
  currency: { type: String, required: true },
  recipientFingerprint: { type: String, match: /^[a-f0-9]{64}$/ },
  attractionPresentation: {
    type: new Schema<PaidAttractionPresentation>({
      title: { type: String, required: true }, duration: String, cancellationPolicy: String, instantConfirmation: Boolean,
      meetingPoint: { address: String }, destination: { city: String, coordinates: { lat: Number, lng: Number } },
    }, { _id: false }),
  },
  ticketQueuedAt: Date,
  status: { type: String, enum: ['pending', 'processing', 'retry', 'sent', 'manual_review', 'resolved'], default: 'pending' },
  attempts: { type: Number, default: 0, min: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: Date,
  leaseToken: String,
  providerAttemptedAt: Date,
  lastError: { type: String, maxlength: 80 },
  sentAt: Date,
  reconciliation: { decision: String, note: String, actorId: Schema.Types.ObjectId, at: Date },
}, { timestamps: true });
schema.index({ status: 1, nextAttemptAt: 1, _id: 1 });
schema.index({ status: 1, leaseUntil: 1 });
schema.index({ tenantId: 1, status: 1, _id: -1 });

export const BookingPaidEffectV1 = mongoose.model<IBookingPaidEffectV1>(
  'BookingPaidEffectV1', schema, 'bookingpaideffectsv1'
);
