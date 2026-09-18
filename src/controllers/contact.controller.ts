import { randomInt } from 'crypto';
import { Response, NextFunction } from 'express';
import { FilterQuery, Types, UpdateQuery } from 'mongoose';
import { z, ZodIssue } from 'zod';
import {
  CONTACT_FIELD_LIMITS,
  CONTACT_MESSAGE_STATUSES,
  ContactMessage,
  ContactMessageStatus,
  IContactDelivery,
  IContactMessage,
  ensureContactMessageIndexes,
} from '../models/ContactMessage';
import { sendContactFormEmail, sendEnquiryReceivedEmail, EmailTenant } from '../services/email.service';
import { AuthRequest } from '../types';
import { flattenZodIssues } from '../middleware/validate.middleware';
import { sendError, sendSuccess } from '../utils/response';
import { callerTenantIds, isSuperAdmin } from '../utils/tenantScope';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const PHONE_PATTERN = /^[0-9+()\-\s.]+$/;
const LOCALE_PATTERN = /^[A-Za-z0-9_-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Characters that have no place in a single-line form value (tabs and newlines
// are only legitimate inside the free-text message).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

// Forms routinely submit "" or null for fields the visitor left empty.
const blankToUndefined = (value: unknown): unknown =>
  value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value;

const singleLineText = (label: string, max: number) =>
  z
    .string({ invalid_type_error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .refine((value) => !CONTROL_CHARACTERS.test(value), `${label} contains invalid characters`);

const optionalSingleLine = (label: string, max: number) =>
  z.preprocess(blankToUndefined, singleLineText(label, max).optional());

const requiredSingleLine = (label: string, max: number) =>
  z.preprocess(
    blankToUndefined,
    z
      .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
      .trim()
      .min(1, `${label} is required`)
      .max(max, `${label} must be at most ${max} characters`)
      .refine((value) => !CONTROL_CHARACTERS.test(value), `${label} contains invalid characters`)
  );

export const isCalendarDate = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const sharedSubmissionFields = {
  requestId: z.preprocess(
    blankToUndefined,
    z.string({ invalid_type_error: 'requestId must be a UUID' }).trim().uuid('requestId must be a UUID').optional()
  ),
  email: z.preprocess(
    blankToUndefined,
    z
      .string({ required_error: 'Email is required', invalid_type_error: 'Email must be text' })
      .trim()
      .toLowerCase()
      .max(CONTACT_FIELD_LIMITS.email, 'Email is too long')
      .regex(EMAIL_PATTERN, 'A valid email address is required')
  ),
  phone: z.preprocess(
    blankToUndefined,
    z
      .string({ invalid_type_error: 'Phone must be text' })
      .trim()
      .max(CONTACT_FIELD_LIMITS.phone, `Phone must be at most ${CONTACT_FIELD_LIMITS.phone} characters`)
      .regex(PHONE_PATTERN, 'Phone may only contain digits, spaces and + ( ) - .')
      .optional()
  ),
  subject: optionalSingleLine('Subject', CONTACT_FIELD_LIMITS.subject),
  tourSlug: optionalSingleLine('Tour', CONTACT_FIELD_LIMITS.tourSlug),
  tourTitle: optionalSingleLine('Tour title', CONTACT_FIELD_LIMITS.tourTitle),
  travelDate: z.preprocess(
    blankToUndefined,
    z
      .string({ invalid_type_error: 'Travel date must be YYYY-MM-DD' })
      .trim()
      .refine(isCalendarDate, 'Travel date must be a valid YYYY-MM-DD date')
      .optional()
  ),
  guests: z.preprocess(
    (value) => {
      const blank = blankToUndefined(value);
      return typeof blank === 'string' && /^\s*\d+\s*$/.test(blank) ? Number(blank) : blank;
    },
    z
      .number({ invalid_type_error: 'Guests must be a whole number' })
      .int('Guests must be a whole number')
      .min(CONTACT_FIELD_LIMITS.guestsMin, `Guests must be between ${CONTACT_FIELD_LIMITS.guestsMin} and ${CONTACT_FIELD_LIMITS.guestsMax}`)
      .max(CONTACT_FIELD_LIMITS.guestsMax, `Guests must be between ${CONTACT_FIELD_LIMITS.guestsMin} and ${CONTACT_FIELD_LIMITS.guestsMax}`)
      .optional()
  ),
  message: z.preprocess(
    blankToUndefined,
    z
      .string({ required_error: 'Message is required', invalid_type_error: 'Message must be text' })
      .trim()
      .min(1, 'Message is required')
      .max(CONTACT_FIELD_LIMITS.message, `Message must be at most ${CONTACT_FIELD_LIMITS.message} characters`)
  ),
  pagePath: optionalSingleLine('Page', CONTACT_FIELD_LIMITS.pagePath),
  locale: z.preprocess(
    blankToUndefined,
    z
      .string({ invalid_type_error: 'Locale must be text' })
      .trim()
      .max(CONTACT_FIELD_LIMITS.locale, 'Locale is too long')
      .regex(LOCALE_PATTERN, 'Locale is invalid')
      .optional()
  ),
  // Honeypot. A filled string is answered before validation; declared here so a
  // non-string value is rejected rather than silently ignored.
  website: z.preprocess(blankToUndefined, z.string({ invalid_type_error: 'Invalid contact form data' }).optional()),
};

/** Current enquiry form: a single name field plus optional tour context. */
export const contactSubmissionSchema = z.object({
  ...sharedSubmissionFields,
  name: requiredSingleLine('Name', CONTACT_FIELD_LIMITS.name),
});

/** Older site designs still post first/last name and a required subject. */
export const legacyContactSubmissionSchema = z
  .object({
    ...sharedSubmissionFields,
    firstName: requiredSingleLine('First name', 80),
    lastName: requiredSingleLine('Last name', 80),
    subject: requiredSingleLine('Subject', CONTACT_FIELD_LIMITS.subject),
  })
  .refine((value) => `${value.firstName} ${value.lastName}`.length <= CONTACT_FIELD_LIMITS.name, {
    message: `Name must be at most ${CONTACT_FIELD_LIMITS.name} characters`,
    path: ['lastName'],
  });

export interface ContactSubmission {
  requestId?: string;
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
}

type ParseResult =
  | { success: true; data: ContactSubmission }
  | { success: false; errors: Array<{ field: string; message: string }> };

const failure = (issues: ZodIssue[]): ParseResult => ({ success: false, errors: flattenZodIssues(issues) });

export const parseContactSubmission = (body: unknown): ParseResult => {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!input) return { success: false, errors: [{ field: '', message: 'Invalid contact form data' }] };

  const hasName = blankToUndefined(input.name) !== undefined;
  const isLegacy = !hasName && (input.firstName !== undefined || input.lastName !== undefined);
  if (isLegacy) {
    const parsed = legacyContactSubmissionSchema.safeParse(input);
    if (!parsed.success) return failure(parsed.error.issues);
    const { firstName, lastName, website: _website, ...rest } = parsed.data;
    return { success: true, data: { ...rest, name: `${firstName} ${lastName}` } as ContactSubmission };
  }

  const parsed = contactSubmissionSchema.safeParse(input);
  if (!parsed.success) return failure(parsed.error.issues);
  const { website: _website, ...rest } = parsed.data;
  return { success: true, data: rest as ContactSubmission };
};

export const isHoneypotFilled = (body: unknown): boolean => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const website = (body as Record<string, unknown>).website;
  return typeof website === 'string' && website.trim() !== '';
};

const objectIdString = z
  .string()
  .trim()
  .regex(OBJECT_ID_PATTERN, 'Must be a valid id')
  .transform((value) => value.toLowerCase());

export const contactMessageListQuerySchema = z.object({
  tenantId: objectIdString,
  status: z.enum([...CONTACT_MESSAGE_STATUSES, 'all']).default('new'),
  cursor: objectIdString.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ContactMessageListQuery = z.infer<typeof contactMessageListQuerySchema>;

export const contactMessageStatusUpdateSchema = z.object({
  status: z.enum(CONTACT_MESSAGE_STATUSES),
});

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

// Neutral prefix: the same inbox serves every brand. Crockford base32: uppercase, no I/L/O/U, so a reference read aloud or copied
// by hand is unambiguous.
const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CONTACT_REFERENCE_PREFIX = 'MSG-';
export const CONTACT_REFERENCE_PATTERN = /^MSG-[0-9A-HJKMNP-TV-Z]{6}$/;
const MAX_REFERENCE_ATTEMPTS = 5;

export const generateContactReference = (): string => {
  let suffix = '';
  for (let index = 0; index < 6; index += 1) {
    suffix += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return `${CONTACT_REFERENCE_PREFIX}${suffix}`;
};

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

type ContactMessageRecord = Pick<
  IContactMessage,
  | '_id'
  | 'reference'
  | 'name'
  | 'email'
  | 'phone'
  | 'subject'
  | 'tourSlug'
  | 'tourTitle'
  | 'travelDate'
  | 'guests'
  | 'message'
  | 'pagePath'
  | 'locale'
  | 'status'
  | 'handledAt'
  | 'delivery'
  | 'createdAt'
>;

export const serializeContactMessage = (doc: ContactMessageRecord) => ({
  id: String(doc._id),
  reference: doc.reference,
  name: doc.name,
  email: doc.email,
  phone: doc.phone ?? null,
  subject: doc.subject ?? null,
  tourSlug: doc.tourSlug ?? null,
  tourTitle: doc.tourTitle ?? null,
  travelDate: doc.travelDate ?? null,
  guests: doc.guests ?? null,
  message: doc.message,
  pagePath: doc.pagePath ?? null,
  locale: doc.locale ?? null,
  status: doc.status,
  handledAt: doc.handledAt ?? null,
  delivery: {
    status: doc.delivery?.status ?? 'pending',
    reason: doc.delivery?.reason ?? null,
    sentAt: doc.delivery?.sentAt ?? null,
  },
  createdAt: doc.createdAt,
});

// ---------------------------------------------------------------------------
// Public submission
// ---------------------------------------------------------------------------

const respondReceived = (res: Response, reference: string, statusCode: 200 | 201): void => {
  sendSuccess(res, { reference, received: true }, 'Message received', statusCode);
};

const isDuplicateKeyError = (error: unknown): boolean =>
  !!error && typeof error === 'object' && (error as { code?: unknown }).code === 11000;

const redactProviderError = (error: unknown): Record<string, unknown> => {
  if (!(error instanceof Error)) return { name: typeof error };
  const status = (error as { status?: unknown }).status;
  return {
    name: error.name,
    ...(typeof status === 'number' ? { status } : {}),
    message: error.message.replace(/[^\s@<>]+@[^\s@<>]+/g, '[email]').slice(0, 200),
  };
};

const storeContactMessage = async (
  tenantId: Types.ObjectId,
  submission: ContactSubmission
): Promise<{ message: IContactMessage; duplicate: boolean }> => {
  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
    try {
      const message = await ContactMessage.create({
        ...submission,
        tenantId,
        reference: generateContactReference(),
        status: 'new',
        delivery: { status: 'pending' },
      });
      return { message, duplicate: false };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      // Either this request key was already stored (retry / double-submit /
      // concurrent submit) or the random reference collided. Re-read by key to
      // tell them apart; a collision simply retries with a fresh reference.
      if (submission.requestId) {
        const existing = await ContactMessage.findOne({ tenantId, requestId: submission.requestId });
        if (existing) return { message: existing, duplicate: true };
      }
    }
  }
  throw new Error('Could not allocate a unique contact message reference');
};

const deliverContactMessage = async (
  tenant: EmailTenant & { _id: Types.ObjectId; slug?: string },
  message: IContactMessage
): Promise<IContactDelivery> => {
  const attemptedAt = new Date();
  let delivery: IContactDelivery;
  try {
    const outcome = await sendContactFormEmail(tenant, {
      reference: message.reference,
      name: message.name,
      email: message.email,
      phone: message.phone,
      subject: message.subject,
      tourSlug: message.tourSlug,
      tourTitle: message.tourTitle,
      travelDate: message.travelDate,
      guests: message.guests,
      message: message.message,
      pagePath: message.pagePath,
      locale: message.locale,
    });
    delivery =
      outcome.status === 'sent'
        ? { status: 'sent', attemptedAt, sentAt: new Date() }
        : { status: outcome.status, reason: outcome.reason, attemptedAt };
    if (outcome.status !== 'sent') {
      console.warn('[contact] enquiry stored without an email notification', {
        tenant: tenant.slug,
        reference: message.reference,
        delivery: outcome.status,
        reason: outcome.reason,
      });
    }
  } catch (error) {
    console.error('[contact] enquiry email notification failed', {
      tenant: tenant.slug,
      reference: message.reference,
      error: redactProviderError(error),
    });
    delivery = { status: 'failed', reason: 'provider_error', attemptedAt };
  }

  try {
    const result = await ContactMessage.updateOne(
      { _id: message._id, tenantId: tenant._id, 'delivery.status': 'pending' },
      { $set: { delivery } }
    );
    if (result.matchedCount !== 1) {
      console.warn('[contact] delivery outcome not recorded: message no longer pending', {
        tenant: tenant.slug,
        reference: message.reference,
      });
    }
  } catch (error) {
    // The enquiry itself is stored; a failed bookkeeping write must not tell the
    // visitor their message was lost. It stays visible as "pending" in the inbox.
    console.error('[contact] could not record delivery outcome', {
      tenant: tenant.slug,
      reference: message.reference,
      error: redactProviderError(error),
    });
  }
  return delivery;
};

export const submitContactMessage = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenant = req.tenant;
    if (!tenant) {
      sendError(res, 'Tenant context required', 400);
      return;
    }

    if (isHoneypotFilled(req.body)) {
      console.info('[contact] discarded honeypot submission', { tenant: tenant.slug });
      respondReceived(res, generateContactReference(), 201);
      return;
    }

    const parsed = parseContactSubmission(req.body);
    if (!parsed.success) {
      sendError(res, 'Invalid contact form data', 400, parsed.errors);
      return;
    }

    // The idempotency guard is the unique index; it must exist before any write.
    await ensureContactMessageIndexes();
    const stored = await storeContactMessage(tenant._id, parsed.data);
    if (stored.duplicate) {
      respondReceived(res, stored.message.reference, 200);
      return;
    }

    const delivery = await deliverContactMessage(tenant, stored.message);

    // Acknowledge to the visitor, so they have their reference and proof the message landed.
    // Awaited like the operator notification above (same request budget, same rate limit) so the
    // outcome is deterministic, and fully guarded so it can never fail a stored enquiry.
    // Deduped on the stored reference, so a retried submission cannot mail the visitor twice.
    try {
      await sendEnquiryReceivedEmail(tenant, {
        reference: stored.message.reference,
        name: stored.message.name,
        email: stored.message.email,
        phone: stored.message.phone,
        subject: stored.message.subject,
        tourSlug: stored.message.tourSlug,
        tourTitle: stored.message.tourTitle,
        travelDate: stored.message.travelDate,
        guests: stored.message.guests,
        message: stored.message.message,
        locale: stored.message.locale,
      });
    } catch (error) {
      console.error('[contact] visitor acknowledgement failed', {
        tenant: tenant.slug,
        reference: stored.message.reference,
        error: redactProviderError(error),
      });
    }

    console.info('[contact] enquiry stored', {
      tenant: tenant.slug,
      reference: stored.message.reference,
      delivery: delivery.status,
    });
    respondReceived(res, stored.message.reference, 201);
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Admin inbox
// ---------------------------------------------------------------------------

const canReadTenantInbox = (req: AuthRequest, tenantId: string): boolean => {
  if (!req.user) return false;
  if (isSuperAdmin(req.user)) return true;
  return callerTenantIds(req.user).some((assigned) => assigned.toLowerCase() === tenantId);
};

const tenantScopeFilter = (req: AuthRequest): FilterQuery<IContactMessage> | null => {
  if (!req.user) return null;
  if (isSuperAdmin(req.user)) return {};
  const tenantIds = callerTenantIds(req.user).filter((id) => OBJECT_ID_PATTERN.test(id));
  return tenantIds.length ? { tenantId: { $in: tenantIds } } : null;
};

const countByStatus = async (tenantId: Types.ObjectId): Promise<Record<ContactMessageStatus, number>> => {
  const [newCount, handledCount, archivedCount] = await Promise.all(
    CONTACT_MESSAGE_STATUSES.map((status) => ContactMessage.countDocuments({ tenantId, status }))
  );
  return { new: newCount, handled: handledCount, archived: archivedCount };
};

export const listContactMessages = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { tenantId, status, cursor, limit } = req.query as unknown as ContactMessageListQuery;
    if (!canReadTenantInbox(req, tenantId)) {
      sendError(res, 'Access denied to this tenant', 403);
      return;
    }

    const tenantObjectId = new Types.ObjectId(tenantId);
    const filter: FilterQuery<IContactMessage> = {
      tenantId: tenantObjectId,
      // "all" stays on the (tenantId, status, _id) index via an $in merge sort.
      status: status === 'all' ? { $in: [...CONTACT_MESSAGE_STATUSES] } : status,
    };
    if (cursor) filter._id = { $lt: new Types.ObjectId(cursor) };

    const [rows, counts] = await Promise.all([
      ContactMessage.find(filter).sort({ _id: -1 }).limit(limit + 1).lean<ContactMessageRecord[]>(),
      countByStatus(tenantObjectId),
    ]);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    sendSuccess(
      res,
      {
        messages: page.map(serializeContactMessage),
        nextCursor: hasMore ? String(page[page.length - 1]._id) : null,
        counts,
      },
      'Messages retrieved'
    );
  } catch (error) {
    next(error);
  }
};

const MAX_STATUS_WRITE_ATTEMPTS = 3;

export const updateContactMessageStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = String(req.params.id || '');
    const scope = tenantScopeFilter(req);
    // Malformed ids, unassigned callers and foreign messages are indistinguishable.
    if (!OBJECT_ID_PATTERN.test(id) || !scope) {
      sendError(res, 'Message not found', 404);
      return;
    }

    const target = (req.body as z.infer<typeof contactMessageStatusUpdateSchema>).status;
    const scopedFilter: FilterQuery<IContactMessage> = { _id: new Types.ObjectId(id), ...scope };

    for (let attempt = 0; attempt < MAX_STATUS_WRITE_ATTEMPTS; attempt += 1) {
      const current = await ContactMessage.findOne(scopedFilter).lean<ContactMessageRecord>();
      if (!current) {
        sendError(res, 'Message not found', 404);
        return;
      }
      if (current.status === target) {
        sendSuccess(res, serializeContactMessage(current), 'Message updated');
        return;
      }

      let update: UpdateQuery<IContactMessage>;
      if (target === 'handled') {
        update = req.user?._id
          ? { $set: { status: target, handledAt: new Date(), handledBy: req.user._id } }
          : { $set: { status: target, handledAt: new Date() }, $unset: { handledBy: 1 } };
      } else if (target === 'new') {
        update = { $set: { status: target }, $unset: { handledAt: 1, handledBy: 1 } };
      } else {
        update = { $set: { status: target } };
      }

      // Compare-and-set on the status we read, so a concurrent change is never
      // silently overwritten with stale handled metadata.
      const updated = await ContactMessage.findOneAndUpdate(
        { ...scopedFilter, status: current.status },
        update,
        { new: true, runValidators: true }
      ).lean<ContactMessageRecord>();
      if (updated) {
        sendSuccess(res, serializeContactMessage(updated), 'Message updated');
        return;
      }
    }

    sendError(res, 'This message was changed by someone else. Refresh and try again.', 409);
  } catch (error) {
    next(error);
  }
};
