import mongoose, { Schema, Document } from 'mongoose';

// An OCTO reservation "hold". OCTO reserves capacity BEFORE contact details are
// known (reserve → confirm), but our Booking model requires guestDetails up
// front — so a hold lives here and becomes a real Booking on confirm. Capacity
// is reserved against the Availability model at reserve time and released on
// cancel/expiry.
export interface IOctoHold extends Document {
  uuid: string;
  status: 'ON_HOLD' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
  tenantId: mongoose.Types.ObjectId; // reseller (the API key's tenant)
  supplierTenantId?: mongoose.Types.ObjectId; // attraction owner
  attractionId: mongoose.Types.ObjectId;
  productId: string;
  optionId: string;
  availabilityId: string;
  localDate: string; // YYYY-MM-DD
  startTime?: string | null; // HH:mm, null for all-day
  unitItems: { unitId: string; quantity: number; unitPriceMinor: number }[];
  currency: string;
  totalMinor: number;
  expiresAt?: Date;
  bookingId?: mongoose.Types.ObjectId; // set on confirm
  contact?: { firstName?: string; lastName?: string; emailAddress?: string; phoneNumber?: string };
  createdAt: Date;
  updatedAt: Date;
}

const octoHoldSchema = new Schema<IOctoHold>(
  {
    uuid: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['ON_HOLD', 'CONFIRMED', 'CANCELLED', 'EXPIRED'],
      default: 'ON_HOLD',
      index: true,
    },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    supplierTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    attractionId: { type: Schema.Types.ObjectId, ref: 'Attraction', required: true },
    productId: { type: String, required: true },
    optionId: { type: String, enum: ['DEFAULT'], default: 'DEFAULT' },
    availabilityId: { type: String, required: true },
    localDate: { type: String, required: true },
    startTime: { type: String, default: null },
    unitItems: {
      type: [{
        unitId: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
        unitPriceMinor: { type: Number, required: true, min: 1, validate: Number.isInteger },
      }],
      required: true,
      validate: {
        validator: (items: IOctoHold['unitItems']) =>
          items.length > 0 && new Set(items.map((item) => item.unitId)).size === items.length,
        message: 'unitItems must be non-empty and contain unique unit IDs',
      },
    },
    currency: { type: String, required: true, default: 'USD' },
    totalMinor: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    contact: {
      firstName: { type: String },
      lastName: { type: String },
      emailAddress: { type: String },
      phoneNumber: { type: String },
    },
  },
  { timestamps: true },
);

// Supports bounded scheduler sweeps without deleting unreleased holds.
octoHoldSchema.index({ status: 1, expiresAt: 1 });

export const OctoHold = mongoose.model<IOctoHold>('OctoHold', octoHoldSchema);
