import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * Immutable operator audit for a dead-letter redrive.
 *
 * The compound unique index is the durable idempotency boundary: repeating the
 * same operation for the same outbox event replays the original result instead
 * of resetting the delivery attempt counter again.
 */
export interface IBundleOutboxRecovery extends Document {
  outboxEventId: Types.ObjectId;
  eventKey: string;
  orderId: Types.ObjectId;
  storefrontTenantId: Types.ObjectId;
  recipientTenantId: Types.ObjectId;
  operationId: string;
  actorId: Types.ObjectId;
  reason: string;
  attemptsBefore: number;
  errorBefore: string;
  createdAt: Date;
}

const bundleOutboxRecoverySchema = new Schema<IBundleOutboxRecovery>(
  {
    outboxEventId: {
      type: Schema.Types.ObjectId,
      ref: 'BundleOutboxEvent',
      required: true,
    },
    eventKey: { type: String, required: true, maxlength: 160 },
    orderId: { type: Schema.Types.ObjectId, ref: 'BundleOrder', required: true },
    storefrontTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    recipientTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    operationId: { type: String, required: true, maxlength: 128 },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, maxlength: 500 },
    attemptsBefore: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    errorBefore: { type: String, required: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

bundleOutboxRecoverySchema.index(
  { outboxEventId: 1, operationId: 1 },
  { unique: true }
);
bundleOutboxRecoverySchema.index({ storefrontTenantId: 1, createdAt: -1, _id: -1 });

export const BundleOutboxRecovery = mongoose.model<IBundleOutboxRecovery>(
  'BundleOutboxRecovery',
  bundleOutboxRecoverySchema
);
