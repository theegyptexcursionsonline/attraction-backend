import mongoose, { Schema } from 'mongoose';
import { IWebhookEndpoint } from '../types';

const WEBHOOK_EVENT_TYPES = [
  'booking.created',
  'booking.confirmed',
  'booking.cancelled',
  'payment.succeeded',
  'payment.failed',
  'ticket.issued',
  'ping',
  '*',
];

/**
 * A TENANT-scoped outbound webhook subscription.
 *
 * Each endpoint carries its own HMAC `secret` (shown once on create) used to
 * sign the `X-Foxes-Signature` header. Endpoints are queried only ever by
 * `tenantId`, so one tenant can never receive another tenant's events.
 */
const webhookEndpointSchema = new Schema<IWebhookEndpoint>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    secret: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    events: {
      type: [String],
      enum: WEBHOOK_EVENT_TYPES,
      default: ['*'],
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    consecutiveFailures: {
      type: Number,
      default: 0,
    },
    disabledAt: {
      type: Date,
    },
    lastDeliveryAt: {
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
        // Secret is only returned explicitly on create — never in normal reads.
        delete obj.secret;
        delete obj.__v;
        return obj;
      },
    },
  }
);

// Selection query for emitEvent: enabled endpoints of a tenant subscribed to a type.
webhookEndpointSchema.index({ tenantId: 1, enabled: 1 });

export const WebhookEndpoint = mongoose.model<IWebhookEndpoint>(
  'WebhookEndpoint',
  webhookEndpointSchema
);
