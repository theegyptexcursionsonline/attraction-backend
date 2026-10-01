import mongoose, { Schema, Types } from 'mongoose';
export interface ITenantPresentationTranslation {
 tenantId: Types.ObjectId; kind: 'tenant' | 'page'; sourceId: Types.ObjectId;
 locale: 'ar' | 'de' | 'ru' | 'fr'; status: 'draft' | 'published';
 sourceSnapshot: Record<string, unknown>; content: Record<string, unknown>;
 revision: number; createdAt: Date; updatedAt: Date;
}
const schema = new Schema<ITenantPresentationTranslation>({
 tenantId: { type: Schema.Types.ObjectId, required:true, immutable:true, ref:'Tenant' },
 kind: { type:String, enum:['tenant','page'],required:true,immutable:true },
 sourceId: { type:Schema.Types.ObjectId,required:true,immutable:true },
 locale: { type:String,enum:['ar','de','ru','fr'],required:true,immutable:true },
 status:{type:String,enum:['draft','published'],required:true,default:'draft'},
 sourceSnapshot:{type:Schema.Types.Mixed,required:true},content:{type:Schema.Types.Mixed,required:true},
 revision:{type:Number,required:true,default:0,min:0,validate:Number.isSafeInteger},
},{timestamps:true,strict:'throw'});
schema.index({tenantId:1,kind:1,sourceId:1,locale:1},{unique:true});
schema.index({tenantId:1,kind:1,locale:1,status:1});
export const TenantPresentationTranslation = mongoose.model<ITenantPresentationTranslation>('TenantPresentationTranslation',schema);
