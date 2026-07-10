import crypto from 'crypto';
import http from 'http';
import https from 'https';
import mongoose from 'mongoose';
import { WebhookEndpoint } from '../models/WebhookEndpoint';
import { WebhookDelivery } from '../models/WebhookDelivery';
import { WebhookEvent } from '../models/WebhookEvent';
import { IWebhookDelivery, WebhookEventType } from '../types';
import { validateWebhookDestination } from '../utils/webhookDestination';

// Delivery tuning. Attempt 0 is immediate; subsequent attempts back off.
export const MAX_DELIVERY_ATTEMPTS = 5;
// Backoff before attempt N (index = attempt number, 0-based).
const BACKOFF_MS = [0, 1_000, 5_000, 30_000, 120_000];
// Auto-disable an endpoint after this many consecutive failed deliveries.
const AUTO_DISABLE_THRESHOLD = 15;
const REQUEST_TIMEOUT_MS = 10_000;

type FetchLike = typeof fetch;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The signed event envelope sent in the request body. Stable shape so receivers
 * can rely on it and so the signature covers everything.
 */
export interface WebhookEnvelope {
  id: string;
  type: WebhookEventType;
  tenantId: string;
  createdAt: string;
  data: Record<string, unknown>;
}

export const buildEnvelope = (
  eventId: string,
  type: WebhookEventType,
  tenantId: string,
  data: Record<string, unknown>,
  createdAt: Date = new Date()
): WebhookEnvelope => ({
  id: eventId,
  type,
  tenantId,
  createdAt: createdAt.toISOString(),
  data,
});

/**
 * HMAC-SHA256 over `${timestampSec}.${body}` using the endpoint secret.
 * Timestamping defends against replay (receivers reject stale timestamps).
 */
export const signWebhookBody = (
  secret: string,
  timestampSec: number,
  body: string
): string => {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestampSec}.${body}`)
    .digest('hex');
};

/**
 * Build the `X-Foxes-Signature` header value: `t=<unix>,v1=<hex>`.
 * (Stripe-style scheme so verification is familiar to integrators.)
 */
export const buildSignatureHeader = (
  secret: string,
  body: string,
  nowMs: number = Date.now()
): string => {
  const t = Math.floor(nowMs / 1000);
  const v1 = signWebhookBody(secret, t, body);
  return `t=${t},v1=${v1}`;
};

/** Constant-time verification helper (exported for tests / inbound use). */
export const verifySignatureHeader = (
  secret: string,
  body: string,
  header: string,
  toleranceSec = 300,
  nowMs: number = Date.now()
): boolean => {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k?.trim(), v?.trim()];
    })
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - t) > toleranceSec) return false;
  const expected = signWebhookBody(secret, t, body);
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

interface SingleAttemptResult {
  ok: boolean;
  status?: number;
  error?: string;
}

const postToValidatedDestination = async (
  value: string,
  body: string,
  headers: Record<string, string>
): Promise<SingleAttemptResult> => {
  let destination;
  try {
    destination = await validateWebhookDestination(value);
  } catch {
    return { ok: false, error: 'Webhook destination is not allowed' };
  }

  return new Promise((resolve) => {
    const transport = destination.url.protocol === 'https:' ? https : http;
    const request = transport.request(
      destination.url,
      {
        method: 'POST',
        headers,
        lookup: (_hostname, _options, callback) => {
          callback(null, destination.address, destination.family);
        },
      },
      (response) => {
        const status = response.statusCode;
        // Redirects are intentionally not followed. Following a receiver-supplied
        // Location could move the signed payload to an unvalidated destination.
        response.resume();
        response.on('end', () => resolve({
          ok: status !== undefined && status >= 200 && status < 300,
          status,
        }));
      }
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('timeout'));
    });
    request.on('error', () => resolve({ ok: false, error: 'Webhook request failed' }));
    request.end(body);
  });
};

/** One HTTP POST attempt to the endpoint with a signed, timestamped body. */
export const sendWebhookRequest = async (
  url: string,
  secret: string,
  body: string,
  meta: { eventId: string; eventType: string },
  fetchImpl: FetchLike = fetch,
  nowMs: number = Date.now()
): Promise<SingleAttemptResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body).toString(),
    'User-Agent': 'Foxes-Webhooks/1.0',
    'X-Foxes-Event': meta.eventType,
    'X-Foxes-Delivery': meta.eventId,
    'X-Foxes-Signature': buildSignatureHeader(secret, body, nowMs),
  };
  try {
    if (fetchImpl === fetch) {
      return await postToValidatedDestination(url, body, headers);
    }

    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
      redirect: 'manual',
    });
    return {
      ok: res.ok,
      status: res.status,
    };
  } catch (err) {
    return { ok: false, error: 'Webhook request failed' };
  } finally {
    clearTimeout(timer);
  }
};

export interface DeliveryDeps {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  backoffMs?: number[];
  now?: () => number;
}

// Minimal persistence surface so this is unit-testable with plain fakes
// (decoupled from the full Mongoose Document type on purpose).
interface DeliveryDoc {
  _id?: unknown;
  eventId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  tenantId: unknown;
  attempts: number;
  status: IWebhookDelivery['status'];
  lastAttemptAt?: Date;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
  deliveredAt?: Date;
  nextRetryAt?: Date;
  save: () => Promise<unknown>;
}

interface EndpointDoc {
  url: string;
  secret: string;
  consecutiveFailures: number;
  enabled: boolean;
  disabledAt?: Date;
  lastDeliveryAt?: Date;
  save: () => Promise<unknown>;
}

/**
 * Attempt delivery with retries + exponential backoff. Updates the delivery log
 * after every attempt, and on terminal failure increments the endpoint's
 * consecutive-failure counter (auto-disabling past the threshold). Returns true
 * once delivered.
 */
export const runDeliveryWithRetry = async (
  delivery: DeliveryDoc,
  endpoint: EndpointDoc,
  deps: DeliveryDeps = {}
): Promise<boolean> => {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const maxAttempts = deps.maxAttempts ?? MAX_DELIVERY_ATTEMPTS;
  const backoff = deps.backoffMs ?? BACKOFF_MS;
  const now = deps.now ?? Date.now;

  const body = JSON.stringify(
    buildEnvelope(
      delivery.eventId,
      delivery.eventType,
      String(delivery.tenantId),
      delivery.payload
    )
  );

  let lastResult: SingleAttemptResult = { ok: false, error: 'not attempted' };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const wait = backoff[Math.min(attempt, backoff.length - 1)] ?? 0;
    if (attempt > 0 && wait > 0) {
      await sleep(wait);
    }

    lastResult = await sendWebhookRequest(
      endpoint.url,
      endpoint.secret,
      body,
      { eventId: delivery.eventId, eventType: delivery.eventType },
      fetchImpl,
      now()
    );

    delivery.attempts = attempt + 1;
    delivery.lastAttemptAt = new Date(now());
    delivery.responseStatus = lastResult.status;
    delivery.responseBody = undefined;
    delivery.error = lastResult.error;

    if (lastResult.ok) {
      delivery.status = 'success';
      delivery.deliveredAt = new Date(now());
      delivery.nextRetryAt = undefined;
      await delivery.save();
      // Reset the endpoint's failure streak on any success.
      if (endpoint.consecutiveFailures > 0) {
        endpoint.consecutiveFailures = 0;
        await endpoint.save();
      } else {
        endpoint.lastDeliveryAt = new Date(now());
        await endpoint.save();
      }
      return true;
    }

    const willRetry = attempt + 1 < maxAttempts;
    delivery.status = willRetry ? 'pending' : 'failed';
    delivery.nextRetryAt = willRetry
      ? new Date(now() + (backoff[Math.min(attempt + 1, backoff.length - 1)] ?? 0))
      : undefined;
    await delivery.save();
  }

  // Terminal failure: bump the endpoint failure streak, auto-disable if needed.
  endpoint.consecutiveFailures = (endpoint.consecutiveFailures || 0) + 1;
  if (endpoint.consecutiveFailures >= AUTO_DISABLE_THRESHOLD) {
    endpoint.enabled = false;
    endpoint.disabledAt = new Date(now());
  }
  await endpoint.save();
  return false;
};

/**
 * Emit an event to all enabled, subscribed endpoints of a SINGLE tenant.
 *
 * Tenant isolation: endpoints are selected strictly by `tenantId`, and every
 * delivery row is stamped with that same `tenantId`. There is no code path that
 * fans an event out across tenants.
 *
 * Returns the generated Foxes event id (or null when there are no subscribers).
 * Delivery runs in the background — callers should NOT await per-endpoint HTTP.
 */
export const emitEvent = async (
  tenantId: string | mongoose.Types.ObjectId,
  type: WebhookEventType,
  payload: Record<string, unknown>,
  deps: DeliveryDeps & { runner?: typeof runDeliveryWithRetry } = {}
): Promise<string | null> => {
  const endpoints = await WebhookEndpoint.find({
    tenantId,
    enabled: true,
    events: { $in: [type, '*'] },
  });

  if (!endpoints.length) return null;

  const eventId = `evt_${crypto.randomBytes(16).toString('hex')}`;
  const runner = deps.runner ?? runDeliveryWithRetry;

  for (const endpoint of endpoints) {
    const delivery = await WebhookDelivery.create({
      tenantId,
      endpointId: endpoint._id,
      eventId,
      eventType: type,
      payload,
      status: 'pending',
      attempts: 0,
    });

    // Fire-and-forget background delivery. Failures are logged, never thrown.
    void runner(
      delivery as unknown as DeliveryDoc,
      endpoint as unknown as EndpointDoc,
      deps
    ).catch((err) => {
      console.error(`[webhook] delivery ${delivery._id} failed:`, err);
    });
  }

  return eventId;
};

/**
 * Safe wrapper for use inside request handlers. Skips when there is no live DB
 * connection (e.g. unit tests with mocked models) and never throws into the
 * caller — emitting a webhook must never break a booking/payment flow.
 */
export const safeEmitEvent = (
  tenantId: string | mongoose.Types.ObjectId | undefined | null,
  type: WebhookEventType,
  payload: Record<string, unknown>
): void => {
  if (!tenantId) return;
  if (mongoose.connection.readyState !== 1) return;
  emitEvent(tenantId, type, payload).catch((err) => {
    console.error(`[webhook] emitEvent(${type}) failed:`, err);
  });
};

/**
 * Record an inbound provider event for idempotency.
 *
 * Relies on the unique (provider, eventId) index: a duplicate insert throws
 * E11000, which we translate to `{ duplicate: true }`. Callers should skip
 * processing when `duplicate` is true.
 */
export const recordInboundEvent = async (
  provider: string,
  eventId: string,
  options: { eventType?: string; tenantId?: string | mongoose.Types.ObjectId } = {}
): Promise<{ duplicate: boolean }> => {
  try {
    await WebhookEvent.create({
      provider,
      eventId,
      eventType: options.eventType,
      tenantId: options.tenantId,
      receivedAt: new Date(),
    });
    return { duplicate: false };
  } catch (err) {
    if (err instanceof Error && (err as { code?: number }).code === 11000) {
      return { duplicate: true };
    }
    throw err;
  }
};
