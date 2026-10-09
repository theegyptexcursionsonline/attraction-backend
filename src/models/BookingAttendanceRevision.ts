import mongoose, { Schema } from 'mongoose';

// Append-only attendance history is committed with the booking CAS. No payment or
// traveller data belongs in this administrative correction log.
const schema = new Schema({
  bookingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  tenantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  revision: { type: Number, required: true, immutable: true },
  previousStatus: { type: String, enum: ['not-recorded', 'no-show'], required: true, immutable: true },
  attendanceStatus: { type: String, enum: ['not-recorded', 'no-show'], required: true, immutable: true },
  actorId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false });
schema.index({ bookingId: 1, revision: 1 }, { unique: true });
export const BookingAttendanceRevision = mongoose.model('BookingAttendanceRevision', schema);
