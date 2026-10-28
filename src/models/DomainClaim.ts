import mongoose, { Schema, Types } from 'mongoose';

export interface IDomainClaim {
  _id: string;
  tenantId: Types.ObjectId;
  provider?: 'cloudflare';
  kind?: 'alias';
  primaryDomain?: string;
  claimGeneration?: string;
  gatewayState?: 'reserved' | 'staged' | 'active' | 'unverified' | 'rolled_back';
  gatewayPreviousEmailDomain?: string|null;
  gatewayPreviousEmailDomainPresent?: boolean;
  gatewayPreviousEmailState?: string|null;
  gatewayPreviousEmailStatePresent?: boolean;
  gatewayPreviousEmailManaged?: boolean|null;
  gatewayPreviousEmailManagedPresent?: boolean;
  gatewayRollbackTarget?: string;
  gatewayRoutePolicyFingerprint?: string;
  gatewayRollbackReceipt?: string;
  gatewayVerifiedAt?: Date;
  gatewayOriginal?: {
    claimWasExisting:boolean;
    providerPresent:boolean; providerValue?:string|null;
    generationPresent:boolean; generationValue?:string|null;
    customDomainPresent:boolean; customDomainValue?:string|null;
    statusPresent:boolean; statusValue?:string|null;
    migratedPresent:boolean; migratedValue?:boolean|null;
    lastChangedByPresent:boolean; lastChangedByValue?:Types.ObjectId|null;
  };
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const domainClaimSchema = new Schema<IDomainClaim>(
  {
    _id: { type: String, lowercase: true, trim: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    provider: { type: String, enum: ['cloudflare'] },
    kind: { type: String, enum: ['alias'] },
    primaryDomain: { type: String, lowercase: true, trim: true },
    claimGeneration: { type: String },
    gatewayState: { type: String, enum: ['reserved', 'staged', 'active', 'unverified', 'rolled_back'] },
    gatewayPreviousEmailDomain: { type: String },
    gatewayPreviousEmailDomainPresent: { type: Boolean },
    gatewayPreviousEmailState: { type: String },
    gatewayPreviousEmailStatePresent: { type: Boolean },
    gatewayPreviousEmailManaged: { type: Boolean },
    gatewayPreviousEmailManagedPresent: { type: Boolean },
    gatewayRollbackTarget: { type: String },
    gatewayRoutePolicyFingerprint: { type: String },
    gatewayRollbackReceipt: { type: String, maxlength: 65_536 },
    gatewayVerifiedAt: { type: Date },
    gatewayOriginal: {
      type: new Schema({
        claimWasExisting:{type:Boolean,required:true},
        providerPresent:{type:Boolean,required:true},providerValue:{type:String},
        generationPresent:{type:Boolean,required:true},generationValue:{type:String},
        customDomainPresent:{type:Boolean,required:true},customDomainValue:{type:String},
        statusPresent:{type:Boolean,required:true},statusValue:{type:String},
        migratedPresent:{type:Boolean,required:true},migratedValue:{type:Boolean},
        lastChangedByPresent:{type:Boolean,required:true},lastChangedByValue:{type:Schema.Types.ObjectId},
      },{_id:false}),
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const DomainClaim = mongoose.model<IDomainClaim>('DomainClaim', domainClaimSchema);
