import { env } from '../config/env';
import { generateBundleAccessToken } from '../bundles/guestAccess';
import { BundleOrder } from '../models/BundleOrder';
import { BundleOutboxEvent } from '../models/BundleOutboxEvent';
import { Tenant } from '../models/Tenant';
import {
  brandedLink,
  escapeEmailHtml,
  getEmailBrand,
  sendEmail,
} from './email.service';

const MAX_ATTEMPTS = 8;

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
              },
              $unset: { leaseUntil: 1, lastError: 1 },
            }
          : {
              $set: { status: 'delivered', deliveredAt: new Date() },
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
