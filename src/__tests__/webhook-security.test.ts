import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { isPublicIp, validateWebhookDestination } from '../utils/webhookDestination';
import { runDeliveryWithRetry, sendWebhookRequest } from '../services/webhook.service';
import {
  listWebhookDeliveries,
  listWebhookEndpoints,
} from '../controllers/webhooks.controller';
import { WebhookEndpoint } from '../models/WebhookEndpoint';
import { WebhookDelivery } from '../models/WebhookDelivery';

jest.mock('../models/WebhookEndpoint', () => ({
  WebhookEndpoint: { find: jest.fn(), findById: jest.fn() },
}));
jest.mock('../models/WebhookDelivery', () => ({
  WebhookDelivery: { create: jest.fn(), find: jest.fn() },
}));
jest.mock('../models/WebhookEvent', () => ({ WebhookEvent: { create: jest.fn() } }));

describe('webhook destination security', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '100.100.100.200',
    '::1',
    'fd00:ec2::254',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ])('rejects non-public address %s', (address) => {
    expect(isPublicIp(address)).toBe(false);
  });

  it.each([
    'file:///etc/passwd',
    'http://localhost/hook',
    'http://service.localhost/hook',
    'http://127.0.0.1/hook',
    'http://[::1]/hook',
    'https://user:password@example.com/hook',
  ])('rejects unsafe destination %s', async (url) => {
    await expect(validateWebhookDestination(url)).rejects.toThrow();
  });

  it('rejects a hostname if any DNS answer is private', async () => {
    const lookup = jest.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.8', family: 4 },
    ]);

    await expect(validateWebhookDestination('https://hooks.example.test', lookup as never))
      .rejects.toThrow(/not allowed/i);
  });

  it('returns a public address that can be pinned for the connection', async () => {
    const lookup = jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const result = await validateWebhookDestination('https://hooks.example.test/path', lookup as never);

    expect(result.address).toBe('93.184.216.34');
    expect(result.family).toBe(4);
  });
});

describe('webhook tenant ownership and redaction', () => {
  const response = () => {
    const res = {} as express.Response;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  it('ignores a cross-tenant resolved header for a non-super admin', async () => {
    const assignedTenant = new Types.ObjectId();
    const spoofedTenant = new Types.ObjectId();
    const lean = jest.fn().mockResolvedValue([]);
    (WebhookEndpoint.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean }),
    });
    const req = {
      user: { role: 'manager', assignedTenants: [assignedTenant] },
      tenant: { _id: spoofedTenant },
    } as unknown as express.Request;

    await listWebhookEndpoints(req as never, response(), jest.fn());

    expect(WebhookEndpoint.find).toHaveBeenCalledWith({
      tenantId: { $in: [assignedTenant.toHexString()] },
    });
  });

  it('removes stored receiver response bodies from delivery API results', async () => {
    const tenantId = new Types.ObjectId();
    const endpointId = new Types.ObjectId();
    (WebhookEndpoint.findById as jest.Mock).mockResolvedValue({ _id: endpointId, tenantId });
    const lean = jest.fn().mockResolvedValue([
      { eventId: 'evt_1', responseStatus: 500, responseBody: 'internal response' },
    ]);
    (WebhookDelivery.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({ lean }),
      }),
    });
    const req = {
      params: { id: endpointId.toHexString() },
      query: {},
      user: { role: 'manager', assignedTenants: [tenantId] },
    };
    const res = response();

    await listWebhookDeliveries(req as never, res, jest.fn());

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.data[0]).toEqual({ eventId: 'evt_1', responseStatus: 500 });
  });
});

describe('webhook response handling', () => {
  it('does not follow redirects or read receiver response bodies', async () => {
    const text = jest.fn().mockResolvedValue('internal admin response');
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 302, text });

    const result = await sendWebhookRequest(
      'https://hooks.example.test/path',
      'whsec_test',
      '{}',
      { eventId: 'evt_1', eventType: 'ping' },
      fetchImpl as never
    );

    expect(result).toEqual({ ok: false, status: 302 });
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('manual');
    expect(text).not.toHaveBeenCalled();
  });

  it('clears responseBody from delivery persistence', async () => {
    const delivery = {
      _id: new Types.ObjectId(),
      eventId: 'evt_1',
      eventType: 'ping' as const,
      payload: {},
      tenantId: new Types.ObjectId(),
      attempts: 0,
      status: 'pending' as const,
      responseBody: 'old internal response',
      save: jest.fn().mockResolvedValue(undefined),
    };
    const endpoint = {
      url: 'https://hooks.example.test',
      secret: 'whsec_test',
      consecutiveFailures: 0,
      enabled: true,
      save: jest.fn().mockResolvedValue(undefined),
    };

    await runDeliveryWithRetry(delivery as never, endpoint as never, {
      fetchImpl: jest.fn().mockResolvedValue({ ok: true, status: 204 }) as never,
      maxAttempts: 1,
    });

    expect(delivery.responseBody).toBeUndefined();
  });
});

describe('webhook route roles', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('allows managers and rejects editors', async () => {
    jest.doMock('../middleware/auth.middleware', () => {
      const actual = jest.requireActual('../middleware/auth.middleware');
      return {
        ...actual,
        authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
          (req as unknown as { user: unknown }).user = {
            role: req.header('x-test-role'),
            assignedTenants: [],
          };
          next();
        },
      };
    });
    jest.doMock('../middleware/tenant.middleware', () => ({
      optionalTenant: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
    }));
    jest.doMock('../controllers/webhooks.controller', () => ({
      createWebhookEndpoint: (_req: express.Request, res: express.Response) => res.json({ ok: true }),
      listWebhookEndpoints: (_req: express.Request, res: express.Response) => res.json({ ok: true }),
      getWebhookEndpoint: (_req: express.Request, res: express.Response) => res.json({ ok: true }),
      updateWebhookEndpoint: (_req: express.Request, res: express.Response) => res.json({ ok: true }),
      deleteWebhookEndpoint: (_req: express.Request, res: express.Response) => res.json({ ok: true }),
      listWebhookDeliveries: (_req: express.Request, res: express.Response) => res.json({ ok: true }),
      pingWebhookEndpoint: (_req: express.Request, res: express.Response) => res.json({ ok: true }),
    }));

    const router = require('../routes/webhooks.routes').default;
    const app = express().use('/webhooks', router);

    await request(app).get('/webhooks').set('x-test-role', 'manager').expect(200);
    await request(app).get('/webhooks').set('x-test-role', 'editor').expect(403);
  });
});
