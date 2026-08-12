import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  BUNDLE_ORDER_STATUSES,
  COMPONENT_STATUSES,
  PAYMENT_STATUSES,
  SETTLEMENT_STATUSES,
  BundleOrderStatus,
  BundlePaymentStatus,
  BundleSettlementStatus,
  ComponentStatus,
} from '../bundles/domain';
import { GuestPricesMinor, GuestQuantities } from '../bundles/money';

export interface IBundleOrderComponent {
  componentId: string;
  supplyOfferId: Types.ObjectId;
  supplierTenantId: Types.ObjectId;
  attractionId: Types.ObjectId;
  attractionTitle: string;
  optionId: string;
  optionName: string;
  date: string;
  time?: string;
  quantities: GuestQuantities;
  supplierNetPricesMinor: GuestPricesMinor;
  supplierNetTotalMinor: number;
  customerAllocationMinor: number;
  status: ComponentStatus;
  settlementStatus: BundleSettlementStatus;
  bookingId?: Types.ObjectId;
  bookingReference?: string;
  refundedMinor: number;
}

export interface IBundleOrder extends Document {
  _id: Types.ObjectId;
  reference: string;
  storefrontTenantId: Types.ObjectId;
  /** Immutable checkout environment captured when the order is created. */
  checkoutMode?: 'test' | 'live';
  bundleDefinitionId: Types.ObjectId;
  bundleVersion: number;
  quoteId: Types.ObjectId;
  userId?: Types.ObjectId;
  guestDetails: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    country: string;
    specialRequests?: string;
  };
  status: BundleOrderStatus;
  paymentStatus: BundlePaymentStatus;
  components: IBundleOrderComponent[];
  currency: string;
  supplierTotalMinor: number;
  platformAllocationMinor: number;
  paymentFeeReserveMinor: number;
  taxMinor: number;
  totalMinor: number;
  refundedMinor: number;
  refundPendingMinor: number;
  holdExpiresAt: Date;
  stripePaymentIntentId?: string;
  paymentFailureReason?: string;
  idempotencyFingerprint: string;
  refunds: Array<{
    operationId: string;
    providerRefundId?: string;
    amountMinor: number;
    status: 'requested' | 'provider_pending' | 'succeeded' | 'failed';
    reason: string;
    requestedBy: Types.ObjectId;
    createdAt: Date;
  }>;
  recovery: {
    required: boolean;
    reason?: string;
    lastAttemptAt?: Date;
    attempts: number;
  };
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

const componentSchema = new Schema<IBundleOrderComponent>(
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
    quantities: {
      adults: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
      children: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
      infants: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    },
    supplierNetPricesMinor: { type: guestPricesSchema, required: true },
    supplierNetTotalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    customerAllocationMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    status: { type: String, enum: [...COMPONENT_STATUSES], default: 'reserved' },
    settlementStatus: { type: String, enum: [...SETTLEMENT_STATUSES], default: 'on_hold' },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    bookingReference: { type: String },
    refundedMinor: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  },
  { _id: false }
);

const bundleOrderSchema = new Schema<IBundleOrder>(
  {
    reference: { type: String, required: true, unique: true, index: true },
    storefrontTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    checkoutMode: { type: String, enum: ['test', 'live'], immutable: true },
    bundleDefinitionId: { type: Schema.Types.ObjectId, ref: 'BundleDefinition', required: true },
    bundleVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    quoteId: { type: Schema.Types.ObjectId, ref: 'BundleQuote', required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    guestDetails: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, required: true, trim: true },
      country: { type: String, required: true, trim: true },
      specialRequests: { type: String, trim: true, maxlength: 1000 },
    },
    status: { type: String, enum: [...BUNDLE_ORDER_STATUSES], default: 'reserved', index: true },
    paymentStatus: { type: String, enum: [...PAYMENT_STATUSES], default: 'not_started', index: true },
    components: { type: [componentSchema], required: true },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    supplierTotalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    platformAllocationMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    paymentFeeReserveMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    taxMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    totalMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    refundedMinor: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    refundPendingMinor: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    holdExpiresAt: { type: Date, required: true, index: true },
    stripePaymentIntentId: { type: String },
    paymentFailureReason: { type: String, maxlength: 500 },
    idempotencyFingerprint: { type: String, required: true },
    refunds: [{
      _id: false,
      operationId: { type: String, required: true },
      providerRefundId: { type: String },
      amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
      status: { type: String, enum: ['requested', 'provider_pending', 'succeeded', 'failed'], required: true },
      reason: { type: String, required: true, maxlength: 500 },
      requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      createdAt: { type: Date, default: Date.now },
    }],
    recovery: {
      required: { type: Boolean, default: false },
      reason: { type: String, maxlength: 500 },
      lastAttemptAt: { type: Date },
      attempts: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    },
  },
  { timestamps: true }
);

bundleOrderSchema.index(
  { stripePaymentIntentId: 1 },
  { unique: true, sparse: true }
);
bundleOrderSchema.index({ storefrontTenantId: 1, createdAt: -1, _id: -1 });
bundleOrderSchema.index({ 'components.supplierTenantId': 1, createdAt: -1, _id: -1 });
bundleOrderSchema.index({ status: 1, holdExpiresAt: 1 });
bundleOrderSchema.index({ userId: 1, createdAt: -1 });

export const BundleOrder = mongoose.model<IBundleOrder>('BundleOrder', bundleOrderSchema);
