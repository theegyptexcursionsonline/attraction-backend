import mongoose, { Schema } from 'mongoose';
import { IWebhookDelivery } from '../types';

/**
 * The delivery log for one (event → endpoint) attempt set. TENANT-scoped so an
 * operator only ever sees deliveries for their own endpoints.
 */
const webhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    endpointId: {
      type: Schema.Types.ObjectId,
      ref: 'WebhookEndpoint',
      required: true,
      index: true,
    },
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    responseStatus: {
      type: Number,
    },
    responseBody: {
      type: String,
    },
    error: {
      type: String,
    },
    lastAttemptAt: {
      type: Date,
    },
    nextRetryAt: {
      type: Date,
    },
    deliveredAt: {
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

webhookDeliverySchema.index({ tenantId: 1, createdAt: -1 });
webhookDeliverySchema.index({ endpointId: 1, createdAt: -1 });

export const WebhookDelivery = mongoose.model<IWebhookDelivery>(
  'WebhookDelivery',
  webhookDeliverySchema
);
