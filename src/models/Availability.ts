import mongoose, { Schema, Document } from 'mongoose';

export interface ITimeSlot {
  time: string;
  capacity: number;
  booked: number;
}

export interface IAvailability extends Document {
  attractionId: mongoose.Types.ObjectId;
  date: Date;
  timeSlots: ITimeSlot[];
  seedKey?: string;
  allDayCapacity?: number;
  allDayBooked?: number;
  isBlocked: boolean;
  blockReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const timeSlotSchema = new Schema<ITimeSlot>(
  {
    time: { type: String, required: true },
    capacity: { type: Number, required: true, min: 0 },
    booked: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false }
);

const availabilitySchema = new Schema<IAvailability>(
  {
    attractionId: {
      type: Schema.Types.ObjectId,
      ref: 'Attraction',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    timeSlots: [timeSlotSchema],
    seedKey: {
      type: String,
      trim: true,
      maxlength: 160,
    },
    allDayCapacity: {
      type: Number,
      min: 0,
    },
    allDayBooked: {
      type: Number,
      default: 0,
      min: 0,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockReason: {
      type: String,
      enum: ['maintenance', 'overbooking', 'weather', 'holiday', 'other'],
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

// Compound index for efficient queries
availabilitySchema.index({ attractionId: 1, date: 1 }, { unique: true });
availabilitySchema.index({ seedKey: 1 }, { unique: true, sparse: true });

export const Availability = mongoose.model<IAvailability>('Availability', availabilitySchema);
