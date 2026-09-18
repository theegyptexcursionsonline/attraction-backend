import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A visitor enquiry sent through a site's contact or tour enquiry form.
 *
 * The message is stored BEFORE any email is attempted, so an unconfigured mail
 * provider or a site without a contact inbox can never lose an enquiry. The
 * delivery sub-document records what happened to the operator notification.
 */
export const CONTACT_MESSAGE_STATUSES = ['new', 'handled', 'archived'] as const;
export type ContactMessageStatus = (typeof CONTACT_MESSAGE_STATUSES)[number];

export const CONTACT_DELIVERY_STATUSES = ['pending', 'sent', 'skipped', 'failed'] as const;
export type ContactDeliveryStatus = (typeof CONTACT_DELIVERY_STATUSES)[number];

// Short machine codes only — raw provider text never reaches the database.
// `non_production_no_qa_inbox`: a staging/dev run refused to mail a real visitor because no QA
// inbox is configured. Recorded rather than silently dropped, so an operator can see why.
export const CONTACT_DELIVERY_REASONS = ['no_recipient', 'provider_not_configured', 'non_production_no_qa_inbox', 'provider_error'] as const;
export type ContactDeliveryReason = (typeof CONTACT_DELIVERY_REASONS)[number];

export const CONTACT_FIELD_LIMITS = {
  name: 120,
  email: 254,
  phone: 40,
  subject: 160,
  tourSlug: 200,
  tourTitle: 200,
  message: 5000,
  pagePath: 300,
  locale: 10,
  guestsMin: 1,
  guestsMax: 60,
} as const;

export interface IContactDelivery {
  status: ContactDeliveryStatus;
  reason?: ContactDeliveryReason;
  attemptedAt?: Date;
  sentAt?: Date;
}

export interface IContactMessage extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  requestId?: string;
  reference: string;
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  tourSlug?: string;
  tourTitle?: string;
  travelDate?: string;
  guests?: number;
  message: string;
  pagePath?: string;
  locale?: string;
  status: ContactMessageStatus;
  handledAt?: Date;
  handledBy?: Types.ObjectId;
  delivery: IContactDelivery;
  createdAt: Date;
  updatedAt: Date;
}

const deliverySchema = new Schema<IContactDelivery>(
  {
    status: { type: String, enum: CONTACT_DELIVERY_STATUSES, required: true, default: 'pending' },
    reason: { type: String, enum: CONTACT_DELIVERY_REASONS },
    attemptedAt: { type: Date },
    sentAt: { type: Date },
  },
  { _id: false }
);

const contactMessageSchema = new Schema<IContactMessage>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    requestId: { type: String, trim: true, maxlength: 64 },
    reference: { type: String, required: true, trim: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: CONTACT_FIELD_LIMITS.name },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: CONTACT_FIELD_LIMITS.email },
    phone: { type: String, trim: true, maxlength: CONTACT_FIELD_LIMITS.phone },
    subject: { type: String, trim: true, maxlength: CONTACT_FIELD_LIMITS.subject },
    tourSlug: { type: String, trim: true, maxlength: CONTACT_FIELD_LIMITS.tourSlug },
    tourTitle: { type: String, trim: true, maxlength: CONTACT_FIELD_LIMITS.tourTitle },
    travelDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    guests: { type: Number, min: CONTACT_FIELD_LIMITS.guestsMin, max: CONTACT_FIELD_LIMITS.guestsMax },
    message: { type: String, required: true, trim: true, minlength: 1, maxlength: CONTACT_FIELD_LIMITS.message },
    pagePath: { type: String, trim: true, maxlength: CONTACT_FIELD_LIMITS.pagePath },
    locale: { type: String, trim: true, maxlength: CONTACT_FIELD_LIMITS.locale },
    status: { type: String, enum: CONTACT_MESSAGE_STATUSES, required: true, default: 'new' },
    handledAt: { type: Date },
    handledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    delivery: { type: deliverySchema, required: true, default: () => ({ status: 'pending' }) },
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

// A client retry or double-submit carrying the same idempotency key maps to one
// stored message. Only string keys participate, so legacy forms without a key
// are never deduplicated against each other.
contactMessageSchema.index(
  { tenantId: 1, requestId: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } }
);
contactMessageSchema.index({ tenantId: 1, reference: 1 }, { unique: true });
// Inbox listing: newest first per status, cursor on _id.
contactMessageSchema.index({ tenantId: 1, status: 1, _id: -1 });

export const ContactMessage = mongoose.model<IContactMessage>('ContactMessage', contactMessageSchema);

let indexesReady: Promise<void> | null = null;

/**
 * Builds the model's indexes once per process before the first write.
 *
 * The idempotency guarantee IS the unique (tenantId, requestId) index, so a write
 * must never run before it exists. `createIndexes` is a no-op when the indexes are
 * already present. A failed attempt is not memoised, so a transient database error
 * does not permanently disable the contact form until the next restart.
 */
export const ensureContactMessageIndexes = (): Promise<void> => {
  if (!indexesReady) {
    indexesReady = ContactMessage.createIndexes()
      .then(() => undefined)
      .catch((error: unknown) => {
        indexesReady = null;
        throw error;
      });
  }
  return indexesReady;
};
