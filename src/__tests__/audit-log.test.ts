/**
 * User log: changes made by admin accounts are recorded after the response, with who, what and
 * from where, and never with the request body.
 */
import { EventEmitter } from 'events';
import mongoose, { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog';
import { auditTrail } from '../middleware/audit.middleware';
import { auditPath, auditResource, auditResourceId } from '../services/auditLog.service';
import { AuthRequest } from '../types';

jest.mock('../models/AuditLog', () => ({ AuditLog: { create: jest.fn().mockResolvedValue({}) } }));

const connected = (state: number) => {
  Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, get: () => state });
};

const admin = { _id: new Types.ObjectId(), email: 'Ops@Brand.test', firstName: 'Ops', lastName: 'Lead', role: 'manager' };

const exchange = (method: string, url: string, user?: Record<string, unknown>) => {
  const req = { method, originalUrl: url, url, headers: { 'user-agent': 'jest' }, ip: '203.0.113.9', body: { password: 'secret' }, user } as unknown as AuthRequest;
  const res = Object.assign(new EventEmitter(), { statusCode: 200 });
  return { req, res };
};

describe('audit trail', () => {
  beforeEach(() => { jest.clearAllMocks(); connected(1); });

  it('records an admin change with actor, record and outcome but no body', () => {
    const id = String(new Types.ObjectId());
    const { req, res } = exchange('PATCH', `/api/attractions/${id}?x=1`, admin);
    const next = jest.fn();
    auditTrail(req, res as never, next);
    expect(next).toHaveBeenCalled();
    res.emit('finish');
    const entry = (AuditLog.create as jest.Mock).mock.calls[0][0];
    expect(entry).toMatchObject({
      action: 'record.update', outcome: 'success', actorEmail: 'ops@brand.test', actorName: 'Ops Lead', actorRole: 'manager',
      method: 'PATCH', path: `/api/attractions/${id}`, resource: 'attractions', resourceId: id, ip: '203.0.113.9',
    });
    expect(JSON.stringify(entry)).not.toContain('secret');
  });

  it('records a refused change as a failure', () => {
    const { req, res } = exchange('DELETE', '/api/users/abc', { ...admin });
    auditTrail(req, res as never, jest.fn());
    res.statusCode = 403;
    res.emit('finish');
    expect((AuditLog.create as jest.Mock).mock.calls[0][0]).toMatchObject({ action: 'record.delete', outcome: 'failure', statusCode: 403 });
  });

  it('ignores reads, customers, anonymous requests and housekeeping', () => {
    for (const [method, url, user] of [
      ['GET', '/api/bookings', admin],
      ['POST', '/api/bookings', { ...admin, role: 'customer' }],
      ['POST', '/api/contact', undefined],
      ['PATCH', '/api/notifications/read-all', admin],
    ] as const) {
      const { req, res } = exchange(method, url, user as never);
      auditTrail(req, res as never, jest.fn());
      res.emit('finish');
    }
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it('writes nothing without a database connection', () => {
    connected(0);
    const { req, res } = exchange('POST', '/api/promo', admin);
    auditTrail(req, res as never, jest.fn());
    res.emit('finish');
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it('masks long tokens and names the area and record', () => {
    const token = 'a'.repeat(48);
    expect(auditPath(`/api/payments/link/${token}?q=1`)).toBe('/api/payments/link/:token');
    expect(auditResource('/api/bundle-orders/admin/x')).toBe('bundle-orders');
    expect(auditResourceId('/api/users/507f1f77bcf86cd799439011/password')).toBe('507f1f77bcf86cd799439011');
  });
});
