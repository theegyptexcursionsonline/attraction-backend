import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IBundleProviderEvent extends Document {
  provider: 'stripe';
  eventId: string;
  eventType: string;
  tenantId: Types.ObjectId;
  orderId?: Types.ObjectId;
  status: 'processing' | 'completed' | 'failed';
  attempts: number;
  leaseUntil: Date;
  lastError?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const bundleProviderEventSchema = new Schema<IBundleProviderEvent>(
  {
    provider: { type: String, enum: ['stripe'], required: true },
    eventId: { type: String, required: true },
    eventType: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'BundleOrder' },
    status: { type: String, enum: ['processing', 'completed', 'failed'], required: true },
    attempts: { type: Number, default: 1, min: 1, validate: Number.isSafeInteger },
    leaseUntil: { type: Date, required: true },
    lastError: { type: String, maxlength: 1000 },
    completedAt: { type: Date },
  },
  { timestamps: true }
);
bundleProviderEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
bundleProviderEventSchema.index({ status: 1, leaseUntil: 1 });

export const BundleProviderEvent = mongoose.model<IBundleProviderEvent>(
  'BundleProviderEvent',
  bundleProviderEventSchema
);
