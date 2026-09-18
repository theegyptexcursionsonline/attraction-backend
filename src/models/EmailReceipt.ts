import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * One row per (tenant, event, recipient) transactional email.
 *
 * The standard requires an event-triggered email to be sent once per event, with a stored
 * receipt, so a retry never sends twice (EMAIL-DESIGN-STANDARD §4). The guarantee IS the
 * unique (tenantId, dedupeKey) index: the sender claims the row BEFORE calling the provider,
 * and a duplicate-key error means another attempt already owns the send.
 *
 * The key is tenant-scoped so one site's reminder job can never suppress — or be suppressed
 * by — another site's mail for a record with a colliding id.
 */
export interface IEmailReceipt extends Document {
  tenantId: Types.ObjectId | null;
  /** Stable per event, e.g. `booking.reminder:<bookingId>` — never includes the address. */
  dedupeKey: string;
  /** Template/event name, for operator diagnostics. */
  eventType: string;
  /** SHA-256 of the lowercased recipient. Never the address itself (§4: no full address in logs). */
  recipientHash: string;
  status: 'claimed' | 'sent' | 'skipped' | 'failed';
  attempts: number;
  lastError?: string;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const emailReceiptSchema = new Schema<IEmailReceipt>(
  {
    // Platform-level mail (no tenant) stores null and still dedupes, because the
    // partial-free compound index treats null as a value.
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    dedupeKey: { type: String, required: true, maxlength: 200 },
    eventType: { type: String, required: true, maxlength: 120 },
    recipientHash: { type: String, required: true, maxlength: 64 },
    status: { type: String, enum: ['claimed', 'sent', 'skipped', 'failed'], default: 'claimed', index: true },
    attempts: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    lastError: { type: String, maxlength: 1000 },
    sentAt: { type: Date },
  },
  { timestamps: true }
);

// The send-once guarantee.
emailReceiptSchema.index({ tenantId: 1, dedupeKey: 1 }, { unique: true });
// Operator lookups ("did this booking's reminder go out?") and retention sweeps.
emailReceiptSchema.index({ tenantId: 1, eventType: 1, _id: -1 });
emailReceiptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 400 });

export const EmailReceipt = mongoose.model<IEmailReceipt>('EmailReceipt', emailReceiptSchema);

let indexesReady: Promise<void> | null = null;

/**
 * Builds the model's indexes once per process before the first claim.
 *
 * `autoIndex` is off on this deployment, so the unique index the idempotency guarantee depends
 * on must be created explicitly — a claim that runs before it exists is a coin flip, not a guard.
 * `createIndexes` is a no-op once they exist; a failure clears the cache so the next call retries.
 */
export const ensureEmailReceiptIndexes = (): Promise<void> => {
  if (!indexesReady) {
    indexesReady = EmailReceipt.createIndexes()
      .then(() => undefined)
      .catch((error) => {
        indexesReady = null;
        throw error;
      });
  }
  return indexesReady;
};
