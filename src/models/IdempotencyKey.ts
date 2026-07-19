import mongoose, { Schema } from 'mongoose';

const idempotencyKeySchema = new Schema(
  {
    scope: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    keyHash: { type: String, required: true },
    requestHash: { type: String, required: true },
    status: {
      type: String,
      enum: ['processing', 'completed'],
      default: 'processing',
      required: true,
    },
    resourceId: { type: Schema.Types.ObjectId },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

idempotencyKeySchema.index({ scope: 1, tenantId: 1, keyHash: 1 }, { unique: true });
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);
