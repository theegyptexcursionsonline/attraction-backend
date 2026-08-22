import mongoose, { Document, Schema, Types } from 'mongoose';

export type ContentPublicationStatus = 'processing' | 'completed' | 'failed_retryable';

export interface ContentPublicationResult {
  id: string;
  slug: string;
  liveUrl: string;
}

export interface IContentPublication extends Document {
  scope: 'blog.publish';
  tenantRef: Types.ObjectId;
  tenantId: string;
  idempotencyKey: string;
  requestHash: string;
  slug: string;
  status: ContentPublicationStatus;
  leaseId: string;
  leaseExpiresAt: Date;
  attempts: number;
  result?: ContentPublicationResult;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const contentPublicationSchema = new Schema<IContentPublication>(
  {
    scope: { type: String, enum: ['blog.publish'], required: true, immutable: true },
    tenantRef: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      immutable: true,
    },
    tenantId: { type: String, required: true, trim: true, immutable: true },
    idempotencyKey: { type: String, required: true, immutable: true },
    requestHash: { type: String, required: true, immutable: true },
    slug: { type: String, required: true, trim: true, immutable: true },
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed_retryable'],
      required: true,
      default: 'processing',
      index: true,
    },
    leaseId: { type: String, required: true },
    leaseExpiresAt: { type: Date, required: true, index: true },
    attempts: { type: Number, required: true, min: 1, default: 1 },
    result: {
      id: { type: String },
      slug: { type: String },
      liveUrl: { type: String },
    },
    lastErrorCode: { type: String, maxlength: 120 },
    lastErrorMessage: { type: String, maxlength: 500 },
  },
  {
    timestamps: true,
    versionKey: false,
    // Receiver indexes are an explicit production migration gate. Model
    // import/startup must never create or alter production collections.
    autoCreate: false,
    autoIndex: false,
  }
);

// One UUID has exactly one meaning for this receiver, across every tenant and
// every future content type. Reusing it for a different request is a conflict.
contentPublicationSchema.index({ idempotencyKey: 1 }, { unique: true });
contentPublicationSchema.index({ tenantRef: 1, slug: 1, createdAt: -1 });

export const ContentPublication = mongoose.model<IContentPublication>(
  'ContentPublication',
  contentPublicationSchema
);
