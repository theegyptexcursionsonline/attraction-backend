import mongoose, { Schema } from 'mongoose';
import { IWebhookEvent } from '../types';

/**
 * Inbound-webhook idempotency ledger.
 *
 * A unique compound index on (provider, eventId) makes recording an inbound
 * provider event atomic: the second insert of the same event id throws a
 * duplicate-key error, which the receiver treats as "already processed" and
 * skips. Prevents double-fulfilment from provider retries (e.g. Stripe resends).
 */
const webhookEventSchema = new Schema<IWebhookEvent>(
  {
    provider: {
      type: String,
      required: true,
    },
    eventId: {
      type: String,
      required: true,
    },
    eventType: {
      type: String,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
    },
    receivedAt: {
      type: Date,
      default: Date.now,
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

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export const WebhookEvent = mongoose.model<IWebhookEvent>('WebhookEvent', webhookEventSchema);
