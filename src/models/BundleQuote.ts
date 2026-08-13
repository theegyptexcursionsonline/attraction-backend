import mongoose, { Document, Schema, Types } from 'mongoose';
import { GuestPricesMinor, GuestQuantities } from '../bundles/money';

export interface IBundleQuoteSelection {
  componentId: string;
  supplyOfferId: Types.ObjectId;
  supplierTenantId: Types.ObjectId;
  attractionId: Types.ObjectId;
  attractionTitle: string;
  optionId: string;
  optionName: string;
  date: string;
  time?: string;
  supplierNetPricesMinor: GuestPricesMinor;
  supplierNetTotalMinor: number;
  customerAllocationMinor: number;
}

export interface IBundleQuote extends Document {
  _id: Types.ObjectId;
  reference: string;
  storefrontTenantId: Types.ObjectId;
  checkoutMode: 'test' | 'live';
  bundleDefinitionId: Types.ObjectId;
  bundleVersion: number;
  requestFingerprint: string;
  quantities: GuestQuantities;
  selections: IBundleQuoteSelection[];
  currency: string;
  customerPricesMinor: GuestPricesMinor;
  supplierTotalMinor: number;
  platformAllocationMinor: number;
  paymentFeeReserveMinor: number;
  taxMinor: number;
  totalMinor: number;
  expiresAt: Date;
  status: 'active' | 'consumed' | 'expired';
  consumedByOrderId?: Types.ObjectId;
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

const quoteSelectionSchema = new Schema<IBundleQuoteSelection>(
  {
    componentId: { type: String, required: true },
    supplyOfferId: { type: Schema.Types.ObjectId, ref: 'BundleSupplyOffer', required: true },
    supplierTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    attractionId: { type: Schema.Types.ObjectId, ref: 'Attraction', required: true },
    attractionTitle: { type: String, required: true },
    optionId: { type: String, required: true },
    optionName: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String },
    supplierNetPricesMinor: { type: guestPricesSchema, required: true },
    supplierNetTotalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    customerAllocationMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  },
  { _id: false }
);

const bundleQuoteSchema = new Schema<IBundleQuote>(
  {
    reference: { type: String, required: true, unique: true, index: true },
    storefrontTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    checkoutMode: { type: String, enum: ['test', 'live'], required: true, immutable: true },
    bundleDefinitionId: { type: Schema.Types.ObjectId, ref: 'BundleDefinition', required: true },
    bundleVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    requestFingerprint: { type: String, required: true },
    quantities: {
      adults: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
      children: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
      infants: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    },
    selections: { type: [quoteSelectionSchema], required: true },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    customerPricesMinor: { type: guestPricesSchema, required: true },
    supplierTotalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    platformAllocationMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    paymentFeeReserveMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    taxMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    totalMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ['active', 'consumed', 'expired'], default: 'active', index: true },
    consumedByOrderId: { type: Schema.Types.ObjectId, ref: 'BundleOrder' },
  },
  { timestamps: true }
);

bundleQuoteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
bundleQuoteSchema.index({ storefrontTenantId: 1, status: 1, createdAt: -1 });

export const BundleQuote = mongoose.model<IBundleQuote>('BundleQuote', bundleQuoteSchema);
