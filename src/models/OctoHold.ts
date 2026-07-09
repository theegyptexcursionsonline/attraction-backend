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
    optionId: { type: String, default: 'DEFAULT' },
    availabilityId: { type: String, required: true },
    localDate: { type: String, required: true },
    startTime: { type: String, default: null },
    unitItems: [
      {
        unitId: { type: String, required: true },
        quantity: { type: Number, required: true, min: 0 },
        unitPriceMinor: { type: Number, required: true, min: 0 },
      },
    ],
    currency: { type: String, required: true, default: 'USD' },
    totalMinor: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date },
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

export const OctoHold = mongoose.model<IOctoHold>('OctoHold', octoHoldSchema);
