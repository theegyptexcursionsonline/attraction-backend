import mongoose, { Document, Schema, Types } from 'mongoose';
import { BUNDLE_STATUSES, BundleStatus } from '../bundles/domain';
import { GuestPricesMinor } from '../bundles/money';

export interface IBundleComponentSnapshot {
  componentId: string;
  supplyOfferId: Types.ObjectId;
  supplyOfferVersion: number;
  supplierTenantId: Types.ObjectId;
  attractionId: Types.ObjectId;
  attractionTitle: string;
  supplierNetPricesMinor: GuestPricesMinor;
  optionIds: string[];
  entryWindowLabels: string[];
  dayNumber: number;
  startTime?: string;
  sortOrder: number;
}

export interface IBundleDefinition extends Document {
  _id: Types.ObjectId;
  storefrontTenantId: Types.ObjectId;
  slug: string;
  version: number;
  previousVersionId?: Types.ObjectId;
  status: BundleStatus;
  title: string;
  shortDescription: string;
  description: string;
  images: string[];
  area: string;
  category: string;
  currency: string;
  customerPricesMinor: GuestPricesMinor;
  platformFeeReserveMinor: number;
  taxReserveMinor: number;
  components: IBundleComponentSnapshot[];
  policies: {
    cancellation: string;
    refund: string;
    substitution: string;
    promoStacking: false;
  };
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  approvedAt?: Date;
  approvedBy?: Types.ObjectId;
  publishedAt?: Date;
  suspendedAt?: Date;
  suspensionReason?: string;
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
const componentSchema = new Schema<IBundleComponentSnapshot>(
  {
    componentId: { type: String, required: true, trim: true },
    supplyOfferId: { type: Schema.Types.ObjectId, ref: 'BundleSupplyOffer', required: true },
    supplyOfferVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    supplierTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    attractionId: { type: Schema.Types.ObjectId, ref: 'Attraction', required: true },
    attractionTitle: { type: String, required: true, trim: true },
    supplierNetPricesMinor: { type: guestPricesSchema, required: true },
    optionIds: { type: [String], required: true },
    entryWindowLabels: { type: [String], default: [] },
    dayNumber: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    startTime: { type: String, trim: true },
    sortOrder: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  },
  { _id: false }
);

const bundleDefinitionSchema = new Schema<IBundleDefinition>(
  {
    storefrontTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    previousVersionId: { type: Schema.Types.ObjectId, ref: 'BundleDefinition' },
    status: { type: String, enum: [...BUNDLE_STATUSES], default: 'draft', index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    shortDescription: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    images: { type: [String], default: [] },
    area: { type: String, required: true, trim: true, index: true },
    category: { type: String, required: true, trim: true, index: true },
    currency: { type: String, required: true, uppercase: true, trim: true, minlength: 3, maxlength: 3 },
    customerPricesMinor: { type: guestPricesSchema, required: true },
    platformFeeReserveMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    taxReserveMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    components: {
      type: [componentSchema],
      required: true,
      validate: [
        (components: IBundleComponentSnapshot[]) => components.length >= 3 && components.length <= 4,
        'A bundle must contain three or four components',
      ],
    },
    policies: {
      cancellation: { type: String, required: true, trim: true, maxlength: 1000 },
      refund: { type: String, required: true, trim: true, maxlength: 1000 },
      substitution: { type: String, required: true, trim: true, maxlength: 1000 },
      promoStacking: { type: Boolean, enum: [false], default: false },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    publishedAt: { type: Date },
    suspendedAt: { type: Date },
    suspensionReason: { type: String, trim: true, maxlength: 500 },
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

bundleDefinitionSchema.index(
  { storefrontTenantId: 1, slug: 1, version: 1 },
  { unique: true }
);
bundleDefinitionSchema.index({ storefrontTenantId: 1, status: 1, createdAt: -1 });
bundleDefinitionSchema.index({ storefrontTenantId: 1, status: 1, area: 1, category: 1, createdAt: -1 });
bundleDefinitionSchema.index(
  { storefrontTenantId: 1, slug: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'published' } }
);

export const BundleDefinition = mongoose.model<IBundleDefinition>(
  'BundleDefinition',
  bundleDefinitionSchema
);
