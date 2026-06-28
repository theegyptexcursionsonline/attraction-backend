import mongoose, { Schema } from 'mongoose';
import { IApiKey } from '../types';

/**
 * Programmatic, TENANT-scoped API key.
 *
 * Security model:
 *  - The plaintext key (`fxs_att_…`) is returned exactly once at creation time.
 *  - Only its sha256 hash is stored (`hashedKey`, unique). A leaked DB never
 *    exposes a usable credential.
 *  - Every key belongs to exactly one tenant; the auth middleware resolves the
 *    tenant FROM the key, so a key can never act across tenants.
 */
const apiKeySchema = new Schema<IApiKey>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    hashedKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    keyPrefix: {
      type: String,
      required: true,
    },
    scopes: {
      type: [String],
      enum: ['read', 'write', '*'],
      default: ['read', 'write'],
    },
    lastUsedAt: {
      type: Date,
    },
    revoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    revokedAt: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        const obj = ret as Record<string, unknown>;
        // Never leak the hash over the API.
        delete obj.hashedKey;
        delete obj.__v;
        return obj;
      },
    },
  }
);

// Fast lookup of a tenant's active keys.
apiKeySchema.index({ tenantId: 1, revoked: 1 });

export const ApiKey = mongoose.model<IApiKey>('ApiKey', apiKeySchema);
