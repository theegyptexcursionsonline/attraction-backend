import mongoose, { Schema, Types } from 'mongoose';
interface IDestinationTranslation { tenantId: Types.ObjectId; destinationId: Types.ObjectId; locale: 'de' | 'ru'; slug: string; status: 'draft' | 'published'; sourceUpdatedAt: Date; sourceSnapshot?: Record<string, unknown>; content: Record<string, unknown>; createdAt: Date; updatedAt: Date }
const schema = new Schema<IDestinationTranslation>({ tenantId: { type: Schema.Types.ObjectId, required: true, immutable: true }, destinationId: { type: Schema.Types.ObjectId, required: true, immutable: true }, locale: { type: String, enum: ['de','ru'], required: true, immutable: true }, slug: { type: String, required: true }, status: { type: String, enum: ['draft','published'], required: true, default: 'draft' }, sourceUpdatedAt: { type: Date, required: true }, sourceSnapshot: { type: Schema.Types.Mixed }, content: { type: Schema.Types.Mixed, required: true } }, { timestamps: true });
schema.index({ tenantId: 1, destinationId: 1, locale: 1 }, { unique: true });
schema.index({ tenantId: 1, locale: 1, slug: 1 }, { unique: true });
schema.index({ tenantId: 1, slug: 1, status: 1 });
export const DestinationTranslation = mongoose.model<IDestinationTranslation>('DestinationTranslation', schema);
