import mongoose, { Document, Schema, Types } from 'mongoose';
import { SUPPLY_OFFER_STATUSES, SupplyOfferStatus } from '../bundles/domain';
import { GuestPricesMinor } from '../bundles/money';

export interface IBundleSupplyOffer extends Document {
  _id: Types.ObjectId;
  supplierTenantId: Types.ObjectId;
  attractionId: Types.ObjectId;
  version: number;
  previousVersionId?: Types.ObjectId;
  status: SupplyOfferStatus;
  currency: string;
  supplierNetPricesMinor: GuestPricesMinor;
  optionIds: string[];
  entryWindowLabels: string[];
  capacityPerDeparture: number;
  validTravelFrom: Date;
  validTravelTo: Date;
  salesStartsAt?: Date;
  salesEndsAt?: Date;
  blackoutDates: Date[];
  leadTimeHours: number;
  cancellationPolicy: string;
  termsVersion: string;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  submittedAt?: Date;
  approvedAt?: Date;
  approvedBy?: Types.ObjectId;
  rejectionReason?: string;
  pausedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const guestPricesSchema = new Schema<GuestPricesMinor>(
  {
    adult: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    child: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    infant: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  },
  { _id: false }
);
const bundleSupplyOfferSchema = new Schema<IBundleSupplyOffer>(
  {
    supplierTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    attractionId: { type: Schema.Types.ObjectId, ref: 'Attraction', required: true, index: true },
    version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    previousVersionId: { type: Schema.Types.ObjectId, ref: 'BundleSupplyOffer' },
    status: { type: String, enum: [...SUPPLY_OFFER_STATUSES], default: 'draft', index: true },
    currency: { type: String, required: true, uppercase: true, trim: true, minlength: 3, maxlength: 3 },
    supplierNetPricesMinor: { type: guestPricesSchema, required: true },
    optionIds: {
      type: [String],
      required: true,
      validate: [(value: string[]) => value.length > 0, 'At least one option is required'],
    },
    entryWindowLabels: { type: [String], default: [] },
    capacityPerDeparture: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },
    validTravelFrom: { type: Date, required: true },
    validTravelTo: { type: Date, required: true },
    salesStartsAt: { type: Date },
    salesEndsAt: { type: Date },
    blackoutDates: { type: [Date], default: [] },
    leadTimeHours: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    cancellationPolicy: { type: String, required: true, trim: true, maxlength: 1000 },
    termsVersion: { type: String, required: true, trim: true, maxlength: 80 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    submittedAt: { type: Date },
    approvedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    pausedReason: { type: String, trim: true, maxlength: 500 },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    versionKey: 'revision',
    toJSON: {
      transform: (_doc, ret) => {
        const value = ret as Record<string, unknown>;
        delete value.__v;
        return value;
      },
    },
  }
);

bundleSupplyOfferSchema.index(
  { supplierTenantId: 1, attractionId: 1, version: 1 },
  { unique: true }
);
bundleSupplyOfferSchema.index({ supplierTenantId: 1, status: 1, createdAt: -1 });
bundleSupplyOfferSchema.index({ attractionId: 1, status: 1, validTravelTo: 1 });
bundleSupplyOfferSchema.index(
  { supplierTenantId: 1, attractionId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

export const BundleSupplyOffer = mongoose.model<IBundleSupplyOffer>(
  'BundleSupplyOffer',
  bundleSupplyOfferSchema
);
