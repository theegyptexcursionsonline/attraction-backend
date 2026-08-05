import mongoose, { Schema, Types } from 'mongoose';

export interface IDomainClaim {
  _id: string;
  tenantId: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const domainClaimSchema = new Schema<IDomainClaim>(
  {
    _id: { type: String, lowercase: true, trim: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const DomainClaim = mongoose.model<IDomainClaim>('DomainClaim', domainClaimSchema);
