import mongoose, { Document, Schema, Types } from 'mongoose';

export type BundleIdempotencyStatus =
  | 'processing'
  | 'completed'
  | 'failed_retryable'
  | 'failed_final'
  | 'outcome_unknown';

export interface IBundleIdempotency extends Document {
  scope: 'bundle-order.create' | 'bundle-refund.create';
  storefrontTenantId: Types.ObjectId;
  keyHash: string;
  requestHash: string;
  status: BundleIdempotencyStatus;
  resourceId?: Types.ObjectId;
  attempts: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  nextRetryAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const bundleIdempotencySchema = new Schema<IBundleIdempotency>(
  {
    scope: { type: String, enum: ['bundle-order.create', 'bundle-refund.create'], required: true },
    storefrontTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    keyHash: { type: String, required: true },
    requestHash: { type: String, required: true },
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed_retryable', 'failed_final', 'outcome_unknown'],
      default: 'processing',
      required: true,
      index: true,
    },
    resourceId: { type: Schema.Types.ObjectId },
    attempts: { type: Number, default: 1, min: 1, validate: Number.isSafeInteger },
    lastErrorCode: { type: String, maxlength: 120 },
    lastErrorMessage: { type: String, maxlength: 500 },
    nextRetryAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
bundleIdempotencySchema.index(
  { scope: 1, storefrontTenantId: 1, keyHash: 1 },
  { unique: true }
);
bundleIdempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const BundleIdempotency = mongoose.model<IBundleIdempotency>(
  'BundleIdempotency',
  bundleIdempotencySchema
);
