import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IBundleOfferInventory extends Document {
  supplyOfferId: Types.ObjectId;
  date: Date;
  timeKey: string;
  capacity: number;
  reserved: number;
  createdAt: Date;
  updatedAt: Date;
}

const bundleOfferInventorySchema = new Schema<IBundleOfferInventory>(
  {
    supplyOfferId: { type: Schema.Types.ObjectId, ref: 'BundleSupplyOffer', required: true, index: true },
    date: { type: Date, required: true, index: true },
    timeKey: { type: String, required: true, default: 'all-day' },
    capacity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    reserved: { type: Number, required: true, default: 0, min: 0, validate: Number.isSafeInteger },
  },
  { timestamps: true }
);
bundleOfferInventorySchema.index(
  { supplyOfferId: 1, date: 1, timeKey: 1 },
  { unique: true }
);

export const BundleOfferInventory = mongoose.model<IBundleOfferInventory>(
  'BundleOfferInventory',
  bundleOfferInventorySchema
);
