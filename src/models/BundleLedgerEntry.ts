import mongoose, { Document, Schema, Types } from 'mongoose';

export type BundleLedgerAccount =
  | 'customer_receivable'
  | 'cash_collected'
  | 'supplier_payable'
  | 'platform_revenue'
  | 'payment_fee_reserve'
  | 'tax_payable'
  | 'customer_refund'
  | 'supplier_settlement';

export interface IBundleLedgerEntry extends Document {
  orderId: Types.ObjectId;
  operationId: string;
  account: BundleLedgerAccount;
  direction: 'debit' | 'credit';
  amountMinor: number;
  currency: string;
  storefrontTenantId: Types.ObjectId;
  supplierTenantId?: Types.ObjectId;
  componentId?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const bundleLedgerEntrySchema = new Schema<IBundleLedgerEntry>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'BundleOrder', required: true, index: true },
    operationId: { type: String, required: true },
    account: {
      type: String,
      enum: ['customer_receivable', 'cash_collected', 'supplier_payable', 'platform_revenue', 'payment_fee_reserve', 'tax_payable', 'customer_refund', 'supplier_settlement'],
      required: true,
    },
    direction: { type: String, enum: ['debit', 'credit'], required: true },
    amountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    storefrontTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    supplierTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    componentId: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);
bundleLedgerEntrySchema.index(
  { orderId: 1, operationId: 1, account: 1, supplierTenantId: 1, componentId: 1 },
  { unique: true }
);
bundleLedgerEntrySchema.index({ supplierTenantId: 1, createdAt: -1, _id: -1 });

export const BundleLedgerEntry = mongoose.model<IBundleLedgerEntry>(
  'BundleLedgerEntry',
  bundleLedgerEntrySchema
);
