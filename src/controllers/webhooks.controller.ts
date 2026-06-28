import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { WebhookEndpoint } from '../models/WebhookEndpoint';
import { WebhookDelivery } from '../models/WebhookDelivery';
import { Tenant } from '../models/Tenant';
import { AuthRequest, WebhookEventType } from '../types';
import { sendSuccess, sendError } from '../utils/response';
import crypto from 'crypto';
import { generateWebhookSecret } from '../utils/hash';
import { runDeliveryWithRetry } from '../services/webhook.service';

const VALID_EVENTS: WebhookEventType[] = [
  'booking.created',
  'booking.confirmed',
  'booking.cancelled',
  'payment.succeeded',
  'ticket.issued',
  'ping',
  '*',
];

const isHttpUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const resolveTargetTenantId = (
  req: AuthRequest,
  explicit?: string
): { tenantId?: string; error?: string } => {
  const isSuper = req.user?.role === 'super-admin';
  const candidate = explicit || req.tenant?._id?.toString();

  if (isSuper) {
    if (!candidate) return { error: 'tenantId is required' };
    if (!Types.ObjectId.isValid(candidate)) return { error: 'Invalid tenantId' };
    return { tenantId: candidate };
  }

  const assigned = (req.user?.assignedTenants || []).map((t) => t.toString());
  const target = candidate || (assigned.length === 1 ? assigned[0] : undefined);
  if (!target) return { error: 'tenantId is required' };
  if (!Types.ObjectId.isValid(target)) return { error: 'Invalid tenantId' };
  if (!assigned.includes(target)) return { error: 'Access denied to this tenant' };
  return { tenantId: target };
};

const readableTenantScope = (req: AuthRequest): string[] | undefined => {
  if (req.user?.role === 'super-admin') {
    return req.tenant ? [req.tenant._id.toString()] : undefined;
  }
  if (req.tenant) return [req.tenant._id.toString()];
  return (req.user?.assignedTenants || []).map((t) => t.toString());
};

const validateEvents = (events: unknown): { events?: WebhookEventType[]; error?: string } => {
  if (events === undefined) return { events: ['*'] };
  if (!Array.isArray(events) || events.length === 0) {
    return { error: 'events must be a non-empty array' };
  }
  const invalid = events.filter((e) => !VALID_EVENTS.includes(e as WebhookEventType));
  if (invalid.length) return { error: `Invalid event type(s): ${invalid.join(', ')}` };
  return { events: events as WebhookEventType[] };
};

export const createWebhookEndpoint = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { url, description, events, tenantId: bodyTenantId } = req.body as {
      url?: string;
      description?: string;
      events?: WebhookEventType[];
      tenantId?: string;
    };

    if (!url || !isHttpUrl(url)) {
      sendError(res, 'A valid http(s) url is required', 400);
      return;
    }

    const { events: parsedEvents, error: eventsError } = validateEvents(events);
    if (eventsError) {
      sendError(res, eventsError, 400);
      return;
    }

    const { tenantId, error } = resolveTargetTenantId(req, bodyTenantId);
    if (error || !tenantId) {
      sendError(res, error || 'tenantId is required', error === 'Access denied to this tenant' ? 403 : 400);
      return;
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      sendError(res, 'Tenant not found', 404);
      return;
    }

    const secret = generateWebhookSecret();
    const endpoint = await WebhookEndpoint.create({
      tenantId,
      url,
      secret,
      description,
      events: parsedEvents,
      createdBy: req.user?._id,
    });

    sendSuccess(
      res,
      {
        id: endpoint._id,
        tenantId: endpoint.tenantId,
        url: endpoint.url,
        description: endpoint.description,
        events: endpoint.events,
        enabled: endpoint.enabled,
        // Returned exactly once — the receiver stores it to verify signatures.
        secret,
        createdAt: endpoint.createdAt,
      },
      'Webhook endpoint created. Store the signing secret securely — it will not be shown again.',
      201
    );
  } catch (error) {
    next(error);
  }
};

export const listWebhookEndpoints = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const scope = readableTenantScope(req);
    const query: Record<string, unknown> = {};
    if (scope) {
      if (scope.length === 0) {
        sendSuccess(res, []);
        return;
      }
      query.tenantId = { $in: scope };
    }

    const endpoints = await WebhookEndpoint.find(query).sort({ createdAt: -1 }).lean();
    const sanitized = endpoints.map((e) => {
      const { secret, __v, ...rest } = e as Record<string, unknown>;
      return rest;
    });
    sendSuccess(res, sanitized);
  } catch (error) {
    next(error);
  }
};

// Load an endpoint and enforce tenant ownership. Returns null (and 404s) when
// the endpoint doesn't exist OR belongs to another tenant — never confirms
// cross-tenant ids.
const loadOwnedEndpoint = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    sendError(res, 'Invalid endpoint id', 400);
    return null;
  }
  const endpoint = await WebhookEndpoint.findById(id);
  if (!endpoint) {
    sendError(res, 'Webhook endpoint not found', 404);
    return null;
  }
  const scope = readableTenantScope(req);
  if (scope && !scope.includes(endpoint.tenantId.toString())) {
    sendError(res, 'Webhook endpoint not found', 404);
    return null;
  }
  return endpoint;
};

export const getWebhookEndpoint = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const endpoint = await loadOwnedEndpoint(req, res);
    if (!endpoint) return;
    sendSuccess(res, endpoint);
  } catch (error) {
    next(error);
  }
};

export const updateWebhookEndpoint = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const endpoint = await loadOwnedEndpoint(req, res);
    if (!endpoint) return;

    const { url, description, events, enabled } = req.body as {
      url?: string;
      description?: string;
      events?: WebhookEventType[];
      enabled?: boolean;
    };

    if (url !== undefined) {
      if (!isHttpUrl(url)) {
        sendError(res, 'A valid http(s) url is required', 400);
        return;
      }
      endpoint.url = url;
    }
    if (description !== undefined) endpoint.description = description;
    if (events !== undefined) {
      const { events: parsedEvents, error } = validateEvents(events);
      if (error) {
        sendError(res, error, 400);
        return;
      }
      endpoint.events = parsedEvents as WebhookEventType[];
    }
    if (enabled !== undefined) {
      endpoint.enabled = enabled;
      if (enabled) {
        // Re-enabling clears the failure streak + disabled marker.
        endpoint.consecutiveFailures = 0;
        endpoint.disabledAt = undefined;
      }
    }

    await endpoint.save();
    sendSuccess(res, endpoint, 'Webhook endpoint updated');
  } catch (error) {
    next(error);
  }
};

export const deleteWebhookEndpoint = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const endpoint = await loadOwnedEndpoint(req, res);
    if (!endpoint) return;
    await endpoint.deleteOne();
    sendSuccess(res, { id: endpoint._id, deleted: true }, 'Webhook endpoint deleted');
  } catch (error) {
    next(error);
  }
};

export const listWebhookDeliveries = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const endpoint = await loadOwnedEndpoint(req, res);
    if (!endpoint) return;

    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    const deliveries = await WebhookDelivery.find({
      endpointId: endpoint._id,
      tenantId: endpoint.tenantId,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    sendSuccess(res, deliveries);
  } catch (error) {
    next(error);
  }
};

// Send a test `ping` event to THIS endpoint (regardless of its subscriptions)
// to verify the integration end-to-end, including signature verification.
export const pingWebhookEndpoint = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const endpoint = await loadOwnedEndpoint(req, res);
    if (!endpoint) return;

    const eventId = `evt_${crypto.randomBytes(16).toString('hex')}`;
    const delivery = await WebhookDelivery.create({
      tenantId: endpoint.tenantId,
      endpointId: endpoint._id,
      eventId,
      eventType: 'ping',
      payload: {
        message: 'This is a test webhook from Attractions Network',
        endpointId: endpoint._id.toString(),
        triggeredBy: req.user?._id?.toString(),
        timestamp: new Date().toISOString(),
      },
      status: 'pending',
      attempts: 0,
    });

    // Background delivery; respond immediately with the delivery id to poll.
    void runDeliveryWithRetry(
      delivery as never,
      endpoint as never
    ).catch((err) => console.error('[webhook] ping delivery failed:', err));

    sendSuccess(res, { eventId, deliveryId: delivery._id }, 'Ping dispatched');
  } catch (error) {
    next(error);
  }
};
