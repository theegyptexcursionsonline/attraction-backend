import mongoose, { Schema, Document } from 'mongoose';

export interface IPromoCode extends Document {
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  currency: string;
  minOrderAmount: number;
  maxDiscount?: number;
  usageLimit: number;
  usageCount: number;
  validFrom: Date;
  validUntil: Date;
  tenantId?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const promoCodeSchema = new Schema<IPromoCode>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'EGP',
      uppercase: true,
      trim: true,
    },
    minOrderAmount: {
      type: Number,
      default: 0,
    },
    maxDiscount: {
      type: Number,
    },
    usageLimit: {
      type: Number,
      required: true,
      default: 100,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    validFrom: {
      type: Date,
      required: true,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        const obj = ret as Record<string, unknown>;
        delete obj.__v;
        return obj;
      },
    },
  }
);

promoCodeSchema.index({ tenantId: 1, code: 1 });
promoCodeSchema.index({ currency: 1, isActive: 1, validFrom: 1, validUntil: 1 });

export const PromoCode = mongoose.model<IPromoCode>('PromoCode', promoCodeSchema);
