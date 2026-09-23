import mongoose, { Schema, Types } from 'mongoose';
export interface IAttractionTranslation { tenantId: Types.ObjectId; attractionId: Types.ObjectId; locale: 'de' | 'ru'; slug: string; status: 'draft' | 'published'; sourceUpdatedAt: Date; content: Record<string, unknown>; createdAt: Date; updatedAt: Date }
const schema = new Schema<IAttractionTranslation>({ tenantId: { type: Schema.Types.ObjectId, required: true, ref: 'Tenant', immutable: true }, attractionId: { type: Schema.Types.ObjectId, required: true, ref: 'Attraction', immutable: true }, locale: { type: String, enum: ['de', 'ru'], required: true, immutable: true }, slug: { type: String, required: true }, status: { type: String, enum: ['draft', 'published'], default: 'draft', required: true }, sourceUpdatedAt: { type: Date, required: true }, content: { type: Schema.Types.Mixed, required: true } }, { timestamps: true });
schema.index({ tenantId: 1, attractionId: 1, locale: 1 }, { unique: true });
schema.index({ tenantId: 1, slug: 1 }, { unique: true });
schema.index({ tenantId: 1, locale: 1, status: 1, attractionId: 1 });
export const AttractionTranslation = mongoose.model<IAttractionTranslation>('AttractionTranslation', schema);
