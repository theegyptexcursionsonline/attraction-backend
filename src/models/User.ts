import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser, INTERFACE_LOCALES } from '../types';
import { revokeUserSessions } from '../utils/session';
import { ADMIN_SECTIONS } from '../utils/sectionAccess';

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    avatar: {
      type: String,
    },
    role: {
      type: String,
      enum: ['super-admin', 'brand-admin', 'manager', 'editor', 'viewer', 'customer', 'guest'],
      default: 'customer',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending', 'suspended'],
      default: 'active',
    },
    phone: {
      type: String,
    },
    country: {
      type: String,
    },
    language: {
      type: String,
      default: 'en',
    },
    interfaceLocale: {
      type: String,
      enum: INTERFACE_LOCALES,
      required: true,
      default: 'en',
    },
    currency: {
      type: String,
      default: 'USD',
    },
    assignedTenants: [{
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
    }],
    // Admin sections this team member may open (tours, attractions, packages, bundles).
    // Unset means every section the member's brands have switched on; super-admins ignore it.
    sectionAccess: {
      type: [{ type: String, enum: ADMIN_SECTIONS }],
      default: undefined,
    },
    wishlist: [{
      type: Schema.Types.ObjectId,
      ref: 'Attraction',
    }],
    loyaltyPoints: {
      type: Number,
      default: 0,
    },
    totalBookings: {
      type: Number,
      default: 0,
    },
    totalSpent: {
      type: Number,
      default: 0,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecretEnc: {
      type: String,
      select: false,
    },
    twoFactorPendingSecretEnc: {
      type: String,
      select: false,
    },
    twoFactorSetupExpires: {
      type: Date,
      select: false,
    },
    twoFactorLastUsedStep: {
      type: Number,
      select: false,
    },
    twoFactorRecoveryCodeHashes: [{
      type: String,
      select: false,
    }],
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        const obj = ret as Record<string, unknown>;
        delete obj.password;
        delete obj.refreshToken;
        delete obj.passwordResetToken;
        delete obj.passwordResetExpires;
        delete obj.tokenVersion;
        delete obj.twoFactorSecretEnc;
        delete obj.twoFactorPendingSecretEnc;
        delete obj.twoFactorSetupExpires;
        delete obj.twoFactorLastUsedStep;
        delete obj.twoFactorRecoveryCodeHashes;
        delete obj.__v;
        // Old accounts require no migration; expose a validated default on reads.
        obj.interfaceLocale = INTERFACE_LOCALES.some(locale => locale === obj.interfaceLocale)
          ? obj.interfaceLocale : 'en';
        return obj;
      },
    },
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  try {
    if (!this.isNew) revokeUserSessions(this);
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Index for better query performance
userSchema.index({ role: 1, status: 1 });
userSchema.index({ email: 'text', firstName: 'text', lastName: 'text' });

export const User = mongoose.model<IUser>('User', userSchema);
