/**
 * User log CSV report, streaming edges: a complete report ends and is logged as such; a reader that
 * goes away mid-stream stops the read (no wait for a drain that never comes) and is logged as not
 * completed; a report over the limit is refused before anything is sent.
 */
import { EventEmitter } from 'events';
import mongoose, { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog';
import { exportAuditLogs } from '../controllers/auditLogs.controller';
import { AuthRequest } from '../types';

jest.mock('../models/AuditLog', () => ({ AuditLog: { create: jest.fn().mockResolvedValue({}), countDocuments: jest.fn(), find: jest.fn() } }));
jest.mock('../models/User', () => ({ User: { find: jest.fn() } }));

Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, get: () => 1 });

const superAdmin = { _id: new Types.ObjectId(), email: 'owner@qa.invalid', firstName: 'Platform', lastName: 'Owner', role: 'super-admin', assignedTenants: [] };
const row = (index: number) => ({
  _id: new Types.ObjectId(), action: 'record.update', outcome: 'success', actorEmail: 'ops@qa.invalid', actorName: 'Ops Lead',
  actorRole: 'manager', subject: 'tour', verb: 'update', resourceLabel: `Tour ${index}`, summary: `Changed tour: Tour ${index}`,
  changes: [], changedFields: [], createdAt: new Date('2026-10-09T07:00:00.000Z'),
});

const findReturning = (rows: unknown[]) => {
  const chain = { sort: () => chain, limit: () => chain, populate: () => chain, lean: () => chain, cursor: () => (async function* rowsOf() { yield* rows; })() };
  (AuditLog.find as jest.Mock).mockReturnValue(chain);
};

const response = (writeResult: (written: number) => boolean) => {
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200, headersSent: false, destroyed: false, chunks: [] as string[],
    status(code: number) { this.statusCode = code; return this; },
    setHeader() { this.headersSent = true; },
    json: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    write(chunk: string) { this.chunks.push(chunk); return writeResult(this.chunks.length); },
  });
  return res;
};

const exportAs = async (res: ReturnType<typeof response>) => {
  const next = jest.fn();
  await exportAuditLogs({ query: {}, user: superAdmin, headers: {}, method: 'GET', originalUrl: '/api/audit-logs/export', url: '/api/audit-logs/export', ip: '203.0.113.9' } as unknown as AuthRequest, res as never, next);
  await new Promise((resolve) => setImmediate(resolve));
  expect(next).not.toHaveBeenCalled();
};

describe('user log CSV report streaming', () => {
  beforeEach(() => { jest.clearAllMocks(); delete process.env.AUDIT_EXPORT_MAX; });

  it('ends a complete report and logs it as done', async () => {
    (AuditLog.countDocuments as jest.Mock).mockResolvedValue(3);
    findReturning([row(1), row(2), row(3)]);
    const res = response(() => true);
    await exportAs(res);
    expect(res.chunks).toHaveLength(4);
    expect(res.chunks[0].startsWith('﻿"Time (Cairo)"')).toBe(true);
    expect(res.end).toHaveBeenCalled();
    expect((AuditLog.create as jest.Mock).mock.calls[0][0]).toMatchObject({ action: 'record.export', outcome: 'success', statusCode: 200, changes: [{ field: 'entryCount', after: 3 }] });
  });

  it('stops reading when the reader goes away and logs the report as not completed', async () => {
    (AuditLog.countDocuments as jest.Mock).mockResolvedValue(3);
    findReturning([row(1), row(2), row(3)]);
    const res = response((written) => written < 2);
    res.write = function write(this: typeof res, chunk: string) {
      this.chunks.push(chunk);
      if (this.chunks.length < 2) return true;
      setImmediate(() => { this.destroyed = true; this.emit('close'); });
      return false;
    };
    await exportAs(res);
    expect(res.chunks).toHaveLength(2);
    expect(res.end).not.toHaveBeenCalled();
    expect((AuditLog.create as jest.Mock).mock.calls[0][0]).toMatchObject({ action: 'record.export', outcome: 'failure', statusCode: 499 });
  });

  it('refuses a report over the limit before sending anything', async () => {
    process.env.AUDIT_EXPORT_MAX = '2';
    (AuditLog.countDocuments as jest.Mock).mockResolvedValue(3);
    const res = response(() => true);
    await exportAs(res);
    expect(res.statusCode).toBe(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'EXPORT_TOO_LARGE', count: 3, limit: 2 }));
    expect(res.chunks).toHaveLength(0);
    expect(AuditLog.find).not.toHaveBeenCalled();
    expect((AuditLog.create as jest.Mock).mock.calls[0][0]).toMatchObject({ outcome: 'failure', statusCode: 400 });
  });

  it('falls back to the default limit for a missing or unusable setting', async () => {
    const { auditExportMax } = jest.requireActual('../controllers/auditLogs.controller') as typeof import('../controllers/auditLogs.controller');
    for (const value of [undefined, '0', '-5', 'many', '60000']) {
      if (value === undefined) delete process.env.AUDIT_EXPORT_MAX; else process.env.AUDIT_EXPORT_MAX = value;
      expect(auditExportMax()).toBe(5000);
    }
    process.env.AUDIT_EXPORT_MAX = '1200';
    expect(auditExportMax()).toBe(1200);
  });
});
