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
      enum: ['pending', 'processing', 'success', 'failed'],
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
    // Only new V1 deliveries are eligible for the durable worker. Historical
    // pending rows may already have reached a receiver and are never replayed.
    dispatchVersion: { type: Number, enum: [1] },
    eventCreatedAt: Date,
    leaseUntil: Date,
    leaseToken: String,
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
webhookDeliverySchema.index({ dispatchVersion: 1, status: 1, nextRetryAt: 1, _id: 1 });
webhookDeliverySchema.index({ dispatchVersion: 1, status: 1, leaseUntil: 1 });
webhookDeliverySchema.index({ tenantId: 1, endpointId: 1, eventId: 1 }, {
  unique: true, partialFilterExpression: { dispatchVersion: 1 },
});

export const WebhookDelivery = mongoose.model<IWebhookDelivery>(
  'WebhookDelivery',
  webhookDeliverySchema
);
