import mongoose, { Schema } from 'mongoose';
import { IBooking } from '../types';
import { generateBookingReference } from '../utils/hash';

const bookingSchema = new Schema<IBooking>(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    attractionId: {
      type: Schema.Types.ObjectId,
      ref: 'Attraction',
      required: true,
    },
    items: [{
      optionId: { type: String, required: true },
      optionName: { type: String, required: true },
      date: { type: String, required: true },
      time: { type: String },
      quantities: {
        adults: { type: Number, required: true, min: 0 },
        children: { type: Number, required: true, min: 0 },
        infants: { type: Number, required: true, min: 0 },
      },
      unitPrice: { type: Number, required: true },
      totalPrice: { type: Number, required: true },
      // Which pricing tier was applied — only set when tenant has resident pricing enabled
      category: { type: String, enum: ['foreigner', 'resident'] },
      addons: [{
        id: { type: String },
        name: { type: String },
        price: { type: Number },
      }],
      // Hotel pickup details — only populated when the booked attraction
      // has `hasHotelPickup === true`. The operator uses these to dispatch
      // a pickup driver.
      hotelPickup: {
        hotelName: { type: String },
        roomNumber: { type: String },
        pickupTime: { type: String },
      },
    }],
    guestDetails: {
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      email: { type: String, required: true, lowercase: true },
      phone: { type: String, required: true },
      country: { type: String, required: true },
      specialRequests: { type: String },
    },
    subtotal: {
      type: Number,
      required: true,
    },
    fees: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      default: 'USD',
    },
    promoCode: {
      type: String,
    },
    paymentMethod: {
      type: String,
      enum: ['card', 'pay-later', 'cash'],
      default: 'pay-later',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'processing', 'succeeded', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed', 'refunded'],
      default: 'pending',
      index: true,
    },
    stripePaymentIntentId: {
      type: String,
    },
    paymentReconciliation: {
      source: {
        type: String,
        enum: ['legacy-import'],
      },
      reconciledAt: {
        type: Date,
      },
      note: {
        type: String,
        maxlength: 240,
      },
    },
    refundedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    refunds: [{
      providerRefundId: { type: String, required: true },
      amount: { type: Number, required: true, min: 0 },
      status: { type: String, enum: ['pending', 'succeeded', 'failed'], required: true },
      createdAt: { type: Date, default: Date.now },
    }],
    ticketPdfUrl: {
      type: String,
    },
    specialOfferId: {
      type: Schema.Types.ObjectId,
      ref: 'SpecialOffer',
    },
    // Reseller revenue split. Set only when isResale — i.e. the selling tenant
    // differs from the attraction's supplier tenant. Customer still pays `total`;
    // these fields just record who earns what for internal accounting.
    supplierTenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
    },
    sellerTenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
    },
    isResale: {
      type: Boolean,
      default: false,
    },
    revenueBreakdown: {
      commissionPercent: { type: Number },
      sellerEarnings: { type: Number },
      paymentFee: { type: Number },
      supplierEarnings: { type: Number },
    },
    // Manual settlement of the supplier's resale earnings. Only meaningful on
    // resale bookings; the supplier marks each as settled once paid out.
    settlementStatus: {
      type: String,
      enum: ['pending', 'settled'],
      default: 'pending',
      index: true,
    },
    settledAt: {
      type: Date,
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

bookingSchema.add({
  // Present only when this booking actually incremented an availability row.
  // Legacy bookings have no marker and therefore must not decrement inventory.
  inventoryReservedAt: {
    type: Date,
  },
  inventoryReservations: [{
    _id: false,
    date: { type: Date, required: true },
    time: { type: String },
    guests: { type: Number, required: true, min: 1 },
  }],
  // Makes inventory release idempotent across cancellation and payment-failure
  // cleanup paths.
  inventoryReleasedAt: {
    type: Date,
  },
} as any);

// Generate booking reference before saving
bookingSchema.pre('save', function (this: IBooking, next) {
  if (!this.reference) {
    this.reference = generateBookingReference();
  }
  next();
});

// Indexes for queries
bookingSchema.index({ 'guestDetails.email': 1 });
bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
// Reseller earnings lookups
bookingSchema.index({ supplierTenantId: 1, isResale: 1 });
bookingSchema.index({ sellerTenantId: 1, isResale: 1 });

export const Booking = mongoose.model<IBooking>('Booking', bookingSchema);
