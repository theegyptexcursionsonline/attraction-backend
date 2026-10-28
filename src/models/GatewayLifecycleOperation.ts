import mongoose, { Schema } from 'mongoose';

/** Durable, bounded 30-day recovery metadata; no credentials or provider headers. */
const schema=new Schema({
  _id:{type:String,required:true},domain:{type:String,required:true},tenantId:{type:Schema.Types.ObjectId,required:true},
  claimGeneration:{type:String,required:true},action:{type:String,required:true},proofHash:{type:String,required:true},
  resultState:{type:String,required:true},resultRevision:{type:Number,required:true},createdAt:{type:Date,required:true},expiresAt:{type:Date,required:true},
},{versionKey:false,strict:'throw'});
schema.index({expiresAt:1},{expireAfterSeconds:0});
export const GatewayLifecycleOperation=mongoose.model('GatewayLifecycleOperation',schema);
