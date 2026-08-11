import mongoose, { Document, Schema, Types } from 'mongoose';

export type ImageGenerationJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface IImageGenerationJob extends Document {
  _id: Types.ObjectId;
  requestedBy: Types.ObjectId;
  prompt: string;
  size: '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
  quality: 'low' | 'medium' | 'high' | 'auto';
  folder: string;
  status: ImageGenerationJobStatus;
  attempts: number;
  leaseExpiresAt?: Date;
  error?: string;
  result?: {
    url: string;
    publicId: string;
    width?: number;
    height?: number;
  };
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const imageGenerationJobSchema = new Schema<IImageGenerationJob>(
  {
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    prompt: { type: String, required: true, maxlength: 1200 },
    size: {
      type: String,
      enum: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
      default: '1536x1024',
    },
    quality: {
      type: String,
      enum: ['low', 'medium', 'high', 'auto'],
      default: 'high',
    },
    folder: { type: String, required: true, maxlength: 80 },
    status: {
      type: String,
      enum: ['queued', 'processing', 'succeeded', 'failed'],
      default: 'queued',
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    leaseExpiresAt: { type: Date },
    error: { type: String, maxlength: 500 },
    result: {
      url: { type: String },
      publicId: { type: String },
      width: { type: Number },
      height: { type: Number },
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

imageGenerationJobSchema.index({ status: 1, leaseExpiresAt: 1, createdAt: 1 });
imageGenerationJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ImageGenerationJob = mongoose.model<IImageGenerationJob>(
  'ImageGenerationJob',
  imageGenerationJobSchema
);
