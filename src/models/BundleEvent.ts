import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IBundleEvent extends Document {
  aggregateType: 'supply_offer' | 'bundle' | 'order' | 'component' | 'settlement';
  aggregateId: Types.ObjectId;
  sequence: number;
  storefrontTenantId?: Types.ObjectId;
  supplierTenantId?: Types.ObjectId;
  actorType: 'user' | 'guest' | 'stripe' | 'scheduler' | 'system';
  actorId?: Types.ObjectId;
  actorTenantId?: Types.ObjectId;
  command: string;
  fromState?: string;
  toState?: string;
  reason?: string;
  correlationId?: string;
  idempotencyKeyHash?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const bundleEventSchema = new Schema<IBundleEvent>(
  {
    aggregateType: { type: String, enum: ['supply_offer', 'bundle', 'order', 'component', 'settlement'], required: true },
    aggregateId: { type: Schema.Types.ObjectId, required: true },
    sequence: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    storefrontTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    supplierTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    actorType: { type: String, enum: ['user', 'guest', 'stripe', 'scheduler', 'system'], required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    command: { type: String, required: true, maxlength: 120 },
    fromState: { type: String },
    toState: { type: String },
    reason: { type: String, maxlength: 500 },
    correlationId: { type: String, maxlength: 160 },
    idempotencyKeyHash: { type: String, maxlength: 128 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

bundleEventSchema.index({ aggregateId: 1, sequence: 1 }, { unique: true });
bundleEventSchema.index({ storefrontTenantId: 1, createdAt: -1 });
bundleEventSchema.index({ supplierTenantId: 1, createdAt: -1 });

export const BundleEvent = mongoose.model<IBundleEvent>('BundleEvent', bundleEventSchema);
