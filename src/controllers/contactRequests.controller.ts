import { createHash } from 'crypto';
import { NextFunction, Response } from 'express';
import { z } from 'zod';
import { ContactMessage, ensureContactMessageIndexes, IContactMessage } from '../models/ContactMessage';
import { AuthRequest } from '../types';
import { flattenZodIssues } from '../middleware/validate.middleware';
import { sendError, sendSuccess } from '../utils/response';
import { CORAL_EXPERIENCES, CORAL_PICKUP_AREAS, CORAL_REQUEST_OPTIONS, isCoralRequestTenant } from '../utils/coralRequestPolicy';
import { contactSubmissionSchema, generateContactReference, isCalendarDate, isHoneypotFilled, storeContactMessage } from './contact.controller';

const EXPERIENCE_NAMES = { 'horse-riding': 'Horse riding', 'quad-safari': 'Quad safari', 'camel-riding': 'Camel riding' } as const;
const PICKUP_NAMES = { hurghada: 'Hurghada', 'sahl-hasheesh': 'Sahl Hasheesh', 'soma-bay': 'Soma Bay', 'makadi-bay': 'Makadi Bay' } as const;
const CAIRO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' });

export const coralRequestDateIsPast = (date: string, now = new Date()): boolean => date < CAIRO_DAY.format(now);

export const coralRequestSchema = contactSubmissionSchema.pick({ name: true, email: true, phone: true, website: true }).extend({
  requestId: z.string().uuid(),
  experience: z.enum(CORAL_EXPERIENCES),
  travelDate: z.string().refine(isCalendarDate, 'Travel date must be a valid YYYY-MM-DD date'),
  adults: z.number().int().min(1).max(60),
  children: z.number().int().min(0).max(59),
  pickupArea: z.enum(CORAL_PICKUP_AREAS),
  hotel: z.string().trim().min(1).max(160).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Hotel contains invalid characters'),
  // Leave room for the operator-readable request summary within the contact message limit.
  notes: z.string().trim().max(4000).optional().default(''),
  locale: z.enum(['en', 'ar', 'de', 'ru', 'fr']).optional().default('en'),
}).strict().refine(value => value.adults + value.children <= 60, { path: ['children'], message: 'A request can include at most 60 guests' });

type RequestInput = z.infer<typeof coralRequestSchema>;

const requestFingerprint = (input: RequestInput): string => createHash('sha256').update(JSON.stringify({
  name: input.name, email: input.email, phone: input.phone ?? '', experience: input.experience,
  travelDate: input.travelDate, adults: input.adults, children: input.children,
  pickupArea: input.pickupArea, hotel: input.hotel, notes: input.notes, locale: input.locale,
})).digest('hex');

const received = (res: Response, reference: string, statusCode: 200 | 201): void => {
  sendSuccess(res, { reference, received: true, kind: 'booking-request', status: 'received' }, 'Request received; your trip is not yet confirmed', statusCode);
};

const replay = (res: Response, existing: IContactMessage, fingerprint: string): void => {
  if (existing.requestDetails?.kind !== 'booking-request' || existing.requestFingerprint !== fingerprint) {
    sendError(res, 'This request id was already used for different details. Start a new request.', 409);
    return;
  }
  received(res, existing.reference, 200);
};

/** This is the request form's authority, not an availability, price or catalogue response. */
export const getContactRequestOptions = (req: AuthRequest, res: Response): void => {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!isCoralRequestTenant(req.tenant)) {
    sendError(res, 'Request form not found', 404);
    return;
  }
  sendSuccess(res, CORAL_REQUEST_OPTIONS);
};

/** A preference request, never a reservation: no inventory, price, booking, payment or email effects. */
export const submitContactRequest = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenant = req.tenant;
    if (!tenant || !isCoralRequestTenant(tenant)) {
      sendError(res, 'Request form not found', 404);
      return;
    }
    if (isHoneypotFilled(req.body)) {
      received(res, generateContactReference(), 201);
      return;
    }
    const parsed = coralRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'Invalid request details', 400, flattenZodIssues(parsed.error.issues));
      return;
    }
    const input = parsed.data;
    const fingerprint = requestFingerprint(input);
    const existing = await ContactMessage.findOne({ tenantId: tenant._id, requestId: input.requestId }).select('+requestFingerprint');
    // A stored receipt remains recoverable after midnight; only a new request is date-checked.
    if (existing) {
      replay(res, existing, fingerprint);
      return;
    }
    if (coralRequestDateIsPast(input.travelDate)) {
      sendError(res, 'Choose today or a later date', 400, [{ field: 'travelDate', message: 'Choose today or a later date' }]);
      return;
    }
    await ensureContactMessageIndexes();
    const stored = await storeContactMessage(tenant._id, {
      requestId: input.requestId, name: input.name, email: input.email, phone: input.phone,
      subject: `Booking request: ${EXPERIENCE_NAMES[input.experience]}`,
      travelDate: input.travelDate, guests: input.adults + input.children, locale: input.locale,
      message: [
        `Experience: ${EXPERIENCE_NAMES[input.experience]}`, `Preferred date: ${input.travelDate}`,
        `Adults: ${input.adults}; children: ${input.children}`,
        `Pickup area: ${PICKUP_NAMES[input.pickupArea]}`, `Hotel: ${input.hotel}`,
        ...(input.notes ? [`Notes: ${input.notes}`] : []),
        'Request only. Availability and arrangements are not confirmed. No payment taken.',
      ].join('\n'),
    }, {
      requestFingerprint: fingerprint,
      requestDetails: { kind: 'booking-request', experience: input.experience, adults: input.adults, children: input.children, pickupArea: input.pickupArea, hotel: input.hotel },
      delivery: { status: 'skipped', reason: 'tenant_store_only' },
    });
    if (stored.duplicate) {
      replay(res, stored.message, fingerprint);
      return;
    }
    console.info('[contact] request stored', { tenant: tenant.slug, reference: stored.message.reference, delivery: 'skipped' });
    received(res, stored.message.reference, 201);
  } catch (error) {
    next(error);
  }
};
