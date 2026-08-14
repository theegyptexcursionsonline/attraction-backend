import { Types } from 'mongoose';
import { env } from '../config/env';
import { generateBundleAccessToken } from '../bundles/guestAccess';
import { BundleOrder } from '../models/BundleOrder';
import { BundleOutboxEvent } from '../models/BundleOutboxEvent';
import { BundleOutboxRecovery } from '../models/BundleOutboxRecovery';
import { Tenant } from '../models/Tenant';
import { appendBundleEvent } from './bundleAudit.service';
import { runBundleTransaction } from './bundleInventory.service';
import {
  brandedLink,
  escapeEmailHtml,
  getEmailBrand,
  sendEmail,
} from './email.service';

const MAX_ATTEMPTS = 8;

export class BundleOutboxRecoveryError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export interface BundleOutboxDeadLetterDto {
  id: string;
  eventId: string;
  orderId: string;
  storefrontTenantId: string;
  recipientTenantId: string;
  audience: 'customer' | 'supplier' | 'storefront';
  eventType: string;
  status: string;
  attempts: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DeadLetterAggregateRow {
  _id: Types.ObjectId;
  eventId: string;
  orderId: Types.ObjectId;
  storefrontTenantId: Types.ObjectId;
  tenantId: Types.ObjectId;
  audience: BundleOutboxDeadLetterDto['audience'];
  eventType: string;
  status: string;
  attempts: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const deadLetterDto = (row: DeadLetterAggregateRow): BundleOutboxDeadLetterDto => ({
  id: row._id.toString(),
  eventId: row.eventId,
  orderId: row.orderId.toString(),
  storefrontTenantId: row.storefrontTenantId.toString(),
  recipientTenantId: row.tenantId.toString(),
  audience: row.audience,
  eventType: row.eventType,
  status: row.status,
  attempts: row.attempts,
  lastError: row.lastError,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const listBundleOutboxDeadLetters = async (input: {
  storefrontTenantId: string;
  cursor?: string;
  limit: number;
}): Promise<{
  data: BundleOutboxDeadLetterDto[];
  pageInfo: { hasMore: boolean; nextCursor: string | null };
}> => {
  const rows = await BundleOutboxEvent.aggregate<DeadLetterAggregateRow>([
    {
      $match: {
        $or: [
          { status: 'dead_letter' },
          { manualRecoveryRequired: true },
        ],
        orderId: { $exists: true },
        ...(input.cursor ? { _id: { $lt: new Types.ObjectId(input.cursor) } } : {}),
      },
    },
    {
      $lookup: {
        from: BundleOrder.collection.name,
        localField: 'orderId',
        foreignField: '_id',
        as: 'order',
      },
    },
    { $unwind: '$order' },
    {
      $match: {
        'order.storefrontTenantId': new Types.ObjectId(input.storefrontTenantId),
      },
    },
    { $sort: { _id: -1 } },
    { $limit: input.limit + 1 },
    {
      $project: {
        _id: 1,
        eventId: 1,
        orderId: 1,
        storefrontTenantId: '$order.storefrontTenantId',
        tenantId: 1,
        audience: 1,
        eventType: 1,
        status: 1,
        attempts: 1,
        lastError: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ]);
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  return {
    data: page.map(deadLetterDto),
    pageInfo: {
      hasMore,
      nextCursor: hasMore ? page[page.length - 1]._id.toString() : null,
    },
  };
};

const loadRedriveReplay = async (input: {
  eventId: string;
  storefrontTenantId: string;
  operationId: string;
}): Promise<BundleOutboxDeadLetterDto | null> => {
  const recovery = await BundleOutboxRecovery.findOne({
    outboxEventId: input.eventId,
    storefrontTenantId: input.storefrontTenantId,
    operationId: input.operationId,
  }).lean();
  if (!recovery) return null;
  const event = await BundleOutboxEvent.findOne({
    _id: recovery.outboxEventId,
    orderId: recovery.orderId,
  }).lean();
  if (!event) {
    throw new BundleOutboxRecoveryError(409, 'The redriven delivery item is no longer available');
  }
  return deadLetterDto({
    ...event,
    storefrontTenantId: recovery.storefrontTenantId,
  } as unknown as DeadLetterAggregateRow);
};

/**
 * Reset one dead letter to the normal retry queue.
 *
 * Storefront ownership is resolved through the immutable parent order rather
 * than `BundleOutboxEvent.tenantId`, because supplier notifications are sent to
 * a recipient tenant while still belonging to the storefront's readiness gate.
 */
export const redriveBundleOutboxDeadLetter = async (input: {
  eventId: string;
  storefrontTenantId: string;
  operationId: string;
  reason: string;
  actorId: Types.ObjectId;
}): Promise<{ event: BundleOutboxDeadLetterDto; replayed: boolean }> => {
  const prior = await loadRedriveReplay(input);
  if (prior) return { event: prior, replayed: true };

  try {
    return await runBundleTransaction(async (session) => {
      const event = await BundleOutboxEvent.findById(input.eventId).session(session);
      if (!event?.orderId) {
        throw new BundleOutboxRecoveryError(404, 'Dead-letter delivery item not found');
      }
      const order = await BundleOrder.findOne({
        _id: event.orderId,
        storefrontTenantId: input.storefrontTenantId,
      })
        .select('_id storefrontTenantId')
        .session(session)
        .lean();
      if (!order) {
        // Deliberately return the same result for an absent event and an event
        // owned by a different storefront tenant.
        throw new BundleOutboxRecoveryError(404, 'Dead-letter delivery item not found');
      }

      const replay = await BundleOutboxRecovery.findOne({
        outboxEventId: event._id,
        storefrontTenantId: order.storefrontTenantId,
        operationId: input.operationId,
      }).session(session).lean();
      if (replay) {
        return {
          event: deadLetterDto({
            ...event.toObject(),
            storefrontTenantId: order.storefrontTenantId,
          } as DeadLetterAggregateRow),
          replayed: true,
        };
      }
      if (event.status !== 'dead_letter') {
        throw new BundleOutboxRecoveryError(
          409,
          'Only a dead-letter delivery item can be redriven'
        );
      }

      const attemptsBefore = event.attempts;
      const errorBefore = event.lastError || 'No provider error was recorded';
      const changed = await BundleOutboxEvent.findOneAndUpdate(
        { _id: event._id, status: 'dead_letter' },
        {
          $set: {
            status: 'retry',
            attempts: 0,
            nextAttemptAt: new Date(),
            manualRecoveryRequired: true,
          },
          $unset: { leaseUntil: 1, lastError: 1 },
        },
        { new: true, session, runValidators: true }
      );
      if (!changed) {
        throw new BundleOutboxRecoveryError(
          409,
          'Delivery item changed while it was being redriven; refresh and try again'
        );
      }

      await BundleOutboxRecovery.create([{
        outboxEventId: event._id,
        eventKey: event.eventId,
        orderId: order._id,
        storefrontTenantId: order.storefrontTenantId,
        recipientTenantId: event.tenantId,
        operationId: input.operationId,
        actorId: input.actorId,
        reason: input.reason,
        attemptsBefore,
        errorBefore,
      }], { session });
      await appendBundleEvent({
        aggregateType: 'order',
        aggregateId: order._id,
        storefrontTenantId: order.storefrontTenantId,
        actorType: 'user',
        actorId: input.actorId,
        command: 'redrive_bundle_outbox_dead_letter',
        fromState: 'dead_letter',
        toState: 'retry',
        reason: input.reason,
        correlationId: input.operationId,
        metadata: {
          outboxEventId: event._id.toString(),
          eventKey: event.eventId,
          audience: event.audience,
          eventType: event.eventType,
          recipientTenantId: event.tenantId.toString(),
          attemptsBefore,
        },
      }, session);

      return {
        event: deadLetterDto({
          ...changed.toObject(),
          storefrontTenantId: order.storefrontTenantId,
        } as DeadLetterAggregateRow),
        replayed: false,
      };
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const replay = await loadRedriveReplay(input);
      if (replay) return { event: replay, replayed: true };
    }
    throw error;
  }
};

export const bundleOrderGuestLink = (
  tenant: Parameters<typeof getEmailBrand>[0],
  orderId: string,
  reference: string
): string => {
  const brand = getEmailBrand(tenant);
  const accessToken = generateBundleAccessToken(orderId, reference);
  return `${brandedLink(brand, `/bundle-orders/${orderId}`)}#accessToken=${encodeURIComponent(accessToken)}`;
};

const renderShell = (
  tenant: Parameters<typeof getEmailBrand>[0],
  title: string,
  body: string,
  action?: { label: string; url: string }
): string => {
  const brand = getEmailBrand(tenant);
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b">
    <div style="max-width:620px;margin:0 auto;padding:32px 16px">
      <div style="background:${escapeEmailHtml(brand.color)};border-radius:18px 18px 0 0;padding:22px 28px;color:#fff;font-size:18px;font-weight:700">${escapeEmailHtml(brand.name)}</div>
      <div style="background:#fff;border:1px solid #e4e4e7;border-top:0;border-radius:0 0 18px 18px;padding:30px 28px">
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 14px">${escapeEmailHtml(title)}</h1>
        ${body}
        ${action ? `<p style="margin:26px 0 0"><a href="${escapeEmailHtml(action.url)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:700">${escapeEmailHtml(action.label)}</a></p>` : ''}
      </div>
    </div></body></html>`;
};

const processEvent = async (eventId: string): Promise<'delivered' | 'suppressed'> => {
  const event = await BundleOutboxEvent.findById(eventId);
  if (!event) throw new Error('Outbox event no longer exists');
  const [tenant, order] = await Promise.all([
    Tenant.findById(event.tenantId).lean(),
    event.orderId ? BundleOrder.findById(event.orderId) : null,
  ]);
  if (!tenant) throw new Error('Outbox tenant no longer exists');
  if (!order) throw new Error('Outbox order no longer exists');
  // Delivery follows the immutable environment captured on the order, not the
  // recipient tenant's current mode. Supplier events target another tenant and
  // launch modes may change while an event waits in the outbox.
  if (order.checkoutMode !== 'live') return 'suppressed';
  if (!env.mailgunApiKey || !env.mailgunDomain) {
    throw new Error('Transactional email provider is not configured');
  }

  let recipient = '';
  let subject = '';
  let html = '';
  if (event.audience === 'customer') {
    recipient = order.guestDetails.email;
    const url = bundleOrderGuestLink(tenant, order._id.toString(), order.reference);
    const completed = event.eventType === 'bundle.order_completed';
    const refunded = event.eventType === 'bundle.order_refunded';
    const cancelled = event.eventType === 'bundle.order_cancelled';
    subject = completed
      ? `Your bundle is complete — ${order.reference}`
      : refunded
        ? `Refund update — ${order.reference}`
        : cancelled
          ? `Bundle cancelled — ${order.reference}`
          : `Your bundle is confirmed — ${order.reference}`;
    const itinerary = order.components.map((component) =>
      `<li style="margin:8px 0"><strong>${escapeEmailHtml(component.attractionTitle)}</strong><br>${escapeEmailHtml(component.date)}${component.time ? ` · ${escapeEmailHtml(component.time)}` : ''}</li>`
    ).join('');
    html = renderShell(
      tenant,
      completed
        ? 'Your itinerary is complete'
        : refunded
          ? 'Your refund was recorded'
          : cancelled
            ? 'Your bundle was cancelled'
            : 'Your bundle is confirmed',
      `<p style="color:#52525b;line-height:1.6">Reference <strong>${escapeEmailHtml(order.reference)}</strong></p><ul style="padding-left:20px;line-height:1.5">${itinerary}</ul>`,
      { label: 'View bundle order', url }
    );
  } else if (event.audience === 'supplier') {
    recipient = tenant.contactInfo?.email || '';
    const components = order.components.filter(
      (component) => component.supplierTenantId.toString() === event.tenantId.toString()
    );
    const cancellationRequested = event.eventType === 'bundle.cancellation_requested';
    subject = cancellationRequested
      ? `Bundle cancellation review — ${order.reference}`
      : `Bundle component confirmed — ${order.reference}`;
    html = renderShell(
      tenant,
      cancellationRequested
        ? 'A bundle cancellation needs review'
        : 'A bundle component is ready to fulfil',
      `<p style="color:#52525b;line-height:1.6">Reference <strong>${escapeEmailHtml(order.reference)}</strong></p><ul style="padding-left:20px">${components.map((component) => `<li style="margin:8px 0">${escapeEmailHtml(component.attractionTitle)} · ${escapeEmailHtml(component.date)}${component.time ? ` · ${escapeEmailHtml(component.time)}` : ''} · ${escapeEmailHtml(String(component.quantities.adults + component.quantities.children + component.quantities.infants))} guest(s)</li>`).join('')}</ul>`
    );
  } else {
    recipient = tenant.contactInfo?.email || '';
    const cancellationRequested = event.eventType === 'bundle.cancellation_requested';
    subject = event.eventType === 'bundle.order_reserved'
      ? `Bundle reserved — ${order.reference}`
      : cancellationRequested
        ? `Bundle cancellation review — ${order.reference}`
        : `Bundle confirmed — ${order.reference}`;
    html = renderShell(
      tenant,
      event.eventType === 'bundle.order_reserved'
        ? 'A bundle is awaiting payment'
        : cancellationRequested
          ? 'A paid bundle cancellation needs review'
          : 'A bundle payment was confirmed',
      `<p style="color:#52525b;line-height:1.6">Reference <strong>${escapeEmailHtml(order.reference)}</strong><br>Status: ${escapeEmailHtml(order.status)}<br>Components: ${order.components.length}</p>`
    );
  }
  if (!recipient) throw new Error('Outbox recipient is not configured');
  await sendEmail({ to: recipient, subject, html, tenant });
  return 'delivered';
};

export const processBundleOutboxBatch = async (limit = 20): Promise<{
  delivered: number;
  suppressed: number;
  retried: number;
  deadLetter: number;
}> => {
  const result = { delivered: 0, suppressed: 0, retried: 0, deadLetter: 0 };
  for (let index = 0; index < limit; index += 1) {
    const now = new Date();
    const event = await BundleOutboxEvent.findOneAndUpdate(
      {
        status: { $in: ['pending', 'retry', 'processing'] },
        nextAttemptAt: { $lte: now },
        $or: [
          { status: { $in: ['pending', 'retry'] } },
          { status: 'processing', leaseUntil: { $lte: now } },
        ],
      },
      {
        $set: { status: 'processing', leaseUntil: new Date(Date.now() + 60_000) },
        $inc: { attempts: 1 },
      },
      { sort: { nextAttemptAt: 1, _id: 1 }, new: true }
    );
    if (!event) break;
    try {
      const outcome = await processEvent(event._id.toString());
      await BundleOutboxEvent.updateOne(
        { _id: event._id, status: 'processing' },
        outcome === 'suppressed'
          ? {
              $set: {
                status: 'suppressed',
                suppressedAt: new Date(),
                suppressionReason: 'TEST_MODE_NO_EXTERNAL_DELIVERY',
                manualRecoveryRequired: false,
              },
              $unset: { leaseUntil: 1, lastError: 1 },
            }
          : {
              $set: {
                status: 'delivered',
                deliveredAt: new Date(),
                manualRecoveryRequired: false,
              },
              $unset: { leaseUntil: 1, lastError: 1 },
            }
      );
      result[outcome] += 1;
    } catch (error) {
      const dead = event.attempts >= MAX_ATTEMPTS;
      await BundleOutboxEvent.updateOne(
        { _id: event._id },
        {
          $set: {
            status: dead ? 'dead_letter' : 'retry',
            nextAttemptAt: new Date(Date.now() + Math.min(60 * 60 * 1000, 30_000 * 2 ** event.attempts)),
            lastError: (error instanceof Error ? error.message : 'Outbox delivery failed').slice(0, 1000),
            ...(dead ? { manualRecoveryRequired: true } : {}),
          },
          $unset: { leaseUntil: 1 },
        }
      );
      if (dead) result.deadLetter += 1;
      else result.retried += 1;
    }
  }
  return result;
};
