import mongoose, { Schema } from 'mongoose';

interface GatewayLifecycleNonce { _id:string; expiresAt:Date; action?:string; proofHash?:string; domain?:string; tenantId?:string; resultRevision?:number; restoredLegacyClaim?:boolean }
const schema = new Schema<GatewayLifecycleNonce>({
  _id: {type:String, required:true},
  expiresAt: {type:Date, required:true},
  action:{type:String},proofHash:{type:String},domain:{type:String},tenantId:{type:String},resultRevision:{type:Number},restoredLegacyClaim:{type:Boolean},
}, {versionKey:false});
schema.index({expiresAt:1},{expireAfterSeconds:0});
export const GatewayLifecycleNonce = mongoose.model<GatewayLifecycleNonce>('GatewayLifecycleNonce',schema);
