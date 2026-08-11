import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IBundleOutboxEvent extends Document {
  eventId: string;
  orderId?: Types.ObjectId;
  tenantId: Types.ObjectId;
  audience: 'customer' | 'supplier' | 'storefront';
  eventType: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'delivered' | 'retry' | 'dead_letter';
  attempts: number;
  nextAttemptAt: Date;
  leaseUntil?: Date;
  lastError?: string;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const bundleOutboxEventSchema = new Schema<IBundleOutboxEvent>(
  {
    eventId: { type: String, required: true, unique: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'BundleOrder', index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    audience: { type: String, enum: ['customer', 'supplier', 'storefront'], required: true },
    eventType: { type: String, required: true, maxlength: 120 },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['pending', 'processing', 'delivered', 'retry', 'dead_letter'], default: 'pending', index: true },
    attempts: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    leaseUntil: { type: Date },
    lastError: { type: String, maxlength: 1000 },
    deliveredAt: { type: Date },
  },
  { timestamps: true }
);
bundleOutboxEventSchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });

export const BundleOutboxEvent = mongoose.model<IBundleOutboxEvent>(
  'BundleOutboxEvent',
  bundleOutboxEventSchema
);
