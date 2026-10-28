import mongoose, { Schema } from 'mongoose';

/** Durable scoped web-only evidence, retained after a claim is released. */
const schema=new Schema({
  _id:{type:String,required:true},domain:{type:String,required:true},tenantId:{type:Schema.Types.ObjectId,required:true},
  claimGeneration:{type:String,required:true},rollbackReceipt:{type:String,required:true,maxlength:65_536},
  rollbackHash:{type:String,required:true},routePolicyFingerprint:{type:String,required:true},
  original:{type:Schema.Types.Mixed,required:true},detachedAt:{type:Date,required:true},
},{versionKey:false,strict:'throw'});
export const GatewayLifecycleArchive=mongoose.model('GatewayLifecycleArchive',schema);
