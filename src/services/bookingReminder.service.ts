import { Types } from 'mongoose';
import { env } from '../config/env';
import { Booking } from '../models/Booking';
import { Tenant } from '../models/Tenant';
import { standaloneBookingClause } from './bookingRecordScope.service';
import {
  EmailTenant,
  emailSubject,
  getEmailBrand,
  renderDepartureReminder,
  renderTripThankYou,
  sendEmailOnce,
  unsubscribeTarget,
} from './email.service';

/**
 * Scheduled customer mail: the 24h departure reminder and the after-trip thank-you.
 *
 * Why this exists as a sweeper and not a route: the standard requires both messages, and a cron
 * ROUTE that nothing calls is the same defect as a missing template. This runs from the same
 * `startServer` interval block as the inventory and outbox sweeps, so it fires wherever the app
 * actually runs.
 *
 * Safety properties, all of them load-bearing:
 *  - OFF unless `BOOKING_REMINDERS_ENABLED=true`. This is real mail to real customers, so a
 *    deploy turns it on deliberately.
 *  - Send-once per booking per message, enforced by the unique EmailReceipt index — not by a
 *    timestamp window — so a restart, an overlapping sweep or a second replica cannot double-send.
 *  - The receipt is tenant-scoped and every booking is branded from its OWN tenant document,
 *    re-read per booking. One site's sweep can neither mail another site's customers nor render
 *    another site's brand.
 *  - Bounded work per tick (`BATCH`), cursor-free but capped, so it can never run away.
 *  - Bundle component bookings are excluded: the BundleOrder owns their notifications.
 */

const HOUR = 60 * 60 * 1000;
const BATCH = 100;

/** How far ahead a departure reminder looks. A 24h-before message, with slack for sweep cadence. */
const REMINDER_MIN_AHEAD = 20 * HOUR;
const REMINDER_MAX_AHEAD = 28 * HOUR;
/** How long after the trip the thank-you goes out, and how far back the sweep will reach. */
const THANKYOU_MIN_AGO = 6 * HOUR;
const THANKYOU_MAX_AGO = 72 * HOUR;

const TENANT_EMAIL_FIELDS =
  'name slug customDomain domainMigrated theme logo contactInfo defaultLanguage defaultCurrency timezone';

export interface ReminderSweepResult {
  remindersSent: number;
  thankYousSent: number;
  skipped: number;
}

interface SweepBooking {
  _id: Types.ObjectId;
  reference: string;
  tenantId: Types.ObjectId;
  guestDetails?: { email?: string; firstName?: string; lastName?: string };
  items?: Array<{ date?: string; time?: string; quantities?: { adults?: number; children?: number; infants?: number } }>;
  inventoryReservations?: Array<{ date?: Date; time?: string; guests?: number }>;
  attractionId?: Types.ObjectId;
}

/** The earliest reserved departure on a booking — the moment the customer actually travels. */
const departureAt = (booking: SweepBooking): Date | null => {
  const dates = (booking.inventoryReservations || [])
    .map((reservation) => reservation.date)
    .filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()));
  if (dates.length === 0) return null;
  return dates.reduce((earliest, date) => (date < earliest ? date : earliest));
};

const guestName = (booking: SweepBooking): string =>
  [booking.guestDetails?.firstName, booking.guestDetails?.lastName].filter(Boolean).join(' ').trim() || 'there';

const totalGuests = (booking: SweepBooking): number | undefined => {
  const sum = (booking.items || []).reduce((count, item) => {
    const q = item.quantities || {};
    return count + (q.adults || 0) + (q.children || 0) + (q.infants || 0);
  }, 0);
  return sum > 0 ? sum : undefined;
};

/**
 * A tenant document cache for one sweep pass. A batch is usually a handful of sites, and this
 * keeps the per-booking brand read from becoming N queries. Never shared between passes, so a
 * brand edit is picked up on the next tick.
 */
const tenantLoader = () => {
  const cache = new Map<string, (EmailTenant & { _id: Types.ObjectId }) | null>();
  return async (tenantId: Types.ObjectId): Promise<(EmailTenant & { _id: Types.ObjectId }) | null> => {
    const key = tenantId.toString();
    if (!cache.has(key)) {
      const tenant = await Tenant.findById(tenantId).select(TENANT_EMAIL_FIELDS).lean();
      cache.set(key, (tenant as unknown as (EmailTenant & { _id: Types.ObjectId })) || null);
    }
    return cache.get(key) || null;
  };
};

const attractionTitleFor = async (booking: SweepBooking): Promise<string> => {
  if (!booking.attractionId) return 'your experience';
  try {
    // Imported lazily: the reminder sweep is the only consumer and this keeps the module graph
    // free of a cycle through the attraction model's plugins.
    const { Attraction } = await import('../models/Attraction');
    const attraction = await Attraction.findById(booking.attractionId).select('title').lean();
    return (attraction as { title?: string } | null)?.title?.trim() || 'your experience';
  } catch {
    return 'your experience';
  }
};

const loadDueBookings = async (window: { from: Date; to: Date }): Promise<SweepBooking[]> =>
  Booking.find({
    ...standaloneBookingClause,
    status: 'confirmed',
    'inventoryReservations.date': { $gte: window.from, $lte: window.to },
  })
    .select('reference tenantId guestDetails items inventoryReservations attractionId')
    .sort({ _id: 1 })
    .limit(BATCH)
    .lean<SweepBooking[]>();

/**
 * One pass of both scheduled messages. Never throws: a failure on one booking must not stop the
 * rest of the batch, and the sweep must never take the server down.
 */
export const sweepBookingReminders = async (now: Date = new Date()): Promise<ReminderSweepResult> => {
  const result: ReminderSweepResult = { remindersSent: 0, thankYousSent: 0, skipped: 0 };
  if (!env.bookingRemindersEnabled) return result;

  const loadTenant = tenantLoader();

  const passes = [
    {
      kind: 'reminder' as const,
      window: { from: new Date(now.getTime() + REMINDER_MIN_AHEAD), to: new Date(now.getTime() + REMINDER_MAX_AHEAD) },
    },
    {
      kind: 'thankyou' as const,
      window: { from: new Date(now.getTime() - THANKYOU_MAX_AGO), to: new Date(now.getTime() - THANKYOU_MIN_AGO) },
    },
  ];

  for (const pass of passes) {
    let bookings: SweepBooking[] = [];
    try {
      bookings = await loadDueBookings(pass.window);
    } catch (error) {
      console.error('[booking-reminders] lookup failed', {
        pass: pass.kind,
        error: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
      });
      continue;
    }

    for (const booking of bookings) {
      try {
        const recipient = booking.guestDetails?.email?.trim();
        if (!recipient) {
          result.skipped += 1;
          continue;
        }
        // Re-check the exact departure: the window query matches on ANY reservation date, and a
        // multi-date booking must be judged on the departure the customer is actually travelling on.
        const departure = departureAt(booking);
        if (!departure) {
          result.skipped += 1;
          continue;
        }
        const delta = departure.getTime() - now.getTime();
        const due = pass.kind === 'reminder'
          ? delta >= REMINDER_MIN_AHEAD && delta <= REMINDER_MAX_AHEAD
          : -delta >= THANKYOU_MIN_AGO && -delta <= THANKYOU_MAX_AGO;
        if (!due) {
          result.skipped += 1;
          continue;
        }

        // Brand strictly from this booking's OWN tenant. No tenant, no email — never a fallback
        // to the platform brand on customer mail.
        const tenant = await loadTenant(booking.tenantId);
        if (!tenant) {
          result.skipped += 1;
          continue;
        }

        const brand = getEmailBrand(tenant);
        const title = await attractionTitleFor(booking);
        const item = (booking.items || [])[0] || {};

        if (pass.kind === 'reminder') {
          const { html, text } = renderDepartureReminder(brand, {
            reference: booking.reference,
            guestName: guestName(booking),
            attractionTitle: title,
            date: item.date || departure.toISOString().slice(0, 10),
            time: item.time,
            guests: totalGuests(booking),
          });
          const sent = await sendEmailOnce(
            {
              dedupeKey: `booking.reminder:${booking._id.toString()}`,
              eventType: 'booking.reminder',
              tenantId: booking.tenantId,
            },
            {
              to: recipient,
              subject: emailSubject('Tomorrow', title, booking.reference),
              html,
              text,
              tenant,
              category: 'reminder',
              unsubscribeUrl: unsubscribeTarget(brand, booking.reference),
            }
          );
          if (sent.status === 'sent') result.remindersSent += 1;
          else result.skipped += 1;
        } else {
          const { html, text } = renderTripThankYou(brand, {
            reference: booking.reference,
            guestName: guestName(booking),
            attractionTitle: title,
          });
          const sent = await sendEmailOnce(
            {
              dedupeKey: `booking.thankyou:${booking._id.toString()}`,
              eventType: 'booking.thankyou',
              tenantId: booking.tenantId,
            },
            {
              to: recipient,
              subject: emailSubject('Thank you for travelling with us', booking.reference),
              html,
              text,
              tenant,
              category: 'reminder',
              unsubscribeUrl: unsubscribeTarget(brand, booking.reference),
            }
          );
          if (sent.status === 'sent') result.thankYousSent += 1;
          else result.skipped += 1;
        }
      } catch (error) {
        result.skipped += 1;
        console.error('[booking-reminders] booking failed', {
          pass: pass.kind,
          tenantId: String(booking.tenantId),
          reference: booking.reference,
          error: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
        });
      }
    }
  }

  return result;
};
