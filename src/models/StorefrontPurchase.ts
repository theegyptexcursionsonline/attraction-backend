import mongoose, { Schema } from 'mongoose';
/** Dispatch claims suppress concurrent tabs. A lease permits recovery after a
 * crashed browser; replay retains the provider's purchase transaction_id.
 * dispatched means handed to the isolated browser receiver, not provider receipt.
 */
const schema = new Schema({
  _id: { type: String, required: true },
  tenantId: { type: Schema.Types.ObjectId, required: true },
  bookingId: { type: Schema.Types.ObjectId, required: true },
  transactionId: { type: String, required: true },
  status: { type: String, enum: ['claimed', 'dispatched'], required: true },
  claimTokenHash: { type: String, required: true },
  leaseUntil: { type: Date, required: true },
  dispatchedAt: Date,
}, { timestamps: true });
schema.index({ tenantId: 1, bookingId: 1 }, { unique: true });
export const StorefrontPurchase = mongoose.model('StorefrontPurchase', schema);
