import express from 'express';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { ChildProcess, spawn, spawnSync } from 'child_process';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { Attraction } from '../models/Attraction';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { BundleEvent } from '../models/BundleEvent';
import { BundleOrder } from '../models/BundleOrder';
import { BundleOutboxEvent } from '../models/BundleOutboxEvent';
import { BundleOutboxRecovery } from '../models/BundleOutboxRecovery';
import { permanentlyDeleteAttraction } from '../controllers/attractions.controller';
import {
  BundleOutboxRecoveryError,
  redriveBundleOutboxDeadLetter,
} from '../services/bundleOutbox.service';
import { loadBundleOutboxHealth } from '../services/bundleLaunchReadiness.service';
import { AuthRequest } from '../types';

jest.setTimeout(60_000);

const systemMongod = (() => {
  const homebrew = '/opt/homebrew/bin/mongod';
  if (fs.existsSync(homebrew)) return homebrew;
  const located = spawnSync('which', ['mongod'], { encoding: 'utf8' });
  return located.status === 0 ? located.stdout.trim() : '';
})();

const describeWithMongo = systemMongod ? describe : describe.skip;

const reservePort = async (): Promise<number> => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      reject(new Error('Could not reserve a MongoDB test port'));
      return;
    }
    const port = address.port;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});

const waitForPort = async (port: number): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Temporary MongoDB did not start');
};

const waitForPrimary = async (uri: string): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const connection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 500 });
    try {
      await connection.asPromise();
      const hello = await connection.db!.admin().command({ hello: 1 });
      await connection.close();
      if (hello.isWritablePrimary) return;
    } catch {
      await connection.close().catch(() => undefined);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Temporary MongoDB replica set did not elect a primary');
};

describeWithMongo('Bundle integrity database integration', () => {
  let mongoProcess: ChildProcess | undefined;
  let dbPath = '';
  let mongoUri = '';

  beforeAll(async () => {
    const port = await reservePort();
    dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-integrity-mongo-'));
    mongoProcess = spawn(systemMongod, [
      '--dbpath', dbPath,
      '--bind_ip', '127.0.0.1',
      '--port', String(port),
      '--replSet', 'bundleIntegrityRs',
      '--quiet',
    ], { stdio: 'ignore' });
    await waitForPort(port);

    const directUri = `mongodb://127.0.0.1:${port}/admin?directConnection=true`;
    const bootstrap = await mongoose.createConnection(directUri).asPromise();
    await bootstrap.db!.admin().command({
      replSetInitiate: {
        _id: 'bundleIntegrityRs',
        members: [{ _id: 0, host: `127.0.0.1:${port}` }],
      },
    });
    await bootstrap.close();
    mongoUri = `mongodb://127.0.0.1:${port}/bundle_integrity?replicaSet=bundleIntegrityRs`;
    await waitForPrimary(mongoUri);
    await mongoose.connect(mongoUri);

    await BundleOutboxRecovery.collection.createIndex(
      { outboxEventId: 1, operationId: 1 },
      { unique: true }
    );
    await BundleEvent.collection.createIndex(
      { aggregateId: 1, sequence: 1 },
      { unique: true }
    );
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoProcess && mongoProcess.exitCode === null) {
      mongoProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 3_000);
        mongoProcess!.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    if (dbPath) fs.rmSync(dbPath, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });

  it('proves the Booking middleware hides children generically but permits the explicit integrity scope', async () => {
    const attractionId = new Types.ObjectId();
    const bundleOrderId = new Types.ObjectId();
    await Booking.collection.insertOne({
      _id: new Types.ObjectId(),
      reference: 'DB-BUNDLE-CHILD-1',
      tenantId: new Types.ObjectId(),
      attractionId,
      bundleOrderId,
      bundleComponentId: 'component-1',
    });

    await expect(Booking.exists({ attractionId })).resolves.toBeNull();
    await expect(Booking.exists({
      attractionId,
      bundleOrderId: { $exists: true },
    })).resolves.toEqual(expect.objectContaining({ _id: expect.any(Types.ObjectId) }));
  });

  it('enforces the immutable recovery unique index in MongoDB', async () => {
    const outboxEventId = new Types.ObjectId();
    const operationId = 'outbox-redrive:database-index-0001';
    const base = {
      outboxEventId,
      eventKey: 'database-event',
      orderId: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      recipientTenantId: new Types.ObjectId(),
      operationId,
      actorId: new Types.ObjectId(),
      reason: 'Database uniqueness proof',
      attemptsBefore: 8,
      errorBefore: 'Provider error',
      createdAt: new Date(),
    };
    await BundleOutboxRecovery.collection.insertOne({ _id: new Types.ObjectId(), ...base });

    await expect(BundleOutboxRecovery.collection.insertOne({
      _id: new Types.ObjectId(),
      ...base,
    })).rejects.toMatchObject({ code: 11000 });
  });

  it('redrives once transactionally and replays the same operation id without duplicate audit', async () => {
    const storefrontTenantId = new Types.ObjectId();
    const recipientTenantId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const eventId = new Types.ObjectId();
    const actorId = new Types.ObjectId();
    const operationId = 'outbox-redrive:database-transaction-0001';
    await BundleOrder.collection.insertOne({ _id: orderId, storefrontTenantId });
    await BundleOutboxEvent.collection.insertOne({
      _id: eventId,
      eventId: 'database-redrive-event',
      orderId,
      tenantId: recipientTenantId,
      audience: 'supplier',
      eventType: 'bundle.component_confirmed',
      payload: {},
      status: 'dead_letter',
      attempts: 8,
      nextAttemptAt: new Date(),
      lastError: 'Provider unavailable',
      manualRecoveryRequired: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const first = await redriveBundleOutboxDeadLetter({
      eventId: eventId.toString(),
      storefrontTenantId: storefrontTenantId.toString(),
      operationId,
      reason: 'Provider configuration repaired',
      actorId,
    });
    const replay = await redriveBundleOutboxDeadLetter({
      eventId: eventId.toString(),
      storefrontTenantId: storefrontTenantId.toString(),
      operationId,
      reason: 'Provider configuration repaired',
      actorId,
    });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    await expect(BundleOutboxRecovery.countDocuments({ outboxEventId: eventId }))
      .resolves.toBe(1);
    await expect(BundleEvent.countDocuments({
      aggregateId: orderId,
      command: 'redrive_bundle_outbox_dead_letter',
    })).resolves.toBe(1);
    await expect(BundleOutboxEvent.findById(eventId).lean()).resolves.toEqual(
      expect.objectContaining({
        status: 'retry',
        attempts: 0,
        manualRecoveryRequired: true,
      })
    );
  });

  it('returns the same not-found result across storefront tenants without mutating the event', async () => {
    const owningTenantId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const eventId = new Types.ObjectId();
    await BundleOrder.collection.insertOne({ _id: orderId, storefrontTenantId: owningTenantId });
    await BundleOutboxEvent.collection.insertOne({
      _id: eventId,
      eventId: 'database-cross-tenant-event',
      orderId,
      tenantId: new Types.ObjectId(),
      audience: 'storefront',
      eventType: 'bundle.order_reserved',
      payload: {},
      status: 'dead_letter',
      attempts: 8,
      nextAttemptAt: new Date(),
      manualRecoveryRequired: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(redriveBundleOutboxDeadLetter({
      eventId: eventId.toString(),
      storefrontTenantId: new Types.ObjectId().toString(),
      operationId: 'outbox-redrive:cross-tenant-0001',
      reason: 'Must not cross tenant boundary',
      actorId: new Types.ObjectId(),
    })).rejects.toEqual(expect.objectContaining<Partial<BundleOutboxRecoveryError>>({
      statusCode: 404,
      message: 'Dead-letter delivery item not found',
    }));
    await expect(BundleOutboxEvent.findById(eventId).lean()).resolves.toEqual(
      expect.objectContaining({ status: 'dead_letter', attempts: 8 })
    );
  });

  it('keeps readiness fail-closed while a manually redriven event is still retrying', async () => {
    const storefrontTenantId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    await BundleOrder.collection.insertOne({ _id: orderId, storefrontTenantId });
    await BundleOutboxEvent.collection.insertMany([
      {
        _id: new Types.ObjectId(),
        eventId: 'database-manual-recovery-event',
        orderId,
        tenantId: new Types.ObjectId(),
        audience: 'supplier',
        eventType: 'bundle.component_confirmed',
        payload: {},
        status: 'retry',
        attempts: 1,
        nextAttemptAt: new Date(),
        manualRecoveryRequired: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: new Types.ObjectId(),
        eventId: 'database-normal-pending-event',
        orderId,
        tenantId: storefrontTenantId,
        audience: 'storefront',
        eventType: 'bundle.order_reserved',
        payload: {},
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
        manualRecoveryRequired: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await expect(loadBundleOutboxHealth(storefrontTenantId)).resolves.toEqual({
      outboxDeadLetterCount: 1,
      outboxPendingCount: 1,
    });
  });

  it('preserves Bundle-linked capacity through the real controller and transaction', async () => {
    const attractionId = new Types.ObjectId();
    const availabilityId = new Types.ObjectId();
    await Attraction.collection.insertOne({
      _id: attractionId,
      status: 'archived',
      trashedAt: new Date(),
    });
    await Availability.collection.insertOne({
      _id: availabilityId,
      attractionId,
      date: new Date('2026-09-01T00:00:00.000Z'),
      timeSlots: [],
      isBlocked: false,
    });
    await BundleOrder.collection.insertOne({
      _id: new Types.ObjectId(),
      storefrontTenantId: new Types.ObjectId(),
      status: 'reserved',
      components: [{ attractionId }],
    });

    const app = express();
    app.delete('/attractions/:id/permanent', (req, res, next) => {
      (req as AuthRequest).user = {
        _id: new Types.ObjectId(),
        role: 'super-admin',
        assignedTenants: [],
      } as unknown as AuthRequest['user'];
      void permanentlyDeleteAttraction(req as AuthRequest, res, next);
    });
    const response = await request(app).delete(`/attractions/${attractionId}/permanent`);

    expect(response.status).toBe(409);
    await expect(Attraction.findById(attractionId).lean()).resolves.not.toBeNull();
    await expect(Availability.findById(availabilityId).lean()).resolves.not.toBeNull();
  });

  it('deletes an unused trashed attraction and its availability in one real transaction', async () => {
    const attractionId = new Types.ObjectId();
    const availabilityId = new Types.ObjectId();
    await Attraction.collection.insertOne({
      _id: attractionId,
      status: 'archived',
      trashedAt: new Date(),
    });
    await Availability.collection.insertOne({
      _id: availabilityId,
      attractionId,
      date: new Date('2026-09-02T00:00:00.000Z'),
      timeSlots: [],
      isBlocked: false,
    });

    const app = express();
    app.delete('/attractions/:id/permanent', (req, res, next) => {
      (req as AuthRequest).user = {
        _id: new Types.ObjectId(),
        role: 'super-admin',
        assignedTenants: [],
      } as unknown as AuthRequest['user'];
      void permanentlyDeleteAttraction(req as AuthRequest, res, next);
    });
    const response = await request(app).delete(`/attractions/${attractionId}/permanent`);

    expect(response.status).toBe(200);
    await expect(Attraction.findById(attractionId).lean()).resolves.toBeNull();
    await expect(Availability.findById(availabilityId).lean()).resolves.toBeNull();
  });
});
